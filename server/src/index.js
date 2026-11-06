import express from 'express';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, isProd } from './config.js';
import { pool } from './db.js';
import { redis } from './redis.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { syncFxLibrary, FX_DIR } from './fxLibrary.js';
import { initSocket } from './socket.js';
import { startJobs } from './jobs.js';
import { uploadRoot, privateRoot, privateUploadAuth, cloudinaryEnabled } from './lib/upload.js';
import { getSettings } from './lib/settings.js';
import { verifyToken } from './lib/auth.js';
import { livekitHealthy } from './lib/livekit.js';
import { livekitWebhook } from './routes/livekit-webhook.js';
import { razorpayWebhookValid, creditOrder } from './services/recharge.js';
import { one } from './db.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import liveRoutes from './routes/live.js';
import callRoutes from './routes/calls.js';
import walletRoutes from './routes/wallet.js';
import storeRoutes from './routes/store.js';
import socialRoutes from './routes/social.js';
import discoverRoutes from './routes/discover.js';
import hostRoutes from './routes/host.js';
import safetyRoutes from './routes/safety.js';
import agencyRoutes from './routes/agency.js';
import sellerRoutes from './routes/seller.js';
import adminRoutes from './routes/admin.js';
import adminContentRoutes from './routes/admin-content.js';
import adminModRoutes from './routes/admin-mod.js';
import adminFinanceRoutes from './routes/admin-finance.js';
import bondRoutes from './routes/bonds.js';
import kycRoutes from './routes/kyc.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const corsOrigin = config.corsOrigins === '*' ? true : config.corsOrigins.split(',').map((s) => s.trim());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(compression());

// Razorpay webhook needs the raw body for signature check (must be before express.json)
app.post('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!razorpayWebhookValid(req.body, req.headers['x-razorpay-signature'])) return res.status(400).json({ error: 'bad signature' });
  const ev = JSON.parse(req.body.toString('utf8'));
  const pay = ev?.payload?.payment?.entity;
  if ((ev.event === 'payment.captured' || ev.event === 'order.paid') && pay?.order_id) {
    const o = await one('SELECT id FROM recharge_orders WHERE gateway_order_id=$1', [pay.order_id]);
    if (o) await creditOrder(o.id, { paymentId: pay.id, raw: ev });
  }
  res.json({ ok: true });
});

// LiveKit SFU lifecycle webhook reconciles stale publish grants (raw body for signature)
app.post('/api/livekit/webhook', express.raw({ type: '*/*', limit: '1mb' }), livekitWebhook);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const privateStaticOpts = {
  index: false, dotfiles: 'deny', fallthrough: false, maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
  },
};
app.use('/uploads-private/kyc', privateUploadAuth('kyc'), express.static(path.join(privateRoot, 'kyc'), privateStaticOpts));
app.use('/uploads-private/reports', privateUploadAuth('reports'), express.static(path.join(privateRoot, 'reports'), privateStaticOpts));
// Never leak the admin-only private subtree through the public static mount.
app.use('/uploads', (req, res, next) => (req.path === '/private' || req.path.startsWith('/private/')) ? res.status(404).end() : next(),
  express.static(uploadRoot, { maxAge: '30d', immutable: true, fallthrough: false, index: false, dotfiles: 'deny' }));
// premium animation library (SVGA gifts, entry effects, 3D icons) — loaded on demand, cached a year
app.use('/fx', express.static(FX_DIR, { maxAge: '365d', immutable: true }));
app.use('/static', express.static(path.resolve('public'), { maxAge: '30d' }));

app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    app: config.appName,
    message: 'LiveApp Backend Server is running successfully 🚀',
    health: '/api/health',
    time: new Date().toISOString(),
  });
});

app.get('/api/health', async (_req, res) => {
  const db = await pool.query('SELECT 1').then(() => true).catch(() => false);
  const rd = (await redis.ping().catch(() => '')) === 'PONG';
  const webhookDelivered = !!(await redis.get('lk:webhook:delivered').catch(() => null));
  res.status(db && rd ? 200 : 503).json({
    ok: db && rd, db, redis: rd, livekit: await livekitHealthy(),
    livekit_webhook: { configured: !!config.livekit.webhookUrl, delivered: webhookDelivered },
    // Media persistence is observable on purpose: on hosts without a
    // persistent disk the local backend loses uploads on restart/redeploy.
    storage: { backend: cloudinaryEnabled() ? 'cloudinary' : 'local', persistent: cloudinaryEnabled() },
  });
});

// Maintenance mode: blocks app users (admin/agency/seller panels keep working)
app.use('/api', async (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/agency') || req.path.startsWith('/seller') || req.path === '/config') return next();
  const s = await getSettings();
  if (!s.app.maintenance) return next();
  const p = verifyToken((req.headers.authorization || '').replace('Bearer ', ''));
  if (p?.k === 'admin') return next();
  res.status(503).json({ error: s.app.maintenance_message, code: 'maintenance' });
});

// "last seen today" for DAU
app.use('/api', (req, _res, next) => {
  const p = verifyToken((req.headers.authorization || '').replace('Bearer ', ''));
  if (p?.k === 'user') {
    const key = `act:${p.id}:${new Date().toISOString().slice(0, 10)}`;
    redis.set(key, '1', 'EX', 90000, 'NX').then((fresh) => {
      if (fresh) pool.query('INSERT INTO user_active_days(user_id, day) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING', [p.id]).catch(() => {});
    }).catch(() => {});
  }
  next();
});

app.use('/api/auth', authRoutes);
for (const r of [discoverRoutes, userRoutes, liveRoutes, callRoutes, walletRoutes, storeRoutes, socialRoutes, hostRoutes,
  safetyRoutes, agencyRoutes, sellerRoutes, bondRoutes, kycRoutes, adminRoutes, adminContentRoutes, adminModRoutes, adminFinanceRoutes]) app.use('/api', r);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// errors -> JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(`[${req.method} ${req.path}]`, err);
  res.status(status).json({ error: status >= 500 && isProd ? 'Something went wrong' : err.message, code: err.code });
});

const server = http.createServer(app);
initSocket(server, corsOrigin);

async function main() {
  await migrate();
  await seed();
  await syncFxLibrary();
  await startJobs();
  server.listen(config.port, () => console.log(`[api] ${config.appName} listening on :${config.port}`));
}

main().catch((e) => {
  console.error('Failed to start', e);
  process.exit(1);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

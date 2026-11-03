import { Router } from 'express';
import { one, q } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { int, str, notFound } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { config } from '../config.js';
import { ranking, eventBoard } from '../services/rankings.js';
import { razorpayEnabled } from '../services/recharge.js';
import { onlineCount } from '../services/roomstate.js';

const r = Router();
const auth = userAuth();

// Public app config (no login): feature flags, maintenance, version gate, login options.
r.get('/config', async (_req, res) => {
  const s = await getSettings();
  res.json({
    app: { ...s.app, name: s.app.name || config.appName },
    features: s.features,
    room: { multi_seats: s.room.multi_seats, party_seats: s.room.party_seats, thumbnail_interval_sec: s.room.thumbnail_interval_sec, chat_slow_ms: s.room.chat_slow_ms },
    pk: s.pk,
    economy: { currency: s.economy.currency, match_filter_coins: s.economy.match_filter_coins, call_min_rate: s.economy.call_min_rate, cp_coins: s.economy.cp_coins, fan_club_coins: s.economy.fan_club_coins },
    red_packet: s.red_packet,
    livekit_url: config.livekit.url,
    google_client_id: config.googleClientId || null,
    razorpay: razorpayEnabled(),
    otp_dev: config.otpProvider === 'console' && config.nodeEnv !== 'production',
  });
});

r.get('/home', auth, async (req, res) => {
  const banners = await q(
    `SELECT id, title, image_url, color, link FROM banners WHERE active AND position='home'
     AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
     AND (countries IS NULL OR cardinality(countries)=0 OR $1 = ANY(countries)) ORDER BY sort, id DESC`, [req.user.country]);
  const events = await q(`SELECT id, title, type, banner_url, starts_at, ends_at FROM events WHERE active AND ends_at > now() AND starts_at <= now() + interval '7 days' ORDER BY starts_at LIMIT 10`);
  res.json({ banners, events, online: await onlineCount() });
});

r.get('/rankings', auth, async (req, res) => {
  const type = ['rich', 'charm', 'family', 'pk'].includes(req.query.type) ? req.query.type : 'rich';
  const period = ['daily', 'weekly', 'monthly', 'all'].includes(req.query.period) ? req.query.period : 'daily';
  res.json(await ranking(type, period, str(req.query.country, 3) || null, Math.min(int(req.query.limit, 50), 100)));
});

r.get('/events', auth, async (_req, res) => {
  res.json(await q(`SELECT * FROM events WHERE active AND ends_at > now() - interval '7 days' ORDER BY starts_at DESC LIMIT 50`));
});

r.get('/events/:id', auth, async (req, res) => {
  const ev = await one('SELECT * FROM events WHERE id=$1', [int(req.params.id)]);
  if (!ev) throw notFound('Event not found');
  const gift = ev.gift_id ? await one('SELECT id, name, icon, price FROM gifts WHERE id=$1', [ev.gift_id]) : null;
  res.json({ ...ev, gift, board: await eventBoard(ev) });
});

r.get('/cms/:slug', async (req, res) => {
  const p = await one('SELECT * FROM cms_pages WHERE slug=$1', [str(req.params.slug, 40)]);
  if (!p) throw notFound('Page not found');
  res.json(p);
});

export default r;

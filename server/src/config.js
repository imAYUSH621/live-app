import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);

export const config = {
  appName: env('APP_NAME', 'LiveApp'),
  port: Number(env('PORT', 4000)),
  nodeEnv: env('NODE_ENV', 'development'),
  publicApiUrl: env('PUBLIC_API_URL', 'http://localhost:4000'),
  publicAppUrl: env('PUBLIC_APP_URL', 'http://localhost:5173'),
  corsOrigins: env('CORS_ORIGINS', '*'),
  databaseUrl: env('DATABASE_URL', 'postgres://liveapp:liveapp@localhost:5432/liveapp'),
  redisUrl: env('REDIS_URL', 'memory'),
  jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
  uploadDir: env('UPLOAD_DIR', './uploads'),
  maxUploadMb: Number(env('MAX_UPLOAD_MB', 25)),
  livekit: {
    url: env('LIVEKIT_URL', 'ws://localhost:7880'),            // what clients connect to (wss://live.yourdomain.com)
    apiUrl: env('LIVEKIT_API_URL', env('LIVEKIT_URL', 'http://localhost:7880').replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')),   // what the server calls internally
    apiKey: env('LIVEKIT_API_KEY', 'devkey'),
    apiSecret: env('LIVEKIT_API_SECRET', 'secret'),
  },
  turn: {
    urls: env('TURN_URLS', ''),                                 // e.g. turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp
    secret: env('TURN_SECRET', ''),                             // coturn static-auth-secret
  },
  googleClientId: env('GOOGLE_CLIENT_ID', ''),
  otpProvider: env('OTP_PROVIDER', 'console'),                 // console | 2factor
  twoFactorApiKey: env('TWOFACTOR_API_KEY', ''),
  razorpay: {
    keyId: env('RAZORPAY_KEY_ID', ''),
    keySecret: env('RAZORPAY_KEY_SECRET', ''),
    webhookSecret: env('RAZORPAY_WEBHOOK_SECRET', ''),
  },
  firebaseServiceAccount: env('FIREBASE_SERVICE_ACCOUNT_JSON', ''),
  sightengine: { user: env('SIGHTENGINE_USER', ''), secret: env('SIGHTENGINE_SECRET', '') },
  translateUrl: env('LIBRETRANSLATE_URL', ''),
  adminEmail: env('ADMIN_EMAIL', 'admin@example.com'),
  adminPassword: env('ADMIN_PASSWORD', 'Admin@12345'),
};

export const isProd = config.nodeEnv === 'production';

// Fail closed in production: weak development defaults must never serve real users.
if (isProd) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set explicitly in production');
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD must be set explicitly in production');
}

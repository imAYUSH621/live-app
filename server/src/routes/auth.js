import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { one, q } from '../db.js';
import { config } from '../config.js';
import { bad, need, str, clientIp, randomDigits } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { createUser, touchLogin, loginResponse, assertDeviceAllowed } from '../services/users.js';

const r = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
r.use(limiter);

const google = new OAuth2Client();

async function feature(name) {
  const s = await getSettings();
  need(s.features[name], 'This login method is disabled');
}

r.post('/register', async (req, res) => {
  await feature('email_login');
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Enter a valid email');
  need(password.length >= 6, 'Password must be at least 6 characters');
  const ip = clientIp(req);
  await assertDeviceAllowed(req.body.device_id, ip);
  if (await one('SELECT 1 FROM users WHERE email=$1', [email])) throw bad('Email already registered, please login');
  const u = await createUser(
    { email, name: str(req.body.name, 40), password_hash: await bcrypt.hash(password, 10), gender: req.body.gender, country: req.body.country },
    { referralCode: req.body.referral_code, deviceId: req.body.device_id, ip },
  );
  res.json(await loginResponse(u.id));
});

r.post('/login', async (req, res) => {
  await feature('email_login');
  const email = str(req.body.email, 120).toLowerCase();
  const u = await one('SELECT id, password_hash FROM users WHERE email=$1 AND status<>$2', [email, 'deleted']);
  if (!u || !u.password_hash || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) throw bad('Wrong email or password');
  await assertDeviceAllowed(req.body.device_id, clientIp(req));
  await touchLogin(u.id, { deviceId: req.body.device_id, ip: clientIp(req) });
  res.json(await loginResponse(u.id));
});

r.post('/google', async (req, res) => {
  await feature('google_login');
  need(config.googleClientId, 'Google login is not configured on the server (GOOGLE_CLIENT_ID)');
  const ticket = await google.verifyIdToken({ idToken: String(req.body.id_token || ''), audience: config.googleClientId.split(',') });
  const p = ticket.getPayload();
  need(p?.sub, 'Invalid Google token');
  const ip = clientIp(req);
  await assertDeviceAllowed(req.body.device_id, ip);
  let u = await one('SELECT id FROM users WHERE google_sub=$1', [p.sub]);
  if (!u && p.email) {
    u = await one('SELECT id FROM users WHERE email=$1', [p.email.toLowerCase()]);
    if (u) await q('UPDATE users SET google_sub=$2 WHERE id=$1', [u.id, p.sub]);
  }
  if (!u) {
    u = await createUser(
      { google_sub: p.sub, email: p.email?.toLowerCase(), name: (p.name || '').slice(0, 40), avatar_url: p.picture },
      { referralCode: req.body.referral_code, deviceId: req.body.device_id, ip },
    );
  } else {
    await touchLogin(u.id, { deviceId: req.body.device_id, ip });
  }
  res.json(await loginResponse(u.id));
});

// Phone OTP. OTP_PROVIDER=console prints the code in server logs (free, for testing).
// OTP_PROVIDER=2factor uses 2factor.in (cheap Indian SMS OTP).
r.post('/otp/send', async (req, res) => {
  await feature('phone_login');
  const phone = str(req.body.phone, 20).replace(/[^\d+]/g, '');
  need(phone.length >= 10, 'Enter a valid phone number');
  const code = randomDigits(6);
  await q(
    `INSERT INTO otp_codes(phone, code, expires_at, attempts) VALUES ($1,$2, now() + interval '5 minutes', 0)
     ON CONFLICT (phone) DO UPDATE SET code=$2, expires_at = now() + interval '5 minutes', attempts = 0`,
    [phone, code],
  );
  if (config.otpProvider === '2factor' && config.twoFactorApiKey) {
    const num = phone.replace(/^\+?91/, '');
    const resp = await fetch(`https://2factor.in/API/V1/${config.twoFactorApiKey}/SMS/${num}/${code}/OTP1`);
    need(resp.ok, 'Could not send OTP, try again');
  } else {
    console.log(`[OTP] ${phone} -> ${code}`);
  }
  res.json({ ok: true, dev_code: config.otpProvider === 'console' && config.nodeEnv !== 'production' ? code : undefined });
});

r.post('/otp/verify', async (req, res) => {
  await feature('phone_login');
  const phone = str(req.body.phone, 20).replace(/[^\d+]/g, '');
  const row = await one('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone=$1 RETURNING code, expires_at, attempts', [phone]);
  need(row && row.attempts <= 5 && new Date(row.expires_at) > new Date() && row.code === String(req.body.code || ''), 'Wrong or expired OTP');
  await q('DELETE FROM otp_codes WHERE phone=$1', [phone]);
  const ip = clientIp(req);
  await assertDeviceAllowed(req.body.device_id, ip);
  let u = await one('SELECT id FROM users WHERE phone=$1', [phone]);
  if (!u) u = await createUser({ phone }, { referralCode: req.body.referral_code, deviceId: req.body.device_id, ip });
  else await touchLogin(u.id, { deviceId: req.body.device_id, ip });
  res.json(await loginResponse(u.id));
});

// Guest login bound to a device id. Guest can later link email/Google.
r.post('/guest', async (req, res) => {
  await feature('guest_login');
  const deviceId = str(req.body.device_id, 100);
  need(deviceId.length >= 8, 'device_id required');
  const ip = clientIp(req);
  await assertDeviceAllowed(deviceId, ip);
  let u = await one(`SELECT id FROM users WHERE device_id=$1 AND email IS NULL AND phone IS NULL AND google_sub IS NULL AND status<>'deleted' ORDER BY id LIMIT 1`, [deviceId]);
  if (!u) u = await createUser({}, { referralCode: req.body.referral_code, deviceId, ip });
  else await touchLogin(u.id, { deviceId, ip });
  res.json(await loginResponse(u.id));
});

export default r;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { one, q } from '../db.js';
import { config } from '../config.js';
import { bad, need, str, clientIp, randomDigits } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { signToken } from '../lib/auth.js';
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
  const rawPhone = str(req.body.phone, 20).replace(/[^\d+]/g, '');
  const phone = rawPhone.replace(/^\+?91/, '').replace(/\D/g, '') || rawPhone;
  need(phone.length >= 8, 'Enter a valid phone number');
  // Demo-phone OTP shortcut: staging/demo convenience only, requires BOTH a
  // non-production NODE_ENV and the explicit ALLOW_DEMO_LOGIN=true opt-in.
  // Production always fails closed - every phone needs its real OTP.
  const demoPhonesEnabled = config.nodeEnv !== 'production' && process.env.ALLOW_DEMO_LOGIN === 'true';
  const isDemo = demoPhonesEnabled && (phone.startsWith('999999') || phone.includes('999999') || ['9999990001', '9999990002', '9999990003', '9999990004'].includes(phone));
  const code = isDemo ? '123456' : randomDigits(6);
  await q(
    `INSERT INTO otp_codes(phone, code, expires_at, attempts) VALUES ($1,$2, now() + interval '30 minutes', 0)
     ON CONFLICT (phone) DO UPDATE SET code=$2, expires_at = now() + interval '30 minutes', attempts = 0`,
    [phone, code],
  );
  if (rawPhone !== phone) {
    await q(
      `INSERT INTO otp_codes(phone, code, expires_at, attempts) VALUES ($1,$2, now() + interval '30 minutes', 0)
       ON CONFLICT (phone) DO UPDATE SET code=$2, expires_at = now() + interval '30 minutes', attempts = 0`,
      [rawPhone, code],
    );
  }
  if (config.otpProvider === '2factor' && config.twoFactorApiKey && !isDemo) {
    const num = phone.replace(/^\+?91/, '');
    const resp = await fetch(`https://2factor.in/API/V1/${config.twoFactorApiKey}/SMS/${num}/${code}/OTP1`);
    need(resp.ok, 'Could not send OTP, try again');
  } else {
    console.log(`[OTP] ${phone} -> ${code}`);
  }
  res.json({ ok: true, dev_code: isDemo ? '123456' : (config.otpProvider === 'console' && config.nodeEnv !== 'production' ? code : undefined) });
});

r.post('/otp/verify', async (req, res) => {
  await feature('phone_login');
  const rawPhone = str(req.body.phone, 20).replace(/[^\d+]/g, '');
  const phone = rawPhone.replace(/^\+?91/, '').replace(/\D/g, '') || rawPhone;
  const inputCode = String(req.body.code || '').trim();
  // Demo-phone OTP shortcut: staging/demo convenience only, requires BOTH a
  // non-production NODE_ENV and the explicit ALLOW_DEMO_LOGIN=true opt-in.
  // Production always fails closed - every phone needs its real OTP.
  const demoPhonesEnabled = config.nodeEnv !== 'production' && process.env.ALLOW_DEMO_LOGIN === 'true';
  const isDemo = demoPhonesEnabled && (phone.startsWith('999999') || phone.includes('999999') || ['9999990001', '9999990002', '9999990003', '9999990004'].includes(phone));

  const row = await one(
    `UPDATE otp_codes SET attempts = attempts + 1 
     WHERE phone=$1 OR phone=$2 
     RETURNING code, expires_at, attempts`,
    [phone, rawPhone]
  );

  const isMatch = (isDemo && inputCode === '123456') || (row && (row.code === inputCode || (isDemo && inputCode === '123456')));
  need(isMatch, 'Wrong or expired OTP');

  await q('DELETE FROM otp_codes WHERE phone=$1 OR phone=$2', [phone, rawPhone]);
  const ip = clientIp(req);
  await assertDeviceAllowed(req.body.device_id, ip);

  let u = await one('SELECT id FROM users WHERE phone=$1 OR phone=$2 OR phone=$3', [phone, rawPhone, '+91' + phone]);
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


// Instant 1-Click Demo Login for Executive Testing
r.post('/demo-login', async (req, res) => {
  if (config.nodeEnv === 'production' || process.env.ALLOW_DEMO_LOGIN !== 'true') throw bad('not_found', 'Unknown API route');
  const role = req.body.role || 'aria';
  let phone = '9999990002';
  let defaultName = 'Aria Star Host';
  let isHost = true;

  if (role === 'rohan') {
    phone = '9999990003';
    defaultName = 'Rohan Live Beats';
    isHost = true;
  } else if (role === 'fan' || role === 'vip') {
    phone = '9999990004';
    defaultName = 'VIP Diamond Fan';
    isHost = false;
  } else if (role === 'seller' || role === 'distributor') {
    phone = '9999990001';
    defaultName = 'Official Coin Distributor';
    isHost = false;
  }

  let u = await one('SELECT id FROM users WHERE phone=$1 OR phone=$2', [phone, '+91' + phone]);
  if (!u) {
    u = await createUser({ phone, name: defaultName, is_host: isHost }, { deviceId: 'demo-device-' + role, ip: clientIp(req) });
  } else {
    await touchLogin(u.id, { deviceId: 'demo-device-' + role, ip: clientIp(req) });
  }
  res.json(await loginResponse(u.id));
});


// Admin / Agency login under /api/auth/admin/login
r.post('/admin/login', async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');

  const a = await one('SELECT * FROM admin_users WHERE email=$1', [email]);
  if (a && a.password_hash) {
    const isPassOk = await bcrypt.compare(password, a.password_hash);
    if (isPassOk) {
      need(a.status === 'active', 'Account disabled');
      await q('UPDATE admin_users SET last_login=now() WHERE id=$1', [a.id]);
      await q(`INSERT INTO audit_logs(actor_type, actor_id, action, ip) VALUES ('admin',$1,'login',$2)`, [a.id, clientIp(req)]);
      return res.json({
        token: signToken('admin', a.id, {}, '12h'),
        admin: { id: a.id, name: a.name, email: a.email, role: 'super', actual_role: a.role, modules: ['*'] }
      });
    }
  }

  const agency = await one('SELECT * FROM agencies WHERE login_email=$1', [email]);
  if (agency && agency.password_hash) {
    const isPassOk = await bcrypt.compare(password, agency.password_hash);
    if (isPassOk) {
      need(agency.status === 'active', `Agency is ${agency.status}`);
      return res.json({
        token: signToken('agency', agency.id, {}, '7d'),
        admin: {
          id: agency.id,
          agency_id: agency.id,
          name: agency.name,
          email: agency.login_email,
          role: 'agency',
          modules: ['agency']
        }
      });
    }
  }

  throw bad('Wrong email or password');
});

export default r;


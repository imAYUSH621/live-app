import { miniProfile } from './profile.js';
import { one, tx, q } from '../db.js';
import { randomCode, randomDigits, forbidden } from '../lib/util.js';
import { changeCoins } from '../lib/wallet.js';
import { getSettings } from '../lib/settings.js';
import { withLevels, levelProgress } from '../lib/levels.js';
import { signToken } from '../lib/auth.js';
import { config } from '../config.js';

async function uniqueUid(c) {
  for (let i = 0; i < 20; i++) {
    const uid = Number('1' + randomDigits(7)); // 8 digits, starts with 1
    const exists = await c.one('SELECT 1 FROM users WHERE uid=$1 OR fancy_id=$2', [uid, String(uid)]);
    if (!exists) return uid;
  }
  throw new Error('Could not allocate uid');
}

export async function assertDeviceAllowed(deviceId, ip) {
  if (deviceId && (await one('SELECT 1 FROM banned_devices WHERE device_id=$1', [deviceId]))) throw forbidden('This device is banned');
  if (ip && (await one('SELECT 1 FROM banned_ips WHERE ip=$1', [ip]))) throw forbidden('Your network is banned');
}

/** Create a new app user (+ welcome coins). */
export async function createUser(fields, { referralCode, deviceId, ip } = {}) {
  const s = await getSettings();
  return tx(async (c) => {
    const uid = await uniqueUid(c);
    let referredBy = null;
    if (referralCode) {
      const ref = await c.one('SELECT id FROM users WHERE referral_code=$1', [String(referralCode).toUpperCase()]);
      referredBy = ref?.id || null;
    }
    const u = await c.one(
      `INSERT INTO users(uid, name, email, phone, google_sub, password_hash, avatar_url, gender, country, referral_code, referred_by, device_id, last_ip, last_login)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now()) RETURNING *`,
      [uid, fields.name || `User${String(uid).slice(-4)}`, fields.email || null, fields.phone || null, fields.google_sub || null,
       fields.password_hash || null, fields.avatar_url || null, fields.gender || 'other', fields.country || s.app.default_country,
       randomCode(7), referredBy, deviceId || null, ip || null],
    );
    if (s.economy.new_user_coins > 0) await changeCoins(c, u.id, s.economy.new_user_coins, 'welcome_bonus');
    return u;
  });
}

export async function touchLogin(userId, { deviceId, ip } = {}) {
  await q('UPDATE users SET last_login=now(), device_id=COALESCE($2, device_id), last_ip=COALESCE($3, last_ip) WHERE id=$1', [userId, deviceId || null, ip || null]);
}

/** Full "me" payload for the app. */
export async function meView(userId) {
  const u = await one(
    `SELECT u.*, f.name AS family_name, f.badge AS family_badge FROM users u
     LEFT JOIN families f ON f.id = u.family_id WHERE u.id=$1`, [userId]);
  if (!u) return null;
  withLevels(u);
  const host = await one(
    `SELECT h.*, a.name AS agency_name, a.code AS agency_code FROM hosts h
     LEFT JOIN agencies a ON a.id = h.agency_id WHERE h.user_id=$1`, [userId]);
  const seller = await one('SELECT balance, status FROM coin_sellers WHERE user_id=$1', [userId]);
  const counts = await one(
    `SELECT (SELECT count(*) FROM follows WHERE followee_id=$1)::int AS followers,
            (SELECT count(*) FROM follows WHERE follower_id=$1)::int AS following,
            (SELECT count(*) FROM follows a JOIN follows b ON a.follower_id=b.followee_id AND a.followee_id=b.follower_id WHERE a.follower_id=$1)::int AS friends,
            (SELECT count(*) FROM profile_visits WHERE user_id=$1)::int AS visitors`, [userId]);
  const items = await q(
    `SELECT ui.id, ui.item_id, ui.expires_at, ui.equipped, s.type, s.name, s.preview, s.anim_url
     FROM user_items ui JOIN store_items s ON s.id = ui.item_id
     WHERE ui.user_id=$1 AND (ui.expires_at IS NULL OR ui.expires_at > now()) ORDER BY ui.created_at DESC`, [userId]);
  delete u.password_hash;
  // Staging/demo convenience only: auto-approve outside production.
  // In production the flag is ignored and status comes from the database.
  const stagingAutoApprove = config.nodeEnv !== 'production' && process.env.ALLOW_KYC_BYPASS === 'true';
  const isHostApproved = stagingAutoApprove ? true : Boolean(u.is_host || host?.status === 'approved');
  return {
    ...u,
    is_host: isHostApproved,
    isHost: isHostApproved,
    verified: isHostApproved,
    hostStatus: isHostApproved ? 'approved' : (host?.status || 'none'),
    canLive: isHostApproved,
    uid_display: u.fancy_id || u.uid,
    level_progress: levelProgress(u.total_spent, 100),
    charm_progress: levelProgress(u.total_earned, 200),
    host: host ? { ...host, ...(stagingAutoApprove ? { status: 'approved' } : {}), payout_details: host.payout_details } : (stagingAutoApprove ? { user_id: u.id, level: 'A', status: 'approved' } : null),
    seller,
    counts,
    items,
    family: u.family_id ? { id: u.family_id, name: u.family_name, badge: u.family_badge } : null,
    cp: u.cp_user_id ? { user: await miniProfile(u.cp_user_id), since: u.cp_since } : null,
    cp_requests: (await one(`SELECT count(*)::int AS n FROM cp_requests WHERE to_id=$1 AND status='pending'`, [userId])).n,
  };
}

export async function loginResponse(userId) {
  return { token: signToken('user', userId), user: await meView(userId) };
}

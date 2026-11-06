import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q, tx } from '../db.js';
import { adminAuth } from '../lib/auth.js';
import { need, str, int, notFound, page, monthOf, bad } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { changeCoins, changeDiamonds } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';
import { creditOrder } from '../services/recharge.js';
import { runSettlement, approveSettlement, runAgencyCommissions } from '../services/settlement.js';
import { getSettings } from '../lib/settings.js';

const r = Router();

const csv = (rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(typeof v === 'object' ? JSON.stringify(v) : v)) ? `"${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"` : String(typeof v === 'object' ? JSON.stringify(v) : v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};
const sendCsv = (res, name, rows) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(csv(rows));
};

// ================= RECHARGE ORDERS =================
r.get('/admin/orders', adminAuth('finance'), async (req, res) => {
  const { limit, offset } = page(req, 50, 500);
  const rows = await q(
    `SELECT o.*, u.uid, u.name FROM recharge_orders o JOIN users u ON u.id=o.user_id
     WHERE ($1::text IS NULL OR o.status=$1) AND ($2::text IS NULL OR o.gateway=$2) AND ($3::bigint IS NULL OR u.uid=$3)
     ORDER BY o.id DESC LIMIT $4 OFFSET $5`,
    [req.query.status || null, req.query.gateway || null, req.query.uid ? int(req.query.uid) : null, limit, offset]);
  if (req.query.format === 'csv') return sendCsv(res, 'orders', rows);
  res.json(rows);
});

r.post('/admin/orders/:id/mark-paid', adminAuth('finance'), async (req, res) => {
  const o = await one('SELECT * FROM recharge_orders WHERE id=$1', [int(req.params.id)]);
  if (!o) throw notFound();
  need(o.status === 'created', 'Only unpaid orders can be marked paid');
  const done = await creditOrder(o.id, { paymentId: str(req.body.reference, 100) || `manual:${req.admin.email}` });
  await audit(req, 'order.mark_paid', 'order', o.id, { reference: req.body.reference });
  res.json({ ok: true, credited: done?.coins });
});

r.post('/admin/orders/:id/refund', adminAuth('finance'), async (req, res) => {
  const o = await one('SELECT * FROM recharge_orders WHERE id=$1', [int(req.params.id)]);
  need(o && o.status === 'paid', 'Only paid orders can be refunded');
  await tx(async (c) => {
    // Guard the transition inside the transaction: if a user refund request (or another
    // admin refund) moved the order out of 'paid' since we read it, fail instead of double-debiting.
    const moved = await c.one(`UPDATE recharge_orders SET status='refunded' WHERE id=$1 AND status='paid' RETURNING id`, [o.id]);
    need(moved, 'Order already refunded or a refund request is in progress');
    // take back as many of those coins as are left; freeze if already spent
    const u = await c.one('SELECT coins FROM users WHERE id=$1 FOR UPDATE', [o.user_id]);
    const take = Math.min(Number(u.coins), Number(o.coins));
    if (take > 0) await changeCoins(c, o.user_id, -take, 'refund', { refType: 'order', refId: o.id, allowFrozen: true });
    if (take < o.coins) await c.q('UPDATE users SET wallet_frozen=true WHERE id=$1', [o.user_id]);
  });
  await audit(req, 'order.refund', 'order', o.id);
  res.json({ ok: true });
});

// Manual recharge (bank transfer / UPI received outside the app)
r.post('/admin/recharge/manual', adminAuth('finance'), async (req, res) => {
  const u = await one('SELECT id FROM users WHERE uid=$1 OR fancy_id=$2', [int(req.body.uid), str(req.body.uid, 20)]);
  need(u, 'User not found');
  const coins = int(req.body.coins);
  const amount = Number(req.body.amount || 0);
  need(coins > 0, 'Coins required');
  const s = await getSettings();
  const o = await one(`INSERT INTO recharge_orders(user_id, amount, currency, coins, gateway, gateway_payment_id) VALUES ($1,$2,$3,$4,'manual',$5) RETURNING id`,
    [u.id, amount, s.economy.currency, coins, str(req.body.reference, 100) || null]);
  await creditOrder(o.id, { paymentId: str(req.body.reference, 100) || `manual:${req.admin.email}` });
  await audit(req, 'recharge.manual', 'user', u.id, { coins, amount, reference: req.body.reference });
  res.json({ ok: true, order_id: o.id });
});

// ================= SETTLEMENT (host salary) =================
r.post('/admin/settlement/run', adminAuth('settlement'), async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.body.month || '') ? req.body.month : monthOf(new Date(Date.now() - 15 * 864e5));
  const out = await runSettlement(month);
  await audit(req, 'settlement.run', 'month', month, out);
  res.json({ month, ...out });
});

r.get('/admin/settlements', adminAuth('settlement'), async (req, res) => {
  const month = req.query.month || monthOf(new Date(Date.now() - 15 * 864e5));
  const rows = await q(
    `SELECT s.*, u.uid, u.name, h.real_name, h.payout_method, h.payout_details, a.name AS agency_name, a.code AS agency_code
     FROM host_settlements s JOIN users u ON u.id=s.host_id LEFT JOIN hosts h ON h.user_id=s.host_id LEFT JOIN agencies a ON a.id=s.agency_id
     WHERE s.month=$1 AND ($2::text IS NULL OR s.status=$2) ORDER BY s.total DESC`, [month, req.query.status || null]);
  if (req.query.format === 'csv') {
    return sendCsv(res, `settlements-${month}`, rows.map((x) => ({
      id: x.id, month: x.month, uid: x.uid, name: x.name, real_name: x.real_name, agency: x.agency_code, diamonds: x.diamonds, hours: x.live_hours,
      valid_days: x.valid_days, level: x.level, target_met: x.target_met, base: x.base_amount, bonus: x.bonus, deduction: x.deduction, total: x.total,
      currency: x.currency, status: x.status, payout_method: x.payout_method, payout_details: x.payout_details,
    })));
  }
  const totals = rows.reduce((a, x) => ({ total: a.total + Number(x.total), diamonds: a.diamonds + Number(x.diamonds) }), { total: 0, diamonds: 0 });
  res.json({ month, rows, totals });
});

r.post('/admin/settlements/:id/:action', adminAuth('settlement'), async (req, res) => {
  const id = int(req.params.id);
  const action = req.params.action;
  let row;
  if (action === 'approve') row = await approveSettlement(id, req.admin.id);
  else if (action === 'reject') row = await one(`UPDATE host_settlements SET status='rejected', note=$2 WHERE id=$1 AND status IN ('draft','agency_ok') RETURNING *`, [id, str(req.body.note, 200)]);
  else if (action === 'paid') row = await one(`UPDATE host_settlements SET status='paid', paid_at=now(), payout_ref=$2 WHERE id=$1 AND status='approved' RETURNING *`, [id, str(req.body.payout_ref, 100)]);
  else if (action === 'adjust') row = await one(`UPDATE host_settlements SET bonus=bonus + $2, total=GREATEST(0, total + $2), note=$3 WHERE id=$1 AND status='draft' RETURNING *`, [id, Number(req.body.amount || 0), str(req.body.note, 200)]);
  else throw bad('Unknown action');
  need(row, 'Settlement not in the right status for this action');
  if (action === 'paid') {
    await q(`INSERT INTO notifications(user_id, title, body) VALUES ($1,'Salary paid',$2)`, [row.host_id, `Your ${row.month} salary of ${row.currency} ${row.total} has been paid. Ref: ${row.payout_ref || '-'}`]);
    toUser(row.host_id, 'notify', { type: 'salary', text: `${row.month} salary paid` });
  }
  if (action !== 'paid') await runAgencyCommissions(row.month);
  await audit(req, `settlement.${action}`, 'settlement', id, req.body);
  res.json(row);
});

r.post('/admin/settlements/bulk', adminAuth('settlement'), async (req, res) => {
  const ids = (req.body.ids || []).map(int);
  const action = req.body.action;
  let n = 0;
  for (const id of ids) {
    if (action === 'approve' && (await approveSettlement(id, req.admin.id))) n++;
    if (action === 'paid' && (await one(`UPDATE host_settlements SET status='paid', paid_at=now(), payout_ref=$2 WHERE id=$1 AND status='approved' RETURNING id`, [id, str(req.body.payout_ref, 100)]))) n++;
  }
  await audit(req, `settlement.bulk_${action}`, null, null, { ids, n });
  res.json({ updated: n });
});

r.get('/admin/commissions', adminAuth('settlement'), async (req, res) => {
  const month = req.query.month || monthOf(new Date(Date.now() - 15 * 864e5));
  const rows = await q(`SELECT c.*, a.name, a.code, a.payout_method, a.payout_details FROM agency_commissions c JOIN agencies a ON a.id=c.agency_id WHERE c.month=$1 ORDER BY c.total DESC`, [month]);
  if (req.query.format === 'csv') return sendCsv(res, `commissions-${month}`, rows);
  res.json(rows);
});

r.post('/admin/commissions/:id/:action', adminAuth('settlement'), async (req, res) => {
  const id = int(req.params.id);
  let row;
  if (req.params.action === 'approve') row = await one(`UPDATE agency_commissions SET status='approved' WHERE id=$1 AND status='draft' RETURNING *`, [id]);
  else if (req.params.action === 'paid') row = await one(`UPDATE agency_commissions SET status='paid', paid_at=now(), payout_ref=$2 WHERE id=$1 AND status='approved' RETURNING *`, [id, str(req.body.payout_ref, 100)]);
  else throw bad('Unknown action');
  need(row, 'Wrong status');
  await audit(req, `commission.${req.params.action}`, 'commission', id, req.body);
  res.json(row);
});

// ================= COIN SELLERS =================
r.get('/admin/sellers', adminAuth('sellers'), async (_req, res) => {
  res.json(await q(
    `SELECT s.user_id, s.balance, s.daily_limit, s.discount_pct, s.status, s.created_at, u.uid, u.name,
       (SELECT coalesce(sum(coins),0) FROM seller_transfers t WHERE t.seller_id=s.user_id AND t.kind='transfer' AND t.created_at >= date_trunc('month', now()))::bigint AS month_sold
     FROM coin_sellers s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC`));
});

r.post('/admin/sellers', adminAuth('sellers'), async (req, res) => {
  const u = await one('SELECT id FROM users WHERE uid=$1 OR fancy_id=$2', [int(req.body.uid), str(req.body.uid, 20)]);
  need(u, 'User not found');
  need(String(req.body.password || '').length >= 8, 'Seller panel password must be 8+ characters');
  await q(`INSERT INTO coin_sellers(user_id, password_hash, daily_limit, discount_pct) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id) DO UPDATE SET password_hash=$2, daily_limit=$3, discount_pct=$4, status='active'`,
    [u.id, await bcrypt.hash(String(req.body.password), 10), int(req.body.daily_limit, 1000000), Number(req.body.discount_pct ?? 10)]);
  await audit(req, 'seller.create', 'user', u.id);
  res.json({ ok: true });
});

r.put('/admin/sellers/:userId', adminAuth('sellers'), async (req, res) => {
  const id = int(req.params.userId);
  const b = req.body;
  if (b.status !== undefined) await q('UPDATE coin_sellers SET status=$2 WHERE user_id=$1', [id, str(b.status, 20)]);
  if (b.daily_limit !== undefined) await q('UPDATE coin_sellers SET daily_limit=$2 WHERE user_id=$1', [id, int(b.daily_limit)]);
  if (b.discount_pct !== undefined) await q('UPDATE coin_sellers SET discount_pct=$2 WHERE user_id=$1', [id, Number(b.discount_pct)]);
  if (b.password) await q('UPDATE coin_sellers SET password_hash=$2 WHERE user_id=$1', [id, await bcrypt.hash(String(b.password), 10)]);
  await audit(req, 'seller.update', 'user', id, { ...b, password: b.password ? '***' : undefined });
  res.json({ ok: true });
});

// Issue wholesale coins to a seller after they pay you (bank/UPI/USDT)
r.post('/admin/sellers/:userId/topup', adminAuth('sellers'), async (req, res) => {
  const id = int(req.params.userId);
  const coins = int(req.body.coins);
  need(coins !== 0, 'Coins required');
  await tx(async (c) => {
    const s = await c.one('UPDATE coin_sellers SET balance = balance + $2 WHERE user_id=$1 AND balance + $2 >= 0 RETURNING balance', [id, coins]);
    need(s, 'Seller not found or balance would go negative');
    await c.q(`INSERT INTO seller_transfers(seller_id, coins, kind, note) VALUES ($1,$2,$3,$4)`, [id, coins, coins > 0 ? 'wholesale_in' : 'admin_adjust',
      `${req.admin.email}: ${str(req.body.note, 150)} ${req.body.amount_paid ? `(paid ${req.body.amount_paid})` : ''}`]);
  });
  await audit(req, 'seller.topup', 'user', id, { coins, amount_paid: req.body.amount_paid, note: req.body.note });
  res.json({ ok: true });
});

r.get('/admin/sellers/:userId/transfers', adminAuth('sellers'), async (req, res) => {
  res.json(await q(`SELECT t.*, u.uid, u.name FROM seller_transfers t LEFT JOIN users u ON u.id=t.to_user_id WHERE t.seller_id=$1 ORDER BY t.id DESC LIMIT 500`, [int(req.params.userId)]));
});

// ================= LEDGER & P&L =================
r.get('/admin/ledger', adminAuth('finance'), async (req, res) => {
  const { limit, offset } = page(req, 100, 1000);
  const rows = await q(
    `SELECT l.*, u.uid, u.name FROM ledger l JOIN users u ON u.id=l.user_id
     WHERE ($1::bigint IS NULL OR u.uid=$1) AND ($2::text IS NULL OR l.type=$2) AND ($3::text IS NULL OR l.currency=$3)
     ORDER BY l.id DESC LIMIT $4 OFFSET $5`,
    [req.query.uid ? int(req.query.uid) : null, req.query.type || null, req.query.currency || null, limit, offset]);
  if (req.query.format === 'csv') return sendCsv(res, 'ledger', rows);
  res.json(rows);
});

r.get('/admin/finance/summary', adminAuth('finance'), async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  // `to` is an inclusive calendar date from the UI; the SQL compares against the next day.
  const byType = await q(
    // Date-range semantics: `from`/`to` are inclusive calendar dates. `to` is
    // extended by one day and compared strictly, so the whole end date counts
    // (a bare `created_at < to` silently dropped the end day). The `$n::date`
    // casts resolve day boundaries in the DB session TimeZone (Postgres GUC;
    // this deployment runs Asia/Calcutta), and created_at is timestamptz, so
    // ranges follow server-local days. Regression: test/finance_summary_dates.mjs.
    `SELECT currency, type, sum(amount)::bigint AS amount, count(*)::int AS n FROM ledger WHERE created_at >= $1::date AND created_at < $2::date + 1 GROUP BY 1,2 ORDER BY 1,2`, [from, to]);
  const revenue = await q(`SELECT gateway, currency, sum(amount)::numeric AS amount, count(*)::int AS orders FROM recharge_orders WHERE status='paid' AND paid_at >= $1::date AND paid_at < $2::date + 1 GROUP BY 1,2`, [from, to]);
  const liability = await one(`SELECT sum(coins)::bigint AS coins, sum(diamonds)::bigint AS diamonds FROM users WHERE status<>'deleted'`);
  const sellerFloat = await one(`SELECT coalesce(sum(balance),0)::bigint AS coins FROM coin_sellers`);
  const salaries = await q(`SELECT status, sum(total)::numeric AS amount, count(*)::int AS n FROM host_settlements WHERE created_at >= $1::date AND created_at < $2::date + 1 GROUP BY status`, [from, to]);
  const commissions = await q(`SELECT status, sum(total)::numeric AS amount FROM agency_commissions WHERE created_at >= $1::date AND created_at < $2::date + 1 GROUP BY status`, [from, to]);
  const s = await getSettings();
  res.json({ from, to, by_type: byType, revenue, liability: { ...liability, seller_coins: sellerFloat.coins, diamonds_value: Math.round((Number(liability.diamonds || 0) / s.economy.diamonds_per_unit) * 100) / 100 }, salaries, commissions, currency: s.economy.currency });
});

// ================= ANALYTICS =================
r.get('/admin/analytics', adminAuth('analytics'), async (req, res) => {
  const days = Math.min(int(req.query.days, 30), 180);
  const daily = await q(
    `SELECT d::date AS day,
       (SELECT count(*) FROM users WHERE created_at::date=d::date)::int AS new_users,
       (SELECT count(*) FROM user_active_days WHERE day=d::date)::int AS dau,
       (SELECT coalesce(sum(amount),0) FROM recharge_orders WHERE status='paid' AND paid_at::date=d::date)::numeric AS revenue,
       (SELECT count(DISTINCT user_id) FROM recharge_orders WHERE status='paid' AND paid_at::date=d::date)::int AS payers,
       (SELECT count(*) FROM rooms WHERE started_at::date=d::date)::int AS lives,
       (SELECT coalesce(round(sum(live_seconds)/3600.0,1),0) FROM host_daily_stats WHERE day=d::date)::numeric AS live_hours
     FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') d ORDER BY d`, [days]);
  // D1 / D7 / D30 retention for signup cohorts by week
  const retention = await q(
    `SELECT date_trunc('week', u.created_at)::date AS cohort, count(*)::int AS users,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_active_days a WHERE a.user_id=u.id AND a.day = u.created_at::date + 1)) / count(*), 1) AS d1,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_active_days a WHERE a.user_id=u.id AND a.day = u.created_at::date + 7)) / count(*), 1) AS d7,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_active_days a WHERE a.user_id=u.id AND a.day = u.created_at::date + 30)) / count(*), 1) AS d30
     FROM users u WHERE u.created_at > now() - interval '12 weeks' GROUP BY 1 ORDER BY 1 DESC`);
  const funnel = await one(
    `SELECT count(*)::int AS registered,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_active_days a WHERE a.user_id=u.id AND a.day > u.created_at::date))::int AS returned,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM gift_transactions g WHERE g.sender_id=u.id))::int AS gifted,
       count(*) FILTER (WHERE u.first_recharge_done)::int AS paid
     FROM users u WHERE u.created_at > now() - make_interval(days => $1)`, [days]);
  const giftSales = await q(
    `SELECT g.id, g.name, g.icon, g.price, sum(t.qty)::bigint AS qty, sum(t.coins)::bigint AS coins FROM gift_transactions t JOIN gifts g ON g.id=t.gift_id
     WHERE t.created_at > now() - make_interval(days => $1) GROUP BY g.id ORDER BY coins DESC LIMIT 30`, [days]);
  const countries = await q(
    `SELECT u.country, count(*)::int AS users, coalesce(sum(u.total_recharged),0)::numeric AS revenue FROM users u GROUP BY 1 ORDER BY revenue DESC, users DESC LIMIT 20`);
  const hosts = await q(
    `SELECT s.host_id, u.name, u.uid, sum(s.live_seconds)::bigint/3600 AS hours, sum(s.diamonds)::bigint AS diamonds FROM host_daily_stats s JOIN users u ON u.id=s.host_id
     WHERE s.day > CURRENT_DATE - $1::int GROUP BY 1,2,3 ORDER BY diamonds DESC LIMIT 20`, [days]);
  res.json({ daily, retention, funnel, gift_sales: giftSales, countries, hosts });
});

r.get('/admin/export/users', adminAuth('analytics'), async (_req, res) => {
  sendCsv(res, 'users', await q(`SELECT id, uid, name, email, phone, gender, country, coins, diamonds, total_spent, total_earned, total_recharged, vip_level, is_host, status, created_at, last_login FROM users ORDER BY id`));
});


// ---------- host withdrawals (synthetic: admin marks paid after paying out-of-band) ----------

r.get('/admin/withdrawals', adminAuth('finance'), async (req, res) => {
  const status = str(req.query.status, 20) || 'requested';
  const rows = status === 'all'
    ? await q('SELECT w.*, u.uid, u.name FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC LIMIT 200')
    : await q('SELECT w.*, u.uid, u.name FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status=$1 ORDER BY w.created_at DESC LIMIT 200', [status]);
  res.json(rows);
});

r.post('/admin/withdrawals/:id', adminAuth('finance'), async (req, res) => {
  const action = str(req.body.action, 10);
  const w = await one('SELECT * FROM withdrawals WHERE id=$1', [int(req.params.id)]);
  need(w && w.status === 'requested', 'Withdrawal not found or already processed');
  if (action === 'paid') {
    await q(`UPDATE withdrawals SET status='paid', decided_at=now(), note=$2 WHERE id=$1 AND status='requested'`, [w.id, str(req.body.note, 200) || null]);
  } else if (action === 'rejected') {
    await tx(async (c) => {
      await c.q(`UPDATE withdrawals SET status='rejected', decided_at=now(), note=$2 WHERE id=$1 AND status='requested'`, [w.id, str(req.body.note, 200) || null]);
      await changeDiamonds(c, w.user_id, Number(w.diamonds), 'withdraw_refund', { refType: 'withdrawal', refId: w.id, note: 'Withdrawal rejected, diamonds returned' });
    });
  } else {
    throw bad('action must be paid or rejected');
  }
  await audit(req, `withdrawal.${action}`, 'withdrawal', w.id);
  res.json({ ok: true });
});

// ---------- user recharge-refund requests ----------

r.get('/admin/refunds', adminAuth('finance'), async (req, res) => {
  const status = str(req.query.status, 20) || 'open';
  const rows = status === 'all'
    ? await q('SELECT rr.*, u.uid, u.name FROM refund_requests rr JOIN users u ON u.id=rr.user_id ORDER BY rr.created_at DESC LIMIT 200')
    : await q('SELECT rr.*, u.uid, u.name FROM refund_requests rr JOIN users u ON u.id=rr.user_id WHERE rr.status=$1 ORDER BY rr.created_at DESC LIMIT 200', [status]);
  res.json(rows);
});

r.post('/admin/refunds/:id', adminAuth('finance'), async (req, res) => {
  const action = str(req.body.action, 10);
  const rr = await one('SELECT * FROM refund_requests WHERE id=$1', [int(req.params.id)]);
  need(rr && rr.status === 'open', 'Refund request not found or already decided');
  if (action === 'approve') {
    // Coins were already held at request time; approving finalizes the debit.
    await tx(async (c) => {
      await c.q(`UPDATE refund_requests SET status='approved', decided_at=now(), decided_by=$2 WHERE id=$1 AND status='open'`, [rr.id, req.admin.id]);
      await c.q(`UPDATE recharge_orders SET status='refunded' WHERE id=$1 AND status='refund_requested'`, [rr.order_id]);
    });
  } else if (action === 'reject') {
    await tx(async (c) => {
      await c.q(`UPDATE refund_requests SET status='rejected', decided_at=now(), decided_by=$2 WHERE id=$1 AND status='open'`, [rr.id, req.admin.id]);
      await c.q(`UPDATE recharge_orders SET status='paid' WHERE id=$1 AND status='refund_requested'`, [rr.order_id]);
      // Release the held coins back to the user.
      await changeCoins(c, rr.user_id, Number(rr.coins), 'refund_release', { refType: 'refund', refId: rr.id, note: 'Refund rejected, coins returned', allowFrozen: true });
    });
  } else {
    throw bad('action must be approve or reject');
  }
  await audit(req, `refund.${action}`, 'refund', rr.id);
  res.json({ ok: true });
});

export default r;

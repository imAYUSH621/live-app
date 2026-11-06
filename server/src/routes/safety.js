import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, str, int, bad, notFound } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { changeCoins } from '../lib/wallet.js';
import { effectiveLimit, spentToday } from '../lib/safety.js';

const r = Router();
const auth = userAuth();
const helpers = { one, q };

// ---------- spend safety ----------

r.get('/safety', auth, async (req, res) => {
  const s = await getSettings();
  const u = req.user;
  const windowH = s.safety.refund_window_hours;
  const limit = await effectiveLimit(helpers, u.id);  // promote first so pending reads post-promotion state
  const [spent, pending, w, orders] = await Promise.all([
    spentToday(helpers, u.id),
    one('SELECT pending_limit_coins, pending_limit_at FROM users WHERE id=$1', [u.id]),
    one('SELECT coins FROM users WHERE id=$1', [u.id]),
    q(`SELECT o.id, o.coins, o.amount, o.currency, o.status, o.created_at, rr.status AS refund_status
       FROM recharge_orders o LEFT JOIN refund_requests rr ON rr.order_id = o.id
       WHERE o.user_id = $1 AND o.status IN ('paid','refund_requested','refunded')
         AND o.created_at > now() - interval '7 days'
       ORDER BY o.created_at DESC`, [u.id]),
  ]);
  res.json({
    dailyLimit: limit,
    pendingLimit: pending?.pending_limit_coins != null ? Number(pending.pending_limit_coins) : null,
    pendingAt: pending?.pending_limit_at || null,
    spentToday: spent,
    refundWindowHours: windowH,
    raiseDelayHours: s.safety.limit_raise_delay_hours,
    orders: orders.map((o) => ({
      id: o.id, coins: Number(o.coins), amount: Number(o.amount), currency: o.currency,
      status: o.status, at: o.created_at,
      refundStatus: o.refund_status || null,
      canRefund: o.status === 'paid' && !o.refund_status
        && new Date(o.created_at).getTime() > Date.now() - windowH * 3600e3
        && Number(w.coins) >= Number(o.coins),
    })),
  });
});

r.put('/safety/limit', auth, async (req, res) => {
  const s = await getSettings();
  const want = Math.max(0, Math.floor(Number(req.body.coins || 0)));
  const cur = await effectiveLimit(helpers, req.user.id);
  const lowering = want > 0 && (cur === 0 || want < cur);
  if (lowering) {
    await q('UPDATE users SET daily_limit_coins=$2, pending_limit_coins=NULL, pending_limit_at=NULL WHERE id=$1', [req.user.id, want]);
    return res.json({ dailyLimit: want, pendingLimit: null });
  }
  if (want === cur) return res.json({ dailyLimit: cur, pendingLimit: null });
  const at = new Date(Date.now() + s.safety.limit_raise_delay_hours * 3600e3);
  await q('UPDATE users SET pending_limit_coins=$2, pending_limit_at=$3 WHERE id=$1', [req.user.id, want, at]);
  res.json({ dailyLimit: cur, pendingLimit: want, pendingAt: at });
});

// ---------- accidental recharge refund (coins held while reviewed) ----------

r.post('/recharge/:id/refund', auth, async (req, res) => {
  const s = await getSettings();
  const o = await one('SELECT * FROM recharge_orders WHERE id=$1 AND user_id=$2', [int(req.params.id), req.user.id]);
  if (!o) throw notFound('Order not found');
  if (o.status !== 'paid') throw bad('This recharge cannot be refunded', 'not_refundable');
  const windowH = s.safety.refund_window_hours;
  if (new Date(o.created_at).getTime() < Date.now() - windowH * 3600e3) {
    throw bad(`Refunds are possible within ${windowH} hours of the recharge`, 'too_late');
  }
  const recent = await one(`SELECT COUNT(*)::int AS n FROM refund_requests WHERE user_id=$1 AND created_at > now() - interval '30 days'`, [req.user.id]);
  if (recent.n >= s.safety.refund_max_per_30d) throw bad('You have already asked for a refund this month', 'limit');
  const reason = str(req.body.reason, 300) || 'Accidental recharge';
  const balance = await tx(async (c) => {
    const ins = await c.one(
      `INSERT INTO refund_requests(user_id, order_id, coins, reason) VALUES ($1,$2,$3,$4)
       ON CONFLICT (order_id) DO NOTHING RETURNING id`,
      [req.user.id, o.id, o.coins, reason]);
    if (!ins) throw bad('A refund is already requested for this recharge', 'already_requested');
    const moved = await c.one(`UPDATE recharge_orders SET status='refund_requested' WHERE id=$1 AND status='paid' RETURNING id`, [o.id]);
    if (!moved) throw bad('A refund is already requested for this recharge', 'already_requested');
    // Coins are held right away so they cannot be spent while the refund is processed.
    return changeCoins(c, req.user.id, -Number(o.coins), 'refund_hold', { refType: 'refund', refId: ins.id, note: 'Held for refund', allowFrozen: true });
  });
  res.json({ ok: true, coins: balance });
});

// ---------- user's own support reports ----------

r.get('/reports/mine', auth, async (req, res) => {
  res.json(await q(
    `SELECT id, target_type, target_id, reason, details, status, action, handled_at, created_at
     FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]));
});

export default r;

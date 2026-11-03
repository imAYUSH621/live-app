import { q, one } from '../db.js';

async function flag(userId, kind, score, details) {
  const exists = await one(`SELECT 1 FROM risk_flags WHERE user_id=$1 AND kind=$2 AND status='open'`, [userId, kind]);
  if (exists) return 0;
  await q(`INSERT INTO risk_flags(user_id, kind, score, details) VALUES ($1,$2,$3,$4)`, [userId, kind, score, details]);
  return 1;
}

/** Simple fraud rules. Runs hourly from jobs and on demand from the admin panel. */
export async function runRiskScan() {
  let n = 0;
  // 1) many accounts on one device
  const devices = await q(
    `SELECT device_id, array_agg(id) AS ids, count(*)::int AS c FROM users
     WHERE device_id IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY device_id HAVING count(*) >= 4`);
  for (const d of devices) for (const id of d.ids) n += await flag(id, 'multi_account', Math.min(100, 40 + d.c * 10), { device_id: d.device_id, accounts: d.c });

  // 2) gifting to an account on the same device / IP (self-gifting to cash out)
  const self = await q(
    `SELECT t.sender_id, t.receiver_id, sum(t.coins)::bigint AS coins FROM gift_transactions t
     JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.receiver_id
     WHERE t.created_at > now() - interval '7 days' AND ((s.device_id IS NOT NULL AND s.device_id=r.device_id) OR (s.last_ip IS NOT NULL AND s.last_ip=r.last_ip))
     GROUP BY 1,2 HAVING sum(t.coins) > 1000`);
  for (const x of self) n += await flag(x.receiver_id, 'self_gift', 85, { sender_id: x.sender_id, coins: x.coins });

  // 3) one sender pouring most of a host's income (possible laundering)
  const loops = await q(
    `WITH tot AS (SELECT receiver_id, sum(coins) AS total FROM gift_transactions WHERE created_at > now() - interval '7 days' GROUP BY 1 HAVING sum(coins) > 50000)
     SELECT t.receiver_id, g.sender_id, sum(g.coins)::bigint AS coins, max(t.total)::bigint AS total FROM tot t
     JOIN gift_transactions g ON g.receiver_id=t.receiver_id AND g.created_at > now() - interval '7 days'
     GROUP BY 1,2 HAVING sum(g.coins) > 0.9 * max(t.total)`);
  for (const x of loops) n += await flag(x.receiver_id, 'gift_loop', 60, { sender_id: x.sender_id, coins: x.coins, total: x.total });

  // 4) rapid recharges (possible stolen cards)
  const rapid = await q(
    `SELECT user_id, count(*)::int AS c, sum(amount)::numeric AS amount FROM recharge_orders
     WHERE status='paid' AND paid_at > now() - interval '1 hour' GROUP BY user_id HAVING count(*) >= 5`);
  for (const x of rapid) n += await flag(x.user_id, 'rapid_recharge', 70, { orders: x.c, amount: x.amount });

  return { new_flags: n };
}

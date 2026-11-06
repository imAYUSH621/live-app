import { bad } from './util.js';

// Daily gift-spend limits, ported from the reference implementation.
// A raised limit only applies after a cooling-off delay; a lowered one applies at once.
// All helpers take a queryable `c` ({ one, q }) so they work on the pool or inside a transaction.

export async function effectiveLimit(c, userId) {
  const promoted = await c.one(
    `UPDATE users SET daily_limit_coins = pending_limit_coins, pending_limit_coins = NULL, pending_limit_at = NULL
     WHERE id = $1 AND pending_limit_coins IS NOT NULL AND pending_limit_at <= now()
     RETURNING daily_limit_coins`, [userId]);
  if (promoted) return Number(promoted.daily_limit_coins);
  const row = await c.one('SELECT daily_limit_coins FROM users WHERE id = $1', [userId]);
  return Number(row?.daily_limit_coins || 0);
}

export async function spentToday(c, userId) {
  // "Today" follows the app's business timezone (IST), same as rankings/jobs.
  const row = await c.one(
    `SELECT COALESCE(SUM(-amount),0) AS s FROM ledger
     WHERE user_id = $1 AND currency = 'coin' AND type = 'gift_send'
       AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata'`,
    [userId]);
  return Number(row.s);
}

export async function checkSpend(c, userId, coins) {
  // Lock the user row so concurrent gift sends serialize on the limit check (prevents spend races).
  await c.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const limit = await effectiveLimit(c, userId);
  if (limit > 0) {
    const spent = await spentToday(c, userId);
    if (spent + coins > limit) {
      throw bad(`This would cross your daily gift limit of ${limit} coins (used ${spent}). You can change it in Safety settings.`, 'daily_limit');
    }
  }
}

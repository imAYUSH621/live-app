import { HttpError } from './util.js';

// All balance changes go through these helpers, always inside a DB transaction (c = tx client),
// so every coin / diamond movement has a ledger row and balances can never go negative.

const SPEND_TYPES = new Set(['gift_send', 'call', 'vip', 'noble', 'store', 'fancy_id', 'ticket', 'red_packet', 'match_filter', 'paid_message']);

export async function changeCoins(c, userId, amount, type, { refType = null, refId = null, note = null, allowFrozen = false } = {}) {
  amount = Math.trunc(amount);
  if (amount === 0) return null;
  const spending = amount < 0 && SPEND_TYPES.has(type);
  const row = await c.one(
    `UPDATE users SET coins = coins + $2,
       total_spent = total_spent + $3
     WHERE id = $1 AND coins + $2 >= 0 ${allowFrozen || amount > 0 ? '' : 'AND wallet_frozen = false'}
     RETURNING coins`,
    [userId, amount, spending ? -amount : 0],
  );
  if (!row) {
    const u = await c.one('SELECT coins, wallet_frozen FROM users WHERE id=$1', [userId]);
    if (!u) throw new HttpError(404, 'User not found');
    if (u.wallet_frozen) throw new HttpError(403, 'Wallet is frozen. Contact support.', 'wallet_frozen');
    throw new HttpError(402, 'Not enough coins', 'insufficient_coins');
  }
  await c.q(
    `INSERT INTO ledger(user_id, currency, amount, balance_after, type, ref_type, ref_id, note)
     VALUES ($1,'coin',$2,$3,$4,$5,$6,$7)`,
    [userId, amount, row.coins, type, refType, refId == null ? null : String(refId), note],
  );
  return row.coins;
}

const INCOME_TYPES = new Set(['gift_receive', 'call_income', 'ticket_income', 'event_reward_diamond']);

export async function changeDiamonds(c, userId, amount, type, { refType = null, refId = null, note = null } = {}) {
  amount = Math.trunc(amount);
  if (amount === 0) return null;
  const earning = amount > 0 && INCOME_TYPES.has(type);
  const row = await c.one(
    `UPDATE users SET diamonds = diamonds + $2, total_earned = total_earned + $3
     WHERE id = $1 AND diamonds + $2 >= 0 RETURNING diamonds`,
    [userId, amount, earning ? amount : 0],
  );
  if (!row) throw new HttpError(402, 'Not enough diamonds', 'insufficient_diamonds');
  await c.q(
    `INSERT INTO ledger(user_id, currency, amount, balance_after, type, ref_type, ref_id, note)
     VALUES ($1,'diamond',$2,$3,$4,$5,$6,$7)`,
    [userId, amount, row.diamonds, type, refType, refId == null ? null : String(refId), note],
  );
  return row.diamonds;
}

/** Add live/call income to the host's daily stats (used for monthly salary). */
export async function addHostDiamondStat(c, hostId, diamonds, { reward = false } = {}) {
  await c.q(
    `INSERT INTO host_daily_stats(host_id, day, diamonds, reward_diamonds)
     VALUES ($1, CURRENT_DATE, $2, $3)
     ON CONFLICT (host_id, day) DO UPDATE SET diamonds = host_daily_stats.diamonds + $2,
       reward_diamonds = host_daily_stats.reward_diamonds + $3`,
    [hostId, reward ? 0 : diamonds, reward ? diamonds : 0],
  );
}

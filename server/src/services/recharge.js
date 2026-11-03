import crypto from 'node:crypto';
import { tx, one } from '../db.js';
import { config } from '../config.js';
import { changeCoins } from '../lib/wallet.js';
import { getSettings } from '../lib/settings.js';
import { toUser } from '../lib/io.js';
import { HttpError } from '../lib/util.js';

export const razorpayEnabled = () => !!(config.razorpay.keyId && config.razorpay.keySecret);

export async function razorpayCreateOrder(amount, currency, receipt) {
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: Math.round(amount * 100), currency, receipt }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, j?.error?.description || 'Payment gateway error');
  return j;
}

export function razorpayVerify(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return signature && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature).padEnd(expected.length).slice(0, expected.length)));
}

export function razorpayWebhookValid(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return expected === signature;
}

/**
 * Mark an order paid and credit coins exactly once (safe to call from both client verify and webhook).
 */
export async function creditOrder(orderId, { paymentId = null, raw = null } = {}) {
  const s = await getSettings();
  const res = await tx(async (c) => {
    const o = await c.one(
      `UPDATE recharge_orders SET status='paid', paid_at=now(), gateway_payment_id=COALESCE($2, gateway_payment_id), raw=COALESCE($3, raw)
       WHERE id=$1 AND status='created' RETURNING *`, [orderId, paymentId, raw]);
    if (!o) return null;
    const u = await c.one('SELECT id, first_recharge_done, referred_by FROM users WHERE id=$1 FOR UPDATE', [o.user_id]);
    let coins = Number(o.coins);
    if (!u.first_recharge_done && o.package_id) {
      const pkg = await c.one('SELECT first_bonus FROM recharge_packages WHERE id=$1', [o.package_id]);
      coins += Number(pkg?.first_bonus || 0);
    }
    const bal = await changeCoins(c, u.id, coins, 'recharge', { refType: 'order', refId: o.id, note: `${o.currency} ${o.amount}` });
    await c.q('UPDATE users SET first_recharge_done=true, total_recharged = total_recharged + $2 WHERE id=$1', [u.id, o.amount]);
    if (u.referred_by && s.economy.referral_recharge_pct > 0) {
      const reward = Math.floor((coins * s.economy.referral_recharge_pct) / 100);
      if (reward > 0) await changeCoins(c, u.referred_by, reward, 'referral_reward', { refType: 'user', refId: u.id });
    }
    return { userId: u.id, coins, balance: bal, order: o };
  });
  if (res) toUser(res.userId, 'wallet:update', { coins: res.balance, recharged: res.coins });
  return res;
}

export async function getOrder(id) {
  return one('SELECT * FROM recharge_orders WHERE id=$1', [id]);
}

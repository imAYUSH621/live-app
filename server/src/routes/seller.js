import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q, tx } from '../db.js';
import { sellerAuth, signToken } from '../lib/auth.js';
import { need, str, int, bad, page } from '../lib/util.js';
import { changeCoins } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';
import { miniProfile } from '../services/profile.js';
import { audit } from '../lib/audit.js';

// Official coin sellers (resellers): buy coins wholesale from you, sell to users for cash/UPI,
// transfer coins to a user's ID from this panel. Keeps the grey-market in your control.
const r = Router();
const auth = sellerAuth();

r.post('/seller/login', async (req, res) => {
  const uid = int(req.body.uid);
  const s = await one(`SELECT s.*, u.id AS user_id FROM coin_sellers s JOIN users u ON u.id=s.user_id WHERE u.uid=$1 OR u.fancy_id=$2`, [uid, String(req.body.uid || '')]);
  if (!s || !s.password_hash || !(await bcrypt.compare(String(req.body.password || ''), s.password_hash))) throw bad('Wrong ID or password');
  need(s.status === 'active', 'Seller account is not active');
  res.json({ token: signToken('seller', s.user_id, {}, '7d') });
});

r.get('/seller/me', auth, async (req, res) => {
  const today = await one(`SELECT coalesce(sum(coins),0)::bigint AS coins, count(*)::int AS n FROM seller_transfers WHERE seller_id=$1 AND kind='transfer' AND created_at::date=CURRENT_DATE`, [req.seller.user_id]);
  const month = await one(`SELECT coalesce(sum(coins),0)::bigint AS coins FROM seller_transfers WHERE seller_id=$1 AND kind='transfer' AND created_at >= date_trunc('month', now())`, [req.seller.user_id]);
  res.json({ seller: { ...req.seller, password_hash: undefined }, today, month });
});

r.get('/seller/lookup/:uid', auth, async (req, res) => {
  const u = await one(`SELECT id FROM users WHERE (uid=$1 OR fancy_id=$2) AND status='active'`, [int(req.params.uid), str(req.params.uid, 20)]);
  need(u, 'No user with this ID');
  res.json(await miniProfile(u.id));
});

r.post('/seller/transfer', auth, async (req, res) => {
  const coins = int(req.body.coins);
  need(coins > 0, 'Enter coins');
  const target = await one(`SELECT id FROM users WHERE (uid=$1 OR fancy_id=$2) AND status='active'`, [int(req.body.uid), str(req.body.uid, 20)]);
  need(target, 'No user with this ID');
  need(target.id !== req.seller.user_id, 'Cannot transfer to yourself');
  const out = await tx(async (c) => {
    const s = await c.one('SELECT * FROM coin_sellers WHERE user_id=$1 FOR UPDATE', [req.seller.user_id]);
    need(s.balance >= coins, 'Not enough seller balance');
    const today = await c.one(`SELECT coalesce(sum(coins),0)::bigint AS n FROM seller_transfers WHERE seller_id=$1 AND kind='transfer' AND created_at::date=CURRENT_DATE`, [s.user_id]);
    need(Number(today.n) + coins <= s.daily_limit, `Daily limit ${s.daily_limit} reached`);
    await c.q('UPDATE coin_sellers SET balance = balance - $2 WHERE user_id=$1', [s.user_id, coins]);
    const t = await c.one(`INSERT INTO seller_transfers(seller_id, to_user_id, coins, kind, note) VALUES ($1,$2,$3,'transfer',$4) RETURNING *`,
      [s.user_id, target.id, coins, str(req.body.note, 200)]);
    const bal = await changeCoins(c, target.id, coins, 'seller_topup', { refType: 'seller_transfer', refId: t.id });
    await c.q('UPDATE users SET first_recharge_done=true WHERE id=$1', [target.id]);
    return { transfer: t, user_balance: bal, seller_balance: s.balance - coins };
  });
  toUser(target.id, 'wallet:update', { coins: out.user_balance, recharged: coins });
  await audit(req, 'seller.transfer', 'user', target.id, { coins });
  res.json(out);
});

r.get('/seller/transfers', auth, async (req, res) => {
  const { limit, offset } = page(req, 50);
  res.json(await q(
    `SELECT t.*, u.uid, u.name FROM seller_transfers t LEFT JOIN users u ON u.id=t.to_user_id WHERE t.seller_id=$1 ORDER BY t.id DESC LIMIT $2 OFFSET $3`,
    [req.seller.user_id, limit, offset]));
});

export default r;

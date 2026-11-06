import { Router } from 'express';
import { one, q } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, str } from '../lib/util.js';

const r = Router();
// Banned users must reach this route: it is their only channel back.
const auth = userAuth({ allowBanned: true });
const PAYOUT_METHODS = ['upi', 'bank', 'bank_intl', 'paypal', 'payoneer', 'wise'];

function isBanned(u) {
  return u.status === 'banned' && (!u.ban_until || new Date(u.ban_until) > new Date());
}

// GET /api/appeal - ban state + this user's appeals (powers the /banned screen)
r.get('/appeal', auth, async (req, res) => {
  if (!isBanned(req.user)) return res.json({ banned: false });
  const appeals = await q(
    'SELECT id, status, note, created_at, decided_at FROM appeals WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]);
  res.json({
    banned: true,
    reason: req.user.ban_reason || null,
    banUntil: req.user.ban_until || null,
    wallet: { coins: Number(req.user.coins), diamonds: Number(req.user.diamonds) },
    appeals,
    payoutMethods: PAYOUT_METHODS,
  });
});

// POST /api/appeal - submit an appeal; one open appeal per user
r.post('/appeal', auth, async (req, res) => {
  need(isBanned(req.user), 'Account is not banned');
  const text = str(req.body.text, 2000);
  need(text.length >= 10, 'Tell us a little more (at least 10 characters)');
  const payoutMethod = req.body.payoutMethod ? str(req.body.payoutMethod, 20) : null;
  need(!payoutMethod || PAYOUT_METHODS.includes(payoutMethod), 'Choose a valid payout method');
  const payoutAccount = payoutMethod ? str(req.body.payoutAccount, 200) : null;
  const open = await one("SELECT id FROM appeals WHERE user_id=$1 AND status='open'", [req.user.id]);
  need(!open, 'You already have an appeal under review');
  const a = await one(
    `INSERT INTO appeals(user_id, text, payout_method, payout_account) VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
    [req.user.id, text, payoutMethod, payoutAccount]);
  res.json({ ok: true, appeal: a });
});

export default r;

import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { redis } from '../redis.js';
import { userAuth } from '../lib/auth.js';
import { need, int, str, bad, today } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { changeCoins, changeDiamonds } from '../lib/wallet.js';
import { config } from '../config.js';
import { sendGift } from '../services/gifts.js';
import { razorpayEnabled, razorpayCreateOrder, razorpayVerify, creditOrder } from '../services/recharge.js';

const r = Router();
const auth = userAuth();

// ---------- gifts ----------
r.get('/gifts', auth, async (req, res) => {
  const s = await getSettings();
  const rows = await q(
    `SELECT id, name, icon, anim_type, anim_url, price, category, vip_level FROM gifts
     WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
       AND (countries IS NULL OR cardinality(countries)=0 OR $1 = ANY(countries))
     ORDER BY sort, price`, [req.user.country]);
  res.json(rows.filter((g) => g.category !== 'lucky' || s.features.lucky_gift));
});

r.post('/gifts/send', auth, async (req, res) => {
  const b = req.body;
  const context = ['room', 'call', 'chat', 'moment'].includes(b.context) ? b.context : 'room';
  res.json(await sendGift({
    senderId: req.user.id, receiverId: int(b.receiver_id), giftId: int(b.gift_id), qty: int(b.qty, 1),
    context, roomId: b.room_id ? int(b.room_id) : null, momentId: b.moment_id ? int(b.moment_id) : null, callId: b.call_id ? int(b.call_id) : null,
  }));
});

// ---------- recharge ----------
r.get('/wallet', auth, async (req, res) => {
  const u = await one('SELECT coins, diamonds, first_recharge_done, referral_code FROM users WHERE id=$1', [req.user.id]);
  const s = await getSettings();
  res.json({ ...u, diamonds_per_unit: s.economy.diamonds_per_unit, currency: s.economy.currency, exchange_rate: s.economy.diamond_to_coin_rate, min_exchange: s.economy.min_exchange_diamonds });
});

r.get('/recharge/packages', auth, async (req, res) => {
  const platform = ['web', 'android', 'ios'].includes(req.query.platform) ? req.query.platform : 'web';
  const pk = await q(
    `SELECT id, coins, bonus, price, currency, first_bonus, product_id FROM recharge_packages
     WHERE active AND platform=$1 AND (country IS NULL OR country=$2) ORDER BY sort, price`, [platform, req.user.country]);
  const banners = await q(`SELECT id, title, image_url, color, link FROM banners WHERE active AND position='recharge' AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) ORDER BY sort`);
  res.json({ packages: pk, first_recharge: !req.user.first_recharge_done, gateway: razorpayEnabled() ? 'razorpay' : null, razorpay_key: config.razorpay.keyId || null, banners });
});

r.post('/recharge/order', auth, async (req, res) => {
  need(razorpayEnabled(), 'Online payment is not configured yet. Buy coins from an official coin seller.');
  const pkg = await one('SELECT * FROM recharge_packages WHERE id=$1 AND active', [int(req.body.package_id)]);
  need(pkg, 'Package not found');
  const coins = Number(pkg.coins) + Number(pkg.bonus);
  const order = await one(
    `INSERT INTO recharge_orders(user_id, package_id, amount, currency, coins, gateway) VALUES ($1,$2,$3,$4,$5,'razorpay') RETURNING *`,
    [req.user.id, pkg.id, pkg.price, pkg.currency, coins]);
  const rp = await razorpayCreateOrder(pkg.price, pkg.currency, `o_${order.id}`);
  await q('UPDATE recharge_orders SET gateway_order_id=$2 WHERE id=$1', [order.id, rp.id]);
  res.json({ order_id: order.id, razorpay_order_id: rp.id, amount: rp.amount, currency: rp.currency, key: config.razorpay.keyId, name: config.appName, prefill: { email: req.user.email || '', contact: req.user.phone || '' } });
});

r.post('/recharge/verify', auth, async (req, res) => {
  const o = await one('SELECT * FROM recharge_orders WHERE id=$1 AND user_id=$2', [int(req.body.order_id), req.user.id]);
  need(o, 'Order not found');
  need(razorpayVerify(o.gateway_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature), 'Payment verification failed');
  const done = await creditOrder(o.id, { paymentId: req.body.razorpay_payment_id });
  const u = await one('SELECT coins FROM users WHERE id=$1', [req.user.id]);
  res.json({ ok: true, credited: done?.coins || 0, coins: u.coins });
});

r.get('/recharge/orders', auth, async (req, res) => {
  res.json(await q('SELECT id, amount, currency, coins, gateway, status, created_at FROM recharge_orders WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]));
});

// ---------- diamonds -> coins ----------
r.post('/wallet/exchange', auth, async (req, res) => {
  const s = await getSettings();
  const d = int(req.body.diamonds);
  need(d >= s.economy.min_exchange_diamonds, `Minimum ${s.economy.min_exchange_diamonds} diamonds`);
  const coins = Math.floor(d * s.economy.diamond_to_coin_rate);
  const out = await tx(async (c) => {
    const dl = await changeDiamonds(c, req.user.id, -d, 'exchange');
    const cb = await changeCoins(c, req.user.id, coins, 'exchange', { note: `${d} diamonds` });
    return { diamonds: dl, coins: cb };
  });
  res.json(out);
});

// ---------- daily check-in ----------
r.get('/checkin', auth, async (req, res) => {
  const s = await getSettings();
  const u = await one('SELECT checkin_streak, last_checkin FROM users WHERE id=$1', [req.user.id]);
  const done = u.last_checkin && new Date(u.last_checkin).toISOString().slice(0, 10) === today();
  res.json({ rewards: s.checkin.rewards, streak: u.checkin_streak, done_today: !!done });
});

r.post('/checkin', auth, async (req, res) => {
  const s = await getSettings();
  const out = await tx(async (c) => {
    const u = await c.one(`SELECT checkin_streak, last_checkin, (last_checkin = CURRENT_DATE) AS today, (last_checkin = CURRENT_DATE - 1) AS yesterday FROM users WHERE id=$1 FOR UPDATE`, [req.user.id]);
    if (u.today) throw bad('Already checked in today');
    const streak = u.yesterday ? (u.checkin_streak % s.checkin.rewards.length) + 1 : 1;
    const reward = s.checkin.rewards[streak - 1] || 0;
    await c.q('UPDATE users SET checkin_streak=$2, last_checkin=CURRENT_DATE WHERE id=$1', [req.user.id, streak]);
    const bal = await changeCoins(c, req.user.id, reward, 'checkin', { note: `day ${streak}` });
    return { streak, reward, coins: bal };
  });
  res.json(out);
});

// ---------- watch ad for free coins ----------
// The APK shows an AdMob rewarded ad, then calls this. Daily limit + cooldown stop abuse.
r.post('/ads/reward', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.ad_rewards, 'Ad rewards are disabled');
  const cd = await redis.set(`adcd:${req.user.id}`, '1', 'EX', s.ads.cooldown_sec, 'NX');
  need(cd, `Wait ${s.ads.cooldown_sec} seconds between ads`);
  const n = (await one(`SELECT count(*)::int AS n FROM ad_rewards WHERE user_id=$1 AND created_at::date = CURRENT_DATE`, [req.user.id])).n;
  need(n < s.ads.daily_limit, `Daily limit reached (${s.ads.daily_limit})`);
  const bal = await tx(async (c) => {
    await c.q('INSERT INTO ad_rewards(user_id, coins) VALUES ($1,$2)', [req.user.id, s.ads.reward_coins]);
    return changeCoins(c, req.user.id, s.ads.reward_coins, 'ad_reward');
  });
  res.json({ reward: s.ads.reward_coins, coins: bal, left: s.ads.daily_limit - n - 1 });
});

r.get('/ads/status', auth, async (req, res) => {
  const s = await getSettings();
  const n = (await one(`SELECT count(*)::int AS n FROM ad_rewards WHERE user_id=$1 AND created_at::date = CURRENT_DATE`, [req.user.id])).n;
  res.json({ reward: s.ads.reward_coins, left: Math.max(0, s.ads.daily_limit - n), enabled: s.features.ad_rewards });
});

// ---------- lucky spin wheel (free daily spin, no stake) ----------
r.get('/spin', auth, async (req, res) => {
  const s = await getSettings();
  const n = (await one(`SELECT count(*)::int AS n FROM spins WHERE user_id=$1 AND created_at::date = CURRENT_DATE`, [req.user.id])).n;
  res.json({ prizes: s.spin.prizes.map((p) => ({ label: p.label, coins: p.coins })), left: Math.max(0, s.spin.free_per_day - n), enabled: s.features.spin_wheel });
});

r.post('/spin', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.spin_wheel, 'Spin is disabled');
  const n = (await one(`SELECT count(*)::int AS n FROM spins WHERE user_id=$1 AND created_at::date = CURRENT_DATE`, [req.user.id])).n;
  need(n < s.spin.free_per_day, 'No spins left today');
  const total = s.spin.prizes.reduce((a, p) => a + p.weight, 0);
  let x = Math.random() * total;
  let idx = 0;
  for (let i = 0; i < s.spin.prizes.length; i++) { x -= s.spin.prizes[i].weight; if (x <= 0) { idx = i; break; } }
  const prize = s.spin.prizes[idx];
  const bal = await tx(async (c) => {
    await c.q('INSERT INTO spins(user_id, prize, coins) VALUES ($1,$2,$3)', [req.user.id, prize.label, prize.coins]);
    return prize.coins > 0 ? changeCoins(c, req.user.id, prize.coins, 'spin') : (await c.one('SELECT coins FROM users WHERE id=$1', [req.user.id])).coins;
  });
  res.json({ index: idx, prize: { label: prize.label, coins: prize.coins }, coins: bal });
});

// ---------- daily tasks ----------
r.get('/tasks', auth, async (req, res) => {
  res.json(await q(
    `SELECT t.key, t.title, t.metric, t.target, t.reward_coins, coalesce(p.progress,0) AS progress, coalesce(p.claimed,false) AS claimed
     FROM tasks t LEFT JOIN task_progress p ON p.task_key=t.key AND p.user_id=$1 AND p.day=CURRENT_DATE
     WHERE t.active AND (NOT t.for_hosts OR $2) ORDER BY t.sort`, [req.user.id, req.user.is_host]));
});

r.post('/tasks/:key/claim', auth, async (req, res) => {
  const out = await tx(async (c) => {
    const t = await c.one(
      `SELECT t.reward_coins, t.target, p.progress, p.claimed FROM tasks t JOIN task_progress p ON p.task_key=t.key
       WHERE t.key=$1 AND p.user_id=$2 AND p.day=CURRENT_DATE FOR UPDATE OF p`, [str(req.params.key, 40), req.user.id]);
    need(t && t.progress >= t.target, 'Task not completed yet');
    need(!t.claimed, 'Already claimed');
    await c.q('UPDATE task_progress SET claimed=true WHERE user_id=$1 AND task_key=$2 AND day=CURRENT_DATE', [req.user.id, req.params.key]);
    return { reward: t.reward_coins, coins: await changeCoins(c, req.user.id, t.reward_coins, 'task', { note: req.params.key }) };
  });
  res.json(out);
});

// ---------- referral ----------
r.get('/referral', auth, async (req, res) => {
  const s = await getSettings();
  const stats = await one(
    `SELECT count(*)::int AS invited, coalesce(sum(CASE WHEN first_recharge_done THEN 1 ELSE 0 END),0)::int AS paying FROM users WHERE referred_by=$1`, [req.user.id]);
  const earned = await one(`SELECT coalesce(sum(amount),0)::bigint AS coins FROM ledger WHERE user_id=$1 AND type='referral_reward'`, [req.user.id]);
  res.json({ code: req.user.referral_code, link: `${config.publicAppUrl}/?ref=${req.user.referral_code}`, pct: s.economy.referral_recharge_pct, ...stats, earned: earned.coins });
});

export default r;

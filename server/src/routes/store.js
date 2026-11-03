import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, int, notFound } from '../lib/util.js';
import { changeCoins } from '../lib/wallet.js';
import { invalidateProfile } from '../services/profile.js';
import { meView } from '../services/users.js';
import { toAll } from '../lib/io.js';
import { miniProfile } from '../services/profile.js';

const r = Router();
const auth = userAuth();

// ---------- VIP ----------
r.get('/vip', auth, async (req, res) => {
  res.json({ levels: await q('SELECT * FROM vip_levels ORDER BY level'), current: req.user.vip_level, expires: req.user.vip_expires });
});

r.post('/vip/buy', auth, async (req, res) => {
  const v = await one('SELECT * FROM vip_levels WHERE level=$1', [int(req.body.level)]);
  if (!v) throw notFound('VIP level not found');
  await tx(async (c) => {
    const u = await c.one('SELECT vip_level, vip_expires FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const active = u.vip_expires && new Date(u.vip_expires) > new Date();
    if (active) need(v.level >= u.vip_level, 'You already have a higher VIP');
    await changeCoins(c, req.user.id, -v.price, 'vip', { refType: 'vip', refId: v.level, note: v.name });
    // same level = extend, higher level = upgrade starting now
    const base = active && v.level === u.vip_level ? 'vip_expires' : 'now()';
    await c.q(`UPDATE users SET vip_level=$2, vip_expires = ${base} + make_interval(days => $3) WHERE id=$1`, [req.user.id, v.level, v.duration_days]);
  });
  invalidateProfile(req.user.id);
  res.json(await meView(req.user.id));
});

// ---------- Noble ----------
r.get('/noble', auth, async (req, res) => {
  res.json({ ranks: await q('SELECT * FROM noble_ranks ORDER BY rank'), current: req.user.noble_rank, expires: req.user.noble_expires });
});

r.post('/noble/buy', auth, async (req, res) => {
  const n = await one('SELECT * FROM noble_ranks WHERE rank=$1', [int(req.body.rank)]);
  if (!n) throw notFound('Noble rank not found');
  await tx(async (c) => {
    const u = await c.one('SELECT noble_rank, noble_expires FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const active = u.noble_expires && new Date(u.noble_expires) > new Date();
    if (active) need(n.rank >= u.noble_rank, 'You already have a higher noble rank');
    await changeCoins(c, req.user.id, -n.price, 'noble', { refType: 'noble', refId: n.rank, note: n.name });
    const base = active && n.rank === u.noble_rank ? 'noble_expires' : 'now()';
    await c.q(`UPDATE users SET noble_rank=$2, noble_expires = ${base} + make_interval(days => $3) WHERE id=$1`, [req.user.id, n.rank, n.duration_days]);
    if (n.cashback > 0) await changeCoins(c, req.user.id, n.cashback, 'noble_cashback', { note: n.name });
  });
  invalidateProfile(req.user.id);
  if (n.rank >= 4) toAll('global:banner', { kind: 'noble', user: await miniProfile(req.user.id), noble: n.name });
  res.json(await meView(req.user.id));
});

// ---------- Store items (frames, mounts/cars, chat bubbles, entry effects, badges) ----------
r.get('/store', auth, async (req, res) => {
  const type = req.query.type;
  res.json(await q(`SELECT * FROM store_items WHERE active ${type ? 'AND type=$1' : ''} ORDER BY type, sort, price`, type ? [type] : []));
});

r.post('/store/buy', auth, async (req, res) => {
  const item = await one('SELECT * FROM store_items WHERE id=$1 AND active', [int(req.body.item_id)]);
  if (!item) throw notFound('Item not found');
  const vip = req.user.vip_expires && new Date(req.user.vip_expires) > new Date() ? req.user.vip_level : 0;
  need(vip >= item.vip_level, `VIP ${item.vip_level} required`);
  const giftTo = req.body.to_user_id ? int(req.body.to_user_id) : req.user.id;
  await tx(async (c) => {
    await changeCoins(c, req.user.id, -item.price, 'store', { refType: 'item', refId: item.id, note: item.name });
    const owned = await c.one('SELECT id, expires_at FROM user_items WHERE user_id=$1 AND item_id=$2 AND (expires_at IS NULL OR expires_at > now())', [giftTo, item.id]);
    if (owned) {
      await c.q('UPDATE user_items SET expires_at = expires_at + make_interval(days => $2) WHERE id=$1', [owned.id, item.duration_days]);
    } else {
      await c.q(`UPDATE user_items SET equipped=false WHERE user_id=$1 AND item_id IN (SELECT id FROM store_items WHERE type=$2)`, [giftTo, item.type]);
      await c.q(`INSERT INTO user_items(user_id, item_id, expires_at, equipped, source) VALUES ($1,$2, now() + make_interval(days => $3), true, $4)`,
        [giftTo, item.id, item.duration_days, giftTo === req.user.id ? 'purchase' : 'gift']);
    }
  });
  invalidateProfile(giftTo);
  res.json(await meView(req.user.id));
});

r.post('/store/equip', auth, async (req, res) => {
  const ui = await one(
    `SELECT ui.*, s.type FROM user_items ui JOIN store_items s ON s.id=ui.item_id WHERE ui.id=$1 AND ui.user_id=$2`, [int(req.body.user_item_id), req.user.id]);
  need(ui, 'Item not found');
  await q(`UPDATE user_items SET equipped=false WHERE user_id=$1 AND item_id IN (SELECT id FROM store_items WHERE type=$2)`, [req.user.id, ui.type]);
  if (req.body.equip !== false) await q('UPDATE user_items SET equipped=true WHERE id=$1', [ui.id]);
  invalidateProfile(req.user.id);
  res.json(await meView(req.user.id));
});

// ---------- Fancy / pretty IDs ----------
r.get('/fancy-ids', auth, async (req, res) => {
  res.json(await q(`SELECT id, number, price FROM fancy_ids WHERE status='available' ORDER BY price DESC LIMIT 200`));
});

r.post('/fancy-ids/buy', auth, async (req, res) => {
  await tx(async (c) => {
    const f = await c.one(`SELECT * FROM fancy_ids WHERE id=$1 AND status='available' FOR UPDATE`, [int(req.body.id)]);
    need(f, 'This ID is no longer available');
    need(!(await c.one('SELECT 1 FROM users WHERE fancy_id=$1', [f.number])), 'Already taken');
    await changeCoins(c, req.user.id, -f.price, 'fancy_id', { refType: 'fancy_id', refId: f.id, note: f.number });
    await c.q(`UPDATE fancy_ids SET status='sold', owner_id=$2, sold_at=now() WHERE id=$1`, [f.id, req.user.id]);
    await c.q('UPDATE users SET fancy_id=$2 WHERE id=$1', [req.user.id, f.number]);
  });
  invalidateProfile(req.user.id);
  res.json(await meView(req.user.id));
});

export default r;

import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { adminAuth } from '../lib/auth.js';
import { crud } from '../lib/crud.js';
import { need, str, int, notFound, page } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { changeCoins } from '../lib/wallet.js';
import { pushToTokens } from '../lib/push.js';
import { toAll, toUser } from '../lib/io.js';
import { eventBoard, ranking } from '../services/rankings.js';
import { miniProfile, invalidateProfile } from '../services/profile.js';
import { redis } from '../redis.js';

const r = Router();
const clearRank = () => redis.keys('rank:*').then((k) => k.length && redis.del(...k));

// ---------- simple config tables ----------
crud(r, 'gifts', 'gifts', {
  module: 'gifts', order: 'sort, price',
  cols: { name: 'text', icon: 'text', anim_type: 'text', anim_url: 'text', price: 'int', host_pct: 'num', category: 'text', vip_level: 'int', countries: 'array', starts_at: 'date', ends_at: 'date', active: 'bool', sort: 'int' },
  files: { anim_url: ['anim'] },
});
crud(r, 'store-items', 'store_items', {
  module: 'store', order: 'type, sort, price',
  cols: { type: 'text', name: 'text', preview: 'text', anim_url: 'text', price: 'int', duration_days: 'int', vip_level: 'int', active: 'bool', sort: 'int' },
  files: { anim_url: ['anim'] },
});
crud(r, 'vip-levels', 'vip_levels', { pk: 'level', module: 'store', order: 'level', cols: { level: 'int', name: 'text', price: 'int', duration_days: 'int', perks: 'json' } });
crud(r, 'noble-ranks', 'noble_ranks', { pk: 'rank', module: 'store', order: 'rank', cols: { rank: 'int', name: 'text', price: 'int', duration_days: 'int', cashback: 'int', perks: 'json' } });
crud(r, 'fancy-ids', 'fancy_ids', { module: 'store', order: 'price DESC', cols: { number: 'text', price: 'int', status: 'text' } });
crud(r, 'banners', 'banners', {
  module: 'banners', order: 'position, sort, id DESC',
  cols: { title: 'text', image_url: 'text', color: 'text', link: 'text', position: 'text', countries: 'array', starts_at: 'date', ends_at: 'date', active: 'bool', sort: 'int' },
  files: { image_url: ['image'] },
});
crud(r, 'events', 'events', {
  module: 'events', order: 'starts_at DESC',
  cols: { title: 'text', type: 'text', description: 'text', banner_url: 'text', gift_id: 'int', countries: 'array', starts_at: 'date', ends_at: 'date', rewards: 'json', active: 'bool' },
  files: { banner_url: ['image'] },
});
crud(r, 'tasks', 'tasks', { pk: 'key', module: 'tasks', order: 'sort', cols: { key: 'text', title: 'text', metric: 'text', target: 'int', reward_coins: 'int', for_hosts: 'bool', active: 'bool', sort: 'int' } });
crud(r, 'packages', 'recharge_packages', {
  module: 'economy', order: 'platform, sort, price',
  cols: { coins: 'int', bonus: 'int', price: 'num', currency: 'text', platform: 'text', country: 'text', first_bonus: 'int', product_id: 'text', active: 'bool', sort: 'int' },
});
crud(r, 'host-levels', 'host_levels', {
  pk: 'code', module: 'hosts', order: 'min_diamonds',
  cols: { code: 'text', name: 'text', min_diamonds: 'int', min_hours: 'int', min_days: 'int', bonus_amount: 'num', max_call_rate: 'int', sort: 'int' },
});
crud(r, 'cms', 'cms_pages', { pk: 'slug', module: 'cms', order: 'slug', cols: { slug: 'text', title: 'text', body: 'text' } });

// ---------- push / in-app notifications (segmented) ----------
r.post('/admin/notifications', adminAuth('notifications'), async (req, res) => {
  const title = str(req.body.title, 100);
  const body = str(req.body.body, 500);
  need(title && body, 'Title and message required');
  const seg = req.body.segment && typeof req.body.segment === 'object' && !Array.isArray(req.body.segment) ? req.body.segment : {};
  const params = [];
  let where = `status='active'`;
  if (seg.uid) { params.push(int(seg.uid)); where += ` AND uid=$${params.length}`; }
  if (seg.country) { params.push(seg.country); where += ` AND country=$${params.length}`; }
  if (seg.min_level) { params.push(100 * int(seg.min_level) ** 2); where += ` AND total_spent >= $${params.length}`; }
  if (seg.payer === 'yes') where += ` AND first_recharge_done`;
  if (seg.payer === 'no') where += ` AND NOT first_recharge_done`;
  if (seg.hosts) where += ` AND is_host`;
  if (seg.inactive_days) { params.push(int(seg.inactive_days)); where += ` AND (last_login IS NULL OR last_login < now() - make_interval(days => $${params.length}))`; }
  const broadcast = !Object.keys(seg).filter((k) => seg[k]).length;
  const targets = broadcast ? [] : await q(`SELECT id, fcm_token FROM users WHERE ${where} LIMIT 200000`, params);
  if (broadcast) {
    await q(`INSERT INTO notifications(user_id, title, body, link, segment, created_by) VALUES (NULL,$1,$2,$3,$4,$5)`, [title, body, str(req.body.link, 200) || null, seg, req.admin.id]);
    toAll('notify', { type: 'system', title, text: body });
  } else {
    for (const t of targets) {
      await q(`INSERT INTO notifications(user_id, title, body, link, segment, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [t.id, title, body, str(req.body.link, 200) || null, seg, req.admin.id]);
      toUser(t.id, 'notify', { type: 'system', title, text: body });
    }
  }
  let pushed = 0;
  if (req.body.push) {
    const tokens = broadcast ? (await q(`SELECT fcm_token FROM users WHERE status='active' AND fcm_token IS NOT NULL`)).map((x) => x.fcm_token) : targets.map((t) => t.fcm_token).filter(Boolean);
    pushed = await pushToTokens(tokens, title, body, { link: req.body.link || '' });
  }
  await audit(req, 'notification.send', 'segment', null, { title, seg, count: broadcast ? 'all' : targets.length });
  res.json({ ok: true, recipients: broadcast ? 'all users' : targets.length, pushed });
});

r.get('/admin/notifications', adminAuth('notifications'), async (_req, res) => {
  res.json(await q(`SELECT n.*, a.email AS by_email FROM notifications n LEFT JOIN admin_users a ON a.id=n.created_by WHERE n.created_by IS NOT NULL ORDER BY n.id DESC LIMIT 200`));
});

// ---------- events: leaderboard + reward distribution ----------
r.get('/admin/events/:id/board', adminAuth('events'), async (req, res) => {
  const ev = await one('SELECT * FROM events WHERE id=$1', [int(req.params.id)]);
  if (!ev) throw notFound();
  res.json(await eventBoard(ev, 100));
});

r.post('/admin/events/:id/distribute', adminAuth('events'), async (req, res) => {
  const ev = await one('SELECT * FROM events WHERE id=$1', [int(req.params.id)]);
  if (!ev) throw notFound();
  need(!ev.rewarded, 'Rewards already distributed');
  need(new Date(ev.ends_at) < new Date(), 'Event has not ended yet');
  const board = await eventBoard(ev, 100);
  const rewards = Array.isArray(ev.rewards) ? ev.rewards : [];
  let paid = 0;
  await tx(async (c) => {
    const locked = await c.one('UPDATE events SET rewarded=true WHERE id=$1 AND NOT rewarded RETURNING id', [ev.id]);
    need(locked, 'Already distributed');
    for (const row of board) {
      const rw = rewards.find((x) => row.rank >= int(x.rank_from) && row.rank <= int(x.rank_to));
      if (!rw) continue;
      if (int(rw.coins) > 0) await changeCoins(c, row.user.id, int(rw.coins), 'event_reward', { refType: 'event', refId: ev.id, note: `${ev.title} #${row.rank}` });
      if (int(rw.item_id) > 0) await c.q(`INSERT INTO user_items(user_id, item_id, expires_at, source) VALUES ($1,$2, now() + make_interval(days => $3), 'event')`, [row.user.id, int(rw.item_id), int(rw.item_days, 7)]);
      await c.q(`INSERT INTO notifications(user_id, title, body) VALUES ($1,$2,$3)`, [row.user.id, `🏆 ${ev.title}`, `You ranked #${row.rank}! Your reward has been added.`]);
      paid++;
    }
  });
  await audit(req, 'event.distribute', 'event', ev.id, { paid });
  res.json({ ok: true, rewarded: paid });
});

// ---------- moments moderation ----------
r.get('/admin/moments', adminAuth('moments'), async (req, res) => {
  const { limit, offset } = page(req, 50);
  const rows = await q(`SELECT * FROM moments WHERE ($1::text IS NULL OR status=$1) ORDER BY id DESC LIMIT $2 OFFSET $3`, [req.query.status || null, limit, offset]);
  for (const m of rows) m.user = await miniProfile(m.user_id);
  res.json(rows);
});

r.post('/admin/moments/:id', adminAuth('moments'), async (req, res) => {
  const status = ['visible', 'hidden', 'deleted'].includes(req.body.status) ? req.body.status : 'hidden';
  await q('UPDATE moments SET status=$2 WHERE id=$1', [int(req.params.id), status]);
  await audit(req, 'moment.' + status, 'moment', req.params.id);
  res.json({ ok: true });
});

// ---------- rankings: exclude cheaters (tags 'test') + clear cache ----------
r.post('/admin/rankings/exclude', adminAuth('rankings'), async (req, res) => {
  const uid = int(req.body.user_id);
  await q(`UPDATE users SET tags = array_append(array_remove(tags,'test'),'test') WHERE id=$1`, [uid]);
  invalidateProfile(uid);
  await clearRank();
  await audit(req, 'ranking.exclude', 'user', uid);
  res.json({ ok: true });
});

r.get('/admin/rankings', adminAuth('rankings'), async (req, res) => {
  res.json(await ranking(req.query.type || 'rich', req.query.period || 'daily', req.query.country || null, 100));
});

r.post('/admin/rankings/refresh', adminAuth('rankings'), async (_req, res) => {
  await clearRank();
  res.json({ ok: true });
});

// ---------- global announcement banner (all live rooms) ----------
r.post('/admin/broadcast', adminAuth('notifications'), async (req, res) => {
  const text = str(req.body.text, 200);
  need(text, 'Text required');
  toAll('global:banner', { kind: 'system', text });
  await audit(req, 'broadcast', null, null, { text });
  res.json({ ok: true });
});

export default r;

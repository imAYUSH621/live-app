import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, int, str, page, notFound, forbidden } from '../lib/util.js';
import { uploader, fileUrl } from '../lib/upload.js';
import { filterText } from '../lib/moderation.js';
import { getSettings } from '../lib/settings.js';
import { changeCoins } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';
import { pushToUser } from '../lib/push.js';
import { config } from '../config.js';
import { miniProfile } from '../services/profile.js';
import { bumpTask } from '../services/tasks.js';
import { withLevels } from '../lib/levels.js';

const r = Router();
const auth = userAuth();

// ================= MOMENTS (feed) =================
r.get('/moments', auth, async (req, res) => {
  const { limit, offset } = page(req, 20);
  const tab = req.query.tab || 'latest';
  const params = [req.user.id, limit, offset];
  let where = `m.status='visible' AND m.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$1)`;
  if (tab === 'following') where += ` AND m.user_id IN (SELECT followee_id FROM follows WHERE follower_id=$1)`;
  if (tab === 'nearby') { params.push(req.user.country); where += ` AND m.country=$4`; }
  if (req.query.user_id) { params.push(int(req.query.user_id)); where += ` AND m.user_id=$${params.length}`; }
  const rows = await q(
    `SELECT m.*, EXISTS(SELECT 1 FROM moment_likes l WHERE l.moment_id=m.id AND l.user_id=$1) AS liked
     FROM moments m WHERE ${where} ORDER BY ${tab === 'hot' ? '(m.likes + m.comments*2 + m.gifts_coins/10) DESC,' : ''} m.id DESC LIMIT $2 OFFSET $3`, params);
  for (const m of rows) m.user = await miniProfile(m.user_id);
  res.json(rows);
});

r.post('/moments', auth, uploader(['image', 'video']).single('media'), async (req, res) => {
  const s = await getSettings();
  need(s.features.moments, 'Moments are disabled');
  const body = (await filterText(str(req.body.body, 1000))).text;
  need(body || req.file, 'Write something or add a photo/video');
  const mediaType = req.file ? (/\.(mp4|webm|mov)$/i.test(req.file.originalname) ? 'video' : 'image') : null;
  const m = await one(`INSERT INTO moments(user_id, body, media_url, media_type, country) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.id, body, req.file ? fileUrl(req.file) : null, mediaType, req.user.country]);
  bumpTask(req.user.id, 'post_moment', 1);
  res.json({ ...m, user: await miniProfile(req.user.id) });
});

r.delete('/moments/:id', auth, async (req, res) => {
  await q(`UPDATE moments SET status='deleted' WHERE id=$1 AND user_id=$2`, [int(req.params.id), req.user.id]);
  res.json({ ok: true });
});

r.post('/moments/:id/like', auth, async (req, res) => {
  const id = int(req.params.id);
  const ins = await q('INSERT INTO moment_likes(moment_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [id, req.user.id]);
  if (ins.length) {
    const m = await one('UPDATE moments SET likes = likes + 1 WHERE id=$1 RETURNING user_id, likes', [id]);
    if (m && m.user_id !== req.user.id) toUser(m.user_id, 'notify', { type: 'moment_like', moment_id: id, from: await miniProfile(req.user.id) });
    return res.json({ liked: true, likes: m?.likes });
  }
  const del = await q('DELETE FROM moment_likes WHERE moment_id=$1 AND user_id=$2 RETURNING 1', [id, req.user.id]);
  const m = await one(`UPDATE moments SET likes = GREATEST(0, likes - $2) WHERE id=$1 RETURNING likes`, [id, del.length]);
  res.json({ liked: false, likes: m?.likes });
});

r.get('/moments/:id/comments', auth, async (req, res) => {
  const rows = await q('SELECT * FROM moment_comments WHERE moment_id=$1 ORDER BY id DESC LIMIT 200', [int(req.params.id)]);
  for (const c of rows) c.user = await miniProfile(c.user_id);
  res.json(rows);
});

r.post('/moments/:id/comments', auth, async (req, res) => {
  const id = int(req.params.id);
  const body = (await filterText(str(req.body.body, 500))).text;
  need(body, 'Empty comment');
  const m = await one(`SELECT user_id FROM moments WHERE id=$1 AND status='visible'`, [id]);
  if (!m) throw notFound('Post not found');
  const c = await one('INSERT INTO moment_comments(moment_id, user_id, body) VALUES ($1,$2,$3) RETURNING *', [id, req.user.id, body]);
  await q('UPDATE moments SET comments = comments + 1 WHERE id=$1', [id]);
  if (m.user_id !== req.user.id) toUser(m.user_id, 'notify', { type: 'moment_comment', moment_id: id, text: body, from: await miniProfile(req.user.id) });
  res.json({ ...c, user: await miniProfile(req.user.id) });
});

// ================= DIRECT MESSAGES =================
r.get('/chats', auth, async (req, res) => {
  const rows = await q(
    `SELECT DISTINCT ON (other) other, id, from_id, kind, body, created_at,
       (SELECT count(*)::int FROM messages x WHERE x.from_id = other AND x.to_id=$1 AND x.read_at IS NULL) AS unread
     FROM (SELECT *, CASE WHEN from_id=$1 THEN to_id ELSE from_id END AS other FROM messages WHERE from_id=$1 OR to_id=$1) t
     ORDER BY other, id DESC`, [req.user.id]);
  rows.sort((a, b) => b.id - a.id);
  for (const c of rows) c.user = await miniProfile(c.other);
  res.json(rows.slice(0, 100));
});

r.get('/chats/:userId', auth, async (req, res) => {
  const other = int(req.params.userId);
  const before = int(req.query.before, 0);
  const rows = await q(
    `SELECT m.*, g.icon AS gift_icon FROM messages m LEFT JOIN gifts g ON g.id=m.gift_id
     WHERE ((m.from_id=$1 AND m.to_id=$2) OR (m.from_id=$2 AND m.to_id=$1)) ${before ? 'AND m.id < $3' : ''}
     ORDER BY m.id DESC LIMIT 50`, before ? [req.user.id, other, before] : [req.user.id, other]);
  await q('UPDATE messages SET read_at=now() WHERE from_id=$2 AND to_id=$1 AND read_at IS NULL', [req.user.id, other]);
  res.json({ user: await miniProfile(other), messages: rows.reverse() });
});

async function sendDm(req, kind, body, mediaUrl) {
  const s = await getSettings();
  need(s.features.dm, 'Messages are disabled');
  const to = int(req.params.userId);
  need(to !== req.user.id, 'Invalid');
  const target = await one('SELECT id, status, fcm_token FROM users WHERE id=$1', [to]);
  if (!target || target.status !== 'active') throw notFound('User not found');
  if (await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [to, req.user.id])) throw forbidden('You cannot message this user');
  const sentToday = (await one(`SELECT count(*)::int AS n FROM messages WHERE from_id=$1 AND created_at::date=CURRENT_DATE`, [req.user.id])).n;
  if (s.economy.paid_message_coins > 0 && sentToday >= s.economy.free_messages_per_day) {
    await tx((c) => changeCoins(c, req.user.id, -s.economy.paid_message_coins, 'paid_message'));
  }
  const m = await one(`INSERT INTO messages(from_id, to_id, kind, body, media_url) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.user.id, to, kind, body, mediaUrl]);
  const from = await miniProfile(req.user.id);
  toUser(to, 'dm:new', { message: m, from });
  toUser(req.user.id, 'dm:sent', { message: m });
  bumpTask(req.user.id, 'chat', 1);
  pushToUser(to, from.name, kind === 'text' ? body.slice(0, 80) : `[${kind}]`, { chat: req.user.id }).catch(() => {});
  return m;
}

r.post('/chats/:userId', auth, async (req, res) => {
  const body = (await filterText(str(req.body.body, 1000))).text;
  need(body, 'Empty message');
  res.json(await sendDm(req, req.body.kind === 'sticker' ? 'sticker' : 'text', body, null));
});

r.post('/chats/:userId/media', auth, uploader(['image', 'audio']).single('file'), async (req, res) => {
  need(req.file, 'No file');
  const kind = /\.(m4a|mp3|ogg|aac|wav|webm)$/i.test(req.file.originalname) ? 'voice' : 'image';
  res.json(await sendDm(req, kind, '', fileUrl(req.file)));
});

r.post('/translate', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.translate && config.translateUrl, 'Translation is not enabled');
  const resp = await fetch(`${config.translateUrl.replace(/\/$/, '')}/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: str(req.body.text, 1000), source: 'auto', target: str(req.body.target, 5) || req.user.language || 'en', format: 'text' }),
  });
  const j = await resp.json();
  res.json({ text: j.translatedText || '' });
});

// ================= FAMILIES (clans) =================
r.get('/families', auth, async (req, res) => {
  const s = str(req.query.q, 30);
  res.json(await q(
    `SELECT f.*, (SELECT count(*)::int FROM family_members m WHERE m.family_id=f.id AND m.role<>'pending') AS members
     FROM families f WHERE f.status='active' ${s ? 'AND f.name ILIKE $1' : ''} ORDER BY f.exp DESC LIMIT 100`, s ? [`%${s}%`] : []));
});

r.get('/families/:id', auth, async (req, res) => {
  const f = await one('SELECT * FROM families WHERE id=$1', [int(req.params.id)]);
  if (!f) throw notFound('Family not found');
  const members = await q(`SELECT m.user_id, m.role, m.joined_at FROM family_members m WHERE m.family_id=$1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'elder' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, m.joined_at`, [f.id]);
  for (const m of members) m.user = await miniProfile(m.user_id);
  const monthly = await one(
    `SELECT coalesce(sum(t.coins),0)::bigint AS coins FROM gift_transactions t JOIN users u ON u.id=t.sender_id
     WHERE u.family_id=$1 AND t.created_at >= date_trunc('month', now())`, [f.id]);
  res.json({ ...f, members, month_coins: monthly.coins, my_role: members.find((m) => m.user_id === req.user.id)?.role || null });
});

r.post('/families', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.families, 'Families are disabled');
  need(!req.user.family_id, 'Leave your current family first');
  const name = (await filterText(str(req.body.name, 20))).text;
  need(name.length >= 2, 'Family name too short');
  const cost = s.economy.family_create_coins ?? 0;
  const f = await tx(async (c) => {
    if (cost > 0) await changeCoins(c, req.user.id, -cost, 'family_create');
    const fam = await c.one(`INSERT INTO families(name, badge, owner_id, notice, join_mode) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, str(req.body.badge, 4) || '🔥', req.user.id, str(req.body.notice, 300), req.body.join_mode === 'approval' ? 'approval' : 'open']);
    await c.q(`INSERT INTO family_members(family_id, user_id, role) VALUES ($1,$2,'owner')`, [fam.id, req.user.id]);
    await c.q('UPDATE users SET family_id=$2 WHERE id=$1', [req.user.id, fam.id]);
    return fam;
  });
  (await import('../services/profile.js')).invalidateProfile(req.user.id);
  res.json(f);
});

r.post('/families/:id/join', auth, async (req, res) => {
  need(!req.user.family_id, 'Leave your current family first');
  const f = await one(`SELECT f.*, (SELECT count(*)::int FROM family_members m WHERE m.family_id=f.id AND m.role<>'pending') AS n FROM families f WHERE id=$1 AND status='active'`, [int(req.params.id)]);
  if (!f) throw notFound('Family not found');
  need(f.n < f.max_members, 'Family is full');
  const role = f.join_mode === 'approval' ? 'pending' : 'member';
  await q(`INSERT INTO family_members(family_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [f.id, req.user.id, role]);
  if (role === 'member') await q('UPDATE users SET family_id=$2 WHERE id=$1', [req.user.id, f.id]);
  else toUser(f.owner_id, 'notify', { type: 'family_request', family_id: f.id, from: await miniProfile(req.user.id) });
  (await import('../services/profile.js')).invalidateProfile(req.user.id);
  res.json({ status: role });
});

r.post('/families/:id/members/:userId', auth, async (req, res) => {
  const fid = int(req.params.id);
  const uid = int(req.params.userId);
  const me = await one(`SELECT role FROM family_members WHERE family_id=$1 AND user_id=$2`, [fid, req.user.id]);
  need(me && ['owner', 'elder'].includes(me.role), 'Only owner/elders can manage members');
  const action = req.body.action;
  if (action === 'approve') {
    await q(`UPDATE family_members SET role='member' WHERE family_id=$1 AND user_id=$2 AND role='pending'`, [fid, uid]);
    await q('UPDATE users SET family_id=$2 WHERE id=$1 AND family_id IS NULL', [uid, fid]);
  } else if (action === 'remove' || action === 'reject') {
    need(uid !== req.user.id, 'Use leave instead');
    await q(`DELETE FROM family_members WHERE family_id=$1 AND user_id=$2 AND role<>'owner'`, [fid, uid]);
    await q('UPDATE users SET family_id=NULL WHERE id=$1 AND family_id=$2', [uid, fid]);
  } else if (action === 'elder' || action === 'member') {
    need(me.role === 'owner', 'Only the owner can change roles');
    await q(`UPDATE family_members SET role=$3 WHERE family_id=$1 AND user_id=$2 AND role IN ('member','elder')`, [fid, uid, action]);
  }
  (await import('../services/profile.js')).invalidateProfile(uid);
  res.json({ ok: true });
});

r.patch('/families/:id', auth, async (req, res) => {
  const f = await one('SELECT * FROM families WHERE id=$1 AND owner_id=$2', [int(req.params.id), req.user.id]);
  need(f, 'Only the owner can edit');
  await q('UPDATE families SET notice=coalesce($2, notice), badge=coalesce($3, badge), join_mode=coalesce($4, join_mode) WHERE id=$1',
    [f.id, req.body.notice !== undefined ? (await filterText(str(req.body.notice, 300))).text : null, req.body.badge ? str(req.body.badge, 4) : null,
     ['open', 'approval'].includes(req.body.join_mode) ? req.body.join_mode : null]);
  res.json({ ok: true });
});

r.post('/families/leave', auth, async (req, res) => {
  need(req.user.family_id, 'You are not in a family');
  const f = await one('SELECT owner_id FROM families WHERE id=$1', [req.user.family_id]);
  if (f?.owner_id === req.user.id) {
    const next = await one(`SELECT user_id FROM family_members WHERE family_id=$1 AND user_id<>$2 AND role IN ('elder','member') ORDER BY role='elder' DESC, joined_at LIMIT 1`, [req.user.family_id, req.user.id]);
    if (next) {
      await q(`UPDATE families SET owner_id=$2 WHERE id=$1`, [req.user.family_id, next.user_id]);
      await q(`UPDATE family_members SET role='owner' WHERE family_id=$1 AND user_id=$2`, [req.user.family_id, next.user_id]);
    } else {
      await q(`UPDATE families SET status='disbanded' WHERE id=$1`, [req.user.family_id]);
    }
  }
  await q('DELETE FROM family_members WHERE family_id=$1 AND user_id=$2', [req.user.family_id, req.user.id]);
  await q('UPDATE users SET family_id=NULL WHERE id=$1', [req.user.id]);
  (await import('../services/profile.js')).invalidateProfile(req.user.id);
  res.json({ ok: true });
});

r.get('/families/:id/messages', auth, async (req, res) => {
  const fid = int(req.params.id);
  need(req.user.family_id === fid, 'Join the family to see its chat');
  const rows = await q('SELECT * FROM family_messages WHERE family_id=$1 ORDER BY id DESC LIMIT 100', [fid]);
  for (const m of rows) m.user = await miniProfile(m.user_id);
  res.json(rows.reverse());
});

r.post('/families/:id/messages', auth, async (req, res) => {
  const fid = int(req.params.id);
  need(req.user.family_id === fid, 'Join the family first');
  const body = (await filterText(str(req.body.body, 500))).text;
  need(body, 'Empty message');
  const m = await one('INSERT INTO family_messages(family_id, user_id, body) VALUES ($1,$2,$3) RETURNING *', [fid, req.user.id, body]);
  const out = { ...m, user: await miniProfile(req.user.id) };
  (await import('../lib/io.js')).toFamily(fid, 'family:message', out);
  res.json(out);
});

export default r;

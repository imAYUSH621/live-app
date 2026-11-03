import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { bad, need, str, int, page, notFound, PUBLIC_USER_COLS } from '../lib/util.js';
import { uploader, fileUrl } from '../lib/upload.js';
import { withLevels } from '../lib/levels.js';
import { meView } from '../services/users.js';
import { invalidateProfile, miniProfile } from '../services/profile.js';
import { hostRoom, isOnline } from '../services/roomstate.js';
import { filterText, autoReport } from '../lib/moderation.js';
import { getSetting } from '../lib/settings.js';
import { bumpTask } from '../services/tasks.js';
import { toUser } from '../lib/io.js';

const r = Router();
const auth = userAuth();

// ---------- me ----------
r.get('/me', auth, async (req, res) => res.json(await meView(req.user.id)));

r.patch('/me', auth, async (req, res) => {
  const b = req.body;
  const sets = [];
  const vals = [req.user.id];
  const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (b.name !== undefined) {
    const { text } = await filterText(str(b.name, 30));
    need(text.length >= 2, 'Name too short');
    add('name', text);
  }
  if (b.bio !== undefined) add('bio', (await filterText(str(b.bio, 200))).text);
  if (b.gender !== undefined) { need(['male', 'female', 'other'].includes(b.gender), 'Invalid gender'); add('gender', b.gender); }
  if (b.dob !== undefined) {
    const d = new Date(b.dob);
    need(!isNaN(d), 'Invalid date of birth');
    const minAge = (await getSetting('moderation')).min_age;
    const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
    need(age >= minAge, `You must be ${minAge}+ to use this app`);
    add('dob', b.dob);
  }
  if (b.country !== undefined) add('country', str(b.country, 3).toUpperCase());
  if (b.language !== undefined) add('language', str(b.language, 5));
  if (b.call_rate !== undefined && req.user.is_host) {
    const h = await one('SELECT level FROM hosts WHERE user_id=$1', [req.user.id]);
    const lvl = await one('SELECT max_call_rate FROM host_levels WHERE code=$1', [h?.level || 'N']);
    const eco = await getSetting('economy');
    const rate = int(b.call_rate);
    need(rate >= eco.call_min_rate && rate <= (lvl?.max_call_rate || eco.call_default_rate), `Call rate must be between ${eco.call_min_rate} and ${lvl?.max_call_rate || eco.call_default_rate}`);
    add('call_rate', rate);
  }
  if (b.call_enabled !== undefined) add('call_enabled', !!b.call_enabled);
  if (sets.length) await q(`UPDATE users SET ${sets.join(', ')} WHERE id=$1`, vals);
  invalidateProfile(req.user.id);
  res.json(await meView(req.user.id));
});

r.post('/me/avatar', auth, uploader(['image']).single('file'), async (req, res) => {
  need(req.file, 'Choose an image');
  await q('UPDATE users SET avatar_url=$2 WHERE id=$1', [req.user.id, fileUrl(req.file)]);
  invalidateProfile(req.user.id);
  res.json({ avatar_url: fileUrl(req.file) });
});

r.post('/me/fcm', auth, async (req, res) => {
  await q('UPDATE users SET fcm_token=$2 WHERE id=$1', [req.user.id, str(req.body.token, 400) || null]);
  res.json({ ok: true });
});

// Guest -> permanent account
r.post('/me/link-email', auth, async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Enter a valid email');
  need(String(req.body.password || '').length >= 6, 'Password must be at least 6 characters');
  if (await one('SELECT 1 FROM users WHERE email=$1 AND id<>$2', [email, req.user.id])) throw bad('Email already used');
  await q('UPDATE users SET email=$2, password_hash=$3 WHERE id=$1', [req.user.id, email, await bcrypt.hash(String(req.body.password), 10)]);
  res.json({ ok: true });
});

r.delete('/me', auth, async (req, res) => {
  await q(`UPDATE users SET status='deleted', email=NULL, phone=NULL, google_sub=NULL, password_hash=NULL, name='Deleted user', avatar_url=NULL, fcm_token=NULL WHERE id=$1`, [req.user.id]);
  res.json({ ok: true });
});

r.get('/me/ledger', auth, async (req, res) => {
  const { limit, offset } = page(req, 30);
  const cur = req.query.currency === 'diamond' ? 'diamond' : 'coin';
  res.json(await q('SELECT id, amount, balance_after, type, note, created_at FROM ledger WHERE user_id=$1 AND currency=$2 ORDER BY id DESC LIMIT $3 OFFSET $4', [req.user.id, cur, limit, offset]));
});

r.get('/me/visitors', auth, async (req, res) => {
  const vip = req.user.vip_expires && new Date(req.user.vip_expires) > new Date() ? req.user.vip_level : 0;
  const total = (await one('SELECT count(*)::int AS n FROM profile_visits WHERE user_id=$1', [req.user.id])).n;
  if (vip < 2) return res.json({ locked: true, total, list: [] });
  const list = await q(`SELECT ${PUBLIC_USER_COLS}, v.visited_at FROM profile_visits v JOIN users u ON u.id=v.visitor_id WHERE v.user_id=$1 ORDER BY v.visited_at DESC LIMIT 100`, [req.user.id]);
  res.json({ locked: false, total, list: list.map(withLevels) });
});

r.get('/me/friends', auth, async (req, res) => {
  const list = await q(
    `SELECT ${PUBLIC_USER_COLS} FROM follows a JOIN follows b ON a.follower_id=b.followee_id AND a.followee_id=b.follower_id
     JOIN users u ON u.id=a.followee_id WHERE a.follower_id=$1 LIMIT 200`, [req.user.id]);
  res.json(list.map(withLevels));
});

r.get('/me/blocked', auth, async (req, res) => {
  res.json(await q(`SELECT ${PUBLIC_USER_COLS} FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1`, [req.user.id]));
});

// ---------- other users ----------
r.get('/users/search', auth, async (req, res) => {
  const s = str(req.query.q, 40);
  if (!s) return res.json([]);
  const asNum = /^\d+$/.test(s) ? Number(s) : -1;
  const rows = await q(
    `SELECT ${PUBLIC_USER_COLS} FROM users u WHERE u.status='active' AND (u.uid=$1 OR u.fancy_id=$2 OR u.name ILIKE $3)
     ORDER BY (u.uid=$1 OR u.fancy_id=$2) DESC, u.total_earned DESC LIMIT 30`, [asNum, s, `%${s}%`]);
  res.json(rows.map(withLevels));
});

r.get('/users/:id', auth, async (req, res) => {
  const id = int(req.params.id);
  const u = await one(`SELECT ${PUBLIC_USER_COLS}, u.call_rate, u.call_enabled, u.status FROM users u WHERE u.id=$1`, [id]);
  if (!u || u.status === 'deleted') throw notFound('User not found');
  withLevels(u);
  if (id !== req.user.id) {
    await q(`INSERT INTO profile_visits(user_id, visitor_id, visited_at) VALUES ($1,$2,now())
             ON CONFLICT (user_id, visitor_id) DO UPDATE SET visited_at=now()`, [id, req.user.id]);
  }
  const rel = await one(
    `SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id=$2 AND followee_id=$1) AS following,
            EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND followee_id=$2) AS follows_me,
            EXISTS(SELECT 1 FROM blocks WHERE blocker_id=$2 AND blocked_id=$1) AS blocked,
            (SELECT count(*) FROM follows WHERE followee_id=$1)::int AS followers,
            (SELECT count(*) FROM follows WHERE follower_id=$1)::int AS following_count,
            (SELECT count(*) FROM moments WHERE user_id=$1 AND status='visible')::int AS moments`, [id, req.user.id]);
  const mp = await miniProfile(id);
  const host = u.is_host ? await one(`SELECT level, host_tags FROM hosts WHERE user_id=$1`, [id]) : null;
  const cpRow = await one('SELECT cp_user_id, cp_since FROM users WHERE id=$1', [id]);
  const fan = await one(
    `SELECT (SELECT count(*) FROM fan_clubs WHERE host_id=$1)::int AS members,
            (SELECT intimacy FROM fan_clubs WHERE host_id=$1 AND user_id=$2) AS my_intimacy`, [id, req.user.id]);
  res.json({
    ...u, ...rel, mini: mp, host, live_room_id: await hostRoom(id), online: await isOnline(id),
    cp: cpRow?.cp_user_id ? { user: await miniProfile(cpRow.cp_user_id), since: cpRow.cp_since } : null,
    fan_club: { members: fan.members, joined: fan.my_intimacy !== null, level: fan.my_intimacy !== null ? 1 + Math.floor(Math.sqrt(Number(fan.my_intimacy) / 1000)) : 0 },
  });
});

r.get('/users/:id/giftwall', auth, async (req, res) => {
  res.json(await q(
    `SELECT g.id, g.name, g.icon, g.price, sum(t.qty)::int AS count FROM gift_transactions t JOIN gifts g ON g.id=t.gift_id
     WHERE t.receiver_id=$1 GROUP BY g.id ORDER BY g.price DESC`, [int(req.params.id)]));
});

r.post('/users/:id/follow', auth, async (req, res) => {
  const id = int(req.params.id);
  need(id !== req.user.id, 'You cannot follow yourself');
  const ins = await q('INSERT INTO follows(follower_id, followee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [req.user.id, id]);
  if (ins.length) {
    bumpTask(req.user.id, 'follow', 1);
    toUser(id, 'notify', { type: 'follow', from: await miniProfile(req.user.id) });
  }
  res.json({ following: true });
});

r.delete('/users/:id/follow', auth, async (req, res) => {
  await q('DELETE FROM follows WHERE follower_id=$1 AND followee_id=$2', [req.user.id, int(req.params.id)]);
  res.json({ following: false });
});

r.get('/users/:id/followers', auth, async (req, res) => {
  const { limit, offset } = page(req, 50);
  res.json((await q(`SELECT ${PUBLIC_USER_COLS} FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.followee_id=$1 ORDER BY f.created_at DESC LIMIT $2 OFFSET $3`, [int(req.params.id), limit, offset])).map(withLevels));
});

r.get('/users/:id/following', auth, async (req, res) => {
  const { limit, offset } = page(req, 50);
  res.json((await q(`SELECT ${PUBLIC_USER_COLS} FROM follows f JOIN users u ON u.id=f.followee_id WHERE f.follower_id=$1 ORDER BY f.created_at DESC LIMIT $2 OFFSET $3`, [int(req.params.id), limit, offset])).map(withLevels));
});

r.post('/users/:id/block', auth, async (req, res) => {
  const id = int(req.params.id);
  need(id !== req.user.id, 'Invalid');
  await q('INSERT INTO blocks(blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
  await q('DELETE FROM follows WHERE (follower_id=$1 AND followee_id=$2) OR (follower_id=$2 AND followee_id=$1)', [req.user.id, id]);
  res.json({ blocked: true });
});

r.delete('/users/:id/block', auth, async (req, res) => {
  await q('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, int(req.params.id)]);
  res.json({ blocked: false });
});

// ---------- reports ----------
r.post('/reports', auth, uploader(['image']).single('screenshot'), async (req, res) => {
  const type = str(req.body.target_type, 20);
  need(['user', 'room', 'moment', 'message'].includes(type), 'Invalid report type');
  const targetId = str(req.body.target_id, 40);
  need(targetId, 'target_id required');
  await q(`INSERT INTO reports(reporter_id, target_type, target_id, reason, details, screenshot_url) VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, type, targetId, str(req.body.reason, 60) || 'other', str(req.body.details, 500), req.file ? fileUrl(req.file) : null]);
  // auto-flag rooms with many open reports
  if (type === 'room') {
    const m = await getSetting('moderation');
    const n = (await one(`SELECT count(DISTINCT reporter_id)::int AS n FROM reports WHERE target_type='room' AND target_id=$1 AND status='open'`, [targetId])).n;
    if (n >= m.auto_flag_reports) await q('UPDATE rooms SET flagged=true WHERE id=$1', [int(targetId)]);
  }
  res.json({ ok: true, message: 'Thanks, our team will review it.' });
});

// ---------- notifications ----------
r.get('/notifications', auth, async (req, res) => {
  res.json(await q(
    `SELECT n.id, n.title, n.body, n.link, n.created_at, (r.user_id IS NOT NULL) AS read FROM notifications n
     LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$1
     WHERE (n.user_id=$1 OR n.user_id IS NULL) AND n.created_at > $2 ORDER BY n.id DESC LIMIT 100`,
    [req.user.id, req.user.created_at]));
});

r.post('/notifications/read', auth, async (req, res) => {
  await q(`INSERT INTO notification_reads(notification_id, user_id)
           SELECT id, $1 FROM notifications WHERE (user_id=$1 OR user_id IS NULL) ON CONFLICT DO NOTHING`, [req.user.id]);
  res.json({ ok: true });
});

// ---------- support ----------
r.get('/support', auth, async (req, res) => {
  res.json(await q('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]));
});
r.post('/support', auth, async (req, res) => {
  const subject = str(req.body.subject, 100);
  const body = str(req.body.body, 2000);
  need(subject && body, 'Subject and message required');
  res.json(await one('INSERT INTO support_tickets(user_id, subject, body) VALUES ($1,$2,$3) RETURNING *', [req.user.id, subject, body]));
});

export { autoReport };
export default r;

import { Router } from 'express';
import { one, q } from '../db.js';
import { adminAuth } from '../lib/auth.js';
import { need, str, int, notFound, page } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { lkToken } from '../lib/livekit.js';
import { toRoom, toUser } from '../lib/io.js';
import { config } from '../config.js';
import * as rs from '../services/roomstate.js';
import { miniProfile } from '../services/profile.js';
import { endRoom, lkRoomName, finishPk } from '../services/live.js';
import { endCall } from '../services/calls.js';
import { runRiskScan } from '../services/risk.js';

const r = Router();

// ================= LIVE MONITORING =================
r.get('/admin/live', adminAuth('live'), async (req, res) => {
  const rows = await q(
    `SELECT r.*, u.uid, u.name AS host_name, u.avatar_url AS host_avatar, h.agency_id, a.name AS agency_name,
       (SELECT count(*) FROM reports x WHERE x.target_type='room' AND x.target_id=r.id::text AND x.status='open')::int AS open_reports
     FROM rooms r JOIN users u ON u.id=r.host_id LEFT JOIN hosts h ON h.user_id=r.host_id LEFT JOIN agencies a ON a.id=h.agency_id
     WHERE r.status='live' ${req.query.flagged ? 'AND r.flagged' : ''} ORDER BY r.flagged DESC, r.started_at DESC`);
  for (const row of rows) {
    row.viewers = await rs.viewerCount(row.id);
    row.pk_id = await rs.getPk(row.id);
    delete row.password;
  }
  res.json(rows);
});

r.get('/admin/live/history', adminAuth('live'), async (req, res) => {
  const { limit, offset } = page(req, 50);
  res.json(await q(
    `SELECT r.id, r.host_id, r.type, r.title, r.status, r.started_at, r.ended_at, r.end_reason, r.diamonds, r.total_viewers, r.peak_viewers, u.uid, u.name AS host_name
     FROM rooms r JOIN users u ON u.id=r.host_id WHERE r.status<>'live' ${req.query.host_id ? 'AND r.host_id=$3' : ''}
     ORDER BY r.id DESC LIMIT $1 OFFSET $2`, req.query.host_id ? [limit, offset, int(req.query.host_id)] : [limit, offset]));
});

// Invisible watch: hidden LiveKit participant, subscribe only.
r.get('/admin/live/:id/watch', adminAuth('live'), async (req, res) => {
  const room = await one('SELECT * FROM rooms WHERE id=$1', [int(req.params.id)]);
  if (!room) throw notFound();
  const { AccessToken } = await import('livekit-server-sdk');
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, { identity: `admin_${req.admin.id}`, name: 'admin', ttl: '2h' });
  at.addGrant({ room: lkRoomName(room.id), roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, hidden: true });
  const seats = await rs.getSeats(room.id);
  res.json({ token: await at.toJwt(), livekit_url: config.livekit.url, room: { ...room, password: undefined }, host: await miniProfile(room.host_id), seats, viewers: await rs.viewerCount(room.id) });
});

r.post('/admin/live/:id/warn', adminAuth('live'), async (req, res) => {
  const room = await one('SELECT * FROM rooms WHERE id=$1', [int(req.params.id)]);
  if (!room) throw notFound();
  const msg = str(req.body.message, 300) || 'Your live is violating our community rules. Please correct it now or the live will be stopped.';
  toUser(room.host_id, 'room:warning', { room_id: room.id, message: msg });
  await q(`UPDATE hosts SET warnings = warnings + 1 WHERE user_id=$1`, [room.host_id]);
  await audit(req, 'live.warn', 'room', room.id, { message: msg });
  res.json({ ok: true });
});

r.post('/admin/live/:id/cut', adminAuth('live'), async (req, res) => {
  const room = await one('SELECT * FROM rooms WHERE id=$1', [int(req.params.id)]);
  if (!room) throw notFound();
  const reason = str(req.body.reason, 200) || 'Policy violation';
  toUser(room.host_id, 'room:cut', { room_id: room.id, reason });
  await endRoom(room.id, 'admin_cut');
  const hours = int(req.body.ban_hours, 0);
  if (hours > 0) await q(`UPDATE users SET muted_until = now() + make_interval(hours => $2) WHERE id=$1`, [room.host_id, hours]);
  await q(`UPDATE reports SET status='actioned', action='live_cut', handled_at=now() WHERE target_type='room' AND target_id=$1 AND status='open'`, [String(room.id)]);
  await audit(req, 'live.cut', 'room', room.id, { reason, ban_hours: hours });
  res.json({ ok: true });
});

r.post('/admin/live/:id/unflag', adminAuth('live'), async (req, res) => {
  await q('UPDATE rooms SET flagged=false WHERE id=$1', [int(req.params.id)]);
  res.json({ ok: true });
});

r.post('/admin/live/:id/edit', adminAuth('live'), async (req, res) => {
  const id = int(req.params.id);
  if (req.body.clear_title) await q(`UPDATE rooms SET title='Live' WHERE id=$1`, [id]);
  if (req.body.clear_cover) await q(`UPDATE rooms SET cover_url=NULL WHERE id=$1`, [id]);
  toRoom(id, 'room:info', { id, title: req.body.clear_title ? 'Live' : undefined });
  await audit(req, 'live.edit', 'room', id, req.body);
  res.json({ ok: true });
});

r.get('/admin/pk', adminAuth('pk'), async (_req, res) => {
  const rows = await q(`SELECT * FROM pk_battles ORDER BY id DESC LIMIT 100`);
  for (const p of rows) { p.a = await miniProfile(p.host_a); p.b = await miniProfile(p.host_b); }
  res.json(rows);
});

r.post('/admin/pk/:id/stop', adminAuth('pk'), async (req, res) => {
  await finishPk(int(req.params.id));
  res.json({ ok: true });
});

r.get('/admin/calls', adminAuth('live'), async (req, res) => {
  const rows = await q(`SELECT * FROM calls ${req.query.active ? `WHERE status='active'` : ''} ORDER BY id DESC LIMIT 200`);
  for (const c of rows) { c.caller = await miniProfile(c.caller_id); c.host = await miniProfile(c.host_id); }
  res.json(rows);
});

r.post('/admin/calls/:id/end', adminAuth('live'), async (req, res) => {
  await endCall(int(req.params.id), 'admin_end');
  await audit(req, 'call.end', 'call', req.params.id);
  res.json({ ok: true });
});

// ================= REPORTS =================
r.get('/admin/reports', adminAuth('reports'), async (req, res) => {
  const { limit, offset } = page(req, 50, 200);
  const rows = await q(
    `SELECT r.*, a.name AS assignee FROM reports r LEFT JOIN admin_users a ON a.id=r.assigned_to
     WHERE ($1::text IS NULL OR r.status=$1) AND ($2::text IS NULL OR r.target_type=$2) ORDER BY r.id DESC LIMIT $3 OFFSET $4`,
    [req.query.status || null, req.query.type || null, limit, offset]);
  for (const x of rows) {
    if (x.reporter_id) x.reporter = await miniProfile(x.reporter_id);
    if (x.target_type === 'user') x.target = await miniProfile(int(x.target_id));
    if (x.target_type === 'room') x.target = await one('SELECT id, host_id, title, status, thumbnail_url FROM rooms WHERE id=$1', [int(x.target_id)]);
    if (x.target_type === 'moment') x.target = await one('SELECT id, user_id, body, media_url, status FROM moments WHERE id=$1', [int(x.target_id)]);
    if (x.target_type === 'message') x.target = await one('SELECT id, from_id, to_id, body, media_url FROM messages WHERE id=$1', [int(x.target_id)]);
  }
  res.json(rows);
});

r.post('/admin/reports/:id', adminAuth('reports'), async (req, res) => {
  const status = ['open', 'in_review', 'actioned', 'dismissed'].includes(req.body.status) ? req.body.status : 'in_review';
  const rep = await one(
    `UPDATE reports SET status=$2, action=coalesce($3, action), assigned_to=coalesce($4, assigned_to),
       handled_at = CASE WHEN $2 IN ('actioned','dismissed') THEN now() ELSE handled_at END WHERE id=$1 RETURNING *`,
    [int(req.params.id), status, str(req.body.action, 100) || null, req.body.assign_to_me ? req.admin.id : null]);
  if (!rep) throw notFound();
  await audit(req, 'report.' + status, 'report', rep.id, req.body);
  res.json(rep);
});

// ================= RISK & FRAUD =================
r.get('/admin/risk', adminAuth('risk'), async (req, res) => {
  const rows = await q(`SELECT * FROM risk_flags WHERE ($1::text IS NULL OR status=$1) ORDER BY score DESC, id DESC LIMIT 300`, [req.query.status || 'open']);
  for (const x of rows) if (x.user_id) x.user = await miniProfile(x.user_id);
  res.json(rows);
});

r.post('/admin/risk/scan', adminAuth('risk'), async (req, res) => {
  const out = await runRiskScan();
  await audit(req, 'risk.scan', null, null, out);
  res.json(out);
});

r.post('/admin/risk/:id', adminAuth('risk'), async (req, res) => {
  await q(`UPDATE risk_flags SET status=$2 WHERE id=$1`, [int(req.params.id), ['open', 'resolved', 'false_positive'].includes(req.body.status) ? req.body.status : 'resolved']);
  res.json({ ok: true });
});

export default r;

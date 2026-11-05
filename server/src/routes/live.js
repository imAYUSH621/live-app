import { Router } from 'express';
import path from 'node:path';
import { one, q, tx } from '../db.js';
import { redis } from '../redis.js';
import { userAuth } from '../lib/auth.js';
import { need, int, str, notFound, forbidden, bad } from '../lib/util.js';
import { uploader, fileUrl, uploadRoot } from '../lib/upload.js';
import { lkToken, kickFromRoom, muteTrack, AUDIO_ONLY } from '../lib/livekit.js';
import { getSettings } from '../lib/settings.js';
import { config } from '../config.js';
import { changeCoins, changeDiamonds, addHostDiamondStat } from '../lib/wallet.js';
import { filterText, checkImage, autoReport } from '../lib/moderation.js';
import { toRoom, toUser, toAdmins } from '../lib/io.js';
import { pushToTokens } from '../lib/push.js';
import * as rs from '../services/roomstate.js';
import { miniProfile, miniProfiles } from '../services/profile.js';
import {
  lkRoomName, isRoomAdmin, roomState, endRoom, startPk, finishPk, pkInfo,
  placeOnSeat, removeFromSeat, broadcastSeats, livekitUrl,
} from '../services/live.js';

const r = Router();
const auth = userAuth();

async function getLiveRoom(id) {
  const room = await one('SELECT * FROM rooms WHERE id=$1', [int(id)]);
  if (!room) throw notFound('Room not found');
  return room;
}

async function requireAdminOf(room, userId) {
  if (!(await isRoomAdmin(room, userId))) throw forbidden('Only the host or room admins can do this');
}

const vipActive = (u) => (u.vip_expires && new Date(u.vip_expires) > new Date() ? u.vip_level : 0);

// ---------- discovery ----------
r.get('/live/feed', auth, async (req, res) => {
  const tab = str(req.query.tab, 20) || 'popular';
  const params = [];
  let where = `r.status='live' AND r.privacy <> 'hidden'`;
  if (tab === 'nearby' || tab === 'country') { params.push(str(req.query.country, 3) || req.user.country); where += ` AND r.country=$${params.length}`; }
  if (tab === 'following') { params.push(req.user.id); where += ` AND r.host_id IN (SELECT followee_id FROM follows WHERE follower_id=$${params.length})`; }
  if (tab === 'multi') where += ` AND r.type='multi'`;
  if (tab === 'party' || tab === 'audio') where += ` AND (r.type='party' OR r.type='audio')`;
  if (tab === 'game') where += ` AND r.type='game'`;
  if (tab === 'pk') where += ` AND EXISTS (SELECT 1 FROM pk_battles p WHERE p.status IN ('active','punishment') AND (p.room_a=r.id OR p.room_b=r.id))`;
  if (tab === 'new') where += ` AND h.approved_at > now() - interval '30 days'`;
  params.push(req.user.id);
  const rows = await q(
    `SELECT r.id, r.host_id, r.type, r.title, r.cover_url, r.thumbnail_url, r.tags, r.privacy, r.ticket_price, r.country, r.started_at, r.diamonds,
            u.name AS host_name, u.avatar_url AS host_avatar, u.total_earned, coalesce(h.recommended,false) AS recommended, h.host_tags, h.level AS host_level,
            EXISTS (SELECT 1 FROM pk_battles p WHERE p.status IN ('active','punishment') AND (p.room_a=r.id OR p.room_b=r.id)) AS in_pk
     FROM rooms r JOIN users u ON u.id=r.host_id LEFT JOIN hosts h ON h.user_id=r.host_id
     WHERE ${where} AND r.host_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=$${params.length})
     ORDER BY r.started_at DESC LIMIT 200`, params);
  for (const row of rows) {
    row.viewers = await rs.viewerCount(row.id);
    const isNew = Date.now() - new Date(row.started_at) < 10 * 60_000;
    row.score = row.viewers * 10 + row.diamonds / 50 + (row.recommended ? 5000 : 0) + (row.in_pk ? 200 : 0) + (isNew ? 100 : 0);
  }
  if (tab !== 'new') rows.sort((a, b) => b.score - a.score);
  res.json(rows.slice(0, int(req.query.limit, 60)));
});

r.get('/live/:id', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  const host = await miniProfile(room.host_id);
  res.json({
    ...room,
    password: undefined,
    host,
    cover: room.cover_url,
    cover_url: room.cover_url,
    viewers: await rs.viewerCount(room.id),
  });
});

// ---------- go live ----------
r.post('/live/start', auth, uploader(['image']).single('cover'), async (req, res) => {
  const s = await getSettings();
  need(s.features.live, 'Live is disabled');
  const b = req.body || {};
  const rawType = b.type || 'solo';
  const type = (rawType === 'video' || rawType === 'solo') ? 'solo'
             : (rawType === 'audio' || rawType === 'party') ? 'party'
             : ['multi', 'game'].includes(rawType) ? rawType : 'solo';
  if (type === 'multi') need(s.features.multi_guest, 'Multi-guest is disabled');
  if (type === 'party') need(s.features.party_rooms, 'Party rooms are disabled');
  if (type === 'game') need(s.features.game_live, 'Game live is disabled');
  // Production enforces host approval at the route, unconditionally: no settings
  // row or env flag can waive it there. Non-prod follows the (opt-in gated) setting.
  const hostOnlyLive = config.nodeEnv === 'production' ? true : s.room.host_only_live;
  if (hostOnlyLive) need(req.user.is_host, 'Only verified hosts can go live. Apply to become a host.');
  if (req.user.muted_until && new Date(req.user.muted_until) > new Date()) throw forbidden('You are restricted from going live right now');

  // one live room per host
  const existing = await one(`SELECT id FROM rooms WHERE host_id=$1 AND status='live'`, [req.user.id]);
  if (existing) await endRoom(existing.id, 'restarted');

  const privacy = ['public', 'password', 'vip', 'ticket'].includes(b.privacy) ? b.privacy : 'public';
  const seatsAllowed = type === 'multi' ? s.room.multi_seats : type === 'party' ? [s.room.party_seats] : [0];
  let seats = int(b.seats, seatsAllowed[seatsAllowed.length - 1]);
  if (!seatsAllowed.includes(seats)) seats = seatsAllowed[seatsAllowed.length - 1];
  const title = (await filterText(str(b.title, s.room.max_title))).text || `${req.user.name}'s live`;
  const coverUrl = req.file ? fileUrl(req.file) : (b.cover_url || req.user.avatar_url || '/assets/default-cover.jpg');
  const room = await one(
    `INSERT INTO rooms(host_id, type, title, tags, privacy, password, ticket_price, seats, country, livekit_room, cover_url, theme)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.user.id, type, title, (Array.isArray(b.tags) ? b.tags : []).slice(0, 5).map((t) => str(t, 20)),
     privacy, privacy === 'password' ? str(b.password, 20) : null, privacy === 'ticket' ? Math.max(1, int(b.ticket_price, 10)) : 0,
     seats, req.user.country, `pending_${Date.now()}_${req.user.id}`, coverUrl, str(b.theme, 20) || 'default'],
  );
  await q('UPDATE rooms SET livekit_room=$2 WHERE id=$1', [room.id, lkRoomName(room.id)]);
  if (seats > 0) await rs.initSeats(room.id, seats);
  await rs.setHostRoom(req.user.id, room.id);
  await redis.set(`hb:room:${room.id}`, Date.now(), 'EX', 120);

  const token = await lkToken({
    room: lkRoomName(room.id), identity: req.user.id, name: req.user.name, publish: true,
    metadata: { role: 'host' }, ttl: '12h',
  });

  // tell followers (socket + push)
  const followers = await q('SELECT u.id, u.fcm_token FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.followee_id=$1', [req.user.id]);
  const host = await miniProfile(req.user.id);
  for (const f of followers) toUser(f.id, 'notify', { type: 'live', room_id: room.id, from: host, title });
  pushToTokens(followers.map((f) => f.fcm_token).filter(Boolean), `${req.user.name} is live`, title, { room_id: room.id }).catch(() => {});

  const state = await roomState({ ...room }, req.user.id);
  res.json({
    room: {
      ...room,
      livekit_room: lkRoomName(room.id),
      host: state.host || host,
      cover: room.cover_url,
      cover_url: room.cover_url,
    },
    token,
    livekit_url: livekitUrl(),
    isHost: true,
    rtc: {
      token,
      livekit_url: livekitUrl(),
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
    state,
  });
});

r.post('/live/:id/cover', auth, uploader(['image']).single('file'), async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.host_id === req.user.id, 'Not your room');
  need(req.file, 'Choose an image');
  await q('UPDATE rooms SET cover_url=$2 WHERE id=$1', [room.id, fileUrl(req.file)]);
  res.json({ cover_url: fileUrl(req.file) });
});

// Host app uploads a snapshot every ~60s -> admin live grid + optional AI moderation
r.post('/live/:id/thumbnail', auth, uploader(['image']).single('file'), async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.host_id === req.user.id && room.status === 'live', 'Not your live room');
  need(req.file, 'No frame');
  await q('UPDATE rooms SET thumbnail_url=$2, thumb_at=now() WHERE id=$1', [room.id, fileUrl(req.file)]);
  await redis.set(`hb:room:${room.id}`, Date.now(), 'EX', 120);
  res.json({ ok: true });
  const verdict = await checkImage(path.join(uploadRoot, fileUrl(req.file).replace('/uploads/', '')));
  if (verdict.flagged) {
    await q('UPDATE rooms SET flagged=true WHERE id=$1', [room.id]);
    await autoReport('room', room.id, verdict.reason, `AI flagged live frame: ${fileUrl(req.file)}`);
    toAdmins('admin:flag', { room_id: room.id, reason: verdict.reason, thumbnail_url: fileUrl(req.file) });
  }
});

r.patch('/live/:id', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const b = req.body;
  if (b.title !== undefined) await q('UPDATE rooms SET title=$2 WHERE id=$1', [room.id, (await filterText(str(b.title, 60))).text]);
  if (b.announcement !== undefined) await q('UPDATE rooms SET announcement=$2 WHERE id=$1', [room.id, (await filterText(str(b.announcement, 300))).text]);
  if (b.theme !== undefined) await q('UPDATE rooms SET theme=$2 WHERE id=$1', [room.id, str(b.theme, 20)]);
  const updated = await getLiveRoom(room.id);
  toRoom(room.id, 'room:info', { id: room.id, title: updated.title, announcement: updated.announcement, theme: updated.theme });
  res.json({ ok: true });
});

r.post('/live/:id/end', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.host_id === req.user.id, 'Only the host can end the live');
  res.json(await endRoom(room.id, 'host_ended') || { ended: true });
});

r.get('/live/:id/summary', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  const top = await q(`SELECT sender_id, sum(coins)::bigint AS coins FROM gift_transactions WHERE room_id=$1 GROUP BY sender_id ORDER BY coins DESC LIMIT 5`, [room.id]);
  const topUsers = [];
  for (const t of top) topUsers.push({ ...(await miniProfile(t.sender_id)), coins: t.coins });
  res.json({
    room_id: room.id, status: room.status, seconds: room.ended_at ? Math.round((new Date(room.ended_at) - new Date(room.started_at)) / 1000) : null,
    diamonds: room.diamonds, likes: room.likes, viewers: room.total_viewers, peak: room.peak_viewers, top: topUsers,
  });
});

// ---------- join ----------
r.post('/live/:id/join', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.status === 'live', 'This live has ended');
  const isHost = room.host_id === req.user.id;
  if (!isHost) {
    if (await one('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [room.host_id, req.user.id])) throw forbidden('You cannot join this live');
    if (await rs.isKicked(room.id, req.user.id)) throw forbidden('You were removed from this live');
    if (room.privacy === 'password' && str(req.body.password, 20) !== room.password) throw Object.assign(bad('Password required'), { code: 'need_password' });
    if (room.privacy === 'vip' && vipActive(req.user) < 1) throw Object.assign(forbidden('VIP-only live'), { code: 'need_vip' });
    if (room.privacy === 'ticket' && !(await one('SELECT 1 FROM room_tickets WHERE room_id=$1 AND user_id=$2', [room.id, req.user.id]))) {
      return res.status(402).json({ error: `Ticket needed: ${room.ticket_price} coins`, code: 'need_ticket', price: room.ticket_price });
    }
  }
  await redis.set(`ra:${room.id}:${req.user.id}`, '1', 'EX', 6 * 3600); // lets the socket join this room
  const seats = await rs.getSeats(room.id);
  const mySeat = seats.find((s) => Number(s.user_id) === req.user.id);
  const onSeat = !!mySeat;
  // Least privilege: a muted seat never gets a publish grant, and publish-capable
  // tokens expire quickly so a removed seat cannot replay an old token for long.
  // (LiveKit has no token revocation; removal also force-disconnects the session.)
  const canPublish = isHost || (onSeat && !mySeat.muted);
  const token = await lkToken({
    room: lkRoomName(room.id), identity: req.user.id, name: req.user.name, publish: canPublish,
    // audio (party) rooms: seated guests get a microphone, never a camera
    sources: canPublish && !isHost && room.type === 'party' ? AUDIO_ONLY : undefined,
    ttl: canPublish && !isHost ? '15m' : '6h',
    metadata: { role: isHost ? 'host' : 'viewer' },
  });
  const state = await roomState(room, req.user.id);
  res.json({
    room: {
      ...room,
      password: undefined,
      livekit_room: lkRoomName(room.id),
      host: state.host,
      cover: room.cover_url,
      cover_url: room.cover_url,
    },
    token,
    livekit_url: livekitUrl(),
    isHost,
    rtc: {
      token,
      livekit_url: livekitUrl(),
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
    state,
  });
});

r.post('/live/:id/ticket', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.status === 'live' && room.privacy === 'ticket', 'No ticket needed');
  const eco = (await getSettings()).economy;
  await tx(async (c) => {
    const exists = await c.one('SELECT 1 FROM room_tickets WHERE room_id=$1 AND user_id=$2', [room.id, req.user.id]);
    if (exists) return;
    await changeCoins(c, req.user.id, -room.ticket_price, 'ticket', { refType: 'room', refId: room.id });
    const d = Math.floor((room.ticket_price * eco.ticket_host_pct) / 100);
    await changeDiamonds(c, room.host_id, d, 'ticket_income', { refType: 'room', refId: room.id });
    await addHostDiamondStat(c, room.host_id, d);
    await c.q('INSERT INTO room_tickets(room_id, user_id, coins) VALUES ($1,$2,$3)', [room.id, req.user.id, room.ticket_price]);
  });
  res.json({ ok: true });
});

r.get('/live/:id/viewers', auth, async (req, res) => {
  const ids = (await rs.viewerIds(req.params.id)).slice(0, 300);
  const list = await miniProfiles(ids);
  list.sort((a, b) => b.noble - a.noble || b.vip - a.vip || b.level - a.level);
  res.json(list);
});

// ---------- host moderation ----------
r.post('/live/:id/kick', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const target = int(req.body.user_id);
  need(target !== room.host_id, 'Cannot kick the host');
  const t = await one('SELECT vip_level, vip_expires, noble_rank, noble_expires FROM users WHERE id=$1', [target]);
  if (room.host_id !== req.user.id && t && (vipActive(t) >= 4 || (t.noble_expires && new Date(t.noble_expires) > new Date() && t.noble_rank >= 3))) {
    throw forbidden('This user has anti-kick protection (VIP 4+ / Noble 3+). Only the host can remove them.');
  }
  await rs.kick(room.id, target, int(req.body.minutes, 60));
  await removeFromSeat(room, target);
  await rs.removeViewer(room.id, target);
  await kickFromRoom(lkRoomName(room.id), target);
  toUser(target, 'room:kicked', { room_id: room.id });
  toRoom(room.id, 'room:system', { text: `${(await miniProfile(target))?.name} was removed from the room` });
  res.json({ ok: true });
});

r.post('/live/:id/mute', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const target = int(req.body.user_id);
  if (req.body.unmute) await rs.unmute(room.id, target);
  else await rs.mute(room.id, target, int(req.body.minutes, 10));
  toRoom(room.id, 'room:system', { text: `${(await miniProfile(target))?.name} was ${req.body.unmute ? 'unmuted' : 'muted'}` });
  res.json({ ok: true });
});

r.get('/live/admins/mine', auth, async (req, res) => {
  const ids = (await q('SELECT user_id FROM room_admins WHERE host_id=$1', [req.user.id])).map((x) => x.user_id);
  res.json(await miniProfiles(ids));
});

r.post('/live/admins', auth, async (req, res) => {
  const target = int(req.body.user_id);
  need(target !== req.user.id, 'Invalid user');
  const n = (await one('SELECT count(*)::int AS n FROM room_admins WHERE host_id=$1', [req.user.id])).n;
  need(n < 10, 'Max 10 room admins');
  await q('INSERT INTO room_admins(host_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, target]);
  res.json({ ok: true });
});

r.delete('/live/admins/:userId', auth, async (req, res) => {
  await q('DELETE FROM room_admins WHERE host_id=$1 AND user_id=$2', [req.user.id, int(req.params.userId)]);
  res.json({ ok: true });
});

// ---------- seats (multi-guest / party) ----------
r.post('/live/:id/seats/request', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  need(room.status === 'live' && room.seats > 0, 'No seats in this room');
  if (room.type === 'party') {
    // party rooms: free unlocked seat can be taken directly
    await placeOnSeat(room, req.user.id, req.body.seat);
    return res.json({ seated: true });
  }
  await rs.addSeatRequest(room.id, req.user.id);
  const p = await miniProfile(req.user.id);
  toUser(room.host_id, 'seat:request', { room_id: room.id, user: p });
  for (const a of await q('SELECT user_id FROM room_admins WHERE host_id=$1', [room.host_id])) toUser(a.user_id, 'seat:request', { room_id: room.id, user: p });
  res.json({ requested: true });
});

r.post('/live/:id/seats/cancel', auth, async (req, res) => {
  await rs.removeSeatRequest(int(req.params.id), req.user.id);
  res.json({ ok: true });
});

r.get('/live/:id/seats/requests', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  res.json(await miniProfiles(await rs.seatRequests(room.id)));
});

r.post('/live/:id/seats/accept', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const target = int(req.body.user_id);
  await placeOnSeat(room, target, req.body.seat);
  toUser(target, 'seat:accepted', { room_id: room.id });
  res.json({ ok: true });
});

r.post('/live/:id/seats/invite', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const target = int(req.body.user_id);
  await redis.set(`seatinvite:${room.id}:${target}`, '1', 'EX', 60);
  toUser(target, 'seat:invite', { room_id: room.id, from: await miniProfile(req.user.id) });
  res.json({ ok: true });
});

r.post('/live/:id/seats/take', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  // Fail closed: seat publishing relies on the SFU webhook to revoke stale
  // publish grants. Production requires BOTH a configured webhook URL AND
  // observed signature-verified delivery from the SFU (any room's lifecycle
  // events prove the path; no seat needs to exist first). A typo'd or
  // unreachable webhook URL therefore keeps seats off instead of silently
  // shipping the revocation gap.
  if (config.nodeEnv === 'production') {
    const delivered = config.livekit.webhookUrl && (await redis.get('lk:webhook:delivered'));
    if (!delivered) {
      return res.status(503).json({ error: 'Guest seats are temporarily unavailable', code: 'seats_disabled' });
    }
  }
  const invited = await redis.get(`seatinvite:${room.id}:${req.user.id}`);
  need(invited || room.type === 'party', 'You need an invite from the host');
  await redis.del(`seatinvite:${room.id}:${req.user.id}`);
  await placeOnSeat(room, req.user.id, req.body.seat);
  res.json({ seated: true });
});

r.post('/live/:id/seats/leave', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await removeFromSeat(room, req.user.id);
  res.json({ ok: true });
});

r.post('/live/:id/seats/remove', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  await removeFromSeat(room, int(req.body.user_id), { kick: true });
  res.json({ ok: true });
});

r.post('/live/:id/seats/lock', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  await requireAdminOf(room, req.user.id);
  const seats = await rs.getSeats(room.id);
  const s = seats.find((x) => x.seat === int(req.body.seat));
  need(s, 'Seat not found');
  s.locked = !!req.body.locked;
  if (s.locked && s.user_id) { const uid = s.user_id; s.user_id = null; await rs.setSeats(room.id, seats); await removeFromSeat(room, uid); }
  await rs.setSeats(room.id, seats);
  await broadcastSeats(room.id, seats);
  res.json({ ok: true });
});

r.post('/live/:id/seats/mute', auth, async (req, res) => {
  const room = await getLiveRoom(req.params.id);
  const seats = await rs.getSeats(room.id);
  const s = seats.find((x) => x.seat === int(req.body.seat));
  need(s && s.user_id, 'Empty seat');
  const self = s.user_id === req.user.id;
  if (!self) await requireAdminOf(room, req.user.id);
  s.muted = !!req.body.muted;
  await rs.setSeats(room.id, seats);
  if (!self) await muteTrack(lkRoomName(room.id), s.user_id, s.muted);
  await broadcastSeats(room.id, seats);
  res.json({ ok: true });
});

// ---------- PK battles ----------
r.get('/pk/candidates', auth, async (req, res) => {
  const rows = await q(
    `SELECT r.id, r.host_id, r.title, u.name, u.avatar_url, u.total_earned FROM rooms r JOIN users u ON u.id=r.host_id
     WHERE r.status='live' AND r.type='solo' AND r.host_id<>$1
       AND NOT EXISTS (SELECT 1 FROM pk_battles p WHERE p.status IN ('active','punishment','invited') AND (p.room_a=r.id OR p.room_b=r.id))
     ORDER BY u.total_earned DESC LIMIT 50`, [req.user.id]);
  res.json(rows);
});

async function myLiveSoloRoom(userId) {
  const room = await one(`SELECT * FROM rooms WHERE host_id=$1 AND status='live'`, [userId]);
  need(room, 'Start a live first');
  need(room.type === 'solo', 'PK works in solo live rooms');
  need(!(await rs.getPk(room.id)), 'Already in a PK');
  return room;
}

r.post('/pk/invite', auth, async (req, res) => {
  need((await getSettings()).features.pk, 'PK is disabled');
  const mine = await myLiveSoloRoom(req.user.id);
  const other = await getLiveRoom(req.body.room_id);
  need(other.status === 'live' && other.type === 'solo' && other.host_id !== req.user.id, 'That host is not available');
  need(!(await rs.getPk(other.id)), 'That host is already in a PK');
  const pk = await one(`INSERT INTO pk_battles(room_a, room_b, host_a, host_b) VALUES ($1,$2,$3,$4) RETURNING id`, [mine.id, other.id, mine.host_id, other.host_id]);
  toUser(other.host_id, 'pk:invite', { pk_id: pk.id, from: await miniProfile(req.user.id), room_id: mine.id });
  setTimeout(() => one(`UPDATE pk_battles SET status='declined' WHERE id=$1 AND status='invited' RETURNING id`, [pk.id])
    .then((x) => x && toUser(req.user.id, 'pk:declined', { pk_id: pk.id, reason: 'timeout' })).catch(() => {}), 30_000);
  res.json({ pk_id: pk.id });
});

r.post('/pk/random', auth, async (req, res) => {
  need((await getSettings()).features.pk, 'PK is disabled');
  const mine = await myLiveSoloRoom(req.user.id);
  // try to pair with someone waiting
  for (let i = 0; i < 5; i++) {
    const other = await redis.lpop('pk:queue');
    if (!other) break;
    const [roomId, hostId] = other.split(':').map(Number);
    if (hostId === req.user.id) continue;
    const otherRoom = await one(`SELECT * FROM rooms WHERE id=$1 AND status='live'`, [roomId]);
    if (!otherRoom || (await rs.getPk(roomId))) continue;
    const pk = await one(`INSERT INTO pk_battles(room_a, room_b, host_a, host_b) VALUES ($1,$2,$3,$4) RETURNING id`, [otherRoom.id, mine.id, otherRoom.host_id, mine.host_id]);
    const info = await startPk(pk.id);
    return res.json({ matched: true, pk: info });
  }
  await redis.lrem('pk:queue', 0, `${mine.id}:${req.user.id}`);
  await redis.rpush('pk:queue', `${mine.id}:${req.user.id}`);
  await redis.expire('pk:queue', 120);
  res.json({ matched: false, waiting: true });
});

r.post('/pk/random/cancel', auth, async (req, res) => {
  const room = await one(`SELECT id FROM rooms WHERE host_id=$1 AND status='live'`, [req.user.id]);
  if (room) await redis.lrem('pk:queue', 0, `${room.id}:${req.user.id}`);
  res.json({ ok: true });
});

r.post('/pk/:pkId/accept', auth, async (req, res) => {
  const pk = await one(`SELECT * FROM pk_battles WHERE id=$1`, [int(req.params.pkId)]);
  need(pk && pk.status === 'invited' && pk.host_b === req.user.id, 'Invite expired');
  res.json(await startPk(pk.id));
});

r.post('/pk/:pkId/decline', auth, async (req, res) => {
  const pk = await one(`UPDATE pk_battles SET status='declined' WHERE id=$1 AND host_b=$2 AND status='invited' RETURNING *`, [int(req.params.pkId), req.user.id]);
  if (pk) toUser(pk.host_a, 'pk:declined', { pk_id: pk.id });
  res.json({ ok: true });
});

r.post('/pk/:pkId/quit', auth, async (req, res) => {
  const pk = await one(`SELECT * FROM pk_battles WHERE id=$1 AND status='active'`, [int(req.params.pkId)]);
  need(pk && (pk.host_a === req.user.id || pk.host_b === req.user.id), 'Not your PK');
  await finishPk(pk.id, { quitRoom: pk.host_a === req.user.id ? pk.room_a : pk.room_b });
  res.json({ ok: true });
});

r.get('/pk/:pkId', auth, async (req, res) => {
  const pkId = int(req.params.pkId);
  const pkRow = await one('SELECT * FROM pk_battles WHERE id=$1', [pkId]);
  need(pkRow && !['ended', 'declined'].includes(pkRow.status), 'PK not found', 404);
  // Tokens to watch both PK rooms are issued only to active members of one of
  // the two rooms: its host, someone seated, or a viewer who actually joined.
  const uid = req.user.id;
  const isHost = Number(pkRow.host_a) === uid || Number(pkRow.host_b) === uid;
  const viewers = new Set([...(await rs.viewerIds(pkRow.room_a)), ...(await rs.viewerIds(pkRow.room_b))]);
  const seats = [...(await rs.getSeats(pkRow.room_a)), ...(await rs.getSeats(pkRow.room_b))];
  const seated = seats.some((st) => Number(st.user_id) === uid);
  // REST join grants room access (ra: key) before the socket connects
  const joined = (await redis.get(`ra:${pkRow.room_a}:${uid}`)) || (await redis.get(`ra:${pkRow.room_b}:${uid}`));
  need(isHost || viewers.has(uid) || seated || !!joined, 'Join one of the PK rooms first', 403);
  res.json(await pkInfo(pkId, uid));
});

// ---------- red packets (lucky bag) ----------
r.post('/live/:id/redpacket', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.red_packet, 'Red packets are disabled');
  const room = await getLiveRoom(req.params.id);
  need(room.status === 'live', 'Live ended');
  const coins = int(req.body.coins);
  const parts = int(req.body.parts, 10);
  need(coins >= s.red_packet.min_coins, `Minimum ${s.red_packet.min_coins} coins`);
  need(parts >= 1 && parts <= s.red_packet.max_parts && coins >= parts, `Parts must be 1-${s.red_packet.max_parts}`);
  const p = await tx(async (c) => {
    const pkt = await c.one(
      `INSERT INTO red_packets(room_id, sender_id, coins, parts, remaining_coins, remaining_parts, opens_at, expires_at)
       VALUES ($1,$2,$3,$4,$3,$4, now() + make_interval(secs => $5), now() + make_interval(secs => $6)) RETURNING *`,
      [room.id, req.user.id, coins, parts, s.red_packet.delay_sec, s.red_packet.delay_sec + s.red_packet.expire_sec]);
    await changeCoins(c, req.user.id, -coins, 'red_packet', { refType: 'red_packet', refId: pkt.id });
    return pkt;
  });
  toRoom(room.id, 'room:redpacket', { id: p.id, coins, parts, opens_at: p.opens_at, expires_at: p.expires_at, from: await miniProfile(req.user.id) });
  res.json({ id: p.id });
});

r.post('/redpacket/:pid/grab', auth, async (req, res) => {
  const pid = int(req.params.pid);
  const got = await tx(async (c) => {
    const p = await c.one('SELECT * FROM red_packets WHERE id=$1 FOR UPDATE', [pid]);
    need(p, 'Not found');
    need(new Date(p.opens_at) <= new Date(), 'Not open yet');
    need(new Date(p.expires_at) > new Date() && p.remaining_parts > 0 && !p.refunded, 'All gone!');
    need(!(await c.one('SELECT 1 FROM red_packet_grabs WHERE packet_id=$1 AND user_id=$2', [pid, req.user.id])), 'You already grabbed this one');
    // "double average" random split
    let amount = p.remaining_parts === 1 ? p.remaining_coins : Math.max(1, Math.floor(Math.random() * ((p.remaining_coins / p.remaining_parts) * 2)));
    amount = Math.min(amount, p.remaining_coins - (p.remaining_parts - 1));
    await c.q('UPDATE red_packets SET remaining_coins = remaining_coins - $2, remaining_parts = remaining_parts - 1 WHERE id=$1', [pid, amount]);
    await c.q('INSERT INTO red_packet_grabs(packet_id, user_id, coins) VALUES ($1,$2,$3)', [pid, req.user.id, amount]);
    const bal = await changeCoins(c, req.user.id, amount, 'red_packet_grab', { refType: 'red_packet', refId: pid });
    return { amount, balance: bal, room_id: p.room_id };
  });
  toRoom(got.room_id, 'room:system', { text: `${req.user.name} grabbed ${got.amount} coins from the lucky bag 🧧` });
  res.json(got);
});

export default r;

import { one, q, tx } from '../db.js';
import { redis } from '../redis.js';
import * as rs from './roomstate.js';
import { miniProfile, miniProfiles } from './profile.js';
import { toRoom, toUser } from '../lib/io.js';
import { closeRoom, lkToken, setPublish, kickFromRoom } from '../lib/livekit.js';
import { getSettings } from '../lib/settings.js';
import { config } from '../config.js';
import { bumpTask } from './tasks.js';

export const lkRoomName = (roomId) => `live_${roomId}`;

export async function isRoomAdmin(room, userId) {
  if (Number(room.host_id) === Number(userId)) return true;
  return !!(await one('SELECT 1 FROM room_admins WHERE host_id=$1 AND user_id=$2', [room.host_id, userId]));
}

/** Everything a client needs to render the room. */
export async function roomState(room, viewerId) {
  const seats = await rs.getSeats(room.id);
  const seatUsers = {};
  for (const s of seats) if (s.user_id) seatUsers[s.user_id] = await miniProfile(s.user_id);
  const topRaw = await rs.topContributors(room.id, 3);
  const top = [];
  for (const t of topRaw) top.push({ ...(await miniProfile(t.user_id)), coins: t.coins });
  const pkId = await rs.getPk(room.id);
  const pk = pkId ? await pkInfo(pkId, viewerId) : null;
  return {
    host: await miniProfile(room.host_id),
    seats: seats.map((s) => ({ ...s, user: s.user_id ? seatUsers[s.user_id] : null })),
    seat_requests: Number(room.host_id) === Number(viewerId) || (await isRoomAdmin(room, viewerId)) ? await miniProfiles(await rs.seatRequests(room.id)) : [],
    top,
    viewers: await rs.viewerCount(room.id),
    likes: Number(room.likes || 0) + (await rs.getLikes(room.id)),
    pk,
    is_admin: await isRoomAdmin(room, viewerId),
    following: !!(await one('SELECT 1 FROM follows WHERE follower_id=$1 AND followee_id=$2', [viewerId, room.host_id])),
  };
}

export async function pkInfo(pkId, viewerId) {
  const pk = await one('SELECT * FROM pk_battles WHERE id=$1', [pkId]);
  if (!pk || pk.status === 'ended' || pk.status === 'declined') return null;
  const info = {
    id: pk.id, status: pk.status, room_a: pk.room_a, room_b: pk.room_b, score_a: pk.score_a, score_b: pk.score_b,
    ends_at: pk.ends_at, started_at: pk.started_at, duration: pk.duration, winner: pk.winner,
    host_a: await miniProfile(pk.host_a), host_b: await miniProfile(pk.host_b),
    livekit_a: lkRoomName(pk.room_a), livekit_b: lkRoomName(pk.room_b),
  };
  if (viewerId) {
    // token to watch BOTH sides (subscribe only) — the client opens a 2nd connection for the opponent
    info.token_a = await lkToken({ room: info.livekit_a, identity: `${viewerId}`, name: 'viewer', publish: false, ttl: '15m' });
    info.token_b = await lkToken({ room: info.livekit_b, identity: `${viewerId}`, name: 'viewer', publish: false, ttl: '15m' });
  }
  return info;
}

export async function endRoom(roomId, reason = 'host_ended') {
  const room = await one(`UPDATE rooms SET status = CASE WHEN $2='admin_cut' THEN 'cut' ELSE 'ended' END, ended_at = now(), end_reason=$2
                          WHERE id=$1 AND status='live' RETURNING *`, [roomId, reason]);
  if (!room) return null;
  const seconds = Math.max(0, Math.round((new Date(room.ended_at) - new Date(room.started_at)) / 1000));
  const likes = await rs.getLikes(roomId);
  const seen = await rs.totalSeen(roomId);
  await q('UPDATE rooms SET likes = likes + $2, total_viewers = GREATEST(total_viewers, $3) WHERE id=$1', [roomId, likes, seen]);
  const host = await one('SELECT is_host FROM users WHERE id=$1', [room.host_id]);
  if (host?.is_host) {
    const col = room.type === 'game' ? 'game_seconds' : 'live_seconds';
    await q(`INSERT INTO host_daily_stats(host_id, day, ${col}) VALUES ($1, ($2::timestamptz)::date, $3)
             ON CONFLICT (host_id, day) DO UPDATE SET ${col} = host_daily_stats.${col} + $3`, [room.host_id, room.started_at, seconds]);
  }
  if (seconds >= 60) bumpTask(room.host_id, 'live_minutes', Math.floor(seconds / 60));
  const pkId = await rs.getPk(roomId);
  if (pkId) await finishPk(pkId, { quitRoom: roomId });
  // refund pending red packets
  await refundRedPackets(roomId);
  const summary = {
    room_id: roomId, reason, seconds, diamonds: room.diamonds, likes: Number(room.likes) + likes,
    viewers: seen, peak: room.peak_viewers, top: await rs.topContributors(roomId, 3),
  };
  toRoom(roomId, 'room:ended', summary);
  await rs.setHostRoom(room.host_id, null);
  await rs.clearRoom(roomId);
  await redis.del(`hb:room:${roomId}`);
  closeRoom(lkRoomName(roomId));
  return summary;
}

// ---------------- PK ----------------
const pkTimers = new Map();

export async function startPk(pkId) {
  const s = await getSettings();
  const pk = await one(`UPDATE pk_battles SET status='active', started_at=now(), duration=$2::int, ends_at = now() + make_interval(secs => $2::int)
                        WHERE id=$1 AND status='invited' RETURNING *`, [pkId, s.pk.duration]);
  if (!pk) return null;
  await rs.setPk(pk.room_a, pk.id);
  await rs.setPk(pk.room_b, pk.id);
  const info = await pkInfo(pk.id);
  toRoom(pk.room_a, 'pk:start', info);
  toRoom(pk.room_b, 'pk:start', info);
  schedulePkEnd(pk.id, s.pk.duration * 1000);
  return info;
}

export function schedulePkEnd(pkId, ms) {
  clearTimeout(pkTimers.get(pkId));
  pkTimers.set(pkId, setTimeout(() => finishPk(pkId).catch((e) => console.error('[pk]', e)), Math.max(0, ms)));
}

/** End the battle: decide winner, show punishment period, then clear. */
export async function finishPk(pkId, { quitRoom = null } = {}) {
  clearTimeout(pkTimers.get(pkId));
  pkTimers.delete(pkId);
  const pk = await one('SELECT * FROM pk_battles WHERE id=$1', [pkId]);
  if (!pk || !['active', 'invited'].includes(pk.status)) return;
  if (pk.status === 'invited') {
    await q(`UPDATE pk_battles SET status='declined' WHERE id=$1`, [pkId]);
    return;
  }
  let winner = null;
  if (quitRoom) winner = Number(quitRoom) === Number(pk.room_a) ? pk.host_b : pk.host_a;
  else if (pk.score_a > pk.score_b) winner = pk.host_a;
  else if (pk.score_b > pk.score_a) winner = pk.host_b;
  const s = await getSettings();
  await q(`UPDATE pk_battles SET status=$2, winner=$3, ends_at=now() WHERE id=$1`, [pkId, quitRoom ? 'ended' : 'punishment', winner]);
  if (winner) {
    await q(`INSERT INTO host_daily_stats(host_id, day, pk_wins) VALUES ($1, CURRENT_DATE, 1)
             ON CONFLICT (host_id, day) DO UPDATE SET pk_wins = host_daily_stats.pk_wins + 1`, [winner]);
  }
  const tops = await q(
    `SELECT room_id, sender_id, sum(coins)::bigint AS coins FROM gift_transactions WHERE pk_id=$1
     GROUP BY room_id, sender_id ORDER BY coins DESC LIMIT 10`, [pkId]);
  const ev = { pk_id: pkId, winner, score_a: pk.score_a, score_b: pk.score_b, room_a: pk.room_a, room_b: pk.room_b, punishment: quitRoom ? 0 : s.pk.punishment, top: [] };
  for (const t of tops) ev.top.push({ room_id: t.room_id, coins: t.coins, user: await miniProfile(t.sender_id) });
  toRoom(pk.room_a, 'pk:end', ev);
  toRoom(pk.room_b, 'pk:end', ev);
  const clear = async () => {
    await q(`UPDATE pk_battles SET status='ended' WHERE id=$1`, [pkId]);
    await rs.setPk(pk.room_a, null);
    await rs.setPk(pk.room_b, null);
    toRoom(pk.room_a, 'pk:closed', { pk_id: pkId });
    toRoom(pk.room_b, 'pk:closed', { pk_id: pkId });
  };
  if (quitRoom) await clear();
  else setTimeout(() => clear().catch(() => {}), s.pk.punishment * 1000);
}

/** After a restart, re-arm timers for PKs that are still running. */
export async function recoverPkTimers() {
  const rows = await q(`SELECT id, ends_at FROM pk_battles WHERE status='active'`);
  for (const r of rows) schedulePkEnd(r.id, new Date(r.ends_at) - Date.now());
  await q(`UPDATE pk_battles SET status='ended' WHERE status IN ('punishment') AND ends_at < now() - interval '5 minutes'`);
}

// ---------------- Seats ----------------
export async function placeOnSeat(room, userId, seatNo) {
  const seats = await rs.getSeats(room.id);
  if (seats.some((s) => Number(s.user_id) === Number(userId))) return seats;
  let seat = seatNo ? seats.find((s) => s.seat === Number(seatNo)) : seats.find((s) => !s.user_id && !s.locked);
  if (!seat || seat.user_id || seat.locked) throw Object.assign(new Error('No free seat'), { status: 400 });
  seat.user_id = Number(userId);
  seat.muted = false;
  await rs.setSeats(room.id, seats);
  await rs.removeSeatRequest(room.id, userId);
  await setPublish(lkRoomName(room.id), userId, true);
  await broadcastSeats(room.id, seats);
  return seats;
}

/**
 * Is this user currently entitled to PUBLISH in this room?
 * Host always is; a guest only while actively seated and not seat-muted.
 * Used by the LiveKit webhook to reconcile joins made with stale tokens.
 */
export async function publishEntitlement(room, userId) {
  if (!room || room.status !== 'live') return false;
  if (Number(room.host_id) === Number(userId)) return true;
  const seats = await rs.getSeats(room.id);
  const seat = seats.find((s) => Number(s.user_id) === Number(userId));
  return !!seat && !seat.muted;
}

export async function removeFromSeat(room, userId, { kick = false } = {}) {
  const seats = await rs.getSeats(room.id);
  const seat = seats.find((s) => Number(s.user_id) === Number(userId));
  if (!seat) return seats;
  seat.user_id = null;
  seat.muted = false;
  await rs.setSeats(room.id, seats);
  await setPublish(lkRoomName(room.id), userId, false);
  // Forced removal also drops the live SFU session: otherwise the removed user
  // keeps publishing until their (old, publish-capable) token session ends.
  if (kick) await kickFromRoom(lkRoomName(room.id), userId);
  await broadcastSeats(room.id, seats);
  toUser(userId, 'seat:removed', { room_id: room.id });
  return seats;
}

export async function broadcastSeats(roomId, seats) {
  const out = [];
  for (const s of seats) out.push({ ...s, user: s.user_id ? await miniProfile(s.user_id) : null });
  toRoom(roomId, 'seat:update', { room_id: roomId, seats: out });
}

// ---------------- Red packets ----------------
export async function refundRedPackets(roomId) {
  const rows = await q(`SELECT * FROM red_packets WHERE room_id=$1 AND NOT refunded AND remaining_coins > 0`, [roomId]);
  const { changeCoins } = await import('../lib/wallet.js');
  for (const p of rows) {
    await tx(async (c) => {
      const upd = await c.one('UPDATE red_packets SET refunded=true WHERE id=$1 AND NOT refunded RETURNING remaining_coins', [p.id]);
      if (upd && upd.remaining_coins > 0) await changeCoins(c, p.sender_id, upd.remaining_coins, 'red_packet_refund', { refType: 'red_packet', refId: p.id });
    });
  }
}

export const livekitUrl = () => config.livekit.url;

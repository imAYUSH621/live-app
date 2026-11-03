import { redis } from '../redis.js';

// Fast-changing live room state lives in Redis; the DB only keeps the summary.
const K = (id, s) => `room:${id}:${s}`;

export async function addViewer(roomId, userId) {
  await redis.sadd(K(roomId, 'viewers'), String(userId));
  await redis.sadd(K(roomId, 'seen'), String(userId));
  return redis.scard(K(roomId, 'viewers'));
}
export async function removeViewer(roomId, userId) {
  await redis.srem(K(roomId, 'viewers'), String(userId));
  return redis.scard(K(roomId, 'viewers'));
}
export const viewerCount = (roomId) => redis.scard(K(roomId, 'viewers'));
export const viewerIds = async (roomId) => (await redis.smembers(K(roomId, 'viewers'))).map(Number);
export const totalSeen = (roomId) => redis.scard(K(roomId, 'seen'));

export async function kick(roomId, userId, minutes = 60) {
  await redis.set(`${K(roomId, 'kicked')}:${userId}`, '1', 'EX', minutes * 60);
}
export const isKicked = async (roomId, userId) => !!(await redis.get(`${K(roomId, 'kicked')}:${userId}`));

export async function mute(roomId, userId, minutes = 10) {
  await redis.set(`${K(roomId, 'muted')}:${userId}`, '1', 'EX', minutes * 60);
}
export const unmute = (roomId, userId) => redis.del(`${K(roomId, 'muted')}:${userId}`);
export const isMuted = async (roomId, userId) => !!(await redis.get(`${K(roomId, 'muted')}:${userId}`));

// Seats: [{ seat, user_id, muted, locked }] (seat 0 = host)
export async function getSeats(roomId) {
  const v = await redis.get(K(roomId, 'seats'));
  return v ? JSON.parse(v) : [];
}
export async function setSeats(roomId, seats) {
  await redis.set(K(roomId, 'seats'), JSON.stringify(seats), 'EX', 86400);
}
export async function initSeats(roomId, count) {
  const seats = Array.from({ length: count }, (_, i) => ({ seat: i + 1, user_id: null, muted: false, locked: false }));
  await setSeats(roomId, seats);
  return seats;
}

// Seat requests (viewers asking to join)
export const addSeatRequest = (roomId, userId) => redis.zadd(K(roomId, 'seatreq'), Date.now(), String(userId));
export const removeSeatRequest = (roomId, userId) => redis.zrem(K(roomId, 'seatreq'), String(userId));
export const seatRequests = async (roomId) => (await redis.zrange(K(roomId, 'seatreq'), 0, -1)).map(Number);

// Top contributors this session
export const addContribution = (roomId, userId, coins) => redis.zincrby(K(roomId, 'top'), coins, String(userId));
export async function topContributors(roomId, n = 10) {
  const r = await redis.zrevrange(K(roomId, 'top'), 0, n - 1, 'WITHSCORES');
  const out = [];
  for (let i = 0; i < r.length; i += 2) out.push({ user_id: Number(r[i]), coins: Number(r[i + 1]) });
  return out;
}

export const setPk = (roomId, pkId) => (pkId ? redis.set(K(roomId, 'pk'), String(pkId), 'EX', 3600) : redis.del(K(roomId, 'pk')));
export const getPk = async (roomId) => Number(await redis.get(K(roomId, 'pk'))) || null;

export async function addLikes(roomId, n) {
  return redis.incrby(K(roomId, 'likes'), n);
}
export const getLikes = async (roomId) => Number(await redis.get(K(roomId, 'likes'))) || 0;

export async function clearRoom(roomId) {
  const keys = await redis.keys(`room:${roomId}:*`);
  if (keys.length) await redis.del(...keys);
}

// Presence
export async function setOnline(userId, on) {
  if (on) await redis.sadd('online', String(userId));
  else await redis.srem('online', String(userId));
}
export const isOnline = async (userId) => (await redis.sismember('online', String(userId))) === 1;
export const onlineCount = () => redis.scard('online');

// Busy flag for 1v1 calls
export const setBusy = (userId, callId) => (callId ? redis.set(`busy:${userId}`, String(callId), 'EX', 7200) : redis.del(`busy:${userId}`));
export const busyCall = async (userId) => Number(await redis.get(`busy:${userId}`)) || null;

// Which live room a host is currently running
export const setHostRoom = (hostId, roomId) => (roomId ? redis.set(`hostroom:${hostId}`, String(roomId), 'EX', 86400) : redis.del(`hostroom:${hostId}`));
export const hostRoom = async (hostId) => Number(await redis.get(`hostroom:${hostId}`)) || null;

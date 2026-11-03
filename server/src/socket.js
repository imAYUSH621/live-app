import { Server } from 'socket.io';
import { one, q } from './db.js';
import { redis } from './redis.js';
import { verifyToken } from './lib/auth.js';
import { setIO, toRoom, toUser } from './lib/io.js';
import { filterText } from './lib/moderation.js';
import { getSettings } from './lib/settings.js';
import * as rs from './services/roomstate.js';
import { miniProfile } from './services/profile.js';
import { bumpTask, markActive } from './services/tasks.js';
import { endCall } from './services/calls.js';

export function initSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    pingInterval: 20000,
    pingTimeout: 25000,
    maxHttpBufferSize: 1e7, // 10MB payload limit for high-res camera frames
  });
  setIO(io);

  io.use(async (socket, next) => {
    const p = verifyToken(socket.handshake.auth?.token || socket.handshake.query?.token);
    if (!p) return next(new Error('unauthorized'));
    if (p.k === 'admin') {
      socket.data.admin = { id: p.id };
      return next();
    }
    if (p.k !== 'user') return next(new Error('unauthorized'));
    const u = await one(`SELECT id, status, family_id, ban_until FROM users WHERE id=$1`, [p.id]);
    if (!u || u.status === 'deleted' || (u.status === 'banned' && (!u.ban_until || new Date(u.ban_until) > new Date()))) return next(new Error('banned'));
    socket.data.user = u;
    socket.data.rooms = new Map(); // roomId -> joinedAt
    next();
  });

  io.on('connection', async (socket) => {
    if (socket.data.admin) {
      socket.join('admins');
      return;
    }
    const uid = socket.data?.user?.id;
    if (!uid) return;

    try {
      socket.join(`u:${uid}`);
      if (socket.data.user?.family_id) socket.join(`f:${socket.data.user.family_id}`);
      await redis.hincrby('sockets', String(uid), 1).catch(() => {});
      await rs.setOnline(uid, true).catch(() => {});
      q('UPDATE users SET online_at=now() WHERE id=$1', [uid]).catch(() => {});
      markActive(uid);
    } catch (e) {
      console.warn('[Socket connection setup]', e.message);
    }

    // ---------- live rooms ----------
    socket.on('room:join', async ({ roomId } = {}, ack) => {
      try {
        roomId = Number(roomId);
        if (!roomId) return ack?.({ ok: false, error: 'Invalid room ID' });
        const room = await one(`SELECT id, host_id, status, privacy FROM rooms WHERE id=$1`, [roomId]);
        if (!room || room.status !== 'live') return ack?.({ ok: false, error: 'Live ended' });
        const isHost = Number(room.host_id) === Number(uid);
        const allowed = isHost || (await redis.get(`ra:${roomId}:${uid}`)) || room.privacy === 'public' || !room.privacy;
        if (!allowed) return ack?.({ ok: false, error: 'Join via the app first' });
        if (await rs.isKicked(roomId, uid)) return ack?.({ ok: false, error: 'You were removed from this live' });
        socket.join(`r:${roomId}`);
        socket.data.rooms.set(roomId, Date.now());
        const viewers = await rs.addViewer(roomId, uid);
        await q('UPDATE rooms SET peak_viewers = GREATEST(peak_viewers, $2) WHERE id=$1', [roomId, viewers]);
        const user = await miniProfile(uid);
        if (!isHost) toRoom(roomId, 'room:enter', { user, viewers });

        ack?.({ ok: true, viewers, isHost });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    const leaveRoom = async (roomId) => {
      roomId = Number(roomId);
      if (!roomId || !socket.data.rooms.has(roomId)) return;
      const joinedAt = socket.data.rooms.get(roomId);
      socket.data.rooms.delete(roomId);
      socket.leave(`r:${roomId}`);
      // other sockets of the same user might still be in the room
      const others = (await io.in(`u:${uid}`).fetchSockets()).some((s) => s.id !== socket.id && s.rooms.has(`r:${roomId}`));
      if (!others) {
        const viewers = await rs.removeViewer(roomId, uid);
        toRoom(roomId, 'room:viewers', { viewers, left: uid });
      }
      const minutes = Math.floor((Date.now() - joinedAt) / 60000);
      if (minutes > 0) bumpTask(uid, 'watch_minutes', minutes);
    };

    socket.on('room:leave', async ({ roomId } = {}) => leaveRoom(Number(roomId)).catch(() => {}));

    socket.on('room:chat', async ({ roomId, text } = {}, ack) => {
      try {
        roomId = Number(roomId);
        if (!roomId) return ack?.({ ok: false, error: 'Invalid room' });
        if (!socket.data.rooms.has(roomId)) {
          socket.join(`r:${roomId}`);
          socket.data.rooms.set(roomId, Date.now());
        }
        const s = await getSettings();
        const u = await one('SELECT muted_until FROM users WHERE id=$1', [uid]);
        if ((u.muted_until && new Date(u.muted_until) > new Date()) || (await rs.isMuted(roomId, uid))) return ack?.({ ok: false, error: 'You are muted' });
        const slow = await redis.set(`slow:${roomId}:${uid}`, '1', 'PX', s.room.chat_slow_ms, 'NX');
        if (!slow) return ack?.({ ok: false, error: 'Slow down' });
        const clean = (await filterText(String(text || '').slice(0, 200))).text.trim();
        if (!clean) return ack?.({ ok: false });
        const fan = await one('SELECT f.intimacy FROM fan_clubs f JOIN rooms r ON r.host_id=f.host_id WHERE r.id=$1 AND f.user_id=$2', [roomId, uid]);
        const msg = { id: `${Date.now()}${uid}`, user: await miniProfile(uid), text: clean, ts: Date.now(), fan_level: fan ? 1 + Math.floor(Math.sqrt(Number(fan.intimacy) / 1000)) : 0 };
        toRoom(roomId, 'room:chat', msg);
        bumpTask(uid, 'chat', 1);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('room:like', async ({ roomId, n = 1 } = {}) => {
      roomId = Number(roomId);
      if (!roomId) return;
      if (!socket.data.rooms.has(roomId)) {
        socket.join(`r:${roomId}`);
        socket.data.rooms.set(roomId, Date.now());
      }
      const total = await rs.addLikes(roomId, Math.min(Math.max(1, Number(n) || 1), 30));
      const s = await getSettings();
      const go = await redis.set(`likeb:${roomId}`, '1', 'PX', s.room.like_batch_ms, 'NX');
      if (go) toRoom(roomId, 'room:likes', { likes: total, from: uid });
    });

    socket.on('host:heartbeat', async ({ roomId } = {}) => {
      roomId = Number(roomId);
      const room = await one(`SELECT host_id FROM rooms WHERE id=$1 AND status='live'`, [roomId]);
      if (room && Number(room.host_id) === Number(uid)) await redis.set(`hb:room:${roomId}`, Date.now(), 'EX', 120);
    });

    // ---------- Room WebRTC signaling (Host <-> Viewer real-time audio/video) ----------
    socket.on('room:signal', async ({ roomId, to, data } = {}) => {
      try {
        roomId = Number(roomId);
        if (!roomId || !data) return;
        const payload = { roomId, from: uid, to: to || null, data };
        if (to) {
          if (!isNaN(Number(to))) {
            toUser(Number(to), 'room:signal', payload);
          }
          // Also broadcast to room channel with target specified so recipient can filter it
          socket.to(`r:${roomId}`).emit('room:signal', payload);
        } else {
          socket.to(`r:${roomId}`).emit('room:signal', payload);
        }
      } catch (e) {
        console.warn('[WebRTC room:signal error]', e.message);
      }
    });

    // ---------- 1v1 call WebRTC signaling (offer / answer / ICE candidates) ----------
    socket.on('call:signal', async ({ callId, data } = {}) => {
      const call = await one(`SELECT caller_id, host_id, status FROM calls WHERE id=$1`, [Number(callId)]);
      if (!call || !['ringing', 'active'].includes(call.status)) return;
      if (call.caller_id !== uid && call.host_id !== uid) return;
      const to = call.caller_id === uid ? call.host_id : call.caller_id;
      toUser(to, 'call:signal', { call_id: Number(callId), from: uid, data });
    });

    socket.on('dm:typing', ({ to } = {}) => to && toUser(Number(to), 'dm:typing', { from: uid }));

    socket.on('family:subscribe', async () => {
      const u = await one('SELECT family_id FROM users WHERE id=$1', [uid]);
      for (const r of socket.rooms) if (r.startsWith('f:')) socket.leave(r);
      if (u?.family_id) socket.join(`f:${u.family_id}`);
    });

    socket.on('disconnect', async () => {
      for (const roomId of [...socket.data.rooms.keys()]) await leaveRoom(roomId).catch(() => {});
      const left = await redis.hincrby('sockets', String(uid), -1);
      if (left <= 0) {
        await redis.hdel('sockets', String(uid));
        await rs.setOnline(uid, false);
        q('UPDATE users SET online_at=now() WHERE id=$1', [uid]).catch(() => {});
        // drop an active call if the user does not come back within 20s
        const callId = await rs.busyCall(uid);
        if (callId) {
          setTimeout(async () => {
            const n = Number(await redis.hget('sockets', String(uid))) || 0;
            if (n <= 0) await endCall(callId, 'disconnect');
          }, 20000);
        }
      }
    });
  });

  return io;
}

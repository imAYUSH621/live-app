import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, int, notFound, forbidden, page } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { changeCoins } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';
import { pushToUser } from '../lib/push.js';
import { redis } from '../redis.js';
import { busyCall, isOnline } from '../services/roomstate.js';
import { miniProfile } from '../services/profile.js';
import { acceptCall, endCall, iceServers } from '../services/calls.js';

const r = Router();
const auth = userAuth();

async function ring(caller, host, kind, mode) {
  const call = await one(
    `INSERT INTO calls(caller_id, host_id, kind, mode, rate, status) VALUES ($1,$2,$3,$4,$5,'ringing') RETURNING *`,
    [caller.id, host.id, kind, mode, host.call_rate]);
  const from = await miniProfile(caller.id);
  toUser(host.id, 'call:incoming', { call_id: call.id, kind, mode, rate: call.rate, from });
  pushToUser(host.id, 'Incoming call', `${from.name} is calling you`, { call_id: call.id }).catch(() => {});
  return call;
}

async function checkCallable(caller, host, kind) {
  const s = await getSettings();
  need(s.features.calls, 'Calls are disabled');
  need(host && host.status === 'active', 'User not available');
  need(host.id !== caller.id, 'Invalid');
  need(host.is_host, 'You can only call verified hosts');
  need(host.call_enabled, 'This host is not taking calls right now');
  need(await isOnline(host.id), 'Host is offline');
  need(!(await busyCall(host.id)), 'Host is busy on another call');
  need(!(await busyCall(caller.id)), 'You are already on a call');
  if (await one('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [host.id, caller.id])) throw forbidden('You cannot call this user');
  const minNeeded = host.call_rate * s.economy.call_min_balance_minutes;
  need(caller.coins >= minNeeded, `You need at least ${minNeeded} coins to call (rate ${host.call_rate}/min)`);
  need(['video', 'audio'].includes(kind), 'Invalid call type');
}

r.get('/calls/ice', auth, async (req, res) => res.json({ iceServers: iceServers(req.user.id) }));

r.post('/calls', auth, async (req, res) => {
  const host = await one('SELECT * FROM users WHERE id=$1', [int(req.body.host_id)]);
  const kind = req.body.kind || 'video';
  await checkCallable(req.user, host, kind);
  const call = await ring(req.user, host, kind, 'direct');
  res.json({ call, host: await miniProfile(host.id), iceServers: iceServers(req.user.id) });
});

// Random match: picks an online, free host (optional gender filter costs coins)
r.post('/calls/random', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.random_match, 'Random match is disabled');
  const gender = ['male', 'female'].includes(req.body.gender) ? req.body.gender : null;
  const kind = req.body.kind || 'video';
  const online = (await redis.smembers('online')).map(Number);
  const candidates = await q(
    `SELECT * FROM users WHERE id = ANY($1) AND is_host AND call_enabled AND status='active' AND id<>$2
     ${gender ? 'AND gender=$3' : ''} AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=$2)
     ORDER BY random() LIMIT 20`, gender ? [online, req.user.id, gender] : [online, req.user.id]);
  let host = null;
  for (const c of candidates) {
    if (!(await busyCall(c.id)) && req.user.coins >= c.call_rate) { host = c; break; }
  }
  if (!host) throw notFound('No host available right now. Try again in a moment.');
  if (gender && s.economy.match_filter_coins > 0) {
    await tx((c) => changeCoins(c, req.user.id, -s.economy.match_filter_coins, 'match_filter'));
  }
  await checkCallable(await one('SELECT * FROM users WHERE id=$1', [req.user.id]), host, kind);
  const call = await ring(req.user, host, kind, 'random');
  res.json({ call, host: await miniProfile(host.id), iceServers: iceServers(req.user.id) });
});

r.post('/calls/:id/accept', auth, async (req, res) => {
  const call = await one(`SELECT * FROM calls WHERE id=$1`, [int(req.params.id)]);
  need(call && call.host_id === req.user.id && call.status === 'ringing', 'Call is no longer ringing');
  const upd = await acceptCall(call);
  need(upd, 'Caller does not have enough coins');
  toUser(call.caller_id, 'call:accepted', { call_id: call.id, host: await miniProfile(call.host_id) });
  res.json({ call: upd, caller: await miniProfile(call.caller_id), iceServers: iceServers(req.user.id) });
});

r.post('/calls/:id/reject', auth, async (req, res) => {
  const call = await one(`SELECT * FROM calls WHERE id=$1`, [int(req.params.id)]);
  need(call && call.host_id === req.user.id, 'Not found');
  await endCall(call.id, 'rejected');
  res.json({ ok: true });
});

r.post('/calls/:id/end', auth, async (req, res) => {
  const call = await one(`SELECT * FROM calls WHERE id=$1`, [int(req.params.id)]);
  need(call && (call.host_id === req.user.id || call.caller_id === req.user.id), 'Not found');
  res.json((await endCall(call.id, call.caller_id === req.user.id ? 'caller_hangup' : 'host_hangup')) || { ok: true });
});

r.post('/calls/:id/rate', auth, async (req, res) => {
  await q('UPDATE calls SET rating=$3 WHERE id=$1 AND caller_id=$2', [int(req.params.id), req.user.id, Math.min(5, Math.max(1, int(req.body.stars, 5)))]);
  res.json({ ok: true });
});

r.get('/calls/history', auth, async (req, res) => {
  const { limit, offset } = page(req, 30);
  const rows = await q(
    `SELECT * FROM calls WHERE caller_id=$1 OR host_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3`, [req.user.id, limit, offset]);
  for (const c of rows) c.other = await miniProfile(c.caller_id === req.user.id ? c.host_id : c.caller_id);
  res.json(rows);
});

export default r;

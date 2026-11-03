import crypto from 'node:crypto';
import { one, q, tx } from '../db.js';
import { redis } from '../redis.js';
import { config } from '../config.js';
import { changeCoins, changeDiamonds, addHostDiamondStat } from '../lib/wallet.js';
import { getSettings } from '../lib/settings.js';
import { toUser } from '../lib/io.js';
import { setBusy } from './roomstate.js';

/**
 * 1v1 calls are pure peer-to-peer WebRTC (no media server = zero server bandwidth when P2P works).
 * STUN finds the direct path; our own coturn TURN relays only when a network blocks P2P.
 * TURN credentials are short-lived (coturn "use-auth-secret" REST scheme).
 */
export function iceServers(userId) {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (config.turn.urls && config.turn.secret) {
    const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', config.turn.secret).update(username).digest('base64');
    servers.push({ urls: config.turn.urls.split(',').map((s) => s.trim()), username, credential });
  }
  return servers;
}

const NEXT = (id) => `call:${id}:next`;

/** Charge one minute. Returns false if the caller can't pay (call must end). */
async function chargeMinute(call) {
  const eco = (await getSettings()).economy;
  try {
    const bal = await tx(async (c) => {
      const b = await changeCoins(c, call.caller_id, -call.rate, 'call', { refType: 'call', refId: call.id });
      const d = Math.floor((call.rate * eco.call_host_pct) / 100);
      await changeDiamonds(c, call.host_id, d, 'call_income', { refType: 'call', refId: call.id });
      await addHostDiamondStat(c, call.host_id, d);
      await c.q('UPDATE calls SET coins = coins + $2, diamonds = diamonds + $3 WHERE id=$1', [call.id, call.rate, d]);
      return b;
    });
    toUser(call.caller_id, 'wallet:update', { coins: bal });
    if (bal < call.rate) toUser(call.caller_id, 'call:low_balance', { call_id: call.id, coins: bal, rate: call.rate });
    return true;
  } catch (e) {
    if (e.code === 'insufficient_coins' || e.code === 'wallet_frozen') return false;
    throw e;
  }
}

export async function acceptCall(call) {
  const ok = await chargeMinute(call); // first minute paid up-front
  if (!ok) {
    await endCall(call.id, 'balance');
    return null;
  }
  const upd = await one(`UPDATE calls SET status='active', started_at=now() WHERE id=$1 AND status='ringing' RETURNING *`, [call.id]);
  if (!upd) return null;
  await setBusy(call.caller_id, call.id);
  await setBusy(call.host_id, call.id);
  await redis.set(NEXT(call.id), Date.now() + 60_000, 'EX', 7200);
  return upd;
}

export async function endCall(callId, reason = 'hangup') {
  const call = await one(
    `UPDATE calls SET status = CASE WHEN status='ringing' THEN (CASE WHEN $2='rejected' THEN 'rejected' ELSE 'missed' END) ELSE 'ended' END,
       ended_at = now(), end_reason=$2,
       seconds = CASE WHEN started_at IS NULL THEN 0 ELSE EXTRACT(EPOCH FROM now() - started_at)::int END
     WHERE id=$1 AND status IN ('ringing','active') RETURNING *`, [callId, reason]);
  if (!call) return null;
  await redis.del(NEXT(callId));
  await setBusy(call.caller_id, null);
  await setBusy(call.host_id, null);
  if (call.seconds > 0) {
    await q(`INSERT INTO host_daily_stats(host_id, day, call_seconds) VALUES ($1, CURRENT_DATE, $2)
             ON CONFLICT (host_id, day) DO UPDATE SET call_seconds = host_daily_stats.call_seconds + $2`, [call.host_id, call.seconds]);
  }
  const ev = { call_id: call.id, reason, seconds: call.seconds, coins: call.coins, diamonds: call.diamonds, status: call.status };
  toUser(call.caller_id, 'call:ended', ev);
  toUser(call.host_id, 'call:ended', ev);
  return call;
}

/** Runs every 5s: bill active calls each minute, time-out unanswered calls. */
export async function callTicker() {
  const active = await q(`SELECT * FROM calls WHERE status='active'`);
  for (const call of active) {
    const next = Number(await redis.get(NEXT(call.id))) || 0;
    if (Date.now() >= next) {
      const ok = await chargeMinute(call);
      if (!ok) await endCall(call.id, 'balance');
      else await redis.set(NEXT(call.id), Date.now() + 60_000, 'EX', 7200);
    }
  }
  const stale = await q(`SELECT id FROM calls WHERE status='ringing' AND created_at < now() - interval '35 seconds'`);
  for (const c of stale) await endCall(c.id, 'no_answer');
}

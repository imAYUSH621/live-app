import { WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../config.js';
import { one } from '../db.js';
import { redis } from '../redis.js';
import { publishEntitlement } from '../services/live.js';
import { kickFromRoom, TrackSource } from '../lib/livekit.js';

const receiver = new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret);

/**
 * LiveKit SFU lifecycle webhook (configure the SFU with:
 *   webhook: { api_key: <LIVEKIT_API_KEY>, urls: [<this URL>] }).
 *
 * LiveKit has no token revocation: a publish-capable JWT stays valid until it
 * expires. This endpoint is the server-controlled reconciliation for that gap:
 * every participant join / track publish in a live_* room is checked against
 * the CURRENT entitlement (host, or actively seated and unmuted). A stale
 * token from before a seat removal/mute reconnects for at most the webhook
 * round-trip before being disconnected.
 *
 * Mount with express.raw BEFORE express.json (signature needs the raw body).
 */
export async function livekitWebhook(req, res) {
  let ev;
  try {
    ev = await receiver.receive(req.body.toString('utf8'), req.headers.authorization);
  } catch {
    return res.status(400).json({ error: 'bad signature' });
  }
  // Proof of delivery: a signature-verified event actually arrived from the
  // SFU. Production seat publishing is gated on this, not on the env flag
  // alone - a typo'd or unreachable webhook URL must not silently enable
  // seat publishing without the reconciliation path being live.
  // 1h TTL, refreshed by every verified event: if the delivery path breaks,
  // the production seat gate closes again within an hour. (A fully quiet
  // deployment also lets it lapse - the next room's join event re-proves it.)
  await redis.set('lk:webhook:delivered', String(Date.now()), 'EX', 3600);
  try {
    const m = /^live_(\d+)$/.exec(ev.room?.name || '');
    if (m && (ev.event === 'participant_joined' || ev.event === 'track_published')) {
      const room = await one('SELECT * FROM rooms WHERE id=$1', [Number(m[1])]);
      const userId = Number(ev.participant?.identity);
      const entitled = userId ? await publishEntitlement(room, userId) : false;
      const isHost = room && Number(room.host_id) === userId;
      if (!entitled && ev.participant?.permission?.canPublish) {
        // stale publish grant (e.g. removed seat reconnecting with an unexpired token)
        await kickFromRoom(ev.room.name, userId);
        console.warn(`[livekit-webhook] kicked ${userId} from ${ev.room.name}: publish grant without entitlement`);
      } else if (entitled && !isHost && room?.type === 'party' && ev.event === 'track_published'
                 && ev.track && ev.track.source !== TrackSource.MICROPHONE) {
        // audio rooms are mic-only; a stale broad token must not publish camera/screen
        await kickFromRoom(ev.room.name, userId);
        console.warn(`[livekit-webhook] kicked ${userId} from ${ev.room.name}: non-audio track in party room`);
      }
    }
  } catch (e) {
    console.warn('[livekit-webhook] reconcile failed:', e.message);
  }
  res.json({ ok: true });
}

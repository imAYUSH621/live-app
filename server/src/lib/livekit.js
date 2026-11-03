import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config.js';

const svc = new RoomServiceClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret);

/**
 * Create a LiveKit (WebRTC SFU) access token.
 * publish=true for hosts / seated guests / call participants; viewers only subscribe.
 */
export async function lkToken({ room, identity, name, publish = false, sources, ttl = '6h', metadata }) {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: String(identity), name, ttl, metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
  at.addGrant({
    room, roomJoin: true, canSubscribe: true, canPublishData: true,
    canPublish: publish, canPublishSources: publish ? sources : undefined,
  });
  return at.toJwt();
}

/** Grant/revoke publish permission for someone already connected (seat up / seat down). */
export async function setPublish(room, identity, canPublish) {
  try {
    await svc.updateParticipant(room, String(identity), undefined, {
      canPublish, canSubscribe: true, canPublishData: true,
    });
    return true;
  } catch (e) {
    console.warn('[livekit] updateParticipant failed:', e.message);
    return false;
  }
}

export async function kickFromRoom(room, identity) {
  try { await svc.removeParticipant(room, String(identity)); } catch { /* not connected */ }
}

export async function closeRoom(room) {
  try { await svc.deleteRoom(room); } catch { /* already closed */ }
}

export async function muteTrack(room, identity, muted = true) {
  try {
    const p = await svc.getParticipant(room, String(identity));
    for (const t of p.tracks || []) {
      if (t.type === 1 /* AUDIO */) await svc.mutePublishedTrack(room, String(identity), t.sid, muted);
    }
  } catch { /* ignore */ }
}

export async function livekitHealthy() {
  try { await svc.listRooms(); return true; } catch { return false; }
}

export const livekitPublicUrl = () => config.livekit.url;

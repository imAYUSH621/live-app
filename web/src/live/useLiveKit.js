// LiveKit SFU media client for live rooms.
// Uses the room token + livekit_url from /live/start and /live/:id/join and the
// livekit-client SDK already shipped with the app. The previous Socket.IO
// WebRTC-mesh implementation is preserved in git history.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import { api } from '../api.js';

function attachVideo(container, track, { mirror = false } = {}) {
  if (!container) return;
  let v = container.querySelector(`video[data-lk="${track.sid || 'local'}"]`);
  if (!v) {
    v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true; // local preview / remote video element; remote audio plays on its own element
    v.dataset.lk = track.sid || 'local';
    if (mirror) v.style.transform = 'scaleX(-1)';
    container.appendChild(v);
  }
  track.attach(v);
}

function detachVideo(container, track) {
  try { track.detach(); } catch { /* already detached */ }
  const v = container?.querySelector(`video[data-lk="${track.sid || 'local'}"]`);
  if (v) v.remove();
}

/**
 * useLiveKit(rtc, { isHost, type, hostUid, videoEl, lowData, audioOnly, socket, roomId })
 * rtc = { token, livekit_url } from the room join response.
 * Returns { hostVideo, micOn, error, toggleMic, flipCamera, setSeatMic }.
 */
export function useLiveKit(rtc, { isHost, type, videoEl, audioOnly = false }) {
  const [state, setState] = useState({ hostVideo: false, micOn: true, error: null });
  const roomRef = useRef(null);
  const localVideo = useRef(null);
  const facing = useRef('user');

  useEffect(() => {
    if (!rtc?.token || !rtc?.livekit_url) return undefined;
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        attachVideo(videoEl?.current, track);
        setState((s) => ({ ...s, hostVideo: true }));
      } else {
        // remote audio: attach to a playing element
        const el = track.attach();
        el.autoplay = true;
        (videoEl?.current || document.body).appendChild(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        detachVideo(videoEl?.current, track);
        setState((s) => ({ ...s, hostVideo: false }));
      } else {
        track.detach().forEach((el) => el.remove());
      }
    });
    room.on(RoomEvent.Disconnected, () => setState((s) => ({ ...s, hostVideo: false })));

    (async () => {
      try {
        await room.connect(rtc.livekit_url, rtc.token);
        if (cancelled) return;
        if (isHost) {
          const wantVideo = type === 'video' && !audioOnly;
          const tracks = await createLocalTracks({ audio: true, video: wantVideo ? { facingMode: facing.current } : false });
          if (cancelled) { tracks.forEach((t) => t.stop()); return; }
          for (const t of tracks) {
            await room.localParticipant.publishTrack(t);
            if (t.kind === Track.Kind.Video) {
              localVideo.current = t;
              attachVideo(videoEl?.current, t, { mirror: true });
              setState((s) => ({ ...s, hostVideo: true }));
            }
          }
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e.message || 'media connection failed' }));
      }
    })();

    return () => {
      cancelled = true;
      try { localVideo.current?.stop(); } catch { /* noop */ }
      localVideo.current = null;
      roomRef.current = null;
      room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtc?.token, rtc?.livekit_url, isHost, type, audioOnly]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !state.micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setState((s) => ({ ...s, micOn: next, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  }, [state.micOn]);

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !isHost || type !== 'video') return;
    facing.current = facing.current === 'user' ? 'environment' : 'user';
    try {
      const old = localVideo.current;
      const [t] = await createLocalTracks({ audio: false, video: { facingMode: facing.current } });
      await room.localParticipant.publishTrack(t);
      if (old) {
        detachVideo(videoEl?.current, old);
        try { await room.localParticipant.unpublishTrack(old); old.stop(); } catch { /* noop */ }
      }
      localVideo.current = t;
      attachVideo(videoEl?.current, t, { mirror: facing.current === 'user' });
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  }, [isHost, type, videoEl]);

  // Audio rooms: publish/unpublish the mic when the viewer takes or leaves a seat.
  // Requires the room token to carry publish rights (server grants publish when seated;
  // re-join the room after taking a seat so the token refreshes).
  const setSeatMic = useCallback(async (on) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (on) {
        const [t] = await createLocalTracks({ audio: true, video: false });
        await room.localParticipant.publishTrack(t);
        setState((s) => ({ ...s, micOn: true }));
      } else {
        for (const pub of room.localParticipant.audioTrackPublications.values()) {
          if (pub.track) { try { await room.localParticipant.unpublishTrack(pub.track); pub.track.stop(); } catch { /* noop */ } }
        }
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  }, []);

  return { ...state, toggleMic, flipCamera, setSeatMic };
}

// Backward compatibility alias
export const useAgora = useLiveKit;

// PK opponent video is NOT yet implemented on web: it needs a second LiveKit
// connection with the opponent token from pkInfo (token_a/token_b).
/**
 * PK opponent video: opens a SECOND LiveKit connection to the opponent room
 * with the per-user subscribe-only token from GET /pk/:pkId (membership-checked
 * server-side). Subscribes to video only. Disconnects when the PK ends.
 */
export function useOpponentVideo(pk, roomId, livekitUrl, el) {
  const [info, setInfo] = useState({ live: false });
  useEffect(() => {
    if (!pk?.id || !livekitUrl || !el?.current) return undefined;
    let cancelled = false;
    const room = new Room({ adaptiveStream: true });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video) {
        attachVideo(el.current, track);
        setInfo({ live: true });
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        detachVideo(el.current, track);
        setInfo({ live: false });
      }
    });
    (async () => {
      try {
        const full = pk.token_a && pk.token_b ? pk : await api(`/pk/${pk.id}`);
        if (cancelled) return;
        const mineA = Number(full.room_a) === Number(roomId);
        const token = mineA ? full.token_b : full.token_a;
        await room.connect(livekitUrl, token);
      } catch (e) {
        if (!cancelled) setInfo({ live: false, error: e.message });
      }
    })();
    return () => {
      cancelled = true;
      room.disconnect();
    };
  }, [pk?.id, pk?.token_a, pk?.token_b, roomId, livekitUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return info;
}

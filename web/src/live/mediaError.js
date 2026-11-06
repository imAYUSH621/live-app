// Maps getUserMedia / LiveKit local-track failures to friendly, honest guidance.
// Pure module (no React) so it is unit-testable with plain node.
// The copy never claims media is publishing: a failure means nothing went out.

export function describeMediaError(err, { audioOnly = false } = {}) {
  const name = (err && (err.name || err.code)) || '';
  const raw = (err && err.message) || 'media connection failed';
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      if (audioOnly) {
        // Already in audio-only mode: the missing device is the microphone itself.
        return {
          kind: 'no-device',
          title: 'No microphone found',
          hint: 'Connect a microphone or check it is not disabled, then try again. Nothing is publishing right now.',
          raw,
        };
      }
      return {
        kind: 'no-device',
        title: 'No camera or microphone found',
        hint: 'Connect a camera/microphone, check it is not disabled, then try again - or continue with audio only.',
        raw,
      };
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'permission',
        title: 'Camera and microphone access is blocked',
        hint: 'Allow camera and microphone for this site in your browser settings, then try again. Nothing is publishing while this is blocked.',
        raw,
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'busy',
        title: audioOnly ? 'The microphone is busy' : 'The camera or microphone is busy',
        hint: audioOnly
          ? 'Another app or tab is using the microphone. Close it there, then try again.'
          : 'Another app or tab is using it. Close it there, then try again - or continue with audio only.',
        raw,
      };
    default:
      return { kind: 'other', title: 'Could not start the camera or microphone', hint: raw, raw };
  }
}

// True when continuing with audio only is a meaningful choice (video rooms).
export function canFallbackToAudio(kind) {
  return kind === 'no-device' || kind === 'busy' || kind === 'other';
}

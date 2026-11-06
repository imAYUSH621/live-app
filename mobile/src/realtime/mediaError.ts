// Friendly copy for local media setup failures, mirroring web/src/live/mediaError.js.
// Never claims media is publishing: a failure means nothing went out.
export type MediaErrorKind = 'no-device' | 'permission' | 'busy' | 'other';

export function describeMediaError(err: any): { kind: MediaErrorKind; title: string; hint: string } {
  const name = (err && (err.name || err.code)) || '';
  const raw = (err && err.message) || 'media connection failed';
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'no-device',
        title: 'No camera or microphone found',
        hint: 'Check the device camera/microphone, then try again. Nothing is publishing right now.',
      };
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'permission',
        title: 'Camera and microphone access is blocked',
        hint: 'Allow camera and microphone for this app in your device settings, then try again. Nothing is publishing while this is blocked.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'busy',
        title: 'The camera or microphone is busy',
        hint: 'Another app is using it. Close it there, then try again.',
      };
    default:
      return { kind: 'other', title: 'Could not start the camera or microphone', hint: raw };
  }
}

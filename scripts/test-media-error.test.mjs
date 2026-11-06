// Repeatable test for the camera/mic error UX mapping (run: node scripts/test-media-error.test.mjs)
import { describeMediaError, canFallbackToAudio } from '../web/src/live/mediaError.js';
import { readFileSync } from 'node:fs';

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

// 1. No-device errors map to a friendly no-camera/mic message with retry + audio fallback
for (const name of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
  const d = describeMediaError({ name, message: 'Requested device not found' });
  check(`${name} -> no-device kind`, d.kind === 'no-device');
  check(`${name} -> friendly title (no raw leak)`, d.title === 'No camera or microphone found');
  check(`${name} -> hint offers retry + audio-only choice`, /try again/i.test(d.hint) && /audio only/i.test(d.hint));
}

// 2. Permission errors map to settings guidance, never implying it still worked
for (const name of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) {
  const d = describeMediaError({ name, message: 'Permission denied' });
  check(`${name} -> permission kind`, d.kind === 'permission');
  check(`${name} -> hint mentions allowing access + retry`, /allow/i.test(d.hint) && /try again/i.test(d.hint));
  check(`${name} -> copy states nothing is publishing`, /nothing is publishing/i.test(d.hint));
}

// 2b. Audio-only mode: a missing device is the microphone - no misleading audio promise
{
  const d = describeMediaError({ name: 'NotFoundError', message: 'x' }, { audioOnly: true });
  check('audioOnly no-device -> mic-specific title', d.title === 'No microphone found');
  check('audioOnly no-device -> no audio-only offer in hint', !/audio only/i.test(d.hint));
  check('audioOnly no-device -> states nothing is publishing', /nothing is publishing/i.test(d.hint));
  const b = describeMediaError({ name: 'NotReadableError', message: 'x' }, { audioOnly: true });
  check('audioOnly busy -> mic-specific title', b.title === 'The microphone is busy');
  check('audioOnly busy -> no audio-only offer in hint', !/audio only/i.test(b.hint));
}
const hook2 = readFileSync(new URL('../web/src/live/useLiveKit.js', import.meta.url), 'utf8');
check('hook passes audioOnly into describeMediaError', hook2.includes('describeMediaError(e, { audioOnly })'));
const roomSrc = readFileSync(new URL('../web/src/live/Room.jsx', import.meta.url), 'utf8');
check('audio-only button hidden once already in audioOnly', roomSrc.includes('type === \'video\' && !audioOnly && canFallbackToAudio'));

// 3. Busy-device errors
for (const name of ['NotReadableError', 'TrackStartError', 'AbortError']) {
  const d = describeMediaError({ name, message: 'Could not start video source' });
  check(`${name} -> busy kind`, d.kind === 'busy');
}

// 4. Unknown errors fall through with the raw message as hint (no invented explanation)
{
  const d = describeMediaError({ name: 'WeirdError', message: 'wibble' });
  check('unknown -> other kind', d.kind === 'other');
  check('unknown -> raw message preserved', d.hint === 'wibble');
  const d2 = describeMediaError(null);
  check('null error still produces a message', d2.kind === 'other' && d2.title.length > 0);
}

// 5. Audio-only fallback policy: offered for device/busy/unknown, not for permission blocks
check('fallback offered for no-device', canFallbackToAudio('no-device') === true);
check('fallback offered for busy', canFallbackToAudio('busy') === true);
check('fallback NOT offered for permission', canFallbackToAudio('permission') === false);

// 6. Honesty: no copy ever claims video/audio is live or published after a failure
const all = ['NotFoundError', 'NotAllowedError', 'NotReadableError', 'WeirdError'].map((n) => describeMediaError({ name: n, message: 'x' }));
for (const d of all) {
  const copy = (d.title + ' ' + d.hint).replace(/nothing is publishing/gi, '');
  check(`kind ${d.kind}: no false publish claim`, !/is (live|publishing|published|broadcasting)/i.test(copy));
}

// 7. Web wiring: Room shows the friendly box with explicit retry + audio-only choice for hosts only
const room = readFileSync(new URL('../web/src/live/Room.jsx', import.meta.url), 'utf8');
check('Room imports canFallbackToAudio', room.includes("import { canFallbackToAudio } from './mediaError.js'"));
check('Room renders friendly media-error box for hosts', room.includes('av.mediaError && isHost'));
check('Room has explicit Try again retry', room.includes('Try again'));
check('Room audio fallback is an explicit button, not silent', room.includes('canFallbackToAudio(av.mediaError.kind)'));
const hook = readFileSync(new URL('../web/src/live/useLiveKit.js', import.meta.url), 'utf8');
check('hook maps errors via describeMediaError', hook.includes('describeMediaError(e, { audioOnly })'));
check('hook retry attempt is an effect dep', hook.includes('audioOnly, attempt]'));
check('host media-error box renders regardless of audioOnly (not inside !audioOnly cover)', /\{av\.mediaError && isHost && \([\s\S]*?className="media-error"/.test(roomSrc) && !/!audioOnly && \([\s\S]{0,400}media-error/.test(roomSrc));

// 7b. Visual placement: error box is a centered high-z overlay, not in the bottom flow behind chat
const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');
const meRule = (css.match(/\.media-error \{[^}]*\}/) || [''])[0];
check('media-error is absolutely centered overlay', /position:\s*absolute/.test(meRule) && /translate\(-50%,\s*-50%\)/.test(meRule));
check('media-error sits above chat list (z6) and bottom bar (z8)', /z-index:\s*(2[0-9]|[3-9][0-9])/.test(meRule));
// 7c. Avatar falls back to initials on image load failure (no broken-image icon)
const ui = readFileSync(new URL('../web/src/components/ui.jsx', import.meta.url), 'utf8');
check('Avatar has onError initials fallback', ui.includes('onError={() => setImgFailed(true)}') && ui.includes('imgFailed'));

// 8. Mobile parity: native setup failure shows the same friendly mapping
const mobile = readFileSync(new URL('../mobile/app/live/[id].tsx', import.meta.url), 'utf8');
check('mobile uses describeMediaError in setup catch', mobile.includes('describeMediaError(err)'));
const mobileMap = readFileSync(new URL('../mobile/src/realtime/mediaError.ts', import.meta.url), 'utf8');
for (const n of ['NotFoundError', 'NotAllowedError', 'NotReadableError']) {
  check(`mobile mapper handles ${n}`, mobileMap.includes(`'${n}'`));
}
check('mobile copy also states nothing is publishing', /nothing is publishing/i.test(mobileMap));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);

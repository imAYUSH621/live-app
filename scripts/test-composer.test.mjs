import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const room = fs.readFileSync(new URL('../web/src/live/Room.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');

test('room composer is persistent and inline, not a sheet', () => {
  assert.match(room, /<form className="say-hi composer" onSubmit=\{sendChat\}>/);
  assert.doesNotMatch(room, /setSheet\('chat'\)/);
  assert.doesNotMatch(room, /sheet === 'chat'/);
  assert.doesNotMatch(room, /chat-sheet/);
});

test('send clears only on server ack ok, keeps the draft on failure or no socket', () => {
  assert.match(room, /if \(!msg \|\| !socket \|\| chatPending\.current\) return;/);
  assert.match(room, /r\.error && toast\(r\.error, 'error'\); return; \}/);
  // setText('') must happen inside the ack callback, never optimistically
  const fn = room.slice(room.indexOf('const sendChat'));
  const ackIdx = fn.indexOf('socket.emit');
  const clearIdx = fn.indexOf("setText('')");
  assert.ok(clearIdx > ackIdx, 'draft cleared before server ack');
});

test('composer input keeps focus semantics: always mounted, Enter submits', () => {
  assert.match(room, /enterKeyHint="send"/);
  assert.match(room, /maxLength=\{200\}/);
  assert.match(room, /placeholder=\{t\('sayHi'\)\}/);
});

test('composer styles exist', () => {
  assert.match(css, /\.say-hi\.composer input/);
  assert.match(css, /\.composer-send/);
});

test('IME composition Enter never sends; pending guard blocks duplicates; ack timeout retains draft', () => {
  assert.match(room, /onCompositionStart=\{\(\) => \(composing\.current = true\)\}/);
  assert.match(room, /e\.nativeEvent\.isComposing \|\| composing\.current/);
  assert.match(room, /!msg \|\| !socket \|\| chatPending\.current/);
  assert.match(room, /chatPending\.current = true/);
  assert.match(room, /setTimeout\(\(\) =>/);
  assert.match(room, /t\('chatNotSent'\)/);
});

test('desktop room uses a three-region layout, PK rooms excluded', () => {
  assert.match(room, /room \$\{type\} \$\{pk \? 'has-pk' : ''\}/);
  assert.match(css, /@media \(min-width: 861px\) \{\s*\.room:not\(\.has-pk\)/);
  assert.match(css, /grid-template-columns: 380px minmax\(0, 1fr\) 84px/);
  assert.match(css, /\.room-actions/);
  assert.match(css, /mask-image: none/);
});

test('bottom-bar buttons are wrapped for rail placement', () => {
  assert.match(room, /<div className="room-actions">/);
});

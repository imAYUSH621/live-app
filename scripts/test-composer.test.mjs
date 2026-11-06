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

test('send button is always visible and disabled only when the draft is empty', () => {
  assert.match(room, /<button className="composer-send" type="submit" disabled=\{!text\.trim\(\)\} aria-label=\{t\('send'\)\}>/);
  assert.match(css, /\.composer-send:disabled/);
});

test('chat feed has an explicit empty state and long text wraps', () => {
  assert.match(room, /chat\.length === 0 && <div className="chat-empty">\{t\('chatEmpty'\)\}<\/div>/);
  assert.match(css, /\.chat-empty/);
  assert.match(css, /\.chat-msg span \{ overflow-wrap: anywhere/);
});

test('action rail items carry text labels, shown on desktop only', () => {
  const labels = (room.match(/className="ra-label"/g) || []).length;
  assert.ok(labels >= 8, 'viewer + host rail labels present');
  assert.match(css, /\.ra-label \{ display: none/);
  assert.match(css, /\.room-actions \.ra-label \{ display: block/);
});

test('rail labels and empty state are translated in en, hi and ar', () => {
  const i18n = fs.readFileSync(new URL('../web/src/i18n.js', import.meta.url), 'utf8');
  for (const key of ['share', 'like', 'gifts', 'mic', 'flip', 'beauty', 'chatEmpty']) {
    const occurrences = (i18n.match(new RegExp(`${key}:`, 'g')) || []).length;
    assert.ok(occurrences >= 3, `${key} translated in all three languages`);
  }
});

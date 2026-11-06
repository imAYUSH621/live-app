import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const me = fs.readFileSync(new URL('../web/src/pages/Me.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');

test('web Me page has no admin entry point (admin is a separate app with its own auth)', () => {
  assert.doesNotMatch(me, /\/admin/);
  assert.doesNotMatch(me, /Admin Panel/);
});

test('desktop banner keeps full width via aspect-ratio, no fixed-height squeeze', () => {
  assert.doesNotMatch(css, /\.banner \{ height: 220px/);
});

test('desktop nav never overlaps page actions', () => {
  const desktopIdx = css.indexOf('@media (min-width: 861px) {' + '\n' + '  .banner { height: auto');
  const ruleIdx = css.indexOf('.page.with-nav { padding-bottom: 120px; }', desktopIdx);
  assert.ok(desktopIdx >= 0 && ruleIdx > desktopIdx, 'desktop padding override inside the 861px block');
});

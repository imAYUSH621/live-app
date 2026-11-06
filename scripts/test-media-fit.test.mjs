import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');

test('stage video preserves the full frame (contain, never cover-crop)', () => {
  assert.match(css, /\.stage-video-box video, \.stage-video \{[^}]*object-fit: contain/);
  assert.doesNotMatch(css, /\.stage-video-box video, \.stage-video \{[^}]*object-fit: cover/);
});

test('in-memory redis shim actively sweeps expired keys (bounded memory)', async () => {
  const src = fs.readFileSync(new URL('../server/src/redis.js', import.meta.url), 'utf8');
  assert.match(src, /setInterval\(\(\) => this\._sweep\(\), 30000\)/);
  assert.match(src, /unref/);
  const { MemoryRedis } = await import('../server/src/redis.js');
  const r = new MemoryRedis();
  await r.set('unique-key-never-read', '1', 'PX', 60);
  await new Promise((res) => setTimeout(res, 90));
  assert.equal(r.store.has('unique-key-never-read'), true, 'lazy expiry does not reclaim unread keys');
  r._sweep();
  assert.equal(r.store.has('unique-key-never-read'), false, 'sweep reclaims expired unread keys');
  assert.equal(await r.get('unique-key-never-read'), null);
  clearInterval(r._sweeper);
});

#!/usr/bin/env node
// Repeatable regression test for the test-artifact handoff route
// (server/src/routes/test-artifact.js, PRs #17/#18/#20).
// Run against any deployment with TEST_ARTIFACTS_ENABLED=true:
//   BASE_URL=https://liveapp-server-ksvy.onrender.com ADMIN_TOKEN=<token> \
//     node scripts/test-artifacts.test.mjs
// Covers: auth gate, upload + minted-link byte-integrity round trip (the BYTEA
// durability read path), X-SHA256 download header, token tamper/length
// rejection, wrong-sha rejection, and a multi-MB payload regression.
// Writes only through the test-flag-gated admin route; uploads are small probes.
import crypto from 'node:crypto';

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';
if (!TOKEN) { console.error('FAIL: ADMIN_TOKEN env required'); process.exit(1); }

let pass = 0, fail = 0;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });

async function uploadRoundTrip(bytes, filename, mime, label) {
  const up = await fetch(`${BASE}/api/admin/test-artifacts`, {
    method: 'POST',
    headers: H({ 'Content-Type': mime, 'X-Filename': filename, 'X-SHA256': sha256(bytes) }),
    body: bytes,
  });
  check(`${label}: upload accepted`, up.status === 200, `got ${up.status}`);
  const art = await up.json().catch(() => ({}));
  check(`${label}: artifact id + sha returned`, Number.isInteger(art.id) && art.sha256 === sha256(bytes), JSON.stringify(art).slice(0, 120));
  const lk = await fetch(`${BASE}/api/admin/test-artifacts/${art.id}/link`, { method: 'POST', headers: H() });
  const link = await lk.json().catch(() => ({}));
  check(`${label}: link minted`, lk.status === 200 && /^\/api\/test-artifacts\/t\/.{20,}$/.test(link.path || ''), `status ${lk.status} path ${String(link.path).slice(0, 40)}`);
  const dl = await fetch(`${BASE}${link.path}`);
  const got = Buffer.from(await dl.arrayBuffer());
  check(`${label}: download bytes match upload sha256`, dl.status === 200 && sha256(got) === sha256(bytes), `status ${dl.status} bytes ${got.length}`);
  check(`${label}: X-SHA256 header matches`, dl.headers.get('x-sha256') === sha256(bytes), `header ${dl.headers.get('x-sha256')}`);
  return link.path;
}

const run = async () => {
  // 1. auth gate: no token must be rejected before any body handling
  let r = await fetch(`${BASE}/api/admin/test-artifacts`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: Buffer.from('x') });
  check('no-auth upload rejected (401/403)', [401, 403].includes(r.status), `got ${r.status}`);

  // 2. small probe round trip
  const path = await uploadRoundTrip(Buffer.from('pk-small-probe-' + Date.now()), 'probe-small.zip', 'application/zip', 'small');

  // 3. token rejection: tampered same-length token and short token both 404
  const tok = path.split('/t/')[1];
  const tampered = tok.slice(0, -1) + (tok.endsWith('a') ? 'b' : 'a');
  r = await fetch(`${BASE}/api/test-artifacts/t/${tampered}`);
  check('tampered token 404', r.status === 404, `got ${r.status}`);
  r = await fetch(`${BASE}/api/test-artifacts/t/short`);
  check('short token 404', r.status === 404, `got ${r.status}`);

  // 4. wrong declared sha must be rejected, not stored
  r = await fetch(`${BASE}/api/admin/test-artifacts`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'application/zip', 'X-Filename': 'probe-bad-sha.zip', 'X-SHA256': '0'.repeat(64) }),
    body: Buffer.from('payload'),
  });
  check('wrong-sha upload rejected (400)', r.status === 400, `got ${r.status}`);

  // 5. disallowed content type rejected
  r = await fetch(`${BASE}/api/admin/test-artifacts`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'text/html', 'X-Filename': 'evil.html' }),
    body: Buffer.from('<script></script>'),
  });
  check('disallowed content type rejected (400)', r.status === 400, `got ${r.status}`);

  // 6. multi-MB payload regression (2 MiB deterministic random)
  const big = crypto.randomBytes(2 * 1024 * 1024);
  await uploadRoundTrip(big, 'probe-2mb.zip', 'application/zip', '2MB');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error('FAIL harness', e); process.exit(1); });

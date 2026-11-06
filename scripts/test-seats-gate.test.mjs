// Repeatable test: guest seat publishing shares ONE fail-closed readiness gate
// across every seat-granting route (request / accept / take).
// Run: node scripts/test-seats-gate.test.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

// Each case in a child process so config.js re-reads env fresh.
async function readyWith(env, preset) {
  const out = execFileSync(process.execPath, [
    '--input-type=module', '-e',
    `import { seatsPublishingReady } from './server/src/services/live.js';
     import { redis } from './server/src/redis.js';
     ${preset === 'delivered' ? "await redis.set('lk:webhook:delivered', String(Date.now()));" : ''}
     console.log(JSON.stringify(await seatsPublishingReady()));`,
  ], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH, HOME: process.env.HOME,
           JWT_SECRET: 'seats-gate-test-secret', ADMIN_PASSWORD: 'seats-gate-test-admin',
           REDIS_URL: 'memory', ...env },
  });
  return JSON.parse(out.toString().trim().split('\n').pop());
}

// Truth table, exercised against the real helper:
check('prod + no webhook URL -> seats CLOSED', (await readyWith({ NODE_ENV: 'production' })) === false);
check('prod + webhook URL, no verified delivery -> seats CLOSED', (await readyWith({ NODE_ENV: 'production', LIVEKIT_WEBHOOK_URL: 'https://x.test/hook' })) === false);
check('prod + webhook URL + verified delivery -> seats OPEN', (await readyWith({ NODE_ENV: 'production', LIVEKIT_WEBHOOK_URL: 'https://x.test/hook' }, 'delivered')) === true);
check('dev (non-prod) -> gate not applied', (await readyWith({ NODE_ENV: 'development' })) === true);

// Source assertions: every guest-seating route goes through the shared guard.
const routes = readFileSync(new URL('../server/src/routes/live.js', import.meta.url), 'utf8');
for (const route of ['seats/request', 'seats/accept', 'seats/take']) {
  const idx = routes.indexOf(`r.post('/live/:id/${route}'`);
  const body = routes.slice(idx, idx + 700);
  check(`${route} gated by shared requireSeatsReady`, idx >= 0 && body.includes('requireSeatsReady(res)'));
}
check('no second inline copy of the gate remains in routes', !routes.includes("redis.get('lk:webhook:delivered')"));
const svc = readFileSync(new URL('../server/src/services/live.js', import.meta.url), 'utf8');
check('single gate implementation lives in services/live.js', svc.includes('export async function seatsPublishingReady'));

process.exit(failures ? 1 : 0);

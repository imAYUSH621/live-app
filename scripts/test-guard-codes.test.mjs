// Repeatable test: every error code the web client branches on must be a code
// the server actually emits. Regression guard for the dead-branch class found
// in the #31 follow-up audit (need_age / challenge_expired; confirm_needed
// were client branches the server never produced).
// Run: node scripts/test-guard-codes.test.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

const root = new URL('..', import.meta.url).pathname;
const grep = (dir, pattern) => {
  try {
    return execFileSync('grep', ['-rhoE', pattern, `${root}/${dir}`], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch { return []; }
};

// Codes the web client consumes: e.code === 'x' / err.code === 'x'
const webCodes = [...new Set(
  grep('web/src', "[a-z]+\\.code === '[a-z_]+'").map((l) => l.replace(/.*=== '/, '').replace(/'$/, '')),
)].sort();

// Codes the server emits: bad('msg','code') / new HttpError(status,'msg','code')
const serverCodes = [...new Set(
  grep('server/src', "(bad|forbidden|notFound|HttpError)\\(.*'[a-z_]+'\\)")
    .map((l) => (l.match(/'([a-z_]+)'[^']*$/) || [])[1])
    .filter(Boolean),
)].sort();

console.log('web consumes:', webCodes.join(', ') || '(none)');
console.log('server emits:', serverCodes.join(', ') || '(none)');
for (const c of webCodes) check(`web code '${c}' is server-emitted`, serverCodes.includes(c));

// Dead codes removed from the client
for (const dead of ['need_age', 'challenge_expired']) {
  check(`dead code '${dead}' absent from web`, !webCodes.includes(dead));
}

// The go-live host gate carries its code (production fails closed on hosts)
const live = readFileSync(`${root}/server/src/routes/live.js`, 'utf8');
check('go-live host gate emits need_kyc', /Only verified hosts can go live[^;]*'need_kyc'/.test(live));
const golive = readFileSync(`${root}/web/src/pages/GoLive.jsx`, 'utf8');
check('GoLive routes need_kyc to /verify', /e\.code === 'need_kyc'\) nav\('\/verify'\)/.test(golive));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);

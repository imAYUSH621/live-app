// Repeatable test: the /banned screen's backend exists and matches the client contract.
// Regression guard: /api/appeal did not exist at all - banned users saw a
// "Not found" toast and an infinite spinner instead of the ban/appeal screen.
// Run: node scripts/test-appeals.test.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

const root = new URL('..', import.meta.url).pathname;
const schema = readFileSync(`${root}/server/src/schema.sql`, 'utf8');
const route = readFileSync(`${root}/server/src/routes/appeals.js`, 'utf8');
const authLib = readFileSync(`${root}/server/src/lib/auth.js`, 'utf8');
const index = readFileSync(`${root}/server/src/index.js`, 'utf8');
const admin = readFileSync(`${root}/server/src/routes/admin.js`, 'utf8');
const banned = readFileSync(`${root}/web/src/pages/Banned.jsx`, 'utf8');

check('appeals table in schema', /CREATE TABLE IF NOT EXISTS appeals \(/.test(schema));
check('userAuth supports allowBanned', /allowBanned = false/.test(authLib) && /!allowBanned && u\.status === 'banned'/.test(authLib));
check('appeal route uses allowBanned (banned users can reach it)', /userAuth\(\{ allowBanned: true \}\)/.test(route));
check('appeal routes mounted', /appealRoutes/.test(index));

// Client contract: every field Banned.jsx reads must be produced by GET /appeal
for (const field of ['banned', 'banUntil', 'wallet', 'appeals', 'payoutMethods']) {
  check(`GET /appeal produces '${field}' (client reads it)`, new RegExp(`\\b${field}\\b`).test(route) && new RegExp(`d\\.${field}|x\\.${field}`).test(banned));
}
check('POST /appeal enforces one open appeal', /already have an appeal under review/.test(route));
check('POST /appeal enforces min length 10', /at least 10 characters/.test(route));
check('POST /appeal validates payout method', /Choose a valid payout method/.test(route));

// Admin side: queue + decision, under the ban permission, with audit
check('admin appeals list route', /r\.get\('\/admin\/appeals', adminAuth\('users\.ban'\)/.test(admin));
check('admin appeal decide route', /r\.post\('\/admin\/appeals\/:id\/decide', adminAuth\('users\.ban'\)/.test(admin));
check('appeal decision is audited', /audit\(req, 'appeal\.decide'/.test(admin));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);

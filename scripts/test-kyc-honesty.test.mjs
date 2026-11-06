// Repeatable test: no unimplemented liveness claims. The /kyc/challenge stub
// returned a fixed "random gesture" prompt the server never validated, and the
// UI claimed "live selfie verification" while review is manual.
// Run: node scripts/test-kyc-honesty.test.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }
const root = new URL('..', import.meta.url).pathname;
const grep = (dir, pattern) => {
  try { return execFileSync('grep', ['-rnE', pattern, `${root}/${dir}`], { encoding: 'utf8' }); }
  catch { return ''; }
};

const kyc = readFileSync(`${root}/server/src/routes/kyc.js`, 'utf8');
check('challenge stub endpoint removed', !/kyc\/challenge/.test(kyc));
check('manual review stated in kyc route', /manual admin review/.test(kyc));
check('no client calls /kyc/challenge', !grep('web/src', "kyc/challenge"));
check('no "live selfie" claims in web copy', !grep('web/src', "[Ll]ive [Ss]elfie|live selfie|live photo|live camera"));
check('verify copy says manual review', /reviews every submission manually/.test(readFileSync(`${root}/web/src/pages/Verify.jsx`, 'utf8')));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);

const verifySrc = readFileSync(`${root}/web/src/pages/Verify.jsx`, 'utf8');
check('verify copy has no money promise while payments are off', !/real money/i.test(verifySrc));
check('verify page warns against real IDs on the test deployment', /TEST DEPLOYMENT/.test(verifySrc) && /do not upload real IDs/.test(verifySrc));

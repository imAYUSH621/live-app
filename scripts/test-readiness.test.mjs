// Repeatable test: production fail-closed gates + admin readiness surface.
// Run: node scripts/test-readiness.test.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

// Each case runs in a child process so config.js re-reads the env fresh
// (ESM module cache would otherwise pin the first case's NODE_ENV).
import { execFileSync } from 'node:child_process';
async function flagsWith(env) {
  const out = execFileSync(process.execPath, [
    '--input-type=module', '-e',
    "import { readinessFlags } from './server/src/services/demo.js'; console.log(JSON.stringify(readinessFlags()));",
  ], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH, HOME: process.env.HOME,
           JWT_SECRET: 'readiness-test-secret', ADMIN_PASSWORD: 'readiness-test-admin', ...env },
  });
  return JSON.parse(out.toString().trim().split('\n').pop());
}

// 1. Fail-closed truth table (exercised, not assumed): production ignores the bypass flags
let f = await flagsWith({ NODE_ENV: 'production', ALLOW_DEMO_LOGIN: 'true', ALLOW_KYC_BYPASS: 'true', TEST_ARTIFACTS_ENABLED: 'true' });
check('prod + ALLOW_DEMO_LOGIN=true -> demo login INACTIVE', f.demo_login_active === false);
check('prod + ALLOW_KYC_BYPASS=true -> kyc bypass INACTIVE', f.kyc_bypass_active === false);
f = await flagsWith({ NODE_ENV: 'development', ALLOW_DEMO_LOGIN: 'true', ALLOW_KYC_BYPASS: 'true' });
check('dev + opt-ins -> demo login ACTIVE', f.demo_login_active === true);
check('dev + opt-ins -> kyc bypass ACTIVE', f.kyc_bypass_active === true);
f = await flagsWith({ NODE_ENV: 'development' });
check('dev without opt-ins -> demo login INACTIVE', f.demo_login_active === false);
check('dev without opt-ins -> kyc bypass INACTIVE', f.kyc_bypass_active === false);

// 2. Readiness payload shape: only non-secret effective flags
f = await flagsWith({ NODE_ENV: 'production' });
const keys = Object.keys(f).sort();
check('readiness keys are the documented set', JSON.stringify(keys) === JSON.stringify([
  'cloudinary_configured','demo_login_active','firebase_configured','kyc_bypass_active','livekit_host','node_env','otp_provider','razorpay_enabled','sightengine_configured','test_artifacts_enabled','turn_configured','twofactor_configured'
].sort()), keys.join(','));
const leak = /secret|password|key\b|token|jwt/i.test(keys.join(' ').replace('twofactor_configured','').replace('test_artifacts_enabled',''));
check('no secret-ish field names beyond *_configured booleans', !leak);
check('values are booleans / short labels only', Object.values(f).every(v => typeof v === 'boolean' || v === 'production' || v === 'console' || typeof v === 'string' && v.length < 60));

// 3. Wiring: single helper source of truth; no inline env checks left in routes
const auth = readFileSync(new URL('../server/src/routes/auth.js', import.meta.url), 'utf8');
check('auth.js uses demoLoginEnabled helper', auth.includes('demoLoginEnabled()'));
check('auth.js has no inline ALLOW_DEMO_LOGIN check', !auth.includes("process.env.ALLOW_DEMO_LOGIN === 'true'"));
const kyc = readFileSync(new URL('../server/src/routes/kyc.js', import.meta.url), 'utf8');
check('kyc.js uses kycBypassEnabled helper', kyc.includes('kycBypassEnabled'));
const users = readFileSync(new URL('../server/src/services/users.js', import.meta.url), 'utf8');
check('users.js uses kycBypassEnabled helper', users.includes('kycBypassEnabled()'));
const admin = readFileSync(new URL('../server/src/routes/admin.js', import.meta.url), 'utf8');
check('admin readiness endpoint requires adminAuth', admin.includes("r.get('/admin/readiness', adminAuth()"));
check('admin readiness returns readinessFlags', admin.includes('res.json({ readiness: readinessFlags() })'));
// 4. Public health stays minimal: no readiness/provider flags leaked there
const idx = readFileSync(new URL('../server/src/index.js', import.meta.url), 'utf8');
const healthBlock = (idx.match(/app.get\('\/api\/health'[\s\S]*?\n\}\);/) || [''])[0];
check('public /api/health exposes no provider/readiness flags', !/razorpay|otp_provider|demo_login|kyc_bypass|sightengine|firebase|turn_configured/.test(healthBlock));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);

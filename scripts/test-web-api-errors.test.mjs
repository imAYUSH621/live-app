import { readFileSync } from 'node:fs';
// Repeatable test: web api() maps the server's {error, code} body correctly.
// Regression guard: it used to read data.message (never sent), so every
// friendly server error showed as "Something went wrong" and all
// e.code === 'need_age' / 'need_kyc' / 'confirm_needed' branches never fired.
// Run: node scripts/test-web-api-errors.test.mjs

let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

// Browser-global stubs, installed before importing the module under test.
const events = [];
globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
function stubFetch(status, body) {
  globalThis.fetch = async () => ({ ok: status < 400, status, json: async () => body });
}

const { api, ApiErr } = await import('../web/src/api.js');

// 1. Friendly server message survives to err.message
stubFetch(400, { error: 'Phone sign-in is temporarily unavailable' });
let err = await api('/auth/otp/send', { method: 'POST', body: {} }).catch(e => e);
check('message from data.error', err instanceof ApiErr && err.message === 'Phone sign-in is temporarily unavailable', err.message);
check('code from data.code (undefined here)', err.code === undefined);

// 2. Machine code survives to err.code (need_age / need_kyc / confirm_needed flows)
stubFetch(400, { error: 'Complete your age verification first', code: 'need_age' });
err = await api('/recharge/order', { method: 'POST', body: {} }).catch(e => e);
check('need_age code mapped', err.code === 'need_age' && err.message === 'Complete your age verification first', `${err.code} | ${err.message}`);

// 3. Banned event fires on data.code === 'banned'
stubFetch(403, { error: 'Account banned: abuse', code: 'banned' });
err = await api('/me').catch(e => e);
check('banned event dispatched', events.includes('liveapp:banned') && err.message === 'Account banned: abuse', events.join(','));

// 4. 401 with a stored token clears it and dispatches logout
store.set('liveapp_token', 'tok123');
stubFetch(401, { error: 'Invalid token' });
err = await api('/me').catch(e => e);
check('401 clears token + logout event', store.has('liveapp_token') === false && events.includes('liveapp:logout'));

// 5. Generic fallback when body has no error/message
stubFetch(500, {});
err = await api('/x').catch(e => e);
check('generic fallback intact', err.message === 'Something went wrong', err.message);

// 6. Recharge pack buttons have a visible disabled state in CSS (the gateway-
// null path disables every buy button; without styling they looked tappable).
const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');
check('pack disabled style present', /\.pack:disabled\s*\{[^}]*opacity/.test(css));
check('pack hover excluded when disabled', /\.pack:hover:not\(:disabled\)/.test(css));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);


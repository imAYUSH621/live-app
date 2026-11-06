const API = process.env.API || 'http://localhost:4000';
const J = (r) => r.json().catch(() => ({}));
const call = async (m, p, tok, body) => {
  const r = await fetch(API + '/api' + p, { method: m, headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await J(r) };
};
const rnd = String(Math.floor(Math.random() * 1e8));
let pass = 0, fail = [];
const expect = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail.push(name); console.log('  ✗', name, extra); } };

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';
const admin = (await call('POST', '/auth/admin/login', null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).data.token
  || (await call('POST', '/admin/login', null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).data.token;

// fresh users
const mk = async (phone) => {
  if (process.env.USE_PASSWORD_AUTH === '1') {
    const email = `matrix-${phone}@example.com`;
    const password = `Matrix-${phone}-x9Q`;
    let r = await call('POST', '/auth/register', null, { email, password, name: 'Matrix ' + phone });
    if (r.status >= 400) r = await call('POST', '/auth/login', null, { email, password });
    return r.data;
  }
  await call('POST', '/auth/otp/send', null, { phone });
  const s = await call('POST', '/auth/otp/send', null, { phone });
  const v = await call('POST', '/auth/otp/verify', null, { phone, code: s.data.dev_code, device_id: 'd' + phone });
  return v.data;
};
const U1 = await mk('92' + rnd.slice(0, 8));   // will be seller
const U2 = await mk('93' + rnd.slice(0, 8));   // coin recipient

// agency + seller setup
await call('POST', '/admin/agencies', admin, { name: 'Matrix Agency', login_email: `ag${rnd}@t.com`, password: 'Agency@123', commission_pct: 10 });
const AG = (await call('POST', '/agency/login', null, { email: `ag${rnd}@t.com`, password: 'Agency@123' })).data.token;
await call('POST', '/admin/sellers', admin, { uid: U1.user.uid, password: 'Seller@123' });
await call('POST', `/admin/sellers/${U1.user.id}/topup`, admin, { coins: 5000, note: 'stock' });
const SE = (await call('POST', '/seller/login', null, { uid: U1.user.uid, password: 'Seller@123' })).data.token;
const US = U2.token; // plain user
expect('setup: agency+seller+user tokens', AG && SE && US);

// ---- role isolation matrix (all must be 401/403) ----
const denied = async (name, tok, m, p, body) => {
  const r = await call(m, p, tok, body);
  expect(name, r.status === 401 || r.status === 403, `got ${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
};
await denied('user token -> /agency/me', US, 'GET', '/agency/me');
await denied('user token -> /seller/me', US, 'GET', '/seller/me');
await denied('user token -> /admin/dashboard', US, 'GET', '/admin/dashboard');
await denied('agency token -> /seller/me', AG, 'GET', '/seller/me');
await denied('agency token -> /admin/dashboard', AG, 'GET', '/admin/dashboard');
await denied('agency token -> /seller/transfer', AG, 'POST', '/seller/transfer', { uid: U2.user.uid, coins: 1 });
await denied('seller token -> /agency/me', SE, 'GET', '/agency/me');
await denied('seller token -> /agency/hosts', SE, 'GET', '/agency/hosts');
await denied('seller token -> /admin/dashboard', SE, 'GET', '/admin/dashboard');
await denied('admin token -> /seller/me', admin, 'GET', '/seller/me');
await denied('admin token -> /agency/me', admin, 'GET', '/agency/me');
await denied('no token -> /seller/transfers', null, 'GET', '/seller/transfers');

// ---- positive access ----
expect('agency token -> /agency/me 200', (await call('GET', '/agency/me', AG)).status === 200);
expect('seller token -> /seller/me 200', (await call('GET', '/seller/me', SE)).status === 200);

// ---- seller transactions ----
const before = (await call('GET', '/me', US)).data;
const t1 = await call('POST', '/seller/transfer', SE, { uid: U2.user.uid, coins: 1200 });
expect('seller transfer 1200 ok', t1.status === 200, JSON.stringify(t1.data).slice(0, 100));
const after = (await call('GET', '/me', US)).data;
const bal = (u) => Number(u?.user?.coins ?? u?.coins ?? -1);
expect('recipient +1200 coins', bal(after) - bal(before) === 1200, `${bal(before)} -> ${bal(after)}`);
const me = (await call('GET', '/seller/me', SE)).data;
expect('seller stock debited', 5000 - 1200 === Number(me?.seller?.balance), `balance=${me?.seller?.balance}`);
const over = await call('POST', '/seller/transfer', SE, { uid: U2.user.uid, coins: 999999 });
expect('overspend rejected', over.status === 400, `got ${over.status}`);
const neg = await call('POST', '/seller/transfer', SE, { uid: U2.user.uid, coins: -50 });
expect('negative transfer rejected', neg.status === 400, `got ${neg.status}`);
const list = await call('GET', '/seller/transfers', SE);
expect('transfer history recorded', list.status === 200 && JSON.stringify(list.data).includes('1200'));

// ---- agency commission surface ----
expect('agency commissions 200', (await call('GET', '/agency/commissions', AG)).status === 200);
expect('agency hosts 200', (await call('GET', '/agency/hosts', AG)).status === 200);

console.log(`\n${pass} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);

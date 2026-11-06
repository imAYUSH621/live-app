// End-to-end API smoke test (needs a running server; LiveKit media not required).
//   API=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/smoke.mjs
import { io } from 'socket.io-client';

const API = process.env.API || 'http://localhost:4000';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@test.com', password: process.env.ADMIN_PASSWORD || 'Admin@12345' };
let passed = 0;
const failed = [];

async function call(method, path, token, body, form) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(API + '/api' + path, { method, headers, body: payload });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
}
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
const ok = (r, m = '') => expect(r.status < 300, `${m} HTTP ${r.status} ${String(JSON.stringify(r.data)).slice(0, 220)}`);
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failed.push(name);
    console.log('  ✗', name, '—', e.message);
  }
}
const sock = (token) =>
  new Promise((res, rej) => {
    const s = io(API, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => res(s));
    s.on('connect_error', rej);
  });
const emit = (s, ev, d) => new Promise((res) => s.emit(ev, d, res));
const waitFor = (s, ev, ms = 5000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting for ' + ev)), ms);
    s.once(ev, (d) => (clearTimeout(t), res(d)));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function login(phone) {
  // Production-safe path: email/password accounts (no dev OTP exists in prod).
  if (process.env.USE_PASSWORD_AUTH === '1') {
    const email = `smoke-${phone}@example.com`;
    const password = `Smoke-${phone}-x9Q`;
    let r = await call('POST', '/auth/register', null, { email, password, name: 'Smoke ' + phone });
    if (r.status >= 400) r = await call('POST', '/auth/login', null, { email, password });
    ok(r, 'password register/login');
    return { token: r.data.token, user: r.data.user };
  }
  const s = await call('POST', '/auth/otp/send', null, { phone });
  ok(s, 'otp send');
  const r = await call('POST', '/auth/otp/verify', null, { phone, code: s.data.dev_code, device_id: 'dev-' + phone });
  ok(r, 'otp verify');
  return { token: r.data.token, user: r.data.user };
}

async function main() {
  console.log('Smoke test →', API);
  const A = await login('98' + rnd());
  const H1 = await login('97' + rnd());
  const H2 = await login('96' + rnd());
  let admin, agencyTok, room1, room2, pkId, callId;

  await check('profile + 18+ check', async () => {
    const bad = await call('PATCH', '/me', A.token, { dob: '2014-01-01' });
    expect(bad.status >= 400, 'minor dob must be rejected');
    for (const u of [A, H1, H2]) ok(await call('PATCH', '/me', u.token, { name: 'T' + rnd().slice(0, 4), gender: 'female', dob: '1995-05-05' }));
    A.user = (await call('GET', '/me', A.token)).data;
    H1.user = (await call('GET', '/me', H1.token)).data;
    H2.user = (await call('GET', '/me', H2.token)).data;
  });

  await check('admin login + dashboard', async () => {
    const r = await call('POST', '/admin/login', null, ADMIN);
    ok(r);
    admin = r.data.token;
    ok(await call('GET', '/admin/dashboard', admin));
  });

  await check('agency create + login', async () => {
    const email = `ag${rnd()}@test.com`;
    const a = await call('POST', '/admin/agencies', admin, { name: 'Star Agency', login_email: email, password: 'Agency@123', commission_pct: 10 });
    ok(a);
    const l = await call('POST', '/agency/login', null, { email, password: 'Agency@123' });
    ok(l);
    agencyTok = l.data.token;
    A.agencyCode = a.data.code;
  });

  await check('host apply (selfie) → agency approve → admin approve', async () => {
    for (const u of [H1, H2]) {
      const fd = new FormData();
      fd.append('real_name', 'Test Host');
      fd.append('agency_code', A.agencyCode);
      fd.append('liveness', 'true');
      fd.append('selfie', new Blob([PNG], { type: 'image/png' }), 'selfie.png');
      ok(await call('POST', '/host/apply', u.token, undefined, fd), 'apply');
    }
    const apps = (await call('GET', '/agency/applications', agencyTok)).data;
    expect(apps.length >= 2, 'agency sees applications');
    for (const ap of apps) {
      const r = await call('POST', `/agency/applications/${ap.user_id}`, agencyTok, { action: 'approve' });
      ok(r, 'agency approve');
    }
    for (const u of [H1, H2]) ok(await call('POST', `/admin/hosts/${u.user.id}/approve`, admin, {}), 'admin approve');
    H1.user = (await call('GET', '/me', H1.token)).data;
    expect(H1.user.is_host, 'is_host');
  });

  await check('admin credits coins to viewer', async () => {
    ok(await call('POST', `/admin/users/${A.user.id}/balance`, admin, { amount: 300000, currency: 'coin', reason: 'test' }));
    ok(await call('POST', `/admin/users/${H1.user.id}/balance`, admin, { amount: 5000, currency: 'coin', reason: 'test' }));
  });

  const sA = await sock(A.token);
  const sH1 = await sock(H1.token);
  const sH2 = await sock(H2.token);

  await check('host starts multi-guest live', async () => {
    const r = await call('POST', '/live/start', H1.token, { type: 'multi', title: 'Hello', seats: 4 });
    ok(r);
    room1 = r.data.room.id;
    expect(r.data.token && r.data.livekit_url, 'LiveKit token');
    const j = await emit(sH1, 'room:join', { roomId: room1 });
    expect(j.ok, JSON.stringify(j));
  });

  await check('feed shows live; viewer joins (REST + socket) with entry event', async () => {
    const f = await call('GET', '/live/feed?tab=popular', A.token);
    ok(f);
    const list = Array.isArray(f.data) ? f.data : f.data.items || f.data.rooms || [];
    expect(list.some((x) => x.id === room1), 'room in feed');
    ok(await call('POST', `/live/${room1}/join`, A.token, {}));
    const enter = waitFor(sH1, 'room:enter');
    const j = await emit(sA, 'room:join', { roomId: room1 });
    expect(j.ok, JSON.stringify(j));
    await enter;
  });

  await check('room chat with word filter', async () => {
    const p = waitFor(sH1, 'room:chat');
    const ack = await emit(sA, 'room:chat', { roomId: room1, text: 'hello call me 9876543210' });
    expect(ack.ok, JSON.stringify(ack));
    const m = await p;
    expect(!m.text.includes('9876543210'), 'phone number should be filtered: ' + m.text);
  });

  let gifts;
  await check('send gift in room: coins down, host diamonds up', async () => {
    gifts = (await call('GET', '/gifts', A.token)).data;
    const g = gifts.find((x) => x.price >= 10 && x.price <= 99);
    const before = (await call('GET', '/wallet', A.token)).data;
    const p = waitFor(sH1, 'room:gift');
    ok(await call('POST', '/gifts/send', A.token, { gift_id: g.id, receiver_id: H1.user.id, qty: 1, context: 'room', room_id: room1 }));
    await p;
    const after = (await call('GET', '/wallet', A.token)).data;
    expect(before.coins - after.coins === g.price, `coins diff ${before.coins - after.coins} vs ${g.price}`);
    const hw = (await call('GET', '/wallet', H1.token)).data;
    expect(hw.diamonds > 0, 'host diamonds');
  });

  await check('big gift triggers app-wide banner', async () => {
    const g = [...gifts].sort((a, b) => b.price - a.price).find((x) => x.price <= 200000 && x.category !== 'vip' && x.category !== 'lucky');
    const p = waitFor(sH2, 'global:banner');
    ok(await call('POST', '/gifts/send', A.token, { gift_id: g.id, receiver_id: H1.user.id, qty: 1, context: 'room', room_id: room1 }));
    await p;
  });

  await check('seat request → host accept → seat update', async () => {
    const req = waitFor(sH1, 'seat:request');
    ok(await call('POST', `/live/${room1}/seats/request`, A.token, {}));
    await req;
    const upd = waitFor(sA, 'seat:update');
    ok(await call('POST', `/live/${room1}/seats/accept`, H1.token, { user_id: A.user.id }));
    const u = await upd;
    expect(JSON.stringify(u.seats).includes(String(A.user.id)), 'seated');
    ok(await call('POST', `/live/${room1}/seats/leave`, A.token, {}));
  });

  await check('red packet drop + grab', async () => {
    const p = waitFor(sA, 'redpacket', 5000).catch(() => null);
    const r = await call('POST', `/live/${room1}/redpacket`, H1.token, { coins: 200, parts: 4 });
    ok(r);
    await p;
    const pid = r.data.id || r.data.packet?.id || r.data.redpacket?.id;
    expect(pid, 'packet id ' + JSON.stringify(r.data));
    const g = await call('POST', `/redpacket/${pid}/grab`, A.token, {});
    ok(g);
  });

  await check('PK invite → accept → live score → quit', async () => {
    // PK runs between two solo lives: restart host 1 as solo
    const r1 = await call('POST', '/live/start', H1.token, { type: 'solo', title: 'PK time' });
    ok(r1);
    room1 = r1.data.room.id;
    await emit(sH1, 'room:join', { roomId: room1 });
    ok(await call('POST', `/live/${room1}/join`, A.token, {}));
    await emit(sA, 'room:join', { roomId: room1 });
    const r2 = await call('POST', '/live/start', H2.token, { type: 'solo', title: 'Two' });
    ok(r2);
    room2 = r2.data.room.id;
    await emit(sH2, 'room:join', { roomId: room2 });
    const inv = waitFor(sH2, 'pk:invite');
    ok(await call('POST', '/pk/invite', H1.token, { room_id: room2 }));
    pkId = (await inv).pk_id;
    const start = waitFor(sA, 'pk:start');
    ok(await call('POST', `/pk/${pkId}/accept`, H2.token, {}));
    await start;
    const sc = waitFor(sA, 'pk:score');
    const g = gifts.find((x) => x.price >= 10 && x.price <= 99);
    ok(await call('POST', '/gifts/send', A.token, { gift_id: g.id, receiver_id: H1.user.id, context: 'room', room_id: room1 }));
    await sc;
    ok(await call('GET', `/pk/${pkId}`, A.token));
    ok(await call('POST', `/pk/${pkId}/quit`, H1.token, {}));
  });

  await check('kick viewer → rejoin blocked', async () => {
    const V = await login('95' + rnd());
    ok(await call('POST', `/live/${room1}/join`, V.token, {}));
    const k = await call('POST', `/live/${room1}/kick`, H1.token, { user_id: V.user.id, minutes: 30 });
    ok(k);
    const again = await call('POST', `/live/${room1}/join`, V.token, {});
    expect(again.status === 403, 'kicked user blocked: ' + again.status);
  });

  await check('host ends live → summary', async () => {
    const p = waitFor(sA, 'room:ended');
    ok(await call('POST', `/live/${room1}/end`, H1.token, {}));
    await p;
    ok(await call('GET', `/live/${room1}/summary`, H1.token));
    ok(await call('POST', `/live/${room2}/end`, H2.token, {}));
  });

  await check('paid 1v1 call: ring → accept → signal relay → end (billed)', async () => {
    ok(await call('PATCH', '/me', H1.token, { call_enabled: true, call_rate: 60 }));
    const inc = waitFor(sH1, 'call:incoming');
    const r = await call('POST', '/calls', A.token, { host_id: H1.user.id, kind: 'video' });
    ok(r);
    callId = r.data.call.id;
    expect(r.data.iceServers?.length, 'ice servers');
    await inc;
    const acc = waitFor(sA, 'call:accepted');
    ok(await call('POST', `/calls/${callId}/accept`, H1.token, {}));
    await acc;
    const sig = waitFor(sH1, 'call:signal');
    sA.emit('call:signal', { callId, data: { type: 'offer', sdp: 'x' } });
    await sig;
    await sleep(500);
    const ended = waitFor(sA, 'call:ended');
    ok(await call('POST', `/calls/${callId}/end`, A.token, {}));
    const e = await ended;
    expect(e.coins > 0 || e.call?.coins > 0 || JSON.stringify(e).includes('"coins"'), 'billed: ' + JSON.stringify(e).slice(0, 200));
    ok(await call('POST', `/calls/${callId}/rate`, A.token, { stars: 5 }));
    ok(await call('GET', '/calls/history', A.token));
  });

  await check('random match', async () => {
    const r = await call('POST', '/calls/random', A.token, {});
    ok(r);
    const host = [H1, H2].find((h) => h.user.id === (r.data.host?.id ?? r.data.call.host_id));
    ok(await call('POST', `/calls/${r.data.call.id}/reject`, host.token, {}));
  });

  await check('DMs: send + list + thread', async () => {
    const p = waitFor(sH1, 'dm:new');
    ok(await call('POST', `/chats/${H1.user.id}`, A.token, { body: 'hello host', kind: 'text' }));
    await p;
    ok(await call('GET', '/chats', H1.token));
    ok(await call('GET', `/chats/${A.user.id}`, H1.token));
  });

  await check('moments: post, like, comment, gift', async () => {
    const fd = new FormData();
    fd.append('body', 'My first moment');
    const m = await call('POST', '/moments', H1.token, undefined, fd);
    ok(m);
    const mid = m.data.id || m.data.moment?.id;
    ok(await call('POST', `/moments/${mid}/like`, A.token, {}));
    ok(await call('POST', `/moments/${mid}/comments`, A.token, { body: 'nice' }));
    ok(await call('POST', '/gifts/send', A.token, { gift_id: gifts[0].id, receiver_id: H1.user.id, context: 'moment', moment_id: mid }));
    ok(await call('GET', '/moments?tab=all', A.token));
  });

  await check('follow, profile, gift wall, search, block/unblock', async () => {
    ok(await call('POST', `/users/${H1.user.id}/follow`, A.token, {}));
    const p = await call('GET', `/users/${H1.user.id}`, A.token);
    ok(p);
    ok(await call('GET', `/users/${H1.user.id}/giftwall`, A.token));
    ok(await call('GET', `/users/search?q=${H1.user.uid || H1.user.id}`, A.token));
    ok(await call('POST', `/users/${H2.user.id}/block`, A.token, {}));
    ok(await call('DELETE', `/users/${H2.user.id}/block`, A.token));
  });

  await check('VIP, noble, store item + equip, pretty ID', async () => {
    ok(await call('POST', '/vip/buy', A.token, { level: 2 }));
    const nobles = (await call('GET', '/noble', A.token)).data;
    ok(await call('POST', '/noble/buy', A.token, { rank: (nobles[0] || {}).rank ?? 1 }));
    const store = (await call('GET', '/store', A.token)).data;
    const items = Array.isArray(store) ? store : store.items || [];
    const it = items[0];
    const b = await call('POST', '/store/buy', A.token, { item_id: it.id });
    ok(b);
    const ids = (await call('GET', '/fancy-ids', A.token)).data;
    const f = (Array.isArray(ids) ? ids : ids.items || [])[0];
    if (f) ok(await call('POST', '/fancy-ids/buy', A.token, { id: f.id }));
  });

  await check('family create + join + approve', async () => {
    const f = await call('POST', '/families', A.token, { name: 'Fam' + rnd().slice(0, 4), badge: 'FAM', join_mode: 'approval' });
    ok(f);
    const fid = f.data.id || f.data.family?.id;
    ok(await call('POST', `/families/${fid}/join`, H2.token, {}));
    const appr = await call('POST', `/families/${fid}/members/${H2.user.id}`, A.token, { action: 'approve' });
    ok(appr);
    ok(await call('GET', `/families/${fid}`, A.token));
    ok(await call('POST', `/families/${fid}/messages`, A.token, { body: 'welcome' }));
  });

  await check('rewards: check-in, spin, tasks, referral, ads status', async () => {
    ok(await call('POST', '/checkin', A.token, {}));
    ok(await call('POST', '/spin', A.token, {}));
    const t = await call('GET', '/tasks', A.token);
    ok(t);
    ok(await call('GET', '/referral', A.token));
    ok(await call('GET', '/ads/status', A.token));
  });

  await check('wallet: packages, ledger, exchange diamonds', async () => {
    ok(await call('GET', '/recharge/packages?platform=web', A.token));
    ok(await call('GET', '/me/ledger', A.token));
    const w = (await call('GET', '/wallet', H1.token)).data;
    const ex = await call('POST', '/wallet/exchange', H1.token, { diamonds: Math.min(w.diamonds, 100) });
    expect(ex.status < 300 || ex.status === 400, 'exchange handled ' + ex.status);
  });

  await check('rankings + events + home + config', async () => {
    ok(await call('GET', '/rankings?type=rich&period=daily', A.token));
    ok(await call('GET', '/rankings?type=charm&period=weekly', A.token));
    ok(await call('GET', '/events', A.token));
    ok(await call('GET', '/home', A.token));
    ok(await call('GET', '/config'));
  });

  await check('host center + payout + salary settlement flow', async () => {
    ok(await call('GET', '/host/center', H1.token));
    ok(await call('PATCH', '/host/payout', H1.token, { method: 'upi', details: { upi: 'host@upi' } }));
    const month = new Date().toISOString().slice(0, 7);
    const run = await call('POST', '/admin/settlement/run', admin, { month });
    ok(run);
    console.log('    settlement run:', JSON.stringify(run.data));
    const rows = (await call('GET', `/admin/settlements?month=${month}`, admin)).data;
    const list = Array.isArray(rows) ? rows : rows.rows || rows.items || [];
    const mine = list.find((x) => x.host_id === H1.user.id);
    expect(mine, 'host settlement row: ' + JSON.stringify(rows).slice(0, 300));
    ok(await call('POST', `/admin/settlements/${mine.id}/approve`, admin, {}));
    ok(await call('POST', `/admin/settlements/${mine.id}/paid`, admin, { payout_ref: 'UTR1' }));
    ok(await call('GET', '/agency/hosts', agencyTok));
    ok(await call('GET', '/agency/commissions', agencyTok));
    ok(await call('GET', '/host/income', H1.token));
  });

  await check('coin seller: create, stock, transfer', async () => {
    ok(await call('POST', '/admin/sellers', admin, { uid: H2.user.uid, password: 'Seller@123' }));
    ok(await call('POST', `/admin/sellers/${H2.user.id}/topup`, admin, { coins: 10000, note: 'stock' }));
    const l = await call('POST', '/seller/login', null, { uid: H2.user.uid, password: 'Seller@123' });
    ok(l);
    ok(await call('GET', `/seller/lookup/${A.user.uid}`, l.data.token));
    ok(await call('POST', '/seller/transfer', l.data.token, { uid: A.user.uid, coins: 500 }));
    ok(await call('GET', '/seller/transfers', l.data.token));
  });

  await check('report → admin reports queue', async () => {
    const fd = new FormData();
    fd.append('target_type', 'user');
    fd.append('target_id', String(H2.user.id));
    fd.append('reason', 'spam');
    ok(await call('POST', '/reports', A.token, undefined, fd));
    ok(await call('GET', '/admin/reports', admin));
  });

  await check('admin GET pages all respond', async () => {
    const paths = ['users', `users/${A.user.id}`, 'hosts', 'agencies', 'staff', 'audit', 'settings', 'support', 'families', 'banned-devices', 'orders', 'settlements', 'commissions', 'sellers', 'ledger', 'finance/summary', 'analytics', 'live', 'live/history', 'pk', 'calls', 'reports', 'risk', 'notifications', 'moments', 'rankings'];
    for (const p of paths) ok(await call('GET', `/admin/${p}`, admin), p);
    const c = await call('GET', '/admin/content/gifts', admin);
    if (c.status === 404) console.log('    (content endpoints use a different path)');
  });

  await check('admin ban → user blocked → unban', async () => {
    ok(await call('POST', `/admin/users/${H2.user.id}/ban`, admin, { hours: 1, reason: 'test' }));
    const r = await call('GET', '/me', H2.token);
    expect(r.status === 401 || r.status === 403, 'banned user rejected: ' + r.status);
    ok(await call('POST', `/admin/users/${H2.user.id}/unban`, admin, {}));
  });

  await check('notifications broadcast reaches inbox', async () => {
    ok(await call('POST', '/admin/notifications', admin, { title: 'Hello', body: 'Test', segment: 'all' }));
    ok(await call('GET', '/notifications', A.token));
  });

  await check('premium FX library: SVGA gifts, small gifts, entry effects served', async () => {
    const g = (await call('GET', '/gifts', A.token)).data;
    const list = Array.isArray(g) ? g : g.gifts || g.items || [];
    const svga = list.filter((x) => x.anim_type === 'svga');
    expect(svga.length >= 40, `expected 40 SVGA gifts, got ${svga.length}`);
    expect(list.filter((x) => x.anim_url === 'css:pop').length >= 20, 'small gifts missing');
    const f = await fetch(API + svga[0].anim_url);
    expect(f.status === 200 && (await f.arrayBuffer()).byteLength > 10000, 'svga file not served');
    expect(/immutable/.test(f.headers.get('cache-control') || ''), 'svga not cached');
    const st = (await call('GET', '/store', A.token)).data;
    expect(st.filter((x) => /\.svga$/.test(x.anim_url || '')).length >= 10, 'entry/mount effects missing');
  });

  await check('CP: propose → accept → shown on profile → end', async () => {
    const before = (await call('GET', '/me', A.token)).data.coins;
    ok(await call('POST', '/cp/propose', A.token, { user_id: H2.user.id }));
    const reqs = (await call('GET', '/cp/requests', H2.token)).data;
    expect(reqs.length === 1 && reqs[0].from.id === A.user.id, 'request not received');
    ok(await call('POST', `/cp/requests/${reqs[0].id}`, H2.token, { accept: true }));
    const me = (await call('GET', '/me', A.token)).data;
    expect(me.cp?.user?.id === H2.user.id, 'cp not on me');
    expect(me.coins === before - 1314, `cp price not charged ${before}→${me.coins}`);
    const p = (await call('GET', `/users/${H2.user.id}`, A.token)).data;
    expect(p.cp?.user?.id === A.user.id, 'cp not on profile');
    ok(await call('DELETE', '/cp', A.token));
    expect(!(await call('GET', '/me', H2.token)).data.cp, 'cp not ended for partner');
  });

  await check('fan club: join → host earns → gifts raise level', async () => {
    const d0 = (await call('GET', '/me', H1.token)).data.diamonds;
    ok(await call('POST', `/fan-club/${H1.user.id}/join`, A.token, {}));
    const d1 = (await call('GET', '/me', H1.token)).data.diamonds;
    expect(d1 > d0, 'host did not earn diamonds');
    const fc = (await call('GET', `/fan-club/${H1.user.id}`, A.token)).data;
    expect(fc.me && fc.members >= 1, 'not joined');
    const mine = (await call('GET', '/fan-clubs/mine', A.token)).data;
    expect(mine.length >= 1, 'my fan clubs empty');
  });

  await check('balances never negative', async () => {
    const u = (await call('GET', '/admin/users?limit=200', admin)).data;
    const list = Array.isArray(u) ? u : u.items || u.users || [];
    expect(list.every((x) => (x.coins ?? 0) >= 0 && (x.diamonds ?? 0) >= 0), 'negative balance found');
  });

  for (const s of [sA, sH1, sH2]) s.close();
  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) console.log('Failed:', failed.join(' | '));
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

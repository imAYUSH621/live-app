// Regression: admin finance summary must treat the `to` date as inclusive.
// Bug: created_at < to silently dropped the whole end day, so the "movements
// by type" aggregation could show nothing while the raw ledger listed entries.
//   DATABASE_URL=... API=http://localhost:4000 node test/finance_summary_dates.mjs
import pg from 'pg';

const API = process.env.API || 'http://localhost:4000';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@test.com', password: process.env.ADMIN_PASSWORD || 'Admin@12345' };
const TYPE = 'boundary_test';
let passed = 0;
const failed = [];
const ok = (name, cond, detail = '') => { if (cond) { passed++; console.log('ok -', name); } else { failed.push(name); console.log('FAIL -', name, detail); } };

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

// Far-future dates so the fixture never collides with real data. Offsets are
// explicit (+05:30) so the boundary does not depend on server timezone.
const ROWS = [
  ['2099-03-10T00:00:00+05:30', 10],  // start boundary: included
  ['2099-03-11T23:59:59+05:30', 20],  // late on the end date: included (the regression)
  ['2099-03-12T00:00:01+05:30', 40],  // one second into the next day: excluded
];
const user = await db.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
const uid = user.rows[0].id;
await db.query(`DELETE FROM ledger WHERE type=$1`, [TYPE]);
for (const [ts, amount] of ROWS) {
  await db.query(`INSERT INTO ledger(user_id, currency, amount, balance_after, type, note, created_at) VALUES ($1,'coin',$2,0,$3,'date-boundary fixture',$4)`, [uid, amount, TYPE, ts]);
}

const login = await fetch(API + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
const { token } = await login.json();
const summary = async (from, to) => {
  const r = await fetch(`${API}/api/admin/finance/summary?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('summary HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
};

const s1 = await summary('2099-03-10', '2099-03-11');
const hit1 = s1.by_type.find((r) => r.type === TYPE);
ok('end date is inclusive (start + end-day rows kept, next-day row dropped)', hit1 && hit1.n === 2 && Number(hit1.amount) === 30, JSON.stringify(hit1));

const s2 = await summary('2099-03-12', '2099-03-12');
const hit2 = s2.by_type.find((r) => r.type === TYPE);
ok('single-day range selects exactly that day', hit2 && hit2.n === 1 && Number(hit2.amount) === 40, JSON.stringify(hit2));

const s3 = await summary('2099-03-10', '2099-03-10');
const hit3 = s3.by_type.find((r) => r.type === TYPE);
ok('start boundary at midnight is included', hit3 && hit3.n === 1 && Number(hit3.amount) === 10, JSON.stringify(hit3));

await db.query(`DELETE FROM ledger WHERE type=$1`, [TYPE]);
await db.end();
console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

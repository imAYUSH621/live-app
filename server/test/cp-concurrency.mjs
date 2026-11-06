// Actual CP handlers and actual wallet helper against an isolated PostgreSQL DB.
// CP_TEST_DATABASE_URL must point to a disposable local DB. No live services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pg from 'pg';
import { changeCoins,changeDiamonds } from '../src/lib/wallet.js';
import { need,int,notFound,forbidden } from '../src/lib/util.js';
const url=process.env.CP_TEST_DATABASE_URL;
assert(url && /(?:localhost|127\.0\.0\.1|%2Ftmp)/.test(url),'Use disposable local PostgreSQL only');
const pool=new pg.Pool({connectionString:url,max:20});
const query=async(t,p=[])=>{const r=await pool.query(t,p);return r.rows;};
const one=async(t,p=[])=> (await query(t,p))[0]||null;
const tx=async(fn)=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn({q:async(t,p=[])=> (await c.query(t,p)).rows,one:async(t,p=[])=> (await c.query(t,p)).rows[0]||null});await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
const routes={};let notices=[];
const context={q:query,one,tx,need,int,notFound,forbidden,changeCoins,changeDiamonds,getSettings:async()=>({features:{cp:true},economy:{cp_coins:100}}),miniProfile:async id=>({id}),miniProfiles:async()=>[],invalidateProfile:()=>{},toUser:(...x)=>notices.push(x),auth:()=>{},Router:()=>({post:(p,...h)=>routes['POST '+p]=h.at(-1),get:()=>{},delete:()=>{}}),userAuth:()=>()=>{}};
vm.createContext(context);
let source=fs.readFileSync(process.env.CP_ROUTE_SOURCE||new URL('../src/routes/bonds.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export const ','const ').replace('export default r;','');
vm.runInContext(source,context);
async function reset(){await query('TRUNCATE cp_requests,ledger,users RESTART IDENTITY');await query('INSERT INTO users(id,coins) VALUES (1,1000),(2,1000),(3,1000)');notices=[];}
async function run(path,user,body={},id){let result;try{await routes['POST '+path]({user:{id:user},body,params:{id}}, {json:x=>{result=x;}});return{ok:true,result};}catch(e){return{ok:false,error:e.message};}}
try{
 await query(`DROP TABLE IF EXISTS ledger,cp_requests,users CASCADE;CREATE TABLE users(id bigint PRIMARY KEY,coins bigint NOT NULL,cp_user_id bigint,cp_since timestamptz,total_spent bigint DEFAULT 0,wallet_frozen boolean DEFAULT false);CREATE TABLE cp_requests(id bigserial PRIMARY KEY,from_id bigint,to_id bigint,coins bigint,status text DEFAULT 'pending');CREATE TABLE ledger(id bigserial PRIMARY KEY,user_id bigint,currency text,amount bigint,balance_after bigint,type text,ref_type text,ref_id text,note text)`);
 await reset();let r=await Promise.all(Array.from({length:12},()=>run('/cp/propose',1,{user_id:2})));assert.equal(r.filter(x=>x.ok).length,1,'concurrent duplicate proposals settle once');assert.equal((await one('SELECT coins FROM users WHERE id=1')).coins,'900');assert.equal((await one('SELECT count(*) AS n FROM ledger')).n,'1');console.log('PASS concurrent duplicate propose: one charge/request/ledger');
 let rq=await one('SELECT id FROM cp_requests');r=await Promise.all(Array.from({length:12},()=>run('/cp/requests/:id',2,{accept:false},rq.id)));assert.equal(r.filter(x=>x.ok).length,1,'concurrent declines settle once');assert.equal((await one('SELECT coins FROM users WHERE id=1')).coins,'1000');assert.equal((await one("SELECT count(*) AS n FROM ledger WHERE type='refund'")).n,'1');assert.equal(notices.filter(x=>x[1]==='cp:declined').length,1);console.log('PASS concurrent decline: one refund/notice');
 await reset();await run('/cp/propose',1,{user_id:2});rq=await one('SELECT id FROM cp_requests');r=await Promise.all([run('/cp/requests/:id',2,{accept:true},rq.id),run('/cp/requests/:id',2,{accept:false},rq.id)]);assert.equal(r.filter(x=>x.ok).length,1);const state=await one('SELECT status FROM cp_requests');assert(['accepted','rejected'].includes(state.status));const us=await query('SELECT id,cp_user_id,coins FROM users ORDER BY id');if(state.status==='accepted'){assert.equal(us[0].cp_user_id,'2');assert.equal(us[1].cp_user_id,'1');assert.equal(us[0].coins,'900');}else{assert.equal(us[0].cp_user_id,null);assert.equal(us[0].coins,'1000');}console.log('PASS accept-vs-decline: exactly one consistent outcome');
 await reset();await run('/cp/propose',1,{user_id:2});await run('/cp/propose',3,{user_id:2});const pending=await query('SELECT * FROM cp_requests ORDER BY id');r=await Promise.all(pending.map(x=>run('/cp/requests/:id',2,{accept:true},x.id)));assert.equal(r.filter(x=>x.ok).length,1);assert.equal((await one('SELECT count(*) AS n FROM users WHERE cp_user_id IS NOT NULL')).n,'2');assert.equal((await one("SELECT count(*) AS n FROM cp_requests WHERE status='accepted'")).n,'1');console.log('PASS competing accepts: exactly one symmetric pair, losing request rollback');
 await reset();r=await run('/cp/propose',1,{user_id:1});assert(!r.ok);r=await run('/cp/propose',1,{user_id:99});assert(!r.ok);await query('UPDATE users SET coins=10 WHERE id=1');r=await run('/cp/propose',1,{user_id:2});assert(!r.ok);assert.equal((await one('SELECT count(*) AS n FROM ledger')).n,'0');assert.equal((await one('SELECT count(*) AS n FROM cp_requests')).n,'0');console.log('PASS self/missing/insufficient coins reject without residual writes');
 await reset();await run('/cp/propose',1,{user_id:2});rq=await one('SELECT id FROM cp_requests');r=await run('/cp/requests/:id',3,{accept:false},rq.id);assert(!r.ok);assert.equal((await one('SELECT coins FROM users WHERE id=1')).coins,'900');console.log('PASS non-recipient cannot settle/refund');
}finally{await pool.end();}

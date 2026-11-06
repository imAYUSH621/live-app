// Executes the real login handler with isolated dependencies. No real account,
// token, database or network is used. Uses real bcrypt and TOTP with synthetic
// credentials and secrets, plus isolated database and token-issuance fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import bcrypt from 'bcryptjs';
import { generateSecret, generateSync, verifySync } from 'otplib';
const hash = await bcrypt.hash('correct-fixture', 4);
const totpSecret = generateSecret();
const validOtp = generateSync({ secret: totpSecret });
const source=fs.readFileSync(new URL('../src/routes/admin.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('const handleAdminLogin ='),source.indexOf("r.post('/admin/login'"));
const roles={super_admin:['*'],support:['dashboard','users.view','support','reports']};
let admin,agency,compares,tokenCalls,queries;
const context={
 str:(v)=>String(v||'').trim(),
 one:async(sql)=>sql.includes('admin_users')?admin:agency,
 q:async()=>{queries++;},
 bcrypt:{compare:async(password,hash)=>{compares++;return bcrypt.compare(password,hash);}},
 need:(condition,message)=>{if(!condition) throw Error(message);},
 bad:(message)=>Error(message),
 verifySync,
 signToken:(kind)=>{tokenCalls++;return 'fixture-'+kind;},
 ROLE_MODULES:roles, clientIp:()=> '127.0.0.1',
};
vm.createContext(context);vm.runInContext(body+'\nthis.handler=handleAdminLogin;',context);
const defaults={id:1,name:'Dummy',email:'dummy@example.invalid',password_hash:hash,status:'active',role:'support'};
async function run(password,otp){
 compares=0;tokenCalls=0;queries=0;
 const result={status:200};const res={status(n){result.status=n;return this;},json(v){result.data=v;return this;}};
 try{await context.handler({body:{email:defaults.email,password,otp}},res);}catch(e){result.error=e.message;}
 return result;
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
admin={...defaults};agency=null;
await test('wrong admin password cannot bypass bcrypt',async()=>{const r=await run('wrong-fixture');assert(r.error);assert.equal(compares,1);assert.equal(tokenCalls,0);});
await test('valid support login preserves stored role and modules',async()=>{const r=await run('correct-fixture');assert.equal(r.data.admin.role,'support');assert.deepEqual(Array.from(r.data.admin.modules),roles.support);});
await test('configured 2FA rejects missing code without token or login update',async()=>{admin={...defaults,totp_secret:totpSecret};const r=await run('correct-fixture');assert.equal(r.status,401);assert.equal(tokenCalls,0);assert.equal(queries,0);});
await test('configured 2FA rejects wrong code',async()=>{const r=await run('correct-fixture','999999');assert(r.error);assert.equal(tokenCalls,0);});
await test('configured 2FA accepts valid code',async()=>{const r=await run('correct-fixture',validOtp);assert.equal(r.data.token,'fixture-admin');});
await test('disabled admin is rejected',async()=>{admin={...defaults,status:'disabled'};const r=await run('correct-fixture');assert(r.error);assert.equal(tokenCalls,0);});
await test('super admin retains full modules',async()=>{admin={...defaults,role:'super_admin'};const r=await run('correct-fixture');assert.equal(r.data.admin.role,'super_admin');assert.deepEqual(Array.from(r.data.admin.modules),['*']);});
await test('unknown role receives no module grant',async()=>{admin={...defaults,role:'unknown'};const r=await run('correct-fixture');assert.deepEqual(Array.from(r.data.admin.modules),[]);});
await test('wrong agency password is rejected',async()=>{admin=null;agency={...defaults};const r=await run('wrong-fixture');assert(r.error);assert.equal(compares,1);assert.equal(tokenCalls,0);});
await test('valid agency login keeps agency token kind',async()=>{const r=await run('correct-fixture');assert.equal(r.data.token,'fixture-agency');assert.equal(r.data.admin.role,'agency');});
await test('inactive agency is rejected',async()=>{agency={...defaults,status:'terminated'};const r=await run('correct-fixture');assert(r.error);assert.equal(tokenCalls,0);});
assert(!/password\s*===\s*['"]/.test(body),'no literal alternative password branches');
const setup=source.slice(source.indexOf("r.post('/admin/2fa/setup'"),source.indexOf("r.post('/admin/2fa/enable'"));
assert(!setup.includes('totp_secret=NULL'),'starting 2FA replacement must preserve current secret');
console.log(`${passed} handler cases + literal-bypass and 2FA-rotation guards passed`);

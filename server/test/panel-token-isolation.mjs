// Real JWT signatures + actual middleware, isolated DB and synthetic fixtures.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
const source=fs.readFileSync(new URL('../src/lib/auth.js',import.meta.url),'utf8');
const code=source.replace(/^import .*;$/gm,'').replace(/export /g,'');
let currentRole='support',active=true;
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const secret=randomBytes(32).toString('hex');
const context={jwt,config:{jwtSecret:secret},HttpError,one:async sql=>sql.includes('admin_users')?{id:1,role:currentRole,status:active?'active':'disabled'}:null};
vm.createContext(context);vm.runInContext(code+'\nthis.api={signToken,verifyToken,adminAuth,agencyAuth,sellerAuth,userAuth};',context);
const {signToken,verifyToken,adminAuth,agencyAuth,sellerAuth,userAuth}=context.api;
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
function req(token){return {headers:{authorization:'Bearer '+token},query:{}};}
async function rejected(middleware,token,status){let advanced=false;await assert.rejects(()=>middleware(req(token),{},()=>{advanced=true;}),e=>e.status===status);assert.equal(advanced,false);}
for(const kind of ['user','agency','seller']) await check(kind+' token cannot authenticate as admin',()=>rejected(adminAuth(),signToken(kind,1),401));
await check('tampered JWT rejected',()=>rejected(adminAuth(),signToken('admin',1)+'x',401));
await check('wrong signing secret rejected',()=>rejected(adminAuth(),jwt.sign({k:'admin',id:1},'unrelated-fixture-key'),401));
await check('expired JWT rejected',()=>rejected(adminAuth(),jwt.sign({k:'admin',id:1,exp:1},secret),401));
await check('support cannot access finance',()=>rejected(adminAuth('finance'),signToken('admin',1),403));
await check('stored role controls access after token issued',async()=>{const t=signToken('admin',1);currentRole='super_admin';let ok=false;await adminAuth('finance')(req(t),{},()=>{ok=true;});assert(ok);currentRole='support';await rejected(adminAuth('finance'),t,403);});
await check('disabled account invalidates existing token',async()=>{const t=signToken('admin',1);active=false;await rejected(adminAuth(),t,401);active=true;});
await check('admin token cannot authenticate as agency',()=>rejected(agencyAuth(),signToken('admin',1),401));
await check('admin token cannot authenticate as seller',()=>rejected(sellerAuth(),signToken('admin',1),401));
await check('admin token cannot authenticate as user',()=>rejected(userAuth(),signToken('admin',1),401));
await check('invalid token verifier returns null',()=>assert.equal(verifyToken('invalid-fixture'),null));
console.log(passed+' token/middleware isolation cases passed');

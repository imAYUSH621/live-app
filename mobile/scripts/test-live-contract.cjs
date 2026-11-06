const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ts=require(process.env.TYPESCRIPT_PATH||'typescript');
const root=path.resolve(__dirname,'../..');
const js=ts.transpileModule(fs.readFileSync(path.join(root,'mobile/src/api/liveContract.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const out={exports:{}};vm.runInNewContext(js,{exports:out.exports,module:out,encodeURIComponent,Error});
const {makeLiveApi,normalizeJoin}=out.exports;
const host={id:4,uid:12117748,name:'Dummy Host One'},calls=[];
const fixture={room:{id:1,host_id:4,host,likes:2,type:'solo'},token:'dummy',livekit_url:'wss://test.invalid',state:{host,seats:[{index:0}],viewers:3,likes:4,pk:{id:9}}};
const api=makeLiveApi({get:async route=>{calls.push(['GET',route]);return [{id:1,host_id:4,host_name:host.name,host_avatar:'/avatar',viewers:3}]},post:async(route,body)=>{calls.push(['POST',route,body]);return route.endsWith('/end')?{ok:true}:fixture}});
(async()=>{
 const rooms=await api.getRooms();assert.equal(calls.at(-1)[1],'/live/feed?tab=popular');assert.equal(rooms[0].host.name,host.name);assert.equal(rooms[0].viewer_count,3);
 await api.getRooms('pk battle');assert.equal(calls.at(-1)[1],'/live/feed?tab=pk');
 let r=await api.createRoom({title:'QA',category:'chat',mode:'live'});assert.equal(calls.at(-1)[1],'/live/start');assert.equal(calls.at(-1)[2].type,'video');assert.equal(r.host.uid,host.uid);assert.equal(r.seats.length,1);assert.equal(r.room.viewer_count,3);assert.equal(r.room.likes,4);assert.equal(r.pk.id,9);
 await api.createRoom({title:'QA',category:'chat',mode:'audio'});assert.equal(calls.at(-1)[2].type,'audio');
 await api.joinRoom(12,'room-password');assert.equal(calls.at(-1)[1],'/live/12/join');assert.equal(calls.at(-1)[2].password,'room-password');
 await api.endRoom(12);assert.equal(calls.at(-1)[1],'/live/12/end');assert.equal(api.leaveRoom,undefined);
 assert.throws(()=>normalizeJoin({room:{}}),/Incomplete/);
 const legacy=normalizeJoin({...fixture,host,seats:[],pk:{id:10}});assert.equal(legacy.pk.id,10);assert.equal(legacy.seats.length,0);
 // Guard the adapter against drift from the actual registered server routes.
 const server=fs.readFileSync(path.join(root,'server/src/routes/live.js'),'utf8');
 for(const [method,route] of [['get','/live/feed'],['post','/live/start'],['post','/live/:id/join'],['post','/live/:id/end']])assert(server.includes(`r.${method}('${route}'`));
 console.log('PASS native live API: feed metadata/tab, video/audio start, protected join, end, nested host/seats/viewers/likes/PK, missing response, server route registry');
})().catch(e=>{console.error(e);process.exitCode=1});

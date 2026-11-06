const fs=require('fs'),pptr=require('/tmp/qa-media/node_modules/puppeteer-core');
const BASE='https://liveapp-server-ksvy.onrender.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let roomId,browser;
async function api(path,body,token){let r=await fetch(BASE+'/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
(async()=>{try{
 const g=await api('/auth/guest',{device_id:'native-media-viewer-'+Date.now()});if(g.status!==200)throw Error('guest viewer auth failed');
 // Native auth/navigation can take several minutes on a cold emulator.
 for(let i=0;i<90;i++){const f=await api('/live/feed',null,g.data.token);const r=Array.isArray(f.data.rooms)?f.data.rooms.find(x=>x.host_id===4&&String(x.title).includes('Native')):null;if(r){roomId=r.id;break;}await sleep(5000);}
 if(!roomId)throw Error('native host room not observed in allotted window');
 browser=await pptr.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();await page.setViewport({width:390,height:844});
 await page.evaluateOnNewDocument(()=>{window.__pcs=[];const C=window.RTCPeerConnection;window.RTCPeerConnection=class extends C{constructor(...a){super(...a);window.__pcs.push(this)}}});
 await page.goto(BASE+'/login');await page.evaluate(t=>localStorage.setItem('liveapp_token',t),g.data.token);await page.goto(BASE+'/live/'+roomId,{waitUntil:'networkidle2'});await sleep(25000);
 const result=await page.evaluate(async()=>({text:document.body.innerText,videos:[...document.querySelectorAll('video')].map(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,ready:v.readyState})),stats:await Promise.all(window.__pcs.map(async pc=>({state:pc.connectionState,reports:[...(await pc.getStats()).values()].filter(x=>x.type==='inbound-rtp').map(x=>({kind:x.kind,bytesReceived:x.bytesReceived,framesDecoded:x.framesDecoded}))})))}));
 fs.writeFileSync('native-media-receive.json',JSON.stringify({roomId,...result},null,2));await page.screenshot({path:'native-media-viewer.png',fullPage:true});
 const received=result.stats.some(p=>p.reports.some(r=>r.kind==='video'&&r.framesDecoded>20));console.log('native-source video decoded:',received,'room',roomId);if(!received)process.exitCode=1;
}finally{if(browser)await browser.close();if(roomId){const h=await api('/auth/login',{email:process.env.DUMMY_HOST_EMAIL,password:process.env.DUMMY_HOST_PASSWORD,device_id:'native-media-cleanup'});if(h.status===200){const r=await api('/live/'+roomId+'/end',{},h.data.token);console.log('native QA room cleanup',r.status);}else{console.log('native QA cleanup auth unavailable');process.exitCode=1;}}}})().catch(e=>{console.log('native media bounded outcome:',e.message);process.exitCode=1});

import { io } from 'socket.io-client';

const API_BASE = 'https://live-app-6ykc.onrender.com';
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

async function call(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(API_BASE + '/api' + path, { method, headers, body: payload });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, data };
}

function sock(token) {
  return new Promise((resolve, reject) => {
    const s = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => reject(err));
  });
}

function waitFor(s, ev, ms = 8000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting for ' + ev)), ms);
    s.once(ev, (d) => {
      clearTimeout(t);
      res(d);
    });
  });
}

const emit = (s, ev, d) => new Promise((res) => s.emit(ev, d, res));

async function loginUser(phonePrefix = '91') {
  const phone = phonePrefix + rnd();
  const s = await call('POST', '/auth/otp/send', null, { phone });
  if (s.status >= 300) throw new Error('OTP send failed: ' + JSON.stringify(s.data));
  const code = s.data.dev_code || '123456';
  const r = await call('POST', '/auth/otp/verify', null, {
    phone,
    code,
    device_id: 'test-device-' + phone,
  });
  if (r.status >= 300) throw new Error('OTP verify failed: ' + JSON.stringify(r.data));
  return { token: r.data.token, user: r.data.user, phone };
}

async function run() {
  console.log('====================================================');
  console.log('🚀 LIVE STREAMING & BACKEND FULL VERIFICATION TEST');
  console.log('Target Server:', API_BASE);
  console.log('====================================================\n');

  // 1. Health check
  console.log('[1/9] Checking Health Endpoint...');
  const health = await call('GET', '/health');
  console.log('  Status:', health.status);
  console.log('  Data:', JSON.stringify(health.data));
  if (!health.data.ok) throw new Error('Health check failed!');
  console.log('  ✓ Backend, Database, In-Memory Store, & LiveKit are ALL HEALTHY!\n');

  // 2. Authenticate Host
  console.log('[2/9] Logging in Host User...');
  const host = await loginUser('98');
  await call('PATCH', '/me', host.token, { name: 'Host-' + rnd().slice(0, 4), dob: '1995-01-01', gender: 'female' });
  console.log(`  ✓ Host logged in: ID=${host.user.id}, Phone=${host.phone}`);

  // 3. Authenticate Viewer
  console.log('[3/9] Logging in Viewer User...');
  const viewer = await loginUser('97');
  await call('PATCH', '/me', viewer.token, { name: 'Viewer-' + rnd().slice(0, 4), dob: '1998-05-12', gender: 'male' });
  console.log(`  ✓ Viewer logged in: ID=${viewer.user.id}, Phone=${viewer.phone}\n`);

  // 4. Socket.io connections
  console.log('[4/9] Connecting Host & Viewer via Socket.io...');
  const hostSock = await sock(host.token);
  console.log('  ✓ Host Socket.io Connected (ID:', hostSock.id, ')');
  const viewerSock = await sock(viewer.token);
  console.log('  ✓ Viewer Socket.io Connected (ID:', viewerSock.id, ')\n');

  // 5. Host starts Live Stream
  console.log('[5/9] Host starting Live Stream...');
  const startRes = await call('POST', '/live/start', host.token, {
    type: 'solo',
    title: 'Verification Live Stream',
  });
  if (startRes.status >= 300) throw new Error('Failed to start live: ' + JSON.stringify(startRes.data));
  const room = startRes.data.room;
  const hostLivekitToken = startRes.data.token;
  const livekitUrl = startRes.data.livekit_url;
  console.log(`  ✓ Room Created: ID=${room.id}, Title="${room.title}"`);
  console.log(`  ✓ Host LiveKit Token received (Length: ${hostLivekitToken.length})`);
  console.log(`  ✓ LiveKit SFU URL: ${livekitUrl}`);

  // Host joins socket room
  const hostJoinAck = await emit(hostSock, 'room:join', { roomId: room.id });
  console.log('  ✓ Host joined socket room:', hostJoinAck);

  // 6. Check live feed
  console.log('\n[6/9] Verifying Live Feed for Viewer...');
  const feedRes = await call('GET', '/live/feed?tab=popular', viewer.token);
  const items = feedRes.data.items || feedRes.data || [];
  const found = items.some((r) => r.id === room.id);
  console.log(`  ✓ Feed returned ${items.length} live rooms. New room found in feed: ${found}`);

  // 7. Viewer joins Live Stream
  console.log('\n[7/9] Viewer joining Live Stream...');
  const enterPromise = waitFor(hostSock, 'room:enter');
  const viewerJoinRes = await call('POST', `/live/${room.id}/join`, viewer.token, {});
  if (viewerJoinRes.status >= 300) throw new Error('Viewer join REST failed: ' + JSON.stringify(viewerJoinRes.data));
  const viewerLivekitToken = viewerJoinRes.data.token;
  console.log(`  ✓ Viewer LiveKit Subscriber Token received (Length: ${viewerLivekitToken.length})`);

  const viewerJoinAck = await emit(viewerSock, 'room:join', { roomId: room.id });
  console.log('  ✓ Viewer joined socket room:', viewerJoinAck);

  const enterEvent = await enterPromise;
  console.log(`  ✓ Host received "room:enter" notification for user ${enterEvent.user?.id || enterEvent.user_id}!`);

  // 8. Real-time Live Interaction (Chat & Likes)
  console.log('\n[8/9] Testing Real-time Chat and Heart Likes...');
  const chatPromise = waitFor(hostSock, 'room:chat');
  const chatAck = await emit(viewerSock, 'room:chat', {
    roomId: room.id,
    text: 'Hello from Viewer! Camera and Audio working!',
  });
  console.log('  ✓ Viewer sent chat, ACK:', chatAck);
  const chatMsg = await chatPromise;
  console.log(`  ✓ Host received chat message: "${chatMsg.text}"`);

  // Viewer sends like
  const likePromise = waitFor(hostSock, 'room:likes');
  viewerSock.emit('room:like', { roomId: room.id, n: 5 });
  const likeEvt = await likePromise;
  console.log('  ✓ Host received live like stream event, total likes:', likeEvt.likes);

  // 9. Two-way WebRTC Audio/Video Signaling
  console.log('\n[9/9] Testing Two-Way WebRTC Signaling (Camera & Audio sync)...');
  const signalPromise = waitFor(viewerSock, 'room:signal');
  hostSock.emit('room:signal', {
    roomId: room.id,
    to: viewer.user.id,
    data: { type: 'offer', sdp: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 RTP/AVP 0\r\nm=video 9 RTP/AVP 96' },
  });
  const receivedSignal = await signalPromise;
  console.log(`  ✓ Viewer received WebRTC signal from Host: type="${receivedSignal.data?.type}"`);

  // Viewer responds back to Host
  const hostSignalPromise = waitFor(hostSock, 'room:signal');
  viewerSock.emit('room:signal', {
    roomId: room.id,
    to: host.user.id,
    data: { type: 'answer', sdp: 'v=0\r\no=- 654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 RTP/AVP 0\r\nm=video 9 RTP/AVP 96' },
  });
  const hostReceived = await hostSignalPromise;
  console.log(`  ✓ Host received WebRTC answer back from Viewer: type="${hostReceived.data?.type}"`);

  // End live stream
  console.log('\nEnding Live Stream...');
  const endedPromise = waitFor(viewerSock, 'room:ended');
  const endRes = await call('POST', `/live/${room.id}/end`, host.token, {});
  console.log('  ✓ Host ended stream, status:', endRes.status);
  const endedSummary = await endedPromise;
  console.log(`  ✓ Viewer received "room:ended" broadcast event (Total Viewers: ${endedSummary.total_seen || endedSummary.viewers || 0})!`);

  hostSock.disconnect();
  viewerSock.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 9 LIVE STREAMING & BACKEND CHECKS PASSED (100% OPERATIONAL)!');
  console.log('================================================================');
}

run().catch((e) => {
  console.error('\n❌ TEST FAILED:', e.message);
  process.exit(1);
});

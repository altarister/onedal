// 71판 V5 앞 — 콜 하나만 마일스톤 넷을 차례로 보낸다(관제웹 자리를 넘겨받지 않음)
import { createRequire } from 'node:module';
const require = createRequire(new URL('../onedal-web/client-app/package.json', import.meta.url));
const { io } = require('socket.io-client');
const ORDER = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(ORDER ?? '')) { console.error('콜 id 를 통째로'); process.exit(1); }
const API = 'http://localhost:4000';
const login = await (await fetch(`${API}/api/auth/bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
if (!login.accessToken) { console.error('로그인 실패'); process.exit(1); }
const s = io(API, { auth: { token: login.accessToken, clientSessionId: 'v71-unload-script' }, transports: ['websocket'], reconnection: false });
s.on('session-conflict', () => console.log('세션 충돌 안내(이 소켓만 받음 · 넘겨받지 않음)'));
await new Promise((ok, no) => { s.on('connect', ok); s.on('connect_error', no); });
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const milestone of ['ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF', 'DELIVERED']) {
  s.emit('report-milestone', { orderId: ORDER, milestone });
  console.log(new Date().toTimeString().slice(0, 8), milestone);
  await wait(1500);
}
s.disconnect(); process.exit(0);

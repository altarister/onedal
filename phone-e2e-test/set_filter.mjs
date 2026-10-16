// 시험용 필터 맞추기 — 관제앱 «💾 서버 저장»과 같은 길(소켓 update-filter + saveAsDefault)로 필터 칸을 한 번에 바꾼다. DB 에 직접 쓰지 않는다.
// 쓰는 법: node set_filter.mjs '{"destinationCity":"이천시","excludedRegions":[],"minFare":6000}'
// 로컬 서버(:4000) 우회 로그인으로 기사님 계정에 붙는다 · 관제앱 자리를 넘겨받지 않게 clientSessionId 를 따로 쓴다.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../onedal-web/client-app/package.json', import.meta.url));
const { io } = require('socket.io-client');
const changes = JSON.parse(process.argv[2] ?? '{}');
if (!Object.keys(changes).length) { console.error('바꿀 필터 칸을 JSON 으로'); process.exit(1); }
const API = 'http://localhost:4000';
const login = await (await fetch(`${API}/api/auth/bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
if (!login.accessToken) { console.error('로그인 실패'); process.exit(1); }
const s = io(API, { auth: { token: login.accessToken, clientSessionId: 'phone-test-set-filter' }, transports: ['websocket'], reconnection: false });
s.on('connect_error', e => { console.error('소켓 실패', e.message); process.exit(1); });
s.on('connect', () => {
    s.emit('update-filter', { ...changes, saveAsDefault: true });
    console.log(JSON.stringify({ sent: changes }));
    setTimeout(() => { s.close(); process.exit(0); }, 1500);
});

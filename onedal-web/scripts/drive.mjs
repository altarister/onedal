#!/usr/bin/env node
/**
 * 🚚 **모의 주행 — 하루를 순서대로 살아 본다**
 * 누가: 에이전트
 * 언제: 경로 순서 · 도착 감지 · 궤적을 고친 뒤
 * 어디서: cd onedal-web && pnpm drive (폰·개발 서버 불필요 · 카카오 키는 없어도 돈다 — 있으면 서버가 .env 에서 읽어 부른다) · pnpm drive e2e (통신 고리까지 · 카카오 끔)
 * 무엇을: GPS 를 재생해 모든 정거장을 걷는다 — 전용 포트 4014 · 전용 DB drive.db · e2e 면 로그인 · 폰 토큰 · 결재 전달 · 운영센터 · 세션 충돌 · 계정 막힘도
 * 왜: 주행을 나가야만 보이던 것을 책상에서 잡는다 · 고친 것 때문에 통신 고리가 끊기는 것을 올리기 전에 잡는다(기사님 «배포 안 해도 로컬에서 다 확인하고 올리고 싶어»)
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 * ══ 왜 있는가 ══
 *
 * 경로 순서 · 도착 감지 · 궤적의 `stop_type` 은 **주행을 나가야만 확인된다.** 기사님이 하루에 한 번
 * 나가시는데 그때만 확인되면 **하루에 한 번밖에 못 고친다.** 그래서 GPS 를 재생해 책상에서 잡는다.
 *
 * ══ 무엇을 재현하는가 — 기사님 실측 사고 ══
 *
 * 기사님: *"기사님 위치에서 **곤지암 하차 4.0km · 가남 29.9km** 인데 순서가
 * ⑴가남상차 ⑵가남하차 ⑶세종대왕면하차 **⑷곤지암하차(94분)** 로 나왔다"*
 *
 * 4km 앞에 내릴 짐이 있는데 30km 동쪽으로 끌려갔다가 되돌아온 것이다.
 * 원인은 「상차를 전부 먼저」 규칙 — **새 콜이 붙으면 그 상차지로 무조건 먼저 간다.**
 *
 * 🔴 **핵심은 «주행 중에 합짐이 붙는 순간»이다.** 처음부터 콜을 다 알고 짜는 것과
 *    달리기 시작한 뒤 하나가 더 붙는 것은 **다른 상황**이고, 사고는 후자에서 났다.
 *    그래서 이 검사는 정적인 배치가 아니라 **하루를 순서대로 산다.**
 *
 * ⚠️ **문제지에서 «4km 앞»은 곤지암의 하차지여야 한다.** 상차지로 두면 이미 다녀와 **경로에서
 *    빠지는 자리**라 재현이 안 되고, 검사는 통과해도 **다른 것을 통과한 것**이다. 문제지는 아래 거리로 검산돼 있다.
 *
 * ══ 실행 ══
 *     cd onedal-web && pnpm drive        # 폰·개발 서버 불필요 (카카오 키가 .env 에 있으면 서버가 부른다)
 *     DRIVE_LOG=1 pnpm drive             # 서버 로그까지
 *     pnpm drive e2e                     # + 통신 고리 다섯 · 서버에 카카오 키를 빈 값으로 넘겨 안 부른다(판정은 «판정 불가»로 넘어간다)
 *     pnpm drive e2e kakao               # 위와 같되 카카오를 켠 채 · 끝에 카카오 호출 수
 *
 * 전용 포트 4014 · 전용 DB `drive.db` (빈 DB 로 시작해 끝나면 지운다).
 * 개발 서버(4000)·`local.db` 는 건드리지 않는다.
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync, mkdirSync, mkdtempSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER = join(ROOT, 'server');
const PORT = 4014;
const DB = 'drive.db';

const require = createRequire(join(SERVER, 'index.js'));
const Database = require('better-sqlite3');
const { io } = await import(join(ROOT, 'client-app/node_modules/socket.io-client/build/esm/index.js'));

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`  ${ok ? '✅' : '🔴'} ${name}${detail ? `  ${detail}` : ''}`);
};
const say = m => console.log(m);

/**
 * 🧪 **e2e 모드** (reviews/42) — `pnpm drive e2e` 이면 주행 사이사이 통신 고리를 더 본다.
 * 서버는 기동 때 server/.env 를 스스로 읽으므로(dotenv) 카카오를 끄려면 빈 값을 넘긴다 — dotenv 는 이미 있는 값을 안 덮는다.
 * 인자가 없으면 지금 drive 와 똑같다(카카오도 .env 그대로).
 */
const ARGS = process.argv.slice(2);
const E2E = ARGS.includes('e2e');
const KAKAO_OFF = E2E && !ARGS.includes('kakao');
/** 🧭 2단계 — 목적지 · 지리 판정은 카카오가 켜져야 돈다(꺼지면 판정이 «판정 불가») → `e2e kakao` 일 때만 */
const GEO = E2E && !KAKAO_OFF;

/**
 * ── 문제지 — **기사님 운행 축** (초월 → 곤지암 → 신둔 → 이천, 서→동 한 방향) ────────
 *
 * 기사님: *"1번 콜과 2번 콜이 너무 멀었어"* — 앞 문제지는 곤지암↔가남이
 * 26km 라 «합짐» 이라기보다 «다른 동네» 였다. 실제 운행은 **좁은 구간에서 여러 콜을
 * 줍는 것**이다. 그래서 기사님이 직접 뽑아 주신 7개 지점으로 다시 짰다.
 *
 * 좌표는 전부 **카카오가 그 이름으로 돌려준 실측값**이다 (주소검증 스킬 통과).
 * ```
 *   집 ─2.2─ 모다 ─3.7─ 성당 ─6.2─ 신둔 ─2.2─ 이조 ─1.6─ 제일 ─1.8─ 터미널
 *                                                          합계 17.6 km
 * ```
 *
 * 🔴 **3콜을 한 경로에 싣는다** (전부 다마스 30박스 = 90/100, 다 들어간다):
 * ```
 *   ① 첫짐   모다 상차 → 신둔 하차
 *   ② 합짐1  성당 상차 → 제일 하차     ← 모다에서 실은 뒤, 신둔 가는 길에 붙는다
 *   ③ 합짐2  이조 상차 → 터미널 하차   ← 신둔 하차 **2.4km 앞**에서 붙는다
 * ```
 * 합짐2 가 붙는 순간의 두 순서 (check_scenario.py 검산):
 *   길목부터  신둔하차 → 이조상차 → 제일하차 → 터미널    7.9 km
 *   상차먼저  이조상차 → 제일하차 → 터미널 → 신둔하차   13.3 km  ← 5.4km 더 간다
 *
 * ⚠️ 앞 문제지와 노리는 곳이 다르다. 그건 «경로 순서» 하나였고, 여기는 **정거장 6개**로
 *    `sectionStops` ↔ `sectionDriveMin` 정렬을 압박하고 **3콜 적재**까지 함께 본다.
 */
/**
 * 🏠 출발 지점 — 기사님 집(초월역동광뷰엘아파트)의 실측 좌표.
 * ⚠️ 리허설은 이 값을 **설정(`user_settings.home_address`)에서 읽는다** (규칙 ③).
 *    여기만 손으로 적는 이유는 `drive` 가 **빈 DB 로 시작**하기 때문이다 — 설정이 없다.
 *    집 주소를 옮기면 이 줄도 함께 고쳐야 한다.
 */
const HOME = { x: 127.294440, y: 37.376687 };
const MODA = { x: 127.312587, y: 37.363298 };     // 모다아울렛 곤지암점    — 첫짐 상차
const CHURCH = { x: 127.348642, y: 37.346213 };     // 곤지암성당            — 합짐1 상차
const SINDUN = { x: 127.401207, y: 37.309733 };     // 신둔농협하나로마트 본점 — 첫짐 하차
const IJO = { x: 127.416293, y: 37.294522 };     // 이조갈비함흥냉면       — 합짐2 상차
const JEIL = { x: 127.429230, y: 37.285068 };     // 이천제일식자재마트      — 합짐1 하차
const TERMINAL = { x: 127.446936, y: 37.277421 };   // 이천터미널            — 합짐2 하차

/** 합짐1 이 붙는 지점 — 모다에서 상차하고 성당 쪽으로 가는 길 */
const ENROUTE1 = { x: 127.330, y: 37.355 };
/** 합짐2 가 붙는 지점 — 신둔 하차지 2.4km 앞 */
const ENROUTE2 = { x: 127.380, y: 37.323 };

// ─────────────────────────── 서버 ───────────────────────────
function seed() {
    const dst = join(SERVER, DB);
    for (const f of [dst, `${dst}-wal`, `${dst}-shm`]) if (existsSync(f)) rmSync(f);
    return dst;
}

async function boot() {
    try {
        const pids = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' }).trim();
        if (pids) {
            say(`🧹 ${PORT} 포트를 쥐고 있던 옛 프로세스를 정리합니다`);
            execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            await wait(1000);
        }
    } catch { /* lsof 없는 환경 */ }

    const bootAfter = Date.now();
    const p = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: SERVER,
        env: { ...process.env, DB_FILE: DB, PORT: String(PORT), ...(KAKAO_OFF ? { KAKAO_REST_API_KEY: '' } : {}) },
        stdio: process.env.DRIVE_LOG ? 'inherit' : 'ignore',
    });
    for (let i = 0; i < 40; i++) {
        await wait(1000);
        try {
            const h = await (await fetch(`http://localhost:${PORT}/api/health`)).json();
            if (new Date(h.bootedAt).getTime() < bootAfter) {   // 옛 서버로 오진한 적이 있다
                p.kill('SIGKILL');
                throw new Error(`🔴 ${PORT} 에 옛 서버가 응답합니다 (bootedAt=${h.bootedAt})`);
            }
            say(`🚀 서버 기동 · bootedAt=${h.bootedAt}\n`);
            return p;
        } catch (e) {
            if (String(e.message).startsWith('🔴')) throw e;
        }
    }
    p.kill('SIGKILL');
    throw new Error('서버가 40초 안에 뜨지 않았습니다');
}

const token = async () => (await (await fetch(`http://localhost:${PORT}/api/auth/bypass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
})).json()).accessToken;

/**
 * 📱 **앱이 콜을 올린다 — 진짜 경로 그대로** (`/orders/confirm` → `/orders/detail`).
 *
 * 🔴 DB 에 직접 넣으면 안 된다. 세션 복구(`restoreAndRecalculateSession`)는 **로그인 때
 *    한 번만** 돌기 때문에, 달리는 중에 넣은 행은 세션에 영영 안 들어온다.
 *    실제로 그렇게 짰다가 방문 순서가 통째로 비었다.
 *    **콜이 들어온다 = 앱이 올린다** — 그 문으로 들어가야 주행 중 합짐이 재현된다.
 */
async function appUploads(deviceId, id, pk, dp, label) {
    const order = {
        id, pickup: `모의-${label}-상차`, dropoff: `모의-${label}-하차`,
        fare: 50000, vehicleType: '다마스', paymentType: '신용',
        timestamp: new Date().toISOString(), itemDescription: '모의 주행 콜',
        pickupX: pk.x, pickupY: pk.y, dropoffX: dp.x, dropoffY: dp.y,
        deliveryDistance: 30,
    };
    const base = { deviceId, capturedAt: new Date().toISOString(), matchType: 'AUTO' };
    const post = (path, body) => fetch(`http://localhost:${PORT}/api/orders${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    await post('/confirm', { ...base, step: 'BASIC', order });
    await wait(500);
    await post('/detail', { ...base, step: 'DETAILED', order });
}

/** 기기를 등록한다 — 미등록 기기의 보고는 서버가 막는다 (실제 앱도 PIN 연동을 거친다) */
function registerDevice(dbPath, userId, deviceId) {
    const c = new Database(dbPath);
    c.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?,?,?)`)
        .run(userId, deviceId, '모의폰');
    c.close();
}

// ─────────────────────────── e2e 통신 고리 (reviews/42) ───────────────────────────
/** HTTP 한 번 — 상태와 몸통(몸통이 JSON 이 아니면 null) */
async function call(path, { method = 'GET', body, token: tok, deviceToken } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (deviceToken) headers['X-Device-Token'] = deviceToken;
    const r = await fetch(`http://localhost:${PORT}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await r.json(); } catch { /* 몸통 없음 */ }
    return { status: r.status, json };
}

/** 소켓을 열고 «붙음 · 거절 · 기다린 신호» 가운데 먼저 온 것을 돌려준다 — 시간이 지나면 'timeout' */
function openSocket(path, auth, waitFor, ms = 4000) {
    const sock = io(`http://localhost:${PORT}${path}`, { auth, transports: ['websocket'], reconnection: false });
    const first = new Promise(res => {
        sock.once('connect', () => { if (!waitFor) res('connect'); });
        sock.once('connect_error', () => res('connect_error'));
        if (waitFor) sock.once(waitFor, () => res(waitFor));
        setTimeout(() => res('timeout'), ms);
    });
    return { sock, first };
}

/** 🧪 원달앱 화면 보고 — 실제 앱이 1초마다 보내는 그 문(`/api/scrap`) */
const scrap = (deviceId, extra = {}, deviceToken) =>
    call('/api/scrap', { method: 'POST', body: { data: [], deviceId, screenContext: 'DETAIL_CONFIRMED', ...extra }, deviceToken });

/** 🧪 ① 로그인 — 우회 로그인 토큰으로 내 상태를 읽는다 */
async function e2eLogin(tok) {
    const me = await call('/api/join/me', { token: tok });
    check('🧪 로그인 — 내 상태가 «승인 · 막힘 아님»', me.status === 200 && !!me.json?.approvedAt && me.json?.blocked === false,
        `HTTP ${me.status} · blocked=${me.json?.blocked}`);
}

/**
 * 🧪 ② 결재 전달 — 관제웹이 KEEP 을 누르면 원달앱의 다음 보고 답에 실려 가고, «받았음»을 보내면 다음 답에서 사라진다.
 *    이 고리가 끊기면 «관제웹에서 KEEP 을 눌렀는데 폰이 안 받는다» — 다른 검사는 다 초록인 채로 실주행에서야 드러난다.
 */
async function e2eDecision(deviceId, orderId, action = 'KEEP') {
    const first = await scrap(deviceId);
    const d = first.json?.decision;
    check(`🧪 결재 전달(${orderId}) — ${action} 이 원달앱 보고 답에 실려 온다`, first.status === 200 && d?.orderId === orderId && d?.action === action,
        `HTTP ${first.status} · ${d ? `${d.orderId} ${d.action}` : '결재 없음'}`);
    const acked = await scrap(deviceId, { ackDecisionId: orderId });
    check(`🧪 결재 전달(${orderId}) — «받았음»을 보내면 다음 답에서 사라진다`, acked.status === 200 && !acked.json?.decision,
        acked.json?.decision ? `아직 ${acked.json.decision.orderId}` : '');
}

/** 🧪 ③ 폰 연결 — 연결 번호 → 붙이기 → 받은 토큰을 실어 보고(통과) · 틀린 토큰(거절) */
async function e2ePair(tok) {
    const DEV = '모의폰-e2e';
    const pin = await call('/api/devices/pin', { method: 'POST', token: tok });
    const pair = await call('/api/devices/pair', { method: 'POST', body: { pin: pin.json?.pin, deviceId: DEV, deviceName: 'e2e폰' } });
    const devToken = pair.json?.deviceToken;
    check('🧪 폰 연결 — 연결 번호로 붙이면 토큰을 준다', pin.status === 200 && pair.status === 200 && typeof devToken === 'string',
        `번호 HTTP ${pin.status} · 붙이기 HTTP ${pair.status}`);
    const good = await scrap(DEV, { screenContext: 'UNKNOWN' }, devToken);
    const bad = await scrap(DEV, { screenContext: 'UNKNOWN' }, 'e2e-wrong-token');
    check('🧪 폰 토큰 — 맞는 토큰은 통과 · 틀린 토큰은 거절', good.status === 200 && bad.status === 401,
        `맞음 HTTP ${good.status} · 틀림 HTTP ${bad.status}`);
}

/** 🧪 ④ 운영센터 — 관리자 콜 목록에 그 콜이 보이고, 운영센터 소켓이 «콜 바뀜»을 받았다 */
async function e2eOps(tok, orderId, opsSignals) {
    const calls = await call('/api/ops/calls', { token: tok });
    const list = Array.isArray(calls.json) ? calls.json : [];   // opsCallsOf — 진행 중 콜 한 줄씩(OpsCall)
    check('🧪 운영센터 — 관리자 콜 목록에 KEEP 한 콜이 보인다', calls.status === 200 && list.some(c => c.id === orderId),
        `HTTP ${calls.status} · ${list.length}건`);
    check('🧪 운영센터 — 소켓이 «콜 바뀜» 신호를 받았다', opsSignals.n > 0, `${opsSignals.n}번`);
}

/** 🧪 관제웹 창 번호 — 실제 관제웹은 늘 싣는다(브라우저 세션마다 하나). 첫 소켓도 실어 두 경우가 진짜 모양이 되게 */
const MAIN_TAB = 'e2e-main-tab';

/**
 * 🧪 ⑤ 같은 계정 관제웹 둘 — 다른 창이면 «다른 창에서 접속 중» 확인이 오고(넘겨받지 않고 닫음),
 *    같은 창 번호(새로고침)면 안 온다 — 기사님 화면에서 더 아픈 회귀는 «새로고침했는데 다른 기기 접속 창이 뜬다» 쪽이다.
 */
async function e2eSessionConflict(tok) {
    const other = openSocket('', { token: tok, clientSessionId: 'e2e-second-tab' }, 'session-conflict');
    const got = await other.first;
    check('🧪 세션 충돌 — 같은 계정 다른 창에 «다른 창에서 접속 중»이 온다', got === 'session-conflict', got);
    other.sock.emit('cancel-takeover');
    other.sock.close();
    const refresh = openSocket('', { token: tok, clientSessionId: MAIN_TAB }, 'session-conflict', 2500);
    const again = await refresh.first;
    check('🧪 세션 충돌 — 같은 창 새로고침에는 안 온다', again !== 'session-conflict' && again !== 'connect_error', again === 'timeout' ? '2.5초 동안 없음' : again);
    refresh.sock.close();
}

/** 🧪 ⑥ 계정 막힘 — 즉시 정지면 폰 보고 · 연결 번호 · 관제웹 소켓이 함께 막힌다(accountGateOf 한 판단) · 끝나면 풀어 둔다 */
async function e2eBlocked(dbPath, userId, tok, deviceId) {
    const set = (sql) => { const c = new Database(dbPath); c.prepare(sql).run(userId); c.close(); };
    set(`UPDATE users SET suspended_at = datetime('now', 'localtime'), suspend_after_active = 0 WHERE id = ?`);
    try {
        const report = await scrap(deviceId);
        const pin = await call('/api/devices/pin', { method: 'POST', token: tok });
        const { sock, first } = openSocket('', { token: tok, clientSessionId: 'e2e-blocked' });
        const sockGot = await first;
        sock.close();
        check('🧪 계정 막힘 — 폰 보고 · 연결 번호 · 관제웹 소켓이 함께 막힌다',
            report.status === 403 && pin.status === 403 && sockGot === 'connect_error',
            `보고 HTTP ${report.status} · 번호 HTTP ${pin.status} · 소켓 ${sockGot}`);
    } finally {
        set(`UPDATE users SET suspended_at = NULL, suspend_after_active = NULL WHERE id = ?`);
    }
}

// ─────────────────────────── e2e 실제 화면 (reviews/42 3단계) ───────────────────────────
/**
 * 🔨 관제웹 · 운영센터를 빌드한다 — 시험 서버는 **켜질 때** 빌드 폴더가 있는지 보고 내주므로 서버를 띄우기 전에.
 * 🔴 빌드가 깨지면 화면을 찍지 않는다 — 낡은 dist 로 초록이 나면 «고친 것이 깨졌는데 옛 화면은 멀쩡» 이 된다.
 * 건너뛰기 인자는 두지 않는다(같은 까닭). client-app/dist · ops/dist 를 새로 만든다(git 무시 · 떠 있는 4000 이 내주는 첫 화면도 새 빌드가 된다).
 */
function buildScreens() {
    for (const [name, dir] of [['관제웹', 'client-app'], ['운영센터', 'ops']]) {
        try {
            execSync('pnpm build', { cwd: join(ROOT, dir), stdio: 'pipe' });
        } catch (e) {
            const tail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.split('\n')   // tsc 오류는 stdout · vite 오류(import 못 찾음 등)는 stderr
                .filter(l => /error|오류/i.test(l)).slice(0, 3).join(' | ');
            return { ok: false, why: `${name} 빌드 실패${tail ? ` — ${tail}` : ''}` };
        }
    }
    return { ok: true, why: '' };
}

/** 🗒️ 시험 서버 로그 파일(포트별 · 한국 날) — 화면이 소켓에 붙었는지를 서버 쪽 줄로 본다(머리줄 글자는 바뀌기 쉽다) */
const serverLogFile = () => join(SERVER, 'logs', `server-${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}-${PORT}.log`);
/** 화면 열기 직전의 파일 이름과 크기 — 자정을 넘겨도 같은 파일을 읽는다(서버는 연 파일에 계속 쓴다) */
const logMark = () => { const file = serverLogFile(); try { return { file, size: statSync(file).size }; } catch { return { file, size: 0 }; } };
const logSince = ({ file, size }) => { try { return readFileSync(file).subarray(size).toString('utf8'); } catch { return ''; } };

/** 화면 안에서 묻는 것 — 어느 서버와 이야기하나(켜진 시각) · 글자가 있나 · 오류 경계의 빨간 상자가 있나 */
const SCREEN_EVAL = `(async () => {
    const h = await (await fetch('/api/health')).json();
    const t = document.body.innerText || '';
    return { host: location.host, bootedAt: h.bootedAt, chars: t.trim().length, redBox: t.includes('그리지 못했습니다'), apiBase: localStorage.getItem('apiBase') };
})()`;

/** 📸 shot 으로 한 화면 — 시험 계정(PROBE) · 새 프로필 · 화면 값은 EVAL 의 JSON(📸 줄 앞) */
function shotScreen(web, out, profile) {
    const stdout = execSync(`node scripts/shot.mjs / ${JSON.stringify(out)}`, {
        cwd: ROOT, encoding: 'utf8',
        env: { ...process.env, WEB: web, API: `http://localhost:${PORT}`, PROBE: '1', PROFILE: profile, WAIT: '4000', EVAL: SCREEN_EVAL },
    });
    const json = stdout.slice(0, stdout.indexOf('📸')).trim();
    try { return JSON.parse(json); } catch { return null; }
}

/** 🖼️ 관제웹 · 운영센터를 찍어 «시험 서버와 이야기하나 · 하얗지 않나 · 빨간 상자 없나 · 소켓이 붙었나»를 본다 */
async function e2eScreens(dbPath, bootedAt) {
    const outDir = join(tmpdir(), 'onedal-e2e');
    mkdirSync(outDir, { recursive: true });
    const probe = await (await fetch(`http://localhost:${PORT}/api/auth/bypass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ probe: true }),
    })).json();
    const probeId = JSON.parse(Buffer.from(probe.accessToken.split('.')[1], 'base64').toString()).id;
    const c = new Database(dbPath);
    c.prepare(`UPDATE users SET ops_allowed_at = datetime('now', 'localtime') WHERE id = ?`).run(probeId);   // 운영센터 화면용(켜는 문은 허락 있는 사람만)
    c.close();
    const screens = [
        ['관제웹', `http://localhost:${PORT}`, '🔌 [소켓 연결] 유저 접속: 실측(자동)'],
        ['운영센터', `http://ops.localhost:${PORT}`, '🏢 [운영센터 소켓] 실측(자동) 연결'],
    ];
    for (const [name, web, socketLine] of screens) {
        const profile = mkdtempSync(join(tmpdir(), 'onedal-e2e-profile-'));
        const out = join(outDir, `${name}.png`);
        const from = logMark();
        let v = null;
        try { v = shotScreen(web, out, profile); } catch (e) { say(`     ⚠️ ${name} 찍기 실패 — ${String(e.message).split('\n')[0]}`); }
        finally { rmSync(profile, { recursive: true, force: true }); }
        check(`🖼️ 화면(${name}) — 시험 서버와 이야기한다`, v?.bootedAt === bootedAt && !v?.apiBase,
            v ? `${v.host} · 켜진 시각 ${v.bootedAt === bootedAt ? '같음' : `다름(${v.bootedAt})`}${v.apiBase ? ` · 저장된 서버 ${v.apiBase}` : ''}` : '값 없음');
        check(`🖼️ 화면(${name}) — 하얀 화면 아님 · 빨간 상자 없음`, !!v && v.chars > 20 && !v.redBox,
            v ? `글자 ${v.chars}${v.redBox ? ' · «그리지 못했습니다»' : ''}` : '');
        check(`🖼️ 화면(${name}) — 소켓이 붙었다(서버 로그)`, logSince(from).includes(socketLine));
        say(`     📸 ${out}`);
    }
}

// ─────────────────────────── e2e 목적지 · 지리 (reviews/42 2단계 · e2e kakao) ───────────────────────────
/** 판정의 한 축 점수 — 없으면 null */
const axisScore = (judgment, key) => judgment?.axes?.find(a => a.key === key)?.score ?? null;

/** 🧭 관제웹처럼 목적지를 바꾸고 서버가 «필터 바뀜»으로 답하는지 */
async function e2eDestination(s, city) {
    const got = new Promise(res => {
        s.once('filter-updated', p => res(p?.activeFilter?.destinationCity ?? null));
        setTimeout(() => res('timeout'), 4000);
    });
    s.emit('update-filter', { destinationCity: city });
    const dest = await got;
    check(`🧭 목적지 — 관제웹이 바꾼 «${city}»가 서버 필터에 들어간다`, dest === city, String(dest));
}

// ─────────────────────────── 하루를 산다 ───────────────────────────
async function main() {
    const dbPath = seed();
    /* 🔨 e2e — 화면을 찍으려면 서버가 켜지기 전에 빌드가 있어야 한다 */
    const built = E2E ? buildScreens() : null;
    if (built) check('🔨 관제웹 · 운영센터 빌드', built.ok, built.why);
    const proc = await boot();
    const geoMark = logMark();   // 🧭 이번 실행의 판정 로그만 본다
    let db;
    try {
        const tok = await token();
        const me = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString());

        const DEVICE = '모의폰-drive';
        registerDevice(dbPath, me.id, DEVICE);
        const st = { arrived: [], approaching: [], routeStops: [], evaluated: new Set() };
        const s = io(`http://localhost:${PORT}`, { auth: E2E ? { token: tok, clientSessionId: MAIN_TAB } : { token: tok }, transports: ['websocket'] });
        await new Promise((res, rej) => {
            s.once('connect', res);
            s.once('connect_error', e => rej(new Error(e.message)));
            setTimeout(() => rej(new Error('소켓 연결 시간 초과')), 8000);
        });
        s.on('auto-arrived', p => st.arrived.push(p));
        // ⚠️ 이벤트 이름은 `pnpm audit:socket` 목록과 대조한다 — 틀리게 들으면
        //    멀쩡한 제품을 «안 울린다»고 오진한다 (실제로 한 번 당했다)
        s.on('next-stop-approaching', p => st.approaching.push(p));
        s.on('sync-active-orders', p => { if (p?.routeStops) st.routeStops = p.routeStops; });
        s.on('order-evaluated', o => st.evaluated.add(o.id));

        /* 🧪 e2e — 운영센터 허락을 시험 DB 에 켜고(켜는 문은 허락 있는 사람만이라 닭과 달걀) 운영센터 소켓을 먼저 붙여 둔다 */
        const opsSignals = { n: 0 };
        let opsSock = null;
        const judgments = new Map();   // 🧭 콜마다 마지막 판정(색 · 점수 · 축) — e2e kakao 의 지리 견주기
        s.on('order-evaluated', o => judgments.set(o.id, o.judgment ?? null));
        if (E2E) {
            say(`🧪 e2e 모드 — 통신 고리까지 본다 · 카카오 ${KAKAO_OFF ? '끔(판정은 «판정 불가»로 넘어간다)' : '켬'}\n`);
            await e2eLogin(tok);
            const c = new Database(dbPath);
            c.prepare(`UPDATE users SET ops_allowed_at = datetime('now', 'localtime') WHERE id = ?`).run(me.id);
            c.close();
            const ops = openSocket('/ops', { token: tok });
            opsSock = ops.sock;
            opsSock.on('ops-calls-changed', () => { opsSignals.n++; });
            check('🧪 운영센터 소켓이 붙는다', await ops.first === 'connect');
            if (GEO) await e2eDestination(s, '이천시');
        }

        const stopOrder = () => st.routeStops.map(r => `${r.orderId}:${r.stopType}`);
        const showOrder = () => say(`     방문 순서: ${stopOrder().join(' → ') || '(없음)'}`);
        /** 🗼 관제웹이 KEEP 을 누른다 — 판정이 끝나기를 기다렸다가 */
        const decide = async (id) => {
            for (let i = 0; i < 20 && !st.evaluated.has(id); i++) await wait(400);
            s.emit('decision', { orderId: id, action: 'ORDER_CONFIRMED' });
            await wait(1800);
        };
        /** 그 자리에 서서 도착을 찍는다 — mock 은 «서 있다(stopped)»고 온 틱에 도착이다 (모의 주행 정차 연기와 같은 말) */
        const arriveAt = async (to) => {
            s.emit('dashboard-gps-update', { lat: to.y + 0.02, lng: to.x, source: 'mock' });  // 2km 앞
            await wait(400);
            s.emit('dashboard-gps-update', { lat: to.y, lng: to.x, source: 'mock', stopped: true });
            await wait(500);
            s.emit('dashboard-gps-update', { lat: to.y + 0.00001, lng: to.x, source: 'mock', stopped: true });
            await wait(900);
        };

        // ── ① 아침: 첫짐을 잡는다 ────────────────────────────
        say('═══ ① 아침 — 첫짐 (모다아울렛 상차 → 신둔농협 하차) ═══');
        s.emit('dashboard-gps-update', { lat: HOME.y, lng: HOME.x, source: 'mock' });
        await wait(600);
        await appUploads(DEVICE, '첫짐', MODA, SINDUN, '첫짐');
        await decide('첫짐');
        if (E2E) {
            await e2eDecision(DEVICE, '첫짐');
            await e2eOps(tok, '첫짐', opsSignals);   // 진행 중 KEEP 콜만 운영센터 목록에 있다 — 배송이 끝나기 전에 본다
            if (GEO) {
                const j = judgments.get('첫짐');
                check('🧭 판정 — «판정 불가»가 아니라 색 · 점수로 나온다(카카오 켬)', !!j && j.color !== '사고' && j.score != null,
                    j ? `${j.color} ${j.score ?? '—'}점` : '판정 없음');
            }
        }
        check('첫짐이 세션에 실렸다', stopOrder().length === 2, stopOrder().join(' → '));
        showOrder();

        // ── ② 모다에서 싣는다 ───────────────────────────────
        say('\n═══ ② 모다아울렛에서 상차 ═══');
        let before = st.arrived.length;
        await arriveAt(MODA);
        check('첫짐 상차지 도착', st.arrived.length > before, `누적 ${st.arrived.length}회`);
        s.emit('report-milestone', { orderId: '첫짐', milestone: 'PICKED_UP' });
        await wait(900);
        check('상차 완료 뒤 상차지가 경로에서 빠졌다', !stopOrder().includes('첫짐:pickup'));
        showOrder();

        // ── ③ 가는 길에 합짐1 이 붙는다 ─────────────────────
        say('\n═══ ③ 신둔으로 가는 길 — 합짐1 이 붙는다 (성당 상차 → 제일 하차) ═══');
        s.emit('dashboard-gps-update', { lat: ENROUTE1.y, lng: ENROUTE1.x, source: 'mock' });
        await wait(900);
        await appUploads(DEVICE, '합짐1', CHURCH, JEIL, '합짐1');
        await decide('합짐1');
        if (E2E) await e2eDecision(DEVICE, '합짐1');   // 첫짐 «받았음»이 합짐 결재까지 지우는 류의 회귀를 잡는다
        if (GEO) {
            /**
             * 🧭 거꾸로 가는 콜 — 길 위(신둔 상차 · 곤지암 하차)라 원달앱 필터는 통과할 만하지만, 목적지 이천에서 멀어진다.
             *    상차가 앞쪽이라 «등 뒤 상차 0점»이 아니라 방향 점수로 견준다. 판정만 받고 치운다(SAFE_CANCEL · 관제웹 심사석의 치우기) — 뒤 주행 검사가 그대로 돌게.
             */
            await appUploads(DEVICE, '역방향', SINDUN, MODA, '역방향');
            for (let i = 0; i < 20 && !judgments.has('역방향'); i++) await wait(400);
            s.emit('decision', { orderId: '역방향', action: 'SAFE_CANCEL' });
            await wait(1500);
            await e2eDecision(DEVICE, '역방향', 'CANCEL');   // 취소 결재도 폰에 가고 «받았음» 뒤 사라진다 — 안 지우면 뒤 보고에 계속 실려 엉킨다
            const same = axisScore(judgments.get('합짐1'), 'geography');
            const back = axisScore(judgments.get('역방향'), 'geography');
            const whyOf = id => (judgments.get(id)?.axes?.find(a => a.key === 'geography')?.raw ?? '').slice(0, 40);
            check('🧭 지리 — 목적지로 가는 합짐이 거꾸로 가는 콜보다 지리 점수가 높다', same != null && back != null && same > back,
                `같은 방향(합짐1) ${same ?? '—'}점 «${whyOf('합짐1')}» · 거꾸로 ${back ?? (judgments.has('역방향') ? '—' : '판정 없음')}점 «${whyOf('역방향')}»`);
        }
        showOrder();
        check('합짐1 의 상차(성당)가 첫짐 하차(신둔)보다 앞이다 — 가는 길목이다',
            stopOrder().indexOf('합짐1:pickup') >= 0 &&
            stopOrder().indexOf('합짐1:pickup') < stopOrder().indexOf('첫짐:dropoff'),
            stopOrder().join(' → '));

        // ── ④ 성당에서 싣는다 ───────────────────────────────
        say('\n═══ ④ 곤지암성당에서 상차 (2콜 적재) ═══');
        before = st.arrived.length;
        await arriveAt(CHURCH);
        check('합짐1 상차지 도착', st.arrived.length > before, `누적 ${st.arrived.length}회`);
        s.emit('report-milestone', { orderId: '합짐1', milestone: 'PICKED_UP' });
        await wait(900);
        showOrder();

        // ── ⑤ 🔴 신둔 코앞에서 합짐2 가 붙는다 ──────────────
        say('\n═══ ⑤ 🔴 신둔 하차지 2.4km 앞 — 합짐2 가 붙는다 (이조 상차 → 터미널 하차) ═══');
        say('     여기가 순서가 갈리는 자리다.');
        s.emit('dashboard-gps-update', { lat: ENROUTE2.y, lng: ENROUTE2.x, source: 'mock' });
        await wait(900);
        await appUploads(DEVICE, '합짐2', IJO, TERMINAL, '합짐2');
        await decide('합짐2');
        s.emit('dashboard-gps-update', { lat: ENROUTE2.y, lng: ENROUTE2.x, source: 'mock' });
        await wait(1500);
        showOrder();

        const nowOrder = stopOrder();
        check('🔴 2.4km 앞 하차지(신둔)를 두고 먼 상차지로 먼저 가지 않는다',
            nowOrder[0] === '첫짐:dropoff', `첫 정거장 ${nowOrder[0] ?? '(없음)'}`);
        check('합짐2 의 하차는 그 상차보다 뒤다',
            nowOrder.indexOf('합짐2:dropoff') > nowOrder.indexOf('합짐2:pickup'));
        check('🔴 3콜이 모두 경로에 있다 (다마스 30박스 ×3 = 90/100)',
            new Set(nowOrder.map(k => k.split(':')[0])).size === 3, `${nowOrder.length}개 정거장`);
        say('     길목부터 7.9km  vs  상차먼저 13.3km — 5.4km 차이다');

        // ── ⑥ 남은 정거장을 순서대로 ────────────────────────
        say('\n═══ ⑥ 남은 정거장을 순서대로 — 도착이 다 찍히는가 ═══');
        const coordOf = { '첫짐:dropoff': SINDUN, '합짐1:pickup': CHURCH, '합짐1:dropoff': JEIL,
                       '합짐2:pickup': IJO, '합짐2:dropoff': TERMINAL };
        for (const key of nowOrder) {
            const to = coordOf[key];
            if (!to) { say(`     ⚠️ ${key} 좌표를 모른다 — 건너뜀`); continue; }
            before = st.arrived.length;
            await arriveAt(to);
            const marked = st.arrived.length > before;
            check(`${key} 도착`, marked, marked ? `누적 ${st.arrived.length}회` : '발화 없음');
            if (key.endsWith(':pickup')) {
                s.emit('report-milestone', { orderId: key.split(':')[0], milestone: 'PICKED_UP' });
                await wait(700);
            }
        }
        check('근접 예고(도착전 통화)도 울렸다', st.approaching.length >= 1, `${st.approaching.length}회`);

        // ── ⑦ 궤적 ─────────────────────────────────────────
        say('\n═══ ⑦ 궤적 — 어느 콜의 어느 구간이었나 ═══');
        await wait(1200);
        db = new Database(dbPath, { readonly: true });
        const rows = db.prepare(`SELECT order_id, stop_type, COUNT(*) n FROM gps_tracks
                                 WHERE stop_type IS NOT NULL GROUP BY order_id, stop_type`).all();
        for (const r of rows) say(`     ${r.order_id} ${r.stop_type}: ${r.n}점`);
        const kinds = new Set(rows.map(r => r.stop_type));
        check('🔴 pickup 과 dropoff 가 둘 다 찍혔다', kinds.has('pickup') && kinds.has('dropoff'),
            `[${[...kinds].join(', ')}]`);
        check('세 콜 모두 궤적에 나타났다',
            new Set(rows.map(r => r.order_id)).size === 3, `${new Set(rows.map(r => r.order_id)).size}콜`);

        /**
         * ⏸️🎭 **«정차가 서버까지 갔나»·«속도가 실제인가»는 여기서 못 본다**.
         *
         * 현황판이 제안해 한 번 넣어 봤는데 **이 도구의 성격에 안 맞았다** — `drive` 는
         * 정거장으로 **순간이동**하며 좌표를 쏘는 재생기다. 경로를 걷지도, 18초를 서지도,
         * 배속을 쓰지도 않는다. 그래서 여기서는 늘 빨간불이 나고 «고쳐도 안 고쳐지는» 검사가 된다.
         *
         * 🟢 그 둘은 **규칙 검사**가 본다 (`tests/rules/mockDriveTelemetry.test.ts`) —
         *    «같은 자리도 주기적으로 보내는가»와 «궤적에 나눈 속도를 남기는가»는 소스가 답한다.
         *    실제 주행은 기사님이 화면과 `gps_tracks` 로 확인하신다 (현황판이 그렇게 잡아 줬다).
         */

        /* 🧪 e2e — 주행이 끝난 뒤 · 관제웹 소켓이 아직 붙어 있을 때(세션 충돌은 첫 소켓이 살아 있어야 난다) */
        if (E2E) {
            say('\n═══ 🧪 통신 고리 — 폰 연결 · 세션 충돌 · 계정 막힘 ═══');
            await e2ePair(tok);
            await e2eSessionConflict(tok);
            await e2eBlocked(dbPath, me.id, tok, DEVICE);
            opsSock?.close();
            say('\n═══ 🖼️ 실제 화면 — 관제웹 · 운영센터 (시험 계정 · 새 크롬 프로필) ═══');
            if (built?.ok) {
                const bootedAt = (await (await fetch(`http://localhost:${PORT}/api/health`)).json()).bootedAt;
                await e2eScreens(dbPath, bootedAt);
            } else say('     빌드가 깨져 화면을 찍지 않는다 — 낡은 화면으로 초록이 나지 않게');
            if (GEO) check('🧭 지리 — 판정 로그에 «합짐 지리 … 전진율»이 찍힌다(«목적지 미설정»으로 안 잼이 아니다)',
                /합짐 지리\] 기점 .+ → 전진율/.test(logSince(geoMark)));
            if (!KAKAO_OFF) {
                const k = new Database(dbPath, { readonly: true });
                const u = k.prepare(`SELECT COALESCE(SUM(route_calls), 0) r, COALESCE(SUM(local_calls), 0) l FROM kakao_usage_days`).get();
                k.close();
                say(`     카카오 호출 — 길찾기 ${u.r} · 좌표 찾기 ${u.l}`);
            }
        }

        s.close();
    } finally {
        db?.close();
        /**
         * 🔴 **껍데기만 죽이면 서버가 남는다** — 「서버는 2층이다」 함정 그대로다.
         * `spawn('npx', …)` 는 npx 껍데기를 띄우고 실제 서버는 그 자식이다.
         * 실측: `proc.kill()` 만 했더니 4014 에 1분 38초째 살아 있었다.
         */
        proc.kill('SIGKILL');
        try {
            /**
             * 🔴 **자기 자신은 빼고 죽인다**. `lsof -ti :포트` 는 그 포트에
             * 물린 **양쪽 끝**을 다 낸다 — 서버(듣는 쪽)뿐 아니라 이 스크립트(붙은 쪽)도.
             * 그래서 kill -9 가 자기를 죽여 **요약·실패 판정·종료코드가 영영 안 나왔다** —
             * 모든 ✅ 뒤에서 조용히 137 로 죽는 검사는 «실패를 알릴 수 없는 검사»다.
             */
            const pids = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' }).trim();
            const others = pids ? pids.split('\n').filter(p => Number(p) !== process.pid) : [];
            if (others.length) execSync(`kill -9 ${others.join(' ')}`);
        } catch { /* lsof 없는 환경 */ }
        for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (existsSync(f)) rmSync(f);
    }

    const bad = results.filter(r => !r.ok);
    console.log(`\n${'─'.repeat(52)}`);
    console.log(`검사 ${results.length}건 · 통과 ${results.length - bad.length} · 실패 ${bad.length}`);
    if (bad.length) {
        console.log(`\n🔴 실패:\n${bad.map(b => `   · ${b.name}`).join('\n')}\n`);
        process.exit(1);
    }
    console.log('\n✅ 모의 주행 이상 없음\n');
}

main().catch(e => { console.error(`\n🔴 ${e.message}\n`); process.exit(1); });

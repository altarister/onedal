#!/usr/bin/env node
/**
 * 🚚 **모의 주행 — 하루를 순서대로 살아 본다** (2026-08-29 신설 · 08-29 문제지 재작성)
 *
 * ══ 왜 있는가 ══
 *
 * 2026-08-29 에 고친 것 중 셋이 **주행을 나가야만 확인되는 것**이었다 —
 * 경로 순서 · 도착 감지 · 궤적의 `stop_type`. 기사님이 하루에 한 번 나가시는데
 * 그때만 확인되면 **하루에 한 번밖에 못 고친다.** 그래서 GPS 를 재생해 책상에서 잡는다.
 *
 * ══ 무엇을 재현하는가 — 2026-08-25 기사님 실측 사고 ══
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
 * ⚠️ **문제지를 한 번 잘못 짰다** (2026-08-29, 기사님이 잡으심). 처음엔 곤지암을
 *    첫짐의 **상차지**로 두고 «4km 앞»이라 적었는데, 상차지는 이미 다녀와 **경로에서
 *    빠지는 자리**였다. 정작 하차지는 27.5km 밖이라 재현이 안 됐다. 검사는 통과했지만
 *    **다른 것을 통과한 것**이다. 지금 문제지는 아래 거리로 검산돼 있다.
 *
 * ══ 실행 ══
 *     cd onedal-web && pnpm drive        # 폰·카카오 키·개발 서버 전부 불필요
 *     DRIVE_LOG=1 pnpm drive             # 서버 로그까지
 *
 * 전용 포트 4014 · 전용 DB `drive.db` (빈 DB 로 시작해 끝나면 지운다).
 * 개발 서버(4000)·`local.db` 는 건드리지 않는다.
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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
 * ── 문제지 — **기사님 운행 축** (초월 → 곤지암 → 신둔 → 이천, 서→동 한 방향) ────────
 *
 * 기사님(2026-08-29): *"1번 콜과 2번 콜이 너무 멀었어"* — 앞 문제지는 곤지암↔가남이
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
        env: { ...process.env, DB_FILE: DB, PORT: String(PORT) },
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
 *    실제로 그렇게 짰다가 방문 순서가 통째로 비었다 (2026-08-29).
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

// ─────────────────────────── 하루를 산다 ───────────────────────────
async function main() {
    const dbPath = seed();
    const proc = await boot();
    let db;
    try {
        const tok = await token();
        const me = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString());

        const DEVICE = '모의폰-drive';
        registerDevice(dbPath, me.id, DEVICE);
        const st = { arrived: [], approaching: [], routeStops: [], evaluated: new Set() };
        const s = io(`http://localhost:${PORT}`, { auth: { token: tok }, transports: ['websocket'] });
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

        const stopOrder = () => st.routeStops.map(r => `${r.orderId}:${r.stopType}`);
        const showOrder = () => say(`     방문 순서: ${stopOrder().join(' → ') || '(없음)'}`);
        /** 🗼 관제웹이 KEEP 을 누른다 — 판정이 끝나기를 기다렸다가 */
        const decide = async (id) => {
            for (let i = 0; i < 20 && !st.evaluated.has(id); i++) await wait(400);
            s.emit('decision', { orderId: id, action: 'ORDER_CONFIRMED' });
            await wait(1800);
        };
        /** 그 자리에 서서 도착을 찍는다 (mock 은 정지로 본다) */
        const arriveAt = async (to) => {
            s.emit('dashboard-gps-update', { lat: to.y + 0.02, lng: to.x, source: 'mock' });  // 2km 앞
            await wait(400);
            s.emit('dashboard-gps-update', { lat: to.y, lng: to.x, source: 'mock' });
            await wait(500);
            s.emit('dashboard-gps-update', { lat: to.y + 0.00001, lng: to.x, source: 'mock' });
            await wait(900);
        };

        // ── ① 아침: 첫짐을 잡는다 ────────────────────────────
        say('═══ ① 아침 — 첫짐 (모다아울렛 상차 → 신둔농협 하차) ═══');
        s.emit('dashboard-gps-update', { lat: HOME.y, lng: HOME.x, source: 'mock' });
        await wait(600);
        await appUploads(DEVICE, '첫짐', MODA, SINDUN, '첫짐');
        await decide('첫짐');
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
             * 🔴 **자기 자신은 빼고 죽인다** (2026-08-30 발견). `lsof -ti :포트` 는 그 포트에
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

#!/usr/bin/env node
/**
 * 시나리오 검사기 — 실제 서버를 띄우고 콜의 생애를 끝까지 돌린다.
 *
 * ══ 왜 있는가 ══
 *
 * 2026-08-11 에 배포하면 안 되는 결함 여섯 건(A~F)이 나왔는데,
 * **전부 `tsc` · `jest` · `vite build` · `audit:socket` 을 통과한 채로** 숨어 있었다.
 * 돌려 봐서만 나왔다. 그 방법을 버리지 않으려고 레포에 남긴다.
 *
 *   A 상차한 콜이 새로고침하면 사라진다      (복구 쿼리 상태 누락)
 *   B 어제 잡은 콜이 통째로 사라진다          (날짜 경계)
 *   C 잔여 용량이 짐 신고를 무시              (sizeClass 관문)
 *   D 불일치 경고가 절대 안 뜬다              (같은 관문)
 *   E 짐을 저장해도 필터가 재파생 안 됨
 *   F 착불 현금을 받아도 기록할 곳이 없다
 *
 * ══ 실행 ══
 *
 *     pnpm scenario
 *
 * `local.db` 를 **sqlite 백업으로** 사본 뜨고(`cp` 는 WAL 이 빠진다),
 * 전용 포트 4012 · 전용 DB `scen.db` 로 서버를 띄운 뒤 검사하고 지운다.
 * 개발 서버(4000)와 `local.db` 는 건드리지 않는다.
 *
 * ⚠️ 주의 두 가지 (둘 다 실제로 당했다)
 *   · 검사기가 틀리면 **멀쩡한 제품을 버그라고 보고한다.**
 *     `filter-updated` 를 `filter-update` 로 듣고 오진했다.
 *     이벤트 이름은 `pnpm audit:socket` 이 뽑는 목록과 대조할 것.
 *   · 서버가 실제로 재시작됐는지 확인할 것. `bootedAt` 을 매번 찍는다.
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER = join(ROOT, 'server');
const PORT = 4012;
const DB = 'scen.db';

const require = createRequire(join(SERVER, 'index.js'));
const Database = require('better-sqlite3');
const { io } = await import(join(ROOT, 'client-app/node_modules/socket.io-client/build/esm/index.js'));

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`  ${ok ? '✅' : '🔴'} ${name}${detail ? `  ${detail}` : ''}`);
};

// ─────────────────────────── 시드 ───────────────────────────
async function seed() {
    const src = join(SERVER, 'local.db');
    if (!existsSync(src)) {
        console.error(`🔴 ${src} 가 없습니다. 개발 서버를 한 번 띄워 DB 를 만든 뒤 다시 실행하세요.`);
        process.exit(1);
    }
    const dst = join(SERVER, DB);
    for (const f of [dst, `${dst}-wal`, `${dst}-shm`]) if (existsSync(f)) rmSync(f);

    // 🔴 `cp local.db` 로 하면 WAL 에 있는 최근 데이터가 빠져 "콜 0건"으로 헛돈다.
    //    반드시 sqlite 백업 API 를 쓴다.
    const s = new Database(src, { readonly: true });
    await s.backup(dst);          // ⚠️ 비동기다. 기다리지 않으면 빈 파일이 남는다
    s.close();

    const c = new Database(dst);
    const withStops = c.prepare(`
        SELECT o.id FROM orders o JOIN orderStops st ON st.orderId = o.id
        GROUP BY o.id HAVING COUNT(DISTINCT st.stopType) = 2 LIMIT 2
    `).all().map(r => r.id);

    if (withStops.length < 2) {
        console.error('🔴 좌표가 붙은 콜이 2건 미만이라 시나리오를 못 돌립니다.');
        console.error('   이 검사는 `server/local.db` 의 **실제 콜을 씨앗으로** 씁니다 —');
        console.error('   콜 목록을 지우면 씨앗이 사라져 돌지 않습니다 (2026-08-16 에 실제로 그랬습니다).');
        console.error('   콜을 한두 건 잡아 상·하차 좌표가 붙은 뒤 다시 돌리세요.');
        process.exit(1);
    }

    const now = new Date();
    const iso = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    // 나머지는 과거로 밀어 간섭을 없앤다
    c.prepare(`UPDATE orders SET timestamp = '2020-01-01T00:00:00Z', status = 'ORDER_RELEASED'`).run();
    c.prepare(`DELETE FROM order_milestones`).run();
    c.prepare(`DELETE FROM stop_cargo_reports`).run();

    const [main, cod] = withStops;
    const nowIso = iso(now);
    // ① 오늘 확정된 콜 — 생애 6단계용
    c.prepare(`UPDATE orders SET status='ORDER_CONFIRMED', paymentType='신용', vehicleType='라보',
               timestamp=?, capturedAt=? WHERE id=?`).run(nowIso, nowIso, main);
    // ② 착불 콜 — T8 용
    c.prepare(`UPDATE orders SET status='ORDER_PICKED_UP', paymentType='착불', fare=111000,
               settlementStatus='미정산', unpaidAmount=0, settledAt=NULL,
               timestamp=?, capturedAt=? WHERE id=?`).run(nowIso, nowIso, cod);
    c.close();

    console.log(`🌱 시드: 확정 콜 ${main.slice(0, 8)} · 착불 콜 ${cod.slice(0, 8)}\n`);
    return { main, cod };
}

// ─────────────────────────── 서버 ───────────────────────────
async function boot() {
    /**
     * 🔴 먼저 포트를 비운다.
     *
     * 앞선 실행이 비정상 종료하면 옛 서버가 4012 에 남는다. 그러면 아래 폴링이
     * **그 서버에 붙어** 시드하지도 않은 DB 로 검사가 돌고, 21건 중 10건이 실패한다.
     * 세 번 당했다 (2026-08-11 두 번, 08-12 한 번). 매번 제품이 깨진 줄 알고 뒤졌다.
     *
     * `pkill -f "PORT=4012"` 는 **안 잡힌다** — 환경변수는 명령줄에 안 보인다.
     * 포트를 직접 쥔 프로세스를 죽여야 한다.
     */
    try {
        const pids = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' }).trim();
        if (pids) {
            console.log(`🧹 ${PORT} 포트를 쥐고 있던 옛 프로세스를 정리합니다 (${pids.split('\n').join(', ')})`);
            execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            await wait(1000);
        }
    } catch { /* lsof 가 없는 환경이면 그냥 진행한다 */ }

    /**
     * 🔴 **이번 실행의 로그만 본다.** 로그 파일은 이어 쓰기(append)라, 안 지우면 아래 로그
     *    기반 검사가 **지난 실행의 줄을 읽고 통과해 버린다.**
     *    2026-08-14 에 변이 테스트로 확인했다 — 코드를 되돌렸는데도 검사가 통과했다.
     *    (이 파일은 시나리오 포트 전용이라 기사님 개발 서버 로그와 섞이지 않는다)
     */
    try {
        const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        const lp = join(SERVER, 'logs', `server-${day}-${PORT}.log`);
        if (existsSync(lp)) rmSync(lp);
    } catch { /* 못 지워도 진행한다 — 아래 검사가 대신 이상을 알린다 */ }

    const bootAfter = Date.now();
    const p = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: SERVER, env: { ...process.env, DB_FILE: DB, PORT: String(PORT) }, stdio: process.env.SCENARIO_LOG ? 'inherit' : 'ignore',
    });
    for (let i = 0; i < 40; i++) {
        await wait(1000);
        try {
            const r = await fetch(`http://localhost:${PORT}/api/health`);
            const h = await r.json();
            // 무엇이 실제로 돌고 있는지 매번 확인한다 — 옛 서버를 붙잡고 오진한 적이 있다
            if (new Date(h.bootedAt).getTime() < bootAfter) {
                p.kill('SIGKILL');
                throw new Error(
                    `🔴 ${PORT} 에 옛 서버가 응답합니다 (bootedAt=${h.bootedAt}). ` +
                    `이 결과는 믿을 수 없습니다 — 검사를 중단합니다.`
                );
            }
            console.log(`🚀 서버 기동 · bootedAt=${h.bootedAt}\n`);
            return p;
        } catch (e) {
            if (String(e.message).startsWith('🔴')) throw e;
            /* 아직 */
        }
    }
    p.kill('SIGKILL');
    throw new Error('서버가 40초 안에 뜨지 않았습니다');
}

const token = async () => (await (await fetch(`http://localhost:${PORT}/api/auth/bypass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
})).json()).accessToken;

function connect(tok) {
    const s = io(`http://localhost:${PORT}`, { auth: { token: tok }, transports: ['websocket'] });
    const st = { filter: null, phases: null, active: [], terminated: [], reports: new Map(),
                 milestones: new Map(), mismatch: [], settle: new Map(), errors: [], stale: null };
    s.on('filter-init', d => { st.filter = d.activeFilter; st.phases = d.phaseSettings ?? st.phases; });
    s.on('filter-updated', d => {                                   // 🔴 -updated 다. -update 아니다
        st.filter = d.activeFilter ?? d;
        st.phases = d.phaseSettings ?? st.phases;
    });
    s.on('sync-active-orders', d => { st.active = d.active || []; st.terminated = d.terminated || []; });
    s.on('cargo-report-saved', d => st.reports.set(d.orderId, d.reports || []));
    s.on('milestone-log', d => st.milestones.set(d.orderId, d.milestones || []));
    s.on('cargo-mismatch', m => st.mismatch.push(m));
    s.on('settlement-updated', d => st.settle.set(d.orderId, d));
    s.on('stale-orders-dropped', d => st.stale = d);
    s.on('handler-error', e => st.errors.push(e));
    s.on('auto-arrived', () => st.autoArrived = (st.autoArrived || 0) + 1);
    s.on('next-stop-approaching', () => st.approaching = (st.approaching || 0) + 1);
    return { s, st };
}

// 화면(deriveCallStep)이 쓰는 파생을 그대로 재현한다
const STEPS = ['상차지 통화', '하차지 통화', '상차지 도착', '상차 완료', '하차지 도착', '하차 완료'];
function deriveIndex(ms, rp) {
    const has = m => ms.some(x => x.milestone === m);
    const called = st => rp.some(r => r.stopType === st && r.kind === 'DECLARED');
    if (has('DELIVERED')) return 6;
    if (has('ARRIVED_DROPOFF')) return 5;
    if (has('PICKED_UP')) return 4;
    if (has('ARRIVED_PICKUP')) return 3;
    if (called('dropoff')) return 2;
    if (called('pickup')) return 1;
    return 0;
}

// ─────────────────────────── 검사 ───────────────────────────
async function run({ main, cod }) {
    const tok = await token();
    const { s, st } = connect(tok);
    await new Promise(r => s.on('connect', r));
    await wait(4000);

    const refresh = async id => {
        s.emit('request-cargo-reports', { orderId: id });
        s.emit('request-milestones', { orderId: id });
        await wait(450);
        return { ms: st.milestones.get(id) || [], rp: st.reports.get(id) || [] };
    };
    /**
     * 🔴 **고정 대기를 쓰지 않는다.** 조건이 참이 될 때까지 다시 읽는다.
     *
     * 예전에는 `fire(); await wait(700)` 이었다. 서버가 700ms 안에 처리하지 못하면
     * 아직 안 바뀐 값을 읽고 **멀쩡한 제품이 실패로 나왔다** — 3회 중 1회꼴로.
     * 간헐 실패는 그 자체보다 **"또 플레이키겠지" 하고 진짜 결함을 넘기게 만드는 것**이 더 나쁘다.
     *
     * 조건이 끝내 만족되지 않으면 timeout 뒤에 그대로 반환한다 → 검사가 정상적으로 실패한다.
     */
    const refreshUntil = async (id, cond, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        let cur = await refresh(id);
        while (!cond(cur) && Date.now() < deadline) {
            await wait(150);
            cur = await refresh(id);
        }
        return cur;
    };

    const http = async () => (await (await fetch(`http://localhost:${PORT}/api/orders`,
        { headers: { Authorization: `Bearer ${tok}` } })).json()).orders || [];

    console.log('═══ A · 진행 중 콜이 재접속 후에도 남는가 ═══');
    const h = await http();
    check('HTTP 가 상차한 콜(ORDER_PICKED_UP)을 준다',
        h.some(o => o.status === 'ORDER_PICKED_UP'), `HTTP ${h.length}건`);
    check('소켓 진행 중에 콜이 있다', st.active.length > 0,
        `진행 ${st.active.length} · 종료 ${st.terminated.length}`);
    check('배차 단계가 합짐이다 (빈 차로 착각하지 않는다)',
        st.filter?.dispatchPhase !== 'STANDBY', `phase=${st.filter?.dispatchPhase}`);

    console.log('\n═══ 콜 생애 6단계 ═══');
    let cur = await refresh(main);

    /**
     * '상차지 도착'은 버튼이 아니라 **GPS 재생**으로 찍는다 (2026-08-17 도착 감지 재설계 L3).
     * 통과(주행 속도)로는 안 찍히고, 시뮬(mock) 근접은 1회만 찍히는 것까지 실서버로 검사한다.
     */
    const mainCall = st.active.find(o => o.id === main);
    const gpsArrive = async () => {
        const px = mainCall?.pickupX, py = mainCall?.pickupY;
        if (!px || !py) { s.emit('report-milestone', { orderId: main, milestone: 'ARRIVED_PICKUP' }); return; }
        const wait = ms => new Promise(r => setTimeout(r, ms));
        // ① 반경 안이지만 첫 틱 — 속도를 모른다 → 발화 금지 (지어내지 않는다)
        s.emit('dashboard-gps-update', { lat: py + 0.0018, lng: px, source: 'browser' });   // ~200m
        await wait(300);
        // ② 반경 안 + 주행 속도(~24km/h) — 통과다 → 발화 금지
        s.emit('dashboard-gps-update', { lat: py + 0.00162, lng: px, source: 'browser' });  // 2m 이동/0.3s
        await wait(700);
        const mid = await refresh(main);
        check('통과(주행 속도)로는 도착이 찍히지 않는다',
            !mid.ms.some(x => x.milestone === 'ARRIVED_PICKUP'), `수신 auto-arrived ${st.autoArrived || 0}회`);
        check('근접 예고(도착전 통화)가 왔다', (st.approaching || 0) >= 1, `${st.approaching || 0}회`);
        // ③ 시뮬(mock) 근접 — 이제 발화한다 (그리고 아래 refreshUntil 이 인덱스 전진을 확인)
        s.emit('dashboard-gps-update', { lat: py, lng: px, source: 'mock' });
        await wait(400);
        // ④ 같은 자리 한 틱 더 — 재발화 금지 (한 정거장당 1회)
        s.emit('dashboard-gps-update', { lat: py + 0.00001, lng: px, source: 'mock' });
    };

    const steps = [
        ['상차지 통화', () => s.emit('save-cargo-report', { orderId: main, stopType: 'pickup', kind: 'DECLARED', unit: '라면박스', quantity: 2, handling: '수작업' })],
        ['하차지 통화', () => s.emit('save-cargo-report', { orderId: main, stopType: 'dropoff', kind: 'DECLARED', handling: '지게차' })],
        ['상차지 도착', gpsArrive],
        ['상차 완료', () => s.emit('report-milestone', { orderId: main, milestone: 'PICKED_UP' })],
        ['하차지 도착', () => s.emit('report-milestone', { orderId: main, milestone: 'ARRIVED_DROPOFF' })],
        ['하차 완료', () => s.emit('report-milestone', { orderId: main, milestone: 'DELIVERED' })],
    ];
    for (const [name, fire] of steps) {
        const before = deriveIndex(cur.ms, cur.rp);
        const t0 = Date.now();
        await fire();
        // 단계가 올라갈 때까지 기다린다 (안 올라가면 5초 뒤 실패로 잡힌다)
        cur = await refreshUntil(main, c => deriveIndex(c.ms, c.rp) > before);
        const after = deriveIndex(cur.ms, cur.rp);
        const ms = Date.now() - t0;
        check(`${name} → ${after >= 6 ? '운행 완료' : STEPS[after]}`,
            after === before + 1, `index ${before}→${after} · ${ms}ms`);
    }

    check('GPS 도착은 1회만 발화한다 (같은 자리 재틱에 재발화 없음)',
        (st.autoArrived || 0) <= 1, `auto-arrived ${st.autoArrived || 0}회`);

    console.log('\n═══ 멱등성 · 순서 어긋남 ═══');
    s.emit('report-milestone', { orderId: main, milestone: 'DELIVERED' }); await wait(600);
    s.emit('report-milestone', { orderId: main, milestone: 'ARRIVED_PICKUP' });
    // 여기서는 **안 바뀌는 것**을 확인하는 검사라 폴링할 조건이 없다.
    // 다만 서버가 처리하고 나서 봐야 하므로 넉넉히 기다린다 (바뀌면 어차피 실패한다).
    await wait(1200);
    cur = await refresh(main);
    check('중복·역행 보고에도 단계가 안 흔들린다', deriveIndex(cur.ms, cur.rp) === 6);
    check('마일스톤이 중복 저장되지 않는다', cur.ms.length <= 4, `${cur.ms.length}건`);

    console.log('\n═══ C·E · 적재 용량이 짐 신고에 반응하는가 ═══');
    const before = JSON.stringify(st.filter?.allowedVehicleTypes);
    s.emit('save-cargo-report', { orderId: cod, stopType: 'pickup', kind: 'DECLARED', unit: '파레트', quantity: 2, handling: '지게차' });
    await wait(1200);
    check('저장 즉시 신뢰도가 신고 기준으로 올라간다',
        st.filter?.capacityConfidence === 'DECLARED', `${before} → ${JSON.stringify(st.filter?.allowedVehicleTypes)} ${st.filter?.capacityConfidence}`);
    s.emit('save-cargo-report', { orderId: cod, stopType: 'pickup', kind: 'ACTUAL', unit: '파레트', quantity: 5, handling: '지게차' });
    await wait(1400);
    check('현장 실측이 들어가면 CONFIRMED', st.filter?.capacityConfidence === 'CONFIRMED');

    console.log('\n═══ D · 신고 불일치 경고 ═══');
    check('통화 2개 → 현장 5개(2.5배)에서 경고가 뜬다', st.mismatch.length > 0,
        st.mismatch.length ? `ratio=${st.mismatch[st.mismatch.length - 1].ratio.toFixed(1)}` : '0건');
    const mBefore = st.mismatch.length;
    s.emit('save-cargo-report', { orderId: cod, stopType: 'dropoff', kind: 'DECLARED', handling: '지게차' }); await wait(600);
    s.emit('save-cargo-report', { orderId: cod, stopType: 'dropoff', kind: 'ACTUAL', handling: '수작업' }); await wait(900);
    check('하차지 저장은 조용하다 (부피를 묻지 않는 설계)', st.mismatch.length === mBefore);

    console.log('\n═══ F · 착불 현금 ═══');
    s.emit('cod-collected', { orderId: cod, received: true }); await wait(900);
    check('[받았음] 이 기록된다', st.settle.get(cod)?.settlementStatus === '수령',
        `status=${st.settle.get(cod)?.settlementStatus}`);
    s.emit('report-milestone', { orderId: cod, milestone: 'DELIVERED' }); await wait(1400);
    check('하차 완료가 수령 기록을 덮어쓰지 않는다', st.settle.get(cod)?.settlementStatus === '수령');

    // ⚠️ 이 검사는 **모든 콜을 끝낸 뒤에** 해야 한다.
    //    시드가 콜을 2건 만드는데 1건만 완료하고 STANDBY 를 기대해서
    //    멀쩡한 제품을 두 번 실패로 잡았다 (2026-08-11). 남은 활성 콜 수를 함께 찍는다.
    await wait(1500);
    console.log('\n═══ 모든 콜을 끝낸 뒤 필터 복귀 ═══');
    check('첫짐 탐색으로 돌아간다', st.filter?.dispatchPhase === 'STANDBY',
        `phase=${st.filter?.dispatchPhase} · 남은 활성 ${st.active.length}건`);
    check('합짐 모드가 꺼진다', st.filter?.isSharedMode === false);
    check('빈 차이므로 적재 신뢰도가 CONFIRMED', st.filter?.capacityConfidence === 'CONFIRMED',
        JSON.stringify(st.filter?.allowedVehicleTypes));

    /**
     * ═══ 국면별 필터 설정 (docs/필터_재설계_명세.md §2-4) ═══
     *
     * 기사님: *"첫짐 도착반경 5km 로 콜 잡기하다 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
     *
     * 여기서만 잡히는 결함: 저장은 됐는데 **국면이 바뀌어도 안 꺼내 쓰는** 경우.
     * `tsc` 도 `jest` 도 통과한다 — 값이 흐르는지는 실제로 돌려 봐야 안다.
     */
    console.log('\n═══ 국면별 필터 설정 ═══');
    const untilFilter = async (cond, timeoutMs = 4000) => {
        const deadline = Date.now() + timeoutMs;
        while (!cond() && Date.now() < deadline) await wait(120);
        return cond();
    };
    const savePhase = (phase, patch) => s.emit('save-phase-settings', {
        phase, settings: { ...(st.phases?.[phase] ?? {}), ...patch }, saveAsDefault: false,
    });

    // ① 지금 국면(first)에 저장하면 **바로** 적용된다
    savePhase('first', { dropoffRadiusKm: 7 });
    check('첫짐 저장이 지금 국면이라 바로 적용된다',
        await untilFilter(() => st.filter?.destinationRadiusKm === 7),
        `하차 반경=${st.filter?.destinationRadiusKm}`);

    // ② 다른 국면(local)에 저장해도 **지금 콜 잡기은 안 바뀐다**
    savePhase('local', { dropoffRadiusKm: 0, discountPct: 20 });
    await wait(500);
    check('관내 탭에 저장해도 지금(첫짐) 필터는 그대로다',
        st.filter?.destinationRadiusKm === 7,
        `하차 반경=${st.filter?.destinationRadiusKm}`);
    check('저장은 됐다 — 관내 국면 값이 서버에 남는다',
        st.phases?.local?.dropoffRadiusKm === 0 && st.phases?.local?.discountPct === 20,
        JSON.stringify(st.phases?.local));

    // ③ 🔴 국면을 바꾸면 **그 국면의 저장값을 꺼내 쓴다** — 이 기능의 핵심
    s.emit('set-call-target', { phase: 'LOCAL' });
    check('관내로 바꾸면 관내 저장값이 펼쳐진다',
        await untilFilter(() => st.filter?.destinationRadiusKm === 0 && st.filter?.callDiscountPct === 20),
        `하차 반경=${st.filter?.destinationRadiusKm} · 할인=${st.filter?.callDiscountPct}%`);

    // ④ 돌아오면 첫짐 값도 그대로 살아 있다 (덮이지 않았다)
    s.emit('set-call-target', { phase: 'DEST' });
    check('첫짐으로 돌아오면 첫짐 저장값이 되살아난다',
        await untilFilter(() => st.filter?.destinationRadiusKm === 7),
        `하차 반경=${st.filter?.destinationRadiusKm}`);

    // ⑤ 단가표는 할인율에서 파생된다 (§2-1) — 두 곳에서 만들지 않는다
    check('할인율이 바뀌면 차종별 단가표가 따라 바뀐다',
        !!st.filter?.ratePerKm && Object.keys(st.filter.ratePerKm).length > 0,
        JSON.stringify(st.filter?.ratePerKm));

    console.log('\n═══ 전체 ═══');
    check('서버 오류(handler-error) 0건', st.errors.length === 0,
        st.errors.length ? JSON.stringify(st.errors.slice(0, 2)) : '');

    s.close();
}

// ─────────────────────────── 진입 ───────────────────────────
let proc;
try {
    const ids = await seed();
    proc = await boot();
    await run(ids);
} catch (e) {
    console.error('\n🔴 시나리오 실행 실패:', e.message);
    results.push({ name: '시나리오 실행', ok: false });
} finally {
    if (proc) proc.kill('SIGKILL');
    await wait(500);
    for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) {
        const p = join(SERVER, f);
        if (existsSync(p)) rmSync(p);
    }
}

/**
 * 🔴 **L3 — 실제로 돈 서버의 로그로 확인한다** (2026-08-14 신설)
 *
 * 규칙 테스트(L1)는 코드 *모양*만 보고, 값 테스트(L2)는 순수 함수만 본다.
 * *"진짜 서버가 카카오를 부를 때도 이미 상차한 콜의 상차지를 뺐는가"* 는 둘 다 증명 못 한다.
 *
 * 오늘 만든 **서버 로그 파일**(`99ac52f`)이 그 자리를 메운다 — 시나리오 서버는
 * `ORDER_PICKED_UP` 콜을 심어 두고 실제 카카오 경로를 계산하므로, 그 흔적이 로그에 남는다.
 *
 * 이 검사가 없으면 2026-08-14 의 `OrderEvaluator` 손조립을 **또** 놓친다 —
 * 그때도 tsc·jest·audit 이 전부 통과했다.
 */
try {
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const logPath = join(SERVER, 'logs', `server-${day}-${PORT}.log`);
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

    check('서버 로그 파일이 남는다 (없으면 아래 검사가 무의미하다)', log.length > 0,
        log ? `${Math.round(log.length / 1024)}KB` : logPath);

    if (log) {
        const kakao = (log.match(/\[Kakao Nav API/g) || []).length;
        check('시나리오가 실제 카카오 경로를 계산했다', kakao > 0, `${kakao}회`);

        // 상차한 콜이 섞인 채 경로를 짰다면 반드시 이 줄이 있어야 한다
        const skipped = (log.match(/이미 상차한 콜 \d+건의 상차지를 경유지에서 제외/g) || []).length;
        check('🔴 이미 상차한 콜의 상차지를 경유지에서 뺐다 (실제 서버에서)',
            skipped > 0, `${skipped}회`);

        // 손조립 시절에는 이 줄 없이 Detour 를 불렀다 — 그 흔적이 없어야 한다
        const detour = (log.match(/\[Kakao Nav API \(Detour\)/g) || []).length;
        check('합짐 경로를 부를 때 조립을 건너뛴 흔적이 없다',
            detour === 0 || skipped > 0, `Detour ${detour}회 · 제외 ${skipped}회`);
    }
} catch (e) {
    check('로그 기반 확인', false, String(e?.message || e));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${'─'.repeat(52)}`);
console.log(`검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
if (failed.length) {
    console.log(`\n🔴 실패:\n${failed.map(f => `   · ${f.name}`).join('\n')}`);
    process.exit(1);
}
console.log('\n✅ 시나리오 이상 없음');

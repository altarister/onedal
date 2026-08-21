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
    c.prepare(`UPDATE orders SET timestamp = '2020-01-01T00:00:00Z', status = 'ORDER_RELEASED_BY_ME'`).run();
    // 🔄 새 장부(여섯 단계 행)를 비운다 — 씨앗 콜의 지난 리허설 이력이 남으면
    //    첫 refresh 부터 index 5 로 시작해 6단계 검사가 통째로 무너진다 (2026-08-21 실측)
    for (const t of ['step_call_pickup', 'step_call_dropoff', 'step_arrive_pickup',
                     'step_loaded', 'step_arrive_dropoff', 'step_delivered']) {
        c.prepare(`DELETE FROM ${t}`).run();
    }

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
    const st = { filter: null, phases: null, active: [], terminated: [], steps: new Map(),
                 mismatch: [], errors: [], stale: null };
    s.on('filter-init', d => { st.filter = d.activeFilter; st.phases = d.phaseSettings ?? st.phases; });
    s.on('filter-updated', d => {                                   // 🔴 -updated 다. -update 아니다
        st.filter = d.activeFilter ?? d;
        st.phases = d.phaseSettings ?? st.phases;
    });
    s.on('sync-active-orders', d => { st.active = d.active || []; st.terminated = d.terminated || []; });
    // 🔄 옛 장부 이벤트(cargo-report-saved·milestone-log)는 철거됐다 (2026-08-21) —
    //    새 장부(여섯 단계 행) 하나를 듣고, 옛 모양(reports/milestones)은 아래에서 파생한다
    s.on('steps-synced', d => st.steps.set(d.orderId, d.steps || []));
    s.on('cargo-mismatch', m => st.mismatch.push(m));
    s.on('stale-orders-dropped', d => st.stale = d);
    s.on('handler-error', e => st.errors.push(e));
    s.on('auto-arrived', () => st.autoArrived = (st.autoArrived || 0) + 1);
    s.on('next-stop-approaching', () => st.approaching = (st.approaching || 0) + 1);
    return { s, st };
}

/** 여섯 단계 행 → 옛 모양(reports/milestones) — shared recordsOfSteps 의 검사기 판 */
const MILESTONE_OF = { ARRIVE_PICKUP: 'ARRIVED_PICKUP', LOADED: 'PICKED_UP',
                       ARRIVE_DROPOFF: 'ARRIVED_DROPOFF', DELIVERED: 'DELIVERED' };
function recordsOf(steps) {
    const rp = [], ms = [];
    for (const s of steps) {
        if (s.born === false) continue;
        const r = s.row ?? {};
        if ((s.step === 'LOADED' || s.step === 'DELIVERED') && r.actual_unit != null) {
            rp.push({ stopType: s.step === 'LOADED' ? 'pickup' : 'dropoff', kind: 'ACTUAL',
                      unit: r.actual_unit, quantity: r.actual_quantity, handling: r.actual_handling });
        }
        if (r.status === 'PLANNED' || !r.status) continue;
        if (s.step === 'CALL_PICKUP' || s.step === 'CALL_DROPOFF') {
            rp.push({ stopType: s.step === 'CALL_PICKUP' ? 'pickup' : 'dropoff',
                      kind: r.status === 'SKIPPED' ? 'SKIPPED' : 'DECLARED',
                      unit: r.planned_unit, quantity: r.planned_quantity, handling: r.planned_handling,
                      promisedArrivalAt: r.promised_arrival_at ?? undefined });
        }
        const m = MILESTONE_OF[s.step];
        if (m && r.occurred_at) ms.push({ milestone: m, occurredAt: r.occurred_at, source: r.source });
    }
    return { ms, rp };
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
        s.emit('request-steps', { orderId: id });
        await wait(450);
        return recordsOf(st.steps.get(id) || []);
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
    const firstCall = st.active.find(o => o.id === main);   // 첫짐 콜
    const gpsArrive = async () => {
        const px = firstCall?.pickupX, py = firstCall?.pickupY;
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
    // 🔄 settlement-updated 이벤트는 철거 (2026-08-21) — 원천인 장부(orders)를 직접 본다
    const settleOf = (id) => {
        const c = new Database(join(SERVER, DB), { readonly: true });
        const r = c.prepare(`SELECT settlementStatus FROM orders WHERE id = ?`).get(id);
        c.close();
        return r?.settlementStatus;
    };
    check('[받았음] 이 기록된다', settleOf(cod) === '수령', `status=${settleOf(cod)}`);
    s.emit('report-milestone', { orderId: cod, milestone: 'DELIVERED' }); await wait(1400);
    check('하차 완료가 수령 기록을 덮어쓰지 않는다', settleOf(cod) === '수령');

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
    /**
     * 타겟 자동 순환(2026-08-17)이 사이클 종료 때 복귀를 미리 눌러 뒀을 수 있다.
     * 여기서 노선(DEST)으로 스와이프해 되돌린다 — "스와이프가 자동을 이긴다"의 L3 이기도 하다.
     */
    const untilFilter = async (cond, timeoutMs = 4000) => {
        const deadline = Date.now() + timeoutMs;
        while (!cond() && Date.now() < deadline) await wait(120);
        return cond();
    };

    if (st.filter?.callTarget && st.filter.callTarget !== 'DEST') {
        check('사이클 종료 후 타겟이 복귀(HOME)로 미리 눌러졌다', st.filter.callTarget === 'HOME',
            `callTarget=${st.filter.callTarget}`);
        s.emit('set-call-target', { phase: 'DEST' });
        await untilFilter(() => st.filter?.callTarget === 'DEST');
        check('스와이프가 자동을 이긴다 — 노선으로 복귀', st.filter?.callTarget === 'DEST', '');
    }

    console.log('\n═══ 국면별 필터 설정 ═══');
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

// ─────────────────────────── 장부 검사 ───────────────────────────
/**
 * 🔴 **L3.5 — "남은 것"을 본다** (2026-08-18 신설)
 *
 * 2026-08-18, 기사님이 운행 중에 `targetApp` 이 **13행 전부 NULL** 인 것을 발견했다.
 * 그때 `tsc`·`jest` 37스위트·`scenario` 36건·`audit` 이 **전부 통과한 상태**였다.
 *
 * 이유는 단순하다 — 우리 검사는 전부 *서버가 스스로 하는 말*만 본다:
 *   tsc = 타입이 맞나 · jest = 함수가 규칙대로 도나 · scenario = **소켓으로 방송된 상태**가 맞나
 * **실제로 저장된 행을 여는 검사가 한 개도 없었다.** 타입이 맞고 방송이 맞으면
 * 값이 증발해도 초록불이 켜진다.
 *
 * 게다가 이 시나리오는 콜을 **DB 에 직접 심어** 시작하므로, *콜을 잡는 경로*
 * (앱 → `/orders/confirm` → `/orders/detail`)를 **한 번도 타지 않았다.**
 * 그 경로에서 필드가 증발해도 알 길이 없었다 — 실제로 거기서 증발하고 있었다.
 * 그래서 여기서는 **그 경로를 실제로 태우고, 남은 행을 연다.**
 */
async function ledger() {
    console.log('\n═══ 장부 — 콜을 잡는 경로를 태우고 남은 행을 연다 ═══');

    const dbPath = join(SERVER, DB);
    let dev, src;
    {
        const c = new Database(dbPath, { readonly: true });
        dev = c.prepare(`SELECT device_id FROM user_devices LIMIT 1`).get();
        // 좌표가 이미 캐시된 주소라야 카카오 연산이 끝까지 간다
        src = c.prepare(`SELECT pickup, dropoff, fare, vehicleType FROM orders
                         WHERE pickup <> '' AND dropoff <> '' AND fare > 0 LIMIT 1`).get();
        c.close();
    }
    if (!dev || !src) {
        check('장부 검사 준비 (등록 기기·주소 씨앗)', false, '기기 또는 주소 씨앗이 없다');
        return;
    }

    const id = `ledger-${Date.now()}`;
    const capturedAt = new Date().toISOString();
    /**
     * 🔴 **상세 화면 원문(rawText)을 함께 태운다** (2026-08-19).
     *
     * `detail.ts` 는 `if (rawText)` **안에서만** 상하차지 상세(고객·담당·전화1/2)를
     * 만든다. 원문 없이 order 객체만 올리면 그 블록이 통째로 안 돌아서
     * **연락처·주소상세·결제수단이 한 번도 검사되지 않는다.**
     *
     * 기사님이 리허설에서 *"연락처가 있어야 전화를 할 건데 왜 없을까?"* 로 발견하셨다.
     * 그때까지 리허설도 이 검사도 원문을 안 보내고 있었다 — 둘 다 실물 경로를 비껴간 것이다.
     */
    const rawText = [
        '배차사 : 장부 검사 퀵', `요금 : ${src.fare.toLocaleString()}(신용)`,
        `차종 : ${src.vehicleType || '1t'}`, '물품 : 장부 검사',
        '', '[출발지상세]', '고객 : 장부 상차지', `위치 : ${src.pickup}`, '전화1 : 010-0000-1001',
        '', '[도착지상세]', '고객 : 장부 하차지', `위치 : ${src.dropoff}`, '전화1 : 010-0000-2001',
    ].join('\n');
    const order = {
        id, pickup: src.pickup, dropoff: src.dropoff, fare: src.fare,
        vehicleType: src.vehicleType || '1t', timestamp: capturedAt,
        itemDescription: '장부 검사', rawText,
    };
    const post = (path, body) => fetch(`http://localhost:${PORT}/api/orders${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(e => ({ ok: false, err: e }));

    // ① 리스트에서 확정 (앱 1차) → ② 상세 수집 (앱 2차, 여기서 콜 객체가 새로 조립된다)
    //    MANUAL 은 즉시 KEEP 이라 관제웹 결재 없이 장부까지 간다 (직접콜 무심사 — 설계)
    const base = { deviceId: dev.device_id, capturedAt, matchType: 'MANUAL' };
    await post('/confirm', { ...base, step: 'BASIC', order });
    await wait(400);
    await post('/detail', { ...base, step: 'DETAILED', order });

    // 카카오 경로 계산 + 확정까지 기다린다
    let row = null;
    for (let i = 0; i < 24 && !row; i++) {
        await wait(500);
        const c = new Database(dbPath, { readonly: true });
        row = c.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) || null;
        c.close();
    }

    check('콜을 잡는 경로가 장부에 행을 남긴다', !!row, row ? '' : `${id} 가 orders 에 없다`);
    if (!row) return;

    /**
     * ① 채워져야 할 칸이 비어 있지 않은가.
     * 여기에 칸 이름을 적어 두면, 앞으로 **칸을 새로 만들고 안 채우는 사고**가 잡힌다.
     * (2026-08-18 `targetApp` — 코드도 있고 타입도 맞는데 값이 한 번도 안 들어갔다)
     */
    /**
     * ①-b **전화를 걸 수 있는가.**
     *
     * 이 제품의 다음 동작은 언제나 *"KEEP 하고 바로 통화"* 다 (기사님).
     * 연락처가 증발하면 콜을 잡아도 **아무것도 못 한다** — 색이 틀리는 것 다음으로 큰 사고다.
     * 상세 원문에서 뽑은 `전화1` 이 `places` 까지 살아서 갔는지 본다.
     */
    {
        const c = new Database(dbPath, { readonly: true });
        const stop = c.prepare(`SELECT p.phone1, p.customerName FROM orderStops s
                                JOIN places p ON p.id = s.placeId
                                WHERE s.orderId = ? AND s.stopType = 'pickup'`).get(id);
        c.close();
        check('상세 원문의 상차지 연락처가 장부까지 간다', !!stop?.phone1,
            stop?.phone1 ? `${stop.customerName} ${stop.phone1}` : '🔴 phone1 이 비었다 — 전화를 걸 수 없다');
    }

    const REQUIRED = ['id', 'type', 'status', 'userId', 'pickup', 'dropoff', 'fare',
        'vehicleType', 'timestamp', 'capturedAt', 'capturedDeviceId', 'targetApp'];
    const empty = REQUIRED.filter(k => row[k] === null || row[k] === undefined || row[k] === '');
    check('확정된 콜 행에 빈 칸이 없다', empty.length === 0,
        empty.length ? `🔴 빈 칸: ${empty.join(', ')}` : `${REQUIRED.length}칸 확인`);

    /**
     * ② **색과 점수가 서로 맞는가.**
     *
     * 카드의 색은 점수에서 나온다. 둘이 어긋나면 **화면이 자기모순**이고,
     * 기사님은 색을 보고 1~2초에 누르시므로 그게 곧 오결재가 된다.
     *
     * ⚠️ 예전에는 "문구의 시간으로 점수를 재현"했는데, 2026-08-18 에 첫짐 판정이
     *    운행시간 → **단가** 로 바뀌면서 그 검사가 없어진 DB 칸을 읽어 터졌다.
     *    그래서 축이 바뀌어도 참인 것만 본다 — 점수와 색의 관계는 축과 무관하다.
     */
    const ext = row.kakaoTimeExt || '';
    const mScore = /· (\d+)점/.exec(ext);
    const mColor = /'(꿀|보통|똥)'/.exec(ext);
    if (mScore && mColor) {
        const c = new Database(dbPath, { readonly: true });
        const j = c.prepare(`SELECT color_honey_min AS honey, color_normal_min AS normal
                             FROM user_judgment WHERE user_id = ?`).get(row.userId) || {};
        c.close();
        const honey = j.honey ?? 70, normal = j.normal ?? 40;
        const score = Number(mScore[1]);
        const expect = score >= honey ? '꿀' : score >= normal ? '보통' : '똥';
        check('색과 점수가 서로 맞는다', expect === mColor[1],
            `${score}점이면 '${expect}' 인데 문구는 '${mColor[1]}' (경계 꿀${honey}·보통${normal})`);
    } else {
        check('첫짐 문구에 색과 점수가 함께 적힌다', false, `문구: "${ext}"`);
    }

    /**
     * ②-2 **취소한 콜도 장부에 남는가.**
     *
     * 🔴 2026-08-18 — 안전취소는 **한 번도 저장된 적이 없었다.** 3개월치 백업에도 0건이다.
     *    KEEP 전에는 행이 없는데 저장 코드가 `UPDATE` 라 0행에 적용되고 조용히 끝난다.
     *    화면(취소 탭)에는 보이는데 그건 **세션 메모리**라, 서버를 재시작하면 사라진다.
     *    배차망 취소 횟수(10회)를 세려면 반드시 장부에 있어야 한다 (용어집 §2-1).
     */
    {
        const cid = `${id}-cancel`;
        const cancelOrder = { ...order, id: cid };
        await post('/confirm', { ...base, step: 'BASIC', matchType: 'AUTO', order: cancelOrder });
        await wait(400);
        await post('/detail', { ...base, step: 'DETAILED', matchType: 'AUTO', order: cancelOrder });
        await wait(4000);                                     // 카카오 연산이 끝나길 기다린다
        await post('/decision', { orderId: cid, action: 'CANCEL', deviceId: dev.device_id });

        let crow = null;
        for (let i = 0; i < 10 && !crow; i++) {
            await wait(400);
            const c = new Database(dbPath, { readonly: true });
            crow = c.prepare(`SELECT status FROM orders WHERE id = ?`).get(cid) || null;
            c.close();
        }
        check('취소한 콜도 장부에 남는다 (재시작해도 안 사라진다)', !!crow,
            crow ? `status=${crow.status}` : '🔴 orders 에 행이 없다 — 세션 메모리에만 있다');
        if (crow) {
            check('취소한 콜의 상태가 SAFE_CANCEL 이다', crow.status === 'SAFE_CANCEL', `status=${crow.status}`);
        }
    }

    /**
     * ②-3 **강제 정리된 콜도 장부에 남는가.**
     *
     * 🔴 2026-08-18 실사고 — 송정동 → 고덕동 콜이 "그냥 사라졌다."
     *    앱이 확정 클릭 후 12초 만에 리스트 화면으로 이탈하자 서버의 화면 이탈 감지가
     *    forceCancelEvaluatingOrder 로 지웠는데, **이 경로가 DB 를 안 거쳤다.**
     *    결재 취소는 저장하도록 고쳤으면서(②-2) 강제 정리 경로를 빠뜨렸다 — 같은 클래스.
     *    안전취소는 배차망 취소 횟수(10회)에 들어가므로 한 건도 새면 안 된다 (용어집 §2-1).
     */
    {
        const fid = `${id}-force`;
        const forceOrder = { ...order, id: fid };
        await post('/confirm', { ...base, step: 'BASIC', matchType: 'AUTO', order: forceOrder });
        await wait(600);
        // 상세를 보내지 않고 화면 이탈을 흉내낸다 — 새 콜 진입이 기존 평가 콜을 강제 정리한다
        const nextOrder = { ...order, id: `${id}-next` };
        await post('/confirm', { ...base, step: 'BASIC', matchType: 'AUTO', order: nextOrder });

        let frow = null;
        for (let i = 0; i < 10 && !frow; i++) {
            await wait(400);
            const c = new Database(dbPath, { readonly: true });
            frow = c.prepare(`SELECT status FROM orders WHERE id = ?`).get(fid) || null;
            c.close();
        }
        check('강제 정리된 콜도 장부에 남는다 (화면 이탈 — 송정동→고덕동 사고)', !!frow,
            frow ? `status=${frow.status}` : '🔴 orders 에 행이 없다 — 흔적 없이 사라졌다');
    }

    /**
     * ③ 색이 콜을 구분하는가.
     * 값이 옳은지는 여기서 못 본다. 하지만 **판정이 정보를 못 내는 상태**는 보인다 —
     * 장부의 첫짐이 전부 한 색이면 그 기준은 구분을 포기한 것이다.
     * (2026-08-18: 첫짐 8건이 전부 '똥'. 기준을 반대로 크게 올려 전부 '꿀' 이 되는 것도 같은 실패다)
     */
    {
        const c = new Database(dbPath, { readonly: true });
        const marks = c.prepare(`SELECT kakaoTimeExt FROM orders WHERE kakaoTimeExt LIKE '추천거리%'`)
            .all().map(r => (/'(꿀|보통|똥)'/.exec(r.kakaoTimeExt) || [])[1]).filter(Boolean);
        c.close();
        const uniq = [...new Set(marks)];
        const tally = uniq.map(u => `${u} ${marks.filter(m => m === u).length}`).join(' · ');
        /**
         * ⚠️ "전부 꿀"은 실패가 아니다 (2026-08-18 오탐 수정) — 앱 필터가
         *    `요금 ≥ 거리 × 단가` 로 하한을 이미 걸렀으니 잡힌 콜이 꿀로 몰리는 건 설계다.
         *    이 검사가 지키는 사고는 그 반대다: 기준이 틀려 **잡은 콜이 전부 똥**으로 뜨던 것
         *    (2026-08-18 오전 — 100,000원짜리가 0점, 8건 전부 똥).
         */
        check('첫짐 판정이 잡은 콜을 전부 똥으로 만들지 않는다',
            !(marks.length >= 3 && uniq.length === 1 && uniq[0] === '똥'),
            marks.length ? tally : '판정된 첫짐이 없다');
    }
}

/**
 * 🎓 **노하우 문제지 — 고수가 판정을 채점한다** (시간체계 16-4 · 판정색 확정안 v2)
 *
 * 실제 고수가 돈을 벌며 해낸 아침 4콜(신림 기점)을 실서버에 태우고, 판정 스냅샷
 * (`order_judgments`)이 합격선에 드는지 본다. **고수가 해낸 콜을 우리가 나쁘다고
 * 하면 우리가 틀린 것이다.**
 *
 * 못박는 것은 **합격선**(색 범위)이지 점수 숫자가 아니다 — 환산식·가중치가 진화해도
 * 고수 콜을 낙제시키지 않는 한 이 검사는 통과한다. 기준을 일부러 바꿔 합격선 자체가
 * 달라지면 16-4 문서를 기사님 확정으로 개정하고 이 표를 같이 고친다 (glossary 와 같은 관계).
 *
 * 처음 만든 날 실측: 옛 판정은 이 4콜을 **전부 🟡**로 낙제시켰다 (요율 재계산 ·
 * 절대치 감점 · 누적 우회). 셋 다 이 검사가 있었으면 리허설 전에 잡혔다.
 */
async function gosuExam() {
    console.log('\n═══ 🎓 노하우 문제지 — 고수 4콜 채점 (16-4) ═══');
    const dbPath = join(SERVER, DB);
    let dev;
    {
        const c = new Database(dbPath, { readonly: true });
        dev = c.prepare(`SELECT device_id FROM user_devices LIMIT 1`).get();
        c.close();
    }
    if (!dev) { check('문제지 준비 (등록 기기)', false); return; }

    const tok = await token();
    const { s, st } = connect(tok);
    await new Promise(r => s.on('connect', r));
    await wait(2000);

    // ── 깨끗한 시작 — 장부 검사가 남긴 활성 콜(MANUAL)을 방출한다
    for (const o of st.active) {
        s.emit('decision', { orderId: o.id, action: 'ORDER_RELEASED_BY_ME' });
        await wait(800);
    }
    await wait(1500);
    check('문제지 시작 전 빈 차', st.active.length === 0, `활성 ${st.active.length}건`);

    // ── 시작 위치 신림역 (16-4 채점 조건 — 초월읍 기점이면 13번 접근 75분으로 왜곡)
    s.emit('dashboard-gps-update', { lat: 37.4842, lng: 126.9294, source: 'browser' });
    await wait(1200);
    console.log('  📍 시작 위치: 신림역 (노하우 아침의 기점)');

    /** 합격선 (16-4) — 색 **범위**만 못박는다. 점수는 자유다 */
    const EXAM = [
        { n: 13, label: '가산동 → 진위면 3.0만 — 고수: 43분 픽업 · 사무실 통화 1건',
          pickup: '서울 금천구 가산동', dropoff: '경기 평택시 진위면', fare: 30000,
          passLabel: '🟢 이상', pass: v => ['보통', '꿀'].includes(v.color) },
        /**
         * 🔴 14번 합격선은 **하한만** 본다 (2026-08-21 실측 교훈 — 검사기 오진).
         * 밤 교통이면 우회가 줄어 순증이 올라 🔵 70점이 됐고, "🟢~🟡" 상한에 걸려
         * 멀쩡한 판정이 낙제했다. 16-4 의 정신은 "고수 콜을 **낮게** 보면 낙제"
         * (자르거나 사고 취급)이지, 교통이 좋아 🔵이 되는 것은 사고가 아니다.
         */
        { n: 14, label: '양평동 → 안중읍 3.8만 — 고수: 40분 픽업 각오 · 통화 2건 · 배달 빠듯',
          pickup: '서울 영등포구 양평동', dropoff: '경기 평택시 안중읍', fare: 38000,
          memo: '평택 시내 (블라인드 — 실제는 안중읍)',
          passLabel: '사고만 불가 + 통화 필수 딱지', pass: v => v.color !== '사고',
          needTag: '통화 필수' },
        { n: 15, label: '문래동 → 상갈동 3.5만 — 고수: 10시 예약을 당김',
          pickup: '서울 영등포구 문래동', dropoff: '경기 용인시 기흥구 상갈동', fare: 35000,
          memo: '10:00상차 예약', passLabel: '🔵', pass: v => v.color === '꿀' },
        { n: 16, label: '가산 옆 3분 → 지곡동 3.5만 — 고수: 통화 0건, 최고의 합짐',
          pickup: '서울 금천구 가산디지털단지', dropoff: '경기 용인시 기흥구 지곡동', fare: 35000,
          passLabel: '🔵', pass: v => v.color === '꿀' },
    ];

    const post = (path, body) => fetch(`http://localhost:${PORT}/api/orders${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(e => ({ ok: false, err: e }));

    /** 판정 스냅샷이 설 때까지 (심사 = KEEP 전이므로 스냅샷만 기다리면 된다) */
    const snapshotOf = async (id, timeoutMs = 25_000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const c = new Database(dbPath, { readonly: true });
            const r = c.prepare(`SELECT color, score, detail FROM order_judgments WHERE orderId = ?`).get(id);
            c.close();
            if (r) return { ...r, detail: JSON.parse(r.detail) };
            await wait(500);
        }
        return null;
    };

    const emoji = { '꿀': '🔵', '보통': '🟢', '똥': '🟡', '사고': '🔴' };
    for (const t of EXAM) {
        const id = `GOSU-${Date.now()}-${t.n}`;
        const capturedAt = new Date().toISOString();
        // 🔴 적요는 rawText 물품 줄에 — 서버 /detail 의 rawText 해부가 order 필드를 덮는다 (#34)
        const rawText = [
            '배차사 : 노하우 퀵', `요금 : ${t.fare.toLocaleString()}(신용)`, '차종 : 승용차',
            `물품 : ${t.memo || '노하우 문제지'}`,
            '', '[출발지상세]', '고객 : 문제지 상차지', `위치 : ${t.pickup}`, `전화1 : 010-0000-11${t.n}`,
            '', '[도착지상세]', '고객 : 문제지 하차지', `위치 : ${t.dropoff}`, `전화1 : 010-0000-22${t.n}`,
        ].join('\n');
        const order = { id, pickup: t.pickup, dropoff: t.dropoff, fare: t.fare,
                        vehicleType: '승용차', timestamp: capturedAt,
                        itemDescription: t.memo || '노하우 문제지', rawText };
        const base = { deviceId: dev.device_id, capturedAt, matchType: 'AUTO' };
        await post('/confirm', { ...base, step: 'BASIC', order });
        await wait(400);
        await post('/detail', { ...base, step: 'DETAILED', order });

        const v = await snapshotOf(id);
        if (!v) { check(`${t.n} ${t.label}`, false, '판정 스냅샷이 서지 않았다'); continue; }

        const gatesOk = (v.detail.gates || []).every(g => g.pass);
        const tagsStr = (v.detail.tags || []).join(' · ');
        check(`${t.n}번 합격선 ${t.passLabel}`,
            t.pass(v) && gatesOk,
            `${emoji[v.color] || ''} ${v.color} ${v.score}점${gatesOk ? '' : ' · 🔴 문지기 실패'} — ${t.label}`);
        if (t.needTag) {
            check(`${t.n}번 딱지 — ${t.needTag} (고수도 통화로 시간을 샀다)`,
                tagsStr.includes(t.needTag), tagsStr || '딱지 없음');
        }

        // 다음 콜의 합짐 심사를 위해 KEEP (안전취소 35초 안 — 스냅샷 폴링이 그 안에 끝난다)
        s.emit('decision', { orderId: id, action: 'ORDER_CONFIRMED' });
        const kept = Date.now() + 8000;
        while (Date.now() < kept && !st.active.some(o => o.id === id)) await wait(300);
        if (!st.active.some(o => o.id === id)) {
            check(`${t.n}번 KEEP`, false, '결재가 반영되지 않았다 — 뒤 콜 채점이 왜곡된다');
        }
        await wait(1500);   // KEEP 후 경로 재계산이 앉을 틈
    }

    s.close();
}

// ─────────────────────────── 진입 ───────────────────────────
let proc;
try {
    const ids = await seed();
    proc = await boot();
    await run(ids);
    await ledger();
    await gosuExam();
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

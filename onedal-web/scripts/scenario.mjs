#!/usr/bin/env node
/**
 * 시나리오 검사기 — 실제 서버를 띄우고 콜의 생애를 끝까지 돌린다.
 * 누가: 에이전트 — 콜 흐름(상태·복구·적재·정산)을 건드렸을 때의 게이트
 * 언제: 그 코드를 고친 뒤 커밋 직전
 * 어디서: cd onedal-web && pnpm scenario
 * 무엇을: 전용 포트 4012 · 전용 DB 로 실제 서버를 띄워 콜의 생애를 끝까지 돌린다
 * 왜: tsc · jest · build 를 다 통과한 결함이 여기서만 드러난다
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 * ══ 왜 있는가 ══
 *
 * 이 검사가 지키는 결함 여섯(A~F)은 **전부 `tsc` · `jest` · `vite build` · `audit:socket` 을 통과한 채로**
 * 숨는 부류다. 돌려 봐야만 나온다.
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
/**
 * 🌱 씨앗으로 쓸 DB — 좌표가 붙은 콜 2건이 있어야 한다 (`seed()` 가 확인한다).
 *    기본은 `local.db` 다. 콜 목록을 비웠을 때(`reset:calls`) 씨앗이 사라지므로
 *    `SCENARIO_SEED=smoke-mode.db pnpm scenario` 처럼 다른 사본을 줄 수 있다.
 *    🔴 읽기만 한다 — 실제로 도는 DB 는 언제나 `scen.db` 사본이다.
 */
const SEED = process.env.SCENARIO_SEED || 'local.db';

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
    const src = join(SERVER, SEED);
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
        console.error(`🔴 좌표가 붙은 콜이 2건 미만이라 시나리오를 못 돌립니다 (씨앗: ${SEED}).`);
        console.error('   이 검사는 **실제 콜을 씨앗으로** 씁니다 —');
        console.error('   콜 목록을 지우면 씨앗이 사라져 돌지 않습니다.');
        console.error('   콜을 한두 건 잡아 상·하차 좌표가 붙은 뒤 다시 돌리거나,');
        console.error('   씨앗이 남아 있는 사본을 주세요 — 예: SCENARIO_SEED=smoke-mode.db pnpm scenario');
        process.exit(1);
    }

    const now = new Date();
    const iso = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    // 나머지는 과거로 밀어 간섭을 없앤다
    c.prepare(`UPDATE orders SET timestamp = '2020-01-01T00:00:00Z', status = 'ORDER_RELEASED_BY_ME'`).run();
    // 🔄 새 장부(여섯 단계 행)를 비운다 — 씨앗 콜의 지난 리허설 이력이 남으면
    //    첫 refresh 부터 index 5 로 시작해 6단계 검사가 통째로 무너진다
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
     * 그러면 제품이 깨진 줄 알고 뒤지게 된다.
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
    s.on('filter-init', d => { st.filter = d.activeFilter; st.base = d.baseFilter ?? st.base; st.phases = d.phaseSettings ?? st.phases; });
    s.on('filter-updated', d => {                                   // 🔴 -updated 다. -update 아니다
        st.filter = d.activeFilter ?? d;
        st.base = d.baseFilter ?? st.base;   // 💾 평소값 — «두 그릇» 검사가 본다
        st.phases = d.phaseSettings ?? st.phases;
    });
    s.on('sync-active-orders', d => { st.active = d.active || []; st.terminated = d.terminated || []; });
    // 장부 이벤트는 `steps-synced` 하나를 듣고, reports/milestones 모양은 아래에서 파생한다
    s.on('steps-synced', d => st.steps.set(d.orderId, d.steps || []));
    s.on('cargo-mismatch', m => st.mismatch.push(m));
    s.on('stale-orders-dropped', d => st.stale = d);
    s.on('handler-error', e => st.errors.push(e));
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
     * 고정 대기(`fire(); await wait(700)`)는 서버가 그 안에 처리하지 못하면 아직 안 바뀐 값을 읽어
     * **멀쩡한 제품이 간헐적으로 실패**한다. 간헐 실패는 그 자체보다 **"또 플레이키겠지" 하고 진짜 결함을 넘기게 만드는 것**이 더 나쁘다.
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
     * 여섯 단계를 **기사님 버튼 길**(`report-milestone`)로 넘긴다.
     * GPS 로 찍히는 도착(통과 속도 · 정차 · 1회 발화 · 근접 예고)은 `pnpm drive` 와 `gpsArrival.test.ts` 몫이다.
     */
    const steps = [
        ['상차지 통화', () => s.emit('save-cargo-report', { orderId: main, stopType: 'pickup', kind: 'DECLARED', unit: '라면박스', quantity: 2, handling: '수작업' })],
        ['하차지 통화', () => s.emit('save-cargo-report', { orderId: main, stopType: 'dropoff', kind: 'DECLARED', handling: '지게차' })],
        ['상차지 도착', () => s.emit('report-milestone', { orderId: main, milestone: 'ARRIVED_PICKUP' })],
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
    // 정산은 원천인 장부(orders)를 직접 본다
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
    //    멀쩡한 제품을 두 번 실패로 잡았다. 남은 활성 콜 수를 함께 찍는다.
    await wait(1500);
    console.log('\n═══ 모든 콜을 끝낸 뒤 필터 복귀 ═══');
    check('첫짐 탐색으로 돌아간다', st.filter?.dispatchPhase === 'STANDBY',
        `phase=${st.filter?.dispatchPhase} · 남은 활성 ${st.active.length}건`);
    check('합짐 모드가 꺼진다', st.filter?.isSharedMode === false);
    check('빈 차이므로 적재 신뢰도가 CONFIRMED', st.filter?.capacityConfidence === 'CONFIRMED',
        JSON.stringify(st.filter?.allowedVehicleTypes));

    /**
     * ═══ 국면별 필터 설정 ═══
     *
     * 기사님: *"첫짐 도착반경 5km 로 콜 잡기하다 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
     *
     * 여기서만 잡히는 결함: 저장은 됐는데 **국면이 바뀌어도 안 꺼내 쓰는** 경우.
     * `tsc` 도 `jest` 도 통과한다 — 값이 흐르는지는 실제로 돌려 봐야 안다.
     */
    /**
     * 타겟 자동 순환이 사이클 종료 때 복귀를 미리 눌러 뒀을 수 있다.
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

    /**
     * 🔴 **서버가 안 받는 이벤트를 쏘는 검사는 두지 않는다** — 늘 빨간불이면 다른 진짜 빨간불이 묻힌다.
     *
     *    지금 규칙을 묻는다 (client-app CLAUDE.md «두 그릇»):
     *    🔍 필터에서 손대면 `activeFilter`(오늘만 · 자정에 되돌아감) · 💾 서버 저장(`saveAsDefault`)이면 `baseFilter` 까지.
     */
    console.log('\n═══ 필터 두 그릇 — 오늘만 · 💾 서버 저장 ═══');
    const baseRadius = st.base?.destinationRadiusKm;
    check('평소값(baseFilter)을 받았다 — 없으면 아래 «그대로다»가 헛돈다', typeof baseRadius === 'number', `평소 하차 반경=${baseRadius}`);
    const todayRadius = (typeof baseRadius === 'number' ? baseRadius : (st.filter?.destinationRadiusKm ?? 10)) + 3;

    // ① 오늘만 바꾸면 지금 필터에 바로 적용된다
    s.emit('update-filter', { destinationRadiusKm: todayRadius });
    check('🔍 오늘만 바꾸면 지금 필터에 바로 적용된다',
        await untilFilter(() => st.filter?.destinationRadiusKm === todayRadius),
        `하차 반경=${st.filter?.destinationRadiusKm}`);
    // ② 평소값은 그대로다 — 자정에 여기로 돌아온다
    check('🔍 오늘만 바꾸면 평소값(baseFilter)은 그대로다',
        typeof baseRadius === 'number' && st.base?.destinationRadiusKm === baseRadius,
        `평소 하차 반경=${st.base?.destinationRadiusKm} (전 ${baseRadius})`);
    // ③ 💾 서버 저장이면 평소값까지 바뀐다
    s.emit('update-filter', { destinationRadiusKm: todayRadius, saveAsDefault: true });
    check('💾 서버 저장이면 평소값(baseFilter)까지 바뀐다',
        await untilFilter(() => st.base?.destinationRadiusKm === todayRadius),
        `평소 하차 반경=${st.base?.destinationRadiusKm}`);
    // ④ 되돌려 둔다 — 뒤 검사가 원래 필터 위에서 돈다
    if (typeof baseRadius === 'number') {
        s.emit('update-filter', { destinationRadiusKm: baseRadius, saveAsDefault: true });
        check('평소값을 되돌렸다 — 뒤 검사는 원래 필터 위에서 돈다',
            await untilFilter(() => st.base?.destinationRadiusKm === baseRadius && st.filter?.destinationRadiusKm === baseRadius),
            `하차 반경=${st.filter?.destinationRadiusKm} · 평소=${st.base?.destinationRadiusKm}`);
    }

    // ⑤ 단가표는 할인율에서 파생된다 (§2-1) — 두 곳에서 만들지 않는다
    check('할인율이 바뀌면 차종별 단가표가 따라 바뀐다',
        !!st.filter?.ratePerKm && Object.keys(st.filter.ratePerKm).length > 0,
        JSON.stringify(st.filter?.ratePerKm));

    /* 🧭 궤적(콜·구간이 붙는가)은 `pnpm drive` 가 빈 DB 에서 본다 — 여기서 세면 씨앗 DB 의 옛 궤적까지 센다 */

    console.log('\n═══ 전체 ═══');
    check('서버 오류(handler-error) 0건', st.errors.length === 0,
        st.errors.length ? JSON.stringify(st.errors.slice(0, 2)) : '');

    s.close();
}

// ─────────────────────────── 장부 검사 ───────────────────────────
/**
 * 🔴 **L3.5 — "남은 것"을 본다**
 *
 * 지키는 사고: `targetApp` 이 **전부 NULL** 로 저장되는데 `tsc`·`jest`·`scenario`·`audit` 이 **전부 통과**한다.
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
        /* 🔴 우회 로그인(`/api/auth/bypass`)과 **같은 사용자**의 기기 — 기기가 둘이면 `LIMIT 1` 이 남의 기기를 집어
              상세는 그 사람 세션으로, 결재는 로그인한 세션으로 갈라진다 */
        dev = c.prepare(`SELECT device_id FROM user_devices WHERE user_id = (SELECT id FROM users LIMIT 1) LIMIT 1`).get();
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
     * 🔴 **상세 화면 원문(rawText)을 함께 태운다**.
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
     * (`targetApp` 처럼 코드도 있고 타입도 맞는데 값이 안 들어가는 것)
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
     * ⚠️ 판정의 축(운행시간 · 단가)으로 점수를 재현하는 검사는 축이 바뀌면 없어진 칸을 읽어 터진다.
     *    그래서 축이 바뀌어도 참인 것만 본다 — 점수와 색의 관계는 축과 무관하다.
     */
    const ext = row.kakaoTimeExt || '';
    const mScore = /· (\d+)점/.exec(ext);
    const mColor = /'(꿀|보통|똥|사고)'/.exec(ext);
    if (mScore && mColor && mColor[1] === '사고') {
        /* 🔴 «사고»는 점수와 무관한 색이다 — 잡으면 안 되는 사실(등 뒤 상차 · 굳힌 약속 깨짐 · 잴 수 없음)이
           점수를 덮은 것이라 «점수면 이 색» 대조가 성립하지 않는다. 씨앗 DB 의 목적지·위치에 따라
           첫 콜이 사고가 될 수 있다 (목적지 김포 · 집 주소에서 대전 콜 = 등 뒤 상차). 문구가 색과 점수를
           함께 적었는지만 본다 */
        check('첫짐 문구에 색과 점수가 함께 적힌다', true, `사고 — ${mScore[1]}점 (사고는 점수와 무관한 색)`);
    } else if (mScore && mColor) {
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
     * 🔴 지키는 사고: 안전취소가 **한 건도 저장되지 않는 것.**
     *    KEEP 전에는 행이 없는데 저장 코드가 `UPDATE` 라 0행에 적용되고 조용히 끝난다.
     *    화면(취소 탭)에는 보이는데 그건 **세션 메모리**라, 서버를 재시작하면 사라진다.
     *    배차망 취소 횟수(10회)를 세려면 반드시 장부에 있어야 한다.
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
     * 🔴 지키는 사고: 콜이 "그냥 사라진다." 앱이 확정 클릭 뒤 곧 리스트 화면으로 이탈하면 서버의 화면 이탈 감지가
     *    forceCancelEvaluatingOrder 로 지우는데, **이 경로가 DB 를 거치지 않으면** 결재 취소(②-2)와 같은 클래스의 구멍이다.
     *    안전취소는 배차망 취소 횟수(10회)에 들어가므로 한 건도 새면 안 된다.
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
     * (첫짐 8건이 전부 '똥'. 기준을 반대로 크게 올려 전부 '꿀' 이 되는 것도 같은 실패다)
     */
    {
        const c = new Database(dbPath, { readonly: true });
        const marks = c.prepare(`SELECT kakaoTimeExt FROM orders WHERE kakaoTimeExt LIKE '추천거리%'`)
            .all().map(r => (/'(꿀|보통|똥)'/.exec(r.kakaoTimeExt) || [])[1]).filter(Boolean);
        c.close();
        const uniq = [...new Set(marks)];
        const tally = uniq.map(u => `${u} ${marks.filter(m => m === u).length}`).join(' · ');
        /**
         * ⚠️ "전부 꿀"은 실패가 아니다 — 앱 필터가
         *    `요금 ≥ 거리 × 단가` 로 하한을 이미 걸렀으니 잡힌 콜이 꿀로 몰리는 건 설계다.
         *    이 검사가 지키는 사고는 그 반대다: 기준이 틀려 **잡은 콜이 전부 똥**으로 뜨던 것
         *    (예: 100,000원짜리가 0점으로 전부 똥).
         */
        check('첫짐 판정이 잡은 콜을 전부 똥으로 만들지 않는다',
            !(marks.length >= 3 && uniq.length === 1 && uniq[0] === '똥'),
            marks.length ? tally : '판정된 첫짐이 없다');
    }
}

// ─────────────────────────── 진입 ───────────────────────────
let proc;
try {
    const ids = await seed();
    proc = await boot();
    await run(ids);
    await ledger();
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
 * 🔴 **L3 — 실제로 돈 서버의 로그로 확인한다**
 *
 * 규칙 테스트(L1)는 코드 *모양*만 보고, 값 테스트(L2)는 순수 함수만 본다.
 * *"진짜 서버가 카카오를 부를 때도 이미 상차한 콜의 상차지를 뺐는가"* 는 둘 다 증명 못 한다.
 *
 * **서버 로그 파일**이 그 자리를 메운다 — 시나리오 서버는
 * `ORDER_PICKED_UP` 콜을 심어 두고 실제 카카오 경로를 계산하므로, 그 흔적이 로그에 남는다.
 *
 * 이 검사가 없으면 `OrderEvaluator` 손조립 같은 결함을 놓친다 — tsc·jest·audit 은 전부 통과한다.
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

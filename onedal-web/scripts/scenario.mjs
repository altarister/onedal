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
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
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
    const p = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: SERVER, env: { ...process.env, DB_FILE: DB, PORT: String(PORT) }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i++) {
        await wait(1000);
        try {
            const r = await fetch(`http://localhost:${PORT}/api/health`);
            const h = await r.json();
            // 무엇이 실제로 돌고 있는지 매번 확인한다 — 옛 서버를 붙잡고 오진한 적이 있다
            console.log(`🚀 서버 기동 · bootedAt=${h.bootedAt}\n`);
            return p;
        } catch { /* 아직 */ }
    }
    p.kill('SIGKILL');
    throw new Error('서버가 40초 안에 뜨지 않았습니다');
}

const token = async () => (await (await fetch(`http://localhost:${PORT}/api/auth/bypass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
})).json()).accessToken;

function connect(tok) {
    const s = io(`http://localhost:${PORT}`, { auth: { token: tok }, transports: ['websocket'] });
    const st = { filter: null, active: [], terminated: [], reports: new Map(),
                 milestones: new Map(), mismatch: [], settle: new Map(), errors: [], stale: null };
    s.on('filter-init', d => st.filter = d.activeFilter);
    s.on('filter-updated', d => st.filter = d.activeFilter ?? d);   // 🔴 -updated 다. -update 아니다
    s.on('sync-active-orders', d => { st.active = d.active || []; st.terminated = d.terminated || []; });
    s.on('cargo-report-saved', d => st.reports.set(d.orderId, d.reports || []));
    s.on('milestone-log', d => st.milestones.set(d.orderId, d.milestones || []));
    s.on('cargo-mismatch', m => st.mismatch.push(m));
    s.on('settlement-updated', d => st.settle.set(d.orderId, d));
    s.on('stale-orders-dropped', d => st.stale = d);
    s.on('handler-error', e => st.errors.push(e));
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
        fire(); await wait(700);
        cur = await refresh(main);
        const after = deriveIndex(cur.ms, cur.rp);
        check(`${name} → ${after >= 6 ? '운행 완료' : STEPS[after]}`, after === before + 1, `index ${before}→${after}`);
    }

    console.log('\n═══ 멱등성 · 순서 어긋남 ═══');
    s.emit('report-milestone', { orderId: main, milestone: 'DELIVERED' }); await wait(600);
    s.emit('report-milestone', { orderId: main, milestone: 'ARRIVED_PICKUP' }); await wait(800);
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

const failed = results.filter(r => !r.ok);
console.log(`\n${'─'.repeat(52)}`);
console.log(`검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
if (failed.length) {
    console.log(`\n🔴 실패:\n${failed.map(f => `   · ${f.name}`).join('\n')}`);
    process.exit(1);
}
console.log('\n✅ 시나리오 이상 없음');

// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { birthFirstStep, bridgeCargoReport, stepsView } from '../../src/services/stepSeeder';
import { saveCargoReport } from '../../src/services/cargoReport';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📞 **통화 도우미 — 관리자가 기사 콜에 통화 결과를 적는다** (reviews/29 5단계 · onedal-1f «가»).
 * - 적는 길은 하나 — saveCargoReport(driverId, orderId, report, writerId). 기사 소켓과 운영센터 문이 같이 부른다
 * - 🔴 기사 흐름은 그대로 — 같은 입력이면 옛 길(bridgeCargoReport)과 같은 단계 행이 된다
 * - 관리자는 통화 신고(DECLARED)만 · 현장 실측(ACTUAL)은 현장 기사만 · 단계 행 written_by 에 적은 사람 · 나중 것이 이긴다
 * - 운영센터 /calls 는 KEEP 한 진행 중 콜만(미리보기는 orders 에 없다) · 🟡 통화 필요가 위
 */
const D = 'test-call-driver', A = 'test-call-admin';
const O1 = 'TEST-CALL-1', O2 = 'TEST-CALL-2', O3 = 'TEST-CALL-3', ODONE = 'TEST-CALL-DONE';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (method: string, path: string, { params = {}, body = {}, query = {} }: any = {}) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    let status = 200, out: any;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params, body, query, user: { id: A }, headers: {} }, res);
    return { status, out };
};
const putOrder = (id: string, status = 'ORDER_CONFIRMED') => {
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
    db.prepare(`INSERT INTO orders (id, userId, status, timestamp, capturedAt, pickup, dropoff, fare, vehicleType, totalDistanceKm, totalDurationMin)
        VALUES (?, ?, ?, ?, ?, '경기 광주시 경안동', '경기 파주시 금촌동', 30000, '1t', 87, 129)`).run(id, D, status, new Date().toISOString(), new Date().toISOString());
    birthFirstStep(D, id);
};
const REPORT = { stopType: 'pickup', kind: 'DECLARED', unit: '라면박스', quantity: 4, promisedArrivalAt: new Date(Date.now() + 3600_000).toISOString() };
/** 비교할 단계 행 — 줄 번호 · 콜 id · 기록 · 계획 · 일어난 시각(ms 차이) · 적은 사람은 뺀다 */
const rowOf = (id: string) => {
    const r = { ...db.prepare(`SELECT * FROM step_call_pickup WHERE orderId = ?`).get(id) };
    for (const k of ['id', 'orderId', 'recorded_at', 'written_by', 'occurred_at', 'planned_at']) delete r[k];
    return r;
};

beforeAll(() => {
    for (const [id, name] of [[D, '기사'], [A, '와이프']]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, name);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`UPDATE users SET approved_at = datetime('now') WHERE id = ?`).run(D);
    for (const id of [O1, O2, O3]) putOrder(id);
    putOrder(ODONE, 'ORDER_COMPLETED');
    db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES (?, ?, '똥', 30, '{}', ?)`).run(O3, D, new Date().toISOString());
});
afterAll(() => {
    for (const id of [O1, O2, O3, ODONE]) { db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(id); db.prepare(`DELETE FROM orders WHERE id = ?`).run(id); }
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [D, A]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('📞 기사 흐름은 그대로', () => {
    it('🔴 같은 입력이면 옛 길(bridgeCargoReport)과 새 길(saveCargoReport · 기사가 적음)의 단계 행이 같다', () => {
        bridgeCargoReport(D, O1, REPORT as any);
        saveCargoReport(D, O2, REPORT as any, D, io as any);
        expect(rowOf(O2)).toEqual(rowOf(O1));
        expect(stepsView(O2).map((s: any) => s.row.status)).toEqual(stepsView(O1).map((s: any) => s.row.status));
    });
    it('🔴 기사 소켓 save-cargo-report 는 saveCargoReport 를 기사 자신으로 부른다', () => {
        const sock = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        expect(sock).toMatch(/orderOn\("save-cargo-report"[\s\S]{0,300}saveCargoReport\(userId, orderId, report as CargoReport, userId, io\)/);
    });
});

describe('📞 관리자가 적는다', () => {
    it('🔴 관리자 통화 결과 → 기사 통화 단계가 닫히고 written_by 는 관리자 · 단계 보기에 적은 사람 이름 · 기록 한 줄', async () => {
        const before = db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ?`).get(A).n;
        const r = await call('post', '/calls/:id/note', { params: { id: O3 }, body: { stopType: 'pickup', unit: '라면박스', quantity: 2, promisedArrivalAt: null, memo: '뒷문으로' } });
        expect(r.status).toBe(200);
        expect(r.out.callNote).toMatchObject({ stopType: 'pickup', unit: '라면박스', quantity: 2, memo: '뒷문으로', writtenBy: '와이프' });
        expect(db.prepare(`SELECT written_by, status FROM step_call_pickup WHERE orderId = ?`).get(O3)).toEqual({ written_by: A, status: 'DONE' });
        expect(stepsView(O3).find((s: any) => s.step === 'CALL_PICKUP')?.writtenByName).toBe('와이프');
        expect(db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ?`).get(A).n).toBe(before + 1);
    });
    it('🔴 기사가 다시 적으면 나중 것이 이기고 적은 사람 표시가 사라진다', () => {
        saveCargoReport(D, O3, { ...REPORT, quantity: 5 } as any, D, io as any);
        expect(db.prepare(`SELECT written_by, planned_quantity FROM step_call_pickup WHERE orderId = ?`).get(O3)).toEqual({ written_by: D, planned_quantity: 5 });
        expect(stepsView(O3).find((s: any) => s.step === 'CALL_PICKUP')?.writtenByName).toBeUndefined();
    });
    it('🔴 관리자는 현장 실측 · 건너뜀을 못 적는다', () => {
        expect(() => saveCargoReport(D, O1, { stopType: 'pickup', kind: 'ACTUAL', unit: '라면박스', quantity: 1 } as any, A, io as any)).toThrow();
        expect(() => saveCargoReport(D, O1, { stopType: 'pickup', kind: 'SKIPPED' } as any, A, io as any)).toThrow();
    });
    it('🔴 기사님이 현장에서 잰 값(ACTUAL)이 있으면 관리자 신고는 409 — 나중 것이 이겨도 현장 실측은 못 덮는다', async () => {
        saveCargoReport(D, O2, { stopType: 'pickup', kind: 'ACTUAL', unit: '라면박스', quantity: 6 } as any, D, io as any);
        const r = await call('post', '/calls/:id/note', { params: { id: O2 }, body: { stopType: 'pickup', unit: '라면박스', quantity: 1, promisedArrivalAt: null, memo: '' } });
        expect(r.status).toBe(409);
    });
    it('🔴 시각 칸이 시각이 아니면 장부에 안 들어간다 — 기사 소켓 · 운영센터 문 둘 다(공통 입구 saveCargoReport 한 곳에서 본다)', async () => {
        const before = rowOf(O1);
        for (const k of ['promisedArrivalAt', 'promisedArrivalFromAt', 'onwardDeadlineAt', 'deadlineAt'])
            expect(() => saveCargoReport(D, O1, { ...REPORT, [k]: '시각아님' } as any, D, io as any)).toThrow();
        expect(rowOf(O1)).toEqual(before);
        const r = await call('post', '/calls/:id/note', { params: { id: O1 }, body: { stopType: 'pickup', unit: null, quantity: null, promisedArrivalAt: '시각아님', memo: '' } });
        expect(r.status).toBe(400);
        expect(rowOf(O1)).toEqual(before);
    });
    it('🔴 메모는 200자까지(400)', async () => {
        const r = await call('post', '/calls/:id/note', { params: { id: O1 }, body: { stopType: 'pickup', unit: null, quantity: null, promisedArrivalAt: null, memo: '가'.repeat(201) } });
        expect(r.status).toBe(400);
    });
    it('🔴 없는 콜 · 끝난 콜에는 못 적는다(404)', async () => {
        expect((await call('post', '/calls/:id/note', { params: { id: 'nope' }, body: { stopType: 'pickup', unit: null, quantity: null, promisedArrivalAt: null, memo: '' } })).status).toBe(404);
        expect((await call('post', '/calls/:id/note', { params: { id: ODONE }, body: { stopType: 'pickup', unit: null, quantity: null, promisedArrivalAt: null, memo: '' } })).status).toBe(404);
    });
});

describe('📞 /calls', () => {
    it('🔴 진행 중 KEEP 콜만 · 🟡 통화 필요가 위', async () => {
        db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES (?, ?, '똥', 30, '{}', ?)`).run(O1, D, new Date().toISOString());
        putOrder(O1);   // 통화 단계를 다시 비운다 — 🟡 이고 아직 통화 전
        const r = await call('get', '/calls', { query: { memberId: D } });
        const ids = r.out.map((c: any) => c.id);
        expect(ids).toEqual(expect.arrayContaining([O1, O2, O3]));
        expect(ids).not.toContain(ODONE);
        expect(r.out[0]).toMatchObject({ id: O1, needsCall: true, verdict: '똥' });
        expect(r.out.find((c: any) => c.id === O2).needsCall).toBe(false);
        expect(r.out[0].pickup.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);   // 상차 예정 시각 — 화면이 약속 시각의 기준 날로 쓴다
    });

    /* 🔴 메뉴 숫자(«통화 도우미» 배지 · 폰 폭 ☰ 빨강)는 /calls 와 같은 함수로 센다 — 따로 두면 0 이 남거나 둘이 갈린다 */
    it('🔴 /counts 의 callsTodo = /calls(회원 전부)의 통화 필요 수', async () => {
        const all = await call('get', '/calls');
        const todo = all.out.filter((c: any) => c.needsCall).length;
        expect(todo).toBeGreaterThan(0);
        expect((await call('get', '/counts')).out.callsTodo).toBe(todo);
    });
});

describe('📞 관리자 방 · 결재 · 장부', () => {
    const sock = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
    it('🔴 관리자 방으로 나가는 것은 «이 기사 콜이 바뀌었다» 신호 하나뿐 — 자료는 안 싣는다(허락을 거둬도 방에 남은 소켓이 자료를 못 받게)', () => {
        const { readdirSync, statSync } = require('fs');
        const walk = (d: string): string[] => readdirSync(d).flatMap((f: string) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
        const emits = walk(join(__dirname, '../../src')).filter(f => f.endsWith('.ts'))
            .flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\.to\(["']admin_room["']\)\.emit\(["']([\w-]+)["'],\s*([^)]*)\)/g)].map(m => `${m[1]} ${m[2].trim()}`));
        expect(emits.length).toBeGreaterThan(0);
        expect([...new Set(emits.map(e => e.split(' ')[0]))]).toEqual(['ops-calls-changed']);
        expect(emits.every(e => /\{ memberId: \w+ \}/.test(e))).toBe(true);
    });
    it('🔴 신호는 콜 · 상태 · 판정 색이 바뀔 때만(주행 시각이 1~2초마다 바뀌어도 안 보낸다)', () => {
        expect(sock).toMatch(/opsSig[\s\S]{0,400}io\.of\("\/ops"\)\.to\("admin_room"\)\.emit\("ops-calls-changed"/);
    });
    it('🔴 결재 · 운행 단계는 남의 콜을 버리는 문(orderOn)으로만 받는다', () => {
        expect(sock).toMatch(/orderOn\("decision"/);
        expect(sock).toMatch(/orderOn\("report-milestone"/);
    });
    it('🔴 장부는 기사 아닌 사람이 적은 줄을 «📞 관리자 신고»로 — 실측으로 세지 않는다', () => {
        const ledger = readFileSync(join(__dirname, '../../../scripts/lib/db-ledger.mjs'), 'utf8');
        expect(ledger).toMatch(/written_by/);
        expect(ledger).toMatch(/📞 관리자 신고/);
    });
});

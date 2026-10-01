// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { birthFirstStep, stepsView } from '../../src/services/stepSeeder';
import { saveCargoReport } from '../../src/services/cargoReport';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📵 **상대 취소 — 통화했더니 화주(상대)가 콜을 취소했다** (기사님 «가» 3 · onedal-69 · ⑤-4 다섯).
 *    저장: step_call_pickup · step_call_dropoff 의 counterpart_cancelled_at(그때 시각) · counterpart_cancelled_by(적은 사람).
 *    쓰는 곳은 통화 결과 저장 하나(saveCargoReport — 기사 · 관리자). undefined 는 «그대로»(칸을 안 실은 기사 저장) · false 는 «비움» · true 는 처음 시각을 지킨다.
 *    읽는 곳은 화면 둘(관제웹 단계 보기 · 운영센터 통화 메모)뿐 — 판정 · 안전취소 · 필터 · 자동 동작은 안 읽는다(아래 소스 검사).
 */
const D = 'test-cp-driver', A = 'test-cp-admin', O = 'TEST-CP-1';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const BASE = { stopType: 'pickup', kind: 'DECLARED', unit: '라면박스', quantity: 4 };
const row = () => db.prepare(`SELECT counterpart_cancelled_at a, counterpart_cancelled_by b FROM step_call_pickup WHERE orderId = ?`).get(O);
const note = async (body: any) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === '/calls/:id/note' && l.route.methods.post);
    let status = 200, out: any;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: { id: O }, body, query: {}, user: { id: A }, headers: {} }, res);
    return { status, out };
};
const audits = () => db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ? AND action = '상대 취소 지움'`).get(A).n;

beforeAll(() => {
    for (const [id, name] of [[D, '기사'], [A, '와이프']]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, name);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`UPDATE users SET approved_at = datetime('now') WHERE id = ?`).run(D);
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(O);
    db.prepare(`INSERT INTO orders (id, userId, status, timestamp, capturedAt, pickup, dropoff, fare, vehicleType) VALUES (?, ?, 'ORDER_CONFIRMED', ?, ?, '경기 광주시 경안동', '경기 파주시 금촌동', 30000, '1t')`)
        .run(O, D, new Date().toISOString(), new Date().toISOString());
    birthFirstStep(D, O);
});
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(O);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [D, A]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('📵 상대 취소 칸', () => {
    it('🔴 기사가 «상대 취소»로 저장하면 시각 · 적은 사람 · 단계 보기에 나온다', () => {
        saveCargoReport(D, O, { ...BASE, counterpartCancelled: true }, D, io);
        expect(row()).toMatchObject({ a: expect.any(String), b: D });
        expect((stepsView(O).find((s: any) => s.step === 'CALL_PICKUP').row as any).counterpart_cancelled_at).toBe(row().a);
    });
    it('🔴 칸을 안 실은 저장(undefined)은 그대로 · 다시 true 여도 처음 시각을 지킨다', () => {
        const first = row().a;
        saveCargoReport(D, O, { ...BASE, quantity: 5 }, D, io);
        expect(row().a).toBe(first);
        saveCargoReport(D, O, { ...BASE, counterpartCancelled: true }, D, io);
        expect(row().a).toBe(first);
    });
    it('🔴 운영센터가 false 로 다시 적으면 비우고 기록 한 줄 · 통화 메모에 취소한 사람 · 시각', async () => {
        const before = audits();
        const r1 = await note({ stopType: 'pickup', unit: '라면박스', quantity: 4, counterpartCancelled: true });
        expect(r1.status).toBe(200);
        expect(r1.out.callNote).toMatchObject({ counterpartCancelledBy: '기사', counterpartCancelledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
        const r2 = await note({ stopType: 'pickup', unit: '라면박스', quantity: 4, counterpartCancelled: false });
        expect(r2.status).toBe(200);
        expect(row()).toMatchObject({ a: null, b: null });
        expect(r2.out.callNote).toMatchObject({ counterpartCancelledAt: null, counterpartCancelledBy: null });
        expect(audits()).toBe(before + 1);
    });
    it('🔴 판정 · 안전취소 · 필터 · 자동 동작은 이 칸을 읽지 않는다 — 화면에만 보이는 사실', () => {
        const src = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8');
        for (const f of ['core/engine/OrderEvaluator.ts', 'state/waits.ts', 'routes/emergency.ts', 'state/filterManager.ts', 'services/dispatchEngine.ts'])
            expect(src(f)).not.toMatch(/counterpart_?[cC]ancelled/);
    });
});

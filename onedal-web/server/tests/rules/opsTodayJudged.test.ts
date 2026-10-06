// @ts-nocheck
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { judgmentRecordOf } from '../../src/core/engine/judgmentRecord';

/**
 * 🧾 **운영센터 회원 상세 — 오늘 판정받은 콜** (reviews/43 · 기사님 «오늘 잡지 않은 콜 · 어떤 필터 · 무슨 색 몇 점»).
 * 판정 표의 오늘 줄 전부를 낸다 — 잡은 콜은 orders 상태와 함께, 안 잡은 미리보기 · 체험은 판정 때 남긴 내용으로,
 * 기록을 남기기 전의 옛 판정은 내용 없이(null). 지어내지 않는다.
 * 못 잡는 것: 화면에 무엇이 그려지나(운영센터 shot 몫) · 폰 필터와 서버 필터의 어긋남.
 */
const M = 'test-judged-member', A = 'test-judged-admin';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (path: string, params: any) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let status = 200, out: any;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params, body: {}, query: {}, user: { id: A }, headers: {} }, res);
    return { status, out };
};
const FILTER = { destinationCity: '이천시', pickupRadiusKm: 12, minFare: 8000, isActive: true, destinationKeywords: ['관고동'] };
const cleanup = () => {
    db.prepare(`DELETE FROM order_judgments WHERE userId = ?`).run(M);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(M);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    db.prepare(`DELETE FROM users WHERE id IN (?, ?)`).run(M, A);
};

describe('운영센터 회원 상세 — 오늘 판정받은 콜', () => {
    beforeAll(() => {
        cleanup();
        db.prepare(`INSERT INTO users (id, google_id, email, name, avatar, role, approved_at) VALUES (?, ?, ?, ?, '', 'USER', datetime('now','localtime'))`)
            .run(M, 'g-judged', 'judged@test', '판정 시험');
        db.prepare(`INSERT INTO users (id, google_id, email, name, avatar, role, approved_at, ops_allowed_at) VALUES (?, ?, ?, ?, '', 'ADMIN', datetime('now'), datetime('now'))`)
            .run(A, 'g-judged-admin', 'judged-admin@test', '관리 시험');
        const now = new Date().toISOString();
        /* 잡은 콜 — orders 행이 있다 */
        db.prepare(`INSERT INTO orders (id, userId, status, timestamp, capturedAt, pickup, dropoff, fare, vehicleType, totalDistanceKm, totalDurationMin)
            VALUES ('TEST-JUDGED-KEEP', ?, 'ORDER_CONFIRMED', ?, ?, '경기 광주시 경안동', '경기 이천시 관고동', 30000, '1t', 30, 40)`).run(M, now, now);
        OrderRepository.saveJudgment('TEST-JUDGED-KEEP', M, { color: '꿀', score: 81, axes: [{ key: 'money', name: '돈', score: 81, raw: '3.0만 ÷ 40분' }], gates: [], tags: [],
            ...judgmentRecordOf({ pickup: '경기 광주시 경안동', dropoff: '경기 이천시 관고동', fare: 30000, targetApp: 'insung' }, FILTER) });
        /* 안 잡은 미리보기 — 판정 표에만 · 판정 때 남긴 내용 */
        OrderRepository.saveJudgment('TEST-JUDGED-PREVIEW', M, { color: '똥', score: 23, axes: [], gates: [], tags: [],
            ...judgmentRecordOf({ pickup: '경기 광주시 광남1동', dropoff: '경기 성남시 중원구 금광1동', fare: 11011, targetApp: 'kakaopicker', isPreview: true }, FILTER) });
        /* 옛 판정 — 기록을 남기기 전(call · filter 없음) · orders 없음 */
        db.prepare(`INSERT INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES ('TEST-JUDGED-OLD', ?, '보통', 50, ?, ?)`)
            .run(M, JSON.stringify({ axes: [], gates: [], tags: [] }), now);
        /* 어제 판정 — 오늘 목록에 안 나온다 */
        db.prepare(`INSERT INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES ('TEST-JUDGED-YESTERDAY', ?, '보통', 50, '{}', ?)`)
            .run(M, new Date(Date.now() - 2 * 86400_000).toISOString());
    });
    afterAll(cleanup);

    it('오늘 줄만 · 잡은 콜은 상태와 함께 · 안 잡은 미리보기는 내용과 필터로 · 옛 판정은 내용 없이', async () => {
        const r = await call('/members/:id', { id: M });
        expect(r.status).toBe(200);
        const byId = Object.fromEntries(r.out.todayJudged.map((j: any) => [j.orderId, j]));
        expect(Object.keys(byId).sort()).toEqual(['TEST-JUDGED-KEEP', 'TEST-JUDGED-OLD', 'TEST-JUDGED-PREVIEW']);

        expect(byId['TEST-JUDGED-KEEP']).toMatchObject({ color: '꿀', score: 81, taken: 'ORDER_CONFIRMED',
            call: { pickup: '경기 광주시 경안동', kind: '콜' }, axes: [{ name: '돈', score: 81, raw: '3.0만 ÷ 40분' }] });
        expect(byId['TEST-JUDGED-PREVIEW']).toMatchObject({ color: '똥', score: 23, taken: null,
            call: { pickup: '경기 광주시 광남1동', fare: 11011, kind: '미리보기' }, filter: { destinationCity: '이천시', dropoffCount: 1 } });
        expect(byId['TEST-JUDGED-OLD']).toMatchObject({ taken: null, call: null, filter: null });
    });
});

describe('운영센터 «버린 콜» — 오늘 것만', () => {
    const { intelRowsOf } = require('../../src/services/intelRows');
    const U = 'test-intel-today';
    beforeAll(() => {
        db.prepare(`DELETE FROM intel WHERE user_id = ?`).run(U);
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, 'g-intel-today', 'intel-today@test', '버린 콜 시험')`).run(U);
        const ins = db.prepare(`INSERT INTO intel (type, pickup, dropoff, fare, timestamp, user_id, targetApp, verdict) VALUES ('INTEL_BULK', ?, '이천 관고', 9000, ?, ?, 'kakaopicker', 'fare')`);
        ins.run('오늘 줄', new Date().toISOString(), U);
        ins.run('그제 줄', new Date(Date.now() - 2 * 86400_000).toISOString(), U);
    });
    afterAll(() => { db.prepare(`DELETE FROM intel WHERE user_id = ?`).run(U); db.prepare(`DELETE FROM users WHERE id = ?`).run(U); });

    it('sinceIso 를 주면 그 뒤 줄만 · 개수도 그 범위로 — 안 주면 지금처럼 전부', () => {
        const { restoreWindow } = require('@onedal/shared');
        const today = intelRowsOf({ userId: U, limit: 40, sinceIso: restoreWindow(Date.now()).todayStartIso });
        expect(today.rows.map((r: any) => r.pickup)).toEqual(['오늘 줄']);
        expect(today.total).toBe(1);
        expect(intelRowsOf({ userId: U, limit: 40 }).total).toBe(2);
    });
});

import db from '../../src/db';

/**
 * 📅🚚 **예약 콜도 이 콜의 단독 배송은 잰다** (reviews/23 B-1 · onedal-1f 대조).
 *
 * 예약 갈래는 오늘 하루(경로 · 경유 · 적재 · 국면)를 안 건드리지만, 단독 배송(상차지 → 하차지)은 **이 콜 자체의 값**이다 —
 * 하차 약속(상차 약속 + 배송 × 150%)의 재료다. 안 재면 배송거리가 없는 콜(픽커)은 하차 약속이 비고,
 * 있는 콜도 «추정»으로 선다.
 */
jest.mock('../../src/services/routeComposer', () => ({
    ...jest.requireActual('../../src/services/routeComposer'),
    measureSoloDelivery: jest.fn(async () => ({ km: 12.3, minutes: 21 })),
}));

import { handleDecision } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

const U = 'test-reserved-solo';
const io = { to: () => ({ emit: () => {} }) } as any;
const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`)
      .run(U, `g-${U}`, 'reserved-solo@test', '예약단독배송검사');
});

afterAll(() => {
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    for (const t of ['user_filters', 'user_filter_phases', 'user_settings', 'user_judgment'])
        try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(U); } catch { /* 없으면 넘어간다 */ }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

it('🔴 예약 KEEP → 단독 배송 칸이 찬다 (메모리 · 장부 둘 다)', async () => {
    const key = process.env.KAKAO_REST_API_KEY;
    process.env.KAKAO_REST_API_KEY = 'test-key';
    try {
        const session = getUserSession(U);
        session.myOrders = [];
        session.reservedOrders = [];
        const o = {
            id: `${U}-tomorrow`, type: 'NEW_ORDER', status: 'ORDER_AWAITING_DECISION',
            pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 관고동', fare: 30000,
            timestamp: todayAt(15), capturedAt: todayAt(15), targetApp: 'kakaopicker', vehicleType: '다마스',
            pickupX: 127.29, pickupY: 37.37, dropoffX: 127.43, dropoffY: 37.28,
            reserved: true, reservedDay: 1, reservedAt: '09:00',
        } as any;
        session.pendingOrdersData.set(o.id, o);

        await handleDecision(U, o.id, 'ORDER_CONFIRMED', io);

        const kept = session.reservedOrders.find(c => c.id === o.id) as any;
        expect(kept?.kakaoSoloDurationMin).toBe(21);
        expect(kept?.kakaoSoloDistanceKm).toBe(12.3);
        const row = db.prepare(`SELECT kakaoSoloDurationMin, kakaoSoloDistanceKm FROM orders WHERE id = ?`).get(o.id) as any;
        expect(row.kakaoSoloDurationMin).toBe(21);
        expect(session.myOrders).toEqual([]);
    } finally {
        if (key === undefined) delete process.env.KAKAO_REST_API_KEY; else process.env.KAKAO_REST_API_KEY = key;
    }
});

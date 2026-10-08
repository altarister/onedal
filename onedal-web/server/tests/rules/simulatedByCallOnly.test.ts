import db from '../../src/db';
import { handleDecision } from '../../src/services/dispatchEngine';
import * as steps from '../../src/services/stepSeeder';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import * as devices from '../../src/state/deviceRegistry';
import { OrderRepository } from '../../src/repositories/OrderRepository';

/**
 * 🐥 **체험인지는 잡을 때 콜에 적힌 값 하나** (D1 ③ · 기사님 «가») — 심사 중에 그 폰을 체험 모드로 바꿔도
 *    진짜로 잡은 콜의 KEEP 은 진짜 KEEP 이다(전에는 결재 순간의 폰 모드로 다시 갈라 SIMULATED_KEEP 이 되고 장부에서 빠졌다).
 */
const U = 'test-sim-by-call', DEV = 'dev-sim-by-call';
const io = { to: () => ({ emit: () => {} }) } as any;

function seed(id: string, isSimulated: boolean) {
    const s = getUserSession(U);
    s.pendingOrdersData.set(id, { id, status: 'ORDER_AWAITING_DECISION', capturedDeviceId: DEV, isSimulated,
        pickup: '경기 광주시 경안동', dropoff: '경기 파주시 금촌동', fare: 30000, vehicleType: '1t', timestamp: new Date().toISOString() } as any);
    s.pendingDecisions.set(id, { action: null, evaluatedAt: Date.now() });
    return s;
}

describe('체험 판정 — 콜에 적힌 값', () => {
    beforeAll(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@t`, '기사');
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'SIMULATION')`).run(U, DEV);   // 폰은 지금 체험 모드
    });
    afterEach(() => clearUserSession(U));

    it('진짜로 잡은 콜 — 폰이 지금 체험이어도 KEEP', async () => {
        const s = seed('real-1', false);
        await handleDecision(U, 'real-1', 'ORDER_CONFIRMED', io);
        expect(s.pendingDecisions.get('real-1')?.action).toBe('KEEP');
    });

    it('대조 — 체험으로 잡은 콜은 SIMULATED_KEEP', async () => {
        const s = seed('sim-1', true);
        await handleDecision(U, 'sim-1', 'ORDER_CONFIRMED', io);
        expect(s.pendingDecisions.get('sim-1')?.action).toBe('SIMULATED_KEEP');
    });

    /* 🐥 연습 KEEP 은 운행으로 올라가지 않는다 — 연습 거절과 같은 끝(SAFE_CANCEL · 장부 · 취소 횟수 없음) (29 P2 ⑤ · 기사님 «가») */
    it('🔴 연습 KEEP — 폰에는 SIMULATED_KEEP · 운행(myOrders)에 없음 · SAFE_CANCEL 로 끝 · 장부 · 취소 횟수 0', async () => {
        const stats = jest.spyOn(devices, 'incrementDeviceStats').mockImplementation(() => {});
        const ledger = jest.spyOn(OrderRepository, 'upsertOrder');
        try {
            const s = seed('sim-2', true);
            await handleDecision(U, 'sim-2', 'ORDER_CONFIRMED', io);
            expect(s.pendingDecisions.get('sim-2')?.action).toBe('SIMULATED_KEEP');
            expect(s.myOrders.some(o => o.id === 'sim-2')).toBe(false);
            expect((s.pendingOrdersData.get('sim-2') as any)?.status).toBe('SAFE_CANCEL');
            expect(ledger).not.toHaveBeenCalled();
            expect(stats).not.toHaveBeenCalled();
        } finally { stats.mockRestore(); ledger.mockRestore(); }
    });

    it('대조 — 진짜 KEEP 은 운행에 올라간다', async () => {
        const s = seed('real-2', false);
        await handleDecision(U, 'real-2', 'ORDER_CONFIRMED', io);
        expect(s.myOrders.some(o => o.id === 'real-2')).toBe(true);
    });

    /* 🌱 단계 행은 장부에 오른 콜(운행 · 예약 보관)에만 낳는다 — 연습 콜은 orders 행이 없어 낳으면 외래 키에 막힌다
          🔴 결재가 어느 길로 오든(소켓 · 서버 안 손 확정 /detail · 인터넷) handleDecision 하나가 낳는다 — 소켓 핸들러에만 붙어 있으면 손 확정 콜은 상차지 도착 때에야 태어났다(70판 R4) */
    describe('KEEP 뒤 단계 출생 — 결재 하나로', () => {
        let birth: jest.SpyInstance;
        beforeEach(() => { birth = jest.spyOn(steps, 'birthFirstStep').mockImplementation(() => undefined as any); });
        afterEach(() => birth.mockRestore());

        it('🔴 연습 KEEP — 단계 출생 0번', async () => {
            seed('sim-3', true);
            await handleDecision(U, 'sim-3', 'ORDER_CONFIRMED', io);
            expect(birth).not.toHaveBeenCalled();
        });
        it('🔴 진짜 KEEP — 결재만으로 한 번(따로 부르지 않아도 · 두 번 아님)', async () => {
            seed('real-3', false);
            await handleDecision(U, 'real-3', 'ORDER_CONFIRMED', io);
            expect(birth).toHaveBeenCalledTimes(1);
            expect(birth.mock.calls[0][1]).toBe('real-3');
        });
        it('🔴 예약 KEEP(내일 콜 · 예약 보관 갈래) — 결재만으로 한 번', async () => {
            const s = seed('resv-3', false);
            Object.assign(s.pendingOrdersData.get('resv-3') as any, { reserved: true, reservedDay: 1, reservedAt: '09:00' });
            await handleDecision(U, 'resv-3', 'ORDER_CONFIRMED', io);
            expect(s.reservedOrders.some(o => o.id === 'resv-3')).toBe(true);
            expect(birth).toHaveBeenCalledTimes(1);
        });
    });
});

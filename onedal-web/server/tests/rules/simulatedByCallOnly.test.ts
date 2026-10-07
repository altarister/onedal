import db from '../../src/db';
import { handleDecision } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

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
});

import * as filterManager from '../../src/state/filterManager';
import { recalculateActiveKakaoRoute } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🗺️ **카카오 키가 없으면 경로 연산만 건너뛴다** — 취소 뒤 그물(하차 · 상차 목록) 다시 세우기와 관제웹 알림(`sync-active-orders`)은 간다.
 *    키를 빈 값으로 넘기는 시험(`pnpm drive e2e`)이 실주행과 같은 길을 타게 — 키가 있는 실서버 길은 그대로.
 * 못 잡는 것: 키가 있을 때 카카오가 실제로 경로를 주는가(drive e2e kakao 몫).
 */
const U = 'test-recalc-nokey';
const sent: string[] = [];
const io = { to: () => ({ emit: (ev: string) => { sent.push(ev); } }) };

describe('🗺️ 남은 콜이 있는데 카카오 키가 없을 때', () => {
    const saved = process.env.KAKAO_REST_API_KEY;
    beforeAll(() => { process.env.KAKAO_REST_API_KEY = ''; });
    afterAll(() => { process.env.KAKAO_REST_API_KEY = saved; clearUserSession(U); jest.restoreAllMocks(); });

    it('그물을 다시 세우고 관제웹에 남은 콜을 알린다', async () => {
        const s = getUserSession(U);
        s.myOrders = [{ id: 'nokey-1', status: 'ORDER_CONFIRMED', type: 'NEW_ORDER', pickup: '경기 광주시 경안동', dropoff: '경기 이천시 신둔면',
            fare: 45000, timestamp: new Date().toISOString(), capturedDeviceId: 'dev-nokey', capturedAt: new Date().toISOString(),
            pickupX: 127.25, pickupY: 37.41, dropoffX: 127.4, dropoffY: 37.3 } as any];
        const net = jest.spyOn(filterManager, 'rebuildNetFilter');
        sent.length = 0;
        await recalculateActiveKakaoRoute(U, io);
        expect(net).toHaveBeenCalledWith(U, io);
        expect(sent).toContain('sync-active-orders');
    });
});

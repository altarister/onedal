import * as filterManager from '../../src/state/filterManager';
import { recalculateActiveKakaoRoute } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🗺️ **합짐 정거장 계획을 못 세워도(좌표가 있는 콜이 없음) 경로 적용만 건너뛴다** — 그물 다시 세우기 · 관제웹 알림(`sync-active-orders`)은 간다 (29 X10).
 *    취소 · 완료 뒤 남은 콜로 경로를 다시 구할 때 — 실주행에서도 나는 길.
 * 못 잡는 것: 카카오가 `null` 이 아니라 빈 선을 주는 경우(이 검사는 정거장 계획 `null` 길만 본다).
 */
const U = 'test-recalc-noplan';
const sent: string[] = [];
const io = { to: () => ({ emit: (ev: string) => { sent.push(ev); } }) };
const call = (id: string) => ({ id, status: 'ORDER_CONFIRMED', type: 'NEW_ORDER', pickup: '경기 광주시 경안동', dropoff: '경기 이천시 신둔면',
    fare: 45000, timestamp: new Date().toISOString(), capturedDeviceId: 'dev-noplan', capturedAt: new Date().toISOString() } as any);

describe('🗺️ 남은 콜 둘 — 합짐 정거장 계획을 못 세울 때', () => {
    const saved = process.env.KAKAO_REST_API_KEY;
    beforeAll(() => { process.env.KAKAO_REST_API_KEY = 'test-key-not-called'; });
    afterAll(() => { process.env.KAKAO_REST_API_KEY = saved; clearUserSession(U); jest.restoreAllMocks(); });

    it('그물을 다시 세우고 관제웹에 남은 콜을 알린다', async () => {
        getUserSession(U).myOrders = [call('noplan-1'), call('noplan-2')];   // 둘 다 좌표 없음 → 정거장 계획 없음
        const net = jest.spyOn(filterManager, 'rebuildNetFilter');
        sent.length = 0;
        await recalculateActiveKakaoRoute(U, io);
        expect(net).toHaveBeenCalledWith(U, io);
        expect(sent).toContain('sync-active-orders');
    });
});

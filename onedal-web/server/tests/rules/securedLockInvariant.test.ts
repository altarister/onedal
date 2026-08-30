import { getUserSession } from '../../src/state/userSessionStore';
import { updateActiveFilter } from '../../src/state/filterManager';

/**
 * 🧪 #80 — **콜을 보유한 채 사이클이 깨지면 콜 잡기가 영영 잠긴다** (2026-08-30)
 *
 * 실측 (7지점 6판 · 서버 로그가 그대로 증거):
 *   16:22:20  보유 0건에서 강제 정리 → 불변식 발동, 콜 잡기 재개 ✅
 *   16:23:19  01·03을 KEEP 으로 보유한 채 05 강제 정리 → **불변식 침묵** ✗
 *             이후 06·07이 «평가 보류»만 반복 — 판이 통째로 멈췄다
 *
 * 뿌리: KEEP 은 콜을 심사 캐시(`pendingOrdersData`)에 **일부러 남긴다**
 * (dispatchEngine 승격 덮어쓰기 — 롤백 방지). 그런데 불변식은 그 캐시에서
 * «끝나지 않은 콜»(`!isTerminal`)을 세니, 보유 중인 확정 콜이 «선점 중»으로
 * 오인된다. 세어야 할 것은 **심사 중(선점~결재 사이)** 뿐이다 — 확정 콜은
 * 끝나지도 않았지만 선점 중도 아니다 («한 값이 두 사실» — #76·#78·#79 와 같은 병).
 */
describe('#80 선점 잠금은 심사 중인 콜만 본다', () => {
    const confirmedCall = (id: string) => ({
        id, status: 'ORDER_CONFIRMED',
        pickup: '초월읍', dropoff: '신둔면', fare: 50000,
        capturedAt: new Date().toISOString(),
    });

    it('🔴 확정 콜을 보유 중이어도, 심사 중인 콜이 0건이면 콜 잡기를 되켠다', () => {
        const s = getUserSession('test-80-zombie-lock');
        // 16:23:19 의 세션 그대로: 01·03 은 KEEP 으로 보유 (캐시에도 남는 것이 정상 동작),
        // 깨진 05 는 방금 강제 정리로 캐시에서 빠졌고, 필터는 선점 때 꺼진 채다
        s.myOrders = [confirmedCall('A') as any, confirmedCall('B') as any];
        s.pendingOrdersData.set('A', confirmedCall('A') as any);
        s.pendingOrdersData.set('B', confirmedCall('B') as any);
        s.activeFilter.isActive = false;

        updateActiveFilter('test-80-zombie-lock', {});

        expect(s.activeFilter.isActive).toBe(true);
    });

    it('심사 중(결재 대기)인 콜이 있으면 잠금을 유지한다 — 선점 잠금의 본분', () => {
        const s = getUserSession('test-80-still-judging');
        s.myOrders = [confirmedCall('A') as any];
        s.pendingOrdersData.set('A', confirmedCall('A') as any);
        s.pendingOrdersData.set('C', { ...confirmedCall('C'), status: 'ORDER_AWAITING_DECISION' } as any);
        s.activeFilter.isActive = false;

        updateActiveFilter('test-80-still-judging', {});

        expect(s.activeFilter.isActive).toBe(false);
    });

    it('기사님이 「대기」로 끈 것은 넘지 않는다 (#76 의 경계 그대로)', () => {
        const s = getUserSession('test-80-mode-off');
        s.myOrders = [confirmedCall('A') as any];
        s.pendingOrdersData.set('A', confirmedCall('A') as any);
        s.activeFilter.isActive = false;
        s.filterEnabledByMode = false;

        updateActiveFilter('test-80-mode-off', {});

        expect(s.activeFilter.isActive).toBe(false);
    });
});

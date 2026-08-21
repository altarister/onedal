import { composeMergedRoute, applyRoute } from '../../src/services/routeComposer';
import * as kakao from '../../src/services/kakaoService';

/**
 * 🧭 **구간 주인(sectionStops)은 홀더까지 배달되어야 한다** (버그 대장 #32 재발 · 2026-08-21 모의주행)
 *
 * #32 수리는 두 조각이었다 — ⓐ 경로 연산이 구간마다 주인을 남긴다,
 * ⓑ 내보낼 때 (orderId, stopType) 키로 조회한다. 그런데 ⓐ의 배선이 끊겨 있었다:
 *
 *   composeMergedRoute 는 `result` **바깥**에 sectionStops 를 붙이는데,
 *   모든 호출부는 `applyRoute(holder, result.merged)` — **안쪽**을 넘긴다.
 *   applyRoute 는 받은 것에서 sectionStops 를 찾으니 **항상 undefined** — 홀더에 영영 안 실렸다.
 *
 * 그래서 4콜 모의주행 내내 도착할 때마다
 * `길이 어긋남(주행분 8 ≠ 정거장 7) → 전부 null` — #32 증상이 그대로 재발했다.
 * 기존 검사(routeStopsAlign)는 sectionStops 가 **이미 실린** 홀더로 소비부만 검사했다 —
 * 생산부의 이음새는 아무도 안 보고 있었다.
 */

jest.mock('../../src/services/kakaoService', () => ({
    ...jest.requireActual('../../src/services/kakaoService'),
    calculateDetourRoute: jest.fn(),
}));

const call = (id: string, px: number, dx: number) => ({
    id, status: 'ORDER_CONFIRMED',
    pickupX: px, pickupY: 37.4, dropoffX: dx, dropoffY: 37.7,
}) as any;

describe('경유 계획 = 도착 계획 — 같은 방문 규칙 (버그 대장 #36)', () => {
    const { planMergedStops, planArrivalStops } = require('../../src/services/routeComposer');

    /**
     * 🔴 **다녀온 하차지도 경유지에서 뺀다** (2026-08-21 실측 — #32·#35 계보의 세 번째).
     * planMergedStops 는 다녀온 **상차지만** 빼고 하차지는 항상 넣었다. 하차 완료된
     * 콜(사이클까지 활성)의 하차지를 카카오 경로가 다시 방문했고, planArrivalStops(둘 다
     * 뺌)와 정거장 수가 갈라져 **주행분 전부 null** — 주행중 합짐(11) KEEP 뒤 운행
     * 내내 타임라인이 죽었다. 두 계획의 방문 규칙은 hasVisitedStop 하나여야 한다.
     */
    it('🔴 하차 완료된 콜의 하차지가 카카오 경유에서 빠진다 — 도착 계획과 같은 수', () => {
        const calls = [
            { id: 'DONE', status: 'ORDER_DELIVERED',            // 하차까지 끝난 콜 (사이클 중)
              pickupX: 127.0, pickupY: 37.4, dropoffX: 126.9, dropoffY: 37.5 },
            { id: 'RIDE', status: 'ORDER_PICKED_UP',            // 실은 콜 — 하차만 남음
              pickupX: 127.1, pickupY: 37.4, dropoffX: 126.8, dropoffY: 37.6 },
        ] as any;
        const extra = { id: 'NEW', status: 'ORDER_CONFIRMED',
            pickupX: 127.05, pickupY: 37.45, dropoffX: 126.85, dropoffY: 37.55 } as any;
        const loc = { x: 127.02, y: 37.42 };

        const plan = planMergedStops(calls, extra, loc)!;
        const kakaoStops = plan.waypoints.length + 1;           // 경유 + 최종 목적지
        const arrival = planArrivalStops([...calls, extra], loc);
        expect(kakaoStops).toBe(arrival.length);                 // 두 계획이 같은 정거장 수
        // 하차 완료된 DONE 의 하차지(126.9, 37.5)가 어디에도 없어야 한다
        const all = [...plan.waypoints, plan.mergedDest];
        expect(all.some((w: any) => w.x === 126.9 && w.y === 37.5)).toBe(false);
    });
});

describe('sectionStops 배선 — 경로 연산 → 홀더', () => {
    it('🔴 applyRoute(holder, result.merged) 가 sectionStops 를 홀더에 싣는다', async () => {
        // 2콜 = 정거장 4 (상차 2 + 하차 2) — 카카오가 구간 주행분 4개를 줬다고 치자
        (kakao.calculateDetourRoute as jest.Mock).mockResolvedValue({
            base: { duration: 3600, distance: 50000, polyline: [], sectionDriveMin: [10, 60] },
            merged: { duration: 5400, distance: 70000, polyline: [], sectionDriveMin: [10, 20, 40, 90] },
            timeDiffMin: 30, distDiffKm: '20.0',
        });

        const calls = [call('A', 127.0, 126.9), call('B', 127.1, 126.8)];
        const result = await composeMergedRoute({
            calls, driverLocation: { x: 127.05, y: 37.45 }, priority: 'RECOMMEND', carType: null,
        });

        expect(result).not.toBeNull();
        const holder = calls[1];
        applyRoute(holder, result!.merged as any);     // 실제 호출부와 같은 모양

        expect(holder.sectionStops).toBeDefined();
        expect(holder.sectionStops!.length).toBe(4);
        // 키매칭의 열쇠 — 정거장마다 (orderId, stopType) 이 있어야 한다
        for (const st of holder.sectionStops!) {
            expect(['A', 'B']).toContain(st.orderId);
            expect(['pickup', 'dropoff']).toContain(st.stopType);
        }
    });

    it('길이가 어긋나면 안 싣는다 — 낡은 주인을 엉뚱한 구간에 붙이지 않는다 (규칙 ④)', async () => {
        (kakao.calculateDetourRoute as jest.Mock).mockResolvedValue({
            base: { duration: 3600, distance: 50000, polyline: [], sectionDriveMin: [10, 60] },
            // 구간 주행분이 3개뿐 (연산 이상) — 정거장 4와 어긋난다
            merged: { duration: 5400, distance: 70000, polyline: [], sectionDriveMin: [10, 20, 40] },
            timeDiffMin: 30, distDiffKm: '20.0',
        });

        const calls = [call('A', 127.0, 126.9), call('B', 127.1, 126.8)];
        const result = await composeMergedRoute({
            calls, driverLocation: { x: 127.05, y: 37.45 }, priority: 'RECOMMEND', carType: null,
        });
        const holder = calls[1];
        applyRoute(holder, result!.merged as any);

        expect(holder.sectionStops).toBeUndefined();
        expect(holder.sectionDriveMin).toEqual([10, 20, 40]);   // 주행분 자체는 남는다 — 키매칭만 포기
    });
});

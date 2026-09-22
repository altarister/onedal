import { buildOrderSync } from '../../src/core/helpers';
import { EVALUATING_STATUSES } from '@onedal/shared';

/**
 * 🟡 **심사 중인 콜의 궤적도 화면에 간다** (기사님 실물)
 *
 * 심사 중인 콜도 카카오 궤적(`routePolyline`)을 이미 갖고 있다 — 화면은 그것을 점선으로 그려야 한다.
 *
 * 🔴 뿌리: `routeHolderId` 를 고르는 조건은 **`sectionDriveMin` 이 있는 콜**이다.
 *    그 값은 **KEEP 된 뒤** 타임라인을 짤 때 채워진다 — 심사 중(30초 안)에는 없다.
 *    그 홀더 하나로 지도를 그리면 폴리라인은 있는데 **홀더가 아무도 안 가리켜** 관제웹의 `validPolyline` 이
 *    비고, `PinnedRouteCanvas` 가 «경로가 없을 때만 그리는» 직선 보조선을 그린다.
 *
 * 🔴 **한 값이 두 질문에 답하면 안 된다** (규칙 ⑤-4 ⑤).
 *
 *    | 질문 | 필요한 값 |
 *    |---|---|
 *    | «타임라인을 어느 콜에서 읽나» | `sectionDriveMin` 이 있는 콜 |
 *    | «지도에 어느 궤적을 그리나»   | `routePolyline` 이 있는 콜 |
 *
 *    둘은 대개 같은 콜이지만 **심사 중 30초 동안만 갈린다.**
 *    그 30초가 기사님이 색을 보고 누르는 시간이다.
 *
 * ⚠️ 두 값을 **갈라 둔다** — 타임라인 홀더는 그대로 두고 미리보기 홀더를 따로 낸다.
 *    합치면 심사 중 콜의 빈 `sectionDriveMin` 이 타임라인을 통째로 폴백으로 돌린다.
 */

/** 최소한의 세션 — `buildOrderSync` 가 읽는 칸만 채운다 */
function makeSession(orders: any[]): any {
    return {
        userId: 'test-user',
        myOrders: orders,
        pendingOrdersData: new Map<string, any>(),
        pendingDecisions: new Map<string, any>(),
        activeFilter: { dispatchPhase: 'STANDBY' },
        origin: { x: 127.387, y: 36.377 },
        driverLocationAt: null,
        driverLocationIsFallback: true,
    };
}

/** 심사 중인 콜 — 폴리라인은 있고 주행분(sectionDriveMin)은 아직 없다 */
function evaluatingOrder(id: string) {
    return {
        id,
        status: EVALUATING_STATUSES[0],
        pickup: '대전 서구 갈마동',
        dropoff: '인천 연수구 송도동',
        fare: 99000,
        routePolyline: [{ x: 127.387, y: 36.377 }, { x: 126.639, y: 37.391 }],
        routeComputedAt: new Date().toISOString(),
    };
}

describe('🟡 심사 중인 콜의 궤적', () => {
    /**
     * 🔴 심사 중에는 `routeHolderId` 가 `null` 이라, 미리보기 홀더가 없으면
     *    관제웹이 그릴 궤적을 못 찾는다.
     */
    it('🔴 심사 중이라도 궤적이 있으면 화면이 그릴 홀더를 준다', () => {
        const order = evaluatingOrder('preview-1');
        const sync: any = buildOrderSync(makeSession([order]) as any);

        // 타임라인 홀더는 비어 있는 것이 맞다 — 주행분이 아직 없다
        expect(sync.routeHolderId ?? null).toBeNull();

        // 🟡 그러나 «그릴 궤적»은 있다. 이 값이 없으면 화면은 직선을 그린다.
        expect(sync.previewRouteHolderId).toBe('preview-1');
    });

    it('🟢 궤적이 없는 심사 중 콜은 미리보기 홀더가 되지 않는다 (지어내지 않는다 · 규칙 ④)', () => {
        const order: any = evaluatingOrder('preview-2');
        delete order.routePolyline;
        const sync: any = buildOrderSync(makeSession([order]) as any);
        expect(sync.previewRouteHolderId ?? null).toBeNull();
    });

    /**
     * 🔴 **재기동하면 늘 이 상태가 된다**. `orders` 테이블에
     * `sectionDriveMin` 칸이 없어서, 서버를 껐다 켜면 KEEP 된 콜도 주행분을 잃는다.
     * 궤적은 DB 에 남아 살아 돌아오는데 홀더가 비어 **화면만 직선으로 돌아간다.**
     */
    it('🔴 재기동으로 주행분을 잃은 KEEP 콜도 궤적은 그린다', () => {
        const kept: any = {
            id: 'restored-1',
            status: 'ORDER_CONFIRMED',          // KEEP 된 콜
            pickup: '대전 서구 갈마동',
            dropoff: '인천 연수구 송도동',
            fare: 99000,
            routePolyline: [{ x: 127.387, y: 36.377 }, { x: 126.639, y: 37.391 }],
            routeComputedAt: new Date().toISOString(),
            // sectionDriveMin 없음 — DB 에 칸이 없어 재기동 때 사라졌다
        };
        const sync: any = buildOrderSync(makeSession([kept]) as any);
        expect(sync.routeHolderId ?? null).toBeNull();
        expect(sync.previewRouteHolderId).toBe('restored-1');
    });

    /**
     * 타임라인 홀더는 **그대로 둔다** — 심사 중 콜을 타임라인 홀더로 고르면 빈 `sectionDriveMin` 이
     * 타임라인을 폴백으로 돌린다.
     */
    it('🟢 주행분이 있는 콜이 있으면 타임라인 홀더는 그 콜 그대로다', () => {
        const kept = {
            id: 'kept-1',
            status: 'ORDER_KEPT',
            pickup: '대전 서구 갈마동',
            dropoff: '인천 연수구 송도동',
            fare: 99000,
            sectionDriveMin: [12, 153],
            routePolyline: [{ x: 127.387, y: 36.377 }],
            routeComputedAt: new Date().toISOString(),
        };
        const sync: any = buildOrderSync(makeSession([kept, evaluatingOrder('preview-3')]) as any);
        expect(sync.routeHolderId).toBe('kept-1');
    });
});

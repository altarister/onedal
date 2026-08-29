/**
 * 경로 포인트(지도 핀 렌더링 + ETA 매핑에 사용)
 */
export interface RoutePoint {
    type: string;
    name: string;
    isEvaluating: boolean;
    x?: number;
    y?: number;
    routeId?: string;
}

/*
 * 🧭 여기 있던 TSP(`optimizeRouteOrder`)는 걷어냈다 (기사님 동의 2026-08-19).
 *
 * 서버도 `optimizeWaypoints` 로 방문 순서를 만드는데 관제웹이 **한 벌 더** 만들어
 * 인덱스로 끼워 맞추고 있었다 — 두 순서가 어긋나면 ETA 가 엉뚱한 정거장에 붙는다
 * ("파생값 두 벌" 사고 클래스). 이제 순서는 `sync-active-orders` 의 `routeStops` 가
 * 유일한 원천이고, tests/rules/routeOrderSingleSource.test.ts 가 재발을 막는다.
 */

/**
 * 🪦 **`buildEtaMap` 은 2026-08-30 에 철거됐다** — 칩의 시각을 `deriveRouteTimeline`
 *    하나로 모으면서다. 저건 카카오 `sectionEtas`(경로 계산 시각 + 구간 주행 누적)를
 *    그대로 옮기는 함수라 **정차를 한 번도 안 셌고**, 같은 화면의 시트와 다른 시각을
 *    말했다. 재료가 사라진 게 아니라 **시각을 만드는 자리가 하나로 합쳐진 것**이다.
 */

/**
 * 지도 상의 방문 순번(1, 2, 3...)을 콜 ID별 상/하차지로 매핑
 */
export function buildVisitOrderMap(
    unifiedPoints: RoutePoint[]
): Map<string, { pickupIdx: number; dropoffIdx: number }> {
    const result = new Map<string, { pickupIdx: number; dropoffIdx: number }>();
    unifiedPoints.forEach((pt, idx) => {
        if (!pt.routeId) return;
        const existing = result.get(pt.routeId) || { pickupIdx: 0, dropoffIdx: 0 };
        if (pt.type === '상차') {
            existing.pickupIdx = idx + 1;
        } else {
            existing.dropoffIdx = idx + 1;
        }
        result.set(pt.routeId, existing);
    });
    return result;
}

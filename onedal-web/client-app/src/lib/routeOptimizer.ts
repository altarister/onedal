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
 * 각 콜별 상하차 예상 시간(ETA) 매핑
 * 
 * 카카오 경로 연산 결과의 sectionEtas 배열을 콜 ID별 상/하차 ETA로 변환합니다.
 */
/**
 * 정거장 순서에 도착 예정 시각을 붙인다.
 *
 * 🔴 예전에는 `hasMyLocation` 으로 오프셋을 **추측**했다. 그런데 그 값은
 *    **관제탑 지도의 좌표**(판교 하드코딩 초기값이라 항상 참)였고, 정작 구간 개수를 정하는 건
 *    **서버가 경로를 계산할 때 기사님 현위치를 알았는가** 였다. 둘은 아무 상관이 없다.
 *
 *    게다가 배열이 짧으면 `sectionEtas[length-1]` 로 **마지막 값을 재사용**해서,
 *    상차·하차가 같은 시각으로 찍히고 사이 구간이 `-0분-` 이 됐다.
 *    (`8.5Km` 를 `0분` 에 간다는 뜻이 된다 — 2026-08-10 기사님이 화면에서 발견)
 *
 * 이제 서버가 **정거장 수에 맞춰** 배열을 보내므로 오프셋이 없다.
 * 값이 모자라면 **비워 둔다** — 틀린 시각을 보여주느니 아무것도 안 보여주는 편이 낫다.
 */
export function buildEtaMap(
    unifiedPoints: RoutePoint[],
    sectionEtas: string[],
): Map<string, { pickupEta?: string; dropoffEta?: string }> {
    const result = new Map<string, { pickupEta?: string; dropoffEta?: string }>();

    unifiedPoints.forEach((pt, index) => {
        const eta = sectionEtas[index];
        if (!eta) return;
        if (!pt.routeId) return;
        const existing = result.get(pt.routeId) || {};
        if (pt.type === '상차') result.set(pt.routeId, { ...existing, pickupEta: eta });
        else result.set(pt.routeId, { ...existing, dropoffEta: eta });
    });
    return result;
}

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

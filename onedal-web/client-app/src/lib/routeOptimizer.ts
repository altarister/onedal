import { getDistanceKm } from './routeUtils';

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

/**
 * TSP(Nearest Neighbor) 기반 경로 최적화
 * 
 * 현재 위치에서 가장 가까운 상차지 → 그 다음 가까운 상차지 → ... → 하차지 순으로 정렬합니다.
 * PinnedRoute.tsx에서 인라인으로 있던 로직을 순수 함수로 추출한 것입니다.
 */
export function optimizeRouteOrder(
    rawPickups: RoutePoint[],
    rawDropoffs: RoutePoint[],
    startLocation: { x: number; y: number } | null
): RoutePoint[] {
    const sortedPickups: RoutePoint[] = [];
    let currentLoc = startLocation || (rawPickups[0] ? { x: rawPickups[0].x!, y: rawPickups[0].y! } : { x: 0, y: 0 });

    // 상차지 최적화 (Nearest Neighbor)
    const pPool = [...rawPickups].filter(p => typeof p.x === 'number' && typeof p.y === 'number');
    while (pPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        pPool.forEach((p, idx) => {
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y!, p.x!);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = pPool.splice(bestIdx, 1)[0];
        sortedPickups.push(best);
        currentLoc = { x: best.x!, y: best.y! };
    }

    // 하차지 최적화 (Nearest Neighbor, 마지막 상차지에서 시작)
    const sortedDropoffs: RoutePoint[] = [];
    const dPool = [...rawDropoffs].filter(d => typeof d.x === 'number' && typeof d.y === 'number');
    while (dPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        dPool.forEach((p, idx) => {
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y!, p.x!);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = dPool.splice(bestIdx, 1)[0];
        sortedDropoffs.push(best);
        currentLoc = { x: best.x!, y: best.y! };
    }

    return [...sortedPickups, ...sortedDropoffs];
}

/**
 * 각 콜별 상하차 예상 시간(ETA) 매핑
 * 
 * 카카오 경로 연산 결과의 sectionEtas 배열을 콜 ID별 상/하차 ETA로 변환합니다.
 */
export function buildEtaMap(
    unifiedPoints: RoutePoint[],
    sectionEtas: string[],
    hasMyLocation: boolean
): Map<string, { pickupEta?: string; dropoffEta?: string }> {
    const result = new Map<string, { pickupEta?: string; dropoffEta?: string }>();
    const offset = hasMyLocation ? 0 : 1;

    unifiedPoints.forEach((pt, index) => {
        const eta = sectionEtas[index + offset] || sectionEtas[sectionEtas.length - 1] || "?";
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

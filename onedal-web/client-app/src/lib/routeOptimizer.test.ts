import { describe, it, expect } from 'vitest';
import { buildVisitOrderMap, type RoutePoint } from './routeOptimizer';

// TSP(optimizeRouteOrder) 검사는 함수와 함께 걷어냈다 — 순서의 원천은 서버 routeStops 다 (2026-08-19)

// buildEtaMap 검사도 함수와 함께 걷어냈다 — 칩 시각의 원천은 deriveRouteTimeline 이다 (2026-08-30)

describe('buildVisitOrderMap', () => {
    it('방문 순번이 1-indexed로 정확히 매핑', () => {
        const points: RoutePoint[] = [
            { type: '상차', name: 'P1', isEvaluating: false, routeId: 'o1' },
            { type: '상차', name: 'P2', isEvaluating: false, routeId: 'o2' },
            { type: '하차', name: 'D1', isEvaluating: false, routeId: 'o1' },
            { type: '하차', name: 'D2', isEvaluating: false, routeId: 'o2' },
        ];
        const result = buildVisitOrderMap(points);
        expect(result.get('o1')).toEqual({ pickupIdx: 1, dropoffIdx: 3 });
        expect(result.get('o2')).toEqual({ pickupIdx: 2, dropoffIdx: 4 });
    });
});

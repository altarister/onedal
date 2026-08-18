import { describe, it, expect } from 'vitest';
import { buildEtaMap, buildVisitOrderMap, type RoutePoint } from './routeOptimizer';

// TSP(optimizeRouteOrder) 검사는 함수와 함께 걷어냈다 — 순서의 원천은 서버 routeStops 다 (2026-08-19)

describe('buildEtaMap', () => {
    it('상차/하차 ETA를 정확히 매핑', () => {
        const points: RoutePoint[] = [
            { type: '상차', name: 'P1', isEvaluating: false, routeId: 'o1' },
            { type: '하차', name: 'D1', isEvaluating: false, routeId: 'o1' },
        ];
        const etas = ['10:00', '10:30'];
        const result = buildEtaMap(points, etas);
        expect(result.get('o1')).toEqual({ pickupEta: '10:00', dropoffEta: '10:30' });
    });

    it('🔴 ETA 배열이 부족하면 비워 둔다 (예전에는 마지막 값을 재사용했다)', () => {
        // 예전 폴백은 상차·하차를 같은 시각으로 만들어 사이 구간이 `-0분-` 이 됐다.
        // 8.5km 를 0분에 간다는 뜻이라, 틀린 시각을 보여주느니 비워 두는 편이 낫다.
        const points: RoutePoint[] = [
            { type: '상차', name: 'P1', isEvaluating: false, routeId: 'o1' },
            { type: '상차', name: 'P2', isEvaluating: false, routeId: 'o2' },
            { type: '하차', name: 'D1', isEvaluating: false, routeId: 'o1' },
        ];
        const etas = ['10:00']; // 하나만 있음
        const result = buildEtaMap(points, etas);
        expect(result.get('o1')?.pickupEta).toBe('10:00');
        expect(result.get('o2')).toBeUndefined();      // 없는 값을 지어내지 않는다
        expect(result.get('o1')?.dropoffEta).toBeUndefined();
    });
});

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

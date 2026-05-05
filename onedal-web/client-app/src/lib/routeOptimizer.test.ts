import { describe, it, expect } from 'vitest';
import { optimizeRouteOrder, buildEtaMap, buildVisitOrderMap, type RoutePoint } from './routeOptimizer';

describe('optimizeRouteOrder (TSP Nearest Neighbor)', () => {
    it('가장 가까운 상차지부터 방문', () => {
        const pickups: RoutePoint[] = [
            { type: '상차', name: 'A', isEvaluating: false, x: 127.05, y: 37.5, routeId: 'order-A' },
            { type: '상차', name: 'B', isEvaluating: false, x: 127.01, y: 37.51, routeId: 'order-B' },
        ];
        const dropoffs: RoutePoint[] = [
            { type: '하차', name: 'A하차', isEvaluating: false, x: 127.1, y: 37.6, routeId: 'order-A' },
            { type: '하차', name: 'B하차', isEvaluating: false, x: 127.02, y: 37.52, routeId: 'order-B' },
        ];
        // 현위치가 B에 더 가까우므로 B → A 순서
        const result = optimizeRouteOrder(pickups, dropoffs, { x: 127.0, y: 37.5 });
        expect(result.length).toBe(4);
        expect(result[0].routeId).toBe('order-B'); // 가장 가까운 상차지
        expect(result[1].routeId).toBe('order-A');
    });

    it('좌표 없는 포인트는 제외', () => {
        const pickups: RoutePoint[] = [
            { type: '상차', name: 'A', isEvaluating: false, x: undefined, y: undefined, routeId: 'order-A' },
            { type: '상차', name: 'B', isEvaluating: false, x: 127.01, y: 37.51, routeId: 'order-B' },
        ];
        const dropoffs: RoutePoint[] = [];
        const result = optimizeRouteOrder(pickups, dropoffs, { x: 127.0, y: 37.5 });
        expect(result.length).toBe(1);
        expect(result[0].routeId).toBe('order-B');
    });

    it('빈 배열 입력 시 빈 배열 반환', () => {
        const result = optimizeRouteOrder([], [], null);
        expect(result).toEqual([]);
    });

    it('startLocation이 null이면 첫 번째 포인트를 기준으로 사용', () => {
        const pickups: RoutePoint[] = [
            { type: '상차', name: 'A', isEvaluating: false, x: 127.05, y: 37.5, routeId: 'order-A' },
        ];
        const result = optimizeRouteOrder(pickups, [], null);
        expect(result.length).toBe(1);
        expect(result[0].routeId).toBe('order-A');
    });
});

describe('buildEtaMap', () => {
    it('상차/하차 ETA를 정확히 매핑', () => {
        const points: RoutePoint[] = [
            { type: '상차', name: 'P1', isEvaluating: false, routeId: 'o1' },
            { type: '하차', name: 'D1', isEvaluating: false, routeId: 'o1' },
        ];
        const etas = ['10:00', '10:30'];
        const result = buildEtaMap(points, etas, true);
        expect(result.get('o1')).toEqual({ pickupEta: '10:00', dropoffEta: '10:30' });
    });

    it('ETA 배열이 부족하면 마지막 ETA로 폴백', () => {
        const points: RoutePoint[] = [
            { type: '상차', name: 'P1', isEvaluating: false, routeId: 'o1' },
            { type: '상차', name: 'P2', isEvaluating: false, routeId: 'o2' },
            { type: '하차', name: 'D1', isEvaluating: false, routeId: 'o1' },
        ];
        const etas = ['10:00']; // 하나만 있음
        const result = buildEtaMap(points, etas, true);
        // 세 포인트 모두 같은 ETA로 폴백
        expect(result.get('o2')?.pickupEta).toBe('10:00');
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

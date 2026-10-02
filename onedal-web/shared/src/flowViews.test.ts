import { describe, it, expect } from 'vitest';
import { originsOf, flowsFromOrigin, destinationPairs, hourHeat, type FlowCell } from './flowViews';

/**
 * 📊 **운영센터 «어디로 · 몇 시에» 세 칸의 셈** (reviews/36).
 * ① 콜 많은 순 · 평균은 아는 값으로만 · 모호 · 모름은 순위 밖 ② 갈 콜만 많은 곳보다 돌아올 콜이 있는 곳이 먼저 ③ 나누는 수는 «그 시간에 본 날 수» · 못 본 시간은 없다.
 */
const cell = (from: string, to: string, calls: number, o: Partial<FlowCell> = {}): FlowCell => ({
    weekday: '월', hour: 10, targetApp: 'kakaopicker', from, to, calls,
    fareCalls: calls, fareFirstSum: 0, kmCalls: calls, kmSum: 0, ...o,
});

describe('📊 흐름 칸 셈', () => {
    /* reviews/36 순위 검산 표 그대로 — 광주 → 분당 20건 9,000원 6km · 광주 → 강남 5건 19,000원 25km */
    const cells: FlowCell[] = [
        cell('광주시', '성남시 분당구', 20, { fareFirstSum: 180_000, kmSum: 120 }),
        cell('광주시', '서울 강남구', 5, { fareFirstSum: 95_000, kmSum: 125 }),
        cell('광주시', '모름', 3),
        cell('서울 강남구', '광주시', 1),
    ];

    it('① 콜 많은 순 · 평균 요금 · 평균 거리 · km당 · 모름은 순위 밖에서 따로 센다', () => {
        const r = flowsFromOrigin(cells, '광주시');
        expect(r.rows).toEqual([
            { to: '성남시 분당구', calls: 20, fareAvg: 9000, kmAvg: 6, perKm: 1500 },
            { to: '서울 강남구', calls: 5, fareAvg: 19000, kmAvg: 25, perKm: 760 },
        ]);
        expect(r).toMatchObject({ total: 28, unresolved: 3 });
    });

    it('① 요금 · 거리를 모르는 콜이 섞여도 평균은 아는 콜로만 — 하나도 모르면 null', () => {
        const r = flowsFromOrigin([cell('A', 'B', 4, { fareCalls: 2, fareFirstSum: 20_000, kmCalls: 0, kmSum: 0 })], 'A');
        expect(r.rows[0]).toEqual({ to: 'B', calls: 4, fareAvg: 10000, kmAvg: null, perKm: null });
    });

    it('🔴 ② 갈 콜만 많은 곳(강남 10 · 0)보다 돌아올 콜이 있는 곳(이천 6 · 5)이 먼저', () => {
        const pairs = destinationPairs([
            cell('광주시', '서울 강남구', 10), cell('광주시', '이천시', 6), cell('이천시', '광주시', 5),
            cell('광주시', '광주시', 30), cell('모호', '광주시', 9),
        ], '광주시');
        expect(pairs).toEqual([
            { place: '이천시', go: 6, back: 5, pair: 5 },
            { place: '서울 강남구', go: 10, back: 0, pair: 0 },
        ]);
    });

    it('🔴 ③ 하루 평균은 «그 시간에 본 날 수»로 나눈다 · 본 날이 0 인 시간은 칸이 없다(못 봄)', () => {
        const heat = hourHeat(
            [cell('광주시', '이천시', 6, { weekday: '월', hour: 10 }), cell('광주시', '이천시', 2, { weekday: '화', hour: 14 }), cell('광주시', '서울 강남구', 9)],
            [{ weekday: '월', hour: 10, days: 3 }, { weekday: '화', hour: 14, days: 1 }, { weekday: '수', hour: 9, days: 2 }, { weekday: '목', hour: 9, days: 0 }],
            '광주시', '이천시',
        );
        expect(heat.cells).toEqual([
            { weekday: '월', hour: 10, calls: 6, days: 3, perDay: 2 },
            { weekday: '화', hour: 14, calls: 2, days: 1, perDay: 2 },
            { weekday: '수', hour: 9, calls: 0, days: 2, perDay: 0 },
        ]);
        expect(heat.hours).toEqual([9, 10, 14]);   // 본 날이 0 인 목 9시는 시간 줄에 안 보탠다(수 9시가 있어 9 는 있음)
        expect(heat.max).toBe(2);
    });

    it('출발 후보는 콜 많은 순 · 모호 · 모름은 빠진다', () => {
        expect(originsOf([cell('A', 'B', 2), cell('C', 'B', 5), cell('모름', 'B', 9), cell('A', 'C', 4)]))
            .toEqual([{ origin: 'A', calls: 6 }, { origin: 'C', calls: 5 }]);
    });
});

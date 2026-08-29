import { marginalDetourMin, judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';

/**
 * 🧮 **우회는 한계 비용이다 — 첫짐 대비 누적이 아니다**
 *
 * 🪦 이 파일은 옛 채점기 검사(`dryRunScore.test.ts`)에서 **살려 온 것**이다.
 *    2026-08-29 에 채점기를 `judge` 로 갈아타며 그 스위트를 지웠는데,
 *    한계 비용 계산은 채점기와 **무관하게** 계속 참이라 여기로 옮겼다.
 *
 * 문제지 캘리브레이션 1차 (2026-08-21 16:12 실측): 카카오 `timeDiffMin` 은 첫짐 단독
 * 대비 **누적**이라 16번이 `+189분` 을 뒤집어썼다. 한계(294−251=43)로 재야 맞다.
 */
describe('🧮 한계 우회', () => {
    it('🔴 16번 문제지 — 누적 +189 가 아니라 294−251=43분', () => {
        expect(marginalDetourMin(294, 251, 189)).toBe(43);
    });

    it('첫 합짐(직전 = 첫짐 단독)은 카카오 delta 그대로 — 둘이 같은 값이다', () => {
        expect(marginalDetourMin(213, null, 109)).toBe(109);
    });

    it('🔴 그 한계 비용으로 재면 16번은 꿀이다 (합격선 그대로)', () => {
        const v = judge(CRITERIA, {
            money: { fare: 35_000, extraMinutes: marginalDetourMin(294, 251, 189) + 25 },  // + 정차 25
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
            space: { freePct: 85, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        }, DEFAULT_JUDGMENT);
        expect((v.criteria.find(c => c.key === 'money')!.outcome as any).score).toBe(100);  // 3.1만/h ≥ 목표
        expect(v.color).toBe('꿀');
    });
});

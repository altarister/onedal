import { marginalDetourMin, judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';

/**
 * 🧮 **우회는 한계 비용이다 — 첫짐 대비 누적이 아니다**
 *
 * 🪦 한계 비용 계산은 채점기(`judge`)와 **무관하게** 참이라 따로 검사한다.
 *
 * 카카오 `timeDiffMin` 은 첫짐 단독 대비 **누적**이라 그대로 쓰면
 * 문제지 16번이 `+189분` 을 뒤집어쓴다. 한계(294−251=43)로 재야 맞다.
 */
describe('🧮 한계 우회', () => {
    it('🔴 16번 문제지 — 누적 +189 가 아니라 294−251=43분', () => {
        expect(marginalDetourMin(294, 251, 189)).toBe(43);
    });

    it('첫 합짐(직전 = 첫짐 단독)은 카카오 delta 그대로 — 둘이 같은 값이다', () => {
        expect(marginalDetourMin(213, null, 109)).toBe(109);
    });

    /**
     * 🔴 **무엇을 막나** — 누적으로 재면 이 콜이 죽는다. 그 차이를 숫자로 잠근다.
     *    돈 눈금(두 점 꺾은선: 보통 3만 50점 · 꿀 5만 100점)에서 한계로 재면 52점이다.
     *    눈금이 바뀌어도 **한계가 누적보다 훨씬 높다**는 사실은 안 바뀐다.
     */
    it('🔴 그 한계 비용으로 재면 16번이 살아난다 — 누적으로 재면 똥이다', () => {
        const 잰다 = (extraMinutes: number) => judge(CRITERIA, {
            money: { fare: 35_000, extraMinutes, firstLoad: false },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
            space: { freePct: 85, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        }, DEFAULT_JUDGMENT);

        const 한계 = 잰다(marginalDetourMin(294, 251, 189) + 25);      // 43 + 정차 25 = 68분 → 3.1만/h
        const 누적 = 잰다(189 + 25);                                    // 214분 → 1.0만/h

        /* 68분은 무감점 한계(90분) 안이라 우회 감쇠가 안 붙는다 */
        expect((한계.criteria.find(c => c.key === 'money')!.outcome as any).score).toBe(52);   // 보통 기준선 바로 위
        /* 214분이라 한계(180분)를 넘어 더 깎인다 — 🟡 똥이라는 뜻은 그대로 */
        expect((누적.criteria.find(c => c.key === 'money')!.outcome as any).score).toBe(5);    // 🟡 똥
        expect(한계.color).not.toBe('똥');
    });
});

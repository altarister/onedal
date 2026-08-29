import { judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgeFacts } from '@onedal/shared';
import type { JudgmentConfig } from '@onedal/shared';

/**
 * ⚖️ **판정 기준은 다섯이고, 전부 가중치로 켜고 끈다** (기사님 확정 2026-08-29)
 *
 * 기사님: *"목적 없이 테스트를 만들면 안 돼. 지금 테스트는 최적의 콜을 만들어 주고
 * 모두 최고점이 나오는지 확인이 가능해야 하겠지? 그래서 이 테스트와 관련된 기준만 남기고
 * 나머지 기준을 통과하게 하는 거야."*
 *
 * ── 왜 필요했나 ──
 * 「기존 콜 약속 보존」과 「짐 동승」이 축 밖의 **문지기**였다. 통과/실패만 있고
 * **끌 수가 없어서**, 경로만 보려는 검사에서도 끼어들어 색을 덮었다 —
 * 2026-08-29 실측: **축점 57점(보통)인데 색은 «사고»**.
 *
 * 이제 다섯 다 가중치를 갖는다:
 * ```
 *   ① 순증 대비 우회   ② 버퍼 소비   ③ 적재
 *   ④ 기존 콜 약속 보존  ⑤ 짐 동승          ← 통과 100 · 실패 0
 * ```
 * 🔴 **안전을 뺀 것이 아니다.** 가중치가 0 이 아니면 실패 시 색은 여전히 «사고» 다.
 *    끄는 것은 **명시적으로 0 을 넣었을 때만**이고, 기본값은 1 이라 예전과 같다.
 */
const cfg = (over: Partial<JudgmentConfig['weights']>): JudgmentConfig => ({
    ...DEFAULT_JUDGMENT,
    weights: { ...DEFAULT_JUDGMENT.weights, ...over },
});

/** 합짐 한 건 — 우회는 아주 좋고(만점권), 약속은 깨진다 */
const 우회좋고_약속깨짐: JudgeFacts = {
    money: { fare: 50_000, extraMinutes: 8 },      // 5만 ÷ 8분 = 37.5만/h → 만점
    promise: { hasExistingCalls: true, bufferAfterMin: 30,
               lateStops: [{ label: '첫짐 하차 약속이 12분 깨집니다', lateMinutes: null }] },
    space: { freePct: 100, hasLoad: true },        // 적재도 만점
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
};

describe('판정 기준 다섯 — 가중치로 켜고 끈다', () => {
    it('기본값은 다섯 다 1 이다 (예전 동작과 같다)', () => {
        const w = DEFAULT_JUDGMENT.weights;
        expect([w.revenueDetour, w.bufferCost, w.slots, w.promiseGuard, w.cargoCompat])
            .toEqual([1, 1, 1, 1, 1]);
    });

    it('🔴 약속 보존을 켜 두면 — 다른 축이 만점이어도 색은 «사고»', () => {
        const v = judge(CRITERIA, 우회좋고_약속깨짐, cfg({}));
        expect(v.color).toBe('사고');
        expect((v.criteria.find(a => a.key === 'promise')!.outcome as any).score).toBe(0);
    });

    it('🔴 약속 보존을 끄면(0) — 축에서도 빠지고 색을 덮지도 않는다', () => {
        const v = judge(CRITERIA, 우회좋고_약속깨짐, cfg({ promiseGuard: 0 }));
        expect(v.color).not.toBe('사고');
        // 🔴 **끈 기준도 목록에는 남는다** (2026-08-29 갈아탄 뒤 규칙이 하나로 정리됨) —
        //    화면이 «조건 전수»를 그려야 하므로 «안 봄 (가중치 0)» 으로 보인다.
        //    색에 안 들어갈 뿐이다.
        const 약속줄 = v.criteria.find(a => a.key === 'promise')!;
        expect(약속줄.weight).toBe(0);
        expect(약속줄.outcome).toEqual({ kind: 'nothing', why: '안 봄 (가중치 0)' });
        expect(v.score).toBe(100);   // 나머지 셋이 만점이니 만점이 나와야 한다
    });

    /**
     * 기사님이 말씀하신 «이 테스트와 관련된 기준만 남긴다» 가 실제로 되는지.
     * 경로만 볼 때는 **순증 대비 우회만** 켜고 나머지를 끈다.
     */
    it('🔴 경로만 볼 때 — 우회 하나만 켜면 그 축 점수가 곧 총점이다', () => {
        const 우회보통: JudgeFacts = {
            money: { fare: 50_000, extraMinutes: 100 },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: -50 },
            space: { freePct: 0, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        };
        const v = judge(CRITERIA, 우회보통, cfg({ bufferCost: 0, slots: 0, promiseGuard: 0, cargoCompat: 0 }));
        // ⚠️ 끈 축도 **목록에는 남는다** (숫자는 계속 보인다 — judgment.ts 의 약속).
        //    색에 들어가는 것은 가중치가 있는 축뿐이다.
        const 색에드는축 = v.criteria.filter(a => a.weight > 0 && a.outcome.kind === 'scored');
        expect(색에드는축).toHaveLength(1);
        expect(색에드는축[0].key).toBe('money');
        expect(v.score).toBe((색에드는축[0].outcome as any).score);   // 축이 하나면 그 점수가 총점
    });

    it('최적 경로면 만점이 나온다 — 관련 없는 기준을 끈 상태에서', () => {
        const v = judge(CRITERIA, 우회좋고_약속깨짐, cfg({ bufferCost: 0, slots: 0, promiseGuard: 0, cargoCompat: 0 }));
        expect(v.score).toBe(100);
        expect(v.color).toBe('꿀');
    });

    it('짐 동승도 따로 끈다 — 적재(공간)와 다른 축이다', () => {
        const 동승불가: JudgeFacts = {
            ...우회좋고_약속깨짐,
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
            nature: { conflicts: [['위험물', '식료품']], excludedHits: [], hasLoad: true },
        };
        expect(judge(CRITERIA, 동승불가, cfg({})).color).toBe('사고');
        expect(judge(CRITERIA, 동승불가, cfg({ cargoCompat: 0 })).color).not.toBe('사고');
        // 적재를 꺼도 짐 동승은 살아 있다 — 둘은 다른 축이다
        expect(judge(CRITERIA, 동승불가, cfg({ slots: 0 })).color).toBe('사고');
    });
});

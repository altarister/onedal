import { scoreDryRun, judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { DryRunInput, JudgeFacts } from '@onedal/shared';

/**
 * ⚖️ **옛 채점기와 새 함수를 나란히 놓는다** (2026-08-29 · 5단계)
 *
 * 갈아타기 전에 **같은 상황에서 같은 답이 나오는지** 본다. 2026-08-21 에 지금 채점기로
 * 갈아탈 때와 같은 방식이다 — 나란히 돌려 보고, 다른 곳은 **왜 다른지 적고** 넘어간다.
 *
 * 🔴 **다른 것이 곧 틀린 것은 아니다.** 새 함수는 1~4단계에서 정한 것을 지킨다:
 *   · 못 쟀으면 색을 지어내지 않는다 (3단계)
 *   · 「잴 게 없다」와 「잴 수 없다」를 가른다 (5단계)
 *   옛 채점기는 그 구분이 없어서 **재료가 없으면 그 기준을 통째로 빼고 평균을 올렸다.**
 *   그래서 «다르다»가 나오면 대개 **새 쪽이 더 정직한 것**이다.
 *
 * ══ 지금 다른 곳 둘 (2026-08-29) ══
 *
 * | 상황 | 옛 | 새 | 왜 |
 * |---|---|---|---|
 * | 버퍼를 못 쟀다 | 그 기준을 빼고 평균을 **올린다** | 🔴 「잴 수 없다」 | 3단계에서 정한 것 |
 *  * | 같이 못 싣는 조합 | 기준 **다섯** (통과는 평균에 못 듦) | 기준 **넷** | 통과도 세야 대칭이다 |
 *
 * 🔴 **둘 다 «새 쪽이 더 정직한 것»이다.** 옛 채점기는 재료가 없으면 기준을 통째로 빼서
 *    분모가 줄었고(점수가 올랐다), 점수 없는 사유는 색에 아예 못 들었다.
 *
 * ⚠️ **「버퍼 소비」와 「약속 보존」을 하나로 합쳤다.** 기사님이 *"둘이 어떤 점에서 달라
 *    기준으로 나와 있는 거야"* 라고 물으신 그것이다 — 같은 사실을 두 번 세고 있었다.
 *    그래서 **`bufferCost` 가중치는 갈아탄 뒤 쓸 곳이 없어진다.** 지우는 것은 갈아탄 다음이다.
 *
 * ⚠️ 이 검사는 **갈아탈 때까지만** 산다. 갈아탄 뒤에는 지운다.
 */

const cfg = DEFAULT_JUDGMENT;

interface Case {
    name: string;
    old: DryRunInput;
    now: JudgeFacts;
    /** 다르면 왜 다른지. 없으면 «같아야 한다» */
    diff?: string;
    /** 점수만 다르고 색은 같은 경우 */
    colorSame?: boolean;
}

const 합짐문지기통과 = [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: true, why: null }];

const CASES: Case[] = [
    {
        name: '기사님 실측 합짐 (2026-08-29 16:26) — 4.5만 · 우회 21분 · 버퍼 0 · 자리 70%',
        old: { kind: 'merge', fare: 45_000, detourExtraMin: 21, bufferAfterMin: 0, slotsFreePct: 70,
               gates: 합짐문지기통과, tags: [] },
        now: { money: { fare: 45_000, extraMinutes: 21 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 0 },
               space: { freePct: 70, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
    },
    {
        name: '기사님 실측 첫짐 (같은 날) — 6.2만 · 총 30분',
        old: { kind: 'first', fare: 62_000, totalMinutes: 30, gates: [], tags: [] },
        now: { money: { fare: 62_000, extraMinutes: 30 },
               promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
               space: { freePct: null, hasLoad: false },
               nature: { conflicts: [], excludedHits: [], hasLoad: false } },
    },
    {
        name: '우회가 큰 합짐 — 3.0만 · 우회 103분',
        old: { kind: 'merge', fare: 30_000, detourExtraMin: 103, bufferAfterMin: 10, slotsFreePct: 50,
               gates: 합짐문지기통과, tags: [] },
        now: { money: { fare: 30_000, extraMinutes: 103 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 10 },
               space: { freePct: 50, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
    },
    {
        name: '길목 콜 — 우회 0분',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 0, bufferAfterMin: 30, slotsFreePct: 90,
               gates: 합짐문지기통과, tags: [] },
        now: { money: { fare: 50_000, extraMinutes: 0 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
               space: { freePct: 90, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
    },
    {
        name: '약속이 깨지는 합짐 — 둘 다 🔴 «잡으면 사고»',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 8, bufferAfterMin: 30, slotsFreePct: 100,
               gates: [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: false, why: '첫짐 하차 12분 깨짐' }],
               tags: [] },
        now: { money: { fare: 50_000, extraMinutes: 8 },
               promise: { hasExistingCalls: true, lateStops: [{ label: '첫짐 하차', lateMinutes: 12 }], bufferAfterMin: 30 },
               space: { freePct: 100, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
    },
    {
        name: '같이 못 싣는 조합 — 색은 같고 점수가 다르다',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 20, bufferAfterMin: 20, slotsFreePct: 60,
               gates: [...합짐문지기통과,
                       { key: 'cargoTagCompat', name: '같이 못 실음', pass: false, why: '위험물+식료품' }],
               tags: [] },
        now: { money: { fare: 50_000, extraMinutes: 20 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 20 },
               space: { freePct: 60, hasLoad: true },
               nature: { conflicts: [['위험물', '식료품']], excludedHits: [], hasLoad: true } },
        diff: '기준 **개수**가 다르다. 옛 채점기는 「같이 못 실음」을 **충돌이 있을 때만** 기준으로 '
            + '만들어(통과는 평균에 못 든다) 다섯이 되고, 새 함수는 늘 넷이다. '
            + '68점(옛) vs 60점(새) — 색은 둘 다 🔴 로 같다.',
        colorSame: true,
    },
    {
        name: '🔴 버퍼를 못 쟀다 — 여기서 갈린다',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 20, bufferAfterMin: null, slotsFreePct: 70,
               gates: 합짐문지기통과, tags: [] },
        now: { money: { fare: 50_000, extraMinutes: 20 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: null },
               space: { freePct: 70, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
        diff: '옛 채점기는 **버퍼 기준을 통째로 빼고** 평균을 올린다 (분모가 준다). '
            + '새 함수는 「잴 수 없다」로 보고 🔴 를 낸다 — 3단계에서 정한 그대로다. '
            + '⚠️ **점수는 우연히 둘 다 90 이다** — 색만 다르다. 점수만 대조했으면 못 잡았을 것이다.',
    },
    {
        /**
         * 🔴 **차종 불일치는 둘 다 딱지다** (기사님과 확정 2026-08-29 · 내 첫 제안을 물렸다).
         *    `allowedVehicleTypes` 는 «기사님이 평소 받는 차종 목록»이지 물리 제약이 아니다.
         *    게다가 **앱이 같은 목록으로 이미 거른다** (규칙 ⑤-1).
         */
        name: '차종이 목록에 없다 — 둘 다 색을 안 건드린다',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 20, bufferAfterMin: 20, slotsFreePct: 70,
               gates: 합짐문지기통과, tags: ['차종(1t) 불일치'] },
        now: { money: { fare: 50_000, extraMinutes: 20 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 20 },
               space: { freePct: 70, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true },
               notes: ['차종(1t) 불일치'] },
    },
    {
        /** 🔴 진짜 «못 싣는다»는 자리로 잰다 — 짐이 정원을 넘으면 여유가 음수다 */
        name: '자리가 모자란다 — 「공간」 0점 (덮어쓰지는 않는다)',
        old: { kind: 'merge', fare: 50_000, detourExtraMin: 20, bufferAfterMin: 20, slotsFreePct: -15,
               gates: 합짐문지기통과, tags: [] },
        now: { money: { fare: 50_000, extraMinutes: 20 },
               promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 20 },
               space: { freePct: -15, hasLoad: true },
               nature: { conflicts: [], excludedHits: [], hasLoad: true } },
    },
];

describe('⚖️ 옛 채점기 ↔ 새 함수', () => {
    for (const c of CASES) {
        it(`${c.diff ? '🔀' : '='} ${c.name}`, () => {
            const 옛 = scoreDryRun(c.old, cfg);
            const 새 = judge(CRITERIA, c.now, cfg);
            if (c.diff) {
                // 다르다고 적었으면 정말 달라야 한다 — 색이든 점수든 하나는
                expect(새.color !== 옛.color || 새.score !== 옛.score).toBe(true);
                if (c.colorSame) expect(새.color).toBe(옛.color);
            } else {
                expect(새.color).toBe(옛.color);
                expect(새.score).toBe(옛.score);
            }
        });
    }

    /**
     * 🔴 **다른 경우가 몇 건인지 세어 둔다.** 갈아탈 때 «무엇이 얼마나 바뀌는가»의 답이다.
     *    이 숫자가 조용히 늘면 검사가 터진다 — 모르는 사이에 판정이 움직이지 않게.
     */
    it('다른 곳은 둘뿐이고, 둘 다 이유가 적혀 있다', () => {
        const 다름 = CASES.filter(c => {
            const 옛 = scoreDryRun(c.old, cfg);
            const 새 = judge(CRITERIA, c.now, cfg);
            return 옛.color !== 새.color || 옛.score !== 새.score;
        });
        expect(다름).toHaveLength(2);
        expect(다름.every(c => !!c.diff)).toBe(true);
    });
});

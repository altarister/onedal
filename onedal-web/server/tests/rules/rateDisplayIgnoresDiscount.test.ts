import { readFileSync } from 'fs';
import { join } from 'path';
import { judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import { firstLoadFacts } from '../../src/core/engine/judgeFacts';

/**
 * 💸 **「요율 미달」은 시세로 재서 말한다 — 할인율은 안 본다** (기사님 확정)
 *
 * ── 왜 ──
 * 기사님이 `call_discount_pct` 를 **100** 으로 두고 계신다. 일부러다 — 유튜버 영상으로 문제지를
 * 만드시는데 요금이 낮아 필터를 못 지나가서 문을 열어 두신 것이고, 기사님 말씀은
 * *"그것과 상관없이 점수를 나에게 보여주면 될 거라 생각했어"* 였다.
 *
 * 그 전제는 **맞다** — 점수 축(`criteria.ts`)은 할인율을 한 번도 안 본다. 그런데 **보여 주는
 * 것**이 같이 꺼졌다: 하한이 `요금 × (1 − 할인율/100)` 이라 0원이 되고 「요율 미달」이 영영
 * 안 뜬다. 그 줄이 꺼지면 첫짐하차 1km 옆에 내리는 1만원짜리가 «더 드는 시간 2분 ·
 * 시급 30만/h · 🔵» 로만 보인다 — 실제로는 그 짐을 26km 싣고 간 일이고, 그걸 말해 줄 유일한
 * 자리가 그 줄이다.
 *
 * ── 무엇을 막나 ──
 * 🔴 **점수가 함께 바뀌는 것.** 기사님이 고르신 것은 «표시만»이다. 화면 문구를 시세로 바꾸면서
 *    점수까지 움직이면 그건 기사님이 고르지 않은 쪽이다. 아래 첫 묶음이 그 못이다.
 */

const src = () => readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf-8');

describe('🔴 점수는 할인율과 무관하고, 이 고침으로도 안 바뀐다', () => {
    /**
     * 🔴 **판정 축은 할인율을 아예 모른다** — 이름이 한 번도 안 나온다.
     *    나오기 시작하면 «표시만»이 깨진 것이다.
     */
    it('🔴 판정 축(shared)에 할인율이 없다', () => {
        for (const f of ['criteria.ts', 'judge.ts']) {
            const s = readFileSync(join(__dirname, '../../../shared/src', f), 'utf-8');
            expect(s).not.toMatch(/callDiscountPct|call_discount_pct/);
        }
    });

    /**
     * 🔴 **「돈」의 감점 입력은 할인율 반영본 그대로다** — 미리보기 쪽 `minAcceptableKrw` 다.
     *    여기에 시세(할인율 0)를 넣으면 점수가 바뀐다.
     */
    it('🔴 점수 입력은 rateForScore(할인율 반영본)를 쓴다', () => {
        const s = src();
        expect(s).toMatch(/rateForScore = [\s\S]{0,120}?session\.activeFilter\.callDiscountPct/);
        expect(s).toMatch(/minAcceptableKrw:\s*rateShort\s*\?\s*rateForScore!\.minAcceptable/);
        /* 🔴 표시용 값이 점수 입력으로 새지 않는다 */
        expect(s).not.toMatch(/minAcceptableKrw:[^;\n]*rateForDisplay/);
    });

    /**
     * 🔴 **하한을 넘겨도 색을 덮지 않는다** — 그 값은 「돈」의 배수일 뿐이다.
     *    숫자를 박지 않고 «하한을 넘기면 점수가 내려가되 색이 사고가 되지는 않는다»를 잰다.
     */
    it('🔴 하한 미달은 점수만 깎고 색을 🔴 로 만들지 않는다', () => {
        const 콜 = (minAcceptableKrw: number | null) => judge(CRITERIA, firstLoadFacts({
            fare: 10_000, totalMinutes: 60, minAcceptableKrw,
            excludedHits: [], pickupBackward: null, trapped: null, tags: [],
        }), DEFAULT_JUDGMENT);
        const 없음 = 콜(null), 미달 = 콜(26_000);
        expect(미달.score!).toBeLessThan(없음.score!);
        expect(미달.color).not.toBe('사고');
    });
});

describe('💸 화면 문구는 시세로 잰다', () => {
    /**
     * 🔴 **거절 사유가 기사님이 실제로 보시는 자리다** — 시뮬 인성 콜은 미리보기가 아니라
     *    이 갈래로 온다. 여기가 할인율을 보면 100% 일 때 줄이 통째로 사라진다.
     */
    it('🔴 거절 사유는 할인율 0 으로 다시 재서 만든다', () => {
        const s = src();
        const fn = s.slice(s.indexOf('private runStage3Pricing'));
        expect(fn).toMatch(/this\.loadPricing\(order, userId, 0\)/);
        expect(fn).not.toMatch(/this\.loadPricing\(order, userId, callDiscountPct\)/);
    });

    it('🔴 미리보기 딱지도 시세로 잰다', () => {
        expect(src()).toMatch(/rateForDisplay = [\s\S]{0,120}?this\.loadPricing\(securedOrder, userId, 0\)/);
    });

    /**
     * 🔴 **문구가 «시세»라고 말한다** — 할인율 100% 인 채로 「평소 하한」이라고만 적히면
     *    기사님이 «필터는 열어 뒀는데 왜 미달이지»로 읽으신다.
     */
    /**
     * 🔴 **«얼마나 모자라나»가 앞에 온다** — 기사님이 1~2초에 읽으시는 것은 두 절대값이 아니라
     *    차이다. 그리고 «시세»라는 낱말이 «할인율은 안 봤다»를 대신한다 — 그 말이 없으면
     *    할인율을 열어 두신 기사님이 «필터는 열어 뒀는데 왜 미달이지»로 읽으신다.
     */
    it('🔴 «모자람»이 앞이고 «시세»라 적는다 — 딱지와 거절 사유 두 곳 다', () => {
        const s = src();
        /* 딱지와 거절 사유 두 자리 — 딱지는 줄이 길어 «— 시세»가 다음 줄에 있다 */
        expect((s.match(/만 모자람/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect((s.match(/— 시세 \$\{toManwon/g) ?? []).length).toBeGreaterThanOrEqual(2);
        /* 옛 문구가 남아 있지 않다 */
        expect(s).not.toMatch(/요율 미달 — 시세 하한/);
    });

    /** 🔴 되돌리는 길이 한 곳이다 — 인자를 남겨 두어 0 을 그것으로 바꾸면 옛 셈이다 */
    it('되돌리는 길 — callDiscountPct 인자가 남아 있다', () => {
        expect(src()).toMatch(/runStage3Pricing\([\s\S]{0,200}?callDiscountPct: number \| undefined/);
    });
});

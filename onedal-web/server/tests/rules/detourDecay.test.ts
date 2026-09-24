import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, MoneyFacts } from '@onedal/shared';

/**
 * 🛣️ **긴 우회는 «가는 길»이 아니다 — 시급이 좋아도 값을 깎는다** (기사님 확정)
 *
 * ── 왜 ──
 *
 * 우회 235분(3.9시간)에 15만원인 콜은 시급만 보면 «3.8만/h» 라 보통 위로 올라온다 (쌓인 판정 53건에서 본 모양).
 * 시급만 보면 나쁘지 않다. 문제는 **그게 합짐이 아니라는 것**이다 —
 * 합짐은 «가는 길에 붙이는 것»인데 네 시간 우회는 그 전제가 깨진 것이고, 하루를 통째로 건다.
 *
 * 🔴 **시급 눈금으로는 못 잡는다.** 시급은 «얼마나 버나»를 재고 이 문제는 «이게 합짐인가»를
 *    묻는다. 눈금(`target_hourly_krw`)을 올리면 짧은 콜까지 같이 깎인다.
 *
 * 🔴 **기회비용(요금 − 보통시급×시간)으로는 못 잡는다**: 눈금을 평행이동할 뿐이라
 *    **순위가 그대로**이고, 보통 시급 3만/h 콜이 0점이 된다 — 기존 눈금이 이미 그 몫을 담고 있다.
 *
 * ── 어떻게 ──
 *
 * 시급 점수는 그대로 내고 **우회 시간으로 값을 깎는다**(곱한다). 세 자리가 설정에서 온다.
 *
 * 🔴 **버리지 않는다** (규칙 ①) — 색으로만 말하고 결정은 기사님이 하신다.
 */

const MONEY = CRITERIA.find(c => c.key === 'money')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;   // 무감점 90 · 주의 120 · 한계 180

const score = (fare: number, extraMinutes: number, firstLoad = false): number => {
    const out = MONEY.measure({ fare, extraMinutes, firstLoad } as MoneyFacts as never, cfg);
    if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
    return out.score;
};

/** 같은 시급(6만/h)을 우회 시간만 바꿔 가며 — 시간만이 변수다 */
const 시급6만 = (mins: number) => score(60_000 * (mins / 60), mins);

describe('🛣️ 우회 시간 — 길수록 값을 깎는다', () => {

    /** 🔴 이 검사가 생긴 까닭 */
    it('🔴 우회 235분 15만원은 똥이다 — 그건 가는 길이 아니라 하루를 거는 일이다', () => {
        expect(score(150_000, 235)).toBeLessThan(40);      // color.normalMin
    });

    /** 🔴 수도권에서 1.5시간 합짐은 일상이다 — 실측 117건 중 60~90분이 24건 */
    it('무감점 한계(90분)까지는 시급 그대로다 — 덤은 덤이다', () => {
        expect(시급6만(30)).toBe(시급6만(90));
        expect(시급6만(90)).toBe(100);                      // 6만/h = 꿀 시급
    });

    /**
     * 🔴 **주의 한계에서도 대박 콜은 🔵 를 지킨다** (기사님 확정 · 실측 대조).
     *    절반까지 깎으면 115분 12만원(6.3만/h) 같은 전형적인 대박 합짐이 🟢 로 내려와
     *    «왜 보통이지»가 된다. 어중간한 콜만 내려오게 3/4 로 둔다.
     */
    it('주의 한계(120분)에서 값이 3/4 다 — 대박 콜은 꿀을 지킨다', () => {
        expect(score(200_000, 120)).toBe(75);               // 10만/h 만점 × 0.75
        expect(score(120_000, 115)).toBeGreaterThanOrEqual(70);   // 실측: 6.3만/h 대박 합짐
    });

    it('🔴 한계(180분)를 넘으면 시급과 무관하게 똥이다', () => {
        expect(score(300_000, 181)).toBeLessThan(40);       // 10만/h 인데도
    });

    it('같은 시급이면 우회가 길수록 낮다 — 뒤집히지 않는다', () => {
        const a = 시급6만(90), b = 시급6만(120), c = 시급6만(180), d = 시급6만(240);
        expect(a).toBeGreaterThan(b);
        expect(b).toBeGreaterThan(c);
        expect(c).toBeGreaterThan(d);
    });

    /** 🔴 짧은 콜의 눈금은 그대로다 — 우회 감가가 바꾸는 것은 «긴 우회»뿐이다 */
    it('🔴 보통 시급(3만/h) 짧은 콜은 여전히 50점이다 — 눈금을 안 움직였다', () => {
        expect(score(15_000, 30)).toBe(50);
    });

    it('🔴 첫짐에는 안 깎는다 — 빈 차는 «우회»가 아니라 그 콜 자체의 시간이다', () => {
        /* 🔴 숫자가 아니라 «합짐이면 깎이는 것이 첫짐이면 안 깎인다»를 잰다 (눈금이 바뀌어도 참) */
        expect(score(150_000, 235, true)).toBeGreaterThan(score(150_000, 235, false));
        const out = MONEY.measure({ fare: 150_000, extraMinutes: 235, firstLoad: true } as MoneyFacts as never, cfg);
        expect((out as { why: string }).why).not.toContain('우회');
    });

    /** 세 자리를 기사님이 판정 기준 탭에서 움직인다 (규칙 ⑤-4) */
    it('한계를 늘리면 같은 콜이 살아난다 — 코드에 박혀 있지 않다', () => {
        const 너그럽게: JudgmentConfig = {
            ...cfg, detour: { freeMin: 240, cautionMin: 300, hardMin: 360 },
        };
        const out = MONEY.measure({ fare: 150_000, extraMinutes: 235, firstLoad: false } as never, 너그럽게);
        if (out.kind !== 'scored') throw new Error('점수가 아니다');
        expect(out.score).toBeGreaterThan(score(150_000, 235));
    });

    it('왜 깎였는지 이유에 남는다 — 화면이 말해 준다', () => {
        const out = MONEY.measure({ fare: 150_000, extraMinutes: 235, firstLoad: false } as never, cfg);
        expect(out.why).toMatch(/우회/);
    });
});

/**
 * 📦 **감쇠가 보는 것은 «길을 벗어나는 분»이다 — 상하차 정차는 빼고 본다** (기사님 확정)
 *
 * 기사님: *"갈마에서 상차하고 성거읍 가는 길에 근처 문지동에서 상차 하나만 하면 되는거라.
 * 우회 비용과 시간이 얼마 되지 않아"*
 *
 * ── 왜 ──
 * 갈마동(상차)→성거읍(하차) 을 달리던 중에 문지동(상차)→가수동(하차) 을 끼운 실측 콜이다.
 * 서버가 감쇠에 넘긴 값은 **101분**이었는데 그 속은 이렇게 나뉘어 있었다:
 *
 *   문지동 들르는 비용   22분   ← 이것만이 «우회»다
 *   성거 → 가수 배송     48분   ← 이 콜의 본일이고, 요금이 그 값이다
 *   상하차 정차          31분   ← 「노동강도」가 따로 본다
 *
 * 무감점이 60분이라(기사님 설정) 101분은 값이 83%까지 깎였다 — 가는 길에 하나 끼우는
 * 합짐이 «하루를 거는 콜»로 오해받은 자리다.
 *
 * 🔴 **시급의 분모는 안 건드린다** — 상하차에도 시간을 실제로 쓰니 «얼마 버나»에는 들어야 맞다.
 */
describe('📦 우회 감쇠 — 상하차 정차는 «우회»가 아니다', () => {
    const 점수 = (extraMinutes: number, dwellMinutes?: number): number => {
        const out = MONEY.measure(
            { fare: 39_000, extraMinutes, dwellMinutes, firstLoad: false } as MoneyFacts as never, cfg);
        if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
        return out.score;
    };
    const 왜 = (extraMinutes: number, dwellMinutes?: number): string =>
        MONEY.measure({ fare: 39_000, extraMinutes, dwellMinutes, firstLoad: false } as MoneyFacts as never, cfg).why;

    /** 🔴 이 검사가 생긴 까닭 — 실측 07:20 갈마·문지 합짐 */
    it('🔴 정차를 빼고 보면 같은 콜이 덜 깎인다', () => {
        expect(점수(101, 31)).toBeGreaterThan(점수(101));
    });

    /**
     * 🔴 **숫자를 박지 않는다** — 무감점은 기사님이 판정 기준 탭에서 고치는 값이라(지금 DB 는 60분,
     *    코드 기본값은 90분) 손으로 적으면 기사님이 값을 옮길 때마다 이 검사가 깨진다.
     */
    const { freeMin } = DEFAULT_JUDGMENT.detour;

    it('🔴 정차를 빼서 무감점 안에 들면 한 푼도 안 깎인다', () => {
        /* 정차를 넣으면 무감점 밖(+30분)인데, 빼면 안쪽(−10분)이다 */
        expect(왜(freeMin + 30, 40)).not.toMatch(/우회/);
        expect(왜(freeMin + 30)).toMatch(/우회/);            // 안 빼면 깎인다
    });

    it('🔴 딱지에 적히는 분도 정차를 뺀 값이다 — 기사님이 보시는 숫자가 하루와 맞아야 한다', () => {
        /* 정차를 빼고도 무감점 밖이라 딱지가 적힌다 — 그 분이 «뺀 값»인지를 본다 */
        const 정차 = 30, 우회포함 = freeMin + 60;
        expect(왜(우회포함, 정차)).toContain(`우회 ${우회포함 - 정차}분`);
        expect(왜(우회포함, 정차)).not.toContain(`우회 ${우회포함}분`);
    });

    /** 🔴 정차를 안 실어 주면 지금까지처럼 돈다 — 되돌리는 길 */
    it('정차를 안 넘기면 옛 셈 그대로다', () => {
        expect(점수(101)).toBe(점수(101, 0));
    });

    /** 🔴 **진짜 먼 우회는 여전히 깎인다** — 정차를 빼도 네 시간을 벗어나면 그대로다 */
    it('🔴 정차를 빼고도 긴 우회면 깎인다', () => {
        expect(점수(235 + 30, 30)).toBeLessThan(점수(60, 30));
    });

    /** 🔴 정차가 우회보다 클 수는 없다 — 음수로 뒤집히면 «감쇠 없음»이 아니라 오류다 */
    it('정차가 우회보다 커도 뒤집히지 않는다', () => {
        expect(() => 점수(30, 90)).not.toThrow();
        expect(왜(30, 90)).not.toMatch(/-[0-9]+분/);
    });
});

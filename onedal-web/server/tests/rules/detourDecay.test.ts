import { readFileSync } from 'fs';
import { join } from 'path';
import { CRITERIA, DEFAULT_JUDGMENT, tailSplitOf } from '@onedal/shared';
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

    /**
     * 🔴 이 검사가 생긴 까닭
     *
     * ⚠️ **이 줄은 `offRouteMinutes` 를 안 넘겨 «옛 길»을 잰다** — 실제 서버 경로에서는 그 값이
     *    넘어오므로, 지금 뚫린 자리는 바로 아래 검사가 잠근다.
     */
    it('🔴 우회 235분 15만원은 40점 아래다 — 그건 가는 길이 아니라 하루를 거는 일이다', () => {
        /* 🔴 색이 아니라 **숫자**가 말한다 — 「보통」은 꿀 아래 전부다 (판정 1단계) */
        expect(score(150_000, 235)).toBeLessThan(40);
    });

    /**
     * 🔴 **뚫렸던 자리 — 「지리」가 막았다** (기사님 확정 «나»).
     *
     * 꼬리 배송을 빼는 식에서 꼬리는 «후보 자신의 배송 구간»이라 **배송이 길수록 더 많이 뺀다**:
     *   오송읍 상차(가는 길 · 삽입 15분) → 아주 먼 하차(배송 220분) · 요금 15만
     *   marginal 235 · 꼬리 220 · 벗어남 15 → 감쇠 없음 → 시급 3.8만/h → 🔵 71
     * 그래서 **목적지 쪽 220분과 반대쪽 220분이 같은 점수**였다 — 「돈」은 방향을 모른다.
     *
     * 이제 「지리」가 합짐에도 붙어 방향을 배수로 본다 (`destBonus.test.ts` 의 「합짐도 방향을
     * 본다」). 실측 검산 — 돈 71 · 배수 max 1.0 · min 0.5 · 기사님 DB(무감점 60):
     *   목적지 쪽 +1 → ×1.00 → 71 🔵     (가는 길의 긴 배송은 그대로 통과한다)
     *   옆으로   0 → ×0.75 → 63 🟢
     *   반대쪽  −1 → ×0.50 → 42 🟢     (먼 데로 끌려가는 합짐만 내려온다)
     *
     * 🔴 아래 두 줄은 **「돈」만 놓고 보면 여전히 안 깎인다**는 사실을 잠근다 — 그것이
     *    「지리」가 필요한 까닭이고, 이 검사가 빨간불이 되면 「돈」이 방향을 다시 세는 것이다.
     */
    it('🔴 「돈」만으로는 긴 배송이 꼬리면 안 깎인다 — 그래서 「지리」가 방향을 본다', () => {
        const 꼬리빼기전 = MONEY.measure(
            { fare: 150_000, extraMinutes: 235, firstLoad: false } as MoneyFacts as never, cfg) as { score: number };
        const 꼬리뺀뒤 = MONEY.measure(
            { fare: 150_000, extraMinutes: 235, offRouteMinutes: 15, firstLoad: false } as MoneyFacts as never, cfg) as { score: number };
        expect(꼬리빼기전.score).toBeLessThan(DEFAULT_JUDGMENT.color.normalMin);
        expect(꼬리뺀뒤.score).toBeGreaterThan(DEFAULT_JUDGMENT.color.honeyMin);
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

    it('🔴 한계(180분)를 넘으면 시급과 무관하게 40점 아래다', () => {
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
 * 🛣️ **감쇠가 보는 것은 «길을 벗어나는 분» 하나다** (기사님 확정)
 *
 * 기사님: *"갈마에서 상차하고 성거읍 가는 길에 근처 문지동에서 상차 하나만 하면 되는거라.
 * 우회 비용과 시간이 얼마 되지 않아"*
 *
 * ── 왜 ──
 * 기사님이 직선 예로 못을 박으셨다:
 *
 *   현위치 —10km— 첫짐상차 —5km— 합짐상차 —25km— 첫짐하차 —20km— 합짐하차
 *
 * 모두 직선상에 놓였으니 **한 번도 되돌아가지 않는다 — 우회는 0** 이다. 그런데 늘어난
 * 주행(60 − 40 = 20)은 전부 «첫짐하차 → 합짐하차» 배송이다. 그것을 「우회」라 부르고
 * 벌점을 주면, 가는 길에 하나 끼우는 합짐이 «하루를 거는 콜»로 오해받는다
 * (실측 07:20 — 무감점이 60분인 기사님 설정에서 값이 83%까지 깎였다).
 *
 * ── 어떻게 ──
 * 서버가 병합 경로의 구간에서 이렇게 잰다 (`OrderEvaluator` — 카카오를 한 번도 더 안 부른다):
 *
 *     길을 벗어나는 분 = 늘어난 주행 − 꼬리 배송
 *     꼬리 배송 = 후보 하차가 경로의 **마지막**일 때, 직전 정거장에서 거기까지
 *
 * 기사님 예: 20 − 20 = 0.
 *
 * 🔴 **«후보 상차 이후 주행»을 빼면 안 된다** — 그 구간에는 기존 콜의 하차도 들어 있어
 *    식이 `후보상차누적 − 기존경로` 로 약분되고, 거의 모든 합짐이 0 이 되어 감쇠가 꺼진다.
 *    아래 「옆으로 빠지는 합짐」 검사가 그것을 문다.
 *
 * 🔴 **시급의 분모는 안 건드린다** — 배송에도 상하차에도 시간을 실제로 쓰니 «얼마 버나»에는
 *    들어야 맞다. 여기서 빼는 것은 «이게 가는 길에 붙이는 것인가» 쪽뿐이다.
 * 🔴 **「돈」은 이 값을 스스로 재지 않는다** (규칙 ③) — 경로 구간을 손에 든 서버가 재서 넘긴다.
 */
describe('🛣️ 우회 감쇠 — 배송과 상하차는 «우회»가 아니다', () => {
    const 점수 = (extraMinutes: number, offRouteMinutes?: number): number => {
        const out = MONEY.measure(
            { fare: 39_000, extraMinutes, offRouteMinutes, firstLoad: false } as MoneyFacts as never, cfg);
        if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
        return out.score;
    };
    const 왜 = (extraMinutes: number, offRouteMinutes?: number): string =>
        MONEY.measure({ fare: 39_000, extraMinutes, offRouteMinutes, firstLoad: false } as MoneyFacts as never, cfg).why;

    /**
     * 🔴 **숫자를 박지 않는다** — 무감점은 기사님이 판정 기준 탭에서 고치는 값이라(지금 DB 는 60분,
     *    코드 기본값은 90분) 손으로 적으면 기사님이 값을 옮길 때마다 이 검사가 깨진다.
     */
    const { freeMin } = DEFAULT_JUDGMENT.detour;

    /** 🔴 이 검사가 생긴 까닭 — 기사님 직선 예 */
    it('🔴 직선상에 끼운 합짐은 한 푼도 안 깎인다 — 우회가 0 이다', () => {
        /* 늘어난 주행은 무감점 밖인데, 그 전부가 배송이라 벗어난 분은 0 이다 */
        expect(왜(freeMin + 45, 0)).not.toMatch(/우회/);
        expect(점수(freeMin + 45, 0)).toBeGreaterThan(점수(freeMin + 45));   // 안 넘기면 깎인다
    });

    it('🔴 벗어난 분만 깎는다 — 같은 콜이 덜 깎인다', () => {
        expect(점수(freeMin + 60, 20)).toBeGreaterThan(점수(freeMin + 60));
    });

    it('🔴 딱지에 적히는 분이 «벗어난 분»이다 — 기사님이 보시는 숫자가 하루와 맞아야 한다', () => {
        /* 벗어난 분도 무감점 밖이라 딱지가 적힌다 — 그 숫자가 어느 값인지를 본다 */
        const 벗어남 = freeMin + 30, 늘어난것 = freeMin + 90;
        expect(왜(늘어난것, 벗어남)).toContain(`우회 ${벗어남}분`);
        expect(왜(늘어난것, 벗어남)).not.toContain(`우회 ${늘어난것}분`);
    });

    /** 🔴 안 실어 주면 지금까지처럼 돈다 — 되돌리는 길 (규칙 ⑤-2) */
    it('벗어난 분을 안 넘기면 늘어난 주행을 그대로 본다', () => {
        expect(점수(101)).toBe(점수(101, 101));
    });

    /** 🔴 **진짜 먼 우회는 여전히 깎인다** — 이게 감쇠가 있는 까닭이다 */
    it('🔴 네 시간을 벗어나면 그대로 깎인다', () => {
        expect(점수(300, 235)).toBeLessThan(점수(300, 0));
        expect(점수(300, 235)).toBeLessThan(DEFAULT_JUDGMENT.color.normalMin);
    });

    /** 🔴 벗어난 분이 늘어난 주행보다 클 수는 없지만, 와도 터지지 않는다 */
    it('벗어난 분이 더 커도 뒤집히지 않는다', () => {
        expect(() => 점수(30, 90)).not.toThrow();
        expect(왜(30, 90)).not.toMatch(/-[0-9]+분/);
    });

    /**
     * 🔴 **식이 약분되지 않는지를 경로 숫자로 잠근다.**
     *
     * 「후보 상차 이후 주행을 뺀다」는 식은 `후보상차누적 − 기존경로` 로 약분되어, 왕복 60분을
     * 버리는 경로에서도 0 을 낸다 — 감쇠가 통째로 꺼진다. 꼬리 식은 그것을 잡는다.
     * 여기서는 두 식을 나란히 돌려 **꼬리 식만 맞는 답을 내는지** 본다.
     */
    describe('🔴 경로 숫자로 — 서버가 쓰는 그 함수를 부른다', () => {
        /**
         * 🔴 **산수를 여기서 흉내 내지 않는다** — `tailSplitOf` 는 서버가 실제로 부르는
         *    함수다(`OrderEvaluator`). 두 벌이면 «검사는 맞는데 화면은 틀린» 자리가 생긴다 (규칙 ③).
         *    여기서는 구간 거리를 정거장 배열로 옮겨 그 함수에 그대로 먹인다.
         */
        const 경로 = (구간: number[], 정거장: string[]) => {
            const 누적 = 구간.reduce<number[]>((a, v, i) => [...a, (a[i - 1] ?? 0) + v], []);
            const stops = 정거장.map((n, i) => ({
                orderId: n.startsWith('합짐') ? '후보' : '기존',
                stopType: (n.endsWith('상차') ? 'pickup' : 'dropoff') as 'pickup' | 'dropoff',
                driveMinutes: 누적[i],
            }));
            return { stops, 총: 누적[누적.length - 1] };
        };
        const 벗어남 = (구간: number[], 정거장: string[], 기존: number) => {
            const { stops, 총 } = 경로(구간, 정거장);
            return tailSplitOf(stops, "후보", 총 - 기존).offRouteMinutes;
        };
        /** 못 쟀을 때의 까닭 — 서버가 이 문장을 로그에 찍는다 */
        const 까닭 = (stops: Parameters<typeof tailSplitOf>[0], marginal: number) =>
            tailSplitOf(stops, '후보', marginal).why;
        /** ❌ 잘못된 식(«후보 상차 이후 주행»을 뺌) — 얼마나 어긋나는지 견주려고만 쓴다 */
        const 상차이후식 = (구간: number[], 정거장: string[], 기존: number) => {
            const { stops, 총 } = 경로(구간, 정거장);
            const pi = stops.findIndex(s => s.orderId === '후보' && s.stopType === 'pickup');
            return Math.max(0, (총 - 기존) - (총 - stops[pi].driveMinutes!));
        };

        /** 🔴 기사님 직선 예 — 되돌아가는 일이 없으니 0 이다 */
        it('🔴 기사님 직선 예 — 벗어남이 0 이다', () => {
            expect(벗어남([10, 5, 25, 20], ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차'], 40)).toBe(0);
        });

        it('🔴 합짐 상차가 옆으로 빠져 왕복 60분을 버리면 — 그 몫이 남는다', () => {
            const 구간 = [10, 30, 55, 20], 정거장 = ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차'];
            expect(벗어남(구간, 정거장, 40)).toBe(55);
            expect(상차이후식(구간, 정거장, 40)).toBe(0);      // ❌ 약분되어 0 — 감쇠가 꺼진다
        });

        /**
         * 🔴 **벗어난 몫이 무감점을 넘으면 깎인다** — 위 55분은 무감점(기본 90 · 기사님 60) 안이라
         *    깎이지 않는 것이 맞다. 더 크게 빠지는 경로로 «깎이는 것»까지 잠근다.
         */
        it('🔴 더 크게 빠지면 값을 깎는다', () => {
            const 구간 = [10, 70, 130, 20], 정거장 = ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차'];
            const off = 벗어남(구간, 정거장, 40)!;
            expect(off).toBe(170);
            expect(off).toBeGreaterThan(freeMin);
            /* ❌ 잘못된 식은 40 — 0 은 아니지만 벗어난 몫을 네 배 넘게 깎아 먹는다 */
            expect(상차이후식(구간, 정거장, 40)).toBeLessThan(off);
            expect(점수(off + 20, off)).toBeLessThan(점수(off + 20, 0));
        });

        it('후보 하차가 경로 중간이면 꼬리가 없어 옛 셈으로 돈다 — 안전한 쪽', () => {
            expect(벗어남([10, 5, 20, 25], ['첫짐상차', '합짐상차', '합짐하차', '첫짐하차'], 40)).toBe(20);
        });

        /**
         * 🔴 **자리 맞물림이 깨지면 `null` 이다 — 틀린 꼬리를 빼지 않는다.**
         *    규약은 «`driveMinutes[i]` = 그 정거장에 도착한 누적»이라 마지막 원소가 곧 총주행이다.
         *    그 등식이 깨졌다면 정거장과 주행분이 엇갈린 것이다 (`helpers.ts` 의
         *    «주행분이 남의 이름에 붙는다 · #60»). `null` 이면 「돈」이 옛 셈으로 돈다.
         */
        /**
         * 🔴 **«마지막 누적 = 총주행» 으로 확인하지 않는다.** 그 식은 «카카오의 summary.duration 과
         *    Σ sections[].duration 이 같다»는 별개 가정을 하나 더 깔고, 그것이 어긋나면 배열이
         *    멀쩡해도 꼬리가 영영 안 돈다 — 실측 판정 다섯 건에서 한 번도 값을 못 냈다.
         *    그래서 총주행을 아예 안 받고 **배열 안에서** 맞물림을 본다.
         */
        it('🔴 총주행을 인자로 받지 않는다 — 별개 가정을 깔지 않는다', () => {
            expect(tailSplitOf.length).toBe(3);
        });

        it('🔴 누적이 거꾸로면 null 이다 — 주행분이 남의 이름에 붙은 것이다 (#60)', () => {
            const { stops } = 경로([10, 5, 25, 20], ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차']);
            const 거꾸로 = [...stops];
            거꾸로[거꾸로.length - 1] = { ...거꾸로[거꾸로.length - 1], driveMinutes: 30 };   // 40 → 30
            expect(tailSplitOf(거꾸로, "후보", 20).offRouteMinutes).toBeNull();
            expect(까닭(거꾸로, 20)).toContain('거꾸로');
        });

        it('🔴 주행분을 못 받으면 null 이다 — 지어내지 않는다', () => {
            const { stops } = 경로([10, 5, 25, 20], ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차']);
            const 빈것 = stops.map(s => ({ ...s, driveMinutes: null }));
            expect(tailSplitOf(빈것, "후보", 20).offRouteMinutes).toBeNull();
            expect(까닭(빈것, 20)).toContain('기점');
        });

        it('정거장이 둘도 안 되면 null 이다', () => {
            expect(tailSplitOf([], "후보", 20).offRouteMinutes).toBeNull();
            expect(까닭([], 20)).toContain('정거장');
        });

        /** 🔴 **쟀으면 까닭이 없다** — 까닭이 있으면 서버가 «못 잼» 로그를 찍는다 */
        it('🔴 제대로 쟀으면 까닭이 null 이다', () => {
            const { stops, 총 } = 경로([10, 5, 25, 20], ['첫짐상차', '합짐상차', '첫짐하차', '합짐하차']);
            expect(tailSplitOf(stops, '후보', 총 - 40).why).toBeNull();
        });
    });
});

/**
 * 🔴 **서버가 그 값을 정말 경로 구간에서 재는가** — 「돈」쪽만 고치면 화면은 그대로다
 *    (「바꿨는데 판정이 안 읽는」 끊김). 카카오를 더 부르지 않는 것도 여기서 잠근다.
 */
describe('🛣️ 서버가 재는 자리 — 카카오를 더 부르지 않는다', () => {
    const src = () => readFileSync(
        join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf-8');

    /**
     * 🔴 **서버가 `shared` 의 그 함수를 부른다 — 산수를 제 안에 두지 않는다** (규칙 ③).
     *    두 벌이면 «검사는 맞는데 화면은 틀린» 자리가 생긴다.
     */
    it('🔴 tailSplitOf 를 불러서 «벗어난 분»을 낸다', () => {
        const s = src();
        expect(s).toMatch(/tailSplit\s*=\s*tailSplitOf\(stopsAfter,\s*securedOrder\.id,\s*marginal\)/);
        expect(s).toMatch(/offRouteMinutes\s*=\s*tailSplit\.offRouteMinutes/);
    });

    /** 🔴 서버 안에서 꼬리를 다시 세지 않는다 — 셈이 두 벌이 되면 갈라진다 */
    it('🔴 서버가 꼬리를 스스로 계산하지 않는다', () => {
        expect(src()).not.toMatch(/last\.driveMinutes\s*-\s*prev\.driveMinutes/);
    });

    /**
     * 🔴 **«후보 상차 이후 주행»을 빼면 안 된다** — 그 구간에는 기존 콜의 하차도 들어 있어
     *    식이 `후보상차누적 − 기존경로` 로 약분되고, 거의 모든 합짐이 0 이 되어 감쇠가 꺼진다.
     *    검산: 합짐 상차가 옆으로 30분 빠져 왕복 60분을 버리는 경로(누적 10·40·95·115 · 기존 40)에서
     *    그 식은 0 을 내고 꼬리 식은 55 를 낸다.
     */
    it('🔴 후보 상차 누적으로 빼지 않는다 — 식이 약분되어 감쇠가 꺼진다', () => {
        const s = src();
        expect(s).not.toMatch(/marginal\s*-\s*\(\s*totalDriveMin\s*-\s*candPickupDrive/);
        expect(s).not.toMatch(/offRouteMinutes\s*=\s*candPickupDrive/);
    });

    /**
     * 🔴 **못 쟀으면 까닭을 로그에 찍는다** — 이 값이 조용히 null 이던 동안 승인받은 꼬리 빼기가
     *    한 번도 안 도는데 아무도 몰랐다 (실측 판정 다섯 건 · 딱지의 분을 역산해서야 알아냈다).
     */
    it('🔴 못 쟀으면 그 까닭을 로그로 남긴다', () => {
        const s = src();
        expect(s).toMatch(/tailSplit\.why/);
        expect(s).toMatch(/꼬리 못 잼/);
    });

    /** 🔴 쟀으면 얼마를 뺐는지도 남긴다 — 다음 주행에서 «돌았나»를 한 줄로 안다 */
    it('🔴 꼬리를 뺐으면 그 분을 로그로 남긴다', () => {
        expect(src()).toMatch(/벗어난 분/);
    });

    /** 🔴 구간 누적은 병합 경로를 부를 때 **이미 함께 받은** 값이다 — 새 호출이 아니다 */
    it('🔴 단독 배송을 다시 재려고 카카오를 부르지 않는다', () => {
        const s = src();
        const 자리 = s.slice(s.indexOf('const offRouteMinutes'), s.indexOf('offRouteMinutes,'));
        expect(자리).not.toMatch(/await\s+(calculateSoloRoute|measureSoloDelivery|composeMergedRoute)/);
    });
});

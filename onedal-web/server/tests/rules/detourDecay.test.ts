import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, MoneyFacts } from '@onedal/shared';

/**
 * 🛣️ **긴 우회는 «가는 길»이 아니다 — 시급이 좋아도 값을 깎는다** (기사님 확정)
 *
 * ── 왜 ──
 *
 * 우회 235분(3.9시간)에 15만원인 콜이 «3.8만/h» 로 계산되어 보통 위로 올라왔다 (쌓인 판정 53건).
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
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;   // 무감점 60 · 주의 120 · 한계 180

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

    it('무감점 한계(60분)까지는 시급 그대로다 — 덤은 덤이다', () => {
        expect(시급6만(30)).toBe(시급6만(60));
        expect(시급6만(60)).toBe(100);                      // 6만/h = 꿀 시급
    });

    it('주의 한계(120분)에서는 아무리 좋아도 보통까지다', () => {
        // 시급 10만/h 로 만점을 받아도 절반으로 깎인다
        expect(score(200_000, 120)).toBeLessThanOrEqual(50);
    });

    it('🔴 한계(180분)를 넘으면 시급과 무관하게 똥이다', () => {
        expect(score(300_000, 181)).toBeLessThan(40);       // 10만/h 인데도
    });

    it('같은 시급이면 우회가 길수록 낮다 — 뒤집히지 않는다', () => {
        const a = 시급6만(60), b = 시급6만(120), c = 시급6만(180), d = 시급6만(240);
        expect(a).toBeGreaterThan(b);
        expect(b).toBeGreaterThan(c);
        expect(c).toBeGreaterThan(d);
    });

    /** 🔴 짧은 콜의 눈금은 안 건드렸다 — 이 판이 바꾸는 것은 «긴 우회»뿐이다 */
    it('🔴 보통 시급(3만/h) 짧은 콜은 여전히 50점이다 — 눈금을 안 움직였다', () => {
        expect(score(15_000, 30)).toBe(50);
    });

    it('🔴 첫짐에는 안 깎는다 — 빈 차는 «우회»가 아니라 그 콜 자체의 시간이다', () => {
        expect(score(150_000, 235, true)).toBe(100);
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

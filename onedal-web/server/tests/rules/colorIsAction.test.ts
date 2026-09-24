import { judge, CRITERIA, DEFAULT_JUDGMENT, JUDGMENT_FIELDS } from '@onedal/shared';
import type { JudgeFacts, JudgmentConfig } from '@onedal/shared';

/**
 * 🎨 **색은 «내가 무엇을 해야 하나», 점수는 «얼마짜리인가»** (기사님 확정)
 *
 * 기사님: *"약속으로 색을 판단하고 점수로 금액을 판단한다"* ·
 *         *"색에 여러가지 것들이 섞여있어서 내가 판단하기 어려운거 같아"*
 *
 * ── 왜 ──
 * 색이 점수에서 나오면 **약속·공간·성질·방향·돈이 한 숫자로 뭉쳐** 색이 된다.
 * 그래서 기사님이 실제로 하시는 판단 셋을 화면이 구별하지 못했다.
 *
 *   「좋은 콜인데 약속이 걸린다 — 다른 걸 취소할까」   지금: 🔴 (점수도 0 으로 눌림)
 *   「좋은 콜인데 시간이 아슬 — 전화해서 미루자」      지금: 🟡 10
 *   「별로인데 시간도 아슬 — 잡지 말자」               지금: 🟡 7
 *
 * 뒤 둘이 10점과 7점이라 사실상 같은 화면인데 **기사님 행동은 정반대**다.
 *
 * ── 새 규칙 ──
 *   🔴  지금 그대로는 못 잡는다 (뭔가를 포기해야 한다)
 *   🟡  손이 하나 더 든다 — 전화해서 미룬다
 *   🟢🔵 그냥 잡으면 된다 — 그 안에서 점수가 가른다
 *
 * 🔴 **1단계는 색만 바꾼다** — 점수 셈은 한 줄도 안 건드린다. 한 번에 다 바꾸면
 *    «색 때문인지 점수 때문인지» 못 가린다.
 */

const cfg = (over: Partial<JudgmentConfig> = {}): JudgmentConfig => ({ ...DEFAULT_JUDGMENT, ...over });

/** 실측 콜 — 4.6만 ÷ 44분 = 5.7만/h 합짐 (오늘 🔵 71 로 떴던 것) */
const 합짐 = (bufferAfterMin: number, lateStops: any[] = []): JudgeFacts => ({
    money: { fare: 46_000, extraMinutes: 44, firstLoad: false, extraKm: 28.5 },
    labor: { handMinutes: 1, protectionMinutes: 0 },
    drive: { extraKm: 28.5, driveMinutes: 39 },
    wait: { toPickupMinutes: 20, deliveryMinutes: 48 },
    calls: { count: 0, hasExistingCalls: true },
    promise: { hasExistingCalls: true, lateStops, bufferAfterMin },
    space: { freePct: 95, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
    geography: { firstLoad: false, progressRatio: null },
});

const 본다 = (f: JudgeFacts) => judge(CRITERIA, f, cfg());

describe('🎨 색은 행동을 말한다 — 1단계: 점수는 그대로', () => {

    it('🔴 약속이 넉넉하면 점수가 색을 가른다 (지금과 같다)', () => {
        const v = 본다(합짐(60));
        expect(v.color).toBe('꿀');
    });

    /**
     * 🔴 **흔들림 안은 «그냥 잡으면 된다»** — 깎지 않는다.
     *    전화를 안 했으면 20분까지는 있을 수 있는 일이다 (기사님 «전화를 하지 않았으면 20분정도»).
     */
    it('🔴 흔들림 안(15분)이면 색이 안 내려간다', () => {
        expect(본다(합짐(-15)).color).toBe('꿀');
    });

    /** 🔴 흔들림 밖이면 «전화해서 미룬다» — 🟡 */
    it('🔴 흔들림 밖(31분)이면 🟡 — 점수가 높아도', () => {
        const v = 본다(합짐(-31));
        expect(v.color).toBe('똥');                    // 🟡
        expect(v.score!).toBeGreaterThan(DEFAULT_JUDGMENT.color.honeyMin);   // 점수는 여전히 높다
    });

    /** 🔴 흔들림의 몇 배를 넘으면 «전화로 될 일이 아니다» — 🔴 */
    it('🔴 흔들림을 크게 넘으면(110분) 🔴 — 점수는 그대로 높다', () => {
        const v = 본다(합짐(-110));
        expect(v.color).toBe('사고');                   // 🔴
        expect(v.score!).toBeGreaterThan(DEFAULT_JUDGMENT.color.honeyMin);
    });

    /**
     * 🔴 **1단계의 끝 — 점수가 약속과 무관하게 같다.**
     *    색만 움직이고 점수는 한 자리도 안 움직여야 «색 때문»임이 확실해진다.
     */
    it('🔴 약속만 바뀌어도 점수는 같다', () => {
        const 점수들 = [60, 0, -15, -31, -110].map(m => 본다(합짐(m)).score);
        expect(new Set(점수들).size).toBe(1);
    });

    /** 🔴 전화로 굳힌 약속은 흔들림(5분) 밖이면 바로 🔴 — 한 번 한 약속은 무겁다 */
    it('🔴 굳힌 약속이 흔들림 밖이면 🔴', () => {
        const v = 본다(합짐(60, [{ label: '노선합짐1콜 하차 약속', lateMinutes: 20, firm: true }]));
        expect(v.color).toBe('사고');
    });

    /** 🔴 굳힌 약속도 흔들림 안이면 그냥 잡는다 — 지금은 1분만 늦어도 🔴 였다 */
    it('🔴 굳힌 약속이 흔들림 안(3분)이면 🔴 가 아니다', () => {
        const v = 본다(합짐(60, [{ label: '노선합짐1콜 하차 약속', lateMinutes: 3, firm: true }]));
        expect(v.color).not.toBe('사고');
    });
});

/**
 * 🟡 **노란색은 한 가지만 뜻한다 — «전화하면 잡을 수 있다»** (기사님 확정)
 *
 * 기사님: *"노랑바탕에 90점을 보면 전화해서 시간을 미뤄야 겠다 이렇게 판단할꺼 같거든.
 *          노랑바탕에 40점을보면 그냥 잡지말자 할꺼고"*
 *
 * ── 왜 ──
 * 실측 주행에서 🟡 셋이 떴는데 까닭이 둘로 갈렸다:
 *
 *   🟡 39점 — 약속 **최소 +18분 여유** · 전화할 곳 없음  ← 전화할 것이 없는데 노란색
 *   🟡 60점 — 약속 33분 늦음(전화 안 함)                 ← 전화해야 하는 노란색
 *   🟡 62점 — 약속 41분 늦음(전화 안 함)                 ← 전화해야 하는 노란색
 *
 * 첫째 것은 전화기를 들 데가 없다. 같은 색인데 손이 다르니 **딱지를 읽어야 갈렸다**.
 * 점수가 낮은 것은 점수 39 가 이미 말한다.
 */
describe('🟡 노란색은 «전화하면 잡는다» 하나만 뜻한다', () => {

    /**
     * 실측 콜 — 우회 76분 · 48.5km 합짐에 약속 여유 +18분. 실주행에서 🟡 **39점**으로 떴다.
     * 🔴 요금은 3.0만이다 — 실측 로그의 3.9만은 기름·톨비를 뺀 **뒤** 2.5만/h 였고,
     *    여기 `fare` 는 그 공제 전 값이라 같은 39점을 내는 자리가 3.0만이다.
     */
    const 싼합짐: JudgeFacts = {
        money: { fare: 30_000, extraMinutes: 76, firstLoad: false, extraKm: 48.5 },
        labor: { handMinutes: 1, protectionMinutes: 0 },
        drive: { extraKm: 48.5, driveMinutes: 71 },
        wait: { toPickupMinutes: -13, deliveryMinutes: 48 },
        calls: { count: 0, hasExistingCalls: true },
        promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 18 },
        space: { freePct: 99, hasLoad: true },
        nature: { conflicts: [], excludedHits: [], hasLoad: true },
        geography: { firstLoad: false, progressRatio: null },
    } as JudgeFacts;

    it('🔴 전화할 곳이 없고 약속이 여유면 점수가 낮아도 🟡 이 아니다', () => {
        const v = judge(CRITERIA, 싼합짐, cfg());
        expect(v.score!).toBeLessThan(DEFAULT_JUDGMENT.color.normalMin);   // 40 밑
        expect(v.color).toBe('보통');                                       // 🟢 — 그냥 잡으면 된다
    });

    /**
     * 🔴 **점수를 얼마로 낮춰도 색은 안 내려간다** — 색과 점수가 완전히 갈라졌다는 뜻이다.
     *    숫자 하나가 아니라 «내려가지 않는다»를 재므로 눈금이 바뀌어도 참이다.
     */
    it('🔴 돈이 아무리 나빠도 🟡 을 만들지 않는다', () => {
        for (const fare of [20_000, 10_000, 1_000]) {
            const v = judge(CRITERIA, { ...싼합짐, money: { ...싼합짐.money!, fare } } as JudgeFacts, cfg());
            expect(v.color).toBe('보통');
        }
    });

    /** 🔴 거꾸로 — 전화할 곳이 생기면 점수가 높아도 🟡 이다 (이게 🟡 의 유일한 뜻이다) */
    it('🔴 🟡 이 뜨는 길은 전화할 곳과 약속 흔들림 둘뿐이다', () => {
        const 전화셋 = judge(CRITERIA, { ...싼합짐, calls: { count: 3, hasExistingCalls: true } } as JudgeFacts, cfg());
        const 약속늦음 = judge(CRITERIA, { ...싼합짐, promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: -33 } } as JudgeFacts, cfg());
        expect(전화셋.color).toBe('똥');
        expect(약속늦음.color).toBe('똥');
    });

    /** 🔴 설정 표에 🟢 경계 칸이 없다 — 색을 안 만드는 값은 고칠 칸도 없다 */
    it('🔴 판정 기준 탭에 「🟢 보통」 칸이 없다', () => {
        expect(JUDGMENT_FIELDS.map(f => f.col)).not.toContain('color_normal_min');
        expect(JUDGMENT_FIELDS.map(f => f.col)).toContain('color_honey_min');
    });
});

/**
 * 🎯 **축은 자기 자리 하나에서만 일한다** (기사님 배분)
 *
 * 기사님: *"점수 : 돈 · 노동강도 · 운전 · 콜 대기 · 지리. / 노란색: 약속 · 전화할 곳 /
 *          빨강: 약속 · 공간 · 성질"*
 *
 * 🔴 **같은 사실을 두 자리에서 보지 않는다** (규칙 ③). 자리가 넉넉하다고 점수를 올려 받으면
 *    «얼마짜리인가»에 «자리가 있나»가 섞인다 — 그러면 돈이 나쁜 콜도 점수가 높아진다.
 */
describe('🎯 점수는 다섯 축 — 색을 만드는 축은 점수에 안 섞인다', () => {

    const 역할 = (key: string) => CRITERIA.find(c => c.key === key)!.role ?? 'score';

    it('🔴 점수를 만드는 축 — 돈 · 노동강도 · 운전 · 콜 대기', () => {
        for (const k of ['money', 'labor', 'drive', 'wait']) expect(역할(k)).toBe('score');
    });

    it('🔴 지리는 점수에 곱한다 (등 뒤 상차도 점수로 내려간다)', () => {
        expect(역할('geography')).toBe('multiplier');
    });

    it('🔴 색을 만드는 축은 평균에 안 섞인다 — 약속 · 전화할 곳 · 공간 · 성질', () => {
        for (const k of ['promise', 'calls', 'space', 'nature']) expect(역할(k)).toBe('gate');
    });

    /** 🔴 자리가 넉넉하든 빠듯하든 «얼마짜리인가»는 같다 */
    it('🔴 공간이 점수를 안 움직인다', () => {
        const 넉넉 = { ...합짐(60), space: { freePct: 95, hasLoad: true } } as JudgeFacts;
        const 빠듯 = { ...합짐(60), space: { freePct: 10, hasLoad: true } } as JudgeFacts;
        expect(본다(넉넉).score).toBe(본다(빠듯).score);
    });

    /** 🔴 전화할 곳은 «할 일»이지 «값어치»가 아니다 */
    it('🔴 전화할 곳이 점수를 안 움직인다 — 대신 🟡 를 만든다', () => {
        const 없음 = { ...합짐(60), calls: { count: 0, hasExistingCalls: true } } as JudgeFacts;
        const 셋 = { ...합짐(60), calls: { count: 3, hasExistingCalls: true } } as JudgeFacts;
        expect(본다(셋).score).toBe(본다(없음).score);
        expect(본다(셋).color).toBe('똥');          // 🟡 전화해야 한다
    });
});

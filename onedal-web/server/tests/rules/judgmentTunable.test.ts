import { judge, CRITERIA, DEFAULT_JUDGMENT, dwellMinutes, derivationInputsOf,
         dwellRatesOf, buildDefaultCallOptions, JUDGMENT_FIELDS, judgmentDefaults } from '@onedal/shared';
import type { JudgmentConfig, JudgeFacts } from '@onedal/shared';

/**
 * 🎛️ **판정 값은 코드 상수가 아니라 기사님이 고칠 수 있는 칸에 산다**
 *
 * 규칙 ⑤-4 ①: *"어느 테이블·어느 칸에 사는가 — 비어 있으면 **코드 상수로 태어나
 * 영영 못 바꾼다**"* 그리고 *"이 레포에서 그렇게 태어난 값들이 지금 코드에 박혀 있고,
 * 그 값이 **기사님이 1~2초 만에 누르는 색**을 정하고 있다."*
 *
 * 이 검사는 **바꾸면 정말 바뀌는가**를 본다.
 *
 * 🔴 **기본값은 코드에 박혀 있던 상수와 같다.**
 *    구조와 값이 같이 움직이면 나중에 «구조 때문인지 값 때문인지» 못 가린다.
 */

const cfg = (over: Partial<JudgmentConfig>): JudgmentConfig => ({ ...DEFAULT_JUDGMENT, ...over });

const 합짐 = (bufferAfterMin: number | null): JudgeFacts => ({
    money: { fare: 50_000, extraMinutes: 30 , firstLoad: false },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin },
    space: { freePct: 70, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
});

const 약속점수 = (f: JudgeFacts, c: JudgmentConfig) => {
    const o = judge(CRITERIA, f, c).criteria.find(x => x.key === 'promise')!.outcome;
    return o.kind === 'scored' ? o.score : null;
};

describe('⏰ 약속 — 색을 가르고 점수는 안 깎는다', () => {
    /**
     * 🔴 **약속은 «내가 무엇을 해야 하나»를 말한다** (기사님 확정).
     *    *"약속으로 색을 판단하고 점수로 금액을 판단한다"* — 늦는다고 «얼마짜리인가»가
     *    달라지지 않는다. 흔들림 곡선은 `latePromiseSlope.test.ts` 가 문다.
     */
    it('기본값 — 흔들림 통화한 곳 10분 · 전화 안 한 곳 20분', () => {
        expect(DEFAULT_JUDGMENT.slack).toEqual({
            fullMin: 30, zeroScore: 95, lateSoftMin: 5, lateWarnMin: 15, lateZeroMin: 30,
            slipCalledMin: 10, slipUncalledMin: 20,
        });
    });

    it('🔴 여유가 넉넉하든 빠듯하든 점수는 안 깎인다', () => {
        for (const m of [30, 15, 0, -5, -15, -60, -300]) {
            expect(약속점수(합짐(m), DEFAULT_JUDGMENT)).toBe(100);
        }
    });

    /** 🔴 기사님이 흔들림을 넓히면 같은 콜의 **색**이 달라진다 — 코드에 안 박혀 있다 */
    it('🔴 흔들림을 넓히면 같은 콜이 «그냥 잡는다»가 된다', () => {
        const 넓게 = cfg({ slack: { ...DEFAULT_JUDGMENT.slack, slipUncalledMin: 120 } });
        const 색 = (c: JudgmentConfig) => judge(CRITERIA, 합짐(-60), c).color;
        expect(색(DEFAULT_JUDGMENT)).toBe('똥');      // 🟡 전화해서 미룬다
        expect(색(넓게)).not.toBe('똥');
    });
});

describe('📦 박스당 정차 시간 — 콜 옵션 표에서 온다', () => {
    /** 표를 손으로 고쳐 «바꾸면 정말 바뀌는가»를 본다 */
    const 표 = (over: (o: any) => void = () => {}) => {
        const opts = JSON.parse(JSON.stringify(buildDefaultCallOptions()));
        over(opts); return dwellRatesOf(opts);
    };
    const 잰다 = (rates: any) =>
        dwellMinutes('수작업', 30, 'pickup', derivationInputsOf(DEFAULT_JUDGMENT, rates).unk, ['결박']);

    it('기본값은 옛 상수 그대로다 (수작업 1/3분 · 지게차 0.05분)', () => {
        const r = 표();
        expect(r.perBoxMin!.forkliftMin).toBeCloseTo(0.05);
        expect(r.perBoxMin!.manualMin).toBeCloseTo(1 / 3);
        expect(잰다(r)).toBe(14);                                   // 실측한 다마스 상차 14분
    });

    it('🔴 박스당 시간을 늘리면 정차가 늘어난다 — 「돈」의 분모가 움직인다', () => {
        const 느리게 = 표(o => { o.find((x: any) => x.key === '수작업').num2 = 0.5; });
        expect(잰다(느리게)).toBe(19);                              // 14분 → 19분 (박스당 20초→30초)
    });

    it('지게차도 따로 움직인다', () => {
        const 잰다지게차 = (rates: any) =>
            dwellMinutes('지게차', 80, 'pickup', derivationInputsOf(DEFAULT_JUDGMENT, rates).unk, ['결박']);
        const 느리게 = 표(o => { o.find((x: any) => x.key === '지게차').num2 = 0.2; });
        expect(잰다지게차(느리게)).toBeGreaterThan(잰다지게차(표()));
    });

    /** 🔴 되돌리는 길 — 값이 안 실려 오면 코드 기본 상수로 돈다 */
    it('설정이 안 실려 오면 옛 상수를 쓴다 (되돌리는 길)', () => {
        expect(dwellMinutes('수작업', 30, 'pickup', { pickupDwellMin: 15, dropoffDwellMin: 10 }, ['결박']))
            .toBe(14);
    });
});

describe('🧹 검수 후작업 — 제일 센 값. 이것도 콜 옵션 표에서 온다', () => {
    const 표 = (분?: number) => {
        const opts = JSON.parse(JSON.stringify(buildDefaultCallOptions()));
        if (분 != null) opts.find((x: any) => x.key === '검수').num1 = 분;
        return dwellRatesOf(opts);
    };
    const 하차정차 = (rates: any) =>
        dwellMinutes('수작업', 30, 'dropoff', derivationInputsOf(DEFAULT_JUDGMENT, rates).unk, null, ['정리', '검수']);

    it('기본값은 옛 상수 그대로다 (60분)', () => {
        expect(표().afterworkMin!['검수']).toBe(60);
    });

    it('🔴 검수 시간을 줄이면 하차 정차가 그만큼 줄어든다', () => {
        expect(하차정차(표()) - 하차정차(표(10))).toBe(50);          // 60 → 10
    });

    it('검수를 안 누르면 안 붙는다 — 값을 바꿔도 그대로', () => {
        const 정리만 = (rates: any) =>
            dwellMinutes('수작업', 30, 'dropoff', derivationInputsOf(DEFAULT_JUDGMENT, rates).unk, null, ['정리']);
        expect(정리만(표(240))).toBe(정리만(표()));
    });
});

describe('🗄️ 여유·지연 곡선은 판정 기준 탭에 있다 (규칙 ⑤-4 ①)', () => {
    const 새칸 = ['slack_full_min', 'slack_zero_score',
                  'slack_late_soft_min', 'slack_late_warn_min', 'slack_late_zero_min'];

    it('판정 기준 표에 다섯이 다 있다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        for (const c of 새칸) expect(cols).toContain(c);
    });

    it('🔴 «왜 이 값인가»가 적혀 있다 — 화면이 그걸 보여 준다', () => {
        for (const c of 새칸) {
            const f = JUDGMENT_FIELDS.find(x => x.col === c)!;
            expect(f.why.length).toBeGreaterThan(20);
            expect(f.label.length).toBeGreaterThan(1);
        }
    });

    it('기본값이 문서와 같다', () => {
        const d = judgmentDefaults();
        expect(d.slack_full_min).toBe(30);
        expect(d.slack_zero_score).toBe(95);
        expect(d.slack_late_soft_min).toBe(5);
        expect(d.slack_late_warn_min).toBe(15);
        expect(d.slack_late_zero_min).toBe(30);
    });

    /** 🔴 순위가 뒤집히지 않게 — 지연 구간이 여유 0분보다 위로 올라가면 안 된다 */
    it('🔴 여유 0분 점수가 지연 첫 자리(90점)보다 높다', () => {
        expect(judgmentDefaults().slack_zero_score).toBeGreaterThan(90);
    });

    /** 🔴 정차 값은 **여기 없어야** 한다 — 같은 값을 두 그릇에 담지 않는다 */
    it('🔴 정차 값은 판정 기준 탭에 없다 — 콜 옵션 표가 원천이다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        for (const c of ['dwell_forklift_min', 'dwell_manual_min', 'afterwork_inspect_min'])
            expect(cols).not.toContain(c);
    });
});

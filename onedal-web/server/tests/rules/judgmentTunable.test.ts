import { judge, CRITERIA, DEFAULT_JUDGMENT, dwellMinutes, derivationInputsOf,
         JUDGMENT_FIELDS, judgmentDefaults } from '@onedal/shared';
import type { JudgmentConfig, JudgeFacts } from '@onedal/shared';

/**
 * 🎛️ **코드에 박혀 있던 값을 기사님이 고칠 수 있게 됐다** (2026-08-29 · 7단계)
 *
 * 규칙 ⑤-4 ①: *"어느 테이블·어느 칸에 사는가 — 비어 있으면 **코드 상수로 태어나
 * 영영 못 바꾼다**"* 그리고 *"이 레포에서 그렇게 태어난 값들이 지금 코드에 박혀 있고,
 * 그 값이 **기사님이 1~2초 만에 누르는 색**을 정하고 있다."*
 *
 * 이 검사는 그 문장을 지웠는지 본다 — **바꾸면 정말 바뀌는가.**
 *
 * 🔴 **값은 하나도 안 바꿨다.** 옛 상수를 그대로 기본값으로 올렸다.
 *    구조와 값이 같이 움직이면 나중에 «구조 때문인지 값 때문인지» 못 가린다.
 */

const cfg = (over: Partial<JudgmentConfig>): JudgmentConfig => ({ ...DEFAULT_JUDGMENT, ...over });

const 합짐 = (bufferAfterMin: number | null): JudgeFacts => ({
    money: { fare: 50_000, extraMinutes: 30 },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin },
    space: { freePct: 70, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
});

const 약속점수 = (f: JudgeFacts, c: JudgmentConfig) => {
    const o = judge(CRITERIA, f, c).criteria.find(x => x.key === 'promise')!.outcome;
    return o.kind === 'scored' ? o.score : null;
};

describe('⏰ 여유 곡선 — 두 끝이 판정 기준 탭에서 온다', () => {
    it('기본값은 옛 상수 그대로다 (30분 만점 · 0분 40점)', () => {
        expect(DEFAULT_JUDGMENT.slack).toEqual({ fullMin: 30, zeroScore: 40 });
        expect(약속점수(합짐(30), DEFAULT_JUDGMENT)).toBe(100);
        expect(약속점수(합짐(0), DEFAULT_JUDGMENT)).toBe(40);
        expect(약속점수(합짐(15), DEFAULT_JUDGMENT)).toBe(70);      // 딱 가운데
    });

    it('🔴 만점 기준을 낮추면 빠듯한 합짐도 만점을 받는다 (공격적)', () => {
        const c = cfg({ slack: { fullMin: 20, zeroScore: 40 } });
        expect(약속점수(합짐(20), c)).toBe(100);                    // 기본값이면 80점
        expect(약속점수(합짐(20), DEFAULT_JUDGMENT)).toBe(80);
    });

    it('🔴 0분 점수를 낮추면 여유 없는 콜이 확 깎인다 (보수적)', () => {
        const c = cfg({ slack: { fullMin: 30, zeroScore: 10 } });
        expect(약속점수(합짐(0), c)).toBe(10);
        expect(약속점수(합짐(0), DEFAULT_JUDGMENT)).toBe(40);
    });

    it('음수 여유는 어느 설정에서도 0점이다 — 이미 빠듯한 것은 빠듯한 것', () => {
        expect(약속점수(합짐(-5), cfg({ slack: { fullMin: 5, zeroScore: 90 } }))).toBe(0);
    });
});

describe('📦 박스당 정차 시간 — 판정 기준 탭에서 온다', () => {
    /** 다마스 30박스 수작업 — 기본값이면 박스당 20초라 10분이 붙는다 */
    const 잰다 = (c: JudgmentConfig) =>
        dwellMinutes('수작업', 30, 'pickup', derivationInputsOf(c).unk, ['결박']);

    it('기본값은 옛 상수 그대로다 (수작업 1/3분 · 지게차 0.05분)', () => {
        expect(DEFAULT_JUDGMENT.dwellPerBox).toEqual({ forkliftMin: 0.05, manualMin: 1 / 3 });
        expect(잰다(DEFAULT_JUDGMENT)).toBe(14);                    // 오늘 실측한 다마스 상차 14분
    });

    it('🔴 박스당 시간을 늘리면 정차가 늘어난다 — 「돈」의 분모가 움직인다', () => {
        const 느리게 = cfg({ dwellPerBox: { forkliftMin: 0.05, manualMin: 0.5 } });   // 30초/박스
        expect(잰다(느리게)).toBe(19);                              // 14분 → 19분 (박스당 20초→30초)
    });

    it('지게차도 따로 움직인다', () => {
        const 잰다지게차 = (c: JudgmentConfig) =>
            dwellMinutes('지게차', 80, 'pickup', derivationInputsOf(c).unk, ['결박']);
        const 느리게 = cfg({ dwellPerBox: { forkliftMin: 0.2, manualMin: 1 / 3 } });
        expect(잰다지게차(느리게)).toBeGreaterThan(잰다지게차(DEFAULT_JUDGMENT));
    });

    /** 🔴 되돌리는 길 — 값이 안 실려 오면 옛 상수로 돈다 */
    it('설정이 안 실려 오면 옛 상수를 쓴다 (되돌리는 길)', () => {
        expect(dwellMinutes('수작업', 30, 'pickup', { pickupDwellMin: 15, dropoffDwellMin: 10 }, ['결박']))
            .toBe(14);
    });
});

describe('🧹 검수 후작업 — 여섯 중 제일 센 값', () => {
    const 하차정차 = (c: JudgmentConfig) =>
        dwellMinutes('수작업', 30, 'dropoff', derivationInputsOf(c).unk, null, ['정리', '검수']);

    it('기본값은 옛 상수 그대로다 (60분)', () => {
        expect(DEFAULT_JUDGMENT.afterwork.inspectMin).toBe(60);
    });

    it('🔴 검수 시간을 줄이면 하차 정차가 그만큼 줄어든다', () => {
        const 짧게 = cfg({ afterwork: { inspectMin: 10 } });
        expect(하차정차(DEFAULT_JUDGMENT) - 하차정차(짧게)).toBe(50);   // 60 → 10
    });

    it('검수를 안 누르면 안 붙는다 — 값을 바꿔도 그대로', () => {
        const 정리만 = (c: JudgmentConfig) =>
            dwellMinutes('수작업', 30, 'dropoff', derivationInputsOf(c).unk, null, ['정리']);
        expect(정리만(cfg({ afterwork: { inspectMin: 240 } }))).toBe(정리만(DEFAULT_JUDGMENT));
    });
});

describe('🗄️ 다섯 다 DB 칸과 화면을 가졌다 (규칙 ⑤-4 ①)', () => {
    const 새칸 = ['slack_full_min', 'slack_zero_score', 'dwell_forklift_min',
                  'dwell_manual_min', 'afterwork_inspect_min'];

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

    it('기본값이 옛 상수와 같다 — 값은 안 바꿨다', () => {
        const d = judgmentDefaults();
        expect(d.slack_full_min).toBe(30);
        expect(d.slack_zero_score).toBe(40);
        expect(d.dwell_forklift_min).toBeCloseTo(0.05);
        expect(d.dwell_manual_min).toBeCloseTo(1 / 3);
        expect(d.afterwork_inspect_min).toBe(60);
    });
});

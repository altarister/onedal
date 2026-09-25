import { CRITERIA, DEFAULT_JUDGMENT, handMinutesOf, derivationInputsOf } from '@onedal/shared';
import type { JudgmentConfig, LaborFacts } from '@onedal/shared';

/**
 * 💪 **노동강도 — 같은 짐도 «방법»이 다르면 몸이 다르다** (기사님 확정)
 *
 * 기사님: *"까대기, 파레트, 짐의 상하차 방법과 량, 결박도 표현되어 들어가야 할 것 같다."*
 *
 * ── 이 검사가 지키는 것 ──
 * 🔴 **1t 수작업 만재가 0점인 것은 사고가 아니라 의도다.** 실측에서 손 27분(≈81박스)이 11점으로
 *    세 건 나왔고, 「점수가 너무 낮다」로 읽힐 수 있는 자리다. 그런데 같은 100박스를 지게차로
 *    하면 83점이다 — **그 갈림이 이 축의 일 전부**다. 눈금을 올리면 그 갈림이 무뎌진다.
 * 🔴 **0점이어도 색을 안 건드린다** (규칙 ①) — 점수로만 말하고 결정은 기사님이 하신다.
 * 🔴 **한계는 새 칸이 아니라 상차 미확인 일반값의 두 배**다 (규칙 ⑤-4 — 새 값을 안 만든다).
 *    그 값을 늘려 이 축을 무디게 만들면 타임라인·마감이 함께 흔들린다.
 */

const LABOR = CRITERIA.find(c => c.key === 'labor')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;
/** 한계 — 손으로 이만큼 들면 0점. 숫자를 박지 않고 설정에서 끌어온다 */
const heavyAt = Math.max(1, cfg.unknown.pickupDwellMin) * 2;

const 점수 = (handMinutes: number | null, protectionMinutes: number | null = 0): number | null => {
    const out = LABOR.measure({ handMinutes, protectionMinutes } as LaborFacts as never, cfg);
    return out.kind === 'scored' ? out.score : null;
};
/** 박스 수와 방법에서 손 분을 낸다 — 판정이 쓰는 그 함수다 (규칙 ③) */
const 손분 = (handling: '수작업' | '지게차', boxes: number) =>
    handMinutesOf(handling, boxes, derivationInputsOf(cfg).unk)!;

describe('💪 방법이 갈린다 — 이 축의 일 전부', () => {
    /** 🔴 이 검사가 생긴 까닭 — «1t 만재가 0점이라 너무 낮다»로 읽힐 자리를 잠근다 */
    it('🔴 같은 100박스를 지게차로 하면 크게 높다 — 그 갈림이 목적이다', () => {
        const 수작업 = 점수(손분('수작업', 100))!;
        const 지게차 = 점수(손분('지게차', 100))!;
        expect(수작업).toBe(0);                                    // 1t 만재 수작업 — 의도한 0점
        expect(지게차).toBeGreaterThan(cfg.color.honeyMin);        // 같은 짐인데 🔵 권
    });

    /** 🔴 차종이 커질수록(박스가 늘수록) 수작업 점수가 내려간다 — 뒤집히지 않는다 */
    it('🔴 박스가 늘면 수작업 점수가 내려간다 — 승용차 → 다마스 → 라보 → 1t', () => {
        const s = [5, 30, 40, 80, 100].map(b => 점수(손분('수작업', b))!);
        for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1]);
    });

    /** 🔴 지게차는 만재에도 높게 남는다 — 앉아서 기다리는 일이다 */
    it('🔴 지게차 만재도 점수가 높다', () => {
        expect(점수(손분('지게차', 100))!).toBeGreaterThan(80);
    });
});

describe('💪 한계는 설정에서 온다 — 새 칸을 만들지 않았다', () => {
    it('🔴 손이 한계만큼이면 0점이다', () => {
        expect(점수(heavyAt)).toBe(0);
    });

    it('🔴 한계의 절반이면 50점이다 — 직선이다', () => {
        expect(점수(heavyAt / 2)).toBe(50);
    });

    /** 🔴 기사님이 상차 일반값을 늘리면 이 축도 함께 너그러워진다 — 코드에 박혀 있지 않다 */
    it('🔴 상차 일반값을 늘리면 같은 짐이 덜 깎인다', () => {
        const 너그럽게: JudgmentConfig = { ...cfg, unknown: { ...cfg.unknown, pickupDwellMin: 30 } };
        const out = LABOR.measure({ handMinutes: 27, protectionMinutes: 0 } as LaborFacts as never, 너그럽게);
        if (out.kind !== 'scored') throw new Error('점수가 아니다');
        expect(out.score).toBeGreaterThan(점수(27)!);
    });

    /** 🔴 묶는 분도 함께 센다 — 결박은 팔로 하는 일이다 */
    it('묶기 분이 더해진다', () => {
        expect(점수(10, 10)!).toBeLessThan(점수(10, 0)!);
    });
});

describe('💪 0점이어도 색을 안 건드린다 (규칙 ①)', () => {
    it('🔴 만재 수작업이 0점이어도 «잡으면 사고»가 아니다', () => {
        const out = LABOR.measure({ handMinutes: 손분('수작업', 100), protectionMinutes: 0 } as LaborFacts as never, cfg);
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') expect(out.hardFail).toBeFalsy();
    });

    /** 🔴 짐을 모르면 «잴 게 없다» — 통화 전에는 모른다 (규칙 ⑤-2) */
    it('🔴 짐을 모르면 0점이 아니라 «잴 게 없다»다', () => {
        const out = LABOR.measure({ handMinutes: null, protectionMinutes: null } as LaborFacts as never, cfg);
        expect(out.kind).toBe('nothing');
        expect(out.why).toContain('통화');
    });
});

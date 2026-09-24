import { readFileSync } from 'fs';
import { join } from 'path';
import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { DriveFacts, JudgmentConfig } from '@onedal/shared';

/**
 * 🚚 **운전 축은 «이 콜을 잡으면 달리게 되는 길 전체»의 속도를 본다** (기사님 확정)
 *
 * 기사님: *"고속도로 가니 편하고 빨라"*
 *
 * ── 왜 ──
 * 서버가 합짐의 속도를 «늘어난 거리 ÷ 늘어난 시간»으로 구하던 자리다. 그러면 실제보다
 * 항상 느리게 나온다 — 합짐은 길에서 빠져나갔다 되돌아오므로 늘어난 거리는 조금인데
 * 늘어난 시간은 많다(신호·회전·진출입).
 *
 *   합짐 없이       50km ·  60분
 *   합짐을 끼우면    76km · 110분  →  41km/h  ← 기사님이 실제로 달리는 것
 *   늘어난 것       26km ·  50분  →  31km/h  ← 서버가 이것만 보고 14점을 줬다
 *
 * ── 왜 «그 콜의 상차→하차» 로는 못 하나 ──
 * 그 실측은 **KEEP 뒤에** 잰다(`routeComposer.measureSoloDelivery` — 카카오 왕복 4~7초라
 * 후보마다 못 부른다). 판정은 잡기 **전**이라 그때는 거리를 속도 눈금으로 나눠 만든
 * 추정이 온다(`timing.soloMinutesOf` 의 둘째 갈래). 그 시간으로 다시 속도를 구하면
 * **눈금값이 그대로** 나온다 — 재는 것이 아니라 되읽는 것이다 (실측 31건 중 26건이 추정이었다).
 *
 * 🔴 **새 눈금을 만들지 않는다** — 판정 기준 탭의 배송 속도 셋을 그대로 쓴다. 그 셋이
 *    애초에 «실제로 달린 속도»의 실측 중앙값이라, 전체 경로 속도와 재는 것이 같아진다.
 */

const DRIVE = CRITERIA.find(c => c.key === 'drive')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;   // 시내 25 · 국도 46 · 고속 56

/** 그 길의 운전 점수 — 거리(km)와 주행(분)만이 변수다 */
const 점수 = (driveKm: number | null, driveMinutes: number | null): number | null => {
    const out = DRIVE.measure({ driveKm, driveMinutes } as DriveFacts as never, cfg);
    return out.kind === 'scored' ? out.score : null;
};

describe('🚚 운전 — 전체 경로 속도로 잰다', () => {

    /**
     * 🔴 **이 검사가 생긴 까닭** — 같은 콜을 두 잣대로 재면 점수가 네 배 갈린다.
     *    실측 06:24 합짐: 전체 경로 372.2km·469분(47.6km/h) · 늘어난 것 25.8km·50분(31km/h).
     */
    it('🔴 전체 경로로 재면 늘어난 것끼리 잰 것보다 높다 — 같은 콜인데', () => {
        const 전체 = 점수(372.2, 469)!;
        const 늘어난것 = 점수(25.8, 50)!;
        expect(전체).toBeGreaterThan(늘어난것);
        expect(늘어난것).toBeLessThan(DEFAULT_JUDGMENT.color.normalMin);   // 40 밑 — 멀쩡한 길이 이렇게 읽혔다
    });

    /**
     * 🔴 **콜을 쌓을수록 길이 고되진다** — 실측 `orders` 표의 전체 경로 넷.
     *    숫자를 박지 않고 **순서**를 잠근다 (눈금이 바뀌어도 참이다).
     */
    it('🔴 쌓인 콜이 많을수록 점수가 내려간다 — 실측 넷의 순서', () => {
        const 한콜 = 점수(89.9, 94)!;        // 57.4km/h
        const 몇개 = 점수(138.4, 165)!;      // 50.3km/h
        const 많이 = 점수(212.5, 290)!;      // 44.0km/h
        expect(한콜).toBeGreaterThan(몇개);
        expect(몇개).toBeGreaterThan(많이);
    });

    it('🔴 고속으로 달리는 길은 만점이다 — 눈금(고속 56km/h)을 넘으면', () => {
        expect(점수(89.9, 94)).toBe(100);
    });

    it('시내를 기는 길은 0점이다 — 눈금(시내 25km/h) 밑이면', () => {
        expect(점수(10, 60)).toBe(0);        // 10km/h
    });

    /** 🔴 둘 중 하나라도 모르면 「잴 게 없다」 — 지어내지 않는다 (규칙 ⑤-2) */
    it('🔴 거리나 분을 모르면 점수를 안 낸다', () => {
        expect(점수(null, 60)).toBeNull();
        expect(점수(50, null)).toBeNull();
    });

    /** 🔴 기사님이 눈금을 옮기면 같은 길의 점수가 따라 움직인다 — 코드에 박혀 있지 않다 */
    it('🔴 눈금을 옮기면 같은 길의 점수가 달라진다', () => {
        const 너그럽게: JudgmentConfig = { ...cfg, speed: { shortKmh: 20, midKmh: 35, longKmh: 44 } };
        const out = DRIVE.measure({ driveKm: 212.5, driveMinutes: 290 } as DriveFacts as never, 너그럽게);
        if (out.kind !== 'scored') throw new Error('점수가 아니다');
        expect(out.score).toBeGreaterThan(점수(212.5, 290)!);
    });
});

/**
 * 🔴 **서버가 판정에 넘기는 값이 정말 전체 경로인가** — 눈금만 맞고 재료가 늘어난 것이면
 *    위 검사들이 다 통과해도 화면 점수는 그대로다 (「바꿨는데 판정이 안 읽는」 끊김).
 */
describe('🚚 서버가 넘기는 재료 — 전체 경로지 늘어난 것이 아니다', () => {
    const src = () => readFileSync(
        join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf-8');

    it('🔴 합짐은 카카오 병합 경로를 넘긴다', () => {
        const s = src();
        expect(s).toMatch(/driveKm:\s*result\.merged\.distance\s*\/\s*1000/);
        expect(s).toMatch(/driveMinutes:\s*Math\.round\(result\.merged\.duration\s*\/\s*60\)/);
    });

    it('🔴 늘어난 것(marginal)을 운전 축에 넘기지 않는다', () => {
        expect(src()).not.toMatch(/driveMinutes:\s*marginal/);
    });

    /**
     * 🔴 **첫짐과 합짐이 같은 규약이다** — 첫짐의 `extraKm` 은 빈 차라 뺄 기준 경로가 없어
     *    그 자체가 «달리게 되는 길 전체»다. 표가 생기지 않게 둘이 같은 것을 본다.
     */
    it('🔴 첫짐도 운전 축에 전체 주행을 넘긴다', () => {
        const facts = readFileSync(join(__dirname, '../../src/core/engine/judgeFacts.ts'), 'utf-8');
        expect(facts).toMatch(/drive:\s*\{\s*driveKm:\s*input\.extraKm/);      // 첫짐 — 전체가 그대로
        expect(facts).toMatch(/drive:\s*\{\s*driveKm:\s*input\.driveKm/);      // 합짐 — 따로 받는다
    });
});

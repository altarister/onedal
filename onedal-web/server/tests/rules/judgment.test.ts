import { readFileSync } from "fs";
import { join } from "path";
import { scoreMerge, rampDown, DEFAULT_JUDGMENT, describeJudgment } from "@onedal/shared";
import { DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES, allowedDetourMinutes, dwellMinutes } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** 그날 실제로 있었던 콜 — 요금 99,000원 · 우회 +1.1km · 주행 +6분 */
const 그날의콜 = {
    driveDiffMin: 6, detourKm: 1.1,
    dwellMin: DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES,  // 25분
    dwellAssumed: true,
    slackMin: null,                       // 통화 전이라 마감을 모른다
    slotsFree: 3, slotsTotal: 5,
};

/**
 * 🔴 **꿀콜이 똥으로 표시되던 문제** (2026-08-15 실측)
 *
 * 기사님: *"'99,000원짜리 콜이 1.1km 우회로 붙는데 똥입니다.' 이걸 이야기 하는 거였어."*
 *
 * 서버 로그가 그대로 말해 준다:
 * ```
 * 👍 장점: 차종 일치 | 도착지 회랑 적중 | 우회거리(+1.1km) 양호 🍯
 * 💩 똥콜: 총 추가시간(+46분) 초과 — 주행 +6분 + 상하차 40분(미확인) · 마감 여유 0분 기준
 * ```
 * **세 번의 비관이 곱해졌다:**
 *   ① 상하차를 모른다며 20+20=40분 (주석이 *"낙관하지 않는다"* 며 비관을 명시)
 *   ② 마감 여유가 음수라 `Math.max(0,…)` 로 **0** 이 됨
 *   ③ 그 `0` 이 곧 한계가 되어 `46 >= 0` → 똥. **+0분짜리 콜조차 똥이 된다**
 */
describe('그날의 콜 — 99,000원 · +1.1km · +6분', () => {

    it('🔴 이제 꿀이다 (예전에는 똥이었다)', () => {
        const v = scoreMerge(그날의콜);
        expect(v.color).toBe('꿀');
        expect(v.score).toBeGreaterThanOrEqual(DEFAULT_JUDGMENT.color.honeyMin);
        expect(v.blocked).toBeUndefined();
    });

    it('상하차를 일반값으로 때웠다고 **표시**한다 (숫자가 거짓말하지 않게)', () => {
        const v = scoreMerge(그날의콜);
        expect(v.parts.some(p => p.assumed)).toBe(true);
        expect(describeJudgment(v)).toContain('미확인');
    });

    it('상하차 일반값이 25분이다 (상차 15 + 하차 10 · 예전 40분)', () => {
        expect(DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES).toBe(25);
        expect(DWELL_UNKNOWN_PICKUP_MINUTES).toBeGreaterThan(DWELL_UNKNOWN_DROPOFF_MINUTES);  // 상차엔 결박이 붙는다
    });
});

/**
 * 🔴 **마감을 "모른다"와 "늦었다"는 다르다** (기사님 확정 2026-08-15)
 *
 * 예전에는 `Math.max(0, …)` 가 둘 다 `0` 으로 뭉갰고, 그 0 이 한계가 되어 모든 합짐이 똥이었다.
 */
describe('마감 — 모름 · 여유 · 지각을 구분한다', () => {

    it('마감을 아무도 모르면 일반값 90분을 쓴다 (용달 2시간 − 상하차 30분)', () => {
        expect(DEFAULT_JUDGMENT.unknown.slackMin).toBe(90);
        const v = scoreMerge({ ...그날의콜, slackMin: null });
        expect(v.parts.find(p => p.name === '마감 여유')!.assumed).toBe(true);
        expect(v.color).toBe('꿀');
    });

    it('🔴 마감을 정했는데 이미 늦었으면 합짐을 막는다', () => {
        const v = scoreMerge({ ...그날의콜, slackMin: -20 });
        expect(v.color).toBe('똥');
        expect(v.blocked).toContain('20분');
        expect(v.blocked).toContain('마감');
    });

    it('여유가 0 이어도 "모름"과 섞이지 않는다', () => {
        const zero = scoreMerge({ ...그날의콜, slackMin: 0 });
        const unknown = scoreMerge({ ...그날의콜, slackMin: null });
        expect(zero.blocked).toBeUndefined();      // 0 은 지각이 아니다
        expect(zero.score).toBeLessThan(unknown.score);
    });

    it('🔴 allowedDetourMinutes 가 음수를 0 으로 깎지 않는다', () => {
        expect(allowedDetourMinutes([-30, 50])).toBe(-30);
        expect(allowedDetourMinutes([null, null])).toBeNull();
        expect(allowedDetourMinutes([80, 30])).toBe(30);
    });
});

describe('점수 — 임계값을 그대로 두 점으로 쓴다', () => {

    it('꿀 기준 이하면 만점 · 똥 기준 이상이면 0점 · 사이는 선형', () => {
        expect(rampDown(10, 30, 60)).toBe(100);
        expect(rampDown(30, 30, 60)).toBe(100);
        expect(rampDown(60, 30, 60)).toBe(0);
        expect(rampDown(90, 30, 60)).toBe(0);
        expect(rampDown(45, 30, 60)).toBe(50);
    });

    it('가중치 0 인 요소는 색에 반영되지 않는다', () => {
        const cfg = { ...DEFAULT_JUDGMENT, weights: { ...DEFAULT_JUDGMENT.weights, detourDist: 0 } };
        const far = { ...그날의콜, detourKm: 99 };
        expect(scoreMerge(far, cfg).score).toBeGreaterThan(scoreMerge(far).score);
    });

    /**
     * 🔴 예전에는 시간과 거리가 `OR` 였다 — 거리 하나만 넘어도 시간과 무관하게 똥.
     *    `+31.1km` 콜이 그렇게 걸렸다. 이제 가중치로 섞인다.
     */
    it('거리 하나가 넘었다고 바로 똥이 되지 않는다', () => {
        const v = scoreMerge({ ...그날의콜, detourKm: 31, driveDiffMin: 5 });
        expect(v.color).not.toBe('똥');
    });
});

/**
 * 🔴 **색을 정하는 곳은 한 곳뿐이다.**
 * 최초 평가 `60분/30km` · 재탐색 `30분/10km` 로 갈라져 있어 **같은 콜이 재탐색만 해도
 * 색이 바뀌었다.**
 */
describe('판정하는 곳은 한 곳', () => {

    it('🔴 OrderEvaluator 가 임계값을 직접 비교하지 않는다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/scoreMerge\(\{/);
        expect(ev).not.toMatch(/DETOUR_SHIT_TIME_MIN|DETOUR_HONEY_TIME_MAX/);
        expect(ev).not.toMatch(/DETOUR_SHIT_DIST_MIN|DETOUR_HONEY_DIST_MAX/);
    });

    it('🔴 재탐색이 자기 숫자를 갖지 않는다', () => {
        const en = codeOnly(read('services/dispatchEngine.ts'));
        expect(en).toMatch(/scoreMerge\(\{/);
        expect(en).not.toMatch(/distDiffKm\)\s*>\s*10/);
        expect(en).not.toMatch(/timeDiffMin\)\s*>\s*30/);
    });

    it('🔴 상하차 일반값을 코드가 직접 쓰지 않는다 (dwellMinutes 가 정한다)', () => {
        expect(dwellMinutes(null, 0, 'pickup')).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);
        expect(dwellMinutes(null, 0, 'dropoff')).toBe(DWELL_UNKNOWN_DROPOFF_MINUTES);
        expect(dwellMinutes('지게차', 0)).toBe(10);   // 아는 방법은 그대로
    });
});

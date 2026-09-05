import { describe, it, expect } from 'vitest';
import { occludedPx, STAGE_MAX_OCCLUDE_RATIO, STAGE_MAX_OCCLUDE_CSS } from './stageLayout';

/**
 * 🧪 **무대의 셈이 한 곳에 있다** (2026-09-05 · 부품 결합을 끊으며 생겼다)
 *
 * 🔴 전에는 **지도가 시트를 직접 import** 했다 — 목업 전수조사에서 나온 유일한
 *    부품→부품 참조다. 지도가 알아야 할 것은 «시트»가 아니라 «**아래가 몇 px
 *    가려졌나**» 하나다. 값과 셈을 여기 두고 시트도 지도도 **각자 여기를 본다.**
 */
describe('가려진 높이', () => {
    it('잰 값이 있으면 그것이 이긴다 — 「나」는 미리 셀 수 없다', () => {
        expect(occludedPx(800, 300, 999)).toBe(300);
    });

    it('잰 값이 없으면 어림을 쓴다', () => {
        expect(occludedPx(800, undefined, 72)).toBe(72);
        expect(occludedPx(800, 0, 72)).toBe(72);
    });

    it('둘 다 없으면 0 — 안 가려진 것으로 친다', () => {
        expect(occludedPx(800)).toBe(0);
    });

    /**
     * 🔴 **아무리 높아도 상한을 넘지 않는다.** 시트가 무대를 다 덮으면 «보이는 자리»가
     *    0 이 되어 지도가 무너진다. 그리고 **후보 경로를 지도에서 보는 것이 판정의
     *    재료**다 (기사님 확정 2026-09-05).
     */
    it('상한을 넘지 않는다 — 지도가 볼 자리를 남긴다', () => {
        for (const px of [500, 800, 5000]) {
            expect(occludedPx(800, px)).toBeLessThanOrEqual(800 * STAGE_MAX_OCCLUDE_RATIO);
        }
    });

    it('지도가 적어도 42%는 남는다', () => {
        expect(1 - STAGE_MAX_OCCLUDE_RATIO).toBeGreaterThanOrEqual(0.42);
    });

    /** 🔴 화면에 적는 값과 셈하는 값이 **같은 곳**에서 온다 (규칙 ③) */
    it('CSS 값과 비율이 같은 곳에서 온다', () => {
        expect(STAGE_MAX_OCCLUDE_CSS).toBe(`${STAGE_MAX_OCCLUDE_RATIO * 100}%`);
    });
});

import { initGeoService, getCityRegionsWithRadius, trapsForKeywords } from '../../src/services/geoService';
import { anyRegionHit } from '@onedal/shared';

/**
 * 🚚 **볼트의 하루를 우리도 잡는가 — 대전 아침** (기사님 실측)
 *
 * 기사님: *"볼트가 지나간 궤적대로 목표 잡고 가면 그대로 할 수 있는가 아냐?"*
 *
 * 그날 볼트는 대전에서 시작해 북상하며 **셋을 다 잡았다.** 우리도 셋 다 올라와야 한다.
 *
 *     03  대전 갈마동 → 천안 성거읍
 *     04  대전 문지동 → 오산 가수동
 *     07  대전 갈마동 → 인천 송도동
 *
 * 🔴 **셋은 «인천» 한 도시에 안 담긴다.** 볼트는 「북상 길 위」를 알고 고르는데
 *    우리 `destinationCity` 는 **도시 하나**다. 그 차이를 **하차 주변 반경**으로 메운다 —
 *    얼마나 넓혀야 볼트를 따라잡는지가 이 검사의 답이다.
 *
 * 🔴 **왜 검사로 굳히나** — 하차 주변을 0km 로 두고 돌리면 «07만 통과했다»가 정답처럼 보이지만
 *    **볼트 기준으로는 1/3 이다.** 기준은 셋 다다 (기사님: *"3건 모두 합격이 되어야 하는 거 아냐?"*).
 *
 * ⚠️ 이 검사는 **앱의 1차 필터를 서버에서 재현**한 것이다 (`anyRegionHit` 은 앱 Kotlin
 *    `RegionMatch` 와 같은 규칙 · `shared/src/regionMatch.ts` 주석 참고).
 *    실물 왕복(시뮬 화면 → 앱 스크래핑)은 폰이 있어야 하고 그건 `pnpm e2e:app` 의 일이다.
 */

beforeAll(() => { initGeoService(); });

/** 그날 표의 하차지 — 시뮬이 화면에 그리는 글자 그대로 */
const DROPOFFS = { '03': '성거읍', '04': '가수동', '07': '송도동' } as const;

/** 도착 목표 «인천» + 반경으로 몇 개가 올라오나 */
function passCount(radiusKm: number): string[] {
    const g = getCityRegionsWithRadius('인천', radiusKm);
    const traps = trapsForKeywords(g.flat);
    return Object.entries(DROPOFFS)
        .filter(([, dong]) => anyRegionHit(dong, g.flat, traps))
        .map(([n]) => n);
}

describe('🚚 볼트 대전 아침 — 셋을 다 잡으려면 얼마나 넓혀야 하나', () => {
    /**
     * 🔴 **이것이 이 검사의 답이다.** 80km 면 볼트와 같아진다.
     *    이 숫자가 바뀌면 문제지의 설정 안내(`PRESET_REQUIRES`)도 함께 바뀌어야 한다.
     */
    it('🎯 하차 주변 80km 면 셋 다 올라온다 — 볼트와 같아진다', () => {
        expect(passCount(80).sort()).toEqual(['03', '04', '07']);
    });

    /**
     * 좁히면 몇 개가 남는지도 못박는다 — «왜 안 올라왔나»를 다시 손으로 재지 않으려고.
     * 실측: 0km 는 인천 125동, 80km 는 1,208동.
     */
    it('🔴 0km 면 하나뿐이다 — 07(인천 송도)만 «인천» 안이다', () => {
        expect(passCount(0)).toEqual(['07']);
    });

    it('🔶 40km 면 둘이다 — 오산은 들어오고 천안은 아직 멀다', () => {
        expect(passCount(40).sort()).toEqual(['04', '07']);
    });

    /**
     * 🗺️ **지도에 충청이 없으면 80km 로도 성거읍은 못 잡는다.**
     * 반경은 «지도에 있는 동»만 넓힌다 — 없는 동은 아무리 넓혀도 안 나온다.
     * 지도에 충청이 있어야 하는 까닭이 이 검사에서 드러나는 자리가 여기 하나다.
     */
    it('🗺️ 성거읍(천안)은 지도에 충청이 있어야 잡힌다', () => {
        const g = getCityRegionsWithRadius('인천', 80);
        expect(g.flat).toContain('성거읍');
    });
});

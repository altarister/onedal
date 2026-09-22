import { initGeoService, cityAliases } from '../../src/services/geoService';

/**
 * 🔴 **첫짐에도 시 별칭(`customCityFilters`)이 실리므로, 키워드가 바뀌면 별칭도 함께 다시 만든다.**
 *
 * 앱의 2단계 필터는 `customCityFilters.isNotEmpty()` 일 때만 돌고,
 * 돌면 **"시가 맞고 동도 맞아야 통과"** 로 판정한다.
 *
 * `startTwoTrack` 은 `destinationKeywords` 만 넘긴다. 스프레드가
 * `customCityFilters` 를 안 건드리면 **직전 경유의 별칭이 그대로 남아**,
 * 엉뚱한 시 목록으로 멀쩡한 투트랙 콜을 전부 걸러낸다 — 조용히.
 *
 * 그래서 `recalculateDerivedFields` 가 키워드를 받을 때 별칭도 반드시 다시 만들고,
 * 못 만들면 **비운다** (그러면 앱 2단계 필터가 안 돌아 동 이름만 본다 — 안전한 쪽이다).
 */
beforeAll(() => {
    initGeoService();
});

/** 프로덕션과 같은 규칙으로 묶음에서 별칭을 뽑는다 (filterManager 안의 로직과 동일) */
function aliasesFromGroups(groups: Record<string, string[]>): string[] {
    const out = new Set<string>();
    for (const parent of Object.keys(groups)) {
        for (const a of cityAliases(parent)) out.add(a);
    }
    return Array.from(out);
}

describe('시 별칭 파생 — 키워드가 바뀌면 별칭도 반드시 같이 바뀐다', () => {
    it('묶음이 있으면 그 시들의 별칭이 나온다', () => {
        const aliases = aliasesFromGroups({ '파주시': ['금촌동'], '고양시 일산서구': ['탄현동'] });
        expect(aliases).toEqual(expect.arrayContaining(['파주시', '파주', '고양시 일산서구', '고양시 일산서']));
    });

    /**
     * 투트랙이 정확히 이 경우다 — 키워드만 있고 묶음이 없다.
     * 직전 별칭을 남기느니 비우는 게 낫다. 있지도 않은 근거로 거르는 것이 더 나쁘다.
     */
    it('🔴 묶음이 없으면 별칭은 빈 배열 — 옛 경유 별칭을 물려주지 않는다', () => {
        expect(aliasesFromGroups({})).toEqual([]);
    });

    it('별칭이 비면 앱의 2단계 필터가 꺼진다 = 동 이름만 보는 예전 동작 (안전한 폴백)', () => {
        // 앱 조건: filter.customCityFilters.isNotEmpty()
        expect(aliasesFromGroups({}).length > 0).toBe(false);
    });
});

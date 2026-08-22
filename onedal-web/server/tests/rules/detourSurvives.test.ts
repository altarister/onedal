import { getUserSession } from '../../src/state/userSessionStore';
import { updateActiveFilter } from '../../src/state/filterManager';

/**
 * 🛣️ **경유 키워드는 도시와 무관한 변경에 살아남는다** (todo A번 · 2026-08-14 부터 미수정)
 *
 * 🔴 **만드는 쪽과 지우는 쪽이 서로 다른 것을 본다.**
 *
 *   KEEP → `syncDetourFilter` → 경유 키워드를 **경로 기반**으로 꽂는다 (도시를 안 본다)
 *   그 뒤 아무 필터 변경 → `recalculateDerivedFields` → *"도시가 비었네"* → **전멸**
 *
 * 그리고 장부를 보면 **합짐 국면은 목적지 도시가 원래 비어 있다** (`user_filter_phases`):
 *   first(첫짐) 파주시 · merge(합짐) 빈칸 · drive·local·home 빈칸
 *
 * 즉 기사님이 뭘 잘못하는 게 아니라 **첫짐을 KEEP 해서 합짐으로 넘어가는 정상 흐름**이
 * 곧 그 조건이다. 경유 키워드가 가장 중요한 국면에서 0개가 되면 앱은 아무 콜도 안 올린다 —
 * **화면에 에러는 없고 그냥 콜이 안 오는 것처럼 보인다.**
 *
 * ⚠️ CLAUDE.md: *"빈 필터는 '제한 없음'이 아니라 **고장**이다."*
 *
 * 2026-08-14 에 GPS 이동(0.5km 마다)이 이 가지를 밟을 뻔했고, 그때는 전용 통로
 * (`trimTraveled`)를 파서 피했다. **가지는 그대로 남아 있었다.**
 *
 * 고침: 도시를 **지웠을 때만** 지운다 — `'destinationCity' in changes && !changes.destinationCity`
 */

const USER = 'test-detour-survives';

/**
 * 세션을 먼저 만들어 **국면을 정착시킨다.**
 *
 * 실제로는 로그인 때 국면이 정해진다. 세션이 갓 생기면 `applyPhaseSettings` 가
 * `없음 → first` 전환을 처리하면서 `destinationCity` 를 명시적으로 실어 파생을 다시
 * 계산하는데(그쪽은 `!isSharedMode` 가 막아 주는 별도 입구다), 그 한 번이 이 검사가
 * 재현하려는 상황과 섞인다. 검사할 것은 **국면이 이미 정해진 뒤의 필터 변경**이다.
 */
beforeAll(() => {
    updateActiveFilter(USER, {});
});

/** 합짐 국면을 재현한다 — 도시는 비어 있고, 경유 키워드는 경로에서 꽂혀 있다 */
function givenMergePhaseWithDetour() {
    const session = getUserSession(USER);
    session.activeFilter.destinationCity = '';                       // 합짐 국면의 실제 값
    session.activeFilter.destinationKeywords = ['금촌동', '교하동', '문발동'];
    session.activeFilter.destinationGroups = { '파주시': ['금촌동', '교하동', '문발동'] };
    session.activeFilter.customCityFilters = ['파주시', '파주'];
    return session;
}

describe('🛣️ 경유 키워드 — 도시와 무관한 변경에 사라지지 않는다', () => {
    it('🔴 최저 운임만 바꿔도 경유가 전멸하면 안 된다 (콜 잡기가 조용히 멈춘다)', () => {
        givenMergePhaseWithDetour();

        const after = updateActiveFilter(USER, { minFare: 30000 });

        expect(after.destinationKeywords).toEqual(['금촌동', '교하동', '문발동']);
        expect(after.customCityFilters).toEqual(['파주시', '파주']);
    });

    it('🔴 콜 잡기를 껐다 켜는 것도 경유를 건드리면 안 된다', () => {
        givenMergePhaseWithDetour();

        updateActiveFilter(USER, { isActive: false });
        const after = updateActiveFilter(USER, { isActive: true });

        expect(after.destinationKeywords).toHaveLength(3);
    });

    /**
     * 🔴 **지우는 것 자체는 남긴다** — 기사님이 도시를 비웠으면 경유도 비우는 게 맞다.
     *    고치는 것은 *"도시가 비어 있으면"* 이 아니라 *"도시를 **지웠으면**"* 이다.
     */
    it('도시를 지웠을 때는 경유도 같이 지운다 (이건 의도된 동작)', () => {
        givenMergePhaseWithDetour();
        getUserSession(USER).activeFilter.destinationCity = '파주시';   // 도시가 있던 상태에서

        const after = updateActiveFilter(USER, { destinationCity: '' });

        expect(after.destinationKeywords).toEqual([]);
        expect(after.customCityFilters).toEqual([]);
    });
});

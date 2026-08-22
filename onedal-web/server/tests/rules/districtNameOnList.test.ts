import { initGeoService, cityAliases, getDetourRegions } from '../../src/services/geoService';

/**
 * 🏙️ **리스트에 "구"로 뜨는 콜을 버리지 않는다** (기사님 지적 2026-08-23)
 *
 * 기사님: *"지금 합짐 중인데 경안동 → 분당구 같은 건 잡아야 하는 거 아닌가?"*
 *
 * 실측 — 합짐 국면에서 **구 단위로 표기된 콜이 전멸했다:**
 *
 *     도착지(409중 분당구)=❌   중구=❌   동작구=❌   단원구=❌   강동구=❌
 *     🧭 [경로 순서] 차단 — 경로 밖 — 상차지(분당구)가 경유 목록에 없음
 *
 * 경로는 **분당을 지난다** (`대장동`·`금토동` 이 경유 목록에 있고 20km 지점).
 * 경안동(6.4km) → 분당(20km) 은 순방향이라 **잡아야 하는 콜**이었다.
 *
 * 🔴 뿌리: 경유 목록은 **읍/면/동만** 담는데, 배차망 리스트는 서울·성남·안산 같은
 *    대도시를 **구**로 표시한다. 첫짐(파주 목적지)은 동·읍·면뿐이라 안 걸렸고,
 *    **합짐은 경로가 서울·성남을 지나므로 그 지역 콜을 통째로 놓쳤다.**
 *    규칙 ⑤ 위반이다 — 앱은 *"애매하면 올린다"* 여야 하는데 *"모르니 버린다"* 였다.
 *
 * ⚠️ **구의 진행도는 지어내지 않는다** (규칙 ④). 구는 넓어서 "몇 km 지점"이 하나로
 *    안 정해진다 — 그래서 `null`(순서 미상)로 싣는다. 앱의 `RouteOrderFilter` 는
 *    이미 `null` 을 *"모르면 통과"* 로 다루므로 **앱을 안 고쳐도 된다.**
 *    경로 위에 있다는 것만 알리고, 정밀한 판정은 서버가 전체 주소로 한다 (규칙 ⑤).
 */

beforeAll(() => {
    initGeoService();
});

/** 광주 경안동 → 파주 탄현면 — 실제 리허설이 쓰는 축이다 (성남·서울을 지난다).
 *  카카오 규격 그대로 `{x: 경도, y: 위도}` 다 — `getDetourRegions` 가 그걸 받는다 */
const GWANGJU_TO_PAJU = [
    { x: 127.258, y: 37.410 }, { x: 127.112, y: 37.393 }, { x: 127.050, y: 37.520 },
    { x: 126.950, y: 37.600 }, { x: 126.850, y: 37.700 }, { x: 126.680, y: 37.790 },
];

describe('🏙️ 구 단독형 — 유일한 것만 목록에 넣는다', () => {
    /**
     * 🔴 리스트 카드는 `분당구` 라고만 온다. 별칭이 `성남시 분당구`·`성남시 분당` 뿐이면
     *    **어느 쪽도 안 맞는다.**
     */
    it('🔴 시+구 이름에서 구 단독형이 나온다 — 리스트가 그렇게 준다', () => {
        expect(cityAliases('성남시 분당구')).toEqual(expect.arrayContaining(['분당구']));
        expect(cityAliases('서울 금천구')).toEqual(expect.arrayContaining(['금천구']));
    });

    /**
     * 🔴 **`중구` 는 서울에도 인천에도 있다.** 단독형을 넣으면 서울 중구를 지날 때
     *    인천 중구 콜을 잡는다 — 잘못 잡으면 배차망 취소 횟수(10회)를 쓴다.
     *    *"안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다."*
     *
     * ⚠️ 이 판단은 **지도에서 센다** — 상수 목록을 손으로 적지 않는다 (규칙 ⑤-4 ②).
     */
    it('🔴 이름이 겹치는 구는 단독형을 안 넣는다 (서울 중구 / 인천 중구)', () => {
        expect(cityAliases('서울 중구')).not.toEqual(expect.arrayContaining(['중구']));
        expect(cityAliases('인천 중구')).not.toEqual(expect.arrayContaining(['중구']));
        // 다만 원래 형태는 그대로 남는다 — 상세 화면은 시까지 보여 준다
        expect(cityAliases('서울 중구')).toEqual(expect.arrayContaining(['서울 중구']));
    });

    /**
     * 🔴 **방위 이름은 고유명이 아니다** (2026-08-23 실측으로 추가).
     *
     * 처음엔 "지도에서 세어 유일하면 넣는다"로 끝냈는데, 지도가 **수도권만** 담고 있어서
     * `서구`(인천)가 유일로 보였다. 실제로는 대전·광주·부산·대구에도 있다 —
     * **없는 데이터를 근거로 유일하다고 판정한 것**이다.
     *
     * 이름 자체가 답을 갖고 있다: `구` 를 떼고 **한 글자**면 방위·중심을 가리키는 말이지
     * 고유명이 아니다 (`서`·`동`·`남`·`북`·`중`). 손으로 목록을 적지 않아도 갈린다.
     *
     *     서구   → "서"   (1글자) → 고유명 아님 → 제외
     *     분당구 → "분당" (2글자) → 고유명    → 포함
     */
    it('🔴 방위 이름 구는 단독형을 안 넣는다 (지도가 수도권만 담고 있다)', () => {
        for (const p of ['인천 서구', '인천 동구', '대전 중구', '광주 북구', '부산 남구']) {
            const short = p.split(' ').pop()!;
            expect(cityAliases(p)).not.toEqual(expect.arrayContaining([short]));
        }
        // 두 글자 이상은 고유명이라 그대로 들어간다
        expect(cityAliases('서울 영등포구')).toEqual(expect.arrayContaining(['영등포구']));
    });

    it('구가 없는 시·군은 지금 그대로 (파주시 → 파주)', () => {
        expect(cityAliases('파주시').sort()).toEqual(['파주', '파주시']);
    });
});

describe('🧭 경유 목록 — 구도 함께 싣되 진행도는 비운다', () => {
    const regions = () => getDetourRegions(GWANGJU_TO_PAJU, 10, 3);

    it('경로가 성남 분당을 지나면 목록에 동이 잡힌다 (전제 확인)', () => {
        const r = regions();
        expect(r).not.toBeNull();
        const parents = Object.keys(r!.grouped);
        expect(parents.some(p => p.includes('분당'))).toBe(true);
    });

    /**
     * 🔴 앱은 도착 목록을 `destinationKeywords ∪ progressKm 키` 로 만든다.
     *    그러니 **progressKm 에 실으면 리스트·상세 양쪽에서 한 번에 산다.**
     */
    it('🔴 progressKm 에 구 단독형 키가 들어간다', () => {
        const pk = regions()!.progressKm;
        expect(Object.keys(pk)).toEqual(expect.arrayContaining(['분당구']));
    });

    /**
     * 🔴 값은 **`null`** 이다. 구는 넓어서 "몇 km 지점"이 하나로 안 정해진다 —
     *    0 이나 평균을 넣으면 없는 숫자를 지어내는 것이고(규칙 ④), 그 숫자로
     *    역주행 판정이 돌아 멀쩡한 콜이 막힌다.
     */
    it('🔴 구의 진행도는 null 이다 — 지어내지 않는다', () => {
        const pk = regions()!.progressKm as Record<string, number | null>;
        expect(pk['분당구']).toBeNull();
    });

    it('🔴 동의 진행도는 그대로 숫자다 (구 때문에 흐려지지 않는다)', () => {
        const pk = regions()!.progressKm as Record<string, number | null>;
        const dongs = Object.entries(pk).filter(([k]) => k.endsWith('동') || k.endsWith('읍') || k.endsWith('면'));
        expect(dongs.length).toBeGreaterThan(10);
        expect(dongs.every(([, v]) => v === null || typeof v === 'number')).toBe(true);
        expect(dongs.some(([, v]) => typeof v === 'number')).toBe(true);
    });

    it('🔴 겹치는 구 이름(중구)은 안 실린다', () => {
        expect(Object.keys(regions()!.progressKm)).not.toContain('중구');
    });

    /**
     * 🔴 **`progressKm` 에만 넣으면 앱까지 안 간다.**
     *
     * `buildAppProgressKm` 은 `destinationKeywords` 를 **돌면서** 진행도를 뽑는다
     * (지나온 구간을 뺄 때 목록과 진행도가 **한 벌로** 줄어야 하기 때문이다).
     * 그러니 구 이름이 도착 목록(`flat`)에도 있어야 앱이 받는다.
     */
    it('🔴 도착 목록(flat)에도 구 이름이 있다 — 없으면 앱까지 안 간다', () => {
        expect(regions()!.flat).toEqual(expect.arrayContaining(['분당구']));
    });

    it('🔴 도착 목록에 겹치는 구 이름은 안 들어간다', () => {
        expect(regions()!.flat).not.toContain('중구');
    });

    it('🔴 도착 목록에 방위 이름 구도 안 들어간다 (서구·동구·남구·북구)', () => {
        const flat = regions()!.flat;
        for (const g of ['서구', '동구', '남구', '북구', '중구']) expect(flat).not.toContain(g);
    });
});

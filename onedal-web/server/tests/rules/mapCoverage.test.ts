import fs from 'fs';
import path from 'path';
import { initGeoService, getCityRegionsWithRadius } from '../../src/services/geoService';

/**
 * 🗺️ **지도가 담는 범위 — 그물이 안 만들어지면 콜이 하나도 안 올라온다**
 * (기사님 질문 2026-09-06 · 볼트 실측 표에서 나왔다)
 *
 * 기사님: *"인천 남동공단에 있다고 가정하고 이런 화면을 본다면 청주로 목표를 잡으면
 * 몇 개를 잡을 수 있을까? 이 사람은 4개 잡아서 25만원을 이야기하고 있는데..
 * 우리 시스템도 그렇게 작동할까?"*
 *
 * 돌려 봤더니 **0개**였다.
 *
 *     청주 + 0km → 동 0개      청주 +20km → 동 0개
 *     청주 +10km → 동 0개      청주 +30km → 동 0개
 *
 * 🔴 뿌리는 필터가 아니라 **데이터**다. `merged_map.geojson` 이 서울·인천·경기만
 *    담아서 「청주」로는 `destinationKeywords` 가 **빈 배열**이 된다. 그리고 빈 목록은
 *    fail-closed 다 — `InsungParser.kt` 가 *"도착지 키워드가 비어 있습니다"* 로
 *    **전부 탈락**시킨다 (에 일부러 그렇게 고쳤다 · 규칙 ④).
 *
 * ⚠️ 그물 자체는 멀쩡하다. 지도에 있는 도시를 넣으면 잘 돈다 (아래 «그물은 돈다» 참조).
 *    **없는 것은 데이터뿐**이다.
 *
 * 🔴 같은 뿌리에서 나온 **두 번째** 증상이다. 첫 번째는 —
 *    지도가 수도권만 담아서 `서구`(인천)를 "유일"로 판정했다.
 *    그때는 «없는 데이터로 유일하다고 판정», 이번엔 «그물이 통째로 안 만들어짐».
 *
 * 이 검사가 하는 일은 둘이다:
 *   ① 지도가 **조용히 바뀌는 것**을 막는다 (생산자는 우리 사정을 모른다 — 아래 참조)
 *   ② 충청 확장이 **실제로 됐는지**를 판정한다
 */

beforeAll(() => {
    initGeoService();
});

/** 배차망 콜창에 실제로 떴던 하차지 — 볼트 2026-08-10·11 실측
 *  */
const REAL_DROPOFFS = {
    metro: ['상도동', '가수동', '논현동', '성곡동', '송도동', '경서동', '신도림동', '문정동'],
    chungcheong: ['오창읍', '옥산면', '성거읍', '갈마동'],
} as const;

describe('🗺️ 지도가 담는 범위', () => {
    /**
     * 🔴 **생산자는 우리 사정을 모른다.**
     *
     * 이 파일은 `~/reps/map/map` (지도 퀴즈 게임)에서 만들어 복사해 온 것이다
     * (해시 동일 · `onedal-map/README.md`). 게임의 목적은 **클릭 가능성**이라
     * 작은 지역을 뺄 수 있고(REPG-001 §5 `MIN_CLICKABLE_AREA_PX2`), 그러면
     * **우리 필터에서 동이 조용히 사라진다.** 소비자가 스스로 지킨다.
     */
    it('🔴 지도 파일의 뼈대가 안 바뀐다 — 8자리 읍면동만, 전부 _isEmdGroup', () => {
        const raw = fs.readFileSync(
            path.join(__dirname, '../../mapData/merged_map.geojson'), 'utf8');
        const fc = JSON.parse(raw);
        const feats = fc.features as Array<{ properties: Record<string, unknown> }>;

        expect(fc.type).toBe('FeatureCollection');
        // 리(里)는 8자리로 병합돼 있다 (REPG-001 §3.3 «리 전면 제외 확정»).
        // 콜창도 읍면동까지만 보여준다 (기사님 확인 2026-09-06) —
        // 10자리가 생기면 뼈대가 바뀐 것이다.
        const badCode = feats.find(f => String(f.properties.code).length !== 8);
        expect(badCode?.properties.code ?? '전부 8자리').toBe('전부 8자리');
        const notGroup = feats.find(f => f.properties._isEmdGroup !== true);
        expect(notGroup?.properties.code ?? '전부 그룹').toBe('전부 그룹');

        // 소비자 계약 — geoService·geoResolver 가 이 두 칸을 읽는다.
        // `intel.parentName` 은 없어도 SIG_KOR_NM 으로 폴백하므로 필수가 아니다.
        const missing = feats.find(f =>
            typeof f.properties.EMD_KOR_NM !== 'string' ||
            typeof f.properties.SIG_KOR_NM !== 'string');
        expect(missing?.properties.code ?? '두 칸 전부 있음').toBe('두 칸 전부 있음');
    });

    /**
     * 그물은 돈다 — 문제는 데이터뿐이라는 증거.
     * 이것이 깨지면 «지도가 없어서»가 아니라 **버퍼 확장이 고장 난 것**이다.
     */
    it('🟢 그물은 돈다 — 지도에 있는 도시는 반경만큼 넓어진다', () => {
        const r0 = getCityRegionsWithRadius('오산', 0);
        const r10 = getCityRegionsWithRadius('오산', 10);
        expect(r0.flat.length).toBeGreaterThan(10);
        expect(r10.flat.length).toBeGreaterThan(r0.flat.length);
        expect(Object.keys(r10.grouped).length).toBeGreaterThan(1);   // 시군구 경계를 넘는다
    });

    /**
     * ⚠️ **「경기」로는 못 찾는다** (이 검사를 짜다가 실측).
     *
     *     getCityRegionsWithRadius('경기', 0) → 0개
     *
     * 도(道) 이름은 부모 이름에 안 들어간다 — 부모는 `안산시 단원구`·`오산시` 다.
     * 버그가 아니다: 도착 목표(`destinationCity`)에 기사님이 넣는 것은
     * **시 이름**(파주·용인·청주)이지 도 이름이 아니다.
     * 그래서 여기서도 **실제 시 이름으로** 확인한다.
     */
    it('🟢 수도권 실측 하차지는 지금도 전부 그물에 있다', () => {
        const net = new Set<string>();
        for (const city of ['서울', '인천', '오산', '안산']) {
            for (const d of getCityRegionsWithRadius(city, 0).flat) net.add(d);
        }
        const missing = REAL_DROPOFFS.metro.filter(d => !net.has(d));
        expect(missing).toEqual([]);
    });

    /**
     * 🔴 **이것이 이 판의 빨간불이다** (신설 · 지도 확장 전에는 반드시 실패한다).
     *
     * 볼트가 인천 남동공단에서 「청주」를 목표로 넷을 잡아 242,800원을 만들었다.
     * 우리는 0개다 — 청주가 지도에 없어서 그물이 **빈 배열**이 되고, 빈 목록은
     * fail-closed 라 전부 탈락한다.
     *
     * 초록불이 되는 조건: `onedal-map` 이 `--regions 11 28 41 30 36 43 44` 로
     * 지도를 다시 만들어 서버 `mapData/` 에 들어오는 것.
     */
    it('🔴 충청권이 그물에 들어온다 — 청주·천안·대전 (지도 확장 전에는 실패)', () => {
        const cheongju = new Set(getCityRegionsWithRadius('청주', 0).flat);
        const cheonan = new Set(getCityRegionsWithRadius('천안', 0).flat);
        const daejeon = new Set(getCityRegionsWithRadius('대전', 0).flat);

        expect(cheongju.size).toBeGreaterThan(0);
        expect(cheongju.has('오창읍')).toBe(true);     // 볼트 77,000원 콜의 하차지
        expect(cheongju.has('옥산면')).toBe(true);     // 〃 70,000원
        expect(cheonan.has('성거읍')).toBe(true);      // 표 3·9번
        expect(daejeon.has('갈마동')).toBe(true);      // 표 3번 상차지
    });

    /**
     * 오산은 «청주 주변»이 아니라 «청주 가는 길»이다 (65km 밖).
     * 반경으로는 절대 안 들어온다 — 그건 경유 반경의 일이고, 첫짐 확정 뒤에만 생긴다.
     * 이 검사는 **반경을 키워서 때우려는 시도**를 막는다.
     */
    it('🔴 오산은 청주 반경으로 안 들어온다 — 축이 다르다 (반경으로 때우지 않는다)', () => {
        const cheongju30 = new Set(getCityRegionsWithRadius('청주', 30).flat);
        expect(cheongju30.has('지곶동')).toBe(false);
    });
});

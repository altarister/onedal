import { initGeoService, getCityRegionsWithRadius, cityAliases } from '../../src/services/geoService';

/**
 * 🔴 2026-08-12 — 필터가 조용히 새고 있던 두 가지를 고정한다.
 *
 * ① 반경의 뜻이 **"닿으면 포함"** 이었다. 동 하나가 수 km 라, 10km 라고 해 놓고
 *    훨씬 바깥 동네가 통째로 들어왔다. 기사님이 숫자를 줄여도 목록이 안 줄었다.
 *
 * ② 첫짐 모드에는 **시 별칭(`customCityFilters`)이 비어 있었다.** 그래서 앱의
 *    2단계 필터(`시 + 동` 교차 확인)가 아예 돌지 않고 동 이름만 봤다.
 *    수도권 안에만 같은 이름의 동이 97개 있다 — 파주 필터에 서울 서대문구
 *    `신촌동` 콜이 그대로 통과했다.
 */
beforeAll(() => {
    initGeoService();
});

describe('cityAliases — 앱이 도착지 텍스트에서 찾아볼 시 이름들', () => {
    it('접미사가 있는 표기와 없는 표기를 모두 낸다 (배차망이 어느 쪽을 쓸지 모른다)', () => {
        expect(cityAliases('파주시').sort()).toEqual(['파주', '파주시']);
        expect(cityAliases('서울 송파구')).toContain('서울 송파');
    });

    it('경기 광주는 광주광역시와 헷갈리므로 도를 붙인 표기도 받는다', () => {
        const a = cityAliases('광주시');
        expect(a).toEqual(expect.arrayContaining(['광주시', '광주', '경기 광주', '경기 광주시', '경광주']));
    });
});

describe('getCityRegionsWithRadius', () => {
    it('반경 0 은 그 도시의 동만 준다', () => {
        const r = getCityRegionsWithRadius('파주', 0);
        expect(r.flat.length).toBeGreaterThan(0);
        // 파주 밖의 시가 묶음에 끼어 있으면 안 된다
        expect(Object.keys(r.grouped).every(p => p.includes('파주'))).toBe(true);
    });

    /**
     * 회귀 방지의 핵심. 예전 방식(`booleanIntersects`)은 파주 10km 에 140개를 넣었다.
     * 중심점 기준으로 바꾼 뒤 122개다. 다시 140 근처로 돌아가면 판정이 되돌아간 것이다.
     */
    it('반경이 커져도 "닿기만 한" 동네까지 쓸어오지 않는다', () => {
        const r10 = getCityRegionsWithRadius('파주', 10);
        expect(r10.flat.length).toBeGreaterThan(getCityRegionsWithRadius('파주', 0).flat.length);
        expect(r10.flat.length).toBeLessThan(135);   // 옛 방식은 140개였다
    });

    it('반경을 줄이면 목록도 실제로 줄어든다 (기사님이 못 믿던 지점)', () => {
        const a = getCityRegionsWithRadius('용인', 1).flat.length;
        const b = getCityRegionsWithRadius('용인', 10).flat.length;
        expect(a).toBeLessThan(b);
    });

    it('🔴 첫짐에도 시 별칭이 실린다 — 없으면 앱이 동 이름만 보고 동명이인을 통과시킨다', () => {
        const r = getCityRegionsWithRadius('파주', 0);
        expect(r.customCityFilters.length).toBeGreaterThan(0);
        expect(r.customCityFilters).toEqual(expect.arrayContaining(['파주시', '파주']));
    });

    it('없는 도시는 빈 결과 — 별칭 칸도 빠짐없이 채워 보낸다', () => {
        const r = getCityRegionsWithRadius('존재하지않는시', 5);
        expect(r).toEqual({ flat: [], grouped: {}, customCityFilters: [] });
    });
});

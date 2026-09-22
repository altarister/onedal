import { getEffectiveDetourRadius, DEFAULT_DETOUR_RADIUS_KM } from '@onedal/shared';

/**
 * 🔴 경유 반경은 `getEffectiveDetourRadius` 를 거쳐 정한다 (`dispatchEngine` 이 부른다).
 *
 * 부르는 쪽이 `?? 10` 같은 값을 직접 쓰면 이 함수와 설정이 안 먹는다.
 * 함수를 만들어 두고 연결하지 않으면 그 함수는 "그렇게 되어 있다"는 착각만 남긴다.
 */
/**
 * 🔴 **이 함수는 값을 덮어쓰지 않는다.** `DELIVERING` 이라고 무조건 경유 0 으로 만들면
 * 기사님이 정한 반경이 영영 무시된다. 반경은 국면과 무관한 한 벌이고,
 * 운행 중 우회 금지는 판정이 거른다 — 아래 «그물이 아니라 판정의 일» 테스트가 그것을 지킨다.
 */
describe('경유 반경은 국면 설정이 정한다', () => {
    it('🔴 이 함수는 더 이상 값을 덮어쓰지 않는다 — 국면 설정이 진실이다', () => {
        expect(getEffectiveDetourRadius('DELIVERING', 5)).toBe(5);
        expect(getEffectiveDetourRadius('DELIVERING', 0)).toBe(0);
    });

    it('합짐 수집 중에는 기사님이 정한 반경 그대로', () => {
        expect(getEffectiveDetourRadius('GATHERING', 5)).toBe(5);
    });

    it('첫짐 대기 중에도 그대로 (경유 자체를 안 쓰지만 값은 보존한다)', () => {
        expect(getEffectiveDetourRadius('STANDBY', 5)).toBe(5);
    });

    /**
     * 🔴 **«운행 중엔 우회하지 않는다» 는 그물이 아니라 판정이 지킨다** (기사님 바로잡음):
     *    *"**영역 안에 들어가면 잡는 로직에서 버리는 것이 맞다.**"*
     *
     * 반경 값은 한 벌이라(기사님 확정 *"그 기준은 바꿔"*) **국면마다 다른 기본값이 없다**
     * (`DEFAULT_PHASE_SETTINGS` 가 없다). 그물(1차 필터)은 규칙 ⑤ 대로 **느슨하게 올리고**,
     * «지금 우회하면 안 된다»는 **판정(서버)이 거른다.** 반경을 0 으로 좁혀 막으면
     * 층을 잘못 쓴 것이다 — 기본값은 **편의**이지 규칙이 아니다.
     */
    it('🔄 운행 중 우회 금지는 그물이 아니라 판정의 일이다', () => {
        const shared = require("@onedal/shared");
        expect(shared.DEFAULT_PHASE_SETTINGS).toBeUndefined();
        // 값이 한 벌이라 기본 라인반경은 국면과 무관하다 (목업 기본값 6km)
        expect(shared.DEFAULT_FILTER_VALUES.detourRadiusKm).toBe(6);
        // 0 을 넣으면 그대로 0 이다 — 끊는 길은 살아 있다
        expect(getEffectiveDetourRadius('DELIVERING', 0)).toBe(0);
    });

    it('반경 0 은 "경유 없음"이 아니라 **경로 위만** 이다', () => {
        // getDetourRegions 가 0 이하를 50m 버퍼로 바꾼다 — 경로가 지나는 동은 전부 잡힌다.
        // (실측: 광주→파주 100km 경로에서 경유 0 이 58개 동. 첫짐 파주 41개보다 많다)
        // 빈 경유이 되면 키워드가 0개가 되어 콜 잡기가 통째로 멈춘다 — 그건 다른 뜻이다
        expect(getEffectiveDetourRadius('DELIVERING', 0)).toBe(0);
    });
});

describe('우회 반경 기본값은 한 곳에서만 정한다', () => {
    it('DB · 세션 기본값과 같은 5km', () => {
        // 🔴 부르는 곳마다 `?? 10` · `?? 1` · `?? 0` 처럼 기본값을 따로 적으면
        //    어느 값이 진짜인지 코드로 알 수 없다 — 이 상수 하나를 쓴다
        expect(DEFAULT_DETOUR_RADIUS_KM).toBe(5);
    });
});

import { getEffectiveDetourRadius, DEFAULT_DETOUR_RADIUS_KM, DEFAULT_PHASE_SETTINGS } from '@onedal/shared';

/**
 * 🔴 2026-08-12 — `getEffectiveDetourRadius` 는 **정의만 되어 있고 호출하는 곳이 없었다.**
 *
 * 주석에는 *"이 함수를 통해서만 detourRadiusKm 를 결정하므로 하드코딩이 원천 차단됩니다"*
 * 라고 적혀 있었는데, 정작 `syncDetourFilter` 는 `?? 10` 을 직접 쓰고 있었다.
 * 그래서 **운행 중(DELIVERING)에도 경유이 안 좁혀졌다** — 우회 금지가 아예 안 걸렸다.
 *
 * 문서가 코드보다 앞서 나간 경우다. 함수를 만들어 두고 연결하지 않으면
 * 그 함수는 "그렇게 되어 있다"는 착각만 남긴다.
 */
/**
 * 🔴 2026-08-14 — **강제 0 을 걷어냈다.** (docs/필터_재설계_명세.md §2-4)
 *
 * 옛 규칙: `DELIVERING` 이면 무조건 경유 0. 국면별 설정이 없던 시절, 운행 중 우회를
 * 끊을 방법이 이것뿐이었기 때문이다.
 *
 * 새 규칙: **운행중(`drive`) 국면이 자기 경유 허용값을 갖는다** (기본 0).
 * 기사님이 표에서 *"운행중: 우회허용반경(input, **기본값 0**)"* 으로 정하셨다 —
 * 강제가 아니라 기본값이다. 여기서 덮어쓰면 그 설정이 영영 무시된다.
 *
 * **의도는 그대로다** (운행 중엔 우회하지 않는다). 그것을 강제하던 자리가
 * 함수에서 **국면 기본값**으로 옮겨 갔을 뿐이다 — 아래 마지막 테스트가 그것을 지킨다.
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

    it('🔴 "운행 중엔 우회하지 않는다" 는 **국면 기본값**이 지킨다', () => {
        // 강제하던 자리가 여기로 옮겨 왔다. 이 값이 0 이 아니면 우회 금지가 풀린다
        expect(DEFAULT_PHASE_SETTINGS.drive.detourAllowKm).toBe(0);
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
        // 🔴 예전엔 dispatchEngine `?? 10` · socketHandlers `?? 1` · routes/filters `?? 0` 로
        //    같은 기본값이 네 갈래였다. 어느 값이 진짜인지 코드로 알 수 없었다
        expect(DEFAULT_DETOUR_RADIUS_KM).toBe(5);
    });
});

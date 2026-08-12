import { getEffectiveCorridorRadius, DEFAULT_CORRIDOR_RADIUS_KM } from '@onedal/shared';

/**
 * 🔴 2026-08-12 — `getEffectiveCorridorRadius` 는 **정의만 되어 있고 호출하는 곳이 없었다.**
 *
 * 주석에는 *"이 함수를 통해서만 corridorRadiusKm 를 결정하므로 하드코딩이 원천 차단됩니다"*
 * 라고 적혀 있었는데, 정작 `syncCorridorFilter` 는 `?? 10` 을 직접 쓰고 있었다.
 * 그래서 **운행 중(DELIVERING)에도 회랑이 안 좁혀졌다** — 우회 금지가 아예 안 걸렸다.
 *
 * 문서가 코드보다 앞서 나간 경우다. 함수를 만들어 두고 연결하지 않으면
 * 그 함수는 "그렇게 되어 있다"는 착각만 남긴다.
 */
describe('회랑 반경은 단계가 정한다', () => {
    it('🔴 운행 중에는 0 — 짐을 싣고 가는 중에 우회하지 않는다', () => {
        expect(getEffectiveCorridorRadius('DELIVERING', 5)).toBe(0);
        expect(getEffectiveCorridorRadius('DELIVERING', 20)).toBe(0);
    });

    it('합짐 수집 중에는 기사님이 정한 반경 그대로', () => {
        expect(getEffectiveCorridorRadius('GATHERING', 5)).toBe(5);
    });

    it('첫짐 대기 중에도 그대로 (회랑 자체를 안 쓰지만 값은 보존한다)', () => {
        expect(getEffectiveCorridorRadius('STANDBY', 5)).toBe(5);
    });

    it('반경 0 은 "회랑 없음"이 아니라 **경로 위만** 이다', () => {
        // getCorridorRegions 가 0 이하를 50m 버퍼로 바꾼다.
        // 빈 회랑이 되면 키워드가 0개가 되어 사냥이 통째로 멈춘다 — 그건 다른 뜻이다
        expect(getEffectiveCorridorRadius('DELIVERING', 5)).toBe(0);
    });
});

describe('우회 반경 기본값은 한 곳에서만 정한다', () => {
    it('DB · 세션 기본값과 같은 5km', () => {
        // 🔴 예전엔 dispatchEngine `?? 10` · socketHandlers `?? 1` · routes/filters `?? 0` 로
        //    같은 기본값이 네 갈래였다. 어느 값이 진짜인지 코드로 알 수 없었다
        expect(DEFAULT_CORRIDOR_RADIUS_KM).toBe(5);
    });
});

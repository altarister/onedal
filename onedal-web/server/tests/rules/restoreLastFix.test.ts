import { lastTrackPointOf } from '../../src/services/gpsTrackStore';

/**
 * 📍 **서버가 다시 뜨면 «마지막으로 아는 자리»도 되살린다**.
 *
 * ── 되살리지 않으면 ──
 *   세션의 `lastFix` 는 메모리에만 살아서, 서버가 다시 뜨면
 *   `/api/sim/driver-location` → `{ isFallback: true, source: 'home', at: null }`
 *   **좌표를 한 번도 받은 적 없는 상태**가 된다. 그러면 PC 지도의 「현위치」가
 *   **집(광주 초월읍)** 을 가리킨다 — 차는 이천에 있는데.
 *
 * 🔴 점은 `gps_tracks` 에 있으므로 복구가 `lastTrackPointOf` 로 읽는다 —
 *    칸이 있어도 안 읽으면 없는 것과 같다.
 *
 * ⚠️ **어제 것을 되살리지는 않는다** (규칙 ③ — 어제 상태가 오늘 되살아나지 않는다).
 *    영업일 경계는 `restoreWindow` 가 이미 안다 — 콜 복구가 쓰는 그 창을 같이 쓴다.
 * ⚠️ **`originOf` 는 그대로다.** 되살린 좌표가 5분보다 낡았으면 경로 기점은 여전히 집이다
 *    (낡은 좌표로 경로를 짜지 않게). 되살리는 것은 «내가 어디 있나»의 답이지 «어디서부터 짤까»가 아니다.
 */
describe('마지막 좌표 되살리기 — 점은 DB 에 있다', () => {

    it('🔴 읽는 문이 있다 (칸만 있고 안 읽으면 없는 것과 같다)', () => {
        expect(typeof lastTrackPointOf).toBe('function');
    });

    it('좌표가 없는 유저는 null 이다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(lastTrackPointOf('no-such-user', Date.now())).toBeNull();
    });

    /**
     * 🔴 **영업일 밖 점은 안 준다** — 어제 자리에서 오늘 콜을 재면 그물이 통째로 어긋난다.
     *    (그 판단을 부르는 쪽에 미루지 않는다 — 미루면 한 곳이 잊는다 · 규칙 ③)
     */
    it('🔴 영업일 밖이면 null 이다 — 어제 자리를 오늘 쓰지 않는다', () => {
        /* 아주 먼 미래를 «지금»으로 보면 DB 의 모든 점이 영업일 밖이다 */
        const 먼미래 = Date.now() + 30 * 24 * 3600 * 1000;
        expect(lastTrackPointOf('any-user', 먼미래)).toBeNull();
    });
});

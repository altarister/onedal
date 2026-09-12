import { lastTrackPointOf } from '../../src/services/gpsTrackStore';

/**
 * 📍 **서버가 다시 뜨면 «마지막으로 아는 자리»도 되살린다** (2026-09-12 실측).
 *
 * ── 실측 ──
 *   18:56  모의 주행이 이천 호법면에서 끝났다 (`gps_tracks` 에 그 점이 남아 있다)
 *   20:11  서버 재시작
 *   그 뒤   `/api/sim/driver-location` → `{ isFallback: true, source: 'home', at: null }`
 *
 *   **좌표를 한 번도 받은 적 없는 상태**가 됐다. 세션의 `lastFix` 는 메모리에만 살아서다.
 *   그래서 PC 지도의 「현위치」가 **광주 초월읍(집)** 을 가리켰다 — 차는 이천에 있는데.
 *
 * 🔴 **이 레포가 반복해 겪은 모양이다** — 「칸은 있는데 안 읽는다」.
 *    `gps_tracks.order_id` 가 칸을 갖고도 1,894점이 비어 있었고,
 *    `orderStops`·`places` 가 있는데 «없다»고 적힌 검토가 있었다. 여기도 같다 —
 *    **점은 DB 에 있는데 복구가 안 읽었다.**
 *
 * ⚠️ **어제 것을 되살리지는 않는다** (규칙 ③ — 어제 상태가 오늘 되살아나지 않는다).
 *    영업일 경계는 `restoreWindow` 가 이미 안다 — 콜 복구가 쓰는 그 창을 같이 쓴다.
 * ⚠️ **`originOf` 는 그대로다.** 되살린 좌표가 5분보다 낡았으면 경로 기점은 여전히 집이다
 *    (여주 사고 방어). 되살리는 것은 «내가 어디 있나»의 답이지 «어디서부터 짤까»가 아니다.
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

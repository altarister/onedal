import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 👣 **궤적 배선 검사** — 「좌표 알림 → 궤적」 사이를 **실제 이벤트로** 걸어 본다.
 *
 * 기사님 2026-09-12: *"궤적이 엉망이야. 카카오 궤적이 아닌 것 같아."* ·
 * *"목업에서는 이쁘게 나왔어"* · *"고치지 말고 목업에 있는 거 가져왔으면 문제 없는 거 아냐?"*
 *
 * 🔴 **규칙 검사(`filterReview`)는 «부르는가»만 본다** — 소스에 `pushTrail(` 이 있는지.
 *    그것만으로는 **다리가 실제로 이어졌는지** 모른다 (`via` 를 안 실으면 조용히 끝점만 쌓인다).
 *    그래서 여기서는 창에 이벤트를 **쏘아** 본다.
 */

/** 🪟 창을 흉내낸다 — 스토어가 `window.addEventListener` 로만 듣는다 */
class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow();
(globalThis as unknown as { window: EventTarget }).window = fakeWindow;

const { useDrivenTrailStore, ensureDrivenTrailSubscribed, clearDrivenTrail } =
    await import('./drivenTrailStore');

/** 📡 관제웹이 쏘는 그 알림 그대로 (`lib/gpsBridge` 의 `local-gps-update`) */
const gps = (lat: number, lng: number, via?: Array<{ lat: number; lng: number }>) =>
    fakeWindow.dispatchEvent(new CustomEvent('local-gps-update', { detail: { lat, lng, source: 'mock', via } }));

const segs = () => useDrivenTrailStore.getState().segments;

describe('궤적 — 좌표 알림에서 구간까지', () => {
    beforeEach(() => { ensureDrivenTrailSubscribed(); clearDrivenTrail(); });

    it('🔴 `via` 의 점을 **하나도 버리지 않는다** — 카카오 곡선이 그대로 남는다', () => {
        /* 1초 사이에 지난 폴리라인 점 넷 + 끝점 */
        gps(37.305, 127.3, [
            { lat: 37.301, lng: 127.3 }, { lat: 37.302, lng: 127.3 },
            { lat: 37.303, lng: 127.3 }, { lat: 37.304, lng: 127.3 },
        ]);
        expect(segs()).toHaveLength(1);
        expect(segs()[0]).toHaveLength(5);
        expect(segs()[0][0]).toEqual({ lng: 127.3, lat: 37.301 });
        expect(segs()[0][4]).toEqual({ lng: 127.3, lat: 37.305 });
    });

    it('🔴 2km 넘게 튀면 **구간을 끊는다** — 순간이동이 직선으로 남지 않는다', () => {
        gps(37.30, 127.3);
        gps(37.31, 127.3);        // ≈1.1km — 같은 구간
        expect(segs()).toHaveLength(1);
        gps(37.50, 127.3);        // ≈21km — 새 구간
        expect(segs()).toHaveLength(2);
        expect(segs()[1]).toHaveLength(1);
    });

    it('50m 안 움직임은 버린다 — 정거장에 서 있는 동안 점이 쌓이지 않는다', () => {
        gps(37.30, 127.3);
        for (let i = 0; i < 18; i++) gps(37.30, 127.3);   // 정차 연기 18초
        expect(segs()[0]).toHaveLength(1);
    });

    it('사이클이 끝나면 접는다 — 어제 자취가 오늘 지도에 살아나지 않는다', () => {
        gps(37.30, 127.3);
        clearDrivenTrail();
        expect(segs()).toHaveLength(0);
    });
});

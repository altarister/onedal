import { snapToRoute, progressAlongPolyline } from '../../src/services/geoService';

/**
 * 🛣️ **부여받은 경로 ↔ 실제 궤적 — 얼마나 벗어났나** (기사님 지시 2026-09-12 밤).
 *
 * 기사님: *"카카오 라인과 내 궤적이 같이 있어야 **얼마나 잘못 갔는지** 확인할 수 있을 것 같아."*
 *
 * ── 이 값이 이 표의 원래 이유다 ──
 * `gps_tracks` 는 2026-08-26 에 이 질문 때문에 생겼다 — *"네비게이션이 가리키는 경로를
 * 놓쳐서 지나치면 **얼마나 우회하게 되는 건지**… 부여받은 경로와 현실의 주행 궤적을
 * 매칭해야 차이를 확인할 수 있을 듯."* 그런데 점만 쌓고 **경로와 대 보지는 않았다.**
 *
 * 🔴 **재료는 이미 있었고 절반을 버리고 있었다.** `nearestPointOnLine` 이 진행도(`location`)와
 *    떨어진 거리(`dist`)를 **한 번에** 주는데, `progressAlongPolyline` 이 진행도만 꺼내고
 *    거리를 버렸다. 「얼마나 벗어났나」를 답할 값이 매 좌표마다 손에 들어왔다 사라졌다.
 */

/** 동서로 뻗은 직선 경로 — 위도 37.24 에서 경도 0.01도씩 (약 0.89km 간격) */
const eastWest = Array.from({ length: 11 }, (_, i) => ({ x: 127.00 + i * 0.01, y: 37.24 }));

describe('경로 이탈 — 부여받은 길에서 얼마나 떨어졌나', () => {

    it('경로 위에 있으면 이탈이 0 에 가깝다', () => {
        const r = snapToRoute(eastWest, { x: 127.05, y: 37.24 });
        expect(r).not.toBeNull();
        expect(r!.offRouteKm).toBeLessThan(0.01);
        expect(r!.progressKm).toBeGreaterThan(4);      // 대략 절반쯤 왔다
    });

    /**
     * 🔴 **이 한 건이 이 값을 만든 이유다.** 경로에서 북쪽으로 떨어진 자리는
     *    진행도만 보면 «경로 위 5km 지점»으로 보인다 — 스냅되기 때문이다.
     *    «벗어났다»를 답하는 것은 `offRouteKm` 뿐이다.
     */
    it('🔴 경로에서 벗어나면 그 거리가 나온다 — 진행도는 벗어남을 못 말한다', () => {
        /* 위도 0.01도 ≈ 1.11km 북쪽 */
        const off = snapToRoute(eastWest, { x: 127.05, y: 37.25 })!;
        const on = snapToRoute(eastWest, { x: 127.05, y: 37.24 })!;
        expect(off.offRouteKm).toBeGreaterThan(1.0);
        expect(off.offRouteKm).toBeLessThan(1.3);
        /* 🔴 진행도는 둘이 사실상 같다 — 그래서 진행도로는 이탈을 못 잰다 */
        expect(Math.abs(off.progressKm - on.progressKm)).toBeLessThan(0.1);
    });

    it('멀리 벗어날수록 값이 커진다', () => {
        const near = snapToRoute(eastWest, { x: 127.05, y: 37.245 })!;
        const far = snapToRoute(eastWest, { x: 127.05, y: 37.28 })!;
        expect(far.offRouteKm).toBeGreaterThan(near.offRouteKm * 5);
    });

    /** ⚠️ 경로를 모르면 **모른다** — 0 으로 채우면 «경로 위에 있었다»는 거짓말이 된다 (규칙 ④) */
    it('경로가 없으면 null 이다 — 0 이 아니다', () => {
        expect(snapToRoute(null, { x: 127.05, y: 37.24 })).toBeNull();
        expect(snapToRoute([], { x: 127.05, y: 37.24 })).toBeNull();
        expect(snapToRoute([{ x: 127, y: 37.24 }], { x: 127.05, y: 37.24 })).toBeNull();  // 점 하나는 선이 아니다
    });

    /**
     * 🔴 **옛 함수는 새 함수를 감싼 한 줄이어야 한다** (규칙 ③ — 두 벌이면 답이 갈라진다).
     *    같은 좌표에 두 함수를 먹여 **같은 진행도**가 나오는지 본다.
     */
    it('progressAlongPolyline 은 같은 답을 준다 — 계산이 두 벌이 아니다', () => {
        const gps = { x: 127.037, y: 37.2455 };
        expect(progressAlongPolyline(eastWest, gps)).toBe(snapToRoute(eastWest, gps)!.progressKm);
    });
});

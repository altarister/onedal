/**
 * 🚗 **한 걸음 — 목업에서 가져온 그대로** (기사님 *"그거 가져오라고 목업에서
 * 열심히 만든거 아냐"*).
 *
 * 원본은 지도 실험실의 주행 루프(`pages/MapMockup.tsx` 의 `setInterval` 안 `while`)다.
 * 거기서 **걸음 계산만** 꺼냈다 — 목업의 그 `useEffect` 에는 모의 시계·방문 확정·심사 기록이
 * 한 덩어리로 섞여 있어 통째로는 못 옮긴다. 섞인 것들은 목업에 그대로 두고 **이 함수만**
 * 양쪽이 부른다 (규칙 ③ — 원천 하나).
 *
 * 🔴 **점을 «다 밟는다».** 한 틱 걸음이 남는 만큼 여러 점을 이어 삼키고, 남으면 점 사이로
 *    들어간다. `idx += 15` 처럼 **건너뛰면** 카카오 곡선이 직선으로 펴진다 —
 *    기사님: *"궤적이 엉망이야. 카카오 궤적이 아닌 것 같아."*
 *
 * 🔴 **지나온 점을 `via` 로 전부 돌려준다.** 서버로 보내는 것은 끝점(`at`) 하나이고
 *    (한 틱에 한 좌표 — 서버 부담이 안 는다), 궤적은 `via` 를 쌓아 **카카오 곡선 그대로** 남는다.
 *
 * ⚠️ 평면 근사(`88.6` · `110.574` km/°)는 목업 그대로다 — 위도 37.28 기준.
 *    수도권 폭에서 수백 m 급 오차지만, **목업이 그 값으로 손맛을 맞춰** 두었다.
 *    바꾸면 목업의 주행이 달라진다 (`pnpm lab` 이 잡는다).
 */
/** ⏱️ `atMs` — 그 점을 지난 시각. 숨긴 콜의 자취를 시각으로 가를 때 쓴다(`pastCalls.trailOfShown`). 모르면 없다 */
export interface DrivePoint { lng: number; lat: number; atMs?: number }

/** 위도 37.28 평면 근사 — 목업 원본 그대로 */
const KM_PER_LNG = 88.6;
const KM_PER_LAT = 110.574;

export function driveStep(
    from: DrivePoint,
    path: DrivePoint[],
    startIdx: number,
    stepKm: number,
): { at: DrivePoint; idx: number; via: DrivePoint[]; finished: boolean } {
    let ti = startIdx;
    let remain = stepKm;
    let cur = from;
    const via: DrivePoint[] = [];

    // 실도로 점은 촘촘하다 — 한 틱 걸음이 남는 만큼 여러 점을 이어 삼킨다
    while (remain > 0 && ti < path.length) {
        const t = path[ti];
        const dx = (t.lng - cur.lng) * KM_PER_LNG, dy = (t.lat - cur.lat) * KM_PER_LAT;
        const d = Math.hypot(dx, dy);
        if (d <= remain) {
            cur = { lng: t.lng, lat: t.lat };
            via.push(cur);
            remain -= d;
            ti++;
        } else {
            cur = { lng: cur.lng + dx / d * remain / KM_PER_LNG, lat: cur.lat + dy / d * remain / KM_PER_LAT };
            via.push(cur);
            remain = 0;
        }
    }
    return { at: cur, idx: ti, via, finished: ti >= path.length };
}

/**
 * 👣 **궤적 한 점 쌓기 — 목업 `trailRef` 그대로** (`MapMockup.tsx:938`).
 *
 * 🔴 **구간 배열이다.** 2km 넘게 튀면 **끊고 새 구간**을 연다 — 순간이동은 주행이 아니다.
 *    한 줄로 이으면 정거장 좌표를 찍을 때(도로에서 601m 떨어진 물류센터)
 *    **도로 밖으로 튀었다 돌아오는 직선 둘**이 궤적에 남는다.
 * 🔴 제자리(50m 안)는 안 쌓는다 — 정차 중 잡음.
 */
export const TRAIL_JUMP_KM = 2;
export const TRAIL_MIN_KM = 0.05;

export function pushTrail(segments: DrivePoint[][], p: DrivePoint): DrivePoint[][] {
    const seg = segments[segments.length - 1];
    const last = seg?.[seg.length - 1];
    const jumpKm = last
        ? Math.hypot((p.lng - last.lng) * KM_PER_LNG, (p.lat - last.lat) * KM_PER_LAT)
        : Infinity;
    if (jumpKm < TRAIL_MIN_KM) return segments;              // 제자리 — 점을 안 쌓는다
    if (jumpKm > TRAIL_JUMP_KM || !seg) return [...segments, [p]];   // 순간이동 — 새 구간
    return [...segments.slice(0, -1), [...seg, p]];
}

/**
 * 👣 **장부의 점을 자취로 되살린다** (기사님:
 *    *"카카오라인과 내 궤적이 같이 있어야 얼마나 잘못갔는지 확인할 수 있을 것 같아"*).
 *
 * ── 왜 ──
 * `drivenTrailStore` 는 **브라우저 메모리에만** 쌓는다(`local-gps-update` 를 듣는다).
 * 그래서 새로고침하면 자취가 **0** 이 된다 — 장부(`gps_tracks`)에 그날 점이 다 남아 있으니
 * 거기서 되살린다.
 *
 * 🔴 **쌓는 규칙을 여기서 새로 짜지 않는다** — 위 `pushTrail` 을 그대로 접는다 (규칙 ③).
 *    되살린 자취가 라이브와 다른 모양이면 **같은 주행이 새로고침 전후로 다른 선**이 된다.
 * ⚠️ 장부는 **콜별로** 읽히므로(`?orderId=`) 여러 벌이 섞여 온다 — **시각으로 다시 줄을
 *    세운다.** 안 그러면 콜 경계에서 선이 되돌아가는 지그재그가 생긴다.
 * ⚠️ 좌표가 없는 행은 버린다 — 지어내지 않는다 (규칙 ④).
 *
 * 🔬 검사는 `trailFromPoints.test.ts`.
 */
export function trailFromPoints(
    points: Array<{ atMs: number; x: number; y: number }>,
): DrivePoint[][] {
    return [...points]
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.atMs))
        .sort((a, b) => a.atMs - b.atMs)
        .reduce<DrivePoint[][]>((segs, p) => pushTrail(segs, { lng: p.x, lat: p.y, atMs: p.atMs }), []);
}

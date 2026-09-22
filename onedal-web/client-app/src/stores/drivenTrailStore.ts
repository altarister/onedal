import { create } from 'zustand';
import { pushTrail, trailFromPoints, type DrivePoint } from '../lib/driveStep';

/**
 * 👣 **이번 사이클의 주행 궤적 — 표시 전용** (기사님 확정).
 *
 * 파란 경로선은 «앞으로 갈 길»이라 달리면서 잘려나가고 다 돌면 0 이 된다 — 그건 맞다.
 * 하지만 화면에는 **실제로 달린 자취**가 남아야 «어떻게 돌았는지»가 보인다 (발자취
 * 마커와 같은 원칙: 경로 계산에서는 빠지고 표시로는 남는다).
 *
 * 구독은 모듈에서 한 번 (ghostCard 규칙 — gpsFocusStore 와 같은 패턴).
 *
 * 🔴 **구간 배열이다** (목업에서 가져옴 · 2026-09-12). 점 하나짜리 평평한 배열이었더니
 *    GPS 가 끊겼다 이어진 자리, 시뮬을 다시 켠 자리, 콜이 바뀌어 딴 데서 시작한 자리가
 *    **한 줄로 이어져** 지도를 가로지르는 긴 직선이 생겼다. 쌓는 규칙은 목업과 **한 벌**이다
 *    (`lib/driveStep` 의 `pushTrail`) — 50m 미만은 버리고(정차 잡음), 2km 넘게 튀면 **구간을 끊는다.**
 *
 * 구간 2000개를 넘으면 앞을 버린다 (하루 운행이면 충분).
 */
export const useDrivenTrailStore = create<{ segments: DrivePoint[][] }>(
    () => ({ segments: [] }));

let subscribed = false;
export function ensureDrivenTrailSubscribed() {
    if (subscribed) return;
    subscribed = true;
    window.addEventListener('local-gps-update', (e: Event) => {
        const d = (e as CustomEvent<{ lat: number; lng: number; via?: Array<{ lat: number; lng: number }> }>).detail;
        if (d?.lat == null || d?.lng == null) return;
        /**
         * 👣 **지나온 점을 다 밟는다** — `via` 가 있으면 그 점들을 순서대로 쌓는다.
         *    1초에 한 번 오는 끝점만 이으면 카카오 곡선이 **직선 토막**으로 펴진다.
         */
        const walked = [...(d.via ?? []), { lat: d.lat, lng: d.lng }];
        let segs = useDrivenTrailStore.getState().segments;
        const atMs = Date.now();   // ⏱️ 숨긴 콜의 자취를 시각으로 가른다 (`trailOfShown`)
        for (const p of walked) segs = pushTrail(segs, { lng: p.lng, lat: p.lat, atMs });
        useDrivenTrailStore.setState({ segments: segs.slice(-2000) });
    });
}

/** 오늘 덱이 비면(자정에 어제분이 빠지면) 자취도 접는다 — 어제 자취가 오늘 지도에 살아나지 않는다 (규칙 ③ · 사이클 = 하루 2026-09-15) */
export const clearDrivenTrail = () => useDrivenTrailStore.setState({ segments: [] });

/**
 * 👣 **새로고침·재기동 뒤에도 오늘 달린 자취를 되살린다** (기사님 2026-09-12 밤:
 *    *"카카오라인과 내 궤적이 같이 있어야 얼마나 잘못갔는지 확인할 수 있을 것 같아"*).
 *
 * 🔴 **이 스토어는 메모리에만 산다** — 위 구독이 `local-gps-update` 를 들어 쌓을 뿐이라,
 *    새로고침하면 `segments: []` 로 시작해 **겹쳐 볼 자취가 아예 없었다.**
 *    장부(`gps_tracks`)에는 그날 점이 다 남아 있는데 화면이 안 읽고 있었다.
 *
 * ⚠️ **읽는 문이 «콜별»이다** (`GET /api/logbook/gps-track?orderId=`). 그래서 이번 사이클의
 *    콜을 하나씩 물어 **시각으로 다시 줄을 세운다**(`trailFromPoints`). 한 번에 받는 문이
 *    열리면 이 함수 안만 갈아끼우면 된다 — 부르는 쪽은 그대로다.
 * ⚠️ **빠지는 점이 있다** — 장부에서 `order_id` 가 빈 점(정거장이 없던 사이)은 콜별 문으로
 *    안 나온다. 실측 7~9% 다. 선이 그만큼 끊겨 보일 수 있다 (없는 것을 지어내진 않는다).
 *
 * 🔴 **한 번만 읽는다** — 판마다 다시 물으면 라이브로 쌓은 점을 덮는다.
 * 🔴 **라이브 점이 이미 있으면 손대지 않는다** — 모의 주행 중에 새로고침한 판이 아니라면
 *    비어 있고, 비었을 때만 씨를 뿌린다.
 */
let restoreTried = false;
export async function restoreDrivenTrail(orderIds: string[]): Promise<void> {
    if (restoreTried || orderIds.length === 0) return;
    restoreTried = true;
    try {
        /**
         * 🔴 **`apiClient` 를 모듈 최상단에서 들이지 않는다** (제가 당했다).
         *
         * 그 모듈은 불려 오는 순간 `window.location.origin` 을 읽는다(`serverTarget`).
         * 최상단에 두었더니 **이 스토어를 import 하는 검사 파일이 `window` 가 없는 판에서
         * 통째로 죽었다** — `Tests:` 숫자는 멀쩡한데 스위트 하나가 «없는 것»이 됐다
         * (onedal-web/CLAUDE.md: *"있는 검사가 안 불리면 없는 것이다"*).
         * 🟢 쓰는 자리에서 들이면 스토어는 **브라우저 없이도 불려 온다.**
         */
        const { apiClient } = await import('../api/apiClient');
        const perCall = await Promise.all(orderIds.map(id =>
            apiClient.get(`/logbook/gps-track?orderId=${encodeURIComponent(id)}`)
                .then(r => (r.data?.points ?? []) as Array<{ atMs: number; x: number; y: number }>)
                /* 한 콜이 없어도(궤적 없음·지워짐) 나머지는 살린다 */
                .catch(() => [])));
        const points = perCall.flat();
        if (points.length === 0) return;
        /* 🔴 그 사이 라이브가 쌓였으면 덮지 않는다 */
        if (useDrivenTrailStore.getState().segments.length > 0) return;
        useDrivenTrailStore.setState({ segments: trailFromPoints(points) });
        console.log(`👣 [자취 복구] 장부에서 ${points.length}점 — ${trailFromPoints(points).length}구간`);
    } catch {
        /* 🔴 못 읽어도 화면은 돈다 — 자취는 «표시»지 «판정 입력»이 아니다 */
    }
}

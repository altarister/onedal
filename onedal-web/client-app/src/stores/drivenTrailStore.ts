import { create } from 'zustand';
import { pushTrail, type DrivePoint } from '../lib/driveStep';

/**
 * 👣 **이번 사이클의 주행 궤적 — 표시 전용** (기사님 확정 2026-08-31).
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
        for (const p of walked) segs = pushTrail(segs, { lng: p.lng, lat: p.lat });
        useDrivenTrailStore.setState({ segments: segs.slice(-2000) });
    });
}

/** 사이클이 끝나면 자취도 접는다 — 어제 자취가 오늘 지도에 살아나지 않는다 (규칙 ③) */
export const clearDrivenTrail = () => useDrivenTrailStore.setState({ segments: [] });

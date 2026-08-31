import { create } from 'zustand';
import { getDistanceKm } from '../lib/routeUtils';

/**
 * 👣 **이번 사이클의 주행 궤적 — 표시 전용** (기사님 확정 2026-08-31).
 *
 * 파란 경로선은 «앞으로 갈 길»이라 달리면서 잘려나가고 다 돌면 0 이 된다 — 그건 맞다.
 * 하지만 화면에는 **실제로 달린 자취**가 남아야 «어떻게 돌았는지»가 보인다 (발자취
 * 마커와 같은 원칙: 경로 계산에서는 빠지고 표시로는 남는다).
 *
 * 구독은 모듈에서 한 번 (ghostCard 규칙 — gpsFocusStore 와 같은 패턴).
 * 20m 안 움직임은 버린다(정차 중 잡음), 2000점 넘으면 앞을 버린다(하루 운행이면 충분).
 */
export const useDrivenTrailStore = create<{ points: Array<{ x: number; y: number }> }>(
    () => ({ points: [] }));

let subscribed = false;
export function ensureDrivenTrailSubscribed() {
    if (subscribed) return;
    subscribed = true;
    window.addEventListener('local-gps-update', (e: Event) => {
        const d = (e as CustomEvent<{ lat: number; lng: number }>).detail;
        if (d?.lat == null || d?.lng == null) return;
        const pts = useDrivenTrailStore.getState().points;
        const lastP = pts[pts.length - 1];
        if (lastP && getDistanceKm(lastP.y, lastP.x, d.lat, d.lng) < 0.02) return;
        useDrivenTrailStore.setState({ points: [...pts.slice(-1999), { x: d.lng, y: d.lat }] });
    });
}

/** 사이클이 끝나면 자취도 접는다 — 어제 자취가 오늘 지도에 살아나지 않는다 (규칙 ③) */
export const clearDrivenTrail = () => useDrivenTrailStore.setState({ points: [] });

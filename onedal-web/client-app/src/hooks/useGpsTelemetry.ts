import { useEffect, useRef } from 'react';
import { useLocationStore } from '../stores/useLocationStore';
import { publishLocation } from '../lib/gpsBridge';

/**
 * GPS 좌표 변경 시 서버에 소켓으로 전송하는 훅.
 * 
 * 조건:
 * 1. 이전 전송 위치에서 50m 이상 이동했거나
 * 2. 마지막 전송 후 10초가 경과했을 때
 * 
 * 서버는 이 좌표를 받아 앱폰들에게 하달할 다이나믹 반경 필터를 계산합니다.
 */
export function useGpsTelemetry() {
    const { lat, lng, accuracy } = useLocationStore();
    const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

    useEffect(() => {
        if (lat === null || lng === null) return;

        const now = Date.now();
        const last = lastSentRef.current;

        // 최소 전송 조건 체크
        if (last) {
            const distanceM = haversineMeters(last.lat, last.lng, lat, lng);
            const elapsedMs = now - last.time;

            // 50m 미만 이동 AND 10초 미경과 → 스킵
            if (distanceM < 50 && elapsedMs < 10_000) return;
        }

        /**
         * 🔴 직접 emit 하지 않는다 — `publishLocation` 이 유일한 송신 자리다.
         *    예전에는 여기서 바로 쐈고, `useMasterGps` 도 따로 쐈다. 같은 스토어를 읽으니
         *    네이티브 위치가 갱신되면 **같은 좌표가 두 번** 나갔다 (2026-08-14 지도가 찾음).
         *    시뮬레이터가 도는 중이면 브리지가 알아서 막는다.
         */
        publishLocation(lat, lng, 'native', { accuracy: accuracy ?? undefined });
        lastSentRef.current = { lat, lng, time: now };

    }, [lat, lng]);
}

/** 두 좌표 간 직선 거리(m) 계산 (Haversine) */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // 지구 반지름 (m)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

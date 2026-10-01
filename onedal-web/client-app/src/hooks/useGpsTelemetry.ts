import { useEffect, useRef } from 'react';
import { useLocationStore } from '../stores/useLocationStore';
import { publishLocation } from '../lib/gpsBridge';
import { haversineKm } from '@onedal/shared';

/**
 * GPS 좌표 변경 시 서버에 소켓으로 전송하는 훅.
 * 
 * 조건:
 * 1. 이전 전송 위치에서 50m 이상 이동했거나
 * 2. 마지막 전송 후 10초가 경과했을 때
 * 
 * 서버는 이 좌표를 받아 앱폰들에게 하달할 다이나믹 반경 필터를 계산합니다.
 */
export function useGpsTelemetry(enabled = true) {
    const { lat, lng, accuracy } = useLocationStore();
    const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

    useEffect(() => {
        // 🧭 내비 화면(개인 폰)은 좌표를 안 보낸다 — 두 폰이 섞이면 도착 판정이 흔들린다
        if (!enabled) return;
        if (lat === null || lng === null) return;

        const now = Date.now();
        const last = lastSentRef.current;

        // 최소 전송 조건 체크
        if (last) {
            const distanceM = haversineKm(last, { lat, lng }) * 1000;
            const elapsedMs = now - last.time;

            // 50m 미만 이동 AND 10초 미경과 → 스킵
            if (distanceM < 50 && elapsedMs < 10_000) return;
        }

        /**
         * 🔴 송신은 `publishLocation` 한 곳으로 한다 — 여기서 따로 emit 하면 같은 스토어를 읽는
         *    다른 송신 자리와 겹쳐, 네이티브 위치가 갱신될 때 **같은 좌표가 두 번** 나간다.
         *    시뮬레이터가 도는 중이면 브리지가 알아서 막는다.
         */
        publishLocation(lat, lng, 'native', { accuracy: accuracy ?? undefined });
        lastSentRef.current = { lat, lng, time: now };

    }, [lat, lng]);
}


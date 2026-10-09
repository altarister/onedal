import { useEffect, useRef } from 'react';
import { useLocationStore } from '../stores/useLocationStore';
import { publishLocation } from '../lib/gpsBridge';

/**
 * 📍 **실 좌표를 서버 · 화면에 보내는 유일한 자리** (38 F09).
 *
 * 위치 감시(App 의 `useNativeLocation`)가 저장소에 넣은 좌표를 **좌표마다 한 번** `publishLocation` 한다 —
 * 같은 좌표만 거른다. 관제 화면(`useMasterGps`)은 받기만 한다.
 * 🔴 두 곳에서 보내면 좌표 하나가 두 번 흘러 «주행판정»이 속도 0 으로 떨어진다(달리는데 «서 있음» ·
 *    🚀 출발이 안 섬). 같은 좌표만 거르므로 서버는 좌표마다 받는다.
 *
 * 서버는 이 좌표를 받아 앱폰들에게 하달할 다이나믹 반경 필터를 계산합니다.
 */
export function useGpsTelemetry(enabled = true) {
    const { lat, lng, accuracy } = useLocationStore();
    const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);

    useEffect(() => {
        // 🧭 내비 화면(개인 폰)은 좌표를 안 보낸다 — 두 폰이 섞이면 도착 판정이 흔들린다
        if (!enabled) return;
        if (lat === null || lng === null) return;

        /* 같은 좌표면 건너뛴다 — 한 점은 한 번만 흐른다 */
        const last = lastSentRef.current;
        if (last && last.lat === lat && last.lng === lng) return;

        /**
         * 🔴 송신은 `publishLocation` 한 곳으로 한다 — 여기서 따로 emit 하면 같은 스토어를 읽는
         *    다른 송신 자리와 겹쳐, 네이티브 위치가 갱신될 때 **같은 좌표가 두 번** 나간다.
         *    시뮬레이터가 도는 중이면 브리지가 알아서 막는다.
         */
        publishLocation(lat, lng, 'native', { accuracy: accuracy ?? undefined });
        lastSentRef.current = { lat, lng };

    }, [lat, lng]);
}


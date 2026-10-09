import { useEffect } from 'react';
import { useLocationStore } from '../stores/useLocationStore';
import { publishLocation } from '../lib/gpsBridge';

/**
 * 📍 **실 좌표를 서버 · 화면에 보내는 유일한 자리** (38 F09).
 *
 * 위치 감시(App 의 `useNativeLocation`)가 저장소에 넣은 **측정마다 한 번** `publishLocation` 한다 — 한 점의 이름은
 * 측정 시각(저장소 `timestamp`)이다. 서 있어 좌표가 같아도 새 측정이면 흐르고(«아직 여기 있다» · 서버로는 gpsBridge 의
 * 같은 자리 6초 규칙 하나가 거른다), 캐시된 같은 측정이면 안 흐른다. 관제 화면(`useMasterGps`)은 받기만 한다.
 * 🔴 두 곳에서 보내면 좌표 하나가 두 번 흘러 «주행판정»이 속도 0 으로 떨어진다(달리는데 «서 있음» ·
 *    🚀 출발이 안 섬).
 *
 * 서버는 이 좌표를 받아 앱폰들에게 하달할 다이나믹 반경 필터를 계산합니다.
 */
export function useGpsTelemetry(enabled = true) {
    const { lat, lng, accuracy, timestamp } = useLocationStore();

    useEffect(() => {
        // 🧭 내비 화면(개인 폰)은 좌표를 안 보낸다 — 두 폰이 섞이면 도착 판정이 흔들린다
        if (!enabled) return;
        if (lat === null || lng === null) return;

        /**
         * 🔴 송신은 `publishLocation` 한 곳으로 한다 — 여기서 따로 emit 하면 같은 스토어를 읽는
         *    다른 송신 자리와 겹쳐, 네이티브 위치가 갱신될 때 **같은 좌표가 두 번** 나간다.
         *    시뮬레이터가 도는 중이면 브리지가 알아서 막는다.
         */
        publishLocation(lat, lng, 'native', { accuracy: accuracy ?? undefined });

    }, [timestamp]);   // 측정마다 한 번 — 같은 측정이면 효과가 안 돈다
}


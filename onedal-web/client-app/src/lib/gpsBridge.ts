import { socket } from './socket';

/**
 * 좌표가 **어디서 왔는가.** 받는 쪽이 이걸 알아야 거짓말을 안 한다.
 *   native   앱 웹뷰가 밀어 주는 위치
 *   browser  navigator.geolocation
 *   mock     시뮬레이터 (경로 위를 배속으로 달린다)
 */
export type GpsSource = 'native' | 'browser' | 'mock';

/**
 * 🔴 **서버에 위치를 알리는 유일한 자리.**
 *
 * 2026-08-14 `pnpm map` 이 찾은 것: `dashboard-gps-update` 를 **두 훅이 각각 쏘고 있었다** —
 * `useGpsTelemetry`(App 에서 항상)와 `useMasterGps`(운행 중). 둘 다 같은 `useLocationStore`
 * 를 읽으므로 네이티브 위치가 갱신되면 **같은 좌표가 두 번** 나갔고, 서로의 존재를 몰랐다.
 *
 * 더 나쁜 것은 **시뮬레이터가 달리는 동안 실제 좌표가 섞여 들어가는 것**이다.
 * 서버의 `driverLocation` 이 파주(가상)와 집(실제) 사이를 오가면 경로 진행도가 튀고,
 * 지나온 구간 제거가 되돌아간다.
 *
 * 그래서 "보내는 곳"을 함수 하나로 모았다. 누가 부르든 여기서 출처를 싣고,
 * 겹치는 좌표를 거른다. **호출자는 자기가 아는 것만 넘기면 된다.**
 */

/** 시뮬레이터가 마지막으로 좌표를 낸 시각 — 이 뒤 잠깐은 실제 좌표를 무시한다 */
let lastMockAt = 0;
/** 시뮬레이터가 도는 동안 실제 좌표를 막아 두는 시간. 시뮬레이터는 1초마다 낸다 */
const MOCK_HOLD_MS = 5_000;

let lastSent: { lat: number; lng: number } | null = null;
/** 마지막 **실제** 좌표. 시뮬레이션이 끝나면 여기로 되돌린다 */
let lastReal: { lat: number; lng: number; source: GpsSource } | null = null;

export interface PublishResult {
    /** 실제로 서버로 나갔나 */
    sent: boolean;
    /** 안 나갔으면 왜 */
    reason?: 'mock-running' | 'same-position';
}

/**
 * 위치를 서버와 화면에 알린다.
 *
 * @param source 어디서 온 좌표인가 — 화면이 속도를 어떻게 읽을지 결정한다
 */
export function publishLocation(
    lat: number,
    lng: number,
    source: GpsSource,
    extra?: { accuracy?: number },
): PublishResult {
    const now = Date.now();

    if (source === 'mock') {
        lastMockAt = now;
    } else if (lastReal = { lat, lng, source }, now - lastMockAt < MOCK_HOLD_MS) {
        // 🔴 시뮬레이터가 달리는 중이다. 실제 좌표를 끼워 넣으면 진행도가 튄다
        return { sent: false, reason: 'mock-running' };
    }

    // 같은 자리를 다시 보내지 않는다 (두 훅이 같은 스토어를 읽던 흔적)
    if (lastSent && lastSent.lat === lat && lastSent.lng === lng) {
        return { sent: false, reason: 'same-position' };
    }
    lastSent = { lat, lng };

    socket.emit('dashboard-gps-update', { lat, lng, source, accuracy: extra?.accuracy, timestamp: now });
    window.dispatchEvent(new CustomEvent('local-gps-update', { detail: { lat, lng, source } }));
    return { sent: true };
}

/**
 * 🔴 **시뮬레이션이 끝났다 — 가상 위치를 걷어낸다.**
 *
 * 2026-08-14: 시뮬레이터가 파주에서 멈춘 뒤 그 **가상 좌표가 서버에 남았다.** 그 상태로
 * 광주에서 콜을 잡으니 서버가 `파주(가짜 현위치) → 광주(상차) → 파주(하차)` 로 경로를
 * 그렸다 — 75.7km 짜리 콜의 총거리가 **156.2km** 로 나오고 지도에 이상한 선이 그려졌다.
 * 화면은 브라우저 좌표(광주)를 보고 있었으니 **서버와 화면이 서로 다른 곳을 알고 있었다.**
 *
 * 시뮬레이션이 끝났으면 거기 있는 게 아니다 — **없는 걸 지어내지 않는다**(규칙 ④).
 * 마지막으로 알던 **실제** 좌표로 되돌린다. 실제 좌표를 한 번도 받은 적이 없으면
 * 아무것도 하지 않는다 (원래부터 위치를 모르던 상태다 — 가짜로 채우지 않는다).
 */
export function endMockDriving(): void {
    lastMockAt = 0;
    if (!lastReal) {
        /**
         * 🧹 실좌표가 없다(책상 테스트) — 되돌릴 곳이 없으면 **걷어내라고 알린다** (2026-08-31).
         * 이 반쪽이 빠져서 가상 위치(직전 하차지)가 서버에 5분 잔류했고, 다음 첫짐
         * 경로가 거기서 빙 둘러 그려졌다 (기사님 실측 — 중리동 기점 · «시뮬이
         * 끝났으면 거기 있는 게 아니다» 원칙의 빠진 반쪽).
         */
        socket.emit('mock-driving-ended');
        return;
    }
    lastSent = null;   // 같은 좌표라도 다시 보내야 서버가 되돌아간다
    publishLocation(lastReal.lat, lastReal.lng, lastReal.source);
}

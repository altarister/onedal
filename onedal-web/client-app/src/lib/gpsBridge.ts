import { socket } from './socket';

/**
 * 좌표가 **어디서 왔는가.** 받는 쪽이 이걸 알아야 거짓말을 안 한다.
 *   native   앱 웹뷰가 밀어 주는 위치
 *   browser  navigator.geolocation
 *   mock     시뮬레이터 (경로 위를 배속으로 달린다)
 *   manual   기사님이 **손으로 찍은** 자리 (현황판 「📍 위치 찍기」 — 🏠 집 · 주소로 찾기)
 *
 * 🔴 **`manual` 은 따로 둔다** (서버 지적). 서버는 이 낱말을 알아듣는다
 *    (소켓 문에 화이트리스트가 없어 온 그대로 통과하고, `originOf` 의 `source` 와
 *    `gps_tracks.source` 가 그 값을 쥔다). 여기서 빠지면 찍은 좌표가 `mock` 으로 나가
 *    «배속으로 달린 가상 좌표»와 «손으로 찍은 자리»가 **한 이름으로 섞인다** — 사후에
 *    궤적을 열어도 가를 수 없다. 가짜 좌표를 진짜로 읽으면 경로 총거리가 부푸는 사고가
 *    나므로, 출처가 섞이는 것은 그 사고의 씨앗이다.
 * ⚠️ **낱말은 뒤에 붙인다.** `server/tests/rules/masterGps.test.ts` 가 이 줄을 문자열로
 *    무는데(`= 'native' | 'browser' | 'mock'`) 앞·중간에 끼우면 그 검사가 깨진다 —
 *    남의 영역 파일이라 손대지 않고 자리로 피한다.
 */
export type GpsSource = 'native' | 'browser' | 'mock' | 'manual';

/**
 * 🔴 **서버에 위치를 알리는 유일한 자리.**
 *
 * `dashboard-gps-update` 를 **두 훅이 각각 쏘면** — `useGpsTelemetry`(App 에서 항상)와
 * `useMasterGps`(운행 중) — 둘 다 같은 `useLocationStore` 를 읽으므로 네이티브 위치가
 * 갱신될 때 **같은 좌표가 두 번** 나간다.
 *
 * 더 나쁜 것은 **시뮬레이터가 달리는 동안 실제 좌표가 섞여 들어가는 것**이다.
 * 서버의 `driverLocation` 이 파주(가상)와 집(실제) 사이를 오가면 경로 진행도가 튀고,
 * 지나온 구간 제거가 되돌아간다.
 *
 * 그래서 "보내는 곳"은 이 함수 하나다. 누가 부르든 여기서 출처를 싣고,
 * 겹치는 좌표를 거른다. **호출자는 자기가 아는 것만 넘기면 된다.**
 */

/** 시뮬레이터가 마지막으로 좌표를 낸 시각 — 이 뒤 잠깐은 실제 좌표를 무시한다 */
let lastMockAt = 0;
/** 시뮬레이터가 도는 동안 실제 좌표를 막아 두는 시간. 시뮬레이터는 1초마다 낸다 */
const MOCK_HOLD_MS = 5_000;

let lastSent: { lat: number; lng: number; at: number } | null = null;
/**
 * ⏱️ **같은 자리라도 이 간격이면 다시 보낸다** (현황판 실측).
 *
 * 🔴 같은 자리를 아예 안 보내면, 정차하는 동안 좌표가 한 톨도 안 변해 **서버로 한 번도
 *    안 나간다.** 그러면 «5km/h↓ 가 이어지면 정차»가 **발화할 입력 자체가 없고**,
 *    궤적에도 정차 흔적이 남지 않는다.
 * 🔴 **중복 발신 사고의 원인은 «두 곳에서 쏘던 것»이지 «같은 자리를 주기적으로
 *    알리는 것»이 아니다.** 보내는 문은 이 함수 하나로 이미 모았다.
 * ⚠️ 서버 저장 규칙이 「50m 이상 or 15초 경과」라, 이 주기면 정차가 궤적에 한두 점으로 남는다.
 */
const SAME_SPOT_RESEND_MS = 6_000;
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
    extra?: { accuracy?: number; via?: Array<{ lat: number; lng: number }>; speedMultiplier?: number; stopped?: boolean },
): PublishResult {
    const now = Date.now();

    if (source === 'mock') {
        lastMockAt = now;
    } else if (lastReal = { lat, lng, source }, now - lastMockAt < MOCK_HOLD_MS) {
        // 🔴 시뮬레이터가 달리는 중이다. 실제 좌표를 끼워 넣으면 진행도가 튄다
        return { sent: false, reason: 'mock-running' };
    }

    /**
     * 🖥️ **화면에는 «아직 여기 있다»도 알린다** (기사님 실측).
     *
     * 아래 중복 거르기는 **서버로 가는 것만** 거른다. 화면 알림까지 막으면, 시뮬이
     * 정거장에 서 있는 동안 **좌표 알림이 한 번도 안 나가** 속도계가 마지막 주행값에
     * 얼어붙는다(«도착했는데 이동 중 87km/h»).
     * 🔴 정지는 «사건이 없는 것»이 아니라 **«같은 자리에 있다»는 사실**이다 (규칙 ④).
     * ⚠️ 실 GPS 는 좌표가 미세하게 흔들려 이 거르기에 걸리지 않는다 — 모의 주행에서만 난다.
     */
    /**
     * 👣 **`via` 는 «이번 걸음에 **지나온** 좌표들»이다**.
     *    1초에 한 번 좌표를 내는데 배속을 걸면 그 사이에 카카오 폴리라인 점 열 몇 개를
     *    지난다. 끝점만 알리면 궤적이 **그 점들을 건너뛴 직선**이 되어 곡선이 펴진다
     *    (기사님: *"궤적이 엉망이야. 카카오 궤적이 아닌 것 같아"*).
     *    🔴 **서버로는 끝점만 간다** — 서버가 아는 것은 «지금 어디»지 «어떻게 왔나»가 아니다.
     */
    window.dispatchEvent(new CustomEvent('local-gps-update', { detail: { lat, lng, source, via: extra?.via } }));

    /**
     * 🛑 같은 자리는 아껴 보낸다 — **단, «서 있다»는 사실이면 아끼지 않는다**.
     *
     * 🔴 **정차 눈금과 억제 주기가 서로를 알아야 하는 관계를 두지 않는다.** 아래 억제는 6초인데,
     *    정차가 그보다 짧으면 **정차 좌표가 한 점도 안 나간다** — 6초째 재전송 순간엔 이미 떠나 있다
     *    (`gps_tracks` 88점 · 5배속 예):
     *
     *        18:32:45   88m   서행 끝 — 정거장에 닿음
     *        18:32:51  408m   🔴 6초 공백. 그 사이 서 있었는데 점이 없다
     *        ⇒ 같은 자리(0m) 점 **0건**
     *
     * 🟢 그래서 «서 있다»(`stopped`)면 억제하지 않는다 — 정차 눈금을 몇 초로 돌리든 정차는 궤적에 남는다.
     * ⚠️ `stopped` 는 **모의 주행만** 싣는다. 실 GPS 궤적은 이 억제에 걸리지 않는다
     *    (실좌표는 미세하게 흔들린다).
     */
    if (!extra?.stopped
        && lastSent && lastSent.lat === lat && lastSent.lng === lng
        && now - lastSent.at < SAME_SPOT_RESEND_MS) {
        return { sent: false, reason: 'same-position' };
    }
    lastSent = { lat, lng, at: now };

    /* 🎭 배속을 함께 보낸다 — 궤적에 «실제 속도»를 남기려면 서버가 나눌 수를 알아야 한다 */
    /**
     * ⏸️ **«서 있다»도 함께 보낸다** (현황판 실측).
     *    정지는 «사건이 없는 것»이 아니라 «같은 자리에 있다»는 **사실**이다 —
     *    화면에 알리는 것과 같은 논리로 **서버 저장에도 싣는다** — 없으면
     *    정차가 궤적에 한 점도 안 남는다.
     */
    socket.emit('dashboard-gps-update',
        { lat, lng, source, accuracy: extra?.accuracy, speedMultiplier: extra?.speedMultiplier,
          stopped: extra?.stopped, timestamp: now });
    return { sent: true };
}

/**
 * 🔴 **시뮬레이션이 끝났다 — 마지막 실제 좌표로 되돌린다.**
 *
 * 가상 좌표가 서버에 남은 채 다른 곳에서 콜을 잡으면, 서버가 `가짜 현위치 → 상차 → 하차` 로
 * 경로를 그려 총거리가 부풀고(75.7km 콜이 156.2km 로) 지도에 이상한 선이 그려진다 —
 * **서버와 화면이 서로 다른 곳을 알게 된다.**
 *
 * 시뮬레이션이 끝났으면 거기 있는 게 아니다 — **없는 걸 지어내지 않는다**(규칙 ④).
 * 마지막으로 알던 **실제** 좌표로 되돌린다. 실제 좌표를 한 번도 받은 적이 없으면
 * 아무것도 하지 않는다 (원래부터 위치를 모르던 상태다 — 가짜로 채우지 않는다).
 */
export function endMockDriving(): void {
    lastMockAt = 0;
    if (!lastReal) {
        /**
         * 🔄 **실좌표가 없으면 아무 일도 하지 않는다** (기사님 지시) — 서버에
         *    `mock-driving-ended` 를 쏘지도, 화면을 집으로 되돌리지도 않는다.
         *
         * 🔴 서버는 가상 좌표를 지우지 않는다 — `originOf` 가 물을 때마다 «이 좌표를 지금
         *    기점으로 쓸까»를 고르고, **콜을 쥔 동안에는 그 자리를 그대로 쓴다.**
         *    그러니 화면만 집으로 되돌리면 **두 곳이 다른 말을 한다** (규칙 ③).
         */
        return;
    }
    lastSent = null;   // 같은 좌표라도 다시 보내야 서버가 되돌아간다
    publishLocation(lastReal.lat, lastReal.lng, lastReal.source);
}

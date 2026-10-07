/**
 * 🧭 **기점 · 위치 · 도착** — 지금 기점(GPS · 집) · 경로 위 위치 · GPS 이동 처리 · 정거장 도착/지나침 감지.
 * 🔴 이 파일은 지역 셈(geoRegions)을 가져오지 않는다 — 방향: geoMotion · geoRegions → geoService(지도 읽기 · 이름).
 */
import { getActiveCalls } from '../core/helpers';
import { planArrivalStops, type ArrivalStop } from './routeComposer';
import type { MyOrder } from '@onedal/shared';
import { haversineKm, DEFAULT_JUDGMENT } from '@onedal/shared';
import { shouldStoreGpsPoint, bufferGpsPoint, type GpsPoint } from './gpsTrackStore';
/**
 * 🔴 **타입만 가져온다** (`import type`). 런타임 값을 가져오면 순환 참조가 되어 부팅이 막힌다.
 *    이 파라미터를 `any` 로 두면 세션에서 사라진 필드를 읽는 함수가 **null 만 반환해도
 *    아무도 모른다** (`getActivePolyline`·`getLastDropoffCoord`).
 */
import type { UserSession } from '../state/userSessionStore';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { slog } from '../utils/fileLogger';
import { turf } from "./geoService";

/**
 * 지금 GPS 가 **경로 몇 km 지점인가** (출발점 기준 누적 거리).
 *
 * 이동할 때마다 도는 유일한 지리 연산이다 — 실측 0.14ms.
 * 경로에서 멀리 벗어나 있어도 가장 가까운 점으로 스냅되므로 값은 늘 나온다.
 */
export function progressAlongPolyline(
    polyline: Array<{ x: number; y: number }>,
    gps: { x: number; y: number },
): number | null {
    return snapToRoute(polyline, gps)?.progressKm ?? null;
}

/**
 * 🛣️ **부여받은 경로에 지금 자리를 대 본다 — «어디쯤»과 «얼마나 벗어났나»를 함께 낸다.**
 *
 * 기사님: *"카카오 라인과 내 궤적이 같이 있어야 **얼마나 잘못 갔는지**
 * 확인할 수 있을 것 같아."* — `gps_tracks` 를 만든 원래 이유가 그것이다
 * (*"네비게이션이 가리키는 경로를 놓쳐서 지나치면 얼마나 우회하게 되는 건지…
 * 부여받은 경로와 현실의 주행 궤적을 매칭해야 차이를 확인할 수 있을 듯"*).
 *
 * 🔴 `nearestPointOnLine` 은 스냅한 점의 **진행도(`location`)와 떨어진 거리(`dist`)를
 *    한 번에** 준다. 한 번 계산해서 둘 다 돌려준다 (규칙 ③).
 *
 * ⚠️ **경로를 벗어나도 값은 늘 나온다** — 가장 가까운 점으로 스냅되기 때문이다.
 *    그래서 «벗어났나»는 `offRouteKm` 이 답하지 `progressKm` 이 답하지 않는다.
 * ⚠️ 실측 0.14ms. 이동할 때마다 도는 유일한 지리 연산이다.
 */
export function snapToRoute(
    polyline: Array<{ x: number; y: number }> | null | undefined,
    gps: { x: number; y: number },
): { progressKm: number; offRouteKm: number } | null {
    if (!polyline || polyline.length < 2) return null;
    try {
        const line = turf.lineString(polyline.map(p => [p.x, p.y]));
        const snapped = turf.nearestPointOnLine(line, turf.point([gps.x, gps.y]));
        const progressKm = snapped.properties?.location as number | undefined;
        const offRouteKm = snapped.properties?.dist as number | undefined;
        if (progressKm == null || offRouteKm == null) return null;   // 모르면 모른다 (규칙 ④)
        return { progressKm, offRouteKm };
    } catch {
        return null;
    }
}

/**
 * 지금 달리고 있는 경로의 폴리라인.
 *
 * 🔴 `session.myOrders` 에서 읽는다. 이 함수가 null 을 내면 지나온 구간 제거가 돌지 않아
 *    달리는 내내 이미 지나친 동네의 콜이 필터에 걸려 있다.
 *
 * 경유를 만드는 `syncDetourFilter` 와 **같은 기준**을 쓴다 — 마지막 활성 콜의 경로.
 * 다르면 "경유를 만든 경로"와 "진행도를 재는 경로"가 어긋나 엉뚱한 동이 빠진다.
 */
export function getActivePolyline(session: { myOrders: MyOrder[] }): Array<{x: number; y: number}> | null {
    const active = getActiveCalls(session);
    if (active.length === 0) return null;
    const poly = active[active.length - 1]?.routePolyline;
    return poly && poly.length >= 2 ? poly : null;
}


/**
 * 마지막 하차지 좌표 — **도착 감지의 기준점.**
 *
 * 🔴 `session.myOrders` 에서 읽는다. 이 함수가 null 을 내면 하차지 500m 도착 감지가 돌지 않아
 *    `driverAction` 이 `UNLOADING` 으로 자동 전환되지 않는다.
 *
 * 기준은 **경로의 마지막 점**이다. 경유가 하차지 반경을 그릴 때 쓰는 좌표와 같아야
 * "도착했다"와 "도착지 주변이다"가 어긋나지 않는다.
 * 경로가 아직 없으면 콜에 실려 온 하차지 좌표로 물러선다.
 */
export function getLastDropoffCoord(session: { myOrders: MyOrder[] }): {x: number; y: number} | null {
    const active = getActiveCalls(session);
    if (active.length === 0) return null;

    const last = active[active.length - 1];
    const poly = last?.routePolyline;
    if (poly && poly.length > 0) {
        const end = poly[poly.length - 1];
        return { x: end.x, y: end.y };
    }
    if (last?.dropoffX != null && last?.dropoffY != null) {
        return { x: last.dropoffX, y: last.dropoffY };
    }
    return null;
}


/** 
 * [마스터 GPS 처리] 관제웹에서 보내온 실시간 GPS(또는 시뮬레이션 GPS)를 기반으로
 * 1. 현재 세션의 위치를 업데이트
 * 2. 2km 이상 이동 시 경유(Detour Trim) 동적 축소 계산 및 필터 갱신
 * 3. 마지막 하차지 500m 이내 도착 시 ARRIVED 상태로 전환
 */
/** 이만큼 움직였을 때만 위치를 남긴다 (기사님 결정: "이동이 있을 때만") */
const GPS_LOG_MIN_KM = 0.2;

/**
 * 이 속도를 넘으면 **트럭이 낸 속도가 아니다** — 위치가 튄 것이다.
 * 위치 파이프가 둘이면 서로 다른 좌표가 번갈아 와서 `11669km/h` 같은 값이 찍힌다.
 *
 * ⚠️ **시뮬레이터에는 쓰지 않는다.** 개발용 시뮬레이터는 15배속이라 매 틱이 이 속도를 넘는다 —
 *    그대로 두면 로그가 거짓 경보로 뒤덮여 진짜 사건이 묻힌다 (만들자마자 실측으로 확인했다).
 */
const IMPLAUSIBLE_SPEED_KMH = 200;

/**
 * 한 번에 이만큼 건너뛰면 **어느 출처든 순간이동이다.**
 * 실측 예: 합짐 하나를 내리자 시뮬레이터가 파주 → 광주 원점으로 **52.6km** 를 한 틱에
 * 건너뛰었다. 정상 틱은 0.1~0.6km 다.
 * (터널을 나온 실 GPS 는 오래 끊겼다 다시 잡히므로 아래 시간 조건으로 걸러진다)
 */
const GPS_JUMP_MIN_KM = 5;
const GPS_JUMP_MAX_GAP_S = 30;

/**
 * 🔴 **속도를 재려면 표본이 커야 한다**.
 *
 * 표본이 작으면 「위치 점프」 경고가 `0.0km 를 0.0초에` 로 쏟아진다 (주행 로그 70줄 중 43줄).
 * 1m 움직인 것을 `46395km/h` 로 경고한다 — `속도 = 거리 ÷ 시간` 인데 시간이 0에
 * 가까우면 거리가 아무리 작아도 속도가 폭발하기 때문이다(`elapsedS` 바닥이 0.001초).
 *
 * 그러면 **진짜 점프와 구분이 안 된다.** 경고가 너무 자주 울리면 경고가 아니다.
 *
 * ⚠️ 이건 **로그 문턱**이지 `speedKmh` 를 바꾸는 게 아니다 — 그 값은 도착 감지가
 *    쓰고 있어, 손대면 감지가 흔들린다.
 */
const SPEED_SAMPLE_MIN_KM = 0.05;
const SPEED_SAMPLE_MIN_S = 1;

/**
 * 이 틱의 속도를 «믿을 수 있는가» — 순수 계산이라 폰 없이 검사된다.
 * 표본이 작으면(50m 미만 · 1초 미만) 속도는 의미가 없다.
 */
export function isSpeedSampleUsable(movedKm: number, elapsedS: number): boolean {
    return movedKm >= SPEED_SAMPLE_MIN_KM && elapsedS >= SPEED_SAMPLE_MIN_S;
}

/**
 * 도착 감지 파라미터
 *
 * · RADIUS_KM 0.5 — 기존값 유지. 주차 위치·GPS 오차 감안 (바꿀 실측 근거가 아직 없다)
 * · STILL_KMH 5 · HOLD_SEC 30 — "통과"와 "도착"을 가른다. 정거장 옆 도로를 지나가는
 *   것만으로 500m 안에 반드시 들어오므로, **실 GPS 는 근접+정지 30초**여야 도착이다.
 *   ⚠️ 신호 대기(60~120초)는 못 거른다 — 오발 시 undo 로 뒤집는다 (자동은 ARRIVED_* 뿐이라
 *   상태 피해가 없다). L4 실측으로 빈도를 보고 조정한다.
 * · 시뮬(`mock`)은 15배속이라 "정지"가 없다 — 근접만으로 판정 (안 가르면 L4 검증 불가)
 * · NOTICE_KM 3 — 근접 예고(도착전 통화). 시내 ~35km/h 로 약 5분
 */
export const GPS_ARRIVAL = {
    RADIUS_KM: 0.5,
    STILL_KMH: 5,
    HOLD_SEC: 30,
    NOTICE_KM: 3,
    /**
     * 🚚 **떠남 판정(예비)** — 하차지에 **도착이 찍힌 뒤** 이만큼 멀어지면 «내리고 갔다».
     *    (기사님 확정: *"2km 로 정하고 진행해 보자"*)
     *
     * ⚠️ **지나침 판정**(`evaluatePassTick` · 진입 300m → 이탈 400m)이
     *    상차·하차 둘 다를 **도착과 무관하게** 처리한다. 이 2km 규칙은 그보다 늦게
     *    걸리므로 사실상 예비다 — 지나침이 먼저 찍으면 여기는 할 일이 없다.
     *
     * 기사님: *"곤지암과 부발에서 멀어진 거면 하차를 했는데 버튼을 못 누른 걸로 봐야
     * 하지 않을까… 운행 중에 클릭 못 할 거라 말이지."*
     *
     * 🔴 운전 중에는 아무것도 못 누른다. GPS 는 도착을 찍어도 **손으로 눌러야 하는 네 단계
     *    (통화·상차완료·하차통화·하차완료)는 비어 남는다** — 그러면 적재가 남아 다음 콜이 차종에서 막힌다.
     *
     * ⚠️ **되돌릴 수 없는 기록이 아니다.** 단계 표는 `UNIQUE(orderId)` + `INSERT OR REPLACE`
     *    라 나중에 그 단계에서 고칠 수 있고, 하차 완료된 콜은 `TERMINAL_STATUSES` 라
     *    적재·경로 계산에서 빠져 **다른 콜과 관계가 끊긴다**. 고쳐도 남에게 번지지 않는다.
     */
    DEPARTED_KM: 2,
} as const;

/**
 * 📍 **이 시간 넘게 좌표가 안 오면 «지금 위치»가 아니다** (기사님 실측).
 *
 * 기사님: *"경로가 이상하게 그리는건 이유가 뭐야?"*
 *
 * 14:24 에 모의 주행이 **여주**에서 끝났는데, 4시간 25분 뒤 **광주**에서 콜을 잡을 때도
 * 서버가 그 여주 좌표를 현위치로 믿었다. 경로 요청 origin 이 세 번 다 소수점 14자리까지
 * 같았다 — 접근 구간이 **40km 뒤로** 잡혀 지도가 그렇게 그려졌다.
 * 실 운행에서도 터널·실내 주차장에서 GPS 가 끊기면 같은 형태로 난다.
 *
 * ── 값의 근거 ──
 * 관제웹이 붙어 있으면 위치는 **초 단위**로 온다. 5분간 한 번도 안 왔다면 그건
 * «잠깐 튄 것»이 아니라 **연결이 끊긴 것**이다. 그리고 5분이면 차가 최대 8km 움직여
 * 접근 구간(현위치 → 상차지)이 이미 무의미해진다.
 */
export const DRIVER_LOCATION_STALE_MS = 5 * 60 * 1000;

/**
 * 낡은 현위치를 **비운다** — 판단하는 곳은 여기 하나뿐이다 (규칙 ③).
 *
 * 비우면 이미 있는 «내 주소로 메우기» 길이 받고, 화면이 «내 주소 기준»이라고 말한다
 * (`originIsFallbackLEGACY`). 없는 값을 지어내지 않는다 (규칙 ④).
 *
 * ⚠️ **타이머를 두지 않는다.** 읽는 순간 빼기 한 번이다 — 타이머는 좀비가 되고(규칙 ②),
 *    5분마다 깨어나도 «4분 59초»와 «9분 59초»를 똑같이 취급해 오히려 부정확하다.
 * ⚠️ **받은 시각을 모르면 건드리지 않는다** — 없는 값으로 지우지 않는다 (규칙 ④).
 */
/**
 * 📍 **«지금 기점» — 저장하지 않고 물을 때 고른다** (기사님 지시).
 *
 * 기사님: *"함수가 함수를 부르는 것이 이상해. **상태가 바뀌면 거기에 따라 알아서
 * 바뀌어야 하는 거 아냐?** 함수가 여러 가지 일을 하는 것이 별로야."*
 *
 * ── 왜 저장하지 않나 ──
 * «지금 위치»를 세션에 써 두고 조건이 어긋날 때 지우면, 지우는 손이 여럿(낡음 · 빈 차인데 가짜 ·
 * 주행 끝 · 비운 뒤 메우기)이 같은 질문에 각자 답한다. 한 손만 조건을 바꾸면 «반만 고침»이 난다 —
 * 콜을 쥔 채 경로 끝에 닿으면 위치가 집으로 튀어 경로 순서가 뒤집히고 버퍼가 음수가 된다.
 *
 * ── 그래서 ──
 * 세션에는 **«마지막으로 받은 좌표»(`lastFix`)만** 남는다. 아무도 안 지운다.
 * «지금 기점»은 물을 때마다 여기서 고른다 — 상태가 바뀌면 **다음 답이 저절로 달라진다.**
 * 「언제 지울까」라는 질문이 사라졌으므로 반만 고칠 자리도 없다 (규칙 ③).
 *
 * 🔴 **셋 중 하나라도 어긋나면 집 주소를 쓴다** — 그리고 `isFallback` 으로 **그 사실을 말한다.**
 *    추정으로 계산했다는 것을 숨기지 않는다 (규칙 ⑤-2).
 *   ① 좌표가 없다
 *   ② 낡았다 — 5분 넘은 좌표는 «지금»이 아니다 (몇 시간 전 좌표를 «지금»으로 믿으면
 *      접근 구간을 수십 km 뒤로 그린다)
 *   ③ **빈 차(STANDBY)인데 가짜다** — 모의 좌표는 콜을 쥔 동안에만 «지금 위치»다.
 *      시뮬이 멈춘 뒤 남은 좌표를 쓰면 다음 콜 경로가
 *      «파주 → 광주 → 파주» 처럼 엉뚱하게 그려진다.
 *      ⚠️ **실 GPS 에는 이 제한이 없다** — 차를 세워 둬도 기사님은 진짜 거기 계신다.
 */
export interface DriverOrigin {
    x: number;
    y: number;
    /** 📍 이 좌표가 어디서 왔나 — 화면이 적을 말 (`home` 은 «대신 쓰는 중»이다) */
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 집 주소로 대신한 것인가 — «추정으로 쟀다»를 화면이 말할 수 있게 */
    isFallback: boolean;
}

/**
 * 🎭 **모의 GPS 소켓이 이만큼 조용하면 «모의 주행이 멈췄다»** — 관제웹 두 곳이 겹칠 때 임자를 넘기는 기준과 같은 값이다
 *    (`socketHandlers` 의 «모의 GPS 는 한 소켓만») · `originOf` ③ 이 «돌고 있는 모의 주행»을 가르는 데도 쓴다.
 */
export const MOCK_GPS_OWNER_QUIET_MS = 5_000;

export function originOf(
    session: {
        /** 🔑 세션이 제 주인을 안다 — 부르는 쪽이 userId 를 또 들고 다니지 않게 (규칙 ③) */
        userId: string;
        lastFix: { x: number; y: number } | null;
        lastFixAt: number | null;
        lastFixIsMock?: boolean;
        lastFixSource?: 'gps' | 'mock' | 'manual';
        activeFilter?: { dispatchPhase?: string | null };
        /** 🎭 모의 GPS 소켓 임자 — 마지막으로 보낸 시각이 «모의 주행이 지금 돌고 있나»를 답한다 */
        mockGpsOwner?: { at: number } | null;
    },
    nowMs: number = Date.now(),
): DriverOrigin | null {
    const fix = session.lastFix;
    const fresh = !!fix && session.lastFixAt != null && nowMs - session.lastFixAt <= DRIVER_LOCATION_STALE_MS;
    /* 🔴 가짜 좌표는 **콜을 쥔 동안에만** «지금 위치»다 (기사님 *"출발을 해야 상차를 하지"*) */
    const phase = session.activeFilter?.dispatchPhase;
    const onDuty = phase === 'DELIVERING' || phase === 'GATHERING';
    /**
     * 🎭 **돌고 있는 모의 주행은 빈 차여도 믿는다** (다섯 번째 바퀴 · onedal-49 합의).
     *    ③ 이 막으려던 것은 «멈춘 뒤 남은» 모의 좌표다(파주 156km). 모의 주행은 경로 끝에서도 좌표를 계속 보내므로(#133)
     *    임자가 5초 안에 보냈으면 지금 돌고 있다 — 이천에서 빈 차로 서 있는데 상차 목록을 집 둘레로 재지 않는다.
     */
    const mockRunning = !!session.mockGpsOwner && nowMs - session.mockGpsOwner.at <= MOCK_GPS_OWNER_QUIET_MS;
    const mockUsable = !session.lastFixIsMock || onDuty || mockRunning;

    if (fix && fresh && mockUsable) {
        return { x: fix.x, y: fix.y, source: session.lastFixSource ?? 'gps', isFallback: false };
    }

    return homeOriginOf(session.userId);
}

/**
 * 🏠 **집을 기점으로** — 설정의 집 좌표. 비었으면 null (🔴 지어내지 않는다 — 없으면 없다고 답한다 · 규칙 ④).
 *    `originOf` 가 지금 자리를 못 믿을 때 물러서는 곳이고, 내일 콜 판정이 «그날은 집에서 출발한다»로 쓰는 곳이다.
 */
export function homeOriginOf(userId: string): DriverOrigin | null {
    const home = SettingsRepository.getHomeLocation(userId);
    if (!home) return null;
    return { x: home.x, y: home.y, source: 'home', isFallback: true };
}

/**
 * 📍 **마지막으로 아는 자리 — «내가 지금 어디 있나»의 답** (기사님 확정).
 *
 * ── `originOf` 와 무엇이 다른가 ──
 * 한 값이 **두 질문에 답하고 있었다** (규칙 ⑤-4 ⑤):
 *
 * | 질문 | 답하는 함수 | 모를 때 |
 * |---|---|---|
 * | 경로를 **어디서부터 짤까** | `originOf` | **집**을 넣는다 — 출발점이 없으면 계산이 안 된다 |
 * | 내가 **지금 어디 있나** | 이 함수 | **모른다**(`null`) — 지어내지 않는다 (규칙 ④) |
 *
 * 🔴 **낡아도 집으로 바꾸지 않는다.** 터널·주차장에서 5분 끊긴 것뿐인데 지도가 집으로
 *    날아가면, 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다. **그물은 더 심하다** —
 *    이천에 있는데 파주 콜이 올라온다 (기사님 확정: 지도·그물 둘 다 «마지막 실제 위치»).
 * 🔴 **낡았다는 사실은 버리지 않고 «표시»로 싣는다** — `isStale`·`ageMs`.
 *    화면이 «12분 전 위치»라고 적을 수 있어야 숫자가 거짓말을 안 한다 (규칙 ⑤-2).
 * ⚠️ **`originOf` 의 5분 규칙은 그대로다.** 그것은 실제 사고에서 나온 방어이고
 *    (여주 4시간 25분 · `staleDriverLocation.test.ts`), 그 질문에는 옳은 답이다.
 */
export interface LastKnownPosition {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** `originOf` 가 «기점으로 쓰기엔 낡았다»고 볼 만큼인가 */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

export function lastKnownPositionOf(
    session: {
        lastFix: { x: number; y: number } | null;
        lastFixAt: number | null;
        lastFixSource?: 'gps' | 'mock' | 'manual';
    },
    nowMs: number = Date.now(),
): LastKnownPosition | null {
    const fix = session.lastFix;
    /* 🔴 **시각을 모르면 없는 것으로 본다** — 나이를 못 재면 «신선하다»고 우길 수 없다 */
    if (!fix || session.lastFixAt == null) return null;
    const ageMs = nowMs - session.lastFixAt;
    return {
        x: fix.x, y: fix.y,
        at: session.lastFixAt,
        ageMs,
        isStale: ageMs > DRIVER_LOCATION_STALE_MS,
        source: session.lastFixSource ?? 'gps',
    };
}

/**
 * 도착 판정 한 틱 — **순수 함수** (L2 검증용).
 * 속도를 모르면(null) 정지로 치지 않는다 — 없는 숫자를 지어내지 않는다 (규칙 ④).
 */
/**
 * 🚚 **지나침 판정 한 틱 — 순수 함수** (기사님 확정).
 *
 * 기사님: *"운전중에 그걸 누르는건 너무 위험하다. 실 업무를 진행하면 도착을 못 읽는 경우가
 * 있을 거야. 지나온 목적지를 벗어나면 도착과 상차완료를 순차적으로 종료시켜 주는 것이 맞다."*
 *
 * ── 도착 감지로는 왜 부족한가 ──
 * 도착은 «500m + 정지 30초»다. 안 서고 지나치면 **사슬이 첫 칸부터 시작을 못 한다** —
 * 도착이 없으니 떠남 감시도 안 걸린다. 그래서 이 판정은 **도착과 무관하게 혼자 선다.**
 *
 * 🔴 **들어온 적이 없으면 절대 안 찍는다.** 안 그러면 남의 정거장을 스쳐만 가도 찍힌다.
 * 🔴 **이탈 거리가 진입보다 크지 않으면 안 찍는다** — 설정이 뒤집히면 들어오자마자 찍힌다.
 */
export function evaluatePassTick(
    distKm: number,
    nearKm: number,
    awayKm: number,
    entered: boolean,
): { entered: boolean; passed: boolean } {
    const nowEntered = entered || distKm <= nearKm;
    const sane = awayKm > nearKm;
    return { entered: nowEntered, passed: sane && nowEntered && distKm >= awayKm };
}

export function evaluateArrivalTick(
    heldSinceMs: number | null,
    distKm: number,
    speedKmh: number | null,
    source: string,
    nowMs: number,
    /** ⏸️ 모의 주행이 «서 있다»(정차 연기)고 보냈나 — 실 GPS 는 속도로 잰다 */
    stopped?: boolean,
): { fire: boolean; heldSinceMs: number | null } {
    if (distKm >= GPS_ARRIVAL.RADIUS_KM) return { fire: false, heldSinceMs: null };
    /* 🎭 모의 좌표는 «서 있다»고 온 틱에 곧바로 — 30초는 안 기다린다(정차 연기 12초). 달리는 틱엔 안 찍는다 (근접만으로 찍으면
       달리는 중에 도착이 찍혀 시트 마중이 주행 신호에 1초 만에 내려간다 · gpsArrival.test) */
    if (source === 'mock') return { fire: !!stopped, heldSinceMs: null };
    const still = speedKmh != null && speedKmh < GPS_ARRIVAL.STILL_KMH;
    if (!still) return { fire: false, heldSinceMs: null };
    const since = heldSinceMs ?? nowMs;
    return { fire: (nowMs - since) / 1000 >= GPS_ARRIVAL.HOLD_SEC, heldSinceMs: since };
}

export function processDriverMovement(
    userId: string,
    lat: number,
    lng: number,
    session: UserSession,
    applyFilterCb: (uid: string, filter: any) => void,
    /**
     * 지나온 구간을 뺄 때 부른다 — **필터 변경 경로와 통로를 나눈다.**
     *
     * 🔴 처음에는 `applyFilterCb(userId, {})` 로 파생 재계산을 트리거했는데, 그 안에
     *    *"도착 도시가 비어 있으면 키워드를 지운다"* 는 가지가 있다. 도시를 안 고른 채
     *    운행하면 **0.5km 마다 경유가 통째로 지워진다** — 빈 필터는 고장이라 콜 잡기가 멈춘다.
     *    지나온 구간 제거는 파생을 다시 돌 이유가 없다. 전용 통로로 간다 (더 싸기도 하다).
     */
    trimTraveledCb?: (uid: string) => void,
    /** 좌표 출처 (`native` · `browser` · `mock`) — 관제웹 `gpsBridge` 가 실어 보낸다 */
    source?: string,
    /** 도착 확정 시 (마일스톤 기록·알림은 socketHandlers 가 한다 — 여기는 io 를 모른다) */
    onArrival?: (uid: string, stop: ArrivalStop) => void,
    /** 근접 예고(3km) 시 — 도착전 통화 알림 */
    onApproaching?: (uid: string, stop: ArrivalStop, distKm: number) => void,
    /** 하차지에서 2km 멀어졌을 때 — 하차 완료로 넘긴다 */
    onDeparted?: (uid: string, orderId: string) => void,
    /** 🚚 정거장을 **지나쳤을** 때 — 도착·완료를 순차로 찍는다 */
    onPassed?: (uid: string, stop: ArrivalStop) => void,
    /**
     * 🎭 **모의 주행 배속** — 궤적에 «실제 속도»를 남기려고 받는다 (현황판 실측).
     *
     * 현황판: *"**배속이 차의 속도로 기록되고 있습니다.** 마지막 판 속도 최저 0 · 최고
     * 39,415 · 평균 4,251 km/h … 나중에 궤적을 다시 읽을 때 아무 판단도 못 합니다 —
     * 「여기서 막혔나」를 속도로 보는데 전부 4,000km/h입니다."*
     *
     * 🔴 **배속은 «시간을 빨리 돌리는 것»이지 «차가 빨라지는 것»이 아니다.** 그래서
     *    궤적에는 나눈 값을 남긴다. 안 오면 1 — 실 GPS 는 그대로다.
     * ⚠️ **도착 감지가 쓰는 `speedKmh` 는 안 건드린다** — 그 값은 판정 입력이고, 모의는
     *    애초에 속도를 안 본다(`source === 'mock'` 이면 바로 발화). 나누는 것은 **기록뿐**이다.
     */
    speedMultiplier?: number,
    /**
     * ⏸️ **«지금 서 있다»** (현황판 실측). 오면 궤적 문턱(50m·15초)을 건너뛴다.
     *
     * 🔴 정지는 «사건이 없는 것»이 아니라 «같은 자리에 있다»는 **사실**이다.
     *    그 논리가 `gpsBridge` 에만 있고 **저장에는 없어서**, 정차 18초 동안 6초마다
     *    좌표를 보내도 **한 점도 안 남았다** (제자리 구간 0건 · 최소 걸음 51m).
     */
    stopped?: boolean,
) {
    if (!lat || !lng) return;
    
    const currentGPS = { x: lng, y: lat }; // 카카오 좌표계 (x=경도, y=위도)

    // 마스터 GPS 위치를 세션에 저장 (지도 렌더링 및 카카오 길찾기 Origin으로 사용됨)
    /**
     * 🔴 **서버가 받은 위치를 남긴다**.
     *
     * 위치는 경유·도착 감지·경로의 **공통 입력**이라, 무엇이 들어왔는지 기록이 없으면
     * 순간이동 · 파이프 둘 같은 사건을 확인할 수 없다. 진행도 로그는 설계상 단조라 증거가 못 된다.
     *
     * 기사님 결정: **이동이 있을 때만** 남긴다(㉮). 매초 찍으면 파일이 부푼다.
     * 다만 **말이 안 되는 점프는 조용해도 남긴다** — 그게 찾으려는 바로 그 사건이다.
     */
    const prev = session.lastFix;
    const prevAt = session.lastGpsAt;
    const src = source || '알수없음';
    /** 도착 감지가 같이 쓴다 — 속도를 모르면 null (지어내지 않는다) */
    let speedKmh: number | null = null;
    /** 점프 틱은 도착 판단을 건너뛴다 — 위치를 믿을 수 없다 */
    let jumped = false;

    // 첫 좌표는 비교 대상이 없다. 시간을 모르면 속도도 지어내지 않는다 (규칙 ④)
    if (prev && prevAt) {
        const movedKm = haversineKm(prev, currentGPS);
        const elapsedS = Math.max(0.001, (Date.now() - prevAt) / 1000);
        const kmh = (movedKm / elapsedS) * 3600;
        speedKmh = kmh;

        const teleported = movedKm >= GPS_JUMP_MIN_KM && elapsedS < GPS_JUMP_MAX_GAP_S;
        // 🔴 표본이 작으면 속도가 거짓말한다 — 경고를 울리지 않는다 (위 주석)
        const tooFast = src !== 'mock' && isSpeedSampleUsable(movedKm, elapsedS)
            && kmh > IMPLAUSIBLE_SPEED_KMH;
        jumped = teleported || tooFast;

        if (teleported || tooFast) {
            slog('위치', `🚨 [위치 점프] ${movedKm.toFixed(1)}km 를 ${elapsedS.toFixed(1)}초에 ` +
                `(${Math.round(kmh)}km/h · 출처 ${src}) — ${prev.x.toFixed(4)},${prev.y.toFixed(4)} → ` +
                `${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)}`);
        } else if (movedKm >= GPS_LOG_MIN_KM) {
            if (session.stoppedSinceMs) {
                const stoppedMin = Math.round((Date.now() - session.stoppedSinceMs) / 60_000);
                slog('위치', `▶️ [정차 끝] ${stoppedMin}분 서 있다 다시 이동 · 출처 ${src}`);
                session.stoppedSinceMs = null;
            }
            // 🧹 이동 로그는 30초에 한 줄 — 궤적은 DB 가 들고 있다
            if (!session.lastMoveLogAt || Date.now() - session.lastMoveLogAt >= 30_000) {
                session.lastMoveLogAt = Date.now();
                slog('위치', `📍 [위치] ${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)} ` +
                    `· ${(movedKm * 1000).toFixed(0)}m 이동 · ${Math.round(kmh)}km/h · 출처 ${src}`);
            }
        } else if (stopped) {
            /* ⏸️ 서 있는 «사실»은 남긴다 — 매초가 아니라 시작·끝 두 줄로. 좌표가 오는지는 `lastFixAt` 이 답한다 */
            if (!session.stoppedSinceMs) {
                session.stoppedSinceMs = Date.now();
                slog('위치', `⏸️ [정차 시작] ${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)} · 출처 ${src}`);
            }
        }
    }
    /**
     * 🛰️ **궤적을 남긴다** (기사님 확정).
     *
     * 여기가 좌표가 들어오는 **유일한 문**이라 저장도 여기서 한다 (규칙 ③).
     * 문턱(50m·15초)과 일괄 쓰기는 `gpsTrackStore` 가 판단한다 — 이 함수는 부르기만 한다.
     *
     * 🔴 **점프 틱도 남긴다.** 그게 찾으려는 바로 그 사건이다 (위 로그 규칙과 같은 뜻).
     * ⚠️ 저장은 «기록»이지 판정 입력이 아니다 — 실패해도 콜 잡기를 멈추지 않는다.
     */
    {
        const lastPt = session.lastTrackPoint ?? null;
        const nowPt = { x: currentGPS.x, y: currentGPS.y, atMs: Date.now() };
        if (shouldStoreGpsPoint(lastPt, nowPt, stopped)) {
            // 🧭 «그때 어느 콜을 향하고 있었나»를 함께 싣는다 — 경로 대조의 열쇠
            /* 🎭 배속으로 나눈 «실제 속도»를 남긴다 — 판정이 쓰는 `speedKmh` 는 그대로다 */
            const mult = speedMultiplier && speedMultiplier > 0 ? speedMultiplier : 1;
            const realSpeed = speedKmh != null ? Math.round(speedKmh / mult) : null;
            bufferGpsPoint(userId, gpsPointOf(session, currentGPS, nowPt.atMs, src, realSpeed, mult));
            session.lastTrackPoint = nowPt;
        }
    }

    session.lastGpsAt = Date.now();

    session.lastFix = currentGPS;
    session.lastFixAt = Date.now();   // 낡음을 재려면 «언제 받았나»가 있어야 한다
    session.lastFixIsMock = src === 'mock';   // 가짜는 운행 국면 밖에서 못 산다
    /**
     * 📍 **온 그대로 적는다** (현황판 담당 요청 ①).
     *    여기가 좌표가 들어오는 **유일한 문**이라 출처도 여기서 남긴다 (규칙 ③).
     *    ⚠️ 모르는 말이 오면 «모른다»로 둔다 — `gps` 로 지어내면 화면이 거짓말한다 (규칙 ④).
     */
    session.lastFixSource =
        src === 'mock' || src === 'manual' ? src
        : src === 'native' || src === 'browser' || src === 'real' ? 'gps'
        : undefined;

    // [V2] dispatchPhase 기반으로 체크
    const isDelivering = session.activeFilter.dispatchPhase === 'DELIVERING';
    if (isDelivering) {
        /**
         * [1] 지나온 구간 제거 — **0.5km 마다.**
         *
         * 🔴 경유를 만들 때 동마다 **경로 몇 km 지점인지**를 같이 기록해 두므로
         *    (`DetourRegions.progressKm`), 지나온 구간 제거는 **숫자 비교**다 — 0.14ms.
         *    경유를 통째로 다시 그리는 것(173ms)보다 1200배 싸니 촘촘히 돌려도 된다. 촘촘할수록 필터가 실제 위치에 가깝다.
         *
         *    실제 제거는 `filterNet.applyTraveledTrim` 한 곳에서만 한다
         *    (동 목록·시 묶음·별칭을 **한 벌로** 줄여야 하므로). 여기서는 방아쇠만 당긴다.
         *    ⚠️ 필터 변경(`applyFilterCb`)과 **다른 통로**다 — 이유는 인자 주석에 있다.
         */
        const lastTrim = session.lastTrimGPS;
        const dist = lastTrim ? haversineKm(lastTrim, { lat, lng }) : Infinity;

        if (dist > 0.5 && trimTraveledCb && getActivePolyline(session)) {
            session.lastTrimGPS = currentGPS;
            trimTraveledCb(userId);
        }

    }

    /**
     * [2] 도착 감지 — 500m 안의 후보를 **순서 없이 모두** 본다 (`watchArrival` · `arrivalCandidates`).
     *
     * 🔴 멈춤 조건이 없으면 500m 안에서 **매 틱 발화**한다(1초 4연발 + 매번 필터 재계산). 그래서:
     *    · 정거장 목록은 `planArrivalStops`(routeComposer) 가 준다 — 감시가 따로 만들면 경로와 갈라진다
     *    · 한 정거장당 발화 1회 (`arrivalFired`) · 점프 틱은 판단하지 않는다
     *    · DELIVERING 게이트 밖이다 — 출발 버튼 전에 상차지에 닿는 경우도 실재한다
     */
    /**
     * ⏸️ **같은 자리 재전송은 도착 감지에게 «새 정보»가 아니다** (기사님 실측).
     *
     * 🔴 정차를 궤적에 남기려고 «서 있는 동안 매초» 보내는 좌표를 **도착 감지가 같이 먹으면**,
     *    모의 주행은 «서 있다»는 틱에 곧바로 발화하므로 한 자리에서
     *
     *        틱1 정거장A 도착 → 틱2 next=B(도 500m 안) → 틱3 next=C …
     *
     *    이 **연쇄로 터진다.** 시내 콜은 정거장들이 서로 500m 안에 겹쳐 있어
     *    잡은 콜 여럿이 몇십 초 만에 전부 하차 완료로 끝난다.
     *
     * 🔴 **한 값을 두 곳이 다른 질문으로 읽는다** (규칙 ⑤-4 ⑤) —
     *    궤적은 *«거기 있었나»*, 도착 감지는 *«새로 왔나»*. 같은 자리는 **뒤 질문의 답이 아니다.**
     * ⚠️ 정거장에 **닿는** 그 틱은 좌표가 새 자리라 그대로 통과한다 — 도착은 정상으로 찍힌다.
     * ⚠️ 실 GPS 는 좌표가 미세하게 흔들려 여기 안 걸린다 (모의 주행에서만 완전히 같다).
     */
    const samePlace = !!prev && prev.x === currentGPS.x && prev.y === currentGPS.y;
    if (samePlace) return;

    watchArrival(userId, session, currentGPS, speedKmh, jumped, src, stopped, applyFilterCb, onArrival, onApproaching, onDeparted, onPassed);
}

/** 정거장 키 — 발화·예고 플래그의 단위 */
export const stopKeyOf = (st: ArrivalStop) => `${st.orderId}:${st.stopType}`;

/**
 * 🎯 **지금 «도착»으로 찍을 수 있는 정거장들 — 순서를 보지 않는다**.
 *
 * ── 왜 갈랐나 ──
 * «가고 있는 정거장»과 «닿은 정거장»은 **성질이 다른 두 질문**이다 (규칙 ⑤-4 ⑤):
 *
 * | 질문 | 순서가 필요한가 |
 * |---|---|
 * | «어디로 **가고 있나**» — 궤적 이름표 · 근접 예고 | **필요하다** |
 * | «지금 어디에 **닿았나**» — 도착 감지 · 지나침 감시 | **필요 없다.** 거리만 있으면 된다 |
 *
 * 뒤엣것을 순서에 매면 순서가 흔들릴 때 **도착이 통째로 흔들린다** — 굽은 길에서는 한 정거장이
 * 36초 사이에 ⑴ → ⑷ → ⑴ 로 오간다 (직선거리 탐욕법 — `orderByNearest` 주석).
 *
 * 🔴 **가장 위험한 것은 스톱워치다.** 실 GPS 는 «500m 안 + 5km/h↓» 가 **30초** 이어져야
 *    도착으로 찍는데, 보는 정거장이 바뀌면 그 30초가 0으로 되돌아간다. 정거장 앞에서
 *    순서가 2초마다 흔들리면 **30초가 영영 안 찬다.**
 *    ⚠️ **모의 주행으로는 절대 못 본다** — `evaluateArrivalTick` 이 `source === 'mock'`
 *       이면 근접만으로 즉시 발화한다. 게이트가 아무리 초록이어도 이 갈래는 안 돈다.
 *       **실 GPS 에서만 드러나는 결함**이다.
 * 🔴 도착 감시를 순서에 매면, 순서를 얼렸을 때 어떤 정거장은 «다음»이 될 차례가 안 와서
 *    도착이 아예 안 찍힌다.
 *
 * ── 🔒 떼지 않는 것: «제 짐을 싣기 전에는 못 내린다» ──
 * 이것은 **순서에서 오는 규칙이 아니라 물리에서 오는 규칙**이다. 순서만 보면
 * `orderByNearest` 가 그 하차지를 후보에서 빼 주어 덤으로 지켜지지만,
 * 순서를 떼면 그 보호도 함께 떨어진다 — **짐도 없이 하차지를 스쳐 지난 것이
 * 도착으로 찍히고, 이어서 지나침이 완료까지 찍는다.**
 *
 * 실측(어드민 · 궤적 1,294점): **아직 안 실은 콜의 하차지가 500m 안이던
 * 점이 22개** 있었고 그중 셋은 **0m**(시뮬이 거기 정차)였다. 그래서 이 규칙은 순서 없이도 지킨다.
 *
 * 판단은 목록 자체가 답한다 — `planArrivalStops` 는 **다녀온 정거장을 빼고** 주므로,
 * 같은 콜의 `pickup` 이 목록에 **남아 있으면** 아직 안 실은 것이다 (규칙 ③ — 따로 세지 않는다).
 */
export function arrivalCandidates(
    /** `planArrivalStops` 결과 — **목록만** 쓴다. 순서는 보지 않는다 */
    stops: ArrivalStop[],
    /** 이미 찍은 정거장 (`arrivalFired`) */
    fired: ReadonlySet<string>,
): ArrivalStop[] {
    /** 🔒 아직 상차지가 목록에 남아 있는 콜 = 짐을 안 실었다 */
    const notLoaded = new Set(
        stops.filter(s => s.stopType === 'pickup').map(s => s.orderId));
    return stops.filter(st =>
        !fired.has(stopKeyOf(st))
        && (st.stopType === 'pickup' || !notLoaded.has(st.orderId)));
}

/**
 * 🧭 **«지금 향하는 정거장» — 원천은 여기 하나다**.
 *
 * 도착 감지와 궤적 저장이 **같은 답**을 봐야 한다. 두 벌이 되면 궤적이 가리키는 콜과
 * 도착이 찍히는 콜이 갈라진다 — 이 레포가 반복해 당한 사고 클래스다
 * (경유 4벌 · 상태목록 3벌 · 시별칭, 규칙 ③).
 *
 * 활성 콜이 없거나 남은 정거장이 없으면 `null` — **지어내지 않는다** (규칙 ④).
 */
export function nextStopOf(
    session: Pick<UserSession, 'myOrders' | 'arrivalFired'>,
    gps: { x: number; y: number },
): ArrivalStop | null {
    const active = getActiveCalls(session as any);
    if (active.length === 0) return null;
    const stops = planArrivalStops(active, gps);
    return stops.find(st => !session.arrivalFired.has(stopKeyOf(st))) ?? null;
}

/**
 * 🛰️ **저장할 좌표 한 점을 만든다 — «그때 어느 콜이었나»를 함께 싣는다.**
 *
 * 🔴 3회차 주행에서 드러난 구멍을 메운다. `gps_tracks.order_id` 칸은
 *    처음부터 있었는데 **채우는 쪽을 안 이어서** 1,894점 전부가 비어 있었다.
 *    그러면 *"부여받은 경로 ↔ 실제 궤적"* 대조가 안 된다 — **합짐을 여럿 싣고 있으면
 *    시각만으로는 어느 콜 구간인지 못 가리기 때문**이고, 그게 이 제품의 핵심 상황이다.
 *
 * 순수 함수로 떼어 둔 이유: 폰 없이 검사할 수 있어야 이 이음새가 다시 안 끊긴다.
 */
export function gpsPointOf(
    session: Pick<UserSession, 'myOrders' | 'arrivalFired'>,
    gps: { x: number; y: number },
    atMs: number,
    src: string,
    speedKmh: number | null,
    /** 🎭 모의 배속 — 위 속도는 **이미 나눈 값**이고, 이것은 «얼마로 돌렸나»를 남긴다 */
    speedMultiplier: number = 1,
): GpsPoint & { stopType: 'pickup' | 'dropoff' | null } {
    const next = nextStopOf(session, gps);
    /**
     * 🛣️ **부여받은 경로에 대 본다 — «얼마나 벗어났나»를 점마다 남긴다** (기사님 지시 밤).
     *
     * 기사님: *"카카오 라인과 내 궤적이 같이 있어야 **얼마나 잘못 갔는지** 확인할 수 있을 것 같아."*
     * 🔴 **경로를 모르면 `null` 이다** — 0 은 «경로 위에 정확히 있다»는 뜻이라 «경로가
     *    없었다»와 섞이면 나중에 못 가른다 (규칙 ④).
     * ⚠️ 여기서 재는 이유: 이 함수는 **궤적을 남길 때만** 불린다(50m·15초 문턱 뒤).
     *    매 좌표마다 지리 연산을 더하지 않는다.
     */
    const snapped = snapToRoute(getActivePolyline(session), gps);
    return {
        x: gps.x, y: gps.y, atMs, source: src,
        speedKmh: speedKmh != null && Number.isFinite(speedKmh) ? Math.round(speedKmh) : null,
        /* 🔴 **속도와 배속을 한 칸에 섞지 않는다** — «실제로 얼마로 달렸나»와 «얼마로 돌렸나»는
           다른 질문이다 (규칙 ⑤-4 ⑤). 실 GPS 는 늘 1 이다 */
        speedMultiplier,
        orderId: next?.orderId ?? null,
        stopType: next?.stopType ?? null,
        offRouteM: snapped ? Math.round(snapped.offRouteKm * 1000) : null,
        progressKm: snapped ? Math.round(snapped.progressKm * 100) / 100 : null,
    };
}

function watchArrival(
    userId: string,
    session: UserSession,
    gps: { x: number; y: number },
    speedKmh: number | null,
    jumped: boolean,
    src: string,
    /** ⏸️ 모의 주행이 «서 있다»고 보냈나 — 모의 도착은 이 틱에만 찍힌다 (`evaluateArrivalTick`) */
    stopped: boolean | undefined,
    applyFilterCb: (uid: string, filter: any) => void,
    onArrival?: (uid: string, stop: ArrivalStop) => void,
    onApproaching?: (uid: string, stop: ArrivalStop, distKm: number) => void,
    /** 하차지에서 멀어졌다 — «내리고 갔다»로 본다 (기사님 확정) */
    onDeparted?: (uid: string, orderId: string) => void,
    /** 🚚 정거장을 지나쳤다 — 도착·완료를 순차로 찍는다 (기사님 확정) */
    onPassed?: (uid: string, stop: ArrivalStop) => void,
) {
    const active = getActiveCalls(session);
    if (active.length === 0) return;
    if (jumped) {
        // 위치를 못 믿는 틱 — 정지 유지도 끊는다 (점프 후 좌표로 30초를 세면 거짓 도착이 된다)
        session.arrivalHeld.clear();
        return;
    }

    /**
     * 🚚 **떠남 감지** — 하차지에 도착했다가 멀어지면 «내리고 갔다»로 본다.
     *
     * 도착만 보고 떠남을 안 보면, 운전 중이라 버튼을 못 누른 콜이 계속 실려 있는 것으로
     * 남아 **적재가 안 풀린다** (실측: 하차 도착 3건 · 하차 완료 0건).
     *
     * 🔴 되돌아와도 다시 안 걸린다 — 여기서 지운 뒤에는 `departWatch` 에 없고,
     *    하차 완료된 콜은 `getActiveCalls` 에서 빠져 감시 대상 자체가 아니다.
     */
    if (session.departWatch.size > 0 && onDeparted) {
        for (const [key, w] of [...session.departWatch]) {
            const away = haversineKm(gps, w);
            if (away >= GPS_ARRIVAL.DEPARTED_KM) {
                session.departWatch.delete(key);
                slog('콜단계', `🚚 [떠남 감지] 하차지에서 ${away.toFixed(1)}km 멀어졌습니다 — ` +
                    `내리고 간 것으로 봅니다 (${w.orderId.slice(0, 8)})`);
                onDeparted(userId, w.orderId);
            }
        }
    }

    /**
     * 🚚 **지나침 이탈** — 진입했던 정거장에서 설정 거리만큼 멀어지면 도착·완료를 순차로 찍는다.
     * 🔴 «다음 정거장»과 무관하게 **감시 목록 전체**를 돈다 — 도착이 먼저 찍혀 그 정거장이
     *    «다녀온 곳»이 되어도 여기는 계속 본다 (그러지 않으면 완료를 영영 못 찍는다).
     */
    if (session.passWatch.size > 0 && onPassed) {
        const passCfg = session.judgment?.pass ?? DEFAULT_JUDGMENT.pass;
        for (const [k, w] of [...session.passWatch]) {
            const away = haversineKm(gps, w);
            const t = evaluatePassTick(away, passCfg.nearM / 1000, passCfg.awayM / 1000, w.entered);
            // 아직 진입 반경 안에 못 들어왔다면 여기서 «들어왔다»만 갱신한다
            if (t.entered && !w.entered) { w.entered = true; }
            if (t.passed) {
                session.passWatch.delete(k);
                slog('콜단계', `🚚 [지나침] ${w.stopType === 'pickup' ? '상차지' : '하차지'}에서 ` +
                    `${(away * 1000).toFixed(0)}m 멀어졌습니다 — 도착·완료를 순차로 찍습니다 (${w.orderId.slice(0, 8)})`);
                onPassed(userId, { orderId: w.orderId, stopType: w.stopType, x: w.x, y: w.y } as ArrivalStop);
            }
        }
    }

    /**
     * 🧭 **정거장 목록은 한 번만 만든다** — 순서를 쓰는 쪽과 거리를 쓰는 쪽이 **같은 목록**을
     *    본다 (규칙 ③). 이 함수는 GPS 매 틱이 부르므로 두 번 만들면 값도 비용도 두 벌이 된다.
     */
    const stops = planArrivalStops(getActiveCalls(session), gps);
    if (stops.length === 0) return;

    /**
     * 📣 **근접 예고는 «어디로 가고 있나»의 답이라 순서를 본다** (도착전 통화 시점).
     *    도착·지나침과 달리 이쪽은 **다음에 갈 곳 하나**를 가리켜야 뜻이 있다.
     */
    const next = stops.find(st => !session.arrivalFired.has(stopKeyOf(st))) ?? null;
    if (next) {
        const nKey = stopKeyOf(next);
        const nDist = haversineKm(gps, next);
        if (nDist < GPS_ARRIVAL.NOTICE_KM && !session.arrivalNoticed.has(nKey)) {
            session.arrivalNoticed.add(nKey);
            slog('콜단계', `📣 [근접 예고] 다음 정거장(${next.stopType === 'pickup' ? '상차지' : '하차지'}) ` +
                `${nDist.toFixed(1)}km 앞 — 도착전 통화 시점`);
            onApproaching?.(userId, next, nDist);
        }
    }

    /**
     * 🎯 **도착·지나침은 «거리»가 정한다 — 순서를 보지 않는다**.
     *
     * 🔴 순서는 굽은 길에서 뒤집히므로(`orderByNearest` — 직선거리 탐욕법) «순서상 첫 정거장»만
     *    보면 **도착이 통째로 흔들린다.**
     *    500m 안에 들어왔으면 목록에서 몇 번째든 도착이다 — 거리는 순서를 안 본다.
     * 🔒 **적재 규칙만은 그대로 지킨다** — 짐을 안 실은 콜의 하차지는 후보가 아니다
     *    (`arrivalCandidates`). 그건 순서에서 오는 규칙이 아니라 **물리**다.
     *    어드민 실측(궤적 1,294점): 그런 점이 **22개**, 그중 셋은 **0m**(거기 정차)였다.
     */
    const pass = session.judgment?.pass ?? DEFAULT_JUDGMENT.pass;
    for (const st of arrivalCandidates(stops, session.arrivalFired)) {
        const key = stopKeyOf(st);
        const distKm = haversineKm(gps, st);
        const label = st.stopType === 'pickup' ? '상차지' : '하차지';

        /**
         * 🚚 **지나침 판정** — 안 서고 지나쳐도 도착·완료를 대신 찍는다 (기사님 확정).
         *
         * 🔴 도착(500m + 정지 30초)과 **무관하게 혼자 선다.** 실 업무에서는 안 서고 지나치는
         *    일이 흔한데, 그러면 도착이 안 찍히고 → 떠남 감시도 안 걸려 → 사슬이 통째로 멈춘다.
         * 🔴 거리 둘은 **판정 기준 탭에서 고친다** (`user_judgment.pass_near_m`·`pass_away_m`).
         */
        if (evaluatePassTick(distKm, pass.nearM / 1000, pass.awayM / 1000, false).entered
            && !session.passWatch.has(key)) {
            session.passWatch.set(key, { orderId: st.orderId, stopType: st.stopType, x: st.x, y: st.y, entered: true });
            slog('콜단계', `👣 [지나침 감시 시작] ${label} ${(distKm * 1000).toFixed(0)}m — ` +
                `${pass.awayM}m 벗어나면 도착·완료를 찍습니다 (${st.orderId.slice(0, 8)})`);
        }

        /* ⏱️ 스톱워치는 **정거장마다** — 다른 곳이 끼어들어도 이 30초가 안 끊긴다 */
        const tick = evaluateArrivalTick(session.arrivalHeld.get(key) ?? null, distKm, speedKmh, src, Date.now(), stopped);
        session.arrivalHeld.set(key, tick.heldSinceMs);
        if (!tick.fire) continue;

        session.arrivalFired.add(key);      // 🔴 한 번 찍으면 이 정거장은 끝 — 4연발의 해답
        session.arrivalHeld.delete(key);    //    찍힌 뒤에는 «서 있던 시간»을 들고 있을 이유가 없다
        slog('콜단계', `🏁 [도착 감지] ${label} ${GPS_ARRIVAL.RADIUS_KM * 1000}m 이내 (출처 ${src}) — 1회 발화`);

        if (st.stopType === 'dropoff') {
            applyFilterCb(userId, {
                driverAction: 'UNLOADING',    // 하차 중으로 자동 전환 (이제 1회만)
            });
            // 🚚 여기서부터 «멀어지는지»를 본다 — 2km 벗어나면 내리고 간 것으로 친다 (예비)
            session.departWatch.set(key, { orderId: st.orderId, x: st.x, y: st.y });
        }
        /**
         * 🚚 **도착이 찍힌 정거장도 지나침 감시에 넣는다** (실측으로 메운 구멍).
         *
         * 🔴 진입(300m) 등록은 위 조건이 볼 때만 일어난다. 그런데 도착이 먼저 찍히면
         *    그 정거장은 그 순간 **«다녀온 곳»이 되어 후보에서 빠진다** — 등록 기회를
         *    영영 잃는다. 시뮬(mock)은 500m 근접만으로 도착이 찍히므로 **늘 그렇게 된다**
         *    (12:34~12:36 실측: 상차지 도착 3건이 다 찍혔는데 지나침은 한 번도 안 걸렸다).
         */
        if (!session.passWatch.has(key)) {
            /**
             * 🔴 **`entered` 를 지금 거리로 정직하게 적는다.** 도착 반경(500m)이 진입(300m)보다
             *    넓어서, 도착만으로 «들어왔다»로 치면 450m 에서 도착한 콜이 **다음 틱에 400m
             *    이탈**로 곧바로 완료가 된다 — 짐을 싣기도 전에.
             */
            session.passWatch.set(key, {
                orderId: st.orderId, stopType: st.stopType, x: st.x, y: st.y,
                entered: distKm <= pass.nearM / 1000,
            });
        }
        onArrival?.(userId, st);
    }
}

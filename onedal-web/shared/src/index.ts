import { listReturnOf } from './networkPages';
import { businessDayKey } from './timing';
import { phoneModeOf } from './allowance';
export * from './paymentTypes';
import type { DeviceOfflineReason } from './deviceOffline';
import { isTargetApp, DEFAULT_TARGET_APP, type TargetAppType } from './targetApps';
import { isTerminal, isEvaluating } from './callStatus';
export * from './callStatus';
export * from './milestones';
export * from './cargoReport';
import type { SimplifiedOfficeOrder, OfficeOrder, SecuredOrder } from './orderShapes';
import type { AutoDispatchFilter } from './dispatchFilter';
export * from './orderShapes';
export * from './dispatchFilter';

export { LET_GO_STATUSES, isLetGoStatus, type LetGoStatus, DECISION_STATUSES, type DecisionStatus } from './orderStatuses';

// 서버 전용: 다이내믹 요율 계산 엔진 파라미터 (앱으로 전송하지 않음)
export interface PricingConfig {
    vehicleRates: Record<string, number>;  // 차종별 km당 적정 단가 (예: { "1t": 1000, "다마스": 800 })
    agencyFeePercent: number;              // 퀵사(사무실) 수수료율 (예: 23)
    maxDiscountPercent: number;            // 기사 수용 가능 최대 할인율 (예: 10)
}

// 스마트 경유 전용 데이터 구조 (PinnedRoute 등 프론트엔드 UI용)
export interface DetourRouteData {
    summaryText: string;
    totalDistanceKm: number;
    totalTimeMinutes: number;
    tollFare?: number;
    waypoints: {
        lat: number;
        lng: number;
        type: 'PICKUP' | 'DROPOFF';
        label: string;
    }[];
    alternatives?: {
        id: string;
        name: string;
        timeMinutes: number;
        distanceKm: number;
    }[];
}

// 안드로이드 앱폰 -> 서버로 쏘는 주기적인 상태 보고(텔레메트리)
export interface EdgeDeviceTelemetry {
    deviceId: string;                 // 기기 고유 식별자 (예: "phone-1")
    macroStatus: 'IDLE' | 'SCANNING' | 'PAUSED' | 'ERROR'; // 현재 매크로 엔진 상태
    lastOrderCheckedAt: string;       // "오더 조회 중입니다" 토스트가 마지막으로 뜬 시간 (ISO 8601)

    // 앱에서 긁어낸 실시간 통계 누적 현황
    collectedCount: number;           // 인성망에서 긁어낸 전체 오더 갯수 (블랙리스트 걸러지기 전)
    acceptedCount: number;            // 선점(확정 버튼 자동 클릭)이 성공해서 수락된 배차 갯수
    bannedCount: number;              // 지뢰콜/하한가/까대기 등으로 로컬 필터가 뱉어버린 콜 갯수

    // 정합성 검사 용도
    appVersion?: string;              // 안드로이드 앱 버전 정보
    activeFilterHash?: string;        // 앱폰이 현재 들고 있는 AutoDispatchFilter의 해시/ID (웹폰과 세팅값이 불일치하는지 검사용)

    // (현재 폰 화면에 표시되어 있는 스크래핑된 오더 리스트 미러링용)
    visibleOrders?: SimplifiedOfficeOrder[];
}

// 1-A. 앱폰 -> 서버: 1차 호출 (리스트 창에서 '확정' 버튼 클릭 직후)
export interface DispatchBasicRequest {
    step: 'BASIC';
    deviceId: string;
    order: SimplifiedOfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
    /**
     * 👀 **미리보기 콜** — 기사님이 **확정을 누르기 전에** 팝업 3장(적요상세·출발지·도착지)을
     *    읽어 판정만 받아 보는 콜 (기사님 확정).
     *
     * 🔴 아직 안 잡은 콜이라 **인성에서는 아무 일도 일어나지 않았다** — 취소할 것이 없다.
     *    그래서 취소 카운트(배차망 10회 패널티)에 넣지 않는다. 확정을 누르면 딱지가 벗겨진다.
     *
     * ⚠️ **선택 필드로 둔다.** 없으면 옛 동작 — 갱신 안 된 APK 가 그대로 돈다.
     */
    isPreview?: boolean;
}

// 1-B. 앱폰 -> 서버: 2차 호출 (상세 페이지 진입 후 상세 정보 파싱 완료 시)
export interface DispatchDetailedRequest {
    step: 'DETAILED';
    deviceId: string;
    order: OfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
    /** 👀 미리보기 콜 — 뜻과 규칙은 `DispatchBasicRequest.isPreview` 에 적었다 */
    isPreview?: boolean;
}

// 두 가지 Step을 묶어주는 유니온 타입
export type DispatchConfirmRequest = DispatchBasicRequest | DispatchDetailedRequest;

// 2. 서버 -> 앱폰: Piggyback 통신 응답 (가성비 연산 후 최종 지시)
export interface DispatchConfirmResponse {
    deviceId: string;                 // 수락한 앱폰 ID
    action: 'KEEP' | 'CANCEL';        // KEEP: 유지, CANCEL: 서버가 보기에 구리니 즉시 취소 후 복귀
}

/**
 * 📱 관제 기기 관리 관련 타입 (Device Telemetry)
 */
export type DeviceStatusType = "ONLINE" | "OFFLINE";

export * from './deviceOffline';
/**
 * 🎛️ **기기 모드 셋 — 자동 · 알람 · 대기** (기사님 확정).
 *
 * | 화면 이름 | 키 | 필터 | 앱이 누르나 | 알람 |
 * |---|---|---|---|---|
 * | 자동 | `AUTO` | 돈다 | ✅ | — |
 * | 알람 | `ALARM` | 돈다 | ❌ | ✅ |
 * | 대기 | `MANUAL` | 돈다 (기록용) | ❌ | ❌ |
 *
 * 🔴 **「대기」에 새 키를 만들지 않았다.** 동작이 지금 `MANUAL` 과 완전히 같아서,
 *    키를 유지하면 서버·앱의 기존 분기가 한 줄도 안 바뀐다. 바뀌는 것은 화면 이름뿐이다.
 *
 * 🔴 **`STANDBY` 를 쓰지 않는다** — `dispatchPhase` 가 이미 그 낱말로 「첫짐 탐색」을
 *    가리킨다. 같은 말에 두 뜻을 주면 로그를 읽을 때 어느 쪽인지 모른다.
 *
 * 🔴 **«필터가 도는가» 와 «앱이 누르는가» 는 다른 물음이다** (에 갈랐다).
 *    자동·알람은 둘 다 필터가 돈다(`hasFilteringDevice` → `isActive`). 누르는 것은 자동뿐이다
 *    (앱의 `currentMode == "AUTO"`). 값이 둘이던 시절엔 그 둘이 같은 말이라 한 값으로 썼는데,
 *    앱의 `decide()` 가 `isActive` 로 끊으므로 **섞어 두면 알람에서 필터가 통째로 죽는다.**
 *
 * 🔴 **모드 이름을 다른 값으로 조립하지 않는다.** 앱이 `"${mode}_CLICK"` 으로 딱지를 만들어
 *    `"ALARM_CLICK"` 이 태어났고, 서버의 직접콜 보호가 그걸 못 알아봐 **기사님 콜이 강제
 *    취소**됐다. 콜의 출신은 `SessionManager.clickOrigin`(누가 눌렀나) 한 곳에서만 파생한다.
 *
 * 알람·대기로 잡은 콜은 기사님이 직접 누른 것이라 **직접콜**이고 심사하지 않는다 (규칙 ①).
 */
export const DEVICE_MODES = ["AUTO", "ALARM", "MANUAL", "SIMULATION"] as const;
export type DeviceModeType = typeof DEVICE_MODES[number];

/** 모르는 값을 모드로 받지 않는다 — 값이 늘어도 여기 한 곳만 본다 (규칙 ③) */
export function isDeviceMode(v: unknown): v is DeviceModeType {
    return typeof v === "string" && (DEVICE_MODES as readonly string[]).includes(v);
}

/** 화면에 적히는 이름 — MANUAL 의 화면 이름은 «직접», SIMULATION 의 화면 이름은 «체험» (기사님 확정) */
export const DEVICE_MODE_LABEL: Record<DeviceModeType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
    SIMULATION: "체험",
};

export * from './targetApps';
/**
 * 🖱️ **잡은 방식 — 6하원칙의 «어떻게»** (기사님 확정).
 *
 * 원장 `orders.capturedVia` 에 기록만 한다: `AUTO`(앱이 누름) · `ALARM`(알람 듣고
 * 기사님이 누름) · `MANUAL`(기사님이 직접 골라 누름).
 *
 * 🔴 **기록이지 판단이 아니다.** 서버의 직접콜 보호(심사 없음·강제취소 없음)는
 *    여전히 `matchType`(AUTO/MANUAL 둘)만 본다 — #75 에서 모드 이름이 출신으로 새어
 *    기사님 콜이 취소된 사고 그대로, 이 값을 보호 분기에 쓰면 같은 사고가 재발한다.
 *    알람·직접은 보호상 똑같은 «기사님이 누른 콜»이고, 여기서는 일지가 그 둘을
 *    가려 보게 할 뿐이다 (⑤-4 ⑤: 읽는 곳 — 일지·통계만).
 */
export const CAPTURED_VIA = ["AUTO", "ALARM", "MANUAL"] as const;
export type CapturedViaType = typeof CAPTURED_VIA[number];

export function isCapturedVia(v: unknown): v is CapturedViaType {
    return typeof v === "string" && (CAPTURED_VIA as readonly string[]).includes(v);
}

/** 일지·화면용 이름 */
export const CAPTURED_VIA_LABEL: Record<CapturedViaType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
};

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 콜 잡기 리스트 화면
    | 'LIST_COMPLETED'        // 완료 리스트 화면 — 여기서도 "리스트로 돌아온 것"이다
    | 'DETAIL_PRE_CONFIRM'    // 선점 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
    /**
     * 🚚 **수락한 뒤의 운행 화면 — 픽커에만 있다** (기사님 지시).
     *
     * 기사님: *"내가 관제앱에서 현 페이지를 확인할 수 있어야 해.. 그래야 일을 시작할 수 있지.
     * 관제에서는 폰의 상황을 잘 알아야 해. 그래서 가장 위에 있는 거야."*
     *
     * 인성은 확정하면 리스트로 돌아가고 **진행은 GPS가 답한다.** 픽커는 반대로
     * **화면이 진행을 말해 준다** — 이 값이 없으면 운행 중 화면이 전부 `UNKNOWN`(«알 수 없는 화면»)으로 떠,
     * 기사님이 가장 알고 싶은 순간에 관제가 가장 모르게 된다.
     *
     * 🔴 **마일스톤과는 다른 것이다.** 이건 «지금 무슨 화면인가»이고, 마일스톤은
     * «이 콜이 어디까지 왔나»다. 마일스톤은 넷 그대로 안 늘어난다
     * ([기획/배차망_통합.md] §1 — 기사님: *"모든 페이지를 마일스톤에 넣으면
     * 앱이 추가될 때마다 마일스톤이 생겨날 것 같아"*).
     *
     * ⚠️ 배차망이 늘어도 여기가 계속 부풀면 안 된다. 화면 «이름표»는 배차망별로
     * 갈라 두었으므로(`screenLabelsOf`), 다음 배차망은 **자기 이름표만** 더한다.
     */
    | 'RUN_TO_PICKUP'         // 🚚 픽커 — 픽업지로 이동 중
    | 'RUN_AT_PICKUP'         // 🚚 픽커 — 픽업지 도착, 픽업 완료 대기
    | 'RUN_TO_DROPOFF'        // 🚚 픽커 — 배송지로 이동 중
    | 'RUN_AT_DROPOFF'        // 🚚 픽커 — 배송지 도착, 배송 완료 대기
    | 'RUN_DONE'              // 🚚 픽커 — 배송 완료
    /**
     * 📋 **픽커 «내 오더» 탭 — 잡은 콜 목록** (기사님 지시 · 라이브에서 «알 수 없는 화면»으로 떴다).
     * 🔴 `LIST_SCREENS` 에 넣지 않는다 — 수락하면 곧바로 여기로 오는데, 리스트 복귀로 읽으면 서버가 미리보기 콜을 치워 승격이 빈 자리에 들어간다
     */
    | 'TRANSITION'            // 🔀 콜을 누른 직후 넘어가는 틀 — 스치는 화면(BLIP_SCREENS)
    | 'NETWORK_MENU'          // 🧭 배차망 안의 일이 아닌 화면(메뉴 · 마이페이지 …) — 목록 복귀가 아니다
    | 'MY_ORDERS'             // 📋 픽커 — 내 오더 탭
    /**
     * 🏠 **일을 안 잡고 있는 화면** (기사님 실측 제보로 신설).
     *
     * 기사님: *"픽커는 지금 홈에 있는데 콜 리스트로 나오고 있어."*
     *
     * 배차망 앱을 켜면 홈에 있고, 거기서 리스트로 들어간다 — 픽커 「시작하기」 · 인성 «인성퀵화면분할» · 화물24시 «전국24시콜화물».
     * 목록에 자리가 없으면 **홈이 «알 수 없는 화면»(빨간 깜빡임)** 으로 떨어진다.
     *
     * 🔴 **«모름»과 «홈»은 다른 답이다.** 앞은 *"못 읽고 있다"*, 뒤는 *"읽었고, 대기 중이다"* —
     * 관제웹에서 이 둘이 같아 보이면 기사님이 폰이 죽은 줄 안다.
     * (규칙 ⑤-4 ⑤ — 한 값이 두 사실을 답하게 두지 않는다)
     */
    | 'HOME'                  // 🏠 배차망 홈 — 리스트에 들어가기 전
    | 'LAUNCHER'              // 📱 안드로이드 바탕화면 (홈 런처)
    | 'OTHER_APP'             // 📱 기타 앱 (배차망 밖)
    | 'UNKNOWN';              // 알 수 없는 화면 / 미등록 팝업

/**
 * 🔴 **"콜에서 손을 뗀 화면"의 정의 — 여기 하나뿐이다.**
 *
 * 앱은 `LIST` 와 `LIST_COMPLETED` **둘 다** 리스트 복귀로 보고 세션을 리셋한다(`HijackService`).
 * 서버가 하나만 인정하면 **앱은 다음 콜을 찾는데 서버는 그 콜을 계속 쥐어**, 결재 카드가 영원히 남고
 * 콜 잡기가 멈춘다. 같은 판단을 두 곳에서 따로 정의하면 갈라진다 — 화면이 늘어나면 **이 배열에만** 넣는다.
 */
export const LIST_SCREENS: ScreenContextType[] = ['LIST', 'LIST_COMPLETED'];

/** 지금 화면이 "콜에서 손을 뗀" 상태인가 (= 서버가 쥐고 있던 콜을 놓아도 되는가) */
/**
 * 👁️ **앱은 켜져 있는데 화면을 못 읽는 중인가** (기사님 확정 · 크리티컬).
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * 텔레메트리가 온다고 ONLINE 으로만 보면, 접근성이 막혀 콜을 하나도 못 읽는 동안에도 관제웹이 파란불이다 —
 * 실운행이면 **콜을 통째로 놓치는데 기사님이 알 방법이 없다.**
 *
 * 🔴 판단은 **근거 있는 것만** 한다. `노드 0` 은 접근성 트리가 안 오는 명백한 고장이다.
 *    반면 *"노드는 있는데 콜이 0"* 은 **빈 리스트일 수도** 있어 여기서 단정하지 않는다 —
 *    가르려면 "콜이 없을 때 노드가 몇 개인가"의 실측이 필요하다 (규칙 ⑤-4 ②).
 *
 * ⏱️ **15초**를 기다린다: 화면 전환·앱 전환 중에는 순간적으로 0이 될 수 있고,
 *    텔레메트리는 5초 간격이라 세 번 연속이면 일시적인 것이 아니다.
 */
export const BLIND_GRACE_MS = 15_000;

export function isDeviceBlind(session: { blindSince?: number }, now: number = Date.now()): boolean {
    return !!session.blindSince && now - session.blindSince >= BLIND_GRACE_MS;
}

/**
 * 🚦 **작업 단계의 이름은 여기 한 곳에서 짓는다** (기사님 확정).
 *
 * 앱은 **칸과 숫자만** 보낸다. 한글을 앱에도 두면 낱말이 두 벌이 되고 한쪽만 고쳐진다.
 * ⚠️ 안 보내는 구앱은 `null` 이다 — «대기»로 지어내지 않는다 (규칙 ④).
 */
export function workStageLabel(d: {
    workStage?: string; workStageStep?: number; workStageSeconds?: number;
}): string | null {
    switch (d.workStage) {
        case "IDLE": return "대기";
        case "DETAIL": return "상세";
        case "POPUP": return d.workStageStep ? `팝업 ${d.workStageStep}/3` : "팝업";
        case "AWAITING_VERDICT": return "판결 대기";
        case "SAFE_CANCEL":
            return d.workStageSeconds != null ? `안전취소 ${d.workStageSeconds}초` : "안전취소";
        default: return null;
    }
}

/**
 * 🎛️ **모드가 아직 폰에 안 닿았나** — 저장하지 않고 **대조로 파생**시킨다 (규칙 ③).
 *
 * 🔴 버튼을 누르는 순간 바뀐 것처럼 그리지 않는다(«낙관적 업데이트») — 폰이 받았는지 모르면서 단언하는 것이다.
 * ⚠️ 대답을 안 싣는 구앱(`undefined`)은 «적용중»이라 하지 않는다 — 모름을
 *    «안 됐다»로 읽으면 영원히 안 풀리는 딤드가 된다 (규칙 ④).
 */
export function isModeApplying(d: { mode?: string; autoAllowed?: boolean; appliedMode?: string; suppliedMode?: string; sentMode?: string; supplyLinked?: boolean }): boolean {
    /* 📶 새 원달앱 — «서버가 보내는 모드가 블루투스로 아직 안 닿았나»만 본다. 일부러 내려간 알람(관제앱과 끊김 · 관제웹 없음 …)은 배지가 말한다 ·
          공급이 끊겼으면 받을 길이 없어 적용중이 아니다 · 꺼진 폰은 sentMode 가 없어 아니다 */
    if (d.suppliedMode !== undefined) return d.supplyLinked !== false && !!d.sentMode && d.sentMode !== d.suppliedMode;
    if (!d.appliedMode) return false;
    /* 📱 명령이 아니라 폰에 갈 모드와 견준다 — 자동 잡기 허락이 꺼지면 AUTO 명령도 폰은 ALARM 이라, 명령과 견주면 «적용중»이 영영 안 풀린다 */
    return phoneModeOf(d) !== d.appliedMode;
}

/**
 * 🎛️ **이 배차망에서 도는 모드** — 원달앱이 대답한 값, 없으면(옛 원달앱) 폰에 갈 모드(`phoneModeOf` — 허락이 꺼지면 AUTO 명령도 알람).
 * 관제웹 폰 카드와 알람 소리가 이것을 본다. «명령이 닿았나»(`isModeApplying`)는 명령끼리 대조한다.
 */
/**
 * 📶 **폰 칸 연결 배지 — 문제일 때만 하나** (기사님 «가» · 차례는 뿌리부터).
 * 다른 서버를 봄 · 허락 없음 · 폰 연결 풀림이면 나머지 값을 믿을 수 없으니 맨 앞 · 공급이 끊기면 옛 판은 그 결과라 끊김만.
 * 옛 원달앱(칸 없음)이면 null — 모르는 것을 문제로 그리지 않는다(규칙 ④).
 */
export interface PhoneLinkBadge { text: string; tone: 'red' | 'amber' | 'gray'; hint: string }
export function phoneLinkBadgeOf(d: Pick<DeviceSession, 'appTooOld' | 'bleSameServer' | 'nearbyPermitted' | 'bleUnlinkedWhy' | 'supplyLinked' | 'filterStale' | 'batteryExempt'>): PhoneLinkBadge | null {
    const off = ' · 관제앱은 최근 앱에서 밀어 없애도 공급을 계속합니다 — 끄려면 로그아웃';
    if (d.appTooOld) return { text: '원달앱 새로 깔기 필요', tone: 'red', hint: '블루투스 받기 전 원달앱이라 서버가 보고를 받지 않습니다 — 그동안 원달앱은 알람으로만 돕니다 · 새 원달앱을 까세요' };
    if (d.bleSameServer === false) return { text: '다른 서버를 봄', tone: 'red', hint: '이 스캔폰이 관제앱과 다른 서버를 봅니다 — 원달앱 설정에서 서버를 맞추세요' };
    if (d.nearbyPermitted === false) return { text: '블루투스 허락 없음', tone: 'red', hint: '원달앱 점검 탭 → 근처 기기 허락' };
    if (d.bleUnlinkedWhy) return { text: '폰 연결 풀림', tone: 'red', hint: `서버가 이 폰의 보고를 받지 않습니다(${d.bleUnlinkedWhy}) — 원달앱 설정에서 다시 연결` };
    if (d.supplyLinked === false) return { text: '관제앱과 끊김 · 알람만', tone: 'amber', hint: '관제앱을 열어 로그인하면 붙습니다 — 그동안 자동은 알람으로만 돕니다' + off };
    if (d.filterStale) return { text: '필터 옛 판', tone: 'amber', hint: '이 폰이 든 필터가 서버 것과 오래 다릅니다 — 관제앱과 붙었는지 보세요' + off };
    if (d.batteryExempt === false) return { text: '배터리 최적화 중', tone: 'gray', hint: '원달앱 점검 탭 → 배터리 최적화 예외 — 화면이 꺼지면 보고가 끊길 수 있습니다' };
    return null;
}

export function runningModeOf(d: { mode?: string; autoAllowed?: boolean; effectiveMode?: string }): string | undefined {
    return d.effectiveMode || phoneModeOf(d);
}

export function isListScreen(screenContext?: string | null, targetApp?: string | null, screenPage?: string | null): boolean {
    if (!screenContext) return false;
    if ((LIST_SCREENS as string[]).includes(screenContext)) return true;
    /* 📋 새 원달앱은 «내 오더» 하나로 보내고 페이지 이름을 싣는다 — 목록 복귀인가는 배차망 정의 표의 사실 */
    return screenContext === 'MY_ORDERS' && listReturnOf(targetApp, screenPage);
}

/**
 * 🔎 **«상세를 보고 있는 화면» — 여기 하나뿐이다** (기사님 확정: *"미리보기 판정을 연 스캔폰의 상태값이
 *    상세페이지일 때만 노출하고 페이지를 이탈하면 끈다"*).
 *
 * 🔴 **양의 목록으로 적는다.** «목록도 모름도 아니면 상세»로 뒤집어 재면 `HOME` · `MY_ORDERS` ·
 *    운행 화면(`RUN_*`)까지 상세가 된다 — 수락한 뒤 화면인데 미리보기가 계속 떠 있게 된다.
 * 🔴 **팝업은 상세를 떠난 것이 아니다.** 인성은 상세 위에 적요 · 출발지 · 도착지 팝업을 띄워 훑는다
 *    (`DetailCollectMachine`). 팝업을 이탈로 읽으면 정보를 모으는 동안 카드가 사라진다.
 */
export const DETAIL_SCREENS: ScreenContextType[] = [
    'DETAIL_PRE_CONFIRM', 'DETAIL_CONFIRMED',
    'POPUP_PICKUP', 'POPUP_DROPOFF', 'POPUP_MEMO', 'POPUP_ERROR',
];

/**
 * ⏳ **스치는 화면** — 상세도 이탈도 아직 아니다. 이어진 시간이 `UNKNOWN_LEAVE_SEC` 를 넘어야 이탈로 본다(서버 `devices.leftDetail`).
 * 알 수 없는 화면은 카드를 여는 순간 잠깐 끼고, 넘어가는 중은 콜을 누른 직후 0.3~0.7초 보인다.
 */
export const BLIP_SCREENS: ScreenContextType[] = ['UNKNOWN', 'TRANSITION'];

/** 지금 화면이 스치는 화면인가 (`BLIP_SCREENS`) */
export function isBlipScreen(screenContext?: string | null): boolean {
    return !!screenContext && (BLIP_SCREENS as string[]).includes(screenContext);
}

/** 지금 화면이 상세 계열인가 (`DETAIL_SCREENS`) — `UNKNOWN` 은 «모름»이라 여기서 거짓이다 */
export function isDetailScreen(screenContext?: string | null): boolean {
    return !!screenContext && (DETAIL_SCREENS as string[]).includes(screenContext);
}

/**
 * 📵 **끊긴 폰의 화면은 «지금»이 아니다 — 말하지 않는다** (기사님 지시: *"페이지를 모르는 것 상위에
 *    상태가 노출되면 모순이 사라진다"*).
 *
 * 마지막으로 들은 화면 이름은 «아까 그것»이다. 그대로 쓰면 전원이 나간 폰이 영영 «상세»로 남아
 * 미리보기 심사석이 안 꺼진다. 표시(`screenLabels.deviceScreenBadge`)는 이미 이 층위를 지킨다 —
 * 판정도 **같은 함수**를 봐야 두 벌이 안 된다 (규칙 ③).
 */
export function screenNowOf(device: { status?: string | null; screenContext?: ScreenContextType | null }): ScreenContextType | null {
    if (device.status === 'OFFLINE') return null;
    return device.screenContext ?? null;
}

/**
 * 🚨 Safety Mode V3: 비상 보고 사유
 */
export type EmergencyReason =
    | 'AUTO_CANCEL'           // 30초 타임아웃으로 앱이 스스로 취소함
    | 'CANCEL_EXPIRED'        // "시간이 지나 취소할 수 없습니다" 팝업 발생
    | 'UNKNOWN_SCREEN'        // 알 수 없는 화면에 빠짐
    | 'BUTTON_NOT_FOUND'      // 버튼(닫기/취소)을 찾을 수 없음
    | 'APP_CRASH';            // 앱 비정상 종료 후 재시작

/**
 * 🚨 Safety Mode V3: POST /api/emergency 요청 바디
 */
export interface EmergencyReport {
    deviceId: string;
    orderId: string;
    reason: EmergencyReason;
    screenContext: ScreenContextType;
    screenText: string;           // 현재 화면 텍스트 전부 (서버 분석용)
    timestamp: string;
    /**
     * 🛑 **앱이 계약 취소 버튼을 실제로 눌렀나** — false 면 계약이 남아 있다(버튼 못 찾음 · 화면 못 얻음).
     *    서버는 이 사실 하나로 «취소로 세고 콜을 끝내나»를 가른다 — 까닭 이름으로 가르지 않는다. 칸이 없으면(옛 원달앱) 지금처럼 끝낸다.
     */
    cancelPressed?: boolean;
}

export interface ScrapResponse {
    apiStatus: {
        success: boolean;
        totalItems: number;
    };
    deviceControl: {
        mode: DeviceModeType;
    };
    dispatchEngineArgs?: AutoDispatchFilter;
}

/**
 * ⏱️ **폰이 조용한가** — 직전 보고와 이번 보고 사이가 이만큼 벌어졌나.
 *
 * 🔴 값 **30초** (기사님 확정). 지어낸 값이 아니라 **생존신고 60초의 절반**이다 —
 *    앱은 일이 생기면 그때 보내고(수초) 아무 일도 없으면 60초마다 보내므로,
 *    간격이 그 중간값으로 나오는 일이 **거의 없다.** 그래서 30초가 둘을 가장 잘 가른다.
 */
export const DEVICE_QUIET_MS = 30_000;

/**
 * ⏱️ **판정은 여기 하나다** (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면 각자 다른 질문을 답한다).
 *
 * 🔴 **첫 보고(모름)를 «조용»으로 세지 않는다** (규칙 ④). 모르는 것과 조용한 것은
 *    다르다 — 방금 켠 폰에 «말이 없다»고 적으면 그것이 곧 거짓말이다.
 *
 * ⚠️ 읽는 곳은 **관제웹의 `⏱️` 배지 하나뿐**이다. 서버 판정도 앱도 안 읽는다 —
 *    «콜을 줄까»를 이걸로 정하기 시작하면 한 값이 두 사실을 답하게 된다.
 */
export function isDeviceQuiet(prevSeen: number | undefined, lastSeen: number): boolean {
    if (prevSeen === undefined) return false;   // 첫 보고 — 모른다
    return lastSeen - prevSeen > DEVICE_QUIET_MS;
}

export interface DeviceSession {
    deviceId: string;
    deviceName?: string;    // 기기 별명 (PIN 페어링 시 등록, 예: "메인폰", "서브폰")
    lastSeen: number;       // 밀리초 타임스탬프
    /**
     * 📵 **왜 오프라인인가** (기사님 지적: *"'접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 접근성을 끄면 앱은 죽기 **전에** «나 오프라인이다»를 스스로 보낸다(`onDestroy`).
     * 그때 자기 서비스가 «켜진 접근성 목록»에 없으면 그건 추측이 아니라 **사실**이다.
     * 아무 말 없이 끊긴 것(데드맨)과는 기사님이 하실 일이 다르므로 갈라 둔다.
     * ⚠️ 다시 보고가 오면 지운다 — 옛 이유가 살아 있으면 화면이 거짓말한다.
     */
    offlineReason?: DeviceOfflineReason;
    /**
     * ⏳ **«알 수 없는 화면»이 처음 온 시각** (밀리초) — 상세나 다른 화면이 오면 지운다.
     *    카드를 여는 순간 잠깐 끼는 `UNKNOWN`(0.05~0.18초)과 **앱 밖으로 나간 것**을 가른다
     *    (`UNKNOWN_LEAVE_SEC` · 미리보기 노출 판정만 읽는다).
     */
    unknownSince?: number;
    /**
     * ⏱️ **직전 보고 시각** (밀리초) — `lastSeen` 과의 간격이 «그 사이에 일이 있었나»를 답한다.
     * 지금 읽는 곳은 서버의 `🖥️ [화면 바뀜]` 로그 하나뿐이다 («직전 보고와 N초 만»).
     * 첫 보고에는 없다(«모른다»).
     */
    prevSeen?: number;
    status: DeviceStatusType;
    mode: DeviceModeType;
    /**
     * 🌐 이 폰이 지금 **어느 배차망을 보고 있나** (기사님 확정).
     * scrap 마다 갱신되는 실시간 상태다 — 저장하지 않는다(원장은 orders·intel 의
     * targetApp). 없으면(구앱) 화면은 표시를 비운다 — 기본값을 지어내지 않는다.
     */
    targetApp?: TargetAppType;
    /**
     * 🧬 **이 폰이 «들고 있는» 콜 필터의 지문** (현황판 담당 요청 ②).
     *
     * 앱은 `filterVersion` 을 **매 scrap 에 싣고** 서버는 «바뀌었나»를 대조해 본문을
     * 생략할지 정한다(`scrap.ts`). 그런데 **대조만 하고 버리고 있었다** — 그래서
     * *"메인폰은 새 필터, 서브폰은 두 판 전"* 을 아무도 볼 수 없었다.
     *
     * 🔴 **«폰이 들고 온 것»을 적는다 — 서버가 방금 내려보낸 것이 아니다.**
     *    서버가 준 것을 적으면 **언제나 최신으로 보여** 이 칸이 있으나 마나가 된다
     *    (규칙 ⑤-4 ⑤ — 읽는 곳이 답하려는 질문은 «이 폰이 뒤처졌나»다).
     * ⚠️ 구앱은 안 보낸다 — 없으면 «모른다»로 둔다. 화면은 비워야 한다 (규칙 ④).
     */
    filterVersion?: string;
    /** 그 지문을 마지막으로 확인한 시각 (밀리초) — 낡음을 재려면 «언제»가 있어야 한다 */
    filterVersionAt?: number;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    /** 🧭 원달앱이 싣는 배차망 페이지 이름 · 그 위에 뜬 것(덧칸) 이름 — 배차망 정의 표의 이름 · 옛 원달앱은 안 싣는다 */
    screenPage?: string | null;
    screenOverlay?: string | null;
    isHolding?: boolean;    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    lat?: number;           // [GPS 텔레메트리] 앱폰(차량) 위도
    lng?: number;           // [GPS 텔레메트리] 앱폰(차량) 경도
    /** 📍 위치(lat/lng)가 실린 폰 보고를 받은 서버 시각(ms) — 메모리만 · 위치 없는 보고는 안 민다 · 운영센터 홈 «기사 이상»이 관제웹 GPS(lastFixAt)와 늦은 쪽을 본다 */
    lastLocationAt?: number;
    /**
     * 👁️ **마지막 리스트에서 읽은 텍스트 노드 수** (크리티컬).
     * `0` 이면 접근성 트리가 안 오는 것 — 앱은 살아 있지만 **화면을 못 읽는다.**
     */
    screenNodeCount?: number;
    /**
     * 💤 **폰 화면이 켜져 있는가** (기사님 확정).
     * 접근성 스크래핑은 화면이 켜져 있어야 돈다 — 꺼지면 앱은 살아 있어도 **콜을 못 잡는다.**
     * 앱이 **매 텔레메트리에 사실을 싣는다** (규칙 ③) — 이벤트 한 번으로 알리면 다음 하트비트가 `ONLINE` 으로 되돌려 녹색이 된다.
     */
    isScreenOn?: boolean;
    /**
     * 👁️ **화면을 못 읽기 시작한 시각** (밀리초). 노드가 0이 아니면 지워진다.
     * 관제웹이 이걸 보고 *"앱은 켜져 있는데 화면을 못 읽는 중"* 을 말한다 —
     * 기사님이 **파란불을 믿고 기다리는 일**을 막는 유일한 신호다.
     */
    blindSince?: number;
    /**
     * 👁️ **마지막 스캔의 필터 성적표** (기사님 확정).
     *
     * 기사님: *"앱에서 리스트는 돌아가고 있는데 관제웹에서는 **필터링이 잘되고 있는 건지
     * 알 수가 없어서** 답답하더라구. 실전에서는 16개가 다 들어오지 않으니까."*
     *
     * `stats.polled` 는 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 이 값이 말한다 —
     * *"도착지에서 5개"* 면 경유 반경을 넓힐 때고, *"요금에서만"* 이면 콜할인율을 만질 때다.
     *
     * ⚠️ **누적이 아니라 마지막 스캔의 스냅샷**이다. 누적은 *"어제부터 300개 떨어짐"* 이라
     *    지금 상태를 못 알려 준다. 질문은 *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 다.
     * ⚠️ **한 콜은 첫 번째로 걸린 축에만** 세어져 있다 — 그래야 합이 `seen` 과 맞고
     *    *"이 축을 풀면 몇 개가 들어오나"* 를 읽을 수 있다.
     */
    filterTally?: FilterTally;
    /**
     * 🕐 **그 성적표가 서버에 닿은 시각** (epoch ms · 기사님 지적).
     *
     * 기사님: *"`방금 1건 → 통과 0 · 차종 1` 같은 게 나오니까 **멈춰 있는 것 같아.**
     * 보내온 마지막 시간을 쓰는 것이 더 좋을 것 같다."*
     *
     * 🔴 숫자만으로는 *"지금 그런 것"* 과 *"아까 그러고 멈춘 것"* 을 구분할 수 없다.
     * 🔴 **서버 시계로 찍는다.** 앱이 보낸 시각을 쓰면 폰 시계가 틀어졌을 때 화면이
     *    미래나 과거를 말한다 — 받은 순간이 유일하게 확실한 사실이다.
     * ⚠️ `filterTally` 가 실제로 온 스캔에서만 갱신한다. 하트비트가 시각만 밀어 올리면
     *    **옛 숫자가 새것처럼** 보인다 (그게 지금 고치려는 거짓말 그 자체다).
     */
    filterTallyAt?: number;
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
    /**
     * 🚦 **지금 무슨 일을 하는 중인가** — 앱이 보낸 다섯 칸 중 하나
     * (`IDLE`·`DETAIL`·`POPUP`·`AWAITING_VERDICT`·`SAFE_CANCEL`).
     * 여태 `isHolding` 불리언 하나라 «어디서 멈췄는지»를 관제웹이 몰랐다.
     * ⚠️ 이름(한글)은 `workStageLabel` 이 짓는다 — 앱은 칸과 숫자만 보낸다.
     */
    workStage?: string;
    /** 🚦 팝업이 몇 장째인가 (`POPUP` 일 때만) */
    workStageStep?: number;
    /** 🚦 안전취소가 몇 초 남았나 (`SAFE_CANCEL` 일 때만) */
    workStageSeconds?: number;
    /**
     * 🎛️ **폰이 «나 지금 이 모드다»라고 대답한 값** (기사님 확정).
     * `mode`(관제가 정한 목표)와 **대조**하면 「적용중」이 파생된다 (규칙 ③).
     * ⚠️ 안 싣는 구앱은 `undefined` — 그걸 «적용 안 됨»으로 읽지 않는다 (규칙 ④).
     */
    appliedMode?: string;
    /**
     * 🎛️ **이 배차망에서 실제로 도는 모드** — 원달앱이 플러그인 `availableModes` 로 계산해 대답한다.
     * 픽커는 자동이 없어 자동 명령이 알람으로 돈다. 읽을 때는 `runningModeOf` 를 거친다(옛 원달앱은 안 싣는다).
     */
    effectiveMode?: string;
    /**
     * 📶 **원달앱 보고가 싣는 블루투스 · 폰 사실 넷** (원달앱이 원천 · 보고 한 길 · 옛 원달앱은 `undefined` → 안 그림).
     * `suppliedMode` 관제앱이 블루투스로 준 마지막 모드(저장 값) — «적용중»은 이것과 서버가 보내는 모드(`sentMode`)를 견준다(`isModeApplying`).
     */
    suppliedMode?: string;
    supplyLinked?: boolean;
    nearbyPermitted?: boolean;
    batteryExempt?: boolean;
    /** 🎛️ 서버가 이 폰에 보내는 모드(`modeSentToPhone`) — 기기 목록에만 · 살아 있는 폰만(꺼진 폰은 없음) */
    sentMode?: string;
    /** 🧬 폰이 든 필터 판이 서버가 보낸 판과 오래 다르다(`phoneCheck` stale) — 기기 목록에만 */
    filterStale?: boolean;
    /** 📶 블루투스로만 아는 셋(관제앱이 `phone-status` 로 · 원달앱 STATUS) — 같은 서버를 보나(서버 표지) · 폰 연결 풀린 까닭 · 관제앱이 들은 마지막 숨(ms) */
    bleSameServer?: boolean;
    bleUnlinkedWhy?: string | null;
    bleHeardAt?: number;
    /** 🚫 블루투스 받기 전 원달앱 — 서버가 보고를 거절한다 · 기기 목록에만 */
    appTooOld?: boolean;
    /**
     * 🎛️ **이 회원의 자동 잡기 허락이 지금 살아 있나** — 서버가 폰 보고마다 적는다(메모리 · 저장 칸 아님).
     * 꺼지면 AUTO 명령도 폰은 ALARM — 읽을 때는 `phoneModeOf` 를 거친다 · 관제웹 모드 목록은 `modeChoicesOf`.
     */
    autoAllowed?: boolean;
}

export * from './callBands';
export * from './modeTable';
export * from './bleProtocol';
export * from './openBlocked';
export * from './mask';
export * from './format';
export * from './mapTile';
export * from './replies';
export * from './filterTally';
export * from './jsonArray';
export * from './verdict';
export * from './routeReuse';
export * from './fuelCost';
export * from './vehicles';
export * from './deviceLink';
export * from './releases';
export * from './allowance';
export * from './regionMatch';
export * from './pricing';
export * from './phases';
export * from './ops';
export * from './anomalyKinds';
export * from './join';
export * from './callTargetDay';
export * from './pickupList';
export * from './filterArea';
export * from './cargoHints';
export * from './cargoTags';
export * from './cargoUnits';

/**
 * 관제탑으로 보내는 오더 스냅샷.
 * **진행 중과 종료된 것을 나눠서** 보낸다 — 한 배열로 보내면 받는 쪽이 거르기를 잊는다.
 */
/**
 * 이미 상차한 콜인가 — **이 판단은 여기 한 곳에만 둔다.**
 *
 * 🔴 server/routeComposer 와 관제웹이 **같은 정의**를 봐야 지도와 경로가 갈라지지 않는다.
 *
 * 기사님 원칙 그대로 — **KEEP 은 예약이고 상차가 적재다.** 짐을 실었으면 남은 일은 하차뿐이다.
 */
export function isAlreadyLoaded(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_PICKED_UP';
}

/**
 * 🚏 **이 정거장에 이미 다녀왔는가 — 판단은 여기 하나뿐이다** (기사님 확정).
 *
 * 기사님: *"현실에서는 내가 지나온 것은 무시할 것 같은데."*
 *
 * 🔴 **경로 조립과 시각 계산이 이 판단 하나를 쓴다** — 둘로 나뉘면(버튼 vs GPS) 상차 완료를 안 누른 콜이
 *    이미 지나온 상차지로 되돌아가는 경로를 만들어 **없는 우회 비용**을 문다.
 *
 * **GPS 도착이면 다녀온 것이다.** 도착 감지는 500m 안에 들어와야 찍히므로 "거기 갔다"는
 * 뜻이고, **가는 길**은 더 필요 없다.
 *
 * ⚠️ `isAlreadyLoaded`(실었는가)와 **다른 질문**이다. 도착했지만 아직 안 실은 상태가 있고,
 *    그때 단계는 여전히 "상차 완료" 대기다 — 단계는 `isAlreadyLoaded` 로 묻는다.
 *    여기는 오직 **"경로에 남겨 둘 이유가 있는가"** 만 답한다.
 *
 * 📦 적재 계산(«함께 실리는 최대» `peakLoadPoints`)은 이 답으로 **실린 것(loaded)** 을 가른다 — 상차지에 와 있는 콜은
 *    남은 경로 맨 앞에서 실리므로 처음부터 짐에 넣는다. 경로가 뺀 상차를 따로 세면 순서가 콜 전부를 못 덮어
 *    다 더한 값으로 물러선다.
 */
export function hasVisitedStop(
    c: { status?: string | null; arrivedPickupAt?: string | null; arrivedDropoffAt?: string | null },
    stopType: 'pickup' | 'dropoff',
): boolean {
    if (stopType === 'pickup') {
        return !!c.arrivedPickupAt || c.status === 'ORDER_PICKED_UP' || c.status === 'ORDER_DELIVERED';
    }
    return !!c.arrivedDropoffAt || c.status === 'ORDER_DELIVERED';
}

/**
 * 🪧 **심사석에 앉힐 콜** — 평가·미리보기 중인 것 하나 (덱에서는 뺀다).
 *
 * 🔴 **술어는 여기 하나다** (0831 리뷰에서 잡힘). 파생 제조소와 대시보드가 글자까지 같은
 *    식을 각자 들고 있었다 — 한쪽에 조건이 붙는 순간 «심사석에 뜬 콜»과 «덱에서 빠진 콜»이
 *    달라진다. 그 둘은 반드시 같은 콜이어야 한다 (규칙 ③).
 */
export function judgingCallOf<T extends { status?: string | null; isPreview?: boolean }>(
    calls: T[],
): T | undefined {
    return calls.find(c => {
        const s = c.status ?? undefined;
        if (isTerminal(s)) return false;
        // 🛡️ 이미 배차가 확정되었거나 운행 중인 콜은 심사 대상이 아니다 (잔여 isPreview 플래그 방어)
        if (s === 'ORDER_CONFIRMED' || s === 'ORDER_PICKED_UP' || s === 'ORDER_DELIVERED') return false;
        return isEvaluating(s) || !!c.isPreview;
    });
}

/**
 * 🔄 **이번 운행에서 "한 일"인가** — 하차·정산 완료만이다.
 *    취소·방출은 종결(`isTerminal`)이지만 **없던 일**이라 여기 안 든다.
 */
export function isDeliveredCall(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_DELIVERED' || c.status === 'ORDER_COMPLETED';
}

/**
 * 🗓️ **시트의 카드 목록 — 오늘 한 일** (기사님 결정 «시트는 오늘 한 일을 남긴다 · 화면의 사이클 = 하루»).
 *
 * 처음엔 «진행 중이 남은 동안만 하차분을 함께» 보여 줬고(6단계 채운 모습을 보려고),
 * #40에서 «이번 운행 — 진행 중 콜을 잡기 전에 내린 것은 뺀다»로 좁혔다. 그래서 콜 사이 빈 차가 될 때마다
 * 오늘 한 일이 통째로 사라졌다. 이제 경계는 **자정 하나**다 — 오늘 하차한 콜은 진행 중이 0건이어도, 운행이 끊겼다 이어져도 남는다.
 *
 * 경계는 저장하지 않고 하차 시각에서 파생한다 (규칙 ③ · `businessDayKey` — 서버 `ensureBusinessDay` 와 같은 선).
 * ⚠️ **하차 시각을 모르면 남긴다.** 없는 값으로 카드를 지우지 않는다 (규칙 ④).
 * ⚠️ 시각은 **날짜로** 비교한다 — 장부의 두 칸은 표기가 달라(`+09:00` · `Z`) 문자열로 비교하면 뒤집힌다.
 * 🔴 **상태는 콜별 즉시, 화면만 하루 단위.** 하차의 운임은 그 순간 발생한다.
 * ⚠️ 이 목록은 **화면 전용**이다. 경로·적재·운임·카운트다운은 진행 중인 콜만 본다 (`TERMINAL_STATUSES` 주석의 사고).
 * ⚠️ 이름은 옛 «사이클»을 그대로 둔다 — 짝 여럿이 이 이름을 문다. 뜻은 «하루»다.
 */
export function deckOfCycle<T extends { status?: string | null; capturedAt?: string; completedAt?: string | null }>(calls: T[], nowMs: number = Date.now()): T[] {
    const inProgress = calls.filter(c => !isTerminal(c.status ?? undefined));
    const today = businessDayKey(nowMs);
    const doneToday = (c: T) => {
        const t = Date.parse(c.completedAt ?? '');
        return Number.isNaN(t) || businessDayKey(t) === today;
    };
    return [...inProgress, ...calls.filter(c => isDeliveredCall(c) && doneToday(c))]
        .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''));
}

/**
 * 📍 **단계 사유 — 그때 무슨 일이 있었나** (기사님 확정).
 *
 * 🔴 **단계마다 관심사가 다르다.** 기사님: *"상차지 도착에서는 단위·수량·방법·보호·성질
 *    이것들이 모두 없어야 하는 거 아닌가? 상차지 도착에 관한 것만 있으면 될 것 같은데.
 *    이동 중에 문제가 없었는지, 상차지에 문제(주소 다름·점심시간) 뭐 그런 것들."*
 *
 *   상차지 도착 — 오는 길 + 그 장소            (아직 문을 열기 전이다)
 *   상차 완료   — 화주·짐                      (여기서 비로소 실어 본다)
 *   하차지 도착 — 오는 길 + 그 장소 + **짐 상태** (문을 열면 보인다)
 *   하차 완료   — 인수 단계
 *
 * 🔴 **이 값은 아무것도 판정하지 않는다** — 색·필터·약속과 무관하다. 겪은 일을 적어 두는
 *    칸일 뿐이라 목록이 아직 **가설**이어도 안전하다 (기사님: *"유튜브에서 본 것이 전부야"*).
 *
 * 🔴 **`기타` 를 반드시 둔다.** 목록 밖의 일이 어디에도 안 남으면 **목록을 고칠 근거
 *    자체가 사라진다.** 한 달쯤 뒤 "한 번도 안 쓴 사유"와 "기타로 적힌 것"을 세어 고친다.
 *
 * ⚠️ `수량 다름` 은 넣지 않는다 (기사님 확정: *"3 실측폼"*). 실측 폼에 실제 수량을 적으면
 *    `cargoMismatchRatio` 가 신고와의 차이를 **스스로 센다** — 사유로 또 적으면 같은 사실이
 *    두 곳에 살고 갈라진다 (규칙 ③).
 */
/**
 * 🗂️ **갈래로 묶는다** (기사님 확정).
 *
 * 기사님: *"모든 종류의 트러블이 하나에 모여 있어서 찾기 너무 어렵고 추가하기도 좀
 * 그렇다. 도로문제 / 상차지문제 / 기타 이런 식으로 카테고리로 나누어 표시하는 것이
 * 좋을 것 같은데. 어느 정도 높이가 시트마다 비슷해야 버튼 찾기도 좋으니까."*
 *
 * 한 줄에 쏟아 두면 찾는 데 시간이 걸리고 **늘릴 자리도 없다.** 묶어 두면 눈이 먼저
 * 갈래를 고르고, 사유를 더해도 그 갈래 안에서 자란다 — 목록이 가설이라 늘어날 것을
 * 전제로 짜야 한다.
 */
const ROAD_TROUBLE = ['교통 지연', '사고', '진입 곤란'] as const;   // 오는 길 — 도착 단계에만

const REASON_GROUPS_BY_STEP: Record<string, ReadonlyArray<{ label: string; reasons: readonly string[] }>> = {
    /** 오는 길 + 그 장소. 짐 이야기는 없다 — 아직 문을 못 열었다 */
    ARRIVE_PICKUP: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '상차지 문제', reasons: ['주소 다름', '점심시간', '문 잠김'] },
    ],
    /** 실어 본 뒤에야 아는 것 */
    LOADED: [
        { label: '상차 문제', reasons: ['화주 미준비', '물건 없음', '상차 중 파손'] },
    ],
    /** 오는 길 + 그 장소 + 짐 상태 (문을 열면 보인다 — 하차 완료는 이미 내린 뒤라 늦다) */
    ARRIVE_DROPOFF: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '하차지 문제', reasons: ['주소 다름', '수령인 부재'] },
        { label: '짐 상태', reasons: ['짐 무너짐', '결박 풀림', '파손 발견'] },
    ],
    /** 인수 단계 */
    DELIVERED: [
        { label: '하차 문제', reasons: ['검수 지연', '인수 거부'] },
    ],
};

/** 이것을 고를 때만 메모를 받는다 — 자유 입력 금지 원칙의 유일한 예외 (근거는 위) */
export const REASON_NEEDS_MEMO = '기타';

/** 이 **단계**의 사유 갈래 — `기타` 는 언제나 마지막 갈래로 따로 선다 */
export function arrivalReasonGroupsFor(stepId: string): Array<{ label: string; reasons: string[] }> {
    const own = REASON_GROUPS_BY_STEP[stepId];
    if (!own) return [];
    return [
        ...own.map(g => ({ label: g.label, reasons: [...g.reasons] })),
        { label: '기타', reasons: [REASON_NEEDS_MEMO] },
    ];
}

/** 갈래를 펼친 평면 목록 (검사·저장 검증용) */
export function arrivalReasonsFor(stepId: string): string[] {
    return arrivalReasonGroupsFor(stepId).flatMap(g => g.reasons);
}

export const ARRIVAL_REASONS = Array.from(new Set(
    Object.keys(REASON_GROUPS_BY_STEP).flatMap(arrivalReasonsFor),
));

/**
 * 📍 **마지막으로 아는 자리 — «내가 지금 어디 있나»의 답**.
 *
 * 🔴 **낡아도 집으로 바꾸지 않는다.** 터널·주차장에서 5분 끊긴 것뿐인데 지도가 집으로
 *    날아가면, 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다. **그물은 더 심하다** —
 *    이천에 있는데 파주 콜이 올라온다 (기사님 확정: 지도·그물 둘 다 «마지막 실제 위치»).
 * 🔴 모르면 **`null`** 이다 — 집을 지어내지 않는다 (규칙 ④).
 */
export interface DriverPositionDto {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** 기점으로 쓰기엔 낡았나 (서버 문턱 5분) */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

/**
 * 🧭 **경로를 어디서부터 짰나 — 위와 다른 질문이다** (규칙 ⑤-4 ⑤).
 *    출발점이 없으면 계산 자체가 안 되므로 낡으면 **집**을 넣는다. 그 규칙은 실제
 *    사고에서 나왔다 (여주에서 4시간 25분 뒤 광주 콜의 경로가 40km 뒤에서 그려졌다).
 *    🔴 **이 값으로 «내 위치» 마커를 찍지 않는다** — 그러면 화면이 «집에 있다»고 거짓말한다.
 */
export interface RouteOriginDto {
    x: number; y: number;
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 «집 주소로 대신했다» — 화면이 그 사실을 말할 수 있게 */
    isFallback: boolean;
}

export interface OrderSyncPayload {
    active: SecuredOrder[];
    terminated: SecuredOrder[];
    /**
     * 🧭 **경로 기점 — 정거장 순서(`routeStops`)를 짠 그 자리**.
     *    같이 와야 «1번 정거장이 내 뒤에 있다» 같은 화면이 안 난다.
     *
     * ⚠️ **«내 위치»는 여기 없다** — 이 봉투는 «콜이 바뀔 때» 나가는데 위치는 1초마다
     *    바뀐다. 함께 실으면 **옛 좌표가 내 점을 뒤로 당겨** 모의 주행이 멈춘 것처럼
     *    보인다 (기사님 실측). 위치는 `driver-position` 이벤트로 따로 간다 (규칙 ⑤-4 ③).
     *    🔴 이 봉투를 1초마다 보내는 길은 막혀 있다 — **초당 474KB 사고 자리**다.
     * ⚠️ 옛 서버는 안 싣는다 — `undefined` 면 화면이 «모른다»로 그린다.
     */
    /**
     * 📅 **예약 보관 — 내일 이후 콜**. 오늘 목록(`active`)에는 없다 — 관제웹 «📅 예약» 칸만 그린다.
     * ⚠️ 옛 서버는 안 싣는다.
     */
    reserved?: SecuredOrder[];
    routeOrigin?: RouteOriginDto | null;
    /**
     * 🚫 취소 카운터 — **한 판(10회)에서 몇 번 썼나** (기사님 개정).
     * 망별(targetApp) SAFE_CANCEL 건수. 파생값이라 저장하지 않고 서버가 장부에서 센다.
     *
     * ⚠️ **리셋 시각 이후만** 센다 — 전 기간을 누적하면 `47/10` 처럼 한도를 몇 배씩 넘긴 숫자가 떠
     *    *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다 — 총량은 `cancelRounds` 가 지킨다.
     */
    cancelCounts?: Record<string, number>;
    /**
     * 🚫 **몇 판째인가** (망별). 한 판 = `CANCEL_BUDGET_PER_ROUND` 회.
     *
     * 🔴 *"취소는 리셋되지 않는다"* 는 원칙을
     *    지키는 자리다. 그 취지는 **총량이 사라지면 안 된다**는 것이지 "숫자가 영원히
     *    커져야 한다"가 아니다. 판수가 남으므로 총량은 `(판수-1)×10 + 카운트` 로 그대로 산다.
     */
    cancelRounds?: Record<string, number>;
    /**
     * 🧭 **경로 순서의 원천 — 서버 하나다** (기사님 동의).
     * 방문 순서대로의 정거장 목록. 관제웹은 자기 TSP 를 돌리지 않고 이걸 그대로 그린다
     * (두 벌이면 ETA 가 엉뚱한 정거장에 붙는다 — "파생값 두 벌" 사고 클래스).
     * 빈 배열은 "정거장 없음"이 아니라 "경로 미연산/고장"일 수 있다 — 콜 자체는 그린다.
     */
    routeStops?: RouteStopInfo[];
    /**
     * 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = **카카오호출시점**. 지금 시각을 기준으로 쓰면
     * 추정 약속이 매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다.
     */
    routeComputedAt?: string | null;
    /**
     * 🧭 **지금 경로를 든 콜의 id** (기사님 확정 · 잔상 수리).
     *
     * 폴리라인은 «홀더» 한 콜에만 실린다. 관제웹이 홀더를 추측하면 KEEP 직후처럼 갈리는 순간에
     * **직전 콜의 옛 선**을 그린다 — 이름을 실어 추측을 없앤다 (규칙 ③).
     * 🔴 폴리라인 자체를 여기 담지 않는다 — 콜에 이미 있는 것을 한 벌 더 만들면
     *    payload 가 두 배가 되고(초당 237KB 사고) 파생이 두 벌이 된다.
     */
    routeHolderId?: string | null;
    /**
     * 🟡 **심사 중인 콜의 «미리보기 궤적» 홀더** (기사님 실물).
     *
     * 위 `routeHolderId` 는 **주행분(`sectionDriveMin`)이 있는 콜**을 가리키는데,
     * 그 값은 KEEP 뒤에 채워져 **심사 중 30초 동안은 없다.** 그 사이 카카오 궤적은
     * 이미 콜에 실려 있는데도 아무도 안 가리켜, 화면이 «경로가 없을 때만 그리는»
     * 직선 보조선을 그렸다 (기사님: *"점선으로 궤적이 나와야 하는데 또 직선으로 나온다"*).
     *
     * 한 값이 두 질문을 답하고 있었다 (규칙 ⑤-4 ⑤) — **타임라인**과 **그림**은 다른 질문이다.
     * 그래서 갈랐다. 합치면 심사 중 콜의 빈 주행분이 타임라인을 폴백으로 돌린다.
     */
    previewRouteHolderId?: string | null;
}

/** 경로 위의 정거장 하나 — 어느 콜의 어느 쪽을 몇 분 주행 뒤에 가는가 */
/**
 * 🚫 **취소 예산 한 판의 크기** (기사님 확정).
 *
 * 배차망이 세는 취소 한도다.
 * 🔴 서버와 관제웹이 이 값 하나를 본다 — 서버가 "다 썼다"를 판정하려면 같은 값을 봐야 하고, 두 벌이면 갈라진다.
 */
/**
 * 👁️ **필터 성적표 — 마지막 스캔 한 판** (기사님 확정).
 * 앱의 `FilterTally` 와 **같은 모양**이다. 축 이름이 갈라지면 화면이 엉뚱한 축을 가리킨다.
 */
export interface FilterTally {
    /** 이번 스캔에서 판정한 콜 수 (요금을 못 읽어 버려진 카드는 여기 안 든다) */
    seen: number;
    /** 전부 통과한 콜 수 */
    passed: number;
    /**
     * 🔔 이번 읽기에서 **처음 알람감이 된** 통과 콜 수 — 이미 알람을 낸 콜(상차+하차 · 요금만 오른 같은 콜 포함)은 안 센다.
     *    서버 알람은 이것으로 가른다. 옛 앱은 안 보낸다 → 서버는 passed 로 가른다.
     */
    passedNew?: number;
    vehicle: number;
    region: number;
    fare: number;
    pickup: number;
    blacklist: number;
    routeOrder: number;
    /** 📋 상차 목록에 안 걸린 콜 — 원달앱 2.9.7 부터 (옛 앱은 안 보낸다 · 하차 목록») */
    pickupList?: number;
    /** 📅 예약콜 축에 막힌 콜 — 원달앱 예약 필터부터 (옛 앱은 안 보낸다) */
    reservation?: number;
}

export const CANCEL_BUDGET_PER_ROUND = 10;

export interface RouteStopInfo {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    /** 출발점(현위치)에서 이 정거장까지 **누적 주행(분), 정차 미포함**. 연산 전·실패면 null */
    driveMinutes: number | null;
}
export * from './callSteps';
export * from './callOptions';
export * from './cargoSpec';
export * from './stepTables';
export * from './stepRecords';
export * from './timing';
export * from './dryRun';
/**
 * 🔴 콜의 **색을 정하는 곳 — 여기 하나뿐이다**.
 *    이 파일은 아무것도 import 하지 않는다 — 순환 참조를 만들지 않으려는 것이다.
 */
export * from './judgment';
export * from './judge';
export * from './criteria';

/** 🏷️ 화면 이름표 — 배차망별로 갈라 둔다 (기사님 설계) */
export * from './screenLabels';
export * from './naviLink';
/** ⏱️ 밀림 — 한 콜이 앞선 정거장을 몇 분 밀었나, 누가 밀었나 (실험실에서 올림) */
export * from './stopImpact';
/** 🎨 구간별 선 — 통짜 폴리라인 + 경계로 자른다 */
export * from './sectionLine';
/**
 * 🕸️ **콜 그물·2단계 판정** — 지도 실험실이 나흘 동안 기사님과 맞춰 온 계산
 *    (기사님 확정: *«실험실 계산을 올린다»*).
 *    마름모·라인 띠·든 동·제외 지역·정거장 재배치가 전부 여기 있다.
 * 🔴 **실물이 원천이고 실험실이 그것을 부른다** — 화면과 서버가 같은 계산을 봐야
 *    «화면은 든다는데 판정은 탈락»이 안 생긴다 (규칙 ③).
 */
export * from './callNet';
export * from './trappedRegions';

/**
 * ⏱️ **«주행·정차»로 굳는 데 걸리는 초 — 기본값** (기사님 확정 · 화면규칙 S16).
 *
 * 20km/h↑ 가 이 시간만큼 이어지면 «주행», 5km/h↓ 면 «정차»로 본다.
 * 기사님이 ⚙️ 설정 → 「화면 설정」에서 고칠 수 있다 (`user_settings.motion_hold_sec`).
 *
 * 🔴 **모의 주행에서는 줄여야 한다** — 배속이 빠르면 정거장 사이를 2~7초에 지나가
 *    10초를 채울 수가 없다. 그래서 «주행이면 시트가 내려간다»가 발화 못 했다
 *    (기사님 실측: 빠름 40배로 한 판을 다 돌았는데 하루 종일 `idle`).
 *    기사님: *"모의주행할 때는 그걸 줄이고 시험하고 **진짜 때는 10으로**"*
 */
export const MOTION_HOLD_SEC_DEFAULT = 10;

/**
 * ⏱️ **배차망별 대기 시간** (기사님 확정).
 *
 * 원천은 DB `user_settings` 세 칸이다 — 여기는 **값이 없을 때의 기본값**(DB DEFAULT 와 같다)과
 * «그 배차망은 몇 초인가»를 가르는 한 곳이다. 서버 타이머 · 관제웹 표시가 같은 함수를 부른다.
 *
 * 🔴 **뜻이 다른 둘이다** (규칙 ⑤-4 ⑤):
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간(안전취소).
 *     인성의 취소 가능 시간은 1분이고, 30초는 기사님이 둔 안전 여유다
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다.** 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
export const SAFE_CANCEL_SEC_DEFAULT = 30;
export const PICKER_ALARM_DETAIL_SEC_DEFAULT = 30;
/** 서버는 원달앱이 취소한 **뒤에** 메모리를 치운다 — 그 간격 (옛 30초 경고 · 35초 해제의 차이) */
export const SERVER_CLEANUP_EXTRA_SEC = 5;

/**
 * ⏳ **«알 수 없는 화면»이 이만큼 이어지면 상세를 떠난 것으로 본다**.
 *
 * 카드를 여는 순간 `UNKNOWN` 이 **0.05~0.18초** 끼는 일이 있다(실제 픽커 68건 중 3건). 그것을 이탈로
 * 읽으면 카드가 깜빡인다. 반대로 영영 무시하면 배차망 앱 밖으로 나갔을 때를 못 잡는다 — 그때도
 * 하트비트는 계속 오기 때문이다. 앱은 **화면이 바뀌면 즉시** 보고하므로, 몇 초를 넘겨 모름이
 * 이어진다는 것은 스침이 아니라 실제로 다른 곳에 있다는 뜻이다.
 *
 * 🔴 이것은 콜의 수명을 재는 타이머가 아니다 — «이탈»의 정의에 든 시간이다 (기사님: 타이머로 미리보기를 켜고 끄지 않는다).
 */
export const UNKNOWN_LEAVE_SEC = 5;

export interface WaitTimes {
    safeCancelSecInsung: number;
    safeCancelSecHwamul24: number;
    pickerAlarmDetailSec: number;
}

export const DEFAULT_WAIT_TIMES: WaitTimes = {
    safeCancelSecInsung: SAFE_CANCEL_SEC_DEFAULT,
    safeCancelSecHwamul24: SAFE_CANCEL_SEC_DEFAULT,
    pickerAlarmDetailSec: PICKER_ALARM_DETAIL_SEC_DEFAULT,
};

/**
 * ⏱️ **대기 시간 입력 — 1 이상 정수만 값이다** · 아니면 `null` (리뷰).
 * 관제웹 칸을 비우고 저장하면 0초가 저장됐다 — 인성 안전취소 0초면 원달앱이 잡자마자 스스로 취소한다.
 * 🔴 1초 미만은 값이 아니라 고장이다 · 상한은 걸지 않는다(기사님 확정). `null` 이면 설정 경로가 옛 값을 그대로 둔다.
 */
export function waitSecOrNull(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const sec = Math.floor(n);
    return sec >= 1 ? sec : null;
}

/** 그 배차망의 안전취소 초 — 픽커는 안전취소가 없어 `null` · 모르는 배차망은 기본 배차망(인성) */
export function safeCancelSecOf(w: WaitTimes, targetApp: string | null | undefined): number | null {
    const app = isTargetApp(targetApp) ? targetApp : DEFAULT_TARGET_APP;
    if (app === 'kakaopicker') return null;
    return app === 'hwamul24' ? w.safeCancelSecHwamul24 : w.safeCancelSecInsung;
}
export * from './logTags';
export * from './pageFields';
export * from './sigungu';
export * from './adminDongMatch';
export * from './networkPages';
export * from './collectList';
export * from './flowViews';
export * from './pageRead';

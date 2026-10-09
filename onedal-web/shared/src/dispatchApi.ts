import { isManualLineage } from './callStatus';
import type { SimplifiedOfficeOrder, OfficeOrder } from './orderShapes';
import type { AutoDispatchFilter } from './dispatchFilter';
import type { DeviceModeType } from './deviceModes';
import type { ScreenContextType } from './screenKinds';

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

/**
 * ✋ **확정을 누가 눌렀나 — 사실 하나** (29 N4 사실 ③ · P2) — `NONE` 안 눌림(미리보기) · `DRIVER` 기사님 손(`matchType` MANUAL 이거나 콜 갈래가 MANUAL — `isManualLineage`) · `APP` 원달앱.
 * 서버 세 자리(/confirm · /detail 앞 기억 · /detail 갈래)가 같은 입력을 넘긴다 — 갈래만 MANUAL 이고 matchType 이 AUTO 인 옛 보고도 한 답.
 * 서버는 결재 기다림 · 1차 선점 안전취소 · 체험(연습) 표시를 이것으로 가른다 — 모드 이름으로 가르지 않는다.
 */
export type WhoConfirmed = 'NONE' | 'APP' | 'DRIVER';
export function whoConfirmed(r: { isPreview?: boolean; matchType?: string; type?: string | null }): WhoConfirmed {
    if (r.isPreview) return 'NONE';
    return r.matchType === 'MANUAL' || isManualLineage(r.type) ? 'DRIVER' : 'APP';
}

/**
 * 📲 **폰 화면이 그 콜과 다른 배차망인가** (38 F36 · 기사님 «원달앱이 확정한 콜은 원달앱이 끝까지 책임진다»).
 * 다른 배차망 화면은 «콜을 놓음»이 아니다 — 원달앱이 그 콜의 배차망으로 돌아가 결재를 집행한다. 하나라도 모르면 거짓(지금처럼).
 */
export function leftForOtherNetwork(orderNet?: string | null, screenNet?: string | null): boolean {
    return !!orderNet && !!screenNet && orderNet !== screenNet;
}

/**
 * ⏱️ **안전취소 시한이 지났을 때 서버가 할 일** (38 F36).
 * 원달앱이 계약한 진짜 콜은 서버 시계로 세지 않는다 — 원달앱이 «취소»를 실제로 누르고 보고한 뒤에 센다(못 눌렀으면 경보).
 * 미리보기 · 체험 · 손 확정은 원달앱이 계약하지 않았으니 지금처럼 서버가 치운다.
 */
export type TimeoutAction = 'KEEP_GUARD' | 'WAIT_APP_REPORT' | 'FORCE_CANCEL';
export function timeoutActionOf(r: { keep: boolean; who: WhoConfirmed; simulated: boolean }): TimeoutAction {
    if (r.keep) return 'KEEP_GUARD';
    return r.who === 'APP' && !r.simulated ? 'WAIT_APP_REPORT' : 'FORCE_CANCEL';
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
    /** 🌐 어느 배차망 화면에서 났나 — 원달앱이 늘 싣는다(`TargetApp` 코드값) · 옛 원달앱은 없을 수 있다 */
    targetApp?: string;
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

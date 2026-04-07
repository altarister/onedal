export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
};

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
export type PaymentType = '신용' | '선불' | '착불' | '카드' | '현금';
export type BillingType = '계산서' | '인수증' | '무과세';
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'canceled';

// 나중에 상세 주소나 위경도가 필요할 때를 대비한 하위 객체
export interface LocationPoint {
    code?: string;
    name: string;             // 예: "역삼동"
    fullName?: string;        // 예: "서울 강남구 역삼동"
    centroid?: [number, number];
}

// [신규] 출발지/도착지 팝업에서 긁어올 상세 정보 (운행일지 및 리뷰 작성용)
// 인성앱 "출발지 상세" / "도착지 상세" 팝업 기준 1:1 매핑
export interface LocationDetailInfo {
    customerName?: string;    // [고객] 상호/고객명 (예: "*레드캠프", "SK스토아 홈쇼핑(5층하차")
    department?: string;      // [부서] 부서명 (예: "정실장님", 빈 값일 경우 "*")
    contactName?: string;     // [담당] 담당자명 (예: "정종혁차장")
    mileage?: number;         // [마일리지] 마일리지 포인트 (예: 0)
    phone1?: string;          // [전화1] 대표 연락처 (예: "010-2228-4991")
    phone2?: string;          // [전화2] 보조 연락처 (예: "031-267-1224", 빈 값일 경우 "*")
    region?: string;          // [출발/도착] 광역 지역명 (예: "경기 화성시", "서울 마포구")
    addressDetail?: string;   // [위치] 상세 주소+건물명 (예: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)")
    requestedTime?: string;   // 상차/하차 예약 시간 (확정 페이지에서 파싱, 예: "13:53")
    memo?: string;            // 현장 전달사항 (적요 등에서 추출)
}

// 1. [목록 위젯] 매크로가 0.01초만에 읽어야 하는 겉표면 텍스트
export interface SimplifiedOfficeOrder {
    id: string;                       // 스캐너 앱 쪽 고유 ID
    type: EventType;                  // NEW_ORDER 등 통신 규격
    pickup: string;                   // 예: "경기 광주 오포"
    dropoff: string;                  // 예: "강남구 역삼동"
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
    // (선택) MOCK 지도 연산 및 시뮬레이션 용 임시 좌표
    pickupX?: number;
    pickupY?: number;
    dropoffX?: number;
    dropoffY?: number;
    pickupDistance?: number;          // 상차지까지의 남은 직선 거리 (km)
}
// 2. [상세 페이지] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface DetailedOfficeOrder {
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
    pickupDetails?: LocationDetailInfo[];  // [추가] 출발지 상세 정보 목록 (팝업 파싱)
    dropoffDetails?: LocationDetailInfo[]; // [추가] 도착지 상세 정보 목록 (팝업 파싱)
    distanceKm?: number;              // 운행 거리(km)
    isMock?: boolean;                 // 목업 콜 여부
    isShared?: boolean;               // 합짐(혼적) 여부
    isExpress?: boolean;              // 급송(독차) 여부
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    vehicleType?: string;             // 차량 종류 (다마스, 1톤카고 등)
    itemDescription?: string;         // 화물 요약 (예: "박스 2개")
    companyName?: string;             // 화주 상호/이름
    pickupTime?: string;              // 픽업 예약 시간 지정
}

export interface FilterConfig {
    mode: '첫짐' | '대기' | '합짐' | '복귀';
    minFare: number;       // 최소 운임 (예: 60000)
    pickupRadius: number;  // [조건4] 상차지 최대 직선 거리 (km)
    targetCity: string;    // 관제 UI용 대표 도시명 (예: "용인시")
    targetRegions: string[]; // [조건1] 목표 하차지 법정동 배열 (예: ["마평동", "역북동"])
    targetRadius: number;  // 목표 도시 매칭 반경 (km)
    blacklist: string[];   // [조건3] 제외 키워드 배열 (예: ["착불", "수거", "까대기"])
    // 합짐 모드 시 동적 회랑 정보 (옵션)
    detourBaseId?: string;
}

// 3. [오더 풀스팩] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder { }

// 4. [우리 서버 데이터] 최종적으로 내 소유권이 부여되고 관제가 이뤄지는 확정 오더
export interface SecuredOrder extends OfficeOrder {
    status: 'evaluating_basic' | 'evaluating_detailed' | 'confirmed' | 'canceled'; // 1차 평가 여부 추가
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가 (미래 확장성)
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    kakaoDistExt?: string;            // 카카오 연산 결과: 예상 거리 텍스트
    settlement?: SettlementInfo;      // [추가] 정산 및 미수금 관리 트래킹 (운행일지용)
}

// [신규] 운행일지 정산 및 미수금 추적을 위한 구조체
export interface SettlementInfo {
    status: '미정산' | '지급예정' | '정산완료' | '미수금'; // 현재 돈을 받았는지 상태
    unpaidAmount: number;             // 받지 못한 금액 (미수금) 
    payerName?: string;               // 결제/입금 담당자명 또는 회사명 (예: "레드캠프 경리팀")
    payerPhone?: string;              // 결제 담당자 연락처 (이 번호로 전화해서 청구)
    dueDate?: string;                 // 입금 예정일 (예: "매월 말일", "15일", ISO date 등)
    memo?: string;                    // 정산 관련 메모 (예: "수수료 떼고 입금하기로 함", "전화 안받음")
}

// 자동배차 설정 인터페이스 (전역 설정 동기화용)
export interface AutoDispatchFilter {
    pickupRadiusKm: number;       // 내위치 반경 상차지 탐색(km)
    status: '첫짐' | '대기' | '합짐';
    minFare: number;              // 최소 운임 (하한선)
    maxFare: number;              // 최대 운임 (디폴트 100만)
    destinationCity: string;      // 하차 목표 메인 지역 (시/군/자치구)
    destinationRadiusKm: number;  // 하차 목표 주위 탐색 반경 (km)
    excludedKeywords: string;     // 제외 단어 (콤마 분리 문자열)
    destinationKeywords: string;  // 목표 지역+반경 기반 서버 환산 동이름(키워드 콤마 분리형)
    customFilters: string[];      // 특수 기호 등 하단 빠른 설정 텍스트 (ex: "^^,@", "김포,인천...")
}

// 안드로이드 앱폰 -> 서버로 쏘는 주기적인 상태 보고(텔레메트리)
export interface EdgeDeviceTelemetry {
    deviceId: string;                 // 기기 고유 식별자 (예: "phone-1")
    macroStatus: 'IDLE' | 'SCANNING' | 'PAUSED' | 'ERROR'; // 현재 매크로 엔진 상태
    lastOrderCheckedAt: string;       // "오더 조회 중입니다" 토스트가 마지막으로 뜬 시간 (ISO 8601)

    // 앱에서 긁어낸 실시간 통계 누적 현황
    collectedCount: number;           // 인성망에서 긁어낸 전체 오더 갯수 (블랙리스트 걸러지기 전)
    acceptedCount: number;            // 0.01초 광클 로직이 성공해서 수락된 배차 갯수
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
}

// 1-B. 앱폰 -> 서버: 2차 호출 (상세 페이지 진입 후 상세 정보 파싱 완료 시)
export interface DispatchDetailedRequest {
    step: 'DETAILED';
    deviceId: string;
    order: OfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
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
export type DeviceStatusType = "ONLINE" | "OFFLINE_GRACEFUL" | "DISCONNECTED";
export type DeviceModeType = "AUTO" | "MANUAL" | "SHUTDOWN";

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 사냥 리스트 화면
    | 'DETAIL_PRE_CONFIRM'    // 광클 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
    | 'WAITING_SERVER'        // 서버 응답 대기 중 (데스밸리)
    | 'UNKNOWN';              // 알 수 없는 화면

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
}

export interface ScrapResponse {
    apiStatus: {
        success: boolean;
        totalItems: number;
    };
    deviceControl: {
        mode: DeviceModeType;
    };
    dispatchEngineArgs?: FilterConfig;
}

export interface DeviceSession {
    deviceId: string;
    lastSeen: number;       // 밀리초 타임스탬프
    status: DeviceStatusType;
    mode: DeviceModeType;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
}


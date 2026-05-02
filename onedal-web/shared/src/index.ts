export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
    MANUAL: "MANUAL" as const,
};

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
export type PaymentType = '신용' | '선불' | '착불' | '카드' | '현금';
export type BillingType = '계산서' | '인수증' | '무과세';
export type OrderStatus = 'pending' | 'evaluating_basic' | 'evaluating_detailed' | 'confirmed' | 'completed' | 'canceled';

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
    postTime?: string;                // [추가] 앱에서 긁어온 콜 상차시간/등록시간 (예: "12:23")
    scheduleText?: string;            // [추가] 예약일정/수식어 (예: "낼09시", "11일)09시", "@")
    vehicleType?: string;             // [추가] 차종 (예: "라", "다", "1t" 등)
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
    // 1. 배차사(퀵사무실) 정보 (상세화면 최상단)
    dispatcherName?: string;          // 배차 사무실 상호 (예: "고양퀵서비스")
    dispatcherPhone?: string;         // 배차 사무실 연락처 (예: "031-932-7722")
    
    // 2. 문서/전표 기본 정보
    receiptStatus?: string;           // 전표 상태 (예: "신규", "수정", "취소")
    itemDescription?: string;         // 물품 요약 (예: "소형 가전", "박스 2개")
    vehicleType?: string;             // 차량 종류 (예: "1t", "다마스")
    
    // 3. 요금 상세 스펙
    commissionRate?: string;          // 수수료율 (예: "23%", "10%", "*%")
    tollFare?: string;                // 탁송료/통행료 별도 기재 항목
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    
    // 4. 운행 조건 스펙
    tripType?: string;                // 배송 구분 (예: "편도", "왕복")
    orderForm?: string;               // 배송 형태 (예: "보통", "급송")
    detailMemo?: string;              // 적요 상세 (원문 전체)
    
    // 5. 위치 정보
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
    pickupDetails?: LocationDetailInfo[];  // 출발지 상세 정보 (팝업 파싱)
    dropoffDetails?: LocationDetailInfo[]; // 도착지 상세 정보 (팝업 파싱)
    distanceKm?: number;              // 운행 거리(km)
    
    // 6. 메타 데이터 및 호환성 필드
    isMock?: boolean;                 // 목업 콜 여부
    isShared?: boolean;               // 합짐(혼적) 여부
    isExpress?: boolean;              // 급송(독차) 여부
    companyName?: string;             // 화주 상호/이름 (과거 호환 유지 목적)
    pickupTime?: string;              // 픽업 예약 시간 지정
}

// (FilterConfig removed in favor of AutoDispatchFilter)
// 3. [오더 풀스팩] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder { }

// 4. [우리 서버 데이터] 최종적으로 내 소유권이 부여되고 관제가 이뤄지는 확정 오더
export interface SecuredOrder extends OfficeOrder {
    status: 'evaluating_basic' | 'evaluating_detailed' | 'confirmed' | 'canceled' | 'completed';
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가 (미래 확장성)
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // [신규] 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // [추가] 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // [추가] 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // [추가] 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // [추가] 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    osrmSoloDistanceKm?: number;      // [추가] OSRM이 연산한 해당 콜만의 '단독' 주행 거리
    osrmSoloDurationMin?: number;     // [추가] OSRM이 연산한 해당 콜만의 '단독' 소요 시간
    osrmError?: string;               // [추가] OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // [신규] 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    pickupEta?: string;               // [신규] 카카오 궤적 연산 기반 상차지 예상 도착 시간 (예: "14:30")
    dropoffEta?: string;              // [신규] 카카오 궤적 연산 기반 하차지 예상 도착 시간 (예: "15:20")
    settlement?: SettlementInfo;      // [추가] 정산 및 미수금 관리 트래킹 (운행일지용)
    isRejected?: boolean;             // [신규] 서버 종합 평가 결과: 똥콜 판정 여부 (true/false)
    rejectionReasons?: string[];      // [신규] 모든 탈락/패널티 사유 배열 (예: ["차종(다마스) 불일치", "우회시간 +74분 초과"])
    approvalReasons?: string[];       // [신규] 모든 장점/긍정 사유 배열 (예: ["꿀콜 🍯", "운행시간 양호", "요금 적정"])
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
export type LoadState = 'EMPTY' | 'LOADING' | 'DRIVING' | 'ARRIVED';

export interface AutoDispatchFilter {
    allowedVehicleTypes: string[];   // 허용 차종 배열 (예: ["1t","다마스"]) — 빈 배열이면 모든 차종 허용
    isActive: boolean;              // 필터링(매크로) 활성화 여부
    isSharedMode: boolean;          // 첫짐/합짐 분기 (true면 합짐 회랑, false면 첫짐 수동)
    loadState: LoadState;           // 적재 상태 (EMPTY: 공차, LOADING: 적재중(10km회랑), DRIVING: 운행중(0km회랑), ARRIVED: 도착)
    pickupRadiusKm: number;         // 내위치 반경 상차지 탐색(km)
    minFare: number;                // 최소 운임 (하한선)
    maxFare: number;                // 최대 운임 (디폴트 100만)
    destinationCity: string;        // 하차 목표 메인 지역 (시/군/자치구) / 합짐 시에는 UI 축약 문구로 오버로딩
    destinationRadiusKm: number;    // 하차 목표 주위 탐색 반경 (km)
    excludedKeywords: string[];     // 제외 단어 배열 (예: ["착불", "수거", "까대기"])
    destinationKeywords: string[];  // (내부망) 앱 파싱용 읍/면/동 50개 키워드 배열
    destinationGroups?: Record<string, string[]>; // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customCityFilters: string[];    // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customFilters: string[];        // 특수 기호 등 하단 빠른 설정 텍스트 (ex: "^^,@", "김포,인천...")
    corridorRadiusKm?: number;      // (합짐 모드) 경로 주변 이탈 허용 반경 (기본값 10km)
    userOverrides?: boolean;        // 기사가 팝업에서 수동으로 필터(destinationKeywords 등)를 조작했는지 여부(서버 덮어쓰기 방지용)
}

// 서버 전용: 다이내믹 요율 계산 엔진 파라미터 (앱으로 전송하지 않음)
export interface PricingConfig {
    vehicleRates: Record<string, number>;  // 차종별 km당 적정 단가 (예: { "1t": 1000, "다마스": 800 })
    agencyFeePercent: number;              // 퀵사(사무실) 수수료율 (예: 23)
    maxDiscountPercent: number;            // 기사 수용 가능 최대 할인율 (예: 10)
}

// 스마트 회랑 전용 데이터 구조 (PinnedRoute 등 프론트엔드 UI용)
export interface CorridorRouteData {
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
export type DeviceStatusType = "ONLINE" | "OFFLINE";
export type DeviceModeType = "AUTO" | "MANUAL";

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
    dispatchEngineArgs?: AutoDispatchFilter;
}

export interface DeviceSession {
    deviceId: string;
    deviceName?: string;    // 기기 별명 (PIN 페어링 시 등록, 예: "메인폰", "서브폰")
    lastSeen: number;       // 밀리초 타임스탬프
    status: DeviceStatusType;
    mode: DeviceModeType;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    isHolding?: boolean;    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    lat?: number;           // [GPS 텔레메트리] 앱폰(차량) 위도
    lng?: number;           // [GPS 텔레메트리] 앱폰(차량) 경도
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
}


export * from './vehicles';

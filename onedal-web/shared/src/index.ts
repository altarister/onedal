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

// 1. [목록 위젯] 매크로가 0.01초만에 읽어야 하는 겉표면 텍스트
export interface SimplifiedOfficeOrder {
    id: string;                       // 스캐너 앱 쪽 고유 ID
    type: EventType;                  // NEW_ORDER 등 통신 규격
    pickup: string;                   // 예: "경기 광주 오포"
    dropoff: string;                  // 예: "강남구 역삼동"
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
}
// 2. [상세 페이지] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface DetailedOfficeOrder {
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
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

    // (선택) MOCK 지도 렌더링용 임시 좌표
    pickupX?: number;
    pickupY?: number;
    dropoffX?: number;
    dropoffY?: number;
}

export interface FilterConfig {
    mode: '첫짐' | '대기' | '합짐';
    minFare: number;       // 예: 40000
    pickupRadius: number;  // 예: 10
    targetCity: string;    // 예: '용인시'
    targetRadius: number;  // 예: 10
    blacklist: string;     // 예: '착불, 수거'
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
export type DeviceModeType = "AUTO" | "MANUAL";

export interface DeviceSession {
    deviceId: string;
    lastSeen: number;       // 밀리초 타임스탬프
    status: DeviceStatusType;
    mode: DeviceModeType;
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
}

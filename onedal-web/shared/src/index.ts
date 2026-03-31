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

// 🚀 확장된 최종 마스터 모델 (스캐너 연동 필수값 + 미래 확장 필드)
export interface OrderData {
    id?: string;                      // 스캐너 앱 쪽 고유 ID 또는 서버 발급 ID
    type: EventType;
    
    // 1. 현재 스캐너 연동 필수 1차원 데이터 (호환성 보장)
    pickup: string;                   // 예: "경기 광주 오포"
    dropoff: string;                  // 예: "강남구 역삼동"
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    status?: OrderStatus;             // 진행 상태
    
    // 2. 미래 확장성 (인성 배포 시스템 등의 복잡한 필드 차용)
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
    distanceKm?: number;              // 운행 거리(km)
    isShared?: boolean;               // 합짐(혼적) 여부
    isExpress?: boolean;              // 급송(독차) 여부
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    vehicleType?: string;             // 차량 종류 (다마스, 1톤카고 등)
    itemDescription?: string;         // 화물 요약 (예: "박스 2개")
    companyName?: string;             // 화주 상호/이름
    pickupTime?: string;              // 픽업 예약 시간 지정
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 DOM 텍스트 (휴리스틱 파싱용)
}

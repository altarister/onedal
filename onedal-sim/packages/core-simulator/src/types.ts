// ═══════════════════════════════════════════════════════════════
// @altari/core-simulator — 타입 정의
// React 의존성 ZERO. 순수 TypeScript 인터페이스만 정의.
// ═══════════════════════════════════════════════════════════════

// RegionIntel (OSRM 휴리스틱용 — 원본: src/types/intel.ts)
export type OrderVolume = '하' | '중하' | '중' | '중상' | '상' | '최상';

export interface RegionIntel {
  regionCode: string;
  name: string;
  parentName: string;
  roads: string[];
  orderVolume: OrderVolume;
  importance: number;
  fieldTips: string[];
  landmarks?: string[];
}

// LocationPoint (좌표 기반 위치)
export interface LocationPoint {
    code: string;
    name: string;
    fullName: string;
    centroid: [number, number];
    intel?: RegionIntel;
}

// LocationDetailInfo (출발지/도착지 상세 정보)
export interface LocationDetailInfo {
    customerName?: string;
    department?: string;
    contactName?: string;
    mileage?: number;
    phone1?: string;
    phone2?: string;
    region?: string;
    addressDetail?: string;
    requestedTime?: string;
    memo?: string;
}

// CallItem (배차 콜 아이템 — 모든 시뮬레이터 앱의 공통 데이터 구조)
export interface CallItem {
    id: string;
    pickups: LocationPoint[];
    dropoffs: LocationPoint[];
    pickupDetails?: LocationDetailInfo[];
    dropoffDetails?: LocationDetailInfo[];
    pickupDistanceKm?: number;
    distanceKm: number;
    status?: string;
    isShared?: boolean;
    isExpress?: boolean;
    paymentType?: '신용' | '선불' | '착불' | '카드';
    billingType?: '계산서' | '인수증' | '무과세';
    vehicleType?: string;
    itemDescription?: string;
    callCategory?: string;
    companyName?: string;
    pickupTime?: string;
    deliveryTime?: string;
    fare: number;
    freightFee?: number;
    recipientName?: string;
    isMatchingRoute: boolean;
    violation?: 'BAD_FARE' | 'WRONG_DEST';

    // ── 화물24시 전용 필드 (Optional, 인성앱에서는 무시됨) ──
    tonnage?: string;
    vehicleSpec?: string;
    loadingType?: '독차' | '혼적';
    tripType?: '편도' | '왕복';
    loadingMethod?: '당상' | '지상';
    unloadingMethod?: '당착' | '지착';
    freightId?: string;
    registeredAt?: string;
    receiptType?: '인수증' | '계산서';
    loadingWeight?: string;
    itemSummary?: string;
}

// AutoDispatchFilter (자동배차 설정)
export interface AutoDispatchFilter {
    allowWaypoint: boolean;
    allowRoundTrip: boolean;
    pickupRadiusKm: number;
    minFare: number;
    maxFare: number;
    excludedKeywords: string;
    destinationKeywords: string;
    customFilters: string[];
}

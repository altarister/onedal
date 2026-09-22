// ═══════════════════════════════════════════════════════════════
// @altari/core-simulator — 타입 정의
// React 의존성 ZERO. 순수 TypeScript 인터페이스만 정의.
// ═══════════════════════════════════════════════════════════════

// RegionIntel (OSRM 휴리스틱용)
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

// BaseCall — 어느 배차망이든 함께 쓰는 콜 칸
//
// 배차망마다 쓰는 칸은 그 배차망 폴더가 적는다 — 인성 `InsungCall`(insung/insungCall.ts) · 화물24시 `Hwamul24Call`(hwamul24/hwamul24Call.ts).
// 한 그릇에 섞으면 어느 화면이 어느 칸을 읽는지 가려지지 않는다. 칸을 가르는 기준은 «어느 화면이 읽나» 코드 검색이다.
// 🔴 이 파일은 배차망 이름을 모른다.
export interface BaseCall {
    id: string;
    pickups: LocationPoint[];
    dropoffs: LocationPoint[];
    pickupDetails?: LocationDetailInfo[];
    dropoffDetails?: LocationDetailInfo[];
    pickupDistanceKm?: number;
    distanceKm: number;
    pickupTime?: string;
    deliveryTime?: string;
    fare: number;
    /** ⚠️ 읽는 화면이 없다 — 생성기가 채우기만 한다 (지우지 않고 둔다) */
    isMatchingRoute: boolean;
    /** ⚠️ 읽는 화면이 없다 (위와 같다) */
    violation?: 'BAD_FARE' | 'WRONG_DEST';
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

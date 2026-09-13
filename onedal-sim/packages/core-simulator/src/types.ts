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

// BaseCall — 어느 배차망이든 함께 쓰는 콜 칸 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2 ③)
//
// 예전 이름 CallItem 은 인성 칸·화물24시 칸이 한 그릇에 섞여 있었다. 배차망마다 쓰는 칸은 이제
// 그 배차망 폴더가 적는다 — 인성 `InsungCall`(inseong/insungCall.ts) · 화물24시 `Hwamul24Call`(hwamul24/hwamul24Call.ts).
// 칸을 가른 기준은 «어느 화면이 읽나» 코드 검색이다. 🔴 이 파일은 배차망 이름을 모른다.
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
    /** ⚠️ 읽는 화면이 없다 — 지도 게임에서 가져올 때 딸려 온 칸으로 보인다 (지우지 않고 둔다) */
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

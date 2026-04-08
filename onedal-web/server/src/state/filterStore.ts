import type { AutoDispatchFilter } from "@onedal/shared";
import { getRegionsByCity } from "../geoResolver";

// 인메모리로 관리되는 1DAL 관제탑의 단일 "오더 필터" 전역 상태입니다.
// 서버 부팅 시 GeoJSON에서 광주시의 읍면동을 자동 조회하여 초기화합니다.
export let activeFilterConfig: AutoDispatchFilter = {
    model: '1t',
    isActive: true,
    isSharedMode: false,
    pickupRadiusKm: 30,
    minFare: 40000,
    maxFare: 1000000,
    destinationCity: '광주시',
    destinationRadiusKm: 10,
    excludedKeywords: ['착불', '수거', '까대기', '전화금지', '타일'].join(','),
    destinationKeywords: getRegionsByCity('광주시').join(','),
    customFilters: []
};

// 필터 상태를 덮어쓰는 유틸리티
export function updateActiveFilter(newFilter: Partial<AutoDispatchFilter>) {
    activeFilterConfig = { ...activeFilterConfig, ...newFilter };
    return activeFilterConfig;
}

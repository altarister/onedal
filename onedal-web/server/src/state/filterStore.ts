import type { FilterConfig } from "@onedal/shared";
import { getRegionsByCity } from "../geoResolver";

// 인메모리로 관리되는 1DAL 관제탑의 단일 "오더 필터" 전역 상태입니다.
// 서버 부팅 시 GeoJSON에서 용인시의 읍면동을 자동 조회하여 초기화합니다.
export let activeFilterConfig: FilterConfig = {
    mode: '첫짐',
    minFare: 40000,
    pickupRadius: 30,
    targetCity: '용인시',
    targetRegions: getRegionsByCity('용인시'),
    targetRadius: 10,
    blacklist: ['착불', '수거', '까대기', '전화금지', '타일']
};

// 필터 상태를 덮어쓰는 유틸리티
export function updateActiveFilter(newFilter: Partial<FilterConfig>) {
    activeFilterConfig = { ...activeFilterConfig, ...newFilter };
    return activeFilterConfig;
}

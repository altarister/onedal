import type { FilterConfig } from "@onedal/shared";

// 인메모리로 관리되는 1DAL 관제탑의 단일 "오더 필터" 전역 상태입니다.
export let activeFilterConfig: FilterConfig = {
    mode: '첫짐',
    minFare: 40000,
    pickupRadius: 30,
    targetCity: '용인시',
    targetRegions: ['마평동', '역북동', '삼가동', '김량장동', '유방동', '고림동', '남동', '운학동', '호동', '해곡동', '포곡읍', '모현읍', '이동읍', '남사읍', '원삼면', '백암면', '양지면', '중앙동', '역삼동', '유림동', '동부동'],
    targetRadius: 10,
    blacklist: ['착불', '수거', '까대기', '전화금지']
};

// 필터 상태를 덮어쓰는 유틸리티
export function updateActiveFilter(newFilter: Partial<FilterConfig>) {
    activeFilterConfig = { ...activeFilterConfig, ...newFilter };
    return activeFilterConfig;
}

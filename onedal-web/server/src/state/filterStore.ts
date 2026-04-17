import type { AutoDispatchFilter } from "@onedal/shared";
import { getRegionsByCity } from "../geoResolver";

// 인메모리로 관리되는 1DAL 관제탑의 단일 "오더 필터" 전역 상태입니다.
// 서버 부팅 시 GeoJSON에서 광주시의 읍면동을 자동 조회하여 초기화합니다.
export let activeFilterConfig: AutoDispatchFilter = {
    // 🚚 [차량 설정]
    // 허용할 차량 종류 (예: ['다마스', '라보']). 비워두면 모든 차량 콜 수신
    allowedVehicleTypes: [],

    // 🎯 [필터 동작 상태]
    // 자동 배차 필터 시스템 켜기/끄기 
    isActive: true,
    // 현재 모드: false = '단독 모드(첫짐)', true = '합짐/우회 모드(경로 사냥)'
    isSharedMode: false,

    // 💰 [운임 및 상차지 조건]
    // 기사님 현재 위치로부터 상차를 허용할 최대 검색 반경 (km)
    pickupRadiusKm: 30,
    // 거르고 싶은 '똥단가'의 하한선 (최소 이 금액 이상만 필터링)
    minFare: 35000,
    maxFare: 1000000,
    // 오더 적요나 상세에 이 단어들이 포함되어 있으면 매력을 삭감하거나 배제함
    excludedKeywords: ['착불', '수거', '까대기', '전화금지', '타일'],

    // 🏁 [첫짐(단독) 사냥 전용 설정]
    // 잡고 싶은 초기 하차지 도시 (예: '파주시')
    destinationCity: '파주시',
    // 하차지 도시 중심으로 반경 몇 km까지 추가로 아우를 것인지 결정
    destinationRadiusKm: 10,
    // 위 두 설정에 의해 추출된 '읍면동' 텍스트 모음 (앱폰에서 텍스트 기반 거르기용)
    destinationKeywords: getRegionsByCity('파주시'),

    // 🛣️ [합짐(우회) 사냥 전용 설정]
    // 기사님이 이미 수행 중인 콜의 "경로(파란선)"에서 추가로 이탈해도 되는 폭(반경) 설정 (km)
    // 10km로 하시면 앞뒤로 넓게 퍼져 꿀짐이 많이 잡히고, 1km로 하시면 거의 길가에 있는것만 잡힙니다.
    corridorRadiusKm: 1,

    // 🛡️ [수동 조작 및 권한]
    // 기사님이 화면에서 직접 설정한 값인지 여부 (서버의 추천 로직이 기사님 설정을 맘대로 덮어쓰지 못하게 방어함)
    userOverrides: false,

    // 이 외, 특정 키워드/건물명만 집중적으로 잡고 싶을 때 사용하는 확장 필터 배열
    customFilters: [],
};

// 필터 상태를 덮어쓰는 유틸리티
export function updateActiveFilter(newFilter: Partial<AutoDispatchFilter>) {
    activeFilterConfig = { ...activeFilterConfig, ...newFilter };
    return activeFilterConfig;
}

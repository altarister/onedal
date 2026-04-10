import type { LocationDetailInfo } from '../../../types/dispatch';
import mockDataRaw from '../../../data/mockLocationData.json';

// 100개의 리얼 주소 데이터 연동
const MOCK_LOCATION_DETAILS = mockDataRaw as LocationDetailInfo[];

// 순차적으로 꺼내 쓰기 위한 인덱스 카운터
let pickupIdx = 0;
let dropoffIdx = 50; // 도착지는 배열 중간부터 시작하여 다양성 확보

/**
 * 주어진 지역 문자열(regionHint)과 가장 비슷한 진짜 주소를 100개 풀에서 찾아 반환합니다.
 * 매칭되는 것이 없으면 순차적으로 반환합니다.
 */
const findMatchingDetail = (regionHint: string | undefined, isDropdown: boolean): LocationDetailInfo => {
  if (regionHint) {
    // 예: "경기도 성남시 분당구" -> "경기 성남시" 형태 추출 (앞 2어절)
    // 약간의 텍스트 보정 (경기도 -> 경기, 서울특별시 -> 서울 등)
    let normalizedHint = regionHint.replace('경기도', '경기').replace('서울특별시', '서울').replace('인천광역시', '인천');
    const cityMatch = normalizedHint.split(' ').slice(0, 2).join(' '); // "경기 성남시"
    
    // 100개의 실제 주소 중, 해당 "시/군/구"가 일치하는 주소 필터링
    const exactMatches = MOCK_LOCATION_DETAILS.filter(m => (m.region || '').includes(cityMatch) || (m.addressDetail || '').includes(cityMatch));
    
    if (exactMatches.length > 0) {
      if (isDropdown) {
        const detail = exactMatches[dropoffIdx % exactMatches.length];
        dropoffIdx++;
        return detail;
      } else {
        const detail = exactMatches[pickupIdx % exactMatches.length];
        pickupIdx++;
        return detail;
      }
    }
  }

  // 매칭되는 지역이 아예 없으면 (예: 제주도, 부산 등 풀에 적은 곳) 그냥 순차적으로 꺼냄
  if (isDropdown) {
    const detail = MOCK_LOCATION_DETAILS[dropoffIdx % MOCK_LOCATION_DETAILS.length];
    dropoffIdx++;
    return detail;
  } else {
    const detail = MOCK_LOCATION_DETAILS[pickupIdx % MOCK_LOCATION_DETAILS.length];
    pickupIdx++;
    return detail;
  }
};

export const getNextPickupDetail = (regionHint?: string): LocationDetailInfo => {
  return findMatchingDetail(regionHint, false);
};

export const getNextDropoffDetail = (regionHint?: string): LocationDetailInfo => {
  return findMatchingDetail(regionHint, true);
};

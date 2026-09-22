/**
 * 📇 **인성 상세 팝업의 연락처** — 인성 화면만 쓴다 (카카오픽커_시뮬레이터.md 0단계 0-2 ②)
 *
 * 예전엔 공통 코드(`core-simulator/src/data/mockLocationDetails.ts`)에 있었다. 인성 상세 화면 둘만 부른다.
 * **본문은 한 글자도 안 고치고 옮겼다.** 바뀐 것은 주소 데이터를 가져오는 길 하나 — 같은 JSON 을
 * 공통 코드가 이미 내보내는 `MOCK_DATA` 로 받는다 (같은 배열이다). `tests/contacts.test.ts` 가 옮기기 전 결과를 문다.
 */
import type { LocationDetailInfo } from '@altari/core-simulator';
import { MOCK_DATA } from '@altari/core-simulator';

// 138개의 리얼 주소 데이터 연동 (경기도 중심, 서울/인천/기타 포함)
const MOCK_LOCATION_DETAILS = MOCK_DATA as LocationDetailInfo[];

// 순차적으로 꺼내 쓰기 위한 인덱스 카운터 (하차지 전용)
let dropoffIdx = 50; // 도착지는 배열 중간부터 시작하여 다양성 확보

/**
 * 주어진 지역 문자열(regionHint)과 가장 비슷한 진짜 주소를 100개 풀에서 찾아 반환합니다.
 * 매칭되는 것이 없으면 순차적으로 반환합니다.
 */
const findMatchingDetail = (regionHint: string | undefined, isDropdown: boolean): LocationDetailInfo => {
  if (regionHint) {
    // 예: "경기 / 광주시 / 초월읍" 형태에서 "경기 광주시" 추출
    let normalizedHint = regionHint.replace('경기도', '경기').replace('서울특별시', '서울').replace('인천광역시', '인천');
    // 엔진 포맷이 ' / ' 구분자를 쓸 수 있으므로 슬래시가 있으면 슬래시 기준, 없으면 공백 기준으로 처리
    let cityMatch = '';
    if (normalizedHint.includes('/')) {
      const codeParts = normalizedHint.split('/').map(v => v.trim());
      cityMatch = codeParts.slice(0, 2).join(' '); // "경기 광주시"
    } else {
      cityMatch = normalizedHint.split(' ').slice(0, 2).join(' '); // "경기 성남시"
    }
    
    // 100개의 실제 주소 중, 해당 "시/군/구"가 일치하는 주소 필터링
    const exactMatches = MOCK_LOCATION_DETAILS.filter(m => (m.region || '').includes(cityMatch) || (m.addressDetail || '').includes(cityMatch));
    
    if (exactMatches.length > 0) {
      if (isDropdown) {
        const detail = exactMatches[dropoffIdx % exactMatches.length];
        dropoffIdx++;
        return detail;
      } else {
        // 상차지: 한 회사에서 여러 곳으로 물자를 보내는 건 자연스러운 일이므로
        // 매칭된 풀 안에서 랜덤으로 중복 허용하여 추출
        return exactMatches[Math.floor(Math.random() * exactMatches.length)];
      }
    }
  }

  const gyeonggiPool = MOCK_LOCATION_DETAILS.filter(m => (m.addressDetail || '').includes('경기'));
  const fallbackPool = gyeonggiPool.length > 0 ? gyeonggiPool : MOCK_LOCATION_DETAILS;

  let fallbackDetail: LocationDetailInfo;
  if (isDropdown) {
    fallbackDetail = fallbackPool[dropoffIdx % fallbackPool.length];
    dropoffIdx++;
  } else {
    fallbackDetail = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }

  // 매칭되는 시/군이 없어서 랜덤 데이터로 채우되, UI에 엉뚱한 동네가 표시되지 않도록 지역명은 원본을 유지합니다.
  if (regionHint) {
    const shortName = regionHint.split('/').pop()?.trim() || regionHint;
    return {
      ...fallbackDetail,
      region: shortName,
      addressDetail: `${regionHint} (임시 상세주소)`
    };
  }

  return fallbackDetail;
};

export const getNextPickupDetail = (regionHint?: string): LocationDetailInfo => {
  return findMatchingDetail(regionHint, false);
};

export const getNextDropoffDetail = (regionHint?: string): LocationDetailInfo => {
  return findMatchingDetail(regionHint, true);
};

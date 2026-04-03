import type { SimplifiedOfficeOrder } from "@onedal/shared";

// 현업에서 자주 보이는 형태의 상하차지 풀
const pickupLocations = [
    "서울 강남구 역삼동", "서울 서초구 방배동", "경기 성남시 분당구", 
    "인천 부평구", "경기 용인시 기흥구", "서울 송파구 문정동", 
    "경기 화성시 동탄", "서울 마포구 상암동", "경기 안양시 동안구", 
    "인천 남동구 구월동", "충남 천안시 서북구", "대전 서구 둔산동", 
    "부산 해운대구 센텀", "대구 수성구 범어동", "광주 서구 상무지구",
    "경기 평택시 팽성읍", "서울 영등포구 여의도", "경기 부천시 심곡동"
];

const dropoffLocations = [
    "경기 파주시 탄현면", "경기 김포시 양촌읍", "인천 서구 가좌동", 
    "경기 광주시 역동", "경기 남양주시 다산동", "경기 양주시 은현면", 
    "충북 청주시 오창읍", "충남 아산시 배방읍", "강원 원주시 문막읍", 
    "세종 차로 132", "경기 평택시 포승읍", "충남 당진시 송악읍", 
    "경기 포천시 소흘읍", "경기 안산시 단원구", "경북 구미시 산동읍",
    "전남 여수시 국가산단", "울산 남구 옥동", "경남 창원시 성산구"
];

const generateDiverseMockData = (count: number): SimplifiedOfficeOrder[] => {
    return Array.from({ length: count }).map((_, i) => {
        const pickup = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];
        const dropoff = dropoffLocations[Math.floor(Math.random() * dropoffLocations.length)];
        // 운임은 2.5만 ~ 25만원 안에서 랜덤 (천원 단위 절사)
        const fare = Math.floor(Math.random() * 225 + 25) * 1000;
        
        // rawText가 없는 상태로 파싱되었다고 가정한 정제된 데이터
        // 나중에 ML이나 테스트 용도로 rawText를 쓸 수도 있음
        return {
            id: `scrap-mock-1DAL-${Date.now()}-${i}`,
            pickup: pickup,
            dropoff: dropoff,
            fare: fare,
            timestamp: new Date().toISOString()
        } as SimplifiedOfficeOrder;
    });
};

// 최초 로드 시 고정된 100개의 현실적인 목업 데이터를 생성하여 내보냄
export const MOCK_SCRAP_POOL: SimplifiedOfficeOrder[] = generateDiverseMockData(100);

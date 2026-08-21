/**
 * @altari/core-simulator — 시뮬레이터 전용 경량 콜 생성 엔진
 * 
 * React 의존성 ZERO. 28MB GeoJSON 의존성 ZERO.
 * mockLocationData.json(좌표 내장)만으로 작동.
 */
import { calculateDistanceKm } from './geo';
import type { CallItem, LocationDetailInfo } from './types';
import mockDataRaw from './data/mockLocationData.json';

// 좌표가 포함된 모의 데이터
type MockEntry = LocationDetailInfo & { lon: number; lat: number };
const MOCK_DATA = mockDataRaw as MockEntry[];

// ======= 요금 상수 =======
const BASE_FARE = 10000;
const FARE_PER_KM = 1500;
const FARE_RANDOM_EXTRA = 5000;

// ======= 콜 메타 옵션 풀 =======
const VEHICLE_OPTIONS = ['오', '다', '라', '1t'];
const ITEM_OPTIONS = ['박스 1개', '서류봉투', '쇼핑백 2개', '소형 가전', '샘플 박스', '마대 1개'];
const CATEGORY_OPTIONS = ['보통', '보통', '예약'];
const COMPANY_OPTIONS = ['태양메디스', '엠케이미디어', '씨엠파크-백암', '하나로유통', '부일물산', '한국부품', 'LG로지스'];
const PAYMENT_OPTIONS: Array<'신용' | '선불' | '착불' | '카드'> = ['신용', '선불', '착불', '카드'];
const BILLING_OPTIONS: Array<'계산서' | '인수증' | '무과세'> = ['계산서', '인수증', '무과세'];
const WORK_HOUR_START = 8;
const WORK_HOUR_END = 16;

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface SimGeneratorConfig {
  driverLon: number;
  driverLat: number;
  maxPickupKm: number;
  minFare: number;
  targetRegion?: string;
}

/**
 * mockLocationData.json에서 기사 반경 내 항목을 필터링하고
 * 상차지/하차지를 선택하여 CallItem을 생성합니다.
 */
export function generateSimCall(config: SimGeneratorConfig): CallItem | null {
  const { driverLon, driverLat, maxPickupKm, minFare, targetRegion } = config;
  const driverCoord: [number, number] = [driverLon, driverLat];

  // 1. 모든 데이터에 대해 기사와의 거리를 계산
  const withDistance = MOCK_DATA
    .filter(m => m.lon && m.lat)
    .map(m => ({
      entry: m,
      dist: calculateDistanceKm(driverCoord, [m.lon, m.lat])
    }));

  // 2. 상차지 후보: 기사 반경 내
  const pickupCandidates = withDistance
    .filter(m => m.dist <= maxPickupKm)
    .sort((a, b) => a.dist - b.dist);

  if (pickupCandidates.length === 0) {
    withDistance.sort((a, b) => a.dist - b.dist);
    pickupCandidates.push(...withDistance.slice(0, 5));
  }

  // 가까운 곳이 더 자주 선택되도록 제곱 편향
  const randSkew = Math.pow(Math.random(), 2.0);
  const pickupItem = pickupCandidates[Math.floor(randSkew * pickupCandidates.length)];

  // 3. 하차지 후보
  let dropoffCandidates = withDistance.filter(m => m.entry !== pickupItem.entry);

  if (targetRegion && targetRegion.length > 0) {
    const regionFiltered = dropoffCandidates.filter(m =>
      (m.entry.addressDetail || '').includes(targetRegion)
    );
    if (regionFiltered.length > 0) {
      dropoffCandidates = regionFiltered;
    }
  }

  if (dropoffCandidates.length === 0) return null;
  const dropoffItem = pick(dropoffCandidates);

  // 4. 거리/요금 계산
  const pickupCoord: [number, number] = [pickupItem.entry.lon, pickupItem.entry.lat];
  const dropoffCoord: [number, number] = [dropoffItem.entry.lon, dropoffItem.entry.lat];

  const pickupDistanceKm = calculateDistanceKm(driverCoord, pickupCoord);
  const distanceKm = calculateDistanceKm(pickupCoord, dropoffCoord);

  let fare = BASE_FARE + (distanceKm * FARE_PER_KM) + (Math.random() * FARE_RANDOM_EXTRA);
  fare = Math.max(fare, minFare);
  const finalFare = Math.floor(fare / 1000) * 1000;

  // 5. 메타 데이터 부여
  const isShared = Math.random() < 0.3;
  const isExpress = Math.random() < 0.15;

  const pHour = Math.floor(Math.random() * (WORK_HOUR_END - WORK_HOUR_START)) + WORK_HOUR_START;
  const pMin = Math.floor(Math.random() * 60);
  const dHour = pHour + Math.floor(Math.random() * 3) + 1;
  const dMin = Math.floor(Math.random() * 60);

  const getRegionName = (entry: MockEntry): string => {
    const addr = entry.addressDetail || '';
    const parts = addr.split(' ').filter(Boolean);
    return parts[2] || parts[1] || entry.region || '미정';
  };

  const getFullName = (entry: MockEntry): string => {
    const addr = entry.addressDetail || '';
    const parts = addr.split(' ').filter(Boolean);
    return parts.slice(0, 3).join(' / ') || addr;
  };

  const makePoint = (entry: MockEntry) => ({
    code: '',
    name: getRegionName(entry),
    fullName: getFullName(entry),
    centroid: [entry.lon, entry.lat] as [number, number]
  });

  const makeDetail = (entry: MockEntry): LocationDetailInfo => ({
    customerName: entry.customerName,
    department: entry.department,
    contactName: entry.contactName,
    mileage: entry.mileage,
    phone1: entry.phone1,
    phone2: entry.phone2,
    region: entry.region,
    addressDetail: entry.addressDetail,
    memo: entry.memo
  });

  return {
    id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    pickups: [makePoint(pickupItem.entry)],
    dropoffs: [makePoint(dropoffItem.entry)],
    pickupDetails: [makeDetail(pickupItem.entry)],
    dropoffDetails: [makeDetail(dropoffItem.entry)],
    pickupDistanceKm,
    distanceKm,
    status: '신규',
    isShared,
    isExpress,
    paymentType: pick(PAYMENT_OPTIONS),
    billingType: pick(BILLING_OPTIONS),
    vehicleType: pick(VEHICLE_OPTIONS),
    itemDescription: pick(ITEM_OPTIONS),
    callCategory: isExpress ? '급송' : pick(CATEGORY_OPTIONS),
    companyName: pick(COMPANY_OPTIONS),
    pickupTime: `${pHour.toString().padStart(2, '0')}:${pMin.toString().padStart(2, '0')}`,
    deliveryTime: `${dHour.toString().padStart(2, '0')}:${dMin.toString().padStart(2, '0')}`,
    fare: finalFare,
    isMatchingRoute: true,
    violation: undefined
  };
}

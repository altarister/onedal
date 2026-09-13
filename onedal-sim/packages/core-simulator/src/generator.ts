/**
 * @altari/core-simulator — 시뮬레이터 전용 경량 콜 생성 엔진
 *
 * React 의존성 ZERO. 28MB GeoJSON 의존성 ZERO.
 * mockLocationData.json(좌표 내장)만으로 작동.
 *
 * 🔴 **공통 칸만 만든다 — 배차망을 모른다** (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2 ④).
 *    상차지·하차지·거리·시각까지가 여기 일이다. 요금·차종·결제 같은 칸은 배차망마다 입히는 함수가 채운다 —
 *    인성 `toInsungCall` · 화물24시 `toHwamul24Call` (ui-simulators 의 배차망 폴더).
 *    예전 `generateSimCall` 은 인성·화물24시 칸까지 한꺼번에 채웠다.
 */
import { calculateDistanceKm } from './geo';
import type { BaseCall, LocationDetailInfo } from './types';
import mockDataRaw from './data/mockLocationData.json';

// 좌표가 포함된 모의 데이터
export type MockEntry = LocationDetailInfo & { lon: number; lat: number };
/** 🎯 문제지가 «거리 띠»로 주소를 고를 때도 같은 데이터를 쓴다 (한 곳 · 규칙 ③) */
export const MOCK_DATA = mockDataRaw as MockEntry[];

/** 주소 조각으로 모의 데이터를 찾는다 — 프리셋(문제지)이 실제 좌표를 쓰기 위한 창구 */
export function findMockEntry(addressPart: string): MockEntry | undefined {
    return MOCK_DATA.find(m => (m.addressDetail || '').includes(addressPart));
}

/**
 * 🎯 **강제 쌍** — 랜덤 대신 정해진 상차·하차로 콜을 만든다 (문제지 모드).
 * 요금·차종까지 고정할 수 있어야 같은 콜이 매번 같게 재현된다.
 * (상차·하차는 여기서, 요금·차종은 배차망별 입히기 함수가 쓴다)
 */
export interface ForcedPair {
    pickup: MockEntry;
    dropoff: MockEntry;
    fare?: number;
    vehicleType?: string;
}

/**
 * ⏰ **상차 시각은 «지금»에서 잰다** (기사님 실측 2026-09-01).
 *
 * 예전에는 근무시간(08~16시) 안에서 아무 시각이나 뽑았다. 그래서 **새벽에 책상 판을
 * 돌리면** 적요가 «15:58상차» 라고 적히고, 관제웹이 그것을 그대로 읽어(약속 사다리:
 * 적요 상차 시각 > 콜 잡은 시각 + 20분) **여유 +866분**이 나왔다 — 14시간짜리 예약콜이
 * 되어 버려 **약속 축이 통째로 무의미해졌다.**
 *
 * 실제 배차망은 «지금 곧» 실을 콜을 띄운다. 그러니 시뮬도 지금에서 재야 판이 성립한다.
 * 다만 예약콜은 진짜로 있다 — 노하우 영상의 «9시 예약콜»처럼 몇 시간 뒤 상차가 섞이면
 * 그만큼 합짐 시간을 버는 것이 이 제품의 노림수라, **일부러 섞는다.**
 */
const PICKUP_SOON_MIN = 10;      // 보통 콜 — 지금 + 10~60분
const PICKUP_SOON_SPAN = 50;
const RESERVED_RATE = 0.15;      // 예약콜 비율
const RESERVED_MIN = 120;        // 예약콜 — 지금 + 2~5시간
const RESERVED_SPAN = 180;

/**
 * 🎲 난수를 밖에서 받는다 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-1).
 * 기본값은 `Math.random`. 검사가 씨앗 있는 난수를 넣어 «같은 입력이면 같은 콜»을 만든다.
 */
export type RandomSource = () => number;
export const pickWith = (rng: RandomSource) => <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export interface SimGeneratorConfig {
  driverLon: number;
  driverLat: number;
  maxPickupKm: number;
  minFare: number;
  targetRegion?: string;
}

/** 공통 칸만 채운 콜 — 요금은 배차망이 정하므로 아직 없다 (지어낸 0 을 넣지 않는다 · 규칙 ④) */
export type CallDraft = Omit<BaseCall, 'fare'>;

/** 배차망별 입히기 함수가 받는 것 — 요금 하한과, 문제지면 정해진 요금·차종 */
export interface CallOptions {
  minFare: number;
  forced?: ForcedPair;
}

/**
 * mockLocationData.json에서 기사 반경 내 항목을 필터링하고
 * 상차지/하차지를 선택하여 **공통 칸만 채운 콜**을 만듭니다.
 *
 * 난수를 뽑는 순서: 상차지(제곱 편향) → 하차지 → 예약 여부 → 상차 시각 → 하차 시각 → id.
 * 🔴 상차지·하차지가 **맨 앞**이다 — 그래서 가르기 전(`generateSimCall`)과 같은 씨앗이면
 *    주소·좌표·거리가 똑같다 (`tests/commonFields.test.ts` 가 가르기 전에 뜬 스냅숏을 문다).
 */
export function generateBaseCall(config: SimGeneratorConfig, forced?: ForcedPair, rng: RandomSource = Math.random): CallDraft | null {
  const pick = pickWith(rng);
  const { driverLon, driverLat, maxPickupKm, targetRegion } = config;
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
  const randSkew = Math.pow(rng(), 2.0);
  let pickupItem = pickupCandidates[Math.floor(randSkew * pickupCandidates.length)];
  // 🎯 문제지 모드 — 정해진 상차지로 갈아 끼운다 (반경 밖이어도 그대로 낸다: 문제지는 조건을 시험한다)
  if (forced) pickupItem = { entry: forced.pickup, dist: calculateDistanceKm(driverCoord, [forced.pickup.lon, forced.pickup.lat]) };

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

  if (dropoffCandidates.length === 0 && !forced) return null;
  const dropoffItem = forced ? { entry: forced.dropoff, dist: 0 } : pick(dropoffCandidates);

  // 4. 거리 계산 (요금은 배차망이 정한다)
  const pickupCoord: [number, number] = [pickupItem.entry.lon, pickupItem.entry.lat];
  const dropoffCoord: [number, number] = [dropoffItem.entry.lon, dropoffItem.entry.lat];

  const pickupDistanceKm = calculateDistanceKm(driverCoord, pickupCoord);
  const distanceKm = calculateDistanceKm(pickupCoord, dropoffCoord);

  /**
   * 상차는 지금부터 재고, 하차는 그 상차에서 잰다 — 둘의 간격이 뒤집히지 않는다.
   * 자정을 넘기면 시각만 남으므로(«01:20상차») 날짜 없이도 읽는 쪽 해석이 흔들리지 않는다.
   */
  const isReserved = rng() < RESERVED_RATE;
  const pickupOffsetMin = isReserved
    ? RESERVED_MIN + Math.floor(rng() * RESERVED_SPAN)
    : PICKUP_SOON_MIN + Math.floor(rng() * PICKUP_SOON_SPAN);
  const pickupAt = new Date(Date.now() + pickupOffsetMin * 60_000);
  const dropoffAt = new Date(pickupAt.getTime() + (60 + Math.floor(rng() * 120)) * 60_000);
  const hhmm = (d: Date) =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

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
    id: `sim_${Date.now()}_${rng().toString(36).substr(2, 5)}`,
    pickups: [makePoint(pickupItem.entry)],
    dropoffs: [makePoint(dropoffItem.entry)],
    pickupDetails: [makeDetail(pickupItem.entry)],
    dropoffDetails: [makeDetail(dropoffItem.entry)],
    pickupDistanceKm,
    distanceKm,
    pickupTime: hhmm(pickupAt),
    deliveryTime: hhmm(dropoffAt),
    isMatchingRoute: true,
    violation: undefined
  };
}

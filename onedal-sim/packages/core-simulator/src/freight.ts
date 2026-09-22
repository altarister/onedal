/**
 * 🚚 **화물 콜의 요금·차종·결제 칸** — 화물 배차망 입히기 함수가 함께 쓴다
 *
 * 공통 생성기(`generateBaseCall`)는 공통 칸만 만들고,
 * 이 칸이 필요한 배차망의 입히기 함수가 부른다. 🔴 이 파일은 **배차망 이름을 모른다** — 쓰는 쪽이 고른다.
 * (픽커처럼 요금 체계가 다른 배차망은 이것을 안 쓴다)
 */
import type { RandomSource } from './generator';
import { pickWith } from './generator';

// ======= 요금 상수 =======
const BASE_FARE = 10000;
const FARE_PER_KM = 1500;
const FARE_RANDOM_EXTRA = 5000;

/**
 * 🔴 **차종은 «표준 이름»으로 낳는다 — 화면 말로 낳지 않는다**.
 *
 * 인성 약자(`오`·`다`·`라`)를 그대로 넣으면 **화물24시 화면이 읽을 말이
 * 없다** — 그쪽은 «다마스»·«1톤» 이라 적는다. 값은 한 벌로 두고 각 화면이 자기 말로
 * 옮긴다 (`formatInsungVehicle` · `formatHwamul24Vehicle`). 문제지도 풀네임을 쓴다.
 */
export const FREIGHT_OPTIONS = {
    vehicle: ['오토바이', '다마스', '라보', '1t'],
    item: ['박스 1개', '서류봉투', '쇼핑백 2개', '소형 가전', '샘플 박스', '마대 1개'],
    company: ['태양메디스', '엠케이미디어', '씨엠파크-백암', '하나로유통', '부일물산', '한국부품', 'LG로지스'],
    payment: ['신용', '선불', '착불', '카드'] as Array<'신용' | '선불' | '착불' | '카드'>,
    billing: ['계산서', '인수증', '무과세'] as Array<'계산서' | '인수증' | '무과세'>,
};

/** 거리로 매기는 요금 — 기본 + km 당 + 난수 덤, 요금 하한 아래로 안 내리고 천 원 단위로 내린다 */
export function distanceFare(distanceKm: number, minFare: number, rng: RandomSource = Math.random): number {
    const fare = Math.max(BASE_FARE + (distanceKm * FARE_PER_KM) + (rng() * FARE_RANDOM_EXTRA), minFare);
    return Math.floor(fare / 1000) * 1000;
}

export interface FreightFields {
    paymentType: '신용' | '선불' | '착불' | '카드';
    billingType: '계산서' | '인수증' | '무과세';
    vehicleType: string;
    itemDescription: string;
    companyName: string;
}

/** 결제·계산서·차종·물품·회사 — 문제지가 차종을 정했으면 그것을 쓴다 */
export function pickFreightFields(rng: RandomSource = Math.random, forcedVehicleType?: string): FreightFields {
    const pick = pickWith(rng);
    return {
        paymentType: pick(FREIGHT_OPTIONS.payment),
        billingType: pick(FREIGHT_OPTIONS.billing),
        vehicleType: forcedVehicleType ?? pick(FREIGHT_OPTIONS.vehicle),
        itemDescription: pick(FREIGHT_OPTIONS.item),
        companyName: pick(FREIGHT_OPTIONS.company),
    };
}

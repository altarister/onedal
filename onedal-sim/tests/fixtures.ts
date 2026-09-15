import type { PickerCall, SimCall } from '@altari/ui-simulators';

/**
 * 🧪 **검사용 고정 콜 둘** — 손으로 채웠다 (2026-09-14 · 0단계 0-1 에서 screens.test.tsx 에 만든 것을 0-2 ⑤ 에서 여기로 옮겼다)
 * callA: 초월읍 → 정자동 · 급송 · 다마스 · 상세 연락처 있음 / callB: 경안동 → 관고동 · 예약 · 1t · 상세 연락처 없음
 * 🔴 값을 바꾸면 화면 글자 스냅숏이 바뀐다 — 옮기기 검사의 기준이라 고치지 않는다.
 */
export const callA: SimCall = {
    id: 'fixed_a',
    pickups: [{ code: '', name: '초월읍', fullName: '경기 / 광주시 / 초월읍', centroid: [127.294, 37.3772] }],
    dropoffs: [{ code: '', name: '정자동', fullName: '경기 / 성남시 / 정자동', centroid: [127.1113, 37.3595] }],
    pickupDetails: [{ customerName: '초월 물류창고', contactName: '김반장', phone1: '010-0000-0001', region: '초월읍', addressDetail: '경기 광주시 초월읍 도평리 1' }],
    dropoffDetails: [{ customerName: '정자 사무실', contactName: '이과장', phone1: '010-0000-0002', region: '정자동', addressDetail: '경기 성남시 분당구 정자동 2' }],
    pickupDistanceKm: 2.4,
    distanceKm: 21.7,
    status: '신규',
    isShared: false,
    isExpress: true,
    paymentType: '신용',
    billingType: '계산서',
    vehicleType: '다마스',
    itemDescription: '박스 1개',
    callCategory: '급송',
    companyName: '하나로유통',
    pickupTime: '09:30',
    deliveryTime: '11:00',
    fare: 45000,
    isMatchingRoute: true,
};
export const callB: SimCall = {
    ...callA,
    id: 'fixed_b',
    pickups: [{ code: '', name: '경안동', fullName: '경기 / 광주시 / 경안동', centroid: [127.2553, 37.4095] }],
    dropoffs: [{ code: '', name: '관고동', fullName: '경기 / 이천시 / 관고동', centroid: [127.435, 37.272] }],
    pickupDetails: undefined,
    dropoffDetails: undefined,
    isExpress: false,
    callCategory: '예약',
    vehicleType: '1t',
    paymentType: '착불',
    pickupTime: '14:30',
    fare: 70000,
};

/**
 * 🧪 **픽커 고정 콜 셋** (2026-09-14 · 2단계 2-2) — 실물 02 의 카드 모양을 본떴다. 주소는 모의 데이터 모양(`addressDetail` · `region`)이다.
 * pickerA: 광주 신현 → 과천 중앙 · 준비 완료 · 12.1km · 16,870 (배송비 15,870 + 프로모션 1,000)
 * pickerB: 중원 성남 → 수지 동천 · 예약 17:00 · 15.2km · 14,168
 * pickerC: 분당 서현1 → 분당 삼평 · 단거리 · 준비 2분 · 580m · 2,579
 */
const pickerBase: PickerCall = {
    ...callA,
    net: 'kakaopicker',
    itemSize: '소형',
    pickerTags: ['퀵'],
    prepMinutes: null,
    deliveryFee: 0,
    promotion: 0,
    orderNo: '260914090000001',
    fare: 0,
};
const place = (addressDetail: string, region: string) => [{ customerName: '픽커 고정', region, addressDetail }];

export const pickerA: PickerCall = {
    ...pickerBase,
    id: 'picker_a',
    pickupDetails: place('경기 광주시 경안로 12', '신현동'),
    dropoffDetails: place('경기 과천시 중앙로 3', '중앙동'),
    pickupDistanceKm: 12.1,
    deliveryFee: 15870, promotion: 1000, fare: 16870,
};
export const pickerB: PickerCall = {
    ...pickerBase,
    id: 'picker_b',
    pickupDetails: place('경기 성남시 중원구 둔촌대로 83', '성남동'),
    dropoffDetails: place('경기 용인시 수지구 동천로 1', '동천동'),
    pickupDistanceKm: 15.2,
    prepMinutes: 12,
    reservedAt: '17:00',
    deliveryFee: 14168, fare: 14168,
    orderNo: '260914090000002',
};
export const pickerC: PickerCall = {
    ...pickerBase,
    id: 'picker_c',
    pickupDetails: place('경기 성남시 분당구 서현로 1', '서현1동'),
    dropoffDetails: place('경기 성남시 분당구 판교역로 235', '삼평동'),
    pickupDistanceKm: 0.58,
    pickerTags: ['퀵', '단거리'],
    prepMinutes: 2,
    deliveryFee: 2579, fare: 2579,
    orderNo: '260914090000003',
};
/** 🚶 pickerWalk: pickerA 와 같은 길 · **도보** (실물 15-2 · 16) — 퀵과 도보가 다른 페이지로 열리는지 가르는 짝 */
export const pickerWalk: PickerCall = {
    ...pickerA,
    id: 'picker_walk',
    pickerTags: ['도보'],
    orderNo: '260914090000004',
};

import type { SimCall } from '@altari/ui-simulators';

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

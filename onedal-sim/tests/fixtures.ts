import type { IsflexCall, PickerCall, SimCall } from '@altari/ui-simulators';

/**
 * 🧪 **검사용 고정 콜 둘** — 손으로 채웠다 (0단계 0-1 에서 screens.test.tsx 에 만든 것을 0-2 ⑤ 에서 여기로 옮겼다)
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
    pickupAt: '2026-09-14T09:30:00+09:00',
    deliveryAt: '2026-09-14T11:00:00+09:00',
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
    pickupAt: '2026-09-14T14:30:00+09:00',
    fare: 70000,
};

/**
 * 🧪 **픽커 고정 콜 셋** (2단계 2-2) — 실물 02 의 카드 모양을 본떴다. 주소는 모의 데이터 모양(`addressDetail` · `region`)이다.
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

/**
 * 🛵 **인성플렉스 고정 콜 넷** — 실물 상세 08 · 10 · 12 의 콜을 본떴다(D 는 칩 거르기용 승용/소형).
 * isflexA: 역삼동 → 대치동 · 26.7km · 약 2.3km · 8,500 · 착불 (08)
 * isflexB: 수원 이의동 → 중구 쌍림동 · 24.4km · 약 31.0km · 21,252 · 과적 · 낼08:20/ · 10:20전/ (10)
 * isflexC: 파주 동패동 → 영종 운서동 · 61.0km · 약 38.8km · 10,626 · 적요 없음 · 결제 없음 (12)
 */
const isflexPlace = (addressDetail: string, region: string) => [{ customerName: '플렉스 고정', phone1: '010-0000-0003', region, addressDetail }];
export const isflexA: IsflexCall = {
    id: 'isflex_a',
    pickups: [{ code: '', name: '역삼동', fullName: '서울 / 강남구 / 역삼동', centroid: [127.036, 37.5] }],
    dropoffs: [{ code: '', name: '대치동', fullName: '서울 / 강남구 / 대치동', centroid: [127.06, 37.5] }],
    pickupDetails: isflexPlace('서울 강남구 테헤란로 152', '역삼동'),
    dropoffDetails: isflexPlace('서울 강남구 삼성로 212', '대치동'),
    pickupDistanceKm: 26.7,
    distanceKm: 2.3,
    pickupAt: '2026-09-14T09:30:00+09:00',
    deliveryAt: '2026-09-14T11:00:00+09:00',
    fare: 8500,
    isMatchingRoute: true,
    net: 'isflex',
    vehicleKind: '오토바이',
    vehicleWord: '오토',
    reservePrefix: '',
    deadlinePrefix: '',
    pickupDong: '역삼동',
    dropoffDong: '대치동',
    tags: [],
    memo: '1박스 3층 계단물건 있음',
    paymentType: '착불',
};
export const isflexB: IsflexCall = {
    ...isflexA,
    id: 'isflex_b',
    pickupDetails: isflexPlace('경기 수원시 영통구 광교중앙로 140', '이의동'),
    dropoffDetails: isflexPlace('서울 중구 퇴계로 100', '쌍림동'),
    pickupDistanceKm: 24.4,
    distanceKm: 31.0,
    fare: 21252,
    reservePrefix: '낼08:20/',
    deadlinePrefix: '10:20전/',
    pickupDong: '수원이의동',
    dropoffDong: '쌍림동',
    tags: ['과적'],
    memo: '과적 아이스박스1(제품샘플)-착지시간꼭엄수',
    paymentType: undefined,
};
export const isflexC: IsflexCall = {
    ...isflexA,
    id: 'isflex_c',
    pickupDetails: isflexPlace('경기 파주시 동패로 10', '동패동'),
    dropoffDetails: isflexPlace('인천 영종구 운서동 2850', '운서동'),
    pickupDistanceKm: 61.0,
    distanceKm: 38.8,
    fare: 10626,
    pickupDong: '동패동',
    dropoffDong: '운서동',
    memo: '없음',
    paymentType: undefined,
};
export const isflexD: IsflexCall = {
    ...isflexA,
    id: 'isflex_d',
    pickupDistanceKm: 3.2,
    vehicleKind: '승용/소형',
    vehicleWord: '승용/소형',
    fare: 12000,
    paymentType: '선불',
};

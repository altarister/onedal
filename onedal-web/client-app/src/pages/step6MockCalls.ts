import type { SecuredOrder } from '@onedal/shared';

/**
 * 🎬 **걸음 6 목업(`/mockup/step6`)의 예시 가짜 콜 열 개** — 이 목업 화면만 가져다 쓴다.
 *
 * 🔴 **값을 지어내지 않았다** — 판 파일 «고칠 자리 표 걸음 6» 의 «6장 목업 자료 6-2 예시 가짜 콜»을 그대로 옮겼다.
 *    장소 · 좌표는 시뮬레이터 장소 자료에서 왔다. 금액 45,000 / 34,650 은 인성 설명 영상, 200,000 / 180,000 · 140,000 은 화물24시 실물 캡처의 숫자다.
 * ⚠️ 콜은 모두 가짜(시뮬레이터 꼴)다. «지금» 판은 `nowOf` 로 옛 요금 · 수수료 · 결제 칸을 얹어 지금 부품에 먹이고,
 *    «바뀐 뒤» 그림은 돈 묶음(`money`)만 읽는다.
 */

type MoneyLine = { kind: string; won: number; shown: string };
type MockMoney = {
    lines: MoneyLine[];
    feeRateText: string | null;
    paymentType: string | null; paymentShown: string | null;
    billingType: string | null; billingShown: string | null;
};
/** 목업 콜 한 건 — 콜 모양 전부를 흉내 내지 않고 부품이 읽는 칸만 담는다 */
export type MockCall = Record<string, unknown> & { id: string; money: MockMoney; fare: number };

const line = (kind: string, won: number): MoneyLine => ({ kind, won, shown: won.toLocaleString('ko-KR') });
const money = (lines: MoneyLine[], o: Partial<MockMoney> = {}): MockMoney => ({
    lines, feeRateText: null, paymentType: null, paymentShown: null, billingType: null, billingShown: null, ...o,
});

/** 모든 콜 공통 칸 */
const BASE = {
    type: 'NEW_ORDER', timestamp: '2026-11-09T05:10:00.000Z', status: 'ORDER_CONFIRMED',
    capturedDeviceId: 'mock', capturedAt: '2026-11-09T05:10:00.000Z',
};

const STOP_CHOWOL = { listText: '초월읍', region: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 1241 초월읍행정복지센터', customerName: '초월읍행정복지센터', distanceKm: 2.4, geo: { x: 127.287923, y: 37.385308 } };
const STOP_GUMI = { listText: '14시전/구미동', region: '구미동', addressDetail: '경기 성남시 분당구 성남대로43번길 11 하나로마트 성남점', customerName: '하나로마트 성남점', promiseText: '14시전', requestedDay: 0, requestedTime: '14:00', distanceKm: 21.7, geo: { x: 127.10667691290486, y: 37.33876580259903 } };
const STOP_MAETAN = { listText: '경기 수원 매탄동', region: '매탄동', addressDetail: '경기 수원시 영통구 삼성로 129 삼성전자 디지털시티', customerName: '삼성전자 본사', distanceKm: 6.0, geo: { x: 127.053129, y: 37.257643 } };
const NO_PROMISE = { promiseText: null, requestedDay: null, requestedTime: null };

/** ① 인성 착불 목록 길 — 목록에서 잡음 · 지금 요금 = 목록 요금(기사님 몫) */
export const C1_INSUNG_COD_LIST: MockCall = {
    ...BASE, id: 'SIM-A1', targetApp: 'insung', dispatcherName: '태양메디스', dispatcherPhone: '031-555-0101',
    pickupDetails: [STOP_CHOWOL], dropoffDetails: [{ ...STOP_GUMI, ...NO_PROMISE, listText: '구미동' }],
    vehicleType: '다', itemDescription: '박스 1개', tripType: '편도', orderForm: '보통', tagsText: null,
    fare: 34650, commissionRate: '23%',
    money: money([line('income', 34650)], { feeRateText: '23%', paymentType: '착불', paymentShown: '착불' }),
};
/** ① 의 «상세 읽음» 판 — 받을 돈 줄이 더해진다 */
export const C1_DETAIL_READ_COLLECT = line('collect', 45000);

/** ② 인성 착불 손 확정 — 지금 요금 = 고객에게 받을 금액 45,000 (인성 설명 영상) */
export const C2_INSUNG_COD_MANUAL: MockCall = {
    ...BASE, id: 'SIM-A2', targetApp: 'insung', type: 'MANUAL', dispatcherName: '태양메디스', dispatcherPhone: '031-555-0101', stageText: '배차',
    pickupDetails: [STOP_CHOWOL], dropoffDetails: [STOP_GUMI],
    vehicleType: '다', itemDescription: '소형 가전', tripType: '편도', orderForm: '보통', tagsText: null, detailMemo: '*카고 입니다.',
    distanceKm: 18.2, approachDurationMin: 9, kakaoSoloDistanceKm: 12.3, kakaoSoloDurationMin: 25,
    fare: 45000, commissionRate: '23%',
    money: money([line('income', 34650), line('collect', 45000), line('consign', 0)], { feeRateText: '23%', paymentType: '착불', paymentShown: '착불' }),
};

/** ③ 화물24시 선/착불 (실물 캡처 11 · 14 숫자) */
export const C3_H24_PREPAID_COD: MockCall = {
    ...BASE, id: 'SIM-B1', targetApp: 'hwamul24', orderNo: '3-7205-4006', dispatcherName: '화물과퀵',
    pickupDetails: [STOP_MAETAN], dropoffDetails: [{ ...STOP_GUMI, ...NO_PROMISE, listText: '경기 성남 구미동' }],
    vehicleType: '1톤/전체', itemDescription: '마대 1개', tripType: '편도', orderForm: '보통', tagsText: '독차',
    fare: 200000,
    money: money([line('total', 200000), line('income', 180000), line('fee', 20000)], { paymentType: '선/착불', paymentShown: '선/착불' }),
};

/** ④ 화물24시 인수증 (실물 캡처 51 숫자) */
export const C4_H24_RECEIPT: MockCall = {
    ...BASE, id: 'SIM-B2', targetApp: 'hwamul24', orderNo: '3-1188-2045', dispatcherName: '(주)엠케이물류',
    pickupDetails: [STOP_MAETAN], dropoffDetails: [{ ...STOP_CHOWOL, listText: '경기 광주 초월읍' }],
    vehicleType: '1톤/전체', itemDescription: '샘플 박스', tripType: '편도', orderForm: '보통', tagsText: '혼적',
    fare: 140000,
    money: money([line('income', 140000), line('fee', 0), line('total', 140000), line('insurance', 610)], { billingType: '인수증', billingShown: '인수증' }),
};

/** ⑤ 픽커 소형 — 짐 칩 «📦 라면박스 2개» */
export const C5_PICKER_SMALL: MockCall = {
    ...BASE, id: 'SIM-C1', targetApp: 'kakaopicker', clientOrderNo: null,
    pickupDetails: [{ listText: '분당 / 서현1', region: '서현1동', distanceKm: 1.2 }],
    dropoffDetails: [{ listText: '분당 / 정자', region: '정자동', customerName: '더에스엠씨그룹', distanceKm: 4.8 }],
    itemSize: '소형', itemDescription: null, tripType: '편도', orderForm: '보통', tagsText: '퀵 단거리',
    load: { vehicleText: null, sizeText: '소형', itemText: null, lines: [{ kind: 'dimension', shown: '세 변의 합 100cm' }, { kind: 'weight', shown: '5kg 이하' }] },
    fare: 5600,
    money: money([line('income', 5600), line('deliveryFee', 5500), line('promo', 100)]),
};

/** ⑥ 픽커 대형 — 짐 칩 «📦 대형» (박스 수 모름) */
export const C6_PICKER_LARGE: MockCall = {
    ...C5_PICKER_SMALL, id: 'SIM-C2', itemSize: '대형',
    load: { vehicleText: '승', sizeText: '대형', itemText: null, lines: [] },
    fare: 12800, money: money([line('income', 12800), line('deliveryFee', 12800)]),
};

/** ⑦ 플렉스 과적 — 서랍 구분 «-» · 화면 기록 «과적» */
export const C7_ISFLEX_OVERLOAD: MockCall = {
    ...BASE, id: 'SIM-D1', targetApp: 'isflex',
    pickupDetails: [{ listText: '@신장동(하남)', region: '신장동' }], dropoffDetails: [{ listText: '쌍림동', region: '쌍림동' }],
    vehicleType: '다마스', tripType: null, orderForm: '보통', tagsText: '과적',
    fare: 21252, money: money([line('income', 21252)], { paymentType: '선불', paymentShown: '선불' }),
};

/** ⑧ ⑨ ⑩ 하차 약속 날 0 · 1 · 2 — ② 를 바탕으로 마지막 하차 정거장만 바꾼다 */
export const C8_DROP_DAY0: MockCall = { ...C2_INSUNG_COD_MANUAL, id: 'SIM-E0', dropoffDetails: [{ ...STOP_GUMI, promiseText: '14시전', requestedDay: 0, requestedTime: '14:00' }] };
export const C9_DROP_DAY1: MockCall = { ...C2_INSUNG_COD_MANUAL, id: 'SIM-E1', dropoffDetails: [{ ...STOP_GUMI, listText: '낼14시/구미동', promiseText: '낼14시', requestedDay: 1, requestedTime: '14:00' }] };
export const C10_DROP_DAY2: MockCall = { ...C2_INSUNG_COD_MANUAL, id: 'SIM-E2', dropoffDetails: [{ ...STOP_GUMI, listText: '11일14시/구미동', promiseText: '11일14시', requestedDay: 2, requestedTime: '14:00' }] };

/** «지금» 판 — 지금 부품이 읽는 옛 결제 칸을 돈 묶음에서 얹어 콜 모양으로 넘긴다 */
export const nowOf = (c: MockCall): SecuredOrder =>
    ({ ...c, paymentType: c.money.paymentType, billingType: c.money.billingType }) as unknown as SecuredOrder;

/** 돈 묶음의 한 줄 금액 — 없으면 null */
export const lineWon = (c: MockCall, kind: string): number | null => c.money.lines.find(l => l.kind === kind)?.won ?? null;

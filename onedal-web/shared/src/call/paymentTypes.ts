/* 💳 결제 · 영수 종류 — 작은 파일에 둔다: shared 안 파일(pageRead)이 `./index` 에서 런타임 값을 가져오지 않게(순환) */
/**
 * 결제수단. 인성앱 확정 상세의 `요금 : 40,000(신용)` 괄호 안에 표기된다.
 * 파서가 괄호 안 자유 텍스트("협의" 등)를 결제수단으로 오인하지 않으려면
 * **런타임에 검사할 목록**이 필요하므로 배열을 진실 공급원으로 두고 타입을 파생시킨다.
 */
export const PAYMENT_TYPES = ['신용', '선불', '착불', '카드', '현금'] as const;
export type PaymentType = typeof PAYMENT_TYPES[number];
export type BillingType = '계산서' | '인수증' | '무과세';

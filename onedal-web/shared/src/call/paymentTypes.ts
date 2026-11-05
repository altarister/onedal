/**
 * 결제수단
 * 누가: 서버 파서와 페이지 읽기
 * 언제: 배차망 글에서 결제수단을 가려낼 때
 * 어디서: 요금 괄호 안 글자를 읽는 자리
 * 무엇을: PAYMENT_TYPES
 * 어떻게: 허용 목록에 있는 글자만 결제수단으로 본다
 * 왜: «협의» 같은 자유 글을 결제수단으로 잘못 읽지 않기 위해서다
 */
/* 💳 결제 · 영수 종류 — 작은 파일에 둔다: shared 안 파일(pageRead)이 `./index` 에서 런타임 값을 가져오지 않게(순환) */
/**
 * 결제수단. 인성앱 확정 상세의 `요금 : 40,000(신용)` 괄호 안에 표기된다.
 * 파서가 괄호 안 자유 텍스트("협의" 등)를 결제수단으로 오인하지 않으려면
 * **런타임에 검사할 목록**이 필요하므로 배열을 진실 공급원으로 두고 타입을 파생시킨다.
 */
export const PAYMENT_TYPES = ['신용', '선불', '착불', '카드', '현금'] as const;
export type PaymentType = typeof PAYMENT_TYPES[number];
export const BILLING_TYPES = ['계산서', '인수증', '무과세'] as const;
export type BillingType = typeof BILLING_TYPES[number];

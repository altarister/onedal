/**
 * 결제수단 (옮겨 간 자리)
 * 누가: 가져오는 곳 없음
 * 언제: 없음 — 결제 · 증빙 값 목록은 `money.ts` 에서 가져온다
 * 어디서: `money.ts` 를 다시 내보내는 한 줄
 * 무엇을: PAYMENT_TYPES · PaymentType · BillingType
 * 어떻게: `money.ts` 의 정의를 그대로 내보낸다
 * 왜: 결제 · 증빙 값 목록의 정의 자리를 `money.ts` 하나로 두기 위해서다
 */
export { PAYMENT_TYPES, type PaymentType, type BillingType } from './money';

/**
 * 공통 상수 — 전체 서버에서 한 곳에서만 정의합니다.
 * 
 * ⚠️ 이전에 dispatchEngine.ts, OrderEvaluator.ts, socketHandlers.ts 3곳에
 * 중복 정의되어 있어 동기화 버그의 원인이었습니다.
 */

/** 더 이상 활성 상태가 아닌 오더의 status 집합 */
export const TERMINAL_STATUSES = new Set([
    'ORDER_COMPLETED', 'ORDER_RELEASED', 'ORDER_CANCELED', 'ORDER_FORCE_CANCELED'
]);

import { TERMINAL_STATUSES as SHARED_TERMINAL_STATUSES } from '@onedal/shared';

/**
 * 공통 상수 — 전체 서버에서 한 곳에서만 정의합니다.
 *
 * ⚠️ 이전에 dispatchEngine.ts, OrderEvaluator.ts, socketHandlers.ts 3곳에
 * 중복 정의되어 있어 동기화 버그의 원인이었습니다.
 *
 * 🔴 2026-08-10: 그 교훈을 적어놓고도 **이 파일 자체가 `@onedal/shared` 의
 * TERMINAL_STATUSES 와 별개의 두 번째 진실 공급원**이었다. 서버 전체의 "활성 콜"
 * 판정(getActiveCalls)이 이 Set 을 쓰는데, shared 에 `ORDER_DELIVERED` 를 추가해도
 * 여기에는 반영되지 않아 **하차한 짐이 계속 적재 중으로 세어졌다.**
 * (Phase 8.3 구현 중 스모크 테스트에서 발견 — "남은 활성 콜 2건" 이 1건이어야 했다)
 *
 * 이제 shared 에서 파생시킨다. 배열을 Set 으로 감싸는 것뿐이므로 갈라질 수 없다.
 */
export const TERMINAL_STATUSES = new Set<string>(SHARED_TERMINAL_STATUSES);

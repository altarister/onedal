/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { TERMINAL_STATUSES } from './constants';
import type { MyOrder } from '@onedal/shared';

/** 종료되지 않은(활성) 콜만 필터링합니다. */
export function getActiveCalls(session: { myOrders: MyOrder[] }): MyOrder[] {
    return session.myOrders.filter(c => !TERMINAL_STATUSES.has(c.status));
}

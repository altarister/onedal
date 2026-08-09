/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { isTerminal } from '@onedal/shared';
import type { MyOrder } from '@onedal/shared';

/**
 * 종료되지 않은(활성) 콜만 필터링합니다.
 *
 * "종결"의 정의는 `@onedal/shared` 에만 있다.
 * 예전에는 `core/constants.ts` 가 같은 목록을 Set 으로 한 벌 더 갖고 있어,
 * shared 에 `ORDER_DELIVERED` 를 추가해도 여기에 반영되지 않았다.
 * 하차한 짐이 계속 적재 중으로 세어졌다 (이슈 JJ).
 */
export function getActiveCalls(session: { myOrders: MyOrder[] }): MyOrder[] {
    return session.myOrders.filter(c => !isTerminal(c.status));
}

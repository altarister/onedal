/**
 * 🚚 **진행 중인 콜** — 종결 상태가 아닌 잡은 콜. 셈은 shared `isTerminal` 한 곳 · 세션을 받아 목록만 낸다(값만 본다).
 * 🔴 이 파일은 아무 서버 모듈도 가져오지 않는다 — helpers · geoMotion 이 함께 읽어 둘 사이 가져오기 순환을 끊는다.
 */
import { isTerminal } from '@onedal/shared';
import type { MyOrder } from '@onedal/shared';

/**
 * 종료되지 않은(활성) 콜만 필터링합니다.
 *
 * "종결"의 정의는 `@onedal/shared` 에만 있다.
 * 여기에 목록을 한 벌 더 두면 shared 에 상태를 더해도 반영되지 않아 하차한 짐이 계속 적재 중으로 세어진다.
 */
export function getActiveCalls(session: { myOrders: MyOrder[] }): MyOrder[] {
    return session.myOrders.filter(c => !isTerminal(c.status));
}

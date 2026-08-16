import { isEvaluating } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';

/**
 * 관제웹이 보는 콜 목록을 만드는 **유일한 합류 지점**.
 *
 * 세 갈래가 들어온다.
 *   history    — `GET /api/orders` 로 받은 오늘의 DB 이력 (새로고침 직후 소켓보다 **먼저** 온다)
 *   terminated — 소켓 `sync-active-orders` 의 종료분
 *   live       — 소켓 `sync-active-orders` 의 진행분
 *
 * 뒤에 오는 것이 앞을 덮어쓴다. 소켓이 DB 이력보다 최신이기 때문이다.
 *
 * ══ 왜 함수로 뽑았는가 ══
 *
 * 🔴 2026-08-11 — 이 로직이 `Dashboard.tsx` 안에 인라인으로 있었고,
 *    이력을 거르는 조건이 이랬다.
 *
 *        isTerminal(status) || status === 'ORDER_CONFIRMED'
 *
 *    `ORDER_PICKED_UP` 은 **둘 다 아니라서 버려졌다.** 상차한 콜이 사라진 것이다.
 *    같은 상태 목록이 서버 두 곳에도 손으로 적혀 있어서, 서버만 고치면
 *    여기서 다시 걸러 **"고쳤는데 안 된다"** 가 됐을 상황이었다.
 *
 *    이제 조건을 뒤집는다 — **평가 중이 아니면 전부 통과**시킨다.
 *    평가 중(안전취소 이전)은 서버 메모리에만 있는 상태라 DB 이력에 나올 이유가 없고,
 *    나온다면 그건 유령이다. 새 상태가 생겨도 이 조건은 안 깨진다.
 *
 * 컴포넌트 밖으로 뺀 이유는 하나 더 있다 — **렌더 없이 테스트하기 위해서**다.
 * 서버 테스트로는 이 버그가 안 잡혔다.
 */
export function mergeOrderViews(
    history: SecuredOrder[],
    terminated: SecuredOrder[],
    live: SecuredOrder[],
): SecuredOrder[] {
    const map = new Map<string, SecuredOrder>();

    for (const o of history) {
        // 평가 중 상태가 DB 이력으로 오면 유령이다 — 서버 메모리에만 존재해야 한다
        if (isEvaluating(o.status)) continue;
        map.set(o.id, o);
    }
    // 소켓이 이력보다 최신이므로 덮어쓴다. 얕은 병합이라 이력에만 있던 필드는 살아남는다
    for (const o of terminated) map.set(o.id, { ...map.get(o.id), ...o });
    for (const o of live) map.set(o.id, { ...map.get(o.id), ...o });

    return Array.from(map.values());
}

import { isEvaluating } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';

/**
 * 새로 들어온 콜 때문에 **화면을 옮겨야 하는가**를 정한다.
 *
 * 기사님: *"추가 합짐이 나오면 전화 중이라도 콜을 잡을지 말지를 내가 인지해야 하니까
 * 최근으로 스와이프해 줘야 할 것 같아."*
 *
 * ══ 왜 평가중 콜에만 거는가 ══
 *
 * 자동 이동은 **기사님 손에서 화면을 뺏는 동작**이다.
 * 단위·수량·시각을 고르는 중에 넘어가면 엉뚱한 카드의 칩을 누르게 된다.
 * (카드가 언마운트되지는 않아 입력값 자체는 남는다. 문제는 손이 가는 자리다)
 *
 * 그래서 **30초 안에 결재해야 하는 콜**에만 건다. 기사님이 말한 이유가 정확히 그것이다 —
 * *"콜을 잡을지 말지를 내가 인지"*. 이미 확정된 콜은 급하지 않으므로 화면을 뺏지 않는다.
 *
 * @param seen  이미 본 콜 id. `null` 이면 첫 렌더 — 이때는 **절대 옮기지 않는다**
 *              (처음엔 전부 '새 콜'이라 무조건 튀어 버린다)
 * @returns 옮겨갈 콜 id, 옮길 필요가 없으면 `null`
 */
export function pickAutoFocus(
    seen: Set<string> | null,
    orders: Pick<SecuredOrder, 'id' | 'status'>[],
): string | null {
    if (seen === null) return null;
    const fresh = orders.filter(o => !seen.has(o.id));
    return fresh.find(o => isEvaluating(o.status))?.id ?? null;
}

/**
 * 덱에 카드를 놓는 순서 — **잡은 시간순으로 고정**한다.
 *
 * 🔴 2026-08-12 — 예전엔 `평가중 먼저 → 최신순` 이었다.
 *    그러면 평가중 콜이 확정되는 순간 맨 앞에서 제 자리로 튀면서 **덱 전체가 재배치된다.**
 *    스와이프 도중에 그게 일어나면 손가락과 화면이 어긋난다.
 *    (기사님: *"스와이프 오작동한다. 새 아이디 들어온 것을 시간순으로 인덱스 주면 해결될 듯"*)
 *
 * 시간순이면 **새 콜은 뒤에 붙기만** 하고 기존 위치는 절대 안 밀린다.
 * 데스밸리 콜을 먼저 보여주는 일은 정렬이 아니라 `pickAutoFocus` 의 자동 이동이 맡는다 —
 * 그쪽은 순서를 흔들지 않고 **보는 위치만** 옮긴다.
 *
 * 덤으로 요약 줄의 번호가 카드의 `indexNum`(chronologicalIds)과 같아진다.
 */
export function deckOrder<T extends { capturedAt?: string }>(orders: T[]): T[] {
    const at = (o: T) => (o.capturedAt ? new Date(o.capturedAt).getTime() : 0);
    return [...orders].sort((a, b) => at(a) - at(b));
}

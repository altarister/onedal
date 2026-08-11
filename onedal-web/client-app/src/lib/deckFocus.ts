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

/**
 * 스크롤 이벤트가 왔을 때 **보고 있는 카드를 갱신할 것인가.**
 *
 * 🔴 2026-08-12 — 이 판단이 없어서 **요약 줄을 누르면 하이라이트가 왔다갔다** 했다.
 *    줄을 누르면 하이라이트가 목표로 먼저 옮겨가는데, 이어지는 부드러운 스크롤
 *    **도중에** `onScroll` 이 계속 발동한다. 애니메이션 초반의 `scrollLeft` 는
 *    아직 출발지 쪽이라 반올림하면 **이전 인덱스**가 나오고, 그 값이 하이라이트를 되돌렸다.
 *    (기사님: *"상태 바를 클릭하면 이전으로 왔다갔다 하는 버그가 있다"*)
 *
 * @param pending 프로그램이 미는 중인 목표 인덱스. 미는 중이 아니면 `null`
 * @param at      지금 스크롤 위치에서 반올림한 인덱스
 *
 *   `update`  — 사용자가 스와이프한 것이다. 갱신한다
 *   `arrived` — 밀던 것이 목표에 닿았다. 잠금만 푼다 (하이라이트는 이미 목표에 있다)
 *   `ignore`  — 아직 가는 중이다. **건드리지 않는다**
 */
export function scrollSettle(pending: number | null, at: number): 'update' | 'arrived' | 'ignore' {
    if (pending === null) return 'update';
    return at === pending ? 'arrived' : 'ignore';
}

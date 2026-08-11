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

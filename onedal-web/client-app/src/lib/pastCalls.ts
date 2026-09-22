import { isDeliveredCall } from '@onedal/shared';

/**
 * 🙈 **지나간 콜을 숨긴다 — 지우는 것이 아니다** (기사님 지시 2026-09-13:
 *    *"오른쪽 끝에 지나간 콜 숨기기가 있으면 좋겠는데… 아코디언의 콜타이틀중 배송이
 *    끝난콜을 숨겼다 보였다 하기만 하면 되는데.."*).
 *
 * ── 왜 «숨김»이고 «빼기»가 아닌가 ──
 * 덱은 하차를 마친 콜도 오늘 하루 함께 보여 준다(`deckOfCycle` · 2026-09-15 «사이클 = 하루» — 6단계가
 * 채워진 모습을 볼 수 없다는 기사님 말씀으로 그렇게 정했다). 그래서 목록에서 **빼면**
 * 되는 것처럼 보이는데, 아코디언은 **목록 자리(`openIdx`)로 열린다.** 배열을 걸러내면
 * 그 자리가 다른 콜을 가리킨다 — 화면규칙 **L3** 가 못박은 그 사고다
 * (*"콜은 번호로 찾는다 — 뺄셈(`callNo - 1`)으로 찾지 않는다. 뺄셈은 다른 콜을 연다"*).
 *
 * 🔴 **그래서 배열은 그대로 두고 «숨길 id»만 넘긴다.** 자리가 안 움직인다.
 * 🔴 **언마운트하지 않는다** — 접힌 콜을 마운트한 채 숨기는 규칙이 이미 있다
 *   . 숨김도 **CSS 로** 한다.
 *
 * 🔴 **열어 둔 콜은 숨기지 않는다.** 기사님이 끝난 콜을 일부러 펼쳐 보는 중에 숨김이
 *    켜져 있다는 이유로 **보고 있던 것이 사라지면** 안 된다. 손이 고른 것이 자동 규칙보다
 *    세다. 닫으면 그때 사라지므로 **스스로 맞아 들어간다** — 깃발도 타이머도 필요 없다.
 *
 * ⚠️ 취소·방출은 애초에 덱에 없다 (`deckOfCycle` — «없던 일»이라 안 남는다). 여기서
 *    다시 가르지 않는다 (규칙 ③).
 *
 * 🔬 검사는 `pastCalls.test.ts`.
 */
export function hiddenPastIds(
    orders: ReadonlyArray<{ id: string; status?: string | null }>,
    /** 🙈 숨김이 켜져 있나 (기사님이 상태바 오른쪽에서 누른다) */
    hide: boolean,
    /** 🖐️ 지금 펼쳐 둔 콜 — 끝났어도 숨기지 않는다 */
    openId: string | null,
): ReadonlySet<string> {
    if (!hide) return new Set();
    return new Set(orders
        .filter(o => isDeliveredCall(o) && o.id !== openId)
        .map(o => o.id));
}

/**
 * 🗺️ **숨긴 콜의 자취를 가린다** (기사님 확정 2026-09-15 — *"숨기면 지도도 가림"* · 사이클 = 하루).
 *
 * 자취는 하루 종일 쌓이는데 조각에 콜 이름이 없다(주행 점에는 «누구 짐»이 없다). 저장 칸을 더하지 않고 **시각으로 가른다**(규칙 ③) —
 * 보이는 콜 중 가장 먼저 잡은 시각(`sinceMs`)보다 앞선 점은 숨긴 콜들을 하던 때의 길이다.
 * ⚠️ 시각을 모르는 점은 남긴다 (규칙 ④). 조각이 통째로 비면 뺀다. `sinceMs` 가 `null` 이면 숨김이 없다 — 그대로 돌려준다.
 */
export function trailOfShown<P extends { atMs?: number }>(segments: P[][], sinceMs: number | null): P[][] {
    if (sinceMs == null) return segments;
    return segments
        .map(seg => seg.filter(p => p.atMs == null || p.atMs >= sinceMs))
        .filter(seg => seg.length > 0);
}

import { isTerminal, isDeliveredCall, hasVisitedStop } from '@onedal/shared';

/**
 * 👣 **다녀온 정거장의 순서 — 번호를 세는 목록** (2026-09-12 밤 · 기사님 실측).
 *
 * ── 왜 떼어냈나 ──
 * 화면 번호가 한 판에 여러 번 통째로 무너졌다. 계측이 원인을 짚었다:
 *
 *   [다녀옴] c7cc48 PICKED_UP 상22:57 하23:40  →  c7cc48 PICKED_UP 상— 하—
 *   [번호]   ✓1초월읍상 … ✓6중리동하           →  1중리동하        ← 여섯이 하나로
 *
 * 관제웹은 콜을 세 갈래로 합친다 (`mergeOrderViews`) — 이력(REST) · 종료분 · 진행분(소켓).
 * **이력이 바탕으로 깔리고** 소켓이 그 위를 덮는데, 이력은 `GET /api/orders` 의
 * `SELECT * FROM orders` 다. 그 표에는 **좌표도 도착 시각도 없다** — 둘 다 다른 표에 산다
 * (`orderStops`+`places` · `step_arrive_*`). 그래서 어떤 렌더에서 소켓이 그 콜을 안 실어
 * 주면 **이력만 남아 «안 다녀온 콜»이 된다.**
 *
 * 🔴 **그래도 번호가 무너질 이유는 없다.** 한 목록이 두 질문에 답하고 있었다 (규칙 ⑤-4 ⑤):
 *      «몇 번째로 다녀왔나»  → 좌표가 **필요 없다**   ← 번호
 *      «지도에 어디 찍나»    → 좌표가 필요하다        ← 마커
 *    그래서 목록은 **하나로 두고** 좌표 없는 것도 담는다. 지도는 제 쪽에서 걸러 낸다 —
 *    `PinnedRouteCanvas` 가 이미 `Number.isFinite` 로 거르고 있었다 (새로 만들 것이 없었다).
 *
 * ⚠️ **이력이 빈약한 것 자체는 서버가 고칠 일이다** (좌표·도착 시각을 함께 주면 원천이
 *    하나가 된다 — `bootstrapUserSession` 의 복구 쿼리는 이미 두 표를 JOIN 한다).
 *    여기는 «이력만 남아도 번호가 안 무너지게» 겹쳐 둔 장치다 (규칙 ②).
 *
 * 🔬 검사는 `visitedSequence.test.ts` — 특히 «좌표를 몰라도 순서에 든다»가 그 한 건이다.
 */
export interface VisitedStop {
    /** 📍 좌표 — **모를 수 있다.** 지도만 이 값을 요구한다 (규칙 ④ — 지어내지 않는다) */
    x: number | null;
    y: number | null;
    type: '상차' | '하차';
    /** 🕐 다녀온 시각(ms) — 버튼으로만 보고해 **모를 수 있다** */
    at: number | null;
    orderId: string;
    name: string;
    /** 🔢 번호는 부르는 쪽이 붙인다 — 세는 곳은 한 곳이다 (규칙 ③) */
    no: number;
}

interface DeckCall {
    id: string;
    status?: string | null;
    pickup: string;
    dropoff: string;
    pickupX?: number | null;
    pickupY?: number | null;
    dropoffX?: number | null;
    dropoffY?: number | null;
    arrivedPickupAt?: string | null;
    arrivedDropoffAt?: string | null;
}

const msOf = (s?: string | null) => {
    const t = Date.parse(s ?? '');
    return Number.isNaN(t) ? null : t;
};

export function visitedSequenceOf<T extends DeckCall>(
    deck: T[],
    /** 주소 → 화면에 적을 짧은 이름 (`getAddressLabel`) — 순수하게 두려고 넘겨받는다 */
    nameOf: (address: string) => string,
): VisitedStop[] {
    const out: VisitedStop[] = [];
    for (const r of deck) {
        /* 🔴 취소·방출은 **없던 일**이라 발자취에 안 남는다 (`deckOfCycle` 과 같은 기준) */
        if (isTerminal(r.status ?? undefined) && !isDeliveredCall(r)) continue;
        if (hasVisitedStop(r, 'pickup'))
            out.push({ x: r.pickupX ?? null, y: r.pickupY ?? null, type: '상차', orderId: r.id, no: 0,
                       name: nameOf(r.pickup), at: msOf(r.arrivedPickupAt) });
        if (hasVisitedStop(r, 'dropoff'))
            out.push({ x: r.dropoffX ?? null, y: r.dropoffY ?? null, type: '하차', orderId: r.id, no: 0,
                       name: nameOf(r.dropoff), at: msOf(r.arrivedDropoffAt) });
    }
    /**
     * 🕐 **시각을 모르면 뒤로 보낸다** — `0` 을 넣으면 «아주 옛날»이라 ✓1 을 훔친다
     *    (2026-08-31 리뷰에서 잡힌 것 · 규칙 ④).
     * 🔴 **정렬은 안정적이어야 한다.** 시각이 **다 사라진 판**(이력만 남은 판)에서는 열쇠가
     *    전부 같아지는데, 그때 덱 순서(= 콜 잡은 순서, 콜 안에서는 상차→하차)가 그대로
     *    남아야 번호가 흔들리지 않는다. `Array.prototype.sort` 는 안정 정렬이다.
     */
    out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
    return out;
}

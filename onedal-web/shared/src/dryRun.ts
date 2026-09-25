/**
 * 🧮 **우회 한계 비용 · 통과/실패 조건의 규격**
 *
 * 판정은 `judge.ts` 가 기준 다섯을 모아서 낸다 (`criteria.ts`).
 *
 * 🔴 **재료가 없는 기준은 «잴 게 없다»와 «잴 수 없다»로 가른다** — 통째로 빼고 평균을 내면
 *    첫짐이 빨간불이 되거나, 못 쟀는데 꿀이 된다.
 *
 * 남은 것은 둘뿐이다 — 합짐의 **한계** 우회 계산과, 통과/실패 조건이 오가는 **규격**.
 */

export interface DryRunGate {
    key: string;
    name: string;
    pass: boolean;
    /** 실패했을 때 기사님이 읽는 문장 — "잡으면 ~가 깨집니다" */
    why: string | null;
}





export function marginalDetourMin(
    mergedTotalMin: number,
    prevRouteTotalMin: number | null,
    fallbackDiffMin: number,
): number {
    return prevRouteTotalMin != null ? Math.round(mergedTotalMin - prevRouteTotalMin) : fallbackDiffMin;
}

/**
 * 🛣️ **«길을 벗어나는 분» — 늘어난 주행에서 꼬리 배송을 뺀다** (기사님 확정)
 *
 * 기사님: *"갈마에서 상차하고 성거읍 가는 길에 근처 문지동에서 상차 하나만 하면 되는거라.
 * 우회 비용과 시간이 얼마 되지 않아"*
 *
 * ── 왜 ──
 * 기사님이 직선 예로 못을 박으셨다:
 *
 *   현위치 —10km— 첫짐상차 —5km— 합짐상차 —25km— 첫짐하차 —20km— 합짐하차
 *
 * 모두 직선상에 놓였으니 **한 번도 되돌아가지 않는다 — 우회는 0** 이다. 그런데 늘어난
 * 주행(60 − 40 = 20)은 전부 «첫짐하차 → 합짐하차» 배송이다. 그것을 「우회」라 부르고
 * 벌점을 주면, 가는 길에 하나 끼우는 합짐이 «하루를 거는 콜»로 오해받는다
 * (실측 07:20 — 무감점이 60분인 기사님 설정에서 값이 83%까지 깎였다).
 *
 * ── 어떻게 ──
 * 후보 하차가 경로의 **마지막**일 때 그 마지막 구간이 곧 «꼬리 배송»이다. 그것을 빼면
 * 남는 것은 «그 상차지에 들르려고 길을 벗어난 비용» 하나다. 기사님 예: 20 − 20 = 0.
 *
 * 🔴 **«후보 상차 이후 주행»을 빼면 안 된다** — 그 구간에는 기존 콜의 하차도 들어 있어
 *    식이 `후보상차누적 − 기존경로` 로 약분되고, 거의 모든 합짐이 0 이 되어 감쇠가 꺼진다.
 *    검산: 합짐 상차가 옆으로 30분 빠져 왕복 60분을 버리는 경로(누적 10·40·95·115 · 기존 40)에서
 *    그 식은 0 을 내고 이 식은 55 를 낸다.
 * 🔴 **`cum[i] − cum[i−1]`(직전 → 후보 하차)을 중간 하차에 쓰지 않는다** — 하차가 길 위에 딱
 *    있을 때 삽입 비용보다 훨씬 커서 과소평가가 된다. 중간 하차는 «가는 길»이라 삽입 비용이
 *    작으므로 `marginal` 을 그대로 둔다(꼬리 0) — 근사 오차가 작은 자리에만 근사를 쓴다.
 * 🔴 **이것은 항등식이 아니라 «마지막 배송을 뺀 나머지»다.** `marginal` 을 «상차 삽입 + 하차
 *    삽입»으로 정확히 가를 수 있는 것은 기존 콜의 방문 순서가 안 바뀔 때뿐이다. 순서가 좋아져
 *    짧아지면 덜 깎고(안전), 나빠지면 더 깎는데 그것은 실제로 더 든 시간이다.
 *
 * 🔴 **자리 맞물림이 깨지면 `null` 을 돌려준다** — 규약은 «`driveMinutes[i]` = 그 정거장에
 *    **도착한** 누적»이라 **마지막 원소가 곧 총주행**이다. 그 등식이 깨졌다면 정거장과 주행분이
 *    엇갈린 것이니(`helpers.ts` 의 «주행분이 남의 이름에 붙는다 · #60»), **틀린 꼬리를 빼는 대신
 *    옛 셈으로 떨어진다.** 실경로로 확인하기 전까지 가장 값싼 보험이다 (규칙 ⑤-2).
 *
 * @returns 벗어나는 분, 또는 `null`(못 쟀다 — 부르는 쪽이 「돈」에 안 넘겨 옛 셈으로 돈다)
 */
export function offRouteMinutesOf(
    stops: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff'; driveMinutes: number | null }>,
    candidateId: string,
    marginalMin: number,
    mergedTotalMin: number,
): number | null {
    if (stops.length < 2) return null;
    const last = stops[stops.length - 1];
    const prev = stops[stops.length - 2];
    if (last.driveMinutes == null || prev.driveMinutes == null) return null;
    /* 🔴 마지막 누적이 총주행과 다르면 정거장과 주행분이 엇갈린 것이다 — 옛 셈으로 */
    if (Math.abs(last.driveMinutes - mergedTotalMin) > 1) return null;
    /* 후보 하차가 마지막이 아니면 뺄 꼬리가 없다 — `marginal` 을 그대로 본다 */
    if (last.orderId !== candidateId || last.stopType !== 'dropoff') return Math.max(0, marginalMin);
    const tail = Math.max(0, last.driveMinutes - prev.driveMinutes);
    return Math.max(0, marginalMin - tail);
}

/** 로그 한 줄 — `🧪 [dryRun] 🟢 64점 (우회 시급 2.6만/h · 버퍼 최소 +18분) · 딱지: 통화 필수` */

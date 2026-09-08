/**
 * 🚚 **실험실 → 실물 이식 대응표** (기사님 2026-09-09: *"중간중간 이동을 위한 점검을
 * 하는 것이 맞을 것 같다"*).
 *
 * 🔴 **이 파일이 대조표의 원천이다 — 문서가 아니라 코드다.**
 *    `docs/기획/이식_계획.md` §5 의 표는 이걸 읽고 쓴 설명이고,
 *    **어긋나면 빨간불을 내는 것은 여기와 `labPortMap.test.ts` 다.**
 *    문서만 있으면 실물 칸이 하나 바뀌어도 조용히 낡는다 — 이 레포가 네 번 당한 자리다.
 *
 * 읽기 전용이다: `shared` 의 규칙표를 **읽기만** 하고 실물 코드는 이 파일을 import 하지
 * 않는다 (`labFilterOutput.ts` 와 같은 규약).
 */

/**
 * 🪜 **정거장 한 곳의 계획과 실측** — 실물의 `step_*` 여섯 표와 **같은 모양**이다.
 * 계획과 실측이 같은 자리에 있어야 조인 없이 오차를 잰다 — 실물이 옛 장부를 버리고
 * 이 모양으로 간 이유다.
 */
export type StopStep = {
    /** 「몇 시까지 갈게요」 — 확정한 순간 못 박고 다시는 안 바꾼다 */
    promisedAt: number | null;
    /** 지나기 직전의 마지막 예상 — 실측과 견주면 우리 계산이 얼마나 맞는지 나온다 */
    predictedAt: number | null;
    /** 실제로 지난 시각 */
    occurredAt: number | null;
    /** 어떻게 알았나 — 자동(GPS) · 직접 · 건너뜀 */
    source: string | null;
};

/** 실물의 어느 표·어느 칸으로 가는가 (상차/하차 두 갈래가 같은 이름을 쓴다) */
export const STOP_STEP_TO_REAL: Record<keyof StopStep, { tables: string[]; col: string }> = {
    promisedAt:  { tables: ['step_call_pickup', 'step_call_dropoff'],     col: 'promised_arrival_at' },
    predictedAt: { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'predicted_at' },
    occurredAt:  { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'occurred_at' },
    source:      { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'source' },
};

/**
 * 🧾 **콜 한 건의 나머지 값** — `orders` 표로 간다.
 * `null` 은 **실물에 아직 칸이 없다**는 뜻이다 (이식 때 `ensureColumns` 로 판다).
 */
export const LAB_CALL_TO_ORDERS: Record<string, string | null> = {
    distKm:      'kakaoSoloDistanceKm',
    durMin:      'kakaoSoloDurationMin',
    /** 🕗 「아직 안 왔다」와 「재 봤는데 못 쟀다」를 가르는 값 — 실물도 같은 뜻으로 쓴다 */
    routeComputedAt: 'routeComputedAt',
    tollWon:     'tollFare',            // ⚠️ 실물은 TEXT("3,000원") — 숫자로 갈지는 별건
    pickup:      null,                  // 좌표는 orderStops → places 로 3단 조인
    drop:        null,
    approachKm:  null,                  // 🆕 내 위치 → 상차 (실물에 없다)
    approachMin: null,                  // 🆕
    destName:    null,                  // 🆕 잡을 당시의 목적지(판)
    optionUsed:  null,                  // 🆕 카카오 어느 옵션으로 쟀나
};

/**
 * ⏰ **약속 시각 — «이 콜만 직행했을 때»로 잡는다** (기사님 확정 2026-09-09).
 *
 * 기사님: *"이 콜의 어디를 경유해 왔을지 모르잖아. 빙 둘러 온 거면 그 값은 잘못된 값이야."*
 *
 * 🔴 **`chainCum`(병합 경로 누적)은 일부러 안 쓴다.** 받아만 두고 버린다 — 예전에 그걸로
 * 약속을 잡았다가, 경유가 약속에 이미 섞여 「다른 콜로 영향받는 시간 = 예정 − 약속」이
 * 거의 0 으로 나왔다. **진짜 영향이 약속에 흡수돼 숨는다.**
 *
 * 직행값의 원천은 ⑮ 호출(내 위치 → 상차 → 하차)이다. 아직 안 왔으면 **약속은 없다** —
 * 병합 값으로 대신 채우지 않는다 (규칙 ④).
 *
 * 실물에서는 `step_call_*.promised_arrival_at` 자리다.
 */
export function promiseTimes(opts: {
    /** 콜을 확정한 시각 */
    confirmedAt: number;
    /** 병합 경로의 누적 분 — 🔴 **비교용으로만 받는다. 약속에 안 쓴다** */
    chainCum: { pickupMin: number | null; dropoffMin: number | null };
    /** ⑮ 직행 실측 — 내 위치 → 상차 → 하차 */
    direct: { approachMin: number | null; durMin: number | null };
}): { pickupAt: number | null; dropoffAt: number | null } {
    const { confirmedAt, direct } = opts;
    const pickupAt = direct.approachMin == null ? null : confirmedAt + direct.approachMin * 60000;
    const dropoffAt = pickupAt == null || direct.durMin == null ? null : pickupAt + direct.durMin * 60000;
    return { pickupAt, dropoffAt };
}

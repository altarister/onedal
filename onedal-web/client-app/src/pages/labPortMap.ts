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
    /**
     * 🧾 **누가 이 정거장을 몇 분 밀었나** — 콜을 확정할 때마다 한 줄씩 **쌓는다**
     * (기사님 확정 2026-09-09: *"31분이 왜 밀린 건지 그 요소들만 딱 들어갔으면"*).
     *
     * 값은 «확정 전 경로»와 «확정 후 경로»의 그 정거장까지 누적 차이 — ⑯ 의 우회 정의
     * 그대로다. 카카오를 더 부르지 않는다.
     *
     * 🔴 `causeCallId` 로 적는다. `①②③` 은 콜이 취소되면 당겨지는 번호라, 번호로
     *    적으면 나중에 **남의 콜을 가리킨다.**
     */
    impacts: Array<{ causeCallId: number; causeLabel: string; min: number; at: number }>;
};

/** 실물의 어느 표·어느 칸으로 가는가 (상차/하차 두 갈래가 같은 이름을 쓴다) */
export const STOP_STEP_TO_REAL: Record<keyof StopStep, { tables: string[]; col: string | null }> = {
    promisedAt:  { tables: ['step_call_pickup', 'step_call_dropoff'],     col: 'promised_arrival_at' },
    predictedAt: { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'predicted_at' },
    occurredAt:  { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'occurred_at' },
    source:      { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'source' },
    /**
     * 🆕 실물에 **아직 없는 칸**이다 (`null`). 이식 때 `system_reasons TEXT` 로 판다.
     * 🔴 기사님이 고르는 `reasons`(사고·문 잠김…)와 **다른 칸**이어야 한다 — 한 칸에 섞으면
     *    나중에 «사고로 늦은 건수»를 셀 때 경유가 딸려 들어온다 (규칙 ⑤-4 ⑤).
     */
    impacts:     { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: null },
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
    /**
     * 🆕 **취소·방출로 끝난 시각.** 실물의 `completedAt` 은 **하차 완료에만** 들어가고
     * 취소면 오히려 NULL 로 지운다(`dispatchEngine.ts` 의 `CASE WHEN … ORDER_DELIVERED`).
     * 그래서 «언제 빠져서 순서가 바뀌었나»를 못 잰다 — 칸이 하나 필요하다.
     */
    terminatedAt: null,
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

/**
 * 🧾 **이 확정이 그 정거장을 몇 분 밀었나 — 원인과 함께** (기사님 확정 2026-09-09).
 *
 * 기사님: *"31분이 밀린 거라면 31분이 왜 밀린 건지 그 요소들만 딱 들어갔으면 좋겠어."*
 *
 * 분은 «확정 전 누적»과 «확정 후 누적»의 차이 — ⑯ 의 우회 정의 그대로라 카카오를
 * 더 부르지 않는다. 원인은 **이번에 끼워 넣은 정거장 중 그 정거장보다 앞에 온 것**뿐이다.
 * 뒤에 낀 것은 그 정거장을 못 민다.
 *
 * 🔴 **안 밀렸으면 안 적는다** — 0분을 쌓으면 이유 줄이 의미 없는 줄로 찬다.
 * 🔴 **못 잰 값이 섞이면 안 적는다** — 지어내지 않는다 (규칙 ④).
 *
 * 실물에서는 `step_arrive_*.system_reasons` 자리다.
 */
export function impactOfStop(opts: {
    /** 밀렸는지 볼 정거장 (`①하차` 같은 라벨) */
    stopLabel: string;
    /** 확정 «전» 경로의 그 정거장까지 누적 분 */
    beforeMin: number | null | undefined;
    /** 확정 «후» 경로의 그 정거장까지 누적 분 */
    afterMin: number | null | undefined;
    /** 확정 후 경로의 정거장 순서 */
    orderNow: Array<string | null>;
    /** 이번에 끼워 넣은 정거장들 */
    inserted: Array<{ label: string; name: string }>;
    causeCallId: number;
    at: number;
}): { causeCallId: number; causeLabel: string; min: number; at: number } | null {
    const { stopLabel, beforeMin, afterMin, orderNow, inserted, causeCallId, at } = opts;
    if (beforeMin == null || afterMin == null || afterMin === beforeMin) return null;
    const here = orderNow.indexOf(stopLabel);
    if (here < 0) return null;
    const causes = inserted.filter(x => {
        const i = orderNow.indexOf(x.label);
        return i >= 0 && i < here;
    });
    if (!causes.length) return null;
    return { causeCallId, causeLabel: causes.map(x => x.name).join(' · '), min: afterMin - beforeMin, at };
}

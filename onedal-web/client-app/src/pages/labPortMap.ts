/**
 * 🚚 **실험실 → 실물 이식 대응표** (기사님: *"중간중간 이동을 위한 점검을
 * 하는 것이 맞을 것 같다"*).
 *
 * 🔴 **이 파일이 대조표의 원천이다 — 문서가 아니라 코드다.**
 *    **어긋나면 빨간불을 내는 것은 여기와 `labPortMap.test.ts` 다.**
 *    문서만 있으면 실물 칸이 하나 바뀌어도 조용히 낡는다 — 이 레포가 네 번 당한 자리다.
 *
 * 읽기 전용이다: `shared` 의 규칙표를 **읽기만** 하고 실물 코드는 이 파일을 import 하지
 * 않는다 (`labFilterOutput.ts` 와 같은 규약).
 */

/**
 * 🪜 **정거장 한 곳의 계획과 실측** — 실물의 `step_*` 여섯 표와 **같은 모양**이다.
 * 계획과 실측이 같은 자리에 있어야 조인 없이 오차를 잰다 — 실물도
 * 그래서 이 모양이다.
 */
/** 밀림 한 줄 — 실물 `step_arrive_*.system_reasons` 로 갈 모양 */
// ⏱️ 약속의 두 계수는 **실물 기본값을 그대로 읽는다** — 여기 숫자를 또 적지 않는다 (규칙 ③)
import { DEFAULT_DEADLINE_RULES, type StopImpact } from '@onedal/shared';

// 🔴 `StopImpact` 는 `@onedal/shared` 에 있다 — 아래에서 다시 내보낸다

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
     * ☎️ **약속을 어떻게 정했나** — `추정`(서버가 규칙으로 넣은 값) · `통화`(기사님이 걸어서 받은 값).
     *
     * 🔴 위 `source` 와 **다른 질문**이다 (규칙 ⑤-4 ⑤). `source` 는 «어떻게 **지났나**»(GPS·직접),
     *    이 칸은 «어떻게 **정했나**»다. 한 칸에 담으면 «GPS 로 지난 통화 약속»을 못 적는다.
     * 🔴 이 값이 화면을 바꾼다 — **통화로 정한 약속은 시각이 보라색**이고, 그건
     *    *"그 이상은 해선 안 되고 무조건 이행해야 한다"* 는 뜻이다 (기사님 확정).
     * ⚠️ **실물에 아직 칸이 없다** — 이식 때 `step_arrive_*` 에 한 칸을 더한다.
     */
    promiseBy?: '추정' | '통화' | null;
    /**
     * 🧾 **누가 이 정거장을 몇 분 밀었나** — 콜을 확정할 때마다 한 줄씩 **쌓는다**
     * (기사님 확정: *"31분이 왜 밀린 건지 그 요소들만 딱 들어갔으면"*).
     *
     * 값은 «확정 전 경로»와 «확정 후 경로»의 그 정거장까지 누적 차이 — ⑯ 의 우회 정의
     * 그대로다. 카카오를 더 부르지 않는다.
     *
     * 🔴 `causeCallId` 로 적는다. `①②③` 은 콜이 취소되면 당겨지는 번호라, 번호로
     *    적으면 나중에 **남의 콜을 가리킨다.**
     */
    impacts: StopImpact[];
};

/** 실물의 어느 표·어느 칸으로 가는가 (상차/하차 두 갈래가 같은 이름을 쓴다) */
export const STOP_STEP_TO_REAL: Record<keyof StopStep, { tables: string[]; col: string | null }> = {
    promisedAt:  { tables: ['step_call_pickup', 'step_call_dropoff'],     col: 'promised_arrival_at' },
    predictedAt: { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'predicted_at' },
    occurredAt:  { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'occurred_at' },
    source:      { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'source' },
    /** ⚠️ **실물에 아직 칸이 없다** — 이식 때 `step_arrive_*` 에 한 칸을 더한다 (기사님) */
    promiseBy:   { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: null },
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
    destName:    null,                  // 🆕 잡을 당시의 목적지
    optionUsed:  null,                  // 🆕 카카오 어느 옵션으로 쟀나
    /**
     * 🧹 **취소·방출로 끝난 시각** — 실물 `orders.terminatedAt`.
     * 실물의 `completedAt` 은 하차 완료에만 들어가고 취소면 NULL 이라 칸을 따로 둔다.
     */
    terminatedAt: 'terminatedAt',
};

/**
 * ⏰ **약속 시각 — «이 콜만 직행했을 때»로 잡는다** (기사님 확정).
 *
 * 기사님: *"이 콜의 어디를 경유해 왔을지 모르잖아. 빙 둘러 온 거면 그 값은 잘못된 값이야."*
 *
 * 🔴 **`chainCum`(병합 경로 누적)은 일부러 안 쓴다.** 받아만 두고 버린다 — 그걸로
 * 약속을 잡으면 경유가 약속에 이미 섞여 「다른 콜로 영향받는 시간 = 예정 − 약속」이
 * 거의 0 으로 나온다. **진짜 영향이 약속에 흡수돼 숨는다.**
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
    /**
     * 🧳 **상차에 머무는 분** (기사님 «정차를 넣어줘»).
     * 하차 약속은 «상차에 닿아서 → **짐을 싣고** → 달려서» 닿는 시각이다.
     * 🔴 **상차 약속에는 안 더한다** — 그건 도착 시각이라 짐 싣기 전이다.
     */
    pickupDwellMin?: number;
}): { pickupAt: number | null; dropoffAt: number | null } {
    const { confirmedAt, direct, pickupDwellMin = 0 } = opts;
    /**
     * ⏱️ **상차 약속 = 콜 잡은 시각 + 20분** (기사님 확정).
     *
     * 🔴 «잡은 시각 + **접근 실측**»으로 세우면 **약속을 예상에 맞추는** 셈이라
     *    ± 가 늘 0에 가깝고, **«20분 안에 못 갔다»가 화면에 안 나온다.**
     *    기사님: *"상차는 콜 받고 20분이 넘어 상차지에 가면 문제다. 근데 **이걸로는 20분이
     *    넘었는지 아닌지 모른다**는 것이다. 얼마나 늦는지는 내가 알아야 할 것 같아."*
     *    예: 직행 19분인 상차지를 앞 둘을 들르느라 42분에 닿으면 **22분 초과**다.
     * ⚠️ **20분은 가장 약한 폴백이다** (용어집 「상차버퍼」):
     *    **통화 약속 > 적요 상차 시각 > 잡은 시각 + 20분.**
     *    실험실은 적요가 없어 20분으로 서지만, 앞의 둘이 들어오면 그것이 이긴다.
     * 🔴 접근 실측(`approachMin`)은 여전히 필요하다 — **못 쟀으면 약속도 안 세운다**
     *    (그 콜이 아직 «잰 콜»이 아니라는 뜻이라, 지어내지 않는다 · 규칙 ④).
     */
    const pickupAt = direct.approachMin == null ? null
        : confirmedAt + DEFAULT_DEADLINE_RULES.pickupPromiseMinutes * 60000;
    /**
     * 🚚 **하차 약속 = 상차 약속 + 싣는 분 + 배송 주행 × 150%** (용어집 「데드라인」 · 업계 관행).
     *
     * 🔴 **100%** 로 잡으면 관행이 봐주는 **여유 50%가 통째로 빠져** 모든 하차가 늦어 보인다.
     * 🔴 이것은 «관행 상한»이 아니라 **고객과의 약속**이다 (기사님 정정:
     *    *"내가 그때까지 가져다 주겠다는 약속인 거지. 사용자도 퀵사에 그렇게 안내받을 거야 —
     *    **지금 전달해 주시면 150% 안에 가져다 드릴게요**. 그러니 고객과의 약속이 맞아"*).
     * 🔴 기산점이 **상차 약속**(잡은 시각 + 20분)이라, 실제 상차가 늦어도 이 약속은 밀리지 않는다 —
     *    상차 지연은 상차 ± 와 하차 ± 에 함께 보인다.
     */
    const dropoffAt = pickupAt == null || direct.durMin == null ? null
        : pickupAt + (pickupDwellMin + Math.round(direct.durMin * (DEFAULT_DEADLINE_RULES.deadlineRatioPct ?? 150) / 100)) * 60000;
    return { pickupAt, dropoffAt };
}

/**
 * 🔴 **밀림 계산(`impactOfStop`·`splitDropImpact`)은 `@onedal/shared` 에 있다.**
 *    **실물이 원천이고 실험실이 그것을 부른다** — 여기서는 다시 내보내기만 한다.
 *    계산이 한 벌이라야 화면과 서버가 두 말을 하지 않는다 (규칙 ③).
 */
export { impactOfStop, splitDropImpact, type StopImpact } from '@onedal/shared';

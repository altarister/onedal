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
/** 밀림 한 줄 — 실물 `step_arrive_*.system_reasons` 로 갈 모양 */
// ⏱️ 약속의 두 계수는 **실물 기본값을 그대로 읽는다** — 여기 숫자를 또 적지 않는다 (규칙 ③)
import { DEFAULT_DEADLINE_RULES } from '@onedal/shared';

export type StopImpact = { causeCallId: number; causeLabel: string; min: number; at: number };

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
     *    *"그 이상은 해선 안 되고 무조건 이행해야 한다"* 는 뜻이다 (기사님 확정 2026-09-10).
     * ⚠️ **실물에 아직 칸이 없다** — 이식 때 `step_arrive_*` 에 한 칸을 더한다.
     */
    promiseBy?: '추정' | '통화' | null;
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
    impacts: StopImpact[];
};

/** 실물의 어느 표·어느 칸으로 가는가 (상차/하차 두 갈래가 같은 이름을 쓴다) */
export const STOP_STEP_TO_REAL: Record<keyof StopStep, { tables: string[]; col: string | null }> = {
    promisedAt:  { tables: ['step_call_pickup', 'step_call_dropoff'],     col: 'promised_arrival_at' },
    predictedAt: { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'predicted_at' },
    occurredAt:  { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'occurred_at' },
    source:      { tables: ['step_arrive_pickup', 'step_arrive_dropoff'], col: 'source' },
    /** ⚠️ **실물에 아직 칸이 없다** — 이식 때 `step_arrive_*` 에 한 칸을 더한다 (기사님 2026-09-10) */
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
    /**
     * 🧳 **상차에 머무는 분** (기사님 2026-09-09 «정차를 넣어줘»).
     * 하차 약속은 «상차에 닿아서 → **짐을 싣고** → 달려서» 닿는 시각이다.
     * 🔴 **상차 약속에는 안 더한다** — 그건 도착 시각이라 짐 싣기 전이다.
     */
    pickupDwellMin?: number;
}): { pickupAt: number | null; dropoffAt: number | null } {
    const { confirmedAt, direct, pickupDwellMin = 0 } = opts;
    /**
     * ⏱️ **상차 약속 = 콜 잡은 시각 + 20분** (기사님 확정 2026-09-10).
     *
     * 🔴 전에는 «잡은 시각 + **접근 실측**»이었다 — 즉 **약속을 예상에 맞춰** 세웠다.
     *    그러면 ± 가 늘 0에 가깝고, **«20분 안에 못 갔다»가 화면에 안 나온다.**
     *    기사님: *"상차는 콜 받고 20분이 넘어 상차지에 가면 문제다. 근데 **이걸로는 20분이
     *    넘었는지 아닌지 모른다**는 것이다. 얼마나 늦는지는 내가 알아야 할 것 같아."*
     *    실측(볼트 저녁 판): 불로동은 직행 19분인데 앞 둘을 들르느라 42분 — **22분 초과**다.
     *    옛 식은 그걸 «+23»(우리 약속 대비)이라고만 말해 20분 규칙과 무관했다.
     * ⚠️ **20분은 가장 약한 폴백이다** (용어집 「상차버퍼」):
     *    **통화 약속 > 적요 상차 시각 > 잡은 시각 + 20분.**
     *    실험실은 적요가 없어 20분으로 서지만, 앞의 둘이 들어오면 그것이 이긴다.
     * 🔴 접근 실측(`approachMin`)은 여전히 필요하다 — **못 쟀으면 약속도 안 세운다**
     *    (그 콜이 아직 «잰 콜»이 아니라는 뜻이라, 지어내지 않는다 · 규칙 ④).
     */
    const pickupAt = direct.approachMin == null ? null
        : confirmedAt + DEFAULT_DEADLINE_RULES.pickupPromiseMinutes * 60000;
    /**
     * 🚚 **하차 약속 = 상차 완료 + 배송 주행 × 150%** (용어집 「데드라인」 · 업계 관행).
     *
     * 🔴 전에는 **100%** 였다 — 관행이 봐주는 **여유 50%가 통째로 빠져** 모든 하차가 늦어 보였다.
     *    실측(볼트 저녁 판): 가산동 +29 → **+8** · 원삼면 +44 → **+1** · 안양동 +7 → **−17**(여유).
     * 🔴 이것은 «관행 상한»이 아니라 **고객과의 약속**이다 (기사님 정정 2026-09-10:
     *    *"내가 그때까지 가져다 주겠다는 약속인 거지. 사용자도 퀵사에 그렇게 안내받을 거야 —
     *    **지금 전달해 주시면 150% 안에 가져다 드릴게요**. 그러니 고객과의 약속이 맞아"*).
     * 🔴 기산점이 **상차 완료**라 상차가 늦으면 이 약속도 **같이 밀린다.** 그래서 상차 지연이
     *    하차 ± 에 **두 번 세어지지 않는다** — 상차 지연은 상차 ± 가, 배송 우회는 하차 ± 가 답한다.
     */
    const dropoffAt = pickupAt == null || direct.durMin == null ? null
        : pickupAt + (pickupDwellMin + Math.round(direct.durMin * (DEFAULT_DEADLINE_RULES.deadlineRatioPct ?? 150) / 100)) * 60000;
    return { pickupAt, dropoffAt };
}

/**
 * 🧾 **이 확정이 그 정거장을 몇 분 밀었나 — 원인과 함께** (기사님 확정 2026-09-09).
 *
 * 기사님: *"31분이 밀린 거라면 31분이 왜 밀린 건지 그 요소들만 딱 들어갔으면 좋겠어."*
 *
 * 분은 «확정 전이 말한 도착 시각»과 «확정 후가 말한 도착 시각»의 차이 — ⑯ 의 우회 정의
 * 그대로라 카카오를 더 부르지 않는다. 원인은 **이번에 끼워 넣은 정거장 중 그 정거장보다
 * 앞에 온 것**뿐이다. 뒤에 낀 것은 그 정거장을 못 민다.
 *
 * 🔴 **«분»이 아니라 «시각»을 받는다** (2026-09-09 리뷰에서 잡힘).
 *    확정 전 경로와 확정 후 경로는 **잰 시각이 다르다** — 그 사이에 달렸으면 각자의 «0분»이
 *    다른 자리다. 분끼리 빼면 그 주행 시간이 통째로 섞인다.
 *    실측 예: 04:00 에 «+80분»(05:20), 30분 달린 뒤 04:30 에 «+65분»(05:35).
 *    분으로 빼면 −15분(빨라졌다)이지만 실제로는 **15분 늦어졌다.**
 *    `detourRows` 에서 한 번 잡은 것과 같은 클래스라, **단위를 시각으로 두어 못 틀리게 한다.**
 *
 * 🔴 **안 밀렸으면 안 적는다** — 0분을 쌓으면 이유 줄이 의미 없는 줄로 찬다.
 * 🔴 **못 잰 값이 섞이면 안 적는다** — 지어내지 않는다 (규칙 ④).
 *
 * 실물에서는 `step_arrive_*.system_reasons` 자리다.
 */
export function impactOfStop(opts: {
    /** 밀렸는지 볼 정거장 (`①하차` 같은 라벨) */
    stopLabel: string;
    /** 확정 «전» 경로가 말한 그 정거장 도착 **시각** (그 경로를 잰 시각 + 누적) */
    beforeAt: number | null | undefined;
    /** 확정 «후» 경로가 말한 그 정거장 도착 **시각** */
    afterAt: number | null | undefined;
    /** 확정 후 경로의 정거장 순서 */
    orderNow: Array<string | null>;
    /** 이번에 끼워 넣은 정거장들 */
    inserted: Array<{ label: string; name: string }>;
    causeCallId: number;
    at: number;
}): (StopImpact & { causeNames: string[] }) | null {
    const { stopLabel, beforeAt, afterAt, orderNow, inserted, causeCallId, at } = opts;
    if (beforeAt == null || afterAt == null) return null;
    const min = Math.round((afterAt - beforeAt) / 60000);
    if (min === 0) return null;
    const here = orderNow.indexOf(stopLabel);
    if (here < 0) return null;
    const causes = inserted.filter(x => {
        const i = orderNow.indexOf(x.label);
        return i >= 0 && i < here;
    });
    if (!causes.length) return null;
    const causeNames = causes.map(x => x.name);
    return { causeCallId, causeLabel: causeNames.join(' · '), min, at, causeNames };
}

/**
 * ✂️ **하차 밀림을 둘로 가른다** (기사님 지시 2026-09-09: *"① 을 갈라 적어"*).
 *
 * 기사님이 화면에서 «82분이나 돌아간다는데 이것이 사실이야?» 라고 물으신 값이다.
 * 숫자는 맞았는데 **뜻이 둘 섞여** 있었다 — 실측(2026-09-09 · 콜 넷):
 *
 * ```
 * ⑧ 탄현면 +82분  =  ⑥ 노온사동 상차가 밀린 41분   ← 앞 콜들을 먼저 처리하느라 늦게 출발
 *                    +  이 구간이 꺾인 41분        ← 노온사동→탄현면 직행 58분이 99분이 된다
 * ```
 *
 * 둘은 기사님께 다른 뜻이다 — **꺾이는 것은 기름과 시간을 진짜로 더 쓰는 것**이고,
 * 밀리는 것은 **약속 시각의 문제**다. 한 줄로 적으면 어느 쪽인지 알 수 없다.
 *
 * 🔴 «꺾인 몫»의 원인은 **상차와 하차 사이에 낀 정거장**뿐이다 — 상차 앞에 낀 것은
 *    출발을 밀었을 뿐 이 구간을 꺾지 않았다. 그래서 원인 목록도 차집합으로 가른다.
 */
export function splitDropImpact(
    vPick: (StopImpact & { causeNames: string[] }) | null,
    vDrop: (StopImpact & { causeNames: string[] }) | null,
): StopImpact[] {
    if (!vDrop) return [];
    const carried = vPick?.min ?? 0;
    const own = vDrop.min - carried;
    const rows: StopImpact[] = [];
    if (carried !== 0 && vPick) {
        rows.push({ ...vDrop, min: carried, causeLabel: `${vPick.causeLabel} 경유 — 출발이 밀렸다` });
    }
    if (own !== 0) {
        const between = vDrop.causeNames.filter(n => !(vPick?.causeNames ?? []).includes(n));
        rows.push({
            ...vDrop, min: own,
            causeLabel: between.length
                ? `${between.join(' · ')} 경유 — 이 구간이 꺾였다`
                : '이 구간이 길어졌다',
        });
    }
    return rows;
}

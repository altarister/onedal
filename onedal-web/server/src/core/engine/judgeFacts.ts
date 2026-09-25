import { cityCenter, destGainKm, destProgressRatio, haversineKm, isPickupBackward, isTrappedRegion, nearestDong, PHASE_LABEL } from '@onedal/shared';
import type { JudgeFacts, PhaseKey } from '@onedal/shared';

/**
 * 🧾 **판정이 쓸 «사실»을 모은다** (6단계)
 *
 * 새 판정 함수(`judge`)는 카카오도 DB 도 모른다 — **이미 밝혀진 사실**만 받는다.
 * 그 사실을 담는 자리가 여기다. 카카오를 부르고 적재를 세는 일은 `OrderEvaluator` 가
 * 하던 그대로 하고, **그 결과를 옮겨 담기만** 한다.
 *
 * 🔴 **새로 계산하지 않는다.** 여기서 무엇이든 다시 재면 같은 값이 두 곳에서 태어난다
 *    (규칙 ③). 이 파일에 산술이 생기면 잘못 만든 것이다.
 *
 * 🔴 **여기서 채운 사실이 곧 화면의 색이다** — `OrderEvaluator` 가 이 사실로 `judge` 를 부르고
 *    그 결과를 콜에 붙인다. 칸 하나를 빼먹으면 색이 조용히 달라진다.
 */

/**
 * 🔙 **등 뒤 상차인가** — 목적지까지 «상차 : 현위치» 를 견준다 (여유 = 상차 반경).
 *    식은 그물과 한 벌이다 (`isPickupBackward`) — 여기서 새로 만들지 않는다 (규칙 ③).
 *    셋 중 하나라도 없으면 `null` — 목적지를 안 정하셨으면 잴 수가 없다 (규칙 ④).
 */
export function pickupBackwardOf(input: {
    me: { x: number; y: number } | null;
    pickup: { x?: number | null; y?: number | null };
    goalCity: string;
    /** 여유 — 옆 동네 픽업과 GPS 흔들림을 살린다 (그물이 쓰는 값 그대로) */
    pickupRadiusKm: number;
}): boolean | null {
    if (!input.me || !input.goalCity) return null;
    if (input.pickup.x == null || input.pickup.y == null) return null;

    let goal: { lng: number; lat: number };
    try { goal = cityCenter(input.goalCity); } catch { return null; }

    return isPickupBackward(
        haversineKm({ lng: input.pickup.x, lat: input.pickup.y }, goal),
        haversineKm({ lng: input.me.x, lat: input.me.y }, goal),
        input.pickupRadiusKm,
    );
}

/**
 * 🏔️ **하차지가 «못 빠져나오는 곳»인가** — 좌표에서 시군구·읍면동을 얻어 견준다.
 *    목록과 판단은 `isTrappedRegion` 하나다 (규칙 ③). 좌표가 없으면 `null` (규칙 ④).
 */
export function trappedOf(dropoff: { x?: number | null; y?: number | null }): boolean | null {
    if (dropoff.x == null || dropoff.y == null) return null;
    const d = nearestDong({ lng: dropoff.x, lat: dropoff.y });
    return isTrappedRegion(d.region, d.name);
}

/** 첫짐 — 잡아 둔 콜이 없다. 약속·공간은 «잴 게 없다»가 된다 */
export function firstLoadFacts(input: {
    fare: number;
    /** 이 콜에 쓰는 전체 시간(접근+주행+정차). 모르면 null */
    totalMinutes: number | null;
    /** 미리보기 콜의 평소 하한가. 필터콜은 넘기지 않는다 (규칙 ⑤-1) */
    minAcceptableKrw?: number | null;
    /** ⛽🛣️ 나가는 돈 — 「돈」이 요금에서 뺀다. 모르면 `null` (규칙 ④ · shared `MoneyFacts`) */
    extraKm?: number | null;
    fuelCostPerKm?: number | null;
    tollKrw?: number | null;
    /** ⏳ 이 콜이 만드는 여유의 재료 — 타임라인이 이미 쟀다 (shared `WaitFacts`) */
    toPickupMinutes?: number | null;
    deliveryMinutes?: number | null;
    /** 💪 팔다리를 쓰는 재료 — 셈은 `timing.handMinutesOf` · `protectionMinutes` 한 곳이다 (shared `LaborFacts`) */
    handMinutes?: number | null;
    protectionMinutes?: number | null;
    /**
     * 🚚 **달리게 되는 길 전체의 «주행» 분** — 정차를 뺀 값 (shared `DriveFacts`).
     *    🔴 「돈」이 받는 분과 **다른 값**이다 — 저쪽은 «늘어난 것 + 정차»고 여기는 «전체 · 정차 없이»다.
     */
    driveMinutes?: number | null;
    /**
     * 🧭 **목적지 전진율** −1~1 — 「지리」 기준이 배수로 바꾼다. 못 쟀으면 `null` 과 까닭.
     *    잰 곳은 `destProgressOf` 하나다 (여기서 다시 재지 않는다 · 규칙 ③).
     */
    progress?: { ratio: number | null; unknownWhy: string | null; awayKm?: number | null };
    /**
     * 🧪 **형상 필터가 이미 찾아 둔 제외어** — 여기서 다시 훑지 않는다 (규칙 ③).
     *    찾는 곳은 `OrderEvaluator.runStage1ShapeFilter` 하나다.
     */
    excludedHits: string[];
    /** 🔙 등 뒤 상차인가 — 못 쟀으면 `null`. 잰 곳은 `pickupBackwardOf` 하나다 */
    pickupBackward: boolean | null;
    /** 🏔️ 하차지가 «못 빠져나오는 곳»인가 — 잰 곳은 `isTrappedRegion` 하나다 */
    trapped: boolean | null;
    tags: string[];
}): JudgeFacts {
    return {
        money: {
            fare: input.fare, extraMinutes: input.totalMinutes,
            minAcceptableKrw: input.minAcceptableKrw ?? null, firstLoad: true,
            /* ⛽🛣️ 첫짐의 «더 쓰는 거리»는 이 콜의 전체 주행이다 — 빈 차라 뺄 기준 경로가 없다 */
            extraKm: input.extraKm ?? null,
            fuelCostPerKm: input.fuelCostPerKm ?? null,
            tollKrw: input.tollKrw ?? null,
        },
        /* 💪🚚 빈 차에도 잰다 — 팔다리도 길도 짐이 실려 있는지와 무관하다 */
        labor: { handMinutes: input.handMinutes ?? null, protectionMinutes: input.protectionMinutes ?? null },
        /**
         * 🚚 **첫짐은 `extraKm` 이 곧 «달리게 되는 길 전체»다** — 빈 차라 뺄 기준 경로가 없어
         *    위 「돈」 주석대로 이 콜의 전체 주행이 그대로 들어온다. 이름만 옮겨 담는다.
         */
        drive: { driveKm: input.extraKm ?? null, driveMinutes: input.driveMinutes ?? null },
        /* ⏳ 빈 차도 잰다 — «이 콜이 시간을 얼마나 남겨 주나»는 짐이 있든 없든 같은 질문이다 */
        wait: { toPickupMinutes: input.toPickupMinutes ?? null, deliveryMinutes: input.deliveryMinutes ?? null },
        /* ☎️ 빈 차는 흔들 남이 없다 */
        calls: { count: null, hasExistingCalls: false },
        promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
        space: { freePct: null, hasLoad: false },
        nature: { conflicts: [], excludedHits: input.excludedHits, hasLoad: false },
        geography: {
            firstLoad: true,
            progressRatio: input.progress?.ratio ?? null,
            unknownWhy: input.progress?.unknownWhy ?? '전진율을 안 넘겼습니다',
            awayKm: input.progress?.awayKm ?? null,
            pickupBackward: input.pickupBackward,
            trapped: input.trapped,
        },
        notes: [...input.tags],
    };
}

/**
 * 🎯 **판정의 목적지 도착 반경** (3km).
 * 콜 필터의 탐색 반경(`destinationRadiusKm`, 보통 20~25km)과 분리한다 (설계서 §9 10번).
 * 탐색 반경(22km)을 그대로 쓰면 서울 외곽(복정·송파)에서 강남으로 진입하는 첫짐이 전부 «도착»으로
 * 오판되어 전진 배수(1.5~2.0배)가 마비되는 사고(04:54 복정→대치 36점 똥콜)가 났다.
 * 판정은 도심 중심 3km 이내에 진짜 도달했을 때만 «도착»으로 인정한다.
 */
export const DEST_ARRIVED_RADIUS_KM = 3;

/**
 * 🧭 **첫짐의 전진율을 잰다 — 이 콜로 목적지에 얼마나 가까워지나** (설계서 §4-3)
 *
 * 세 점이 필요하다: **지금 자리**(`originOf`) · **하차지**(지오코딩 결과) · **목적지**(`goalCityOf` 의 시내).
 * 🔴 하나라도 없으면 **지어내지 않고 까닭을 적는다** — 그때 배수는 1.0 이다 (규칙 ④ · ⑤-2).
 * 🔴 **셈은 `destProgressRatio` 한 곳**에 있다. 여기서는 점 셋을 모아 넘기기만 한다 (규칙 ③).
 *
 * ⚠️ **목적지 반경 안에 있으면 안 잰다** — 이미 도착했으니 «전진할 것»이 없다.
 *    그때도 배수 1.0 이라, 목적지 둘레의 관내콜이 방향 때문에 깎이지 않는다.
 */
export function destProgressOf(input: {
    me: { x: number; y: number } | null;
    dropoff: { x?: number | null; y?: number | null };
    goalCity: string;
    /** 목적지 반경(km) — 이 안에 있으면 전진을 재지 않는다 (판정은 DEST_ARRIVED_RADIUS_KM 3km 사용) */
    destinationRadiusKm?: number | null;
}): { ratio: number | null; unknownWhy: string | null; awayKm: number | null } {
    const no = (why: string) => ({ ratio: null, unknownWhy: why, awayKm: null });
    if (!input.me) return no('내 위치를 모릅니다');
    if (!input.goalCity) return no('목적지 미설정');
    if (input.dropoff.x == null || input.dropoff.y == null) return no('하차지 좌표 미확인');

    let goal: { lng: number; lat: number };
    try { goal = cityCenter(input.goalCity); } catch { return no(`목적지 좌표 미확인 (${input.goalCity})`); }

    const me = { lng: input.me.x, lat: input.me.y };
    const radiusKm = input.destinationRadiusKm ?? 0;
    if (radiusKm > 0 && haversineKm(me, goal) <= radiusKm) return no(`목적지 반경 ${radiusKm}km 안입니다`);

    const drop = { lng: input.dropoff.x, lat: input.dropoff.y };
    const ratio = destProgressRatio(me, drop, goal);
    // 🛫 나누기 **전의** 값 — 전진율은 이걸 움직인 거리로 나눠 «얼마나»를 잃는다 (규칙 ③)
    const awayKm = -destGainKm(me, drop, goal);
    return ratio == null ? no('상차지와 하차지가 같은 자리입니다') : { ratio, unknownWhy: null, awayKm };
}

/**
 * ⏰ **깨지는 약속을 «무엇이 · 몇 분»으로 옮긴다** — 분은 `deriveRouteTimeline` 이 이미 쟀다.
 *    여기서 다시 세지 않는다 (규칙 ③). 문장도 이 목록 하나에서 나온다 — 판정과 로그가 같은 말을 한다.
 */
export function lateStopsOf(
    late: Array<{ orderId: string; stopType: string; lateMinutes: number }>,
    nameOf: (orderId: string) => string,
): Array<{ label: string; lateMinutes: number | null }> {
    return late.map(e => ({
        label: `${nameOf(e.orderId)} ${e.stopType === 'pickup' ? '상차' : '하차'} 약속`,
        lateMinutes: e.lateMinutes,
    }));
}

/** 합짐 — 이미 실린 짐이 있다. 다섯 기준을 다 잰다 (지리는 가중치 0 이라 안 본다) */
export function mergeFacts(input: {
    fare: number;
    /** 붙여서 **늘어나는** 시간(한계 주행 + 늘어난 정차). 모르면 null */
    extraMinutes: number | null;
    /**
     * ⛽🛣️ **붙여서 늘어나는 거리·통행료와 km당 기름값** — 「돈」이 요금에서 뺀다.
     *    시간과 **같은 규약**이다: 합짐은 «늘어나는 것»만 센다. 모르면 `null` (규칙 ④).
     */
    extraKm?: number | null;
    fuelCostPerKm?: number | null;
    tollKrw?: number | null;
    /** ⏳ 이 콜이 만드는 여유의 재료 — 타임라인이 이미 쟀다 (shared `WaitFacts`) */
    toPickupMinutes?: number | null;
    deliveryMinutes?: number | null;
    /** 💪 팔다리를 쓰는 재료 — 셈은 `timing.handMinutesOf` · `protectionMinutes` 한 곳이다 (shared `LaborFacts`) */
    handMinutes?: number | null;
    protectionMinutes?: number | null;
    /**
     * 🚚 **달리게 되는 길 전체의 «주행» 분** — 정차를 뺀 값 (shared `DriveFacts`).
     *    🔴 「돈」이 받는 분과 **다른 값**이다 — 저쪽은 «늘어난 것 + 정차»고 여기는 «전체 · 정차 없이»다.
     */
    driveMinutes?: number | null;
    /**
     * 🚚 **이 콜을 잡으면 달리게 되는 길 전체의 거리(km)** — 「돈」의 `extraKm`(늘어난 것)과 다른 값이다.
     *    잰 곳은 카카오 병합 경로 하나다 (`OrderEvaluator` · 규칙 ③).
     */
    driveKm?: number | null;
    /**
     * 🛣️ **이 콜 때문에 «길을 벗어나는» 분** — 「돈」의 우회 감쇠만 본다.
     *    잰 곳은 병합 경로 구간을 손에 든 `OrderEvaluator` 하나다 (규칙 ③).
     *    안 실어 주면 「돈」이 `extraMinutes` 를 그대로 본다 (되돌리는 길).
     */
    offRouteMinutes?: number | null;
    /** ☎️ 전화해 약속을 미뤄야 할 기존 콜 정거장 수 — 세는 곳은 부르는 쪽 하나다 (shared `CallsFacts`) */
    callsToMake?: number | null;
    /** 붙인 뒤 남는 가장 빠듯한 여유(분). 잴 약속이 없으면 null */
    bufferAfterMin: number | null;
    /** 실었을 때 남는 자리(%). 못 세면 null. 🔴 음수를 0 으로 자르지 않는다 — 자르면 부족이 안 보인다 */
    freePct: number | null;
    /** 그 적재량을 어떻게 알았나 — 확정값(신고·실측)일 때만 색을 덮는다 */
    confidence?: 'CONFIRMED' | 'DECLARED' | 'ESTIMATED' | null;
    /** 같이 못 싣는 조합 (성질) */
    conflicts: Array<[string, string]>;
    /** 🧪 형상 필터가 이미 찾아 둔 제외어 — 여기서 다시 훑지 않는다 (규칙 ③) */
    excludedHits: string[];
    /**
     * ⏰ **깨지는 약속과 몇 분인지** — 이미 잰 값을 받는다 (`deriveRouteTimeline` 의 `lateMinutes`).
     *    분을 모르면 `null` — 지어내지 않는다 (규칙 ④).
     */
    lateStops: Array<{ label: string; lateMinutes: number | null }>;
    /**
     * 🏗️ **어느 국면에서 재나** — 정차 중(`merge`) ↔ 주행 중(`drive`).
     *    가르는 곳은 `resolvePhaseKey` 하나다 (규칙 ③). 지금은 딱지로만 말하고
     *    잣대는 안 가른다 — 그건 Step 6·7 이다.
     */
    phase: PhaseKey;
    tags: string[];
}): JudgeFacts {
    return {
        money: {
            fare: input.fare, extraMinutes: input.extraMinutes, firstLoad: false,
            extraKm: input.extraKm ?? null,
            fuelCostPerKm: input.fuelCostPerKm ?? null,
            tollKrw: input.tollKrw ?? null,
            /* 🛣️ 우회 감쇠만 보는 «길을 벗어나는 분» — 시급의 분모는 위 `extraMinutes` 그대로다 */
            offRouteMinutes: input.offRouteMinutes ?? null,
        },
        /* 💪🚚⏳ 「돈」·「약속」이 받는 값과 **같은 것**을 넘긴다 — 여기서 다시 재지 않는다 (규칙 ③) */
        labor: { handMinutes: input.handMinutes ?? null, protectionMinutes: input.protectionMinutes ?? null },
        drive: { driveKm: input.driveKm ?? null, driveMinutes: input.driveMinutes ?? null },
        wait: { toPickupMinutes: input.toPickupMinutes ?? null, deliveryMinutes: input.deliveryMinutes ?? null },
        calls: { count: input.callsToMake ?? null, hasExistingCalls: true },
        promise: { hasExistingCalls: true, lateStops: input.lateStops, bufferAfterMin: input.bufferAfterMin },
        space: { freePct: input.freePct, hasLoad: true, confidence: input.confidence ?? null },
        nature: { conflicts: input.conflicts, excludedHits: input.excludedHits, hasLoad: true },
        /**
         * 🧭 **국면을 실어 준다 — 배수는 안 붙지만 까닭은 사실대로 적혀야 한다.**
         *    안 실으면 「지리」가 «전진율을 안 받았습니다» 라고 적어, 합짐인데 «재료가 빠졌나»로 읽힌다.
         *    합짐의 지리는 원래 안 재는 것이다 — 우회 시급이 이미 센다.
         */
        geography: { firstLoad: false, progressRatio: null },
        // 🏗️ 잰 쪽이 «어느 국면으로 쟀는지» 말한다 — 이름은 `PHASE_LABEL` 이 원천이다
        notes: [PHASE_LABEL[input.phase], ...input.tags],
    };
}

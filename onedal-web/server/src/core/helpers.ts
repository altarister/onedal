/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { isTerminal, cargoPoints, VEHICLE_CAPACITY, normalizeVehicleType,
         computeSlackMinutes, allowedDetourMinutes, findTagConflicts,
         computeStopTiming, deriveCallTiming, DEFAULT_DEADLINE_RULES } from '@onedal/shared';
import type { MyOrder, CargoReport, CapacityConfidence, DwellUnknown, DeadlineRules } from '@onedal/shared';
import { OrderRepository } from '../repositories/OrderRepository';

/**
 * 종료되지 않은(활성) 콜만 필터링합니다.
 *
 * "종결"의 정의는 `@onedal/shared` 에만 있다.
 * 예전에는 `core/constants.ts` 가 같은 목록을 Set 으로 한 벌 더 갖고 있어,
 * shared 에 `ORDER_DELIVERED` 를 추가해도 여기에 반영되지 않았다.
 * 하차한 짐이 계속 적재 중으로 세어졌다 (이슈 JJ).
 */
export function getActiveCalls(session: { myOrders: MyOrder[] }): MyOrder[] {
    return session.myOrders.filter(c => !isTerminal(c.status));
}

/**
 * [Phase 8.4] 지금 실려 있는 짐의 **적재 점수와 확신도**.
 *
 * 콜마다 근거가 다르다. 셋을 섞어 쓰되, 하나라도 추정이면 전체를 추정으로 본다
 * — 실제로 안 들어갈 위험이 남아 있는데 "확정"이라고 말하면 안 된다.
 *
 *   현장 실측(ACTUAL)  → 확정
 *   통화 신고(DECLARED) → 신고
 *   없음               → 차종으로 추정 (1t 콜이면 30점을 다 먹는다고 가정)
 */
export function computeLoadedPoints(
    calls: MyOrder[],
    myVehicle: string,
    reportsByOrder: Map<string, CargoReport[]>,
): { points: number; confidence: CapacityConfidence } {
    let points = 0;
    let anyEstimated = false;
    let anyDeclaredOnly = false;

    for (const c of calls) {
        const reports = reportsByOrder.get(c.id) || [];
        // 상차지 기준. 하차지 신고는 "내릴 때 무엇이 나가는가"라 적재량과 같다
        const actual = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL');
        const declared = reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED');
        const chosen = actual || declared;

        // 🔴 2026-08-11 — 여기 관문이 `chosen?.sizeClass` 였다.
        //    `sizeClass`(소·중·대)는 단위를 파레트·라면박스로 바꾸기 **전의 옛 필드**이고
        //    화면(StopCallSheet)은 `unit` 만 보낸다. 그래서 이 관문이 영원히 닫혀
        //    **기사님이 신고한 짐 양을 통째로 무시하고** 늘 차종 추정으로 떨어졌다.
        //    합짐 2건이면 만재로 추정해 허용 차종이 [오토바이] 하나만 남았다 —
        //    Phase 8.4 가 "놓치던 합짐 기회를 연다"고 한 것의 정확히 반대다.
        //
        //    관문을 **필드가 아니라 점수로** 건다. cargoPoints 는 이미 unit 을 우선 보고
        //    옛 sizeClass 로 폴백하므로, 단위 체계를 또 바꿔도 여기는 안 깨진다.
        const reported = chosen ? cargoPoints(chosen) : 0;

        if (reported > 0) {
            points += reported;
            if (!actual) anyDeclaredOnly = true;
        } else {
            points += VEHICLE_CAPACITY[normalizeVehicleType(c.vehicleType || myVehicle) || myVehicle] ?? 0;
            anyEstimated = true;
        }
    }

    const confidence: CapacityConfidence =
        anyEstimated ? 'ESTIMATED' : anyDeclaredOnly ? 'DECLARED' : 'CONFIRMED';
    return { points, confidence };
}

/**
 * [Phase 8.4] 지금 실린 짐들의 마감을 지키면서 **추가로 우회할 수 있는 시간**(분).
 *
 * 하나라도 지각하면 안 되므로 **가장 촉박한 짐 기준**이다.
 * 마감을 아는 짐이 없으면 `null` — 호출부가 기존 고정 상수로 폴백한다.
 * (모르는 것을 "여유가 많다"고 가정하면 지각한다)
 */
export function computeAllowedDetour(
    userId: string,
    session: { myOrders: MyOrder[] },
    nowMs: number = Date.now(),
    unk?: DwellUnknown,
    /** 마감을 만드는 규칙 — 기사님이 「판정 기준」 탭에서 바꾸신 값 */
    rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
): number | null {
    const slacks = getActiveCalls(session).map(call => {
        const reports = OrderRepository.getCargoReports(call.id);
        const drop = reports.find(r => r.stopType === 'dropoff' && r.deadlineAt);
        const pick = reports.find(r => r.stopType === 'pickup' && r.deadlineAt);
        const timing = getStopTiming(call.id, unk);

        /**
         * 🔴 **마감이 어느 정거장의 것이냐에 따라 빼는 시간이 다르다** (2026-08-16 실측).
         *
         * 예전에는 어느 마감이든 **전체 주행**(상차지→하차지)을 뺐다. 그래서 기사님이
         * `목적지콜` 의 상차지와 통화해 *"05:49까지 상차지 도착"* 을 넣으시자,
         * 서버가 거기서 전체 주행 82분을 빼 **여유 −71분**을 만들었다 —
         * *"상차하러 가는 데 하차까지의 시간이 걸린다"* 고 센 셈이다.
         * 그 결과 **그 뒤로 온 `노선 합짐1 후보콜` 이 전부 막혔다.**
         *
         *   하차 약속 → 하차까지 남은 **전부** (주행 + 상하차 두 번)
         *   상차 약속 → **상차지까지 가는 시간만** (approach)
         */
        if (drop?.deadlineAt) {
            return computeSlackMinutes(drop.deadlineAt, (call.totalDurationMin || 0) + timing.totalDwell, nowMs);
        }

        /**
         * 🔴 **통화 마감이 없어도 추정 마감으로 센다** (기사님 2026-08-16).
         *
         * 예전에는 통화 기록에 마감이 없으면 `null` 을 돌려주고, 호출부가 `90분` 상수로 때웠다.
         * 기사님: *"여유 90분으로 퉁치니 문제가 발생하는 거야."*
         * **여유는 입력값이 아니라 마감에서 계산해 나오는 값**이다 —
         * 마감이 없으면 **규칙으로 만든다**(잡은 시각+60분 → 상차 마감 → +주행+30분 → 하차 마감).
         */
        if (!drop?.deadlineAt && !pick?.deadlineAt) {
            const t = deriveCallTiming(call as any, reports, [], nowMs, rules);
            if (t.dropoffDeadlineAt) {
                return computeSlackMinutes(
                    t.dropoffDeadlineAt, (call.totalDurationMin || 0) + timing.totalDwell, nowMs);
            }
            return null;   // 잡은 시각도 주행도 모른다 — 셀 근거가 없다
        }

        if (pick?.deadlineAt) {
            /**
             * 🔴 **이미 상차한 콜의 상차 약속은 지난 일이다.** 볼 것이 없다 —
             *    남은 일은 하차뿐이고, 그 마감은 위에서 봤다 (`isAlreadyLoaded` 와 같은 줄기).
             */
            if (call.status === 'ORDER_PICKED_UP') return null;

            /**
             * ⚠️ 접근 시간을 모르면 **`0` 으로 가정하지 않는다** — 그러면 "이미 상차지에 서 있다"는
             *    뜻이 되어 여유를 크게 잡고 지각한다. 모르면 `null`(모른다)이다 (규칙 ④).
             */
            const approach = call.approachDurationMin;
            if (approach === undefined || approach === null) return null;
            return computeSlackMinutes(pick.deadlineAt, approach + timing.pickupDwell, nowMs);
        }

        return null;   // 이 콜은 마감을 모른다
    });
    return allowedDetourMinutes(slacks);
}

/** 한 콜의 상·하차 정차 시간 (신고된 단위·수량·방법 기준) */
export function getStopTiming(orderId: string, unk?: DwellUnknown) {
    const reports = OrderRepository.getCargoReports(orderId);
    const pick = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'pickup');
    const drop = reports.find(r => r.stopType === 'dropoff' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'dropoff');
    return computeStopTiming(
        pick ? { handling: pick.handling, unit: pick.unit, quantity: pick.quantity } : undefined,
        drop ? { handling: drop.handling } : undefined,
        unk,
    );
}

/**
 * 이 콜을 합짐으로 추가할 때 **실제로 늘어나는 시간**(분).
 *
 * 카카오가 주는 `timeDiffMin` 은 **주행 delta 뿐**이다.
 * 상차·하차를 한 번씩 더 하게 되므로 그 정차 시간을 반드시 더해야 한다.
 * 수작업 화물이면 여기서만 40~60분이 붙는다.
 */
export function totalDetourCost(driveDiffMin: number, incomingOrderId: string, unk?: DwellUnknown): {
    total: number; drive: number; dwell: number; hasUnknown: boolean;
} {
    const t = getStopTiming(incomingOrderId, unk);
    return {
        total: Math.round(driveDiffMin + t.totalDwell),
        drive: driveDiffMin,
        dwell: t.totalDwell,
        hasUnknown: t.hasUnknown,
    };
}

/** 실린 화물과 새 콜이 함께 실을 수 없는 조합인지 (위험물 + 식료품 등) */
export function findLoadConflicts(
    userId: string,
    session: { myOrders: MyOrder[] },
    incomingOrderId: string,
): Array<[string, string]> {
    const incomingTags = OrderRepository.getCargoReports(incomingOrderId)
        .flatMap(r => r.tags || []);
    if (incomingTags.length === 0) return [];

    const loadedTags = getActiveCalls(session)
        .filter(c => c.id !== incomingOrderId)
        .flatMap(c => OrderRepository.getCargoReports(c.id).flatMap(r => r.tags || []));
    if (loadedTags.length === 0) return [];

    // 중복 제거해서 같은 경고가 여러 번 뜨지 않게
    const seen = new Set<string>();
    return findTagConflicts(loadedTags, incomingTags).filter(([a, b]) => {
        const k = `${a}|${b}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * [2026-08-10] 관제탑으로 보낼 오더 스냅샷. **진행 중과 종료된 것을 나눠서** 보낸다.
 *
 * 🔴 예전에는 `Array.from(pendingOrdersData.values())` 를 통째로 보냈다.
 *    한 배열에 진행 중 콜과 취소·완료된 콜이 섞여 있어서, **받는 쪽마다 `isTerminal` 을
 *    기억해야** 했다. 잊으면 조용히 틀린다 — 2026-08-10 하루에만 세 번 났다.
 *      AA 적재 7건으로 표시 · BB 취소한 콜을 재탐색 · DD 취소분까지 운임 합산
 *
 *    "기억해야 하는 규칙"을 "고를 수 없는 구조"로 바꾼다. 나눠서 보내면 잊을 수가 없다.
 *
 * ⚠️ 페이로드를 만드는 곳은 **여기 하나뿐**이어야 한다.
 *    (예전에는 네 군데가 각자 `Array.from(...)` 을 했다)
 */
export function buildOrderSync(session: { myOrders: MyOrder[]; pendingOrdersData: Map<string, any> }) {
    // 🔴 세션은 같은 콜을 **두 곳**에 들고 있다.
    //    pendingOrdersData — 평가 중 + 확정된 콜의 캐시
    //    myOrders          — 확정된 내 콜 (모든 판정 로직이 이걸 본다)
    //
    //    예전에는 이 함수가 pendingOrdersData 만 읽었다. 그런데 `completeOrder` 와
    //    `startTwoTrack` 은 myOrders 만 갱신한다 → **관제탑에 낡은 상태가 갔다.**
    //    (하차 완료했는데 카드에 "상차 완료"로 남아 있던 원인)
    //
    //    확정된 콜은 myOrders 가 진실이므로 나중에 덮어쓴다.
    const merged = new Map<string, any>();
    for (const o of session.pendingOrdersData.values()) merged.set(o.id, o);
    for (const o of session.myOrders) merged.set(o.id, o);

    const all = Array.from(merged.values());

    /**
     * 🔴 **종료된 콜의 경로(routePolyline)는 보내지 않는다** (2026-08-14).
     *
     * 관제탑은 진행 중인 콜의 경로만 그린다(`PinnedRoute` 의 `liveRoute`). 종료된 콜의
     * 경로는 **어디에도 쓰지 않는데** 매초 실려 나갔다 — 실측에서 종료 10건이 119KB 였고
     * 그중 한 건이 폴리라인 2384점이었다.
     *
     * 이게 1초마다 나가고, 관제웹은 그걸 다시 `JSON.stringify` 로 비교했다.
     * **초당 474KB 의 문자열이 만들어지고 버려졌다** — 브라우저가 시간이 지나면 죽은 이유다.
     * 게다가 종료 콜은 하루 종일 쌓이기만 하므로 **오후로 갈수록 나빠졌다.**
     */
    const stripPolyline = (o: any) => {
        if (!o?.routePolyline?.length) return o;
        const { routePolyline, ...rest } = o;
        return rest;
    };

    return {
        active: all.filter(o => !isTerminal(o.status)),
        terminated: all.filter(o => isTerminal(o.status)).map(stripPolyline),
    };
}

/**
 * 오더 상태를 바꾼다. **두 메모리를 반드시 함께** 갱신한다.
 *
 * 직접 `order.status = ...` 로 쓰면 한쪽만 바뀌고, 그 순간부터
 * "판정은 종료됐는데 화면은 진행 중"인 상태가 된다.
 * 상태를 바꾸는 곳은 이 함수 하나만 쓴다.
 */
export function setOrderStatus(
    session: { myOrders: MyOrder[]; pendingOrdersData: Map<string, any> },
    orderId: string,
    status: string,
): boolean {
    let found = false;
    const inMy = session.myOrders.find(o => o.id === orderId);
    if (inMy) { inMy.status = status as any; found = true; }
    const cached = session.pendingOrdersData.get(orderId);
    if (cached) { cached.status = status; found = true; }
    return found;
}

/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { isTerminal, cargoPoints, VEHICLE_CAPACITY, normalizeVehicleType,
         computeSlackMinutes, allowedDetourMinutes, findTagConflicts,
         computeStopTiming } from '@onedal/shared';
import type { MyOrder, CargoReport, CapacityConfidence } from '@onedal/shared';
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

        if (chosen?.sizeClass) {
            points += cargoPoints(chosen);
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
): number | null {
    const slacks = getActiveCalls(session).map(call => {
        const reports = OrderRepository.getCargoReports(call.id);
        // 마감은 하차 기준이다. 하차 마감이 없으면 상차 마감이라도 본다
        const drop = reports.find(r => r.stopType === 'dropoff' && r.deadlineAt);
        const pick = reports.find(r => r.stopType === 'pickup' && r.deadlineAt);
        const deadline = drop?.deadlineAt || pick?.deadlineAt;

        // 🔴 주행 시간만 세면 안 된다. 수작업 상하차 두 번이면 한 시간이 그냥 사라진다.
        //    그걸 빼먹으면 "여유 60분"이라 판단하고 우회했다가 지각한다.
        const timing = getStopTiming(call.id);
        return computeSlackMinutes(deadline, (call.totalDurationMin || 0) + timing.totalDwell, nowMs);
    });
    return allowedDetourMinutes(slacks);
}

/** 한 콜의 상·하차 정차 시간 (신고된 단위·수량·방법 기준) */
export function getStopTiming(orderId: string) {
    const reports = OrderRepository.getCargoReports(orderId);
    const pick = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'pickup');
    const drop = reports.find(r => r.stopType === 'dropoff' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'dropoff');
    return computeStopTiming(
        pick ? { handling: pick.handling, unit: pick.unit, quantity: pick.quantity } : undefined,
        drop ? { handling: drop.handling } : undefined,
    );
}

/**
 * 이 콜을 합짐으로 추가할 때 **실제로 늘어나는 시간**(분).
 *
 * 카카오가 주는 `timeDiffMin` 은 **주행 delta 뿐**이다.
 * 상차·하차를 한 번씩 더 하게 되므로 그 정차 시간을 반드시 더해야 한다.
 * 수작업 화물이면 여기서만 40~60분이 붙는다.
 */
export function totalDetourCost(driveDiffMin: number, incomingOrderId: string): {
    total: number; drive: number; dwell: number; hasUnknown: boolean;
} {
    const t = getStopTiming(incomingOrderId);
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
    const all = Array.from(session.pendingOrdersData.values());
    return {
        active: all.filter(o => !isTerminal(o.status)),
        terminated: all.filter(o => isTerminal(o.status)),
    };
}

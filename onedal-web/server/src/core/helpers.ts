/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { isTerminal, cargoPoints, VEHICLE_CAPACITY, normalizeVehicleType,
         computeSlackMinutes, allowedDetourMinutes, findTagConflicts } from '@onedal/shared';
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
        return computeSlackMinutes(deadline, call.totalDurationMin || 0, nowMs);
    });
    return allowedDetourMinutes(slacks);
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

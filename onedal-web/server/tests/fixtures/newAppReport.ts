import { baseCallShapeOf } from '@onedal/shared';

/**
 * 📦 **옛 양식 보고 → 새 원달앱 보고(기본 콜 + 봉투)** (계획서 F2-b · F2-c 준비) — 원달앱은 이제 order 를 안 보낸다.
 * 시험이 적기 쉬운 평평한 콜을 받아, 원달앱 최소 기본 콜과 같은 규칙(평평 칸을 묶음으로 · 요금은 «옛 요금» 줄)으로 바꾼다.
 * 갈래 · 원문 · 시각 · 좌표는 봉투(report)로 간다. 옛 원달앱 길을 일부러 시험할 때는 쓰지 않는다.
 * 🔴 원달앱 `minimalOf` 와 다른 점: 목록 동(«독산동»)도 상세 주소(addressDetail)에 둔다 — 원달앱은 전체 주소만 거기 두고 동은 목록 지역(listRegion)에. F3-b 전에 맞춘다.
 */
export function newAppReport<T extends { order: Record<string, any>; targetApp?: string }>(body: T): Omit<T, 'order'> & { baseCall: Record<string, unknown>; report: Record<string, unknown> } {
    const { order, ...rest } = body;
    const { type, rawText, timestamp, pickupX, pickupY, dropoffX, dropoffY, ...flat } = order;
    return {
        ...rest,
        /* 배차망은 보고에 있는 것만 — 지어내 채우면 서버 기억(/confirm 이 남긴 배차망)을 덮는다 */
        baseCall: { id: order.id, targetApp: body.targetApp ?? order.targetApp, ...baseCallShapeOf(flat) },
        report: { type, rawText, timestamp, pickupX, pickupY, dropoffX, dropoffY },
    };
}

import { deriveRouteTimeline, derivationInputsOf, isTerminal } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { buildOrderSync } from "../core/helpers";
import { stepRecordsOf, dwellLedgerFor } from "./stepSeeder";
import type { RouteTl } from "./stepSeeder";

/**
 * 🧭 **경로가 아는 시각을 시딩에 먹인다** (기사님 실측 — 합짐 예측 없음).
 * 파생은 `deriveRouteTimeline` 한 곳이다 (규칙 ③) — 여기서는 부르기만 한다.
 * 실패하면 undefined — 시딩은 콜 단독 값으로 폴백한다 (경로를 몰라도 죽지 않는다).
 */
export function routeTlOf(userId: string): RouteTl | undefined {
    try {
        const session = getUserSession(userId);
        const sync = buildOrderSync(session);
        if (!sync.routeStops.length) return undefined;
        const active = session.myOrders.filter((o: any) => !isTerminal(o.status));
        // ⏱️ 판정 기준 탭의 시간 4칸 → 파생 입력, 조립은 derivationInputsOf 한 곳 (관제웹과 같은 함수)
        const cfg = session.judgment;
        const inputs = cfg ? derivationInputsOf(cfg) : undefined;
        const dwellLedgerOf = (id: string) => dwellLedgerFor(id);
        return deriveRouteTimeline(sync.routeStops as any, active as any,
            id => stepRecordsOf(id).reports as any,       // 🔄 파생 치환 ② — 새 장부가 재료
            id => stepRecordsOf(id).milestones as any,
            Date.now(), sync.routeComputedAt, inputs?.rules, inputs?.unk, dwellLedgerOf);
    } catch { return undefined; }
}

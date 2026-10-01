import type { IntelRow } from "@onedal/shared";
import db from "../db";

/**
 * 🗂️ **원장(intel) 최근 N 줄 · 총수 — 한 곳** — 관제웹 현황판(/api/sim/intel · 개발 빌드)과 운영센터 현황판(/api/ops/board/intel)이 같이 쓴다.
 * 리스트 화면이 준 것을 그대로 낸다 — 해석하지 않는다(sim.ts 주석). userId 를 주면 그 회원 줄만(intel.user_id).
 * «전부»가 아니라 «최근 N»이다 — 화면이 그렇게 말할 수 있게 총수를 함께 낸다.
 */
export function intelRowsOf(opts: { userId?: string | null; limit: number }): { rows: IntelRow[]; total: number } {
    const where = opts.userId ? 'WHERE user_id = ?' : '';
    const args = opts.userId ? [opts.userId] : [];
    /**
     * 📋 **리스트 화면이 준 것을 그대로 낸다** (기사님 지시).
     *    검산이 «못 잰 축»으로 적던 **차종·배송거리**가 여기서 나간다 —
     *    앱은 늘 보내고 있었고 서버 INSERT 가 버리던 것이다 (`db.ts` intel 주석).
     * 🔴 **망마다 다른 칸을 만들지 않는다** — 안 주는 망은 null 이고 `targetApp` 이 답한다.
     *    `scheduleText` 는 «급송·낼09시» 원문 그대로다. **여기서 해석하지 않는다** —
     *    무엇으로 나눌지는 실제로 오는 말을 세어 본 뒤 정한다 (규칙 ⑤-4 ②).
     */
    const rows = db.prepare(
        `SELECT id, type, pickup, dropoff, fare, timestamp, device_id, targetApp,
                itemSize, pickupDistanceKm, tagsText,
                vehicleType, deliveryDistanceKm, scheduleText, postTime, rawText,
                pickupX, pickupY, dropoffX, dropoffY, verdict
           FROM intel ${where}
          ORDER BY id DESC
          LIMIT ?`
    ).all(...args, opts.limit) as IntelRow[];
    const total = (db.prepare(`SELECT COUNT(*) as c FROM intel ${where}`).get(...args) as { c: number }).c;
    return { rows, total };
}

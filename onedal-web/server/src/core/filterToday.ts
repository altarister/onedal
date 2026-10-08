/**
 * 🔍 **오늘 «적용»한 콜 필터 값 — 적고, 오늘 줄에서 읽는다** (기사님 «가»).
 *
 * 🔴 **쓰는 곳은 `filterManager.applyWebFilter` 하나다** — 관제웹 «적용»과 «서버 저장»이 둘 다 그리로 간다.
 * 🔴 **오늘 줄만 보는 판단은 읽는 함수 안에 있다** — 부르는 쪽에 안 미룬다 (같은 모양: `callTargetEvents.callTargetToday`).
 * 날짜가 다른 줄은 읽지 않을 뿐 지우지 않는다 — 다음 «적용»이 갈아 쓴다.
 */
import db from "../db";
import type { AutoDispatchFilter } from "@onedal/shared";

type TodayValues = Partial<AutoDispatchFilter>;

/**
 * 같은 날이면 칸을 덧붙이고(앞서 적용한 칸이 남는다), 날이 바뀌었으면 갈아 쓴다.
 * `sameAsBase`(💾 저장 · ⚙️ 설정 탭 저장)면 **보낸 칸만** 오늘 줄에서 뺀다 — 그 칸은 평소 설정이 답이고, 안 보낸 칸의 «적용» 값은 남는다.
 * 📏 잰 거리(`radiusDistanceKm`)는 적지 않는다 — 기사님 값이 아니라 «다시 재라»는 신호다(서버가 재서 채운다).
 */
export function recordFilterToday(userId: string, day: string, changes: TodayValues, nowMs: number, sameAsBase = false): void {
    const values: TodayValues = { ...changes };
    delete values.radiusDistanceKm;
    const row = db.prepare(`SELECT day, values_json FROM user_filter_today WHERE user_id = ?`)
        .get(userId) as { day: string; values_json: string } | undefined;
    const kept: TodayValues = row?.day === day ? parsed(row.values_json) : {};
    if (sameAsBase) for (const k of Object.keys(changes)) delete (kept as Record<string, unknown>)[k];
    db.prepare(`
        INSERT INTO user_filter_today (user_id, day, values_json, applied_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET day = excluded.day, values_json = excluded.values_json, applied_at = excluded.applied_at
    `).run(userId, day, JSON.stringify(sameAsBase ? kept : { ...kept, ...values }), new Date(nowMs).toISOString());
}

/** 그 영업일(`day`)에 적용한 값 — 줄이 없거나 날이 다르면 빈 값 */
export function filterTodayOf(userId: string, day: string): TodayValues {
    try {
        const row = db.prepare(`SELECT day, values_json FROM user_filter_today WHERE user_id = ?`)
            .get(userId) as { day: string; values_json: string } | undefined;
        return row?.day === day ? parsed(row.values_json) : {};
    } catch (e) {
        /* 표를 못 읽으면 평소 설정으로 계속한다 — 세션 만들기를 막지 않는다. 기사님이 다시 «적용»하면 된다 */
        console.error(`🔍 [오늘 필터 읽기] 실패 — 평소 설정으로 계속:`, (e as Error).message);
        return {};
    }
}

function parsed(json: string): TodayValues {
    try {
        const v = JSON.parse(json);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch { return {}; }
}

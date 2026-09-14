/**
 * 🧭 **복귀 켬·끔 — 바꾼 일을 적고, 오늘 줄에서 지금 상태를 읽는다** (기사님 확정 2026-09-15 · 버그 대장 #131 ·
 *    `docs/지금/필터.md` «복귀 켬 — 규칙 ⑤-4 의 다섯»).
 *
 * 🔴 **쓰는 곳은 `dispatchEngine.setCallTarget` 하나다** — 기사님 버튼(`driver`)과 자동 순환(`auto`)이 둘 다 그리로 간다.
 * 🔴 **오늘 줄만 보는 판단은 읽는 함수 안에 있다** — 부르는 쪽에 안 미룬다 (선례 `gpsTrackStore.lastTrackPointOf`).
 * 판단 자체는 순수 함수 `callTargetOfDay`(shared) — 여기서는 읽고 쓰기만 한다.
 */
import db from "../db";
import { callTargetOfDay } from "@onedal/shared";
import type { CallTargetEvent } from "@onedal/shared";

/** 한 번에 읽는 줄 수 — 하루에 켜고 끄는 일은 손가락 수를 안 넘는다. 넘쳐도 최근 줄이 오늘 줄이다 */
const RECENT_EVENTS = 50;

export function recordCallTarget(userId: string, target: 'DEST' | 'HOME', by: CallTargetEvent['by'], nowMs: number): void {
    db.prepare(`INSERT INTO call_target_events (user_id, target, at, by) VALUES (?, ?, ?, ?)`)
        .run(userId, target, new Date(nowMs).toISOString(), by);
}

export function callTargetToday(userId: string, nowMs: number): { target: 'DEST' | 'HOME'; homeOnAt: string | null } {
    try {
        const rows = db.prepare(
            `SELECT target, at, by FROM call_target_events WHERE user_id = ? ORDER BY at DESC LIMIT ?`,
        ).all(userId, RECENT_EVENTS) as CallTargetEvent[];
        return callTargetOfDay(rows, nowMs);
    } catch (e) {
        /* 표를 못 읽으면 복귀 끔으로 계속한다 — 세션 만들기를 막지 않는다. 기사님이 다시 켜면 된다 */
        console.error(`🧭 [복귀 켬 읽기] 실패 — 복귀 끔으로 계속:`, (e as Error).message);
        return { target: 'DEST', homeOnAt: null };
    }
}

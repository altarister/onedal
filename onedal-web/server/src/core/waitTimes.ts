import db from "../db";
import { DEFAULT_WAIT_TIMES, type WaitTimes } from "@onedal/shared";

/**
 * ⏱️ **배차망별 대기 시간을 DB 에서 읽는다** (기사님 확정 2026-09-14).
 *
 * 부르는 곳 셋이 이 한 곳을 본다 — 원달앱 응답 조립(`routes/scrap.ts`) ·
 * 첫 보고 타이머(`routes/orders.ts`) · 둘째 보고 타이머(`routes/detail.ts`).
 * 설정 행이 아직 없는 계정은 shared 기본값을 쓴다 — DB DEFAULT 와 같은 값이다.
 */
export function readWaitTimes(userId: string): WaitTimes {
    const row = db.prepare(
        "SELECT safe_cancel_sec_insung, safe_cancel_sec_hwamul24, picker_alarm_detail_sec FROM user_settings WHERE user_id = ?"
    ).get(userId) as { safe_cancel_sec_insung?: number; safe_cancel_sec_hwamul24?: number; picker_alarm_detail_sec?: number } | undefined;
    return {
        safeCancelSecInsung: row?.safe_cancel_sec_insung ?? DEFAULT_WAIT_TIMES.safeCancelSecInsung,
        safeCancelSecHwamul24: row?.safe_cancel_sec_hwamul24 ?? DEFAULT_WAIT_TIMES.safeCancelSecHwamul24,
        pickerAlarmDetailSec: row?.picker_alarm_detail_sec ?? DEFAULT_WAIT_TIMES.pickerAlarmDetailSec,
    };
}

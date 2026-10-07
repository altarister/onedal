/* 🎛️ 필터 값 다섯 읽기 — 세션 저장소와 필터 관리가 함께 쓰는 아래층(DB 한 줄 · 순환 풀기: 세션 저장소가 필터 관리를 거꾸로 부르지 않게) */
import db from "../db";
import { filterValuesFrom, type FlatValueKey } from "@onedal/shared";

/**
 * 🎛️ **값 다섯은 평면 한 행(`user_filters`)에 산다** — 저장은 `saveBaseFilter`, 읽기는 이 함수 하나다.
 *    이름은 평면(앱 피기백) 것을 쓴다.
 */
export function loadFilterValues(userId: string): Record<FlatValueKey, any> {
    try {
        const row = db.prepare(`SELECT * FROM user_filters WHERE user_id = ?`).get(userId) as any;
        /* 🔴 행이 없거나 칸이 NULL 이면 표 기본값 — `Number(null) === 0` 을 안 밟는다 (#105) */
        return filterValuesFrom(row);
    } catch (e) {
        // 세션 생성을 막지 않는다 — 기본값이면 콜 잡기는 돌고, 값은 다음 저장에서 복원된다
        console.error(`🎛️ [필터 값] 읽기 실패 — 표 기본값으로 계속:`, (e as Error).message);
        return filterValuesFrom(null);
    }
}

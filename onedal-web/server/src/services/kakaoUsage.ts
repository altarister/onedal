import { kstDateText } from "@onedal/shared";
import db from "../db";
import { userIdNow } from "../utils/logContext";

/**
 * 🗺️ **카카오 사용량 — 회원 · 한국 날마다 센다** (reviews/27 8장 ⑥ ⑭ · 29 5단계 · 표 kakao_usage_days).
 *    카카오 키는 하나라 한 회원이 한도를 다 쓰면 모두 멈춘다 — 운영센터 회원 상세의 «카카오 오늘 / 이달»이 읽는다.
 *    «누구 몫»은 로그 «@기사»와 같은 맥락(logContext 의 userId) — 주인을 모르면(요청 흐름 밖) '' 로 센다.
 *    길찾기(apis-navi)와 좌표 찾기(dapi 등)는 카카오 한도가 따로라 칸을 나눈다. 실제로 나간 fetch 마다 하나(나란히 한 번 더 보낸 것도).
 *    🔴 세기만 한다 — 실패해도 카카오 호출을 막지 않는다.
 */
export function countKakao(url: string): void {
    try {
        const route = url.includes('apis-navi.kakaomobility.com');
        db.prepare(`INSERT INTO kakao_usage_days (user_id, day, route_calls, local_calls) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, day) DO UPDATE SET route_calls = route_calls + excluded.route_calls, local_calls = local_calls + excluded.local_calls`)
            .run(userIdNow() ?? '', kstDateText(Date.now()) ?? '', route ? 1 : 0, route ? 0 : 1);
    } catch { /* 세기 실패는 운행과 무관 — 조용히 넘긴다 */ }
}

/** 운영센터 회원 상세 — 오늘 · 이달(1일부터 오늘까지) 길찾기 호출 수 (화면 글 «길찾기 호출 수») */
export function kakaoUsageOf(userId: string): { today: number; month: number } {
    const today = kstDateText(Date.now()) ?? '';
    const sum = (from: string) => (db.prepare(`SELECT COALESCE(SUM(route_calls), 0) n FROM kakao_usage_days WHERE user_id = ? AND day >= ? AND day <= ?`)
        .get(userId, from, today) as { n: number }).n;
    return { today: sum(today), month: sum(`${today.slice(0, 7)}-01`) };
}

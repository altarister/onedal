package com.onedal.app.plugins

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧭 경로 순서 판정 — 역주행·경로 밖 콜을 앱이 잡지 않는다 (기사님 확정 2026-08-18)
 *
 * 🔴 이 검사가 잡는 실사고: 파주 도착 직전에 `초월읍(광주) → 금촌동(파주)` 콜이
 *    필터를 통과했다 (2026-08-18 08:50 실측). 하차지만 보고 상차지를 아무도 안 봐서 —
 *    78km 뒤로 돌아가 실어야 하는 콜이었고, 잡았다 취소하면 배차망 패널티(10회)를 쓴다.
 *
 * 규칙 (여유 0km — 뒤로 가는 콜은 버린다):
 *   · progressKm 비어 있음(첫짐)  → 검사 안 함 (통과)
 *   · 상차지가 키에 없음          → 경로 밖 → 차단
 *   · 상차 > 하차                 → 역주행 → 차단
 *   · 값이 null(순서 모름)        → 통과 (느슨하게 — 서버가 판정으로 거른다)
 *
 * 예시 경로: 광주(0) → 하남(25) → 일산(58) → 파주(85)
 */
class RouteOrderFilterTest {

    private val progress: Map<String, Double?> = mapOf(
        "경안동" to 0.5,   // 광주
        "덕풍동" to 25.4,  // 하남
        "신장동" to 27.1,  // 하남
        "산황동" to null,  // 경로 위지만 순서를 모름 (스냅 실패)
        "일산동" to 58.0,  // 일산
        "금촌동" to 83.5,  // 파주
    )

    private fun pass(pickup: String, dropoff: String) =
        RouteOrderFilter.check(pickup, dropoff, progress).passed

    // ── 순방향은 통과한다 ──

    @Test fun `순방향 - 광주에서 싣고 하남에 내린다`() =
        assertTrue(pass("경기 광주시 경안동", "경기 하남시 덕풍동"))

    @Test fun `순방향 - 하남에서 싣고 일산에 내린다 (경로 중간끼리)`() =
        assertTrue(pass("경기 하남시 신장동", "고양시 일산동구 일산동"))

    // ── 역주행·경로 밖은 차단한다 ──

    @Test fun `역주행 - 일산에서 싣고 하남으로 32km 되돌아가는 콜은 차단`() =
        assertFalse(pass("고양시 일산동구 일산동", "경기 하남시 덕풍동"))

    @Test fun `경로 밖 - 목록에 없는 곳에서 싣는 콜은 차단`() =
        assertFalse(pass("부산 해운대구 우동", "경기 하남시 덕풍동"))

    @Test fun `실사고 재현 - 지나온 초월읍에서 싣는 콜은 차단 (키에서 빠져 있다)`() {
        // 운행중엔 서버가 지나온 동을 목록에서 빼므로, 초월읍은 키에 없다
        assertFalse(pass("경기 광주시 초월읍", "경기 파주시 금촌동"))
    }

    // ── 모르는 것은 막지 않는다 ──

    @Test fun `순서를 모르는 동(null)은 통과 - 상차지`() =
        assertTrue(pass("고양시 일산동구 산황동", "경기 파주시 금촌동"))

    @Test fun `순서를 모르는 동(null)은 통과 - 하차지`() =
        assertTrue(pass("경기 광주시 경안동", "고양시 일산동구 산황동"))

    @Test fun `첫짐 - progressKm 이 비어 있으면 검사하지 않는다`() =
        assertTrue(RouteOrderFilter.check("아무데나", "아무데나", emptyMap()).passed)

    // ── 같은 지점끼리(여유 0의 경계) ──

    @Test fun `같은 동에서 싣고 내리면 통과 (상차 == 하차)`() =
        assertTrue(pass("경기 하남시 신장동", "경기 하남시 신장동"))
}

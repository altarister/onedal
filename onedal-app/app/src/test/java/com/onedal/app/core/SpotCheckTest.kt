package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🔎 **목록 밖 화면은 알아본 글자 한 자리만 1초마다 확인한다** — 전체를 다시 읽지 않는다.
 * 그 글자가 없어지면(노드가 사라짐 · 글자가 다름) 화면이 바뀐 것 — 그때만 전체 읽기로 새 페이지를 정한다.
 * 고르는 글자는 지금 페이지(덮개)의 알아보는 글자 — 픽커 메뉴는 리스트 위에 덮여 아래 «리스트 설정»이 트리에 남을 수 있다.
 */
class SpotCheckTest {
    private val menu = ScreenSpec("메뉴", StandardScreen.NETWORK_MENU,
        listOf(ScreenMatch(all = listOf("수행방법 안내", "포인트 내역", "수행 내역")), ScreenMatch(all = listOf("프로필 사진", "기본 아이콘"))),
        false, emptyList(), Seen.REAL, emptyList())
    private val anyPage = ScreenSpec("설정", StandardScreen.NETWORK_MENU,
        listOf(ScreenMatch(any = listOf("오더카드 받기", "소리 알림"))), false, emptyList(), Seen.REAL, emptyList())

    @Test fun `맞은 갈래의 all 글자 — 아래 리스트 글자가 섞여도 덮개 페이지 글자`() =
        assertEquals("수행방법 안내", SpotCheck.wordOf(menu, "리스트 설정 가까운순 수행방법 안내 포인트 내역 수행 내역"))

    @Test fun `둘째 갈래만 맞으면 그 갈래 글자`() =
        assertEquals("프로필 사진", SpotCheck.wordOf(menu, "김윤서 변경 프로필 사진 기본 아이콘 arrow icon"))

    @Test fun `any 갈래는 화면에 있는 것 하나`() =
        assertEquals("소리 알림", SpotCheck.wordOf(anyPage, "진동 알림 켜기 소리 알림 켜기"))

    @Test fun `표 글자로 안 맞은 페이지는 자리를 안 잡는다 — 지금처럼 전체 읽기`() =
        assertNull(SpotCheck.wordOf(menu, "리스트 설정 가까운순 20km"))

    @Test fun `노드 차례 — 그 글자를 담은 첫 노드 · 없으면 없음`() {
        assertEquals(1, SpotCheck.nodeIndexOf(listOf("공지사항", "수행방법 안내", "수행방법 안내"), "수행방법 안내"))
        assertNull(SpotCheck.nodeIndexOf(listOf("공지사항"), "수행방법 안내"))
    }

    @Test fun `그대로 — 노드가 남아 있고 글자가 같다`() =
        assertEquals(SpotCheck.Verdict.SAME, SpotCheck.verdict(refreshed = true, textNow = "수행방법 안내", word = "수행방법 안내"))

    @Test fun `사라짐 — 노드가 없어졌거나 글자가 다르거나 비었다`() {
        assertEquals(SpotCheck.Verdict.GONE, SpotCheck.verdict(refreshed = false, textNow = "수행방법 안내", word = "수행방법 안내"))
        assertEquals(SpotCheck.Verdict.GONE, SpotCheck.verdict(refreshed = true, textNow = "리스트 설정", word = "수행방법 안내"))
        assertEquals(SpotCheck.Verdict.GONE, SpotCheck.verdict(refreshed = true, textNow = null, word = "수행방법 안내"))
    }

    @Test fun `잴 로그 — 처음 세 번은 한 줄씩 · 그 뒤 1분 요약`() {
        val t = SpotCheck.Tally("메뉴 «수행방법 안내»")
        assertEquals("🔎 [자리 확인] 메뉴 «수행방법 안내» · 1번째 · 4ms", t.record(nowMs = 0, ms = 4))
        assertEquals("🔎 [자리 확인] 메뉴 «수행방법 안내» · 2번째 · 2ms", t.record(nowMs = 1_000, ms = 2))
        assertEquals("🔎 [자리 확인] 메뉴 «수행방법 안내» · 3번째 · 3ms", t.record(nowMs = 2_000, ms = 3))
        assertNull(t.record(nowMs = 3_000, ms = 2))
        assertNull(t.record(nowMs = 30_000, ms = 6))
        assertEquals("🔎 [자리 확인] 메뉴 «수행방법 안내» · 3번 · 평균 4ms · 최대 6ms", t.record(nowMs = 63_000, ms = 4))
        assertNull(t.record(nowMs = 64_000, ms = 1))
        assertEquals(7, t.checks)
    }
}

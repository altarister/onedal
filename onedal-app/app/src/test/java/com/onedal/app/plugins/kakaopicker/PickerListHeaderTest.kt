package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.AlarmSignaler
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📜 **목록이 내려가도 목록인지 안다 — «머리줄 안 보임»을 사실 한 칸으로** (기사님 «그런 상태인지 인지 못하는 것이 더 치명적이다»).
 * 실물 09-30 13:41 — 목록을 내린 채 좋은 콜이 15초마다 «알람만» 울렸다(머리줄 Y=null 로 누르지 않음 · 소리 기억이 0장 틀에 지워짐).
 * 목록 글자는 실물 로그 13:41:24(머리줄 없음) · 실물 좌표 목록(PickerBottomTabTest · 머리줄 있음)에서.
 */
class PickerListHeaderTest {
    private val scrolled = listOf("퀵", "승", "예약", "17:00", "강남", "15.7km", "분당", "이매2", "논현2", "15,246", "신규", "내 오더")
    private val top = listOf("퀵 배송", "도보배송", "한차배송", "리스트 설정", "추천순", "20km", "퀵", "반나절", "강동", "14,466")

    @Test fun `픽커 - 머리줄이 보이나`() {
        assertFalse(KakaoPickerParser.listHeaderVisibleOf(scrolled))
        assertTrue(KakaoPickerParser.listHeaderVisibleOf(top))
    }

    @Test fun `인성 화물24시는 모른다 - null`() {
        assertNull(InsungPlugin().listHeaderVisible(emptyList()))
        assertNull(Hwamul24Plugin().listHeaderVisible(emptyList()))
    }

    @Test fun `카드 0장 틀은 소리 기억을 지우지 않는다`() {
        // 소리 기억은 AlarmedRoutes «울림 함» 한 곳 — 목록 스캔은 카드 0장 틀에서 seen 을 부르지 않는다(HijackService)
        val r = com.onedal.app.core.AlarmedRoutes()
        val c = com.onedal.app.models.SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "용산 한남", fare = 1, timestamp = "t", pickupDistance = 1.0)
        assertTrue(r.soundIfNew(c, 0))
        assertFalse("못 읽은 틀 뒤에 또 울렸다", r.soundIfNew(c, 1_000))
        r.seen(emptyList(), 11 * 60_000L)
        assertTrue("정말 사라진(10분) 콜은 잊는다", r.soundIfNew(c, 11 * 60_000L))
    }

    @Test fun `오더카드 기록 - 수락 노드가 있을 때만 · 값과 지명은 이름표로`() {
        val nodes = listOf(
            Triple("퀵", 600, 50), Triple("경기 성남시 중원구 금광1동", 640, 300), Triple("010-1234-5678", 650, 300),
            Triple("15,785", 660, 965), Triple("수락", 660, 965), Triple("리스트 설정", 795, 149),
        )
        val line = KakaoPickerParser.offerCardRecord(nodes, headerY = 795)!!
        assertTrue(line, line.contains("수락 노드 (965,660)") && line.contains("머리줄 Y=795"))
        assertTrue(line, line.contains("<전화>") && line.contains("<지역>") && !line.contains("010-1234") && !line.contains("금광1동"))
        assertNull(KakaoPickerParser.offerCardRecord(nodes.filter { it.first != "수락" }, headerY = 795))
        assertEquals(true, KakaoPickerParser.offerCardRecord(nodes, headerY = null)?.contains("머리줄 안 보임"))
    }
}

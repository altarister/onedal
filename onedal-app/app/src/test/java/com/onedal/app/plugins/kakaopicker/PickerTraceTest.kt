package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📱 **실물 픽커 운행 기록** — 수락부터 «오더 목록 보기»(최대 5시간)까지 화면 글자 전문과 누른 버튼을 모아 서버로 올린다.
 *
 * 퀵 화면(17-1 · 17-2 · 22-1)은 사진만으로는 원달앱이 읽는 글자를 못 맞춘다. 09-13 로그의 «모르는 화면»도 300자에서 잘렸고,
 * 밖에서는 logcat 을 볼 수 없다. 🔴 실물 픽커 앱일 때만 켠다 — 시뮬레이터 앱에서는 필요 없다.
 */
class PickerTraceTest {
    private val t0 = 1_000_000L
    private val hour = 60 * 60 * 1000L

    @Test
    fun `켜기 전에는 아무것도 안 모은다`() {
        val t = PickerTrace()
        assertNull(t.onScreen(t0, "픽업 출발하기", "UNKNOWN"))
        assertNull(t.onClick(t0, "픽업 출발하기"))
        assertTrue(t.drain(50).isEmpty())
    }

    @Test
    fun `실물 픽커에서 상세를 떠나 목록이 아닌 화면으로 가거나 수락 후 표식이 보이면 켠다 - 시뮬레이터 앱은 켜지 않는다`() {
        assertTrue(PickerTrace.shouldStart(live = true, afterDetail = KakaoPickerKeywords.AfterDetail.CHECK_ACCEPTED, acceptedScreen = false))
        assertTrue(PickerTrace.shouldStart(live = true, afterDetail = null, acceptedScreen = true))
        assertFalse(PickerTrace.shouldStart(live = false, afterDetail = KakaoPickerKeywords.AfterDetail.CHECK_ACCEPTED, acceptedScreen = true))
        assertFalse(PickerTrace.shouldStart(live = true, afterDetail = KakaoPickerKeywords.AfterDetail.RETURNED_TO_LIST, acceptedScreen = false))
        assertFalse(PickerTrace.shouldStart(live = true, afterDetail = KakaoPickerKeywords.AfterDetail.RESIDUE, acceptedScreen = false))
        assertFalse(PickerTrace.shouldStart(live = true, afterDetail = null, acceptedScreen = false))
    }

    @Test
    fun `켜면 시작 줄을 남긴다 - 이미 켜져 있으면 시작 시각이 안 바뀐다`() {
        val t = PickerTrace()
        assertTrue(t.start(t0, "상세 뒤 목록이 아닌 화면"))
        assertFalse(t.start(t0 + hour, "다시"))
        assertTrue(t.isActive(t0 + 5 * hour))
        val lines = t.drain(50)
        assertEquals(1, lines.size)
        assertTrue(lines[0].msg.contains("기록 시작"))
        assertEquals(t0, lines[0].atMs)
    }

    @Test
    fun `화면 글자를 자르지 않는다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        val screen = "픽업지 정보 " + "가".repeat(3000) + " 뒤로가기 배정 취소 픽업 출발하기"
        val line = t.onScreen(t0 + 1, screen, "UNKNOWN")
        assertNotNull(line)
        assertTrue(line!!.endsWith(screen))
        assertTrue(t.drain(50).any { it.msg.endsWith(screen) })
    }

    @Test
    fun `같은 화면이 이어지면 한 번만 남긴다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        assertNotNull(t.onScreen(t0 + 1, "배송 출발해주세요", "UNKNOWN"))
        assertNull(t.onScreen(t0 + 2, "배송 출발해주세요", "UNKNOWN"))
        assertNotNull(t.onScreen(t0 + 3, "배송 완료해주세요", "UNKNOWN"))
    }

    @Test
    fun `누른 버튼 글자를 남긴다 - 빈 글자는 버린다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        val line = t.onClick(t0 + 1, "  픽업 출발하기 ")
        assertNotNull(line)
        assertTrue(line!!.contains("«픽업 출발하기»"))
        assertNull(t.onClick(t0 + 2, "   "))
        assertNull(t.onClick(t0 + 3, null))
    }

    @Test
    fun `5시간이 지나면 저절로 멈추고 멈췄다고 남긴다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        assertNotNull(t.onScreen(t0 + 5 * hour, "a", "UNKNOWN"))
        assertNull(t.onScreen(t0 + 5 * hour + 1, "b", "UNKNOWN"))
        assertFalse(t.isActive(t0 + 5 * hour + 1))
        assertTrue(t.drain(50).last().msg.contains("5시간"))
    }

    @Test
    fun `오더 목록 보기를 누르면 그 줄까지 남기고 멈춘다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        assertNotNull(t.onClick(t0 + 1, "오더 목록 보기"))
        assertFalse(t.isActive(t0 + 2))
        assertNull(t.onScreen(t0 + 3, "리스트 설정", "LIST"))
        val msgs = t.drain(50).map { it.msg }
        assertTrue(msgs[msgs.size - 2].contains("«오더 목록 보기»"))
        assertTrue(msgs.last().contains("기록 끝"))
    }

    @Test
    fun `올리기 - 순서대로 꺼내고 실패하면 앞에 되돌린다`() {
        val t = PickerTrace()
        t.start(t0, "수락")
        t.onScreen(t0 + 1, "하나", "UNKNOWN")
        t.onScreen(t0 + 2, "둘", "UNKNOWN")
        val first = t.drain(2)
        assertEquals(2, first.size)
        t.requeueFront(first)
        val again = t.drain(50)
        assertEquals(first, again.take(2))
        assertEquals(3, again.size)
        assertTrue(again[2].msg.endsWith("둘"))
    }

    @Test
    fun `대기열이 넘치면 오래된 줄부터 버리고 버렸다고 남긴다`() {
        val t = PickerTrace(maxQueue = 3)
        t.start(t0, "수락")
        listOf("가", "나", "다", "라", "마").forEachIndexed { i, s -> t.onScreen(t0 + 1 + i, s, "UNKNOWN") }
        val lines = t.drain(50)
        assertTrue(lines[0].msg.contains("3줄"))
        assertEquals(listOf("다", "라", "마"), lines.drop(1).map { it.msg.takeLast(1) })
    }
}

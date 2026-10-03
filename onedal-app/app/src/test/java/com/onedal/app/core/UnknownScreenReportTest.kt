package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * 🔎 **못 알아본 화면 → 운영센터 이상 기록** (기사님 «어» · onedal-69 ㉠㉡)
 *
 * 실물 배차망 앱 안의 화면만 · 10자 이상만 · 같은 배차망 · 같은 지문은 하루 한 번 · 전화 · 동호는 가린다.
 * 아래 줄은 오늘(10-02) A24 실물 픽커 «🧾 [화면 UNKNOWN]» 12줄 원문 그대로다.
 */
class UnknownScreenReportTest {
    private val picker = "com.kakaomobility.flexer"
    private val today = listOf(
        "09:14:30.971" to "정렬 추천순 픽업지 가까운순 높은 가격순 check",
        "09:14:33.022" to "",
        "09:20:45.305" to "퀵 12.4km 퀵 12.9km 퀵 17.3km 퀵 19.5km 퀵 19.8km 퀵 13.1km 퀵 15.5km 퀵 반나절 승 예약 14:00 15.5km 분당 이매2 서초 반포2 12,551 퀵 오더카드 대기 중...",
        "09:22:16.668" to "퀵 12.4km 퀵 12.5km 퀵 12.9km 퀵 16.8km 퀵 17.3km 퀵 19.4km 퀵 13.1km 퀵 반나절 승 예약 13:30 15.5km 분당 이매2 강동 상일1 13,167 퀵 오더카드 대기 중...",
        "09:31:17.539" to "퀵 4.1km 퀵 17.3km 퀵 19.4km 퀵 19.8km 퀵 19.9km 퀵 15.5km 퀵 반나절 승 예약 14:00 15.5km 분당 이매2 서초 반포2 12,551 퀵 배송",
        "09:37:01.979" to "퀵 19.5km 퀵 19.7km 퀵 4.7km 퀵 15.5km 퀵 15.5km 퀵 18.6km 퀵 19.9km 퀵 승 예약 10/5(월) 18.6km 하남 천현 강남 삼성1 15,330 퀵 오더카드 대기 중...",
        "09:39:01.675" to "퀵 13.1km 퀵 17.3km 퀵 19.5km 퀵 4.7km 퀵 15.5km 퀵 15.5km 퀵 18.6km 퀵 반나절 초소형 예약 14:00 19.9km 송파 오금 송파 문정2 5,313 퀵 배송 퀵 오더카드 대기 중...",
        "09:39:01.872" to "퀵 13.1km 퀵 17.3km 퀵 19.5km 퀵 4.7km 퀵 15.5km 퀵 15.5km 퀵 18.6km 퀵 반나절 초소형 예약 14:00 19.9km 송파 오금 송파 문정2 5,313 퀵 오더카드 대기 중...",
        "09:48:01.788" to "퀵 4.5km 퀵 9.6km 퀵 17.3km 퀵 12.9km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 퀵 오더카드 대기 중...",
        "09:48:02.104" to "퀵 4.5km 퀵 9.6km 퀵 17.3km 퀵 12.9km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 알림 퀵 배송 도보배송 한차배송 대리 퀵 서포트 모드 1장 받기 0/1건 퀵 오더카드 대기 중... 신규 내 오더",
        "09:53:16.859" to "퀵 15.9km 퀵 17.2km 퀵 17.3km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 16.3km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 퀵 오더카드 대기 중...",
        "09:53:17.149" to "퀵 15.9km 퀵 17.2km 퀵 17.3km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 16.3km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 알림 퀵 배송 도보배송 한차배송 대리 퀵 서포트 모드 1장 받기 0/1건 퀵 오더카드 대기 중... 신규 내 오더",
    )

    private fun sentOf(day: LocalDate, lines: List<Pair<String, String>>, pkg: String? = picker): List<String> {
        val sent = mutableListOf<String>()
        try {
            UnknownScreenReport.sink = { _, _, _ -> sent += "" }
            val out = mutableListOf<String>()
            for ((at, text) in lines) {
                val before = sent.size
                UnknownScreenReport.record("kakaopicker", pkg, text, day)
                if (sent.size > before) out += at
            }
            return out
        } finally { UnknownScreenReport.sink = null }
    }

    @Test fun `오늘 A24 12줄 - 올라가는 것은 넷이고 09시48분 오더카드 대기 화면이 든다`() =
        assertEquals(listOf("09:14:30.971", "09:20:45.305", "09:31:17.539", "09:48:02.104"), sentOf(LocalDate.of(2026, 10, 2), today))

    @Test fun `날이 바뀌면 같은 화면도 다시 한 번`() {
        val d = LocalDate.of(2026, 10, 3)
        assertEquals(listOf("09:20:45.305"), sentOf(d, today.subList(2, 4)))
        assertEquals(listOf("09:20:45.305"), sentOf(d.plusDays(1), today.subList(2, 4)))
    }

    @Test fun `안 올리는 까닭 - 패키지 모름 · 원달앱 · 시뮬레이터 · 짧은 글`() {
        val long = today[2].second
        assertTrue(UnknownScreenReport.whyNot(null, long)!!.contains("패키지"))
        assertTrue(UnknownScreenReport.whyNot("com.onedal.app", long)!!.contains("원달앱"))
        assertTrue(UnknownScreenReport.whyNot(TargetApp.SIMULATOR_PACKAGE, long)!!.contains("시뮬레이터"))
        assertTrue(UnknownScreenReport.whyNot(picker, "check")!!.contains("짧은"))
        assertEquals(null, UnknownScreenReport.whyNot(picker, long))
        assertEquals(emptyList<String>(), sentOf(LocalDate.of(2026, 10, 5), today, TargetApp.SIMULATOR_PACKAGE))
    }

    @Test fun `전화 · 동호는 가린다`() {
        val m = UnknownScreenReport.mask("배송지 쌍용 스윗닷홈아파트 304동1002호 고객 010-1234-5678 매장 0317654321 문의")
        assertFalse(m, m.contains("1234") || m.contains("5678") || m.contains("7654321") || m.contains("304동") || m.contains("1002호"))
        assertTrue(m, m.contains("#동 #호") && m.contains("0**-****-****"))
    }

    /**
     * 🧭 **진입 경로 — 마지막으로 알아본 화면 · 원달앱 마지막 누름(뒤로 포함)** (운영센터 «까닭» 칸 · CALL_TAKEN 까닭 글과 같은 꼴).
     * 픽커는 버튼을 눌러도 «누름» 알림을 안 내 손 누름 글자는 없다 — 원달앱이 창 안에 안 눌렀으면 손이다.
     */
    @Test fun `진입 경로 - 직전 화면과 원달앱 마지막 누름`() {
        assertEquals("직전: 신규 리스트 · 원달앱 누름: 10초 안 없음", UnknownScreenReport.entryOf("신규 리스트", null, null))
        assertEquals("직전: 신규 리스트 · 원달앱 누름: 10초 안 없음", UnknownScreenReport.entryOf("신규 리스트", 15_000, 30_000))
        assertEquals("직전: 상세(수락 전 시트) · 원달앱 누름: 뒤로 0.4초 전", UnknownScreenReport.entryOf("상세(수락 전 시트)", 3_000, 400))
        assertEquals("직전: 신규 리스트 · 원달앱 누름: 누름 1.2초 전", UnknownScreenReport.entryOf("신규 리스트", 1_200, 20_000))
        assertEquals("직전: 모름 · 원달앱 누름: 10초 안 없음", UnknownScreenReport.entryOf(null, null, null))
    }

    @Test fun `진입 경로는 까닭 글 끝에 붙는다 - 같은 화면 하루 한 번은 그대로`() {
        val reasons = mutableListOf<String>()
        try {
            UnknownScreenReport.sink = { _, reason, _ -> reasons += reason }
            val d = LocalDate.of(2026, 11, 1)
            val entry = UnknownScreenReport.entryOf("신규 리스트", null, null)
            UnknownScreenReport.record("kakaopicker", picker, "close dialog 오더 탐색을 종료하시겠어요? 취소 확인", d, entry)
            UnknownScreenReport.record("kakaopicker", picker, "close dialog 오더 탐색을 종료하시겠어요? 취소 확인", d, "직전: 홈(출근 전) · 원달앱 누름: 10초 안 없음")
        } finally { UnknownScreenReport.sink = null }
        assertEquals(listOf("SCREEN_UNKNOWN: close dialog 오더 탐색을 종료하시겠어요? 취소 확인 · 직전: 신규 리스트 · 원달앱 누름: 10초 안 없음"), reasons)
    }
}

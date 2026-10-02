package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🏁 **«방금 배정된 오더입니다» — 다른 기사가 먼저 가져갔다** (실물 09-30 13:08:45 · 26,950원 · 발견→누름 141ms).
 * 픽커 토스트는 화면 글자(트리)가 아니라 알림 이벤트로 온다 — 받아서 «먼저 가져감»으로 센다.
 * 픽커·시뮬 앱의 알림만 본다 — 다른 앱 알림은 글자를 남기지 않는다(개인정보).
 */
class PickerTakenToastTest {
    @Test fun `배정 토스트를 알아본다`() {
        assertTrue(KakaoPickerKeywords.isTakenToast("방금 배정된 오더입니다"))
        assertTrue(KakaoPickerKeywords.isTakenToast("이미 배정이 완료된 오더입니다"))
        assertFalse(KakaoPickerKeywords.isTakenToast("오더카드 대기 중..."))
        assertFalse(KakaoPickerKeywords.isTakenToast(""))
    }

    @Test fun `픽커와 시뮬 앱의 알림만 본다`() {
        assertTrue(TargetApp.isPickerToastSource("com.kakaomobility.flexer"))
        assertTrue(TargetApp.isPickerToastSource(TargetApp.SIMULATOR_PACKAGE))
        assertFalse(TargetApp.isPickerToastSource("com.kakao.talk"))
        assertFalse(TargetApp.isPickerToastSource(null))
    }

    /**
     * 🧾 **기록은 «누른 페이지 + 그 위에 뜬 알림 + 알림 때 페이지»로 남는다** (reviews/35 3단계).
     * 실물 A24 10-02 09:48 · 09:53 — 신규 리스트에서 누르고, 넘어가는 틀에서 «이미 배정이 완료된» 알림이 왔다.
     */
    private val toast = "이미 배정이 완료된 오더입니다. 카카오 T 픽커"
    private fun page(text: String) = ScreenDetector().detect(text, KakaoPickerPages.screens)

    private val list0948 = "리스트 설정 가까운순 20km 퀵 소형 4.5km 광주 오포2 광진 구의1 20,790 퀵 중형 9.6km 광주 광남1 서초 양재1 착불 15,713 " +
        "퀵 중형 예약 10:00 17.3km 수정 위례 송파 잠실3 11,893 퀵 반나절 소형 예약 12:00 12.9km 분당 야탑3 강서 화곡4 18,249"
    private val frame0948 = "퀵 4.5km 퀵 9.6km 퀵 17.3km 퀵 12.9km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 퀵 오더카드 대기 중..."
    private val list0953 = "리스트 설정 가까운순 20km 퀵 반나절 초소형 15.9km 수정 태평2 서대문 연희 12,750 퀵 반나절 초소형 17.2km 수정 위례 수정 신흥2 7,930 " +
        "퀵 반나절 초소형 17.3km 분당 삼평 강남 논현1 9,317 퀵 반나절 소형 예약 12:00 12.9km 분당 야탑3 수지 성복 9,009"
    private val frame0953 = "퀵 15.9km 퀵 17.2km 퀵 17.3km 퀵 12.9km 퀵 15.5km 퀵 15.5km 퀵 16.3km 퀵 반나절 초소형 예약 11:00 18.6km 수정 시흥 강남 대치2 7,770 퀵 오더카드 대기 중..."

    @Test fun `09시48분 원문 - 누른 화면 신규 리스트 · 알림 때 화면 넘어가는 틀 · 알림 이름과 뜻`() {
        val tapped = page(list0948)
        assertEquals("화면 칸은 누른 화면의 화면 값", ScreenContext.LIST, tapped.context)
        val notice = KakaoPickerKeywords.takenNoticeOf(toast)
        assertNotNull(notice)
        assertEquals(
            "CALL_TAKEN: «배정» 알림 — 남이 먼저 잡았다 · 누른 화면: 신규 리스트 · 알림 때 화면: 콜을 누른 직후 넘어가는 틀 · 발견→누름 256ms · 처음 보인 때 2026-10-02T09:48:01.126385+09:00",
            KakaoPickerKeywords.takenReason(notice!!, tapped.page, page(frame0948).page, "256ms", "2026-10-02T09:48:01.126385+09:00"),
        )
    }

    @Test fun `09시53분 원문 - 같은 글로 남는다`() {
        val tapped = page(list0953)
        assertEquals(ScreenContext.LIST, tapped.context)
        assertEquals(
            "CALL_TAKEN: «배정» 알림 — 남이 먼저 잡았다 · 누른 화면: 신규 리스트 · 알림 때 화면: 콜을 누른 직후 넘어가는 틀 · 발견→누름 354ms · 처음 보인 때 2026-10-02T09:53:16.204064+09:00",
            KakaoPickerKeywords.takenReason(KakaoPickerKeywords.takenNoticeOf(toast)!!, tapped.page, page(frame0953).page, "354ms", "2026-10-02T09:53:16.204064+09:00"),
        )
    }

    @Test fun `손으로 누른 콜 - 누른 화면을 모르면 모름 · 알림 때 화면이 표에 없으면 표에 없음`() {
        assertEquals(
            "CALL_TAKEN: «배정» 알림 — 남이 먼저 잡았다 · 누른 화면: 모름 · 알림 때 화면: 표에 없음 · 발견→누름 모름 · 처음 보인 때 모름",
            KakaoPickerKeywords.takenReason(KakaoPickerKeywords.takenNoticeOf("방금 배정된 오더입니다")!!, null, null, "모름", "모름"),
        )
    }
}

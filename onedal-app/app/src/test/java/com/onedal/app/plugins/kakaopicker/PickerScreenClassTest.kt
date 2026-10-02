package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * 🧪 **픽커 화면은 인성 팝업 셋·확정 화면으로 읽히지 않는다**
 *
 * 인성 화면 함수(팝업 3장 · 확정 화면)는 배차망을 가리지 않고 화면 종류로만 불린다. 픽커 화면이 그 종류로 읽히면
 * 인성 수순이 픽커에서 돌고, 확정 화면으로 읽히면 픽커 미리보기가 «잡은 콜»로 올라간다(안 누른 콜이 잡힌 사고).
 * 그래서 실제 판별(`ScreenDetector` + 픽커 배차망 정의 표)을 픽커 화면 표본에 돌려 본다.
 */
class PickerScreenClassTest {

    private val plugin = KakaoPickerPlugin(null)
    private fun classify(texts: List<String>): ScreenContext =
        ScreenDetector().detect(texts.joinToString(" "), plugin.screens).context

    private val list = listOf("퀵 배송", "도보배송", "리스트 설정", "높은 가격순", "퀵", "소형", "과천", "16,870", "15.2km", "신규", "내 오더")
    private val detail = listOf("퀵", "단거리", "배송 31분 남음", "픽업 14.6km", "픽업 장소", "물품 정보", "소형", "넘기기", "수락하기")
    private val home = listOf("어떤 일을 시작할까요", "퀵", "시작하기")
    private val toPickup = listOf("배정 취소", "픽업 준비 13분 남음", "배송 33분 남음", "오더 확인")
    private val atPickup = listOf("오더 확인", "배송지", "배송 물품", "고객 요청", "밀어서 픽업 완료")
    private val myOrders = listOf("목록 지도", "알림", "16:08까지", "퀵 픽업", "초월읍", "배송지: 신둔면", "소형", "신규", "내 오더")
    private val residueList = list + listOf("픽업지 정보 경기 광주시 초월읍 경충대로 907")

    private val insungOnly = setOf(
        ScreenContext.POPUP_MEMO, ScreenContext.POPUP_PICKUP, ScreenContext.POPUP_DROPOFF, ScreenContext.DETAIL_CONFIRMED,
    )

    @Test
    fun `픽커 화면 표본 어느 것도 인성 팝업·확정 화면이 아니다`() {
        for ((name, texts) in listOf(
            "목록" to list, "상세" to detail, "홈" to home, "픽업 가는 중" to toPickup,
            "픽업지 도착" to atPickup, "내 오더" to myOrders, "잔상 목록" to residueList,
        )) {
            val got = classify(texts)
            assertFalse("픽커 «$name» 화면이 $got 로 읽힌다", got in insungOnly)
        }
    }
}

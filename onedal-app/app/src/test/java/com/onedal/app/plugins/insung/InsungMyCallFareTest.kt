package com.onedal.app.plugins.insung

import android.content.ContextWrapper
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 💰 **손으로 확정한 인성 콜의 요금 — 확정 뒤 화면(완료 탭)** (기사님 2-2 나).
 * `InsungSequence.buildOrderFromScreen` 이 부르는 `screenFareOf` 그대로: 목록 규칙(차종 다음 칸)이 못 읽으면 내 콜 화면 정의로 읽는다.
 * 확정 뒤 화면에는 «요금 :» 줄이 없고 «실운임 :» 뿐이다 — 목록 요금과 같은 돈(수수료 뺀 몫). «탁송료 : 0» 은 요금이 아니다.
 * 화면 글은 영상_1743 · 1621 노드를 옮긴 것이다.
 */
class InsungMyCallFareTest {
    private val parser = InsungParser(ContextWrapper(null))
    private fun fareOf(texts: List<String>) = screenFareOf(parser.parse(texts).fare, texts)

    @Test fun `착불 확정 뒤 화면 — 요금은 실운임 · 받을 금액 · 탁송료가 아니다`() {
        assertEquals(34650, fareOf(listOf("쑥쑥 퀵서비스-1644-8240", "상태 : 배송", "차량 :", "다마스-다마", "탁송료 :", "0", "고객에게 받을 금액 45,000", "실운임 : 34,650(착불)", "닫기")))
    }

    @Test fun `신용 확정 뒤 화면 — 요금은 실운임`() {
        assertEquals(22330, fareOf(listOf("상태 : 배송", "차량 :", "다마스", "탁송료 : 0", "실운임 : 22,330(신용)", "구분 : 편도", "닫기", "카드 승인")))
    }
}

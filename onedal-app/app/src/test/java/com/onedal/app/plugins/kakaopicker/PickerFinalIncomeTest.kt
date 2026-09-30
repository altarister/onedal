package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 💰 **«최종 수익»과 그 숫자는 따로 온다 — 노드도, 사진 줄도** (실물 09-30 · 1f «가»).
 * 정답지는 실물 그대로다:
 * - 접근성 노드 덤프 13:40:10 · 13:40:25 (uiautomator · 노드 차례 그대로) — «최종 수익»과 «9,670»·«15,246»이 옆 노드
 * - 사진 줄 #41 (y368 «11,396 P» · y372 «최종 수익») · id 38 (y447 «11,796» · y448 «최종 수익»)
 * 🔴 노드 하나씩 보면 «배송비 9,170P»를 요금으로 잡는다 — 최종 수익이 아니다.
 */
class PickerFinalIncomeTest {
    private val dump134010 = listOf("물품 정보", "초소형 세 변의 합 70cm ∙ 2kg 이하", "최종 수익", "9,670", "배송비", "9,170P", "넘기기", "수락하기")
    private val dump134025 = listOf("물품 정보", "중형 세 변의 합 140cm ∙ 20kg 이하", "유의사항", "대박스 1개", "최종 수익", "15,246", "넘기기", "수락하기")

    @Test fun `노드 덤프 - 최종 수익 옆 노드의 숫자 · 배송비가 아니다`() {
        assertEquals(9670, PickerFinalIncome.of(dump134010))
        assertEquals(15246, PickerFinalIncome.of(dump134025))
        assertEquals(9670, PickerDetailOcrParser.extractFareFromTexts(dump134010))
        assertEquals(15246, PickerDetailOcrParser.extractFareFromTexts(dump134025))
    }

    @Test fun `한 노드에 붙어 온 꼴도`() = assertEquals(15246, PickerFinalIncome.of(listOf("최종 수익 15,246")))

    @Test fun `최종 수익이 없으면 null`() = assertNull(PickerFinalIncome.of(listOf("물품 정보", "넘기기")))

    @Test fun `사진 41 - 숫자 줄이 글자 줄보다 위`() {
        val lines = listOf(
            OcrLine(110, "경기 성남시 중원구 상대원1동 찍업 12.7km"), OcrLine(150, "서울 용산구 한남동"),
            OcrLine(167, "배송 19.1km"), OcrLine(368, "11,396 P"), OcrLine(372, "최종 수익"),
        )
        assertEquals(11396, PickerScreenOcr.parseDetail(lines)?.finalIncome)
    }
}

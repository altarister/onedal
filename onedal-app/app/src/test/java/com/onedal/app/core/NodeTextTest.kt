package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🧹 **픽커 상세 «픽업지» 노드 글자 끝의 «kotlin.Unit»을 뗀다** — 픽커 앱 자체 글자다(실물 덤프 09-30 13:40:10 · 13:40:25 content-desc).
 * 건물 이름에 붙어 오면 건물 이름이 «지엔코빌딩kotlin.Unit»으로 읽힌다.
 */
class NodeTextTest {
    @Test fun `건물 이름에 붙어 온 것`() =
        assertEquals("픽업지 서울 송파구 문정1동 지엔코빌딩", NodeText.clean("픽업지 서울 송파구 문정1동 지엔코빌딩kotlin.Unit"))

    @Test fun `띄어 붙어 온 것`() =
        assertEquals("픽업지 경기 성남시 분당구 이매2동", NodeText.clean("픽업지 경기 성남시 분당구 이매2동 kotlin.Unit"))

    @Test fun `그것뿐이면 빈 글자 - 모으지 않는다`() = assertNull(NodeText.clean(" kotlin.Unit "))

    @Test fun `다른 글자는 그대로`() = assertEquals("최종 수익", NodeText.clean("  최종 수익 "))
}

/**
 * 🌳 **나무 한 번 훑기 — 지문 글자와 목록 좌표 노드를 한 벌의 훑기에서** (실물 09-30 18:36~38 · 목록 한 번 읽기 300~500ms · 두 번 훑었다).
 * 노드는 실물 덤프 detail_134025.xml(13:40:25) 그대로다(text · content-desc · bounds).
 * ⚠️ 한계: 옛 두 함수(gatherNodeTexts · extractAllTextNodes)는 AccessibilityNodeInfo 를 받아 JVM 검사로 직접 비교할 수 없다 —
 *    그래서 **두 규칙을 표로** 잠근다. 목록 덤프는 없다(uiautomator 금지) — 목록 쪽은 설치 뒤 폰 줄의 «📐»·«🔔» 수로 본다.
 */
class NodeWalkTest {
    private fun n(text: String?, desc: String?, l: Int, t: Int, r: Int, b: Int) = RawNode(text, desc, l, t, r, b)

    /** 덤프에서 글자가 있는 노드 — «픽업지…» 노드는 text 가 비고(null) content-desc 만 있다 · «15,246»은 둘 다 있다 */
    private val dump = listOf(
        n(null, "픽업지 경기 성남시 분당구 이매2동 kotlin.Unit", 34, 1310, 1035, 1534),
        n("물품 정보", null, 90, 1635, 293, 1687),
        n("중형 세 변의 합 140cm ∙ 20kg 이하", null, 316, 1635, 990, 1703),
        n("유의사항", null, 90, 1796, 293, 1848),
        n("대박스 1개", null, 316, 1796, 508, 1856),
        n("최종 수익", null, 90, 1983, 699, 2002),
        n("15,246", "15,246", 699, 1983, 905, 2002),
        n("넘기기", null, 125, 2047, 326, 2160),
        n("수락하기", null, 631, 2047, 899, 2160),
    )

    @Test fun `지문 글자 - 노드마다 글자와 설명 둘 다 (옛 gatherNodeTexts 규칙)`() =
        assertEquals(listOf("픽업지 경기 성남시 분당구 이매2동", "물품 정보", "중형 세 변의 합 140cm ∙ 20kg 이하", "유의사항", "대박스 1개",
            "최종 수익", "15,246", "15,246", "넘기기", "수락하기"), NodeText.textsOf(dump))

    @Test fun `좌표 노드 - 글자가 있으면 글자만 · 없을 때만 설명 (옛 extractAllTextNodes 규칙)`() =
        assertEquals(listOf("픽업지 경기 성남시 분당구 이매2동", "물품 정보", "중형 세 변의 합 140cm ∙ 20kg 이하", "유의사항", "대박스 1개",
            "최종 수익", "15,246", "넘기기", "수락하기"), NodeText.textNodesOf(dump).map { it.first })

    @Test fun `좌표 노드 - 빈 글자면 설명으로 안 넘어가고 · 400px 넘는 틀과 너비 0 은 뺀다`() {
        val odd = listOf(n("", "설명만", 0, 0, 100, 50), n("큰 틀", null, 0, 0, 1080, 2000), n("너비0", null, 10, 0, 10, 50))
        assertEquals(emptyList<String>(), NodeText.textNodesOf(odd).map { it.first })
        assertEquals(listOf("설명만", "큰 틀", "너비0"), NodeText.textsOf(odd))
    }
}

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

package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **목록 누르기가 실패하면 «앱이 열었다»로 굳지 않는다**
 *
 * 누르기가 실패했는데(노드가 사라짐 · 좌표 0) 세션을 «앱이 열었다»로 세우면, 화면은 목록 그대로라
 * «목록으로 돌아왔다» 리셋이 오지 않고 다음 스캔부터 앱이 아무 콜도 누르지 않는다.
 * 그 콜을 «눌렀다»로 기억해 버리면 다음 스캔에 다시 시도하지도 못한다.
 */
class ListTapFiredTest {

    private val list by lazy {
        File("src/main/java/com/onedal/app/HijackService.kt").readText()
            .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
            .substringAfter("private fun handleListScreen").substringBefore("\n    private fun ")
    }

    @Test
    fun `목록 누르기의 결과를 읽는다`() {
        assertTrue("performSimulatedTouch(fareNode…) 의 반환값을 버린다",
            Regex("""val\s+fired\s*=\s*touchManager\.performSimulatedTouch\((fareNode|freshFare)""").containsMatchIn(list))
        assertTrue("누르기에 실패하면 세션을 세우지 않는 갈래가 없다", list.contains("if (fired)"))
    }

    @Test
    fun `콜 기억은 누르기에 성공한 뒤에 넣는다`() {
        val touch = list.indexOf("touchManager.performSimulatedTouch(freshFare")   // 누르기 넘김이 새로 읽은 노드로 누른다
        val mark = list.indexOf("callMemory.markEvaluated(orderHash)")
        assertTrue(touch > 0 && mark > 0)
        assertTrue("«눌렀다» 기억이 누르기보다 앞이다 — 실패한 콜도 영영 다시 안 본다", mark > touch)
    }
}

package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ✋ **기사님이 손으로 연 콜은 요건이 모자라도 잃지 않는다** (기사님 «가» · 규칙 «값이 있는 콜을 버리는 것은 기사님만»)
 *
 * 원달앱이 전체 주소를 못 채우면 서버에 보내지 않는다. 그런데 기사님이 손으로 열어 **직접 확정(픽커는 수락)**하시면 그건 기사님이 잡은 콜이다.
 * 그래서 «보고 보류» 표시만 세워 두고, 확정 화면·픽커 수락 감지가 그 표시를 보면 짧은 주소로라도 상세 보고한다.
 */
class HeldManualCallTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val root = "src/main/java/com/onedal/app"

    @Test
    fun `손으로 연 콜이 요건 미달이면 보고 보류 표시를 세운다`() {
        val seq = codeOnly("$root/core/engine/PreConfirmSequence.kt")
        val drop = seq.substringAfter("fun ScanContext.dropUnfilledCall(").substringBefore("\n}\n")
        assertTrue(drop.contains("session.heldUnfilled = true"))
    }

    @Test
    fun `확정 화면은 보고 보류 콜을 상세 보고한다 - 이미 보고했다보다 먼저 본다`() {
        val c = codeOnly("$root/plugins/insung/InsungSequence.kt").substringAfter("fun ScanContext.handleConfirmedScreen(")
        val held = c.indexOf("session.heldUnfilled")
        val sent = c.indexOf("if (session.isDetailScrapSent) return")
        assertTrue("확정 화면이 보고 보류를 안 본다", held > 0)
        assertTrue("«이미 보고했다»에서 먼저 돌아선다", held < sent)
    }

    @Test
    fun `픽커 수락 감지도 보고 보류 콜을 받아들인다`() {
        val c = codeOnly("$root/plugins/kakaopicker/KakaoPickerSequence.kt").substringAfter("fun ScanContext.reportPickerAccepted(")
        assertTrue(c.contains("session.heldUnfilled"))
    }

    @Test
    fun `세션 초기화가 보고 보류 표시를 지운다`() {
        val reset = codeOnly("$root/core/engine/SessionManager.kt").substringAfter("fun reset(")
        assertTrue(reset.substringBefore("\n    }").contains("heldUnfilled = false"))
    }
}

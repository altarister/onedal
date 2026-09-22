package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ✅ **수락은 화면 보고보다 먼저 알린다 · 승격은 상세 글자를 덮지 않는다** (체험 · 로그 분석)
 *
 * ── 그날 무슨 일이 있었나 ──
 * ```
 * 47.001  서버: 상세 이탈(내 오더) — 미리보기를 치운다      ← 기사님 확정 규칙대로 맞게 했다
 * 47.042  앱  : 수락 확인 — 기사님이 「수락하기」를 누르셨다   ← 40ms 늦었다
 * 47.051  앱  : POST /detail (내 오더 화면 글자)            ← 치운 콜이 되살아나고 주소가 짧아졌다
 * ```
 *
 * 무엇을 막나
 * - **순서** — 앱이 「화면 이름」을 먼저 쏘고 「그 화면의 뜻」을 뒤에 판단하면, 서버는 앞의 보고만으로
 *   되돌릴 수 없는 결정(미리보기 치움)을 내린다. 서버 규칙(«수락 안 한 미리보기만 치운다»)은 옳다 —
 *   수락 사실이 **먼저** 닿기만 하면 그 규칙이 알아서 안 치운다
 * - **글자** — 승격은 «딱지를 벗기는 것»이다. 상세에서 모은 글자를 수락 뒤 화면 글자로 갈아치우면
 *   전체 주소가 사라진다. 그날 내 오더 탭에는 「초월읍」만 있었고, 0.14초 전 상세에는
 *   「경기 광주시 초월읍 경충대로 907」이 있었다
 */
class PickerAcceptOrderTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val hijack by lazy { codeOnly("src/main/java/com/onedal/app/HijackService.kt") }

    // ── 순서 ──────────────────────────────────────────

    @Test
    fun `수락 인지가 화면 보고보다 앞에 있다`() {
        val report = hijack.indexOf("updateScreenContext(detected)")
        val accept = hijack.indexOf("reportPickerAccepted(")
        assertTrue("`updateScreenContext(detected)` 를 못 찾았다", report > 0)
        assertTrue("`reportPickerAccepted` 를 못 찾았다", accept > 0)
        assertTrue(
            "수락 신고가 화면 보고보다 뒤에 있다 — 서버가 «상세 이탈»로 먼저 치운다 (2026-09-19 체험)",
            accept < report,
        )
    }

    @Test
    fun `늦은 수락 확인도 화면 보고보다 앞에 있다`() {
        val report = hijack.indexOf("updateScreenContext(detected)")
        val late = hijack.lastIndexOf("reportPickerAccepted(")
        assertTrue("수락 신고 자리가 둘 다 화면 보고 앞이어야 한다", late < report)
    }

    // ── 글자 ──────────────────────────────────────────

    /** 그날 상세 화면 글자 — 전체 주소가 있다 */
    private val detailText =
        "픽업지 정보 경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점 픽업지 주소 복사하기"

    /** 그날 수락 뒤 「내 오더」 탭 글자 — 줄임 이름뿐이다 */
    private val acceptedText =
        "목록 지도 알림 메뉴 16:08까지 퀵 픽업 초월읍 배송지: 신둔면 소형 한차배송"

    @Test
    fun `상세에서 모은 글자가 있으면 그것이 이긴다`() {
        assertEquals(detailText, KakaoPickerKeywords.detailTextForAccept(detailText, acceptedText))
    }

    @Test
    fun `상세를 못 읽었으면 수락 뒤 화면 글자를 쓴다`() {
        assertEquals(acceptedText, KakaoPickerKeywords.detailTextForAccept("", acceptedText))
        assertEquals(acceptedText, KakaoPickerKeywords.detailTextForAccept("   ", acceptedText))
    }

    @Test
    fun `전체 주소가 살아남는다 — 그날 증상 그대로`() {
        val kept = KakaoPickerKeywords.detailTextForAccept(detailText, acceptedText)
        assertTrue("전체 주소가 사라졌다 — 서버가 «광주 초월읍»만 보고 좌표를 못 찾는다",
            kept.contains("경기 광주시 초월읍"))
    }

    @Test
    fun `승격이 상세 글자를 직접 덮어쓰지 않는다`() {
        val seq = codeOnly("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerSequence.kt")
        assertTrue(
            "`accumulatedDetailText = rawScreenStr` 로 통째로 덮으면 상세에서 읽은 전체 주소가 사라진다",
            !seq.contains(Regex("""accumulatedDetailText\s*=\s*rawScreenStr""")),
        )
        assertTrue("고르는 일은 `detailTextForAccept` 한 곳이다",
            seq.contains("detailTextForAccept("))
    }
}

package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔄 **다시 봐야 할 까닭이 생기면 화면이 안 움직여도 다시 본다**
 *
 * ── 같은 뿌리로 세 번째다 ──
 * ```
 * ① 붙는 순간 화면      첫 값이 굳었다
 * ② 알럿을 닫고 홈으로   마지막 값이 굳었다  (TYPE_WINDOW_STATE_CHANGED 를 더해 고쳤다)
 * ③ 필터가 바뀜         옛 목록으로 막은 콜을 새 목록으로 다시 안 봤다
 * ```
 * 뿌리는 하나다 — **화면이 안 움직이면 아무도 다시 안 본다.** 접근성 이벤트가 유일한 방아쇠이고,
 * 그 앞에 지문 비교(`lastScreenFingerprint`)가 또 한 겹 막는다.
 *
 * ── 그날 무슨 일이 있었나 (2026-09-20 모의 주행) ──
 * ```
 * 06:12:04  서버: 복귀를 켜 하차 목록 487 → 585곳
 * 06:12:08  폰  : 487곳으로 「야탑동 ❌」 — 새 필터가 아직 안 왔다
 * 06:12:08  폰  : 0.3초 뒤 새 필터 도착 (585곳)
 * 06:13:23  폰  : 그제야 다시 판정 — 75초 늦었고 시나리오는 이미 포기했다
 * ```
 *
 * 무엇을 막나
 * - **필터가 바뀌었는데 다음 화면 변화를 기다리는 것** — 시뮬·실물 모두 목록이 멎어 있으면 영영 안 본다
 * - **네트워크 스레드에서 화면을 긁는 것** — 접근성 노드는 메인 스레드에서 읽어야 한다
 * - **지문이 재스캔을 도로 막는 것** — 다시 볼 때는 지문을 무효로 두어야 한 겹을 통과한다
 */
class RescanOnFilterChangeTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val hijack by lazy { codeOnly("src/main/java/com/onedal/app/HijackService.kt") }
    private val api by lazy { codeOnly("src/main/java/com/onedal/app/api/ApiClient.kt") }

    @Test
    fun `필터가 바뀌면 재스캔을 요청하는 길이 있다`() {
        assertTrue(
            "필터를 저장한 뒤 «다시 봐라»를 알리는 자리가 없다 — 다음 화면 변화를 기다리게 된다",
            api.contains("onFilterChanged"),
        )
        assertTrue("서비스가 그 요청을 받는 자리가 없다", hijack.contains("fun onFilterChanged"))
    }

    @Test
    fun `재스캔은 메인 스레드에서 돈다`() {
        val at = hijack.indexOf("fun onFilterChanged")
        assertTrue("`onFilterChanged` 를 못 찾았다", at > 0)
        val body = hijack.substring(at, minOf(at + 700, hijack.length))
        assertTrue(
            "접근성 노드를 네트워크 스레드에서 읽으면 죽는다 — `mainHandler` 로 넘겨야 한다",
            body.contains("mainHandler.post"),
        )
    }

    @Test
    fun `다시 볼 때는 화면 지문을 무효로 둔다`() {
        val at = hijack.indexOf("fun onFilterChanged")
        val body = hijack.substring(at, minOf(at + 700, hijack.length))
        assertTrue(
            "지문이 같으면 스캔이 일찍 되돌아간다 — 재스캔 전에 지문을 비워야 한 겹을 통과한다",
            body.contains("lastScreenFingerprint"),
        )
    }

    @Test
    fun `버전이 바뀐 때만 알린다`() {
        val at = api.lastIndexOf("onFilterChanged?.invoke")
        assertTrue("알리는 자리를 못 찾았다", at > 0)
        val around = api.substring(maxOf(0, at - 400), at)
        assertTrue(
            "매 응답마다 재스캔하면 1초 폴링 구간에서 화면을 계속 다시 읽는다 — 버전을 견주고 불러야 한다",
            around.contains("prevVersion != nextVersion"),
        )
    }
}

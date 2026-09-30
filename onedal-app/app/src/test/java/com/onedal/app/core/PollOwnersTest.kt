package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔁 **1초 보고는 켠 쪽마다 한 칸 — 끄는 쪽은 자기 몫만 끈다** (onedal-1f «가» · 앱 시간값 전수).
 * 참/거짓 한 칸을 셋(상세 대기 · 안전취소 · 손 클릭 AUTO 임시 10초)이 나눠 써, 한쪽이 끄면 다른 쪽이 켜 둔 것도 꺼졌다.
 */
class PollOwnersTest {
    @Test fun `상세 대기가 켠 채 임시 10초가 끝나도 1초 보고 유지`() {
        val p = PollOwners()
        p.set(PollOwners.DETAIL_WAIT, true)
        p.set(PollOwners.HAND_AUTO, true)
        p.set(PollOwners.HAND_AUTO, false)
        assertTrue(p.any)
        p.set(PollOwners.DETAIL_WAIT, false)
        assertFalse(p.any)
    }

    @Test fun `바뀐 때만 참을 돌려준다 — 보고 주기를 그때만 다시 건다`() {
        val p = PollOwners()
        assertTrue(p.set(PollOwners.SAFE_CANCEL, true))
        assertFalse("다른 쪽이 켜도 켜짐은 그대로", p.set(PollOwners.DETAIL_WAIT, true))
        assertFalse(p.set(PollOwners.SAFE_CANCEL, false))
        assertTrue(p.set(PollOwners.DETAIL_WAIT, false))
    }

    @Test fun `켜고 끄는 곳이 모두 자기 이름을 쓴다`() {
        val root = "src/main/java/com/onedal/app"
        val all = listOf("HijackService.kt", "core/engine/PreConfirmSequence.kt").joinToString("\n") { File("$root/$it").readText() }
        assertFalse("참/거짓 한 칸에 바로 쓰는 곳", all.contains("isWaitingDecision = "))
        assertTrue(all.contains("setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, false)"))
    }
}

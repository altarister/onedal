package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 👈 **리스트 카드는 요금 글자에서 왼쪽으로 옮겨 찍는다** (기사님 지시).
 *
 * 요금 닻은 화면 **오른쪽 아래**에 있고, 상세 화면의 **«수락하기»도 오른쪽 아래**다.
 * 화면이 상세로 바뀌는 찰나에 그 좌표를 찍으면 곧 계약이 된다.
 * 카드 한 줄은 전체가 눌리므로 **같은 줄에서 왼쪽으로 옮겨** 찍으면 상세로 똑같이 들어가고,
 * 화면이 먼저 바뀌어 잘못 눌려도 그 자리는 «넘기기»(계약 아님)다.
 * 🔴 화면 왼쪽 밖으로 나가지 않게 최소 x 를 지킨다 — 나가면 아무 데도 안 눌려 알람이 조용히 죽는다.
 *
 * ⏳ **자국을 보여 주려고 찍기를 미루면 그 사이에 리스트가 갱신된다** — 미룬 만큼
 *    «잰 자리»와 «누를 자리»가 벌어진다. 그래서 쏘기 직전에 다시 재서 **그대로일 때만** 쏜다.
 */
class TapShiftTest {

    /**
     * 🔒 **연달아 누르는 길을 막지 않는다 — 막을 것은 «미뤄 둔 예약이 둘 쌓이는 것»뿐이다.**
     *
     * 인성에서 손으로 콜을 열면 앱이 **적요상세 → 출발지 → 도착지** 팝업을 차례로 열고 닫아
     * 정보를 모아 미리보기로 보낸다. 그 길은 **0.2~0.4초 간격으로 연달아** 눌러야 한다.
     * 잠금이 바로 찍는 길까지 막자 「닫기」가 아홉 번 내리 삼켜져 팝업이 안 닫혔고,
     * 순회가 적요상세부터 끝없이 되풀이됐다 (09-16 실측 21:53~21:58).
     *
     * ── 실물 간격 (폰 로그) ──
     * ```
     *   적요상세 찍음 → 262ms 뒤 「닫기」   ← 막히면 안 된다
     *   출발지  찍음 → 293ms 뒤 「닫기」   ← 막히면 안 된다
     *   도착지  찍음 → 418ms 뒤 「닫기」   ← 막히면 안 된다
     * ```
     */
    @Test
    fun `바로 찍는 길은 연달아 눌러도 안 막힌다 - 인성 팝업 셋 돌기`() {
        // 적요상세를 바로 찍고(delay 0) 262ms 뒤 「닫기」를 바로 찍는다
        assertFalse("적요→닫기 262ms", TapShift.blockedByPending(pendingAtMs = 1_000L, nowMs = 1_262L, delayMs = 0L))
        assertFalse("출발지→닫기 293ms", TapShift.blockedByPending(pendingAtMs = 1_000L, nowMs = 1_293L, delayMs = 0L))
        assertFalse("도착지→닫기 418ms", TapShift.blockedByPending(pendingAtMs = 1_000L, nowMs = 1_418L, delayMs = 0L))
    }

    /** 🔴 미뤄 둔 예약이 둘 쌓이는 것은 그대로 막는다 — 이 잠금이 생긴 까닭 (09-16 14:58:52) */
    @Test
    fun `미뤄 둔 예약이 있으면 새 예약을 안 건다`() {
        assertTrue(
            "1초 미룬 예약 뒤 300ms 만에 또 예약",
            TapShift.blockedByPending(pendingAtMs = 1_000L, nowMs = 1_300L, delayMs = 1_000L),
        )
    }

    /** 🔓 여유(`PENDING_GRACE_MS`)가 지나면 스스로 풀린다 — 콜백이 유실돼도 영영 안 찍히지 않게 */
    @Test
    fun `여유가 지나면 잠금이 스스로 풀린다`() {
        assertFalse(TapShift.blockedByPending(pendingAtMs = 1_000L, nowMs = 2_600L, delayMs = 1_000L))
    }

    @Test
    fun `미뤄 둔 것이 없으면 안 막는다`() {
        assertFalse(TapShift.blockedByPending(pendingAtMs = 0L, nowMs = 9_999L, delayMs = 1_000L))
        assertFalse(TapShift.blockedByPending(pendingAtMs = 0L, nowMs = 9_999L, delayMs = 0L))
    }

    @Test
    fun `요금 자리에서 왼쪽으로 옮긴다`() {
        assertEquals(681, TapShift.leftOf(981, 300))
        assertEquals(660, TapShift.leftOf(960, 300))
    }

    @Test
    fun `🔴 화면 왼쪽 밖으로는 안 나간다 - 최소 x 를 지킨다`() {
        assertEquals(TapShift.MIN_X, TapShift.leftOf(100, 300))
        assertTrue(TapShift.leftOf(0, 300) >= TapShift.MIN_X)
    }

    @Test
    fun `옮김이 0 이면 그 자리 그대로`() {
        assertEquals(981, TapShift.leftOf(981, 0))
    }

    @Test
    fun `픽커 리스트 카드의 옮김 값은 0 보다 크다 - 요금 자리를 안 찍는다`() {
        assertTrue(TapShift.PICKER_LIST_LEFT_PX > 0)
    }

    @Test
    fun `미룬 뒤 자리가 그대로면 쏜다 - 손가락 굵기만큼은 봐준다`() {
        assertTrue(TapShift.sameSpot(660, 1519, 660, 1519))
        assertTrue(TapShift.sameSpot(660, 1519, 668, 1531))
    }

    @Test
    fun `🔴 리스트가 갱신돼 자리가 밀렸으면 안 쏜다`() {
        assertFalse(TapShift.sameSpot(660, 1519, 660, 1700))
        assertFalse(TapShift.sameSpot(660, 1519, 400, 1519))
    }

    @Test
    fun `🔴 자리를 다시 못 쟀으면 안 쏜다 - 모르면 손대지 않는다`() {
        assertFalse(TapShift.sameSpot(660, 1519, null, null))
        assertFalse(TapShift.sameSpot(660, 1519, 660, null))
    }

    /**
     * ⏳ 지금은 **미루지 않는다** (기사님 지시) — 자국이 찍은 뒤에도 남아 있어 기다릴 까닭이 없다.
     * 🔴 0 보다 크게 되돌리면 미루는 길이 다시 돌고, 그때는 아래 `sameSpot`·`wokeTooLate` 가 반드시 필요하다.
     */
    @Test
    fun `미룸 없이 바로 찍는다`() {
        assertEquals(0L, TapShift.PREVIEW_MS)
    }

    /**
     * 🐢 **너무 늦게 깨어났으면 쏘지 않는다** (기사님 지시).
     *
     * 폰이 바쁘면 예약한 일이 제때 안 깨어난다 — 실측에서 «300ms 뒤»로 잡은 일이
     * 7,191ms 만에 깨어났다 (`🐢 [발사 지연]` 은 원달앱이 예전부터 적어 온 줄이다).
     * 1초 미뤄 찍기로 잡았는데 7초 뒤에 쏘면, 그사이 목록이 바뀌어 **다른 카드를 찍는다.**
     * 자리 다시 재기(`sameSpot`)가 한 겹 막지만, 우연히 같은 자리면 못 가린다.
     * 🔴 늦었으면 쏘지 않고 **다음 판에 다시** 한다 — 알람 한 번을 미루는 값이 오배차보다 싸다.
     */
    @Test
    fun `제때 깨어났으면 쏜다`() {
        assertFalse(TapShift.wokeTooLate(1_000L, 1_010L))
        assertFalse("조금 늦은 것은 봐준다", TapShift.wokeTooLate(1_000L, 2_900L))
    }

    @Test
    fun `🔴 너무 늦게 깨어났으면 안 쏜다`() {
        assertTrue(TapShift.wokeTooLate(1_000L, 7_191L))
        assertTrue(TapShift.wokeTooLate(1_000L, 8_000L))
    }

    @Test
    fun `봐주는 여유는 0 보다 크다 - 조금 늦었다고 알람을 죽이지 않는다`() {
        assertTrue(TapShift.LATE_TOL_MS > 0)
    }
}

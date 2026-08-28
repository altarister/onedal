package com.onedal.app.plugins.insung

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔴 **주소 칸에 차종·품목이 들어왔다** (라이브 실측 2026-08-28 23:22)
 *
 * ```
 * AUTO-178  [ORDER_CONFIRMED]  가전 → 다마스   6만원   궤적 1점
 * ```
 * 상차지·하차지 자리에 주소가 아니라 **품목과 차종**이 있다. 좌표를 못 만들어
 * 궤적이 1점에서 멈췄고, 경로·여유·색이 통째로 못 나왔다.
 *
 * `looksLikeAddress` 가드는 있었는데 **`buildOrderFromScreen` 경로에만** 걸려 있었다.
 * 정작 사고가 난 «손으로 연 상세»의 폴백은 `isNotBlank() && != "배차값없음"` 뿐이라
 * *"가전"* 도 *"다마스"* 도 그대로 통과했다 (2026-08-29 전수조사에서 드러남).
 *
 * 🔴 **직접콜(MANUAL)은 서버가 심사하지 않는다** (규칙 ①). 그래서 깨진 주소가
 *    걸러지지 않고 그대로 경로의 기점이 된다 — 이 가드가 유일한 문이다.
 *
 * 여기서 검사하는 것은 **판정 규칙 자체**다 (순수 함수라 폰이 필요 없다).
 */
class AddressGuardTest {

    /** 실측에서 주소 칸에 들어왔던 값들 — 전부 막혀야 한다 */
    @Test
    fun `품목·차종은 주소가 아니다`() {
        val notAddresses = listOf(
            "가전",        // 품목 — 2026-08-28 실측
            "다마스",      // 차종 — 〃
            "1톤",
            "독차",
            "인수증",
            "당착",
        )
        for (t in notAddresses) {
            assertFalse("«$t» 이 주소로 통과하면 안 된다", InsungParser.looksLikeAddress(t))
        }
    }

    /**
     * ⚠️ **모양으로는 못 가르는 것이 있다 — 알고 두는 구멍이다** (2026-08-29).
     *
     * `냉동`(품목)은 「동」으로 끝나 이 가드를 통과한다. 그런데 라이브 장부에는
     * **하차지가 `중동`인 실제 콜**이 있다 (`8945db19` 쌍령동 → 중동). 둘 다 두 글자에
     * 「동」으로 끝나므로 **글자 모양으로는 구분이 불가능하다.**
     *
     * 🔴 여기서 길이 규칙이나 낱말 사전을 급조하지 않는다 — `중동`·`상동` 같은 진짜
     *    동 이름을 막으면 **멀쩡한 콜을 잃는다.** 앱은 느슨하게 올리고 서버가 정밀하게
     *    구분한다(규칙 ⑤)는 원칙에서도, 여기서 과하게 조이는 쪽이 더 나쁘다.
     *
     * 이 검사는 «막힌다»가 아니라 **«이 구멍을 알고 있다»** 를 못박는다. 실제로 품목이
     * 주소 칸에 들어오는 일이 반복되면 그때 서버 쪽 신호(좌표 변환 실패)로 잡는다.
     */
    @Test
    fun `모양이 같은 품목은 못 가른다 — 알고 두는 구멍`() {
        assertTrue("«중동» 은 실제 하차지다 — 막으면 콜을 잃는다",
            InsungParser.looksLikeAddress("중동"))
        assertTrue("«냉동» 도 같은 모양이라 통과한다 — 서버의 좌표 변환 실패로 잡는다",
            InsungParser.looksLikeAddress("냉동"))
    }

    /** 실제 배차망에서 오는 주소 꼴 — 전부 통과해야 한다 (너무 조이면 멀쩡한 콜을 잃는다) */
    @Test
    fun `행정구역·도로명이 있으면 주소다`() {
        val addresses = listOf(
            "경기 광주시 초월읍 경충대로 907",
            "경기 이천시 호법면 프리미엄아울렛로 177-74",
            "서울 강남구",
            "쌍령동",
            "경기 성남시 분당구 장미로86번길 17",
            "경기 광주시 경안동 22-1",
        )
        for (t in addresses) {
            assertTrue("«$t» 은 주소로 통과해야 한다", InsungParser.looksLikeAddress(t))
        }
    }

    /**
     * 🔴 **손으로 연 상세의 폴백도 같은 문을 지나야 한다.**
     *
     * 「가전 → 다마스」가 통과한 자리가 정확히 여기다. 가드가 한쪽 경로에만 있으면
     * *"주소 아니면 안 쓴다"* 는 주석이 거짓말이 된다 — 이 레포가 반복해 당한
     * «판단이 두 벌» 형태이기도 하다 (규칙 ③).
     *
     * 폴백이 쓰는 규칙을 그대로 옮겨 와 판정한다.
     */
    private fun fallbackAddress(raw: String): String =
        raw.takeIf { it.isNotBlank() && it != "배차값없음" && InsungParser.looksLikeAddress(it) }
            ?: "수집중(상세확인필요)"

    @Test
    fun `폴백은 주소가 아닌 값을 그대로 쓰지 않는다`() {
        assertEquals("수집중(상세확인필요)", fallbackAddress("가전"))
        assertEquals("수집중(상세확인필요)", fallbackAddress("다마스"))
        assertEquals("수집중(상세확인필요)", fallbackAddress("배차값없음"))
        assertEquals("수집중(상세확인필요)", fallbackAddress(""))
        // 진짜 주소는 그대로 살린다
        assertEquals("경기 광주시 초월읍 경충대로 907", fallbackAddress("경기 광주시 초월읍 경충대로 907"))
    }
}

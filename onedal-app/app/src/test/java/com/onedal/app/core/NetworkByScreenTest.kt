package com.onedal.app.core

import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🖥️ **배차망은 화면에 적힌 글자로 가른다** (기사님 확정 2026-09-14 · docs/기획/원달앱_시뮬레이터_낱말사전_정리.md ③)
 *
 * 기사님: *"진짜 픽커 리스트 페이지로 일을 하려 할 때 픽커가 우리 앱에게 «나 픽커입니다» 이렇게
 * 이야기 안 할 거잖아. 스캔앱은 페이지에 있는 값만으로도 이건 인성, 이건 픽커 리스트 페이지
 * 이렇게 알아야 된다."*
 *
 * 예전에는 폰 시스템이 붙여 주는 **앱 이름**으로 갈랐다(`codeOfPackage` — 지웠다). 실제 픽커 앱은
 * 이름이 달라 됐지만, 시뮬레이터 앱은 인성·24시·픽커 화면을 **한 앱**으로 띄우므로 늘 «인성»이 됐다.
 * 🔴 이 검사를 먼저 옛 방식에 걸어 **7건 중 5건 빨간불**을 확인했다 (2026-09-14) —
 *    시뮬레이터의 픽커·24시 화면 → insung · 실제 픽커 앱에 인성 글자 → kakaopicker · 두 배차망 섞임 → insung.
 *
 * 화면 글자는 전부 실물 캡처·시뮬레이터 화면에서 옮겼다 — 지어낸 화면이 아니다.
 *   픽커   : ex_images/카카오픽커/실물_2026/ 02(리스트) · 06(상세) · 16·17(수락 뒤) · 01(홈)
 *   화물24시: ex_images/화물24시/ 36(리스트) · 18(상세)
 *   인성   : onedal-sim 인성 화면 (실제 인성 앱은 아직 실물을 못 봤다)
 * ⚠️ 주소·동호수·전화번호는 옮기지 않았다 (실물 11~32 는 레포에 안 올리기로 한 자료다).
 */
class NetworkByScreenTest {

    // ── 픽커 ──
    private val pickerList = listOf(
        "퀵 배송", "도보배송", "대리", "한차배송", "퀵 오더카드 대기 중...",
        "리스트 설정", "높은 가격순", "20km",
        "퀵", "소형", "과천", "16,870", "15.2km", "분당", "서현1", "중앙",
        "서포트모드", "카드설정", "수요지도",
        "신규", "내 오더",          // 🔴 픽커에도 «신규» 탭이 있다 — 인성 표식과 한 글자가 겹친다
    )
    private val pickerDetail = listOf(
        "퀵", "단거리", "배송 31분 남음", "준비 17분 포함",
        "픽업 14.6km", "17:04까지 픽업", "배송 2.1km", "17:18까지 배송",
        "픽업 장소", "매장 직원에게 문의", "물품 정보", "소형", "유의사항",
        "넘기기", "수락하기",
    )
    private val pickerHome = listOf("어떤 일을 시작할까요", "퀵", "시작하기")
    private val pickerToPickup = listOf("배정 취소", "픽업 준비 13분 남음", "배송 33분 남음", "준비 13분 포함", "오더 확인")
    private val pickerAtPickup = listOf("오더 확인", "배송지", "배송 물품", "고객 요청", "도움이 필요하신가요?", "밀어서 픽업 완료")

    // ── 화물24시 (실물) ──
    private val hwamul24List = listOf(
        "화물정보", "자동새로고침", "ON", "오더검색", "자동터치", "OFF", "성공0건/최대15건",
        "인천 미추홀", "경기 안성 일죽면", "당상", "지", "17Km", "06:33", "당착",
        "3.5톤/윙", "당일상 당착 공파렛", "독차", "인수증", "120,000원",
        "홈", "마이페이지",
    )
    private val hwamul24Detail = listOf(
        "화물상세정보", "화물과퀵", "60분 안보기", "상차지", "경기 군포 부곡동", "당상", "5Km",
        "하차지", "서울 중구 을지로6가", "당착", "36Km", "화물정보", "지금상 당착 59박스",
        "독차", "톤수", "1톤", "차종", "전체", "운송료", "60,000", "부가세", "6,000",
        "결제방법", "카드", "배차신청", "돌아가기",
    )

    // ── 인성 (시뮬레이터) ──
    private val insungList = listOf("신규", "완료", "빠른설정", "출발지", "도착지", "차종", "요금", "경안동", "초월읍", "다", "3.5")
    private val insungDetail = listOf("출발지", "도착지", "요금 : 35,000(신용)", "적요상세", "확정")

    // ── 배차망이 아닌 화면 (2026-09-02 실측 로그) ──
    private val lockScreen = listOf("잠금해제 패턴을 그리세요", "긴급 전화")
    private val launcher = listOf("셀 1 추가됨", "카카오톡", "설정")

    private val allNetworkScreens = mapOf(
        TargetApp.KAKAOPICKER to listOf(pickerList, pickerDetail, pickerHome, pickerToPickup, pickerAtPickup),
        TargetApp.HWAMUL24 to listOf(hwamul24List, hwamul24Detail),
        TargetApp.INSUNG to listOf(insungList, insungDetail),
    )

    @Test
    fun `🔴 픽커 화면은 픽커다 - 리스트·상세·홈·수락 뒤 모두`() {
        assertEquals(TargetApp.KAKAOPICKER, TargetApp.networkOfScreen(pickerList))
        assertEquals(TargetApp.KAKAOPICKER, TargetApp.networkOfScreen(pickerDetail))
        assertEquals(TargetApp.KAKAOPICKER, TargetApp.networkOfScreen(pickerHome))
        assertEquals(TargetApp.KAKAOPICKER, TargetApp.networkOfScreen(pickerToPickup))
        assertEquals(TargetApp.KAKAOPICKER, TargetApp.networkOfScreen(pickerAtPickup))
    }

    @Test
    fun `🔴 화물24시 화면은 화물24시다 - 실물 리스트·상세`() {
        assertEquals(TargetApp.HWAMUL24, TargetApp.networkOfScreen(hwamul24List))
        assertEquals(TargetApp.HWAMUL24, TargetApp.networkOfScreen(hwamul24Detail))
    }

    @Test
    fun `인성 화면은 인성이다`() {
        assertEquals(TargetApp.INSUNG, TargetApp.networkOfScreen(insungList))
        assertEquals(TargetApp.INSUNG, TargetApp.networkOfScreen(insungDetail))
    }

    @Test
    fun `🔴 한 배차망 화면은 다른 배차망 표식에 걸리지 않는다 - 전부 대조`() {
        allNetworkScreens.forEach { (net, screens) ->
            screens.forEach { screen ->
                assertEquals("$net 화면에서 걸린 배차망: ${TargetApp.networksOnScreen(screen)}",
                    setOf(net), TargetApp.networksOnScreen(screen))
            }
        }
    }

    @Test
    fun `픽커 리스트의 신규 탭은 인성으로 오인되지 않는다`() {
        assertFalse(TargetApp.INSUNG in TargetApp.networksOnScreen(pickerList))
    }

    @Test
    fun `배차망 글자가 없는 화면은 모른다 - 지어내지 않는다 (규칙 4)`() {
        assertNull(TargetApp.networkOfScreen(lockScreen))
        assertNull(TargetApp.networkOfScreen(launcher))
        assertNull(TargetApp.networkOfScreen(emptyList()))
    }

    @Test
    fun `🔴 두 배차망 글자가 함께 보이면 모른다 - 화면이 넘어가는 중이다`() {
        assertEquals(setOf(TargetApp.INSUNG, TargetApp.KAKAOPICKER), TargetApp.networksOnScreen(insungList + pickerList))
        assertNull(TargetApp.networkOfScreen(insungList + pickerList))
    }

    @Test
    fun `🔴 빈 글자 묶음은 아무 화면에도 맞지 않는다 - 빈 필터는 고장이다 (규칙 4)`() {
        assertNull(NetworkByScreen.detect("아무 화면", mapOf("x" to listOf(emptyList()))))
    }

    @Test
    fun `표식 글자의 원천은 각 배차망 폴더의 화면 판별 사전이다 - 두 곳에 적지 않는다 (규칙 3)`() {
        assertTrue(InsungKeywords.INSUNG.listRequired in InsungKeywords.NETWORK_MARKERS)
        assertTrue(InsungKeywords.INSUNG.detailKeywords in InsungKeywords.NETWORK_MARKERS)
        assertTrue(Hwamul24Keywords.TWENTYFOUR.listRequired in Hwamul24Keywords.NETWORK_MARKERS)
        assertTrue(Hwamul24Keywords.TWENTYFOUR.detailKeywords in Hwamul24Keywords.NETWORK_MARKERS)
        assertTrue(KakaoPickerKeywords.PICKER.listRequired in KakaoPickerKeywords.NETWORK_MARKERS)
        assertTrue(KakaoPickerKeywords.PICKER.detailKeywords in KakaoPickerKeywords.NETWORK_MARKERS)
        KakaoPickerKeywords.STAGE_WORDS.flatMap { it.second }.forEach { w ->
            assertTrue("픽커 단계 글자 «$w» 가 표식에 없다", listOf(w) in KakaoPickerKeywords.NETWORK_MARKERS)
        }
    }

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    @Test
    fun `🔴 앱 이름으로 배차망을 가르던 길은 없다 - 원천은 화면 글자 하나`() {
        assertFalse(codeOnly("src/main/java/com/onedal/app/core/TargetApp.kt").contains("codeOfPackage"))
        val hijack = codeOnly("src/main/java/com/onedal/app/HijackService.kt")
        assertFalse(hijack.contains("codeOfPackage"))
        assertTrue("관문의 입력이 화면 글자가 아니다", hijack.contains("TargetApp.networksOnScreen(screenTexts)"))
    }

    @Test
    fun `🔴 설정 화면에 배차망 선택 칸이 없다`() {
        assertFalse(codeOnly("src/main/java/com/onedal/app/ui/SettingsScreen.kt").contains("saveTargetApp"))
        assertFalse(codeOnly("src/main/java/com/onedal/app/ui/MainViewModel.kt").contains("saveTargetApp"))
    }
}

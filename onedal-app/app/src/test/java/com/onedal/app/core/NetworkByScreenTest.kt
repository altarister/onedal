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
 * 🖥️ **배차망은 화면에 적힌 글자로 가른다** (기사님 확정)
 *
 * 기사님: *"진짜 픽커 리스트 페이지로 일을 하려 할 때 픽커가 우리 앱에게 «나 픽커입니다» 이렇게
 * 이야기 안 할 거잖아. 스캔앱은 페이지에 있는 값만으로도 이건 인성, 이건 픽커 리스트 페이지
 * 이렇게 알아야 된다."*
 *
 * 폰 시스템이 붙여 주는 **앱 이름**으로는 가르지 않는다 — 시뮬레이터 앱은 인성·24시·픽커 화면을 **한 앱**으로
 * 띄우므로 앱 이름으로 가르면 늘 «인성»이 된다. 이 검사가 그 모양을 문다 —
 *    시뮬레이터의 픽커·24시 화면 · 실제 픽커 앱에 인성 글자 · 두 배차망 섞임.
 *
 * 화면 글자는 전부 실물 캡처·시뮬레이터 화면에서 옮겼다 — 지어낸 화면이 아니다.
 *   픽커   : ex_images/카카오픽커/실물_2026/ 02(리스트) · 06(상세) · 16·17(수락 뒤) · 01(홈)
 *   화물24시: ex_images/화물24시/ 36(리스트) · 18(상세)
 *   인성   : onedal-sim 인성 화면 · 홈은 ex_images/인성/인성홈.png (목록 · 상세 실물은 아직 못 봤다)
 *   인성플렉스: ex_images/인성플렉스/ 02(목록) · 08(상세) · 01(홈) · 04(진행중 빈) 실물 xml 에서 옮긴 글자(손으로 적은 노드 목록)
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
    /** 배차신청 뒤 같은 화면 — 위 «배차취소하기» 막대 · 아래 «전화걸기 · 배차내역» (실물 54) */
    private val hwamul24AfterApply = listOf(
        "화물상세정보", "ID : 90075", "배차취소하기", "상차지", "경기 군포 당정동", "하차지", "경기 화성 신동 703",
        "톤수", "5톤", "차종", "윙바디", "운송료", "250,000", "결제방법", "인수증", "전화걸기", "배차내역", "배차신청에 성공하였습니다.",
    )

    // ── 인성 (시뮬레이터) ──
    /** 🏠 첫 화면 — 인성 «인성퀵화면분할» · 화물24시 «전국24시콜화물» */
    private val insungHome = listOf("인성퀵화면분할", "인성1,5,6,7그룹", "인성2,3,4그룹", "실행", "설정", "5:5", "종료", "원격지원요청")
    private val hwamul24Home = listOf("전국24시콜화물", "주요공지", "화물정보", "배차내역", "화물등록", "음성등록", "홈", "마이페이지", "환경설정")
    private val insungList = listOf("신규", "완료", "빠른설정", "출발지", "도착지", "차종", "요금", "경안동", "초월읍", "다", "3.5")
    private val insungDetail = listOf("출발지", "도착지", "요금 : 35,000(신용)", "적요상세", "확정")

    // ── 인성플렉스 (실물 xml) ──
    private val isflexList = listOf(
        "퇴근하기", "목록", "지도", "신규", "진행중", "AI 배차 대기중",
        "전체", "도보", "개인이동수단", "오토바이", "승용/소형",
        "출발지까지\n(km)", "출발지", "도착지", "수입",
        "24.3", "오토", "@낼08:20/수원이의동", "약 30.1km", "10:20전/쌍림동", "21,252",
    )
    private val isflexDetail = listOf(
        "@역삼동 → 대치동", "Google 지도", "출발지까지", "26.7km", "오토",
        "출발", "@서울 강남구 @역삼동", "약 2.3km", "도착", "서울 강남구 대치동",
        "적요상세", "1박스 3층 계단물건 있음", "착불", "총 수입", "8,500원", "닫기", "8,500원 \n수행하기",
    )
    private val isflexHome = listOf(
        "[퀵서비스협회x안전보건공단 교육 이수 인증 이벤트]", "모두보기",
        "현재 선택된 배송 수단", "승용/소형", "변경", "출근하기", "로지웨이(주)", "개인정보 처리방침",
    )
    private val isflexMyOrdersEmpty = listOf("퇴근하기", "목록", "지도", "신규", "진행중", "진행중인 오더가 없습니다")
    /** 08 상세의 적요에 «요금» 한 낱말을 더했다 — 실물 글자에 낱말 하나 더함 · 지어낸 화면 아님 */
    private val isflexDetailMemoFare = isflexDetail.map { if (it == "1박스 3층 계단물건 있음") "1박스 3층 계단물건 있음 요금" else it }

    // ── 배차망이 아닌 화면 (실측 로그) ──
    private val lockScreen = listOf("잠금해제 패턴을 그리세요", "긴급 전화")
    private val launcher = listOf("셀 1 추가됨", "카카오톡", "설정")

    private val allNetworkScreens = mapOf(
        TargetApp.KAKAOPICKER to listOf(pickerList, pickerDetail, pickerHome, pickerToPickup, pickerAtPickup),
        TargetApp.HWAMUL24 to listOf(hwamul24List, hwamul24Detail, hwamul24AfterApply, hwamul24Home),
        TargetApp.INSUNG to listOf(insungList, insungDetail, insungHome),
        TargetApp.ISFLEX to listOf(isflexList, isflexDetail, isflexHome, isflexMyOrdersEmpty),
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
    fun `🔴 화물24시 화면은 화물24시다 - 실물 리스트·상세·배차신청 뒤`() {
        assertEquals(TargetApp.HWAMUL24, TargetApp.networkOfScreen(hwamul24List))
        assertEquals(TargetApp.HWAMUL24, TargetApp.networkOfScreen(hwamul24Detail))
        assertEquals(TargetApp.HWAMUL24, TargetApp.networkOfScreen(hwamul24AfterApply))
    }

    @Test
    fun `인성 화면은 인성이다`() {
        assertEquals(TargetApp.INSUNG, TargetApp.networkOfScreen(insungList))
        assertEquals(TargetApp.INSUNG, TargetApp.networkOfScreen(insungDetail))
        // 지도형 상세(영상 0948) — 인성 표식 «적요상세 + 요금» 으로 알아본다
        assertEquals(TargetApp.INSUNG, TargetApp.networkOfScreen(listOf("@독산동 → 면목동", "출발지까지 1.5km", "요금 26,900원", "적요상세 6시30분 픽업", "닫기", "수행하기")))
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
    fun `🔴 인성 화면은 인성플렉스로 바뀌지 않는다`() {
        listOf(insungList, insungDetail, insungHome).forEach { screen ->
            assertFalse(TargetApp.ISFLEX in TargetApp.networksOnScreen(screen))
            assertNull(NetworkSwitchGate.switchTargetFor(TargetApp.networkOfScreen(screen), TargetApp.INSUNG))
        }
    }

    @Test
    fun `🔴 인성플렉스 화면은 인성플렉스로 간다 - 목록 · 상세 · 홈 · 진행중 빈`() {
        listOf(isflexList, isflexDetail, isflexHome, isflexMyOrdersEmpty).forEach { screen ->
            assertFalse(TargetApp.INSUNG in TargetApp.networksOnScreen(screen))
            assertEquals(TargetApp.ISFLEX, NetworkSwitchGate.switchTargetFor(TargetApp.networkOfScreen(screen), TargetApp.INSUNG))
        }
    }

    /** 인성 칸으로 적힌 실물 «알 수 없는 화면» 기록(10-07 · 10-18) — 플렉스 마이플렉스 메뉴 화면 글이다 · 이름 · 전화는 가렸다 */
    private val isflexMyFlexMenu = listOf(
        "마이플렉스", "○○○", "0**-****-****", "더 많은 혜택!\n프리미엄 기사로 전환하기", "적립금내역", "0원", "수행내역",
        "미션", "이벤트 내역", "보험안내 및 접수", "내 정보 관리", "내 배송 수단 관리", "이용안내", "공지사항", "이벤트",
        "자주 묻는 질문", "고객센터 연결", "다크 모드 설정", "약관 및 정책", "버전정보", "V.1.4.5",
    )

    /**
     * 지금은 어느 배차망 표식에도 안 걸려 모른다(null) — 갈아타지 않는다.
     * 플렉스 표식 `["마이플렉스", "적립금내역"]` 을 더하면 배차망 갈아타기가 바뀌어 운행 변화 — 원달앱 걸음(걸음 5)에서.
     */
    @Test
    fun `인성 칸으로 적힌 플렉스 마이플렉스 화면 글은 지금 모른다`() {
        assertNull(TargetApp.networkOfScreen(isflexMyFlexMenu))
        assertNull(NetworkSwitchGate.switchTargetFor(TargetApp.networkOfScreen(isflexMyFlexMenu), TargetApp.INSUNG))
    }

    @Test
    fun `🔴 적요에 요금이 든 인성플렉스 상세는 두 배차망 표식에 다 걸려 갈아타지 않는다`() {
        assertEquals(setOf(TargetApp.INSUNG, TargetApp.ISFLEX), TargetApp.networksOnScreen(isflexDetailMemoFare))
        assertNull(NetworkSwitchGate.switchTargetFor(TargetApp.networkOfScreen(isflexDetailMemoFare), TargetApp.INSUNG))
        assertNull(NetworkSwitchGate.switchTargetFor(TargetApp.networkOfScreen(isflexDetailMemoFare), TargetApp.ISFLEX))
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
    fun `표식 글자는 각 배차망 폴더에 목록 · 상세 글자로 한 번 - 운행 단계 글자도 표식이다`() {
        assertTrue(listOf("신규", "빠른설정") in com.onedal.app.plugins.insung.InsungPages.networkMarkers)
        assertTrue(listOf("적요상세", "요금") in com.onedal.app.plugins.insung.InsungPages.networkMarkers)
        assertTrue(listOf("화물정보", "자동새로고침") in com.onedal.app.plugins.hwamul24.Hwamul24Pages.networkMarkers)
        assertTrue(listOf("화물상세정보", "운송료") in com.onedal.app.plugins.hwamul24.Hwamul24Pages.networkMarkers)
        assertTrue(listOf("리스트 설정") in com.onedal.app.plugins.kakaopicker.KakaoPickerPages.networkMarkers)
        assertTrue(listOf("넘기기", "수락하기") in com.onedal.app.plugins.kakaopicker.KakaoPickerPages.networkMarkers)
        KakaoPickerKeywords.STAGE_WORDS.flatMap { it.second }.forEach { w ->
            assertTrue("픽커 단계 글자 «$w» 가 표식에 없다", listOf(w) in com.onedal.app.plugins.kakaopicker.KakaoPickerPages.networkMarkers)
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

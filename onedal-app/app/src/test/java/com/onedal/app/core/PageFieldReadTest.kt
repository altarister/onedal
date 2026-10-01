package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📄 **화면 칸은 플러그인 정의(FieldSpec.read)대로 읽는다** (기사님 «가» — «그건 플러그인에서 정의해야 하는 거야» · onedal-69).
 * 로컬 10-02 03:42 — 기사님이 손으로 연 인성 상세가 «요건 미달 — 요금 없음»으로 버려졌다. 목록 규칙(차종 다음 칸의 만 단위 숫자)을
 * 상세 글에 돌려 요금이 0 이 됐다. 상세 · 확정 화면의 요금은 그 화면의 정의로 읽는다 — 공통 길은 배차망 이름을 모른다.
 */
class PageFieldReadTest {
    /** 03:40:28 원달앱이 서버에 보낸 인성(시뮬) 상세 원문 — 노드를 한 줄로 이은 그대로 */
    private val insungDetail = listOf("고양퀵서비스-031-932-7722 전표 상태 : 신규 물품 : 박스 1개 차량 : 다마스 탁송료 : 수수료 : 23% 요금 : 50,000(카드) 구분 : 편도 형태 : 보통 적요상세 *카고 입니다. 세금계산서필 03:57 상차.")
    /** 03:42:39 새 글자 예시와 같은 줄 — 탁송료 칸이 비어 있다 */
    private val insung5t = listOf("전표", "상태 : 신규", "물품 : 샘플 박스", "차량 : 5t", "탁송료 :", "수수료 : 23%", "요금 : 150,000(카드)", "구분 : 편도")
    /** 화물24시 실물 상세 노드(NetworkByScreenTest 의 실물) — 운송료와 값이 다른 노드 */
    private val hwamul24Real = listOf("화물상세정보", "상차지", "경기 군포 부곡동", "하차지", "서울 중구 을지로6가", "톤수", "1톤", "차종", "전체",
        "운송료", "60,000", "부가세", "6,000", "결제방법", "카드", "배차신청")
    /** 화물24시 시뮬 상세 노드 — 값에 «원»이 붙는다(Hwamul24CallDetailScreen) */
    private val hwamul24Sim = listOf("운송료", "60,000원", "부가세", "6,000원")

    @Test fun `인성 상세 - 요금 줄을 정의대로 읽는다`() {
        assertEquals("50,000", PageFieldRead.fieldOf(InsungPages.pages, Page.DETAIL, PageField.FARE, insungDetail))
        assertEquals(50000, PageFieldRead.fareOf(InsungPages.pages, Page.DETAIL, insungDetail))
    }

    @Test fun `인성 상세 - 탁송료 빈칸에 안 속는다`() {
        assertEquals(150000, PageFieldRead.fareOf(InsungPages.pages, Page.DETAIL, insung5t))
    }

    @Test fun `인성 확정 화면도 요금 줄을 읽는다 - 정의의 READ 가 참이다`() {
        assertEquals(40000, PageFieldRead.fareOf(InsungPages.pages, Page.CONFIRM, listOf("출발지", "도착지", "요금 : 40,000(신용)", "확정")))
    }

    @Test fun `화물24시 상세 - 실물 노드와 시뮬 노드 둘 다 운송료`() {
        assertEquals(60000, PageFieldRead.fareOf(Hwamul24Pages.pages, Page.DETAIL, hwamul24Real))
        assertEquals(60000, PageFieldRead.fareOf(Hwamul24Pages.pages, Page.DETAIL, hwamul24Sim))
    }

    @Test fun `줄이 없거나 정의에 읽는 법이 없으면 null - 지어내지 않는다`() {
        assertNull(PageFieldRead.fareOf(InsungPages.pages, Page.DETAIL, listOf("전표", "차량 : 다마스")))
        assertNull(PageFieldRead.fareOf(InsungPages.pages, Page.DETAIL, listOf("요금 : (카드)")))
        assertNull(PageFieldRead.fareOf(KakaoPickerPages.pages, Page.DETAIL, listOf("최종 수익 2,387")))   // 픽커는 사진이 채운다(무변화)
    }

    @Test fun `요금이 비었을 때만 채운다 - 앱이 연 콜의 목록 값은 그대로`() {
        val empty = SimplifiedOfficeOrder(id = "o", pickup = "배차값없음", dropoff = "배차값없음", fare = 0, timestamp = "t")
        assertEquals(50000, PageFieldRead.withFare(empty, InsungPages.pages, Page.DETAIL, insungDetail).fare)
        assertEquals(30000, PageFieldRead.withFare(empty.copy(fare = 30000), InsungPages.pages, Page.DETAIL, insungDetail).fare)
        assertEquals(0, PageFieldRead.withFare(empty, KakaoPickerPages.pages, Page.DETAIL, listOf("최종 수익 2,387")).fare)
    }

    @Test fun `공통 길은 배차망 이름으로 가르지 않는다`() {
        val names = Regex("""insung|hwamul24|kakaopicker|인성|24시|픽커""", RegexOption.IGNORE_CASE)
        val code = { p: String -> File("src/main/java/com/onedal/app/$p").readText()
            .replace(Regex("""/\*[\s\S]*?\*/"""), "").replace(Regex("""//.*"""), "") }
        assertTrue("PageFieldRead 에 배차망 이름", !names.containsMatchIn(code("core/PageFieldRead.kt")))
        val pre = code("core/engine/PreConfirmSequence.kt")
        assertTrue("PreConfirmSequence 가 정의로 요금을 채우지 않는다", pre.contains("PageFieldRead.withFare(") && pre.contains("plugin.pages"))
    }
}

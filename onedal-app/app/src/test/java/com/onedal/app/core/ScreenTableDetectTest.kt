package com.onedal.app.core

import com.google.gson.JsonParser
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.plugins.IDispatchAppPlugin
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧪 **화면 판별은 배차망 정의 표대로** (reviews/35 2단계).
 * 문제지 `onedal-web/shared/src/screenCases.json` — 실물 캡처 고정 글자 · 시뮬레이터 견본 · A24 폰이 올린 화면 원문.
 * 줄마다 `expect`(표 판별)와 같아야 한다. `was`(옛 판별)와 다른 줄이 2단계에서 바뀌는 화면 전부다 — 그 밖은 0.
 */
class ScreenTableDetectTest {
    private data class Case(val network: String, val why: String, val text: String, val was: String, val expect: String)

    private val cases: List<Case> by lazy {
        val json = JsonParser.parseString(File("../../onedal-web/shared/src/screenCases.json").readText()).asJsonObject
        json["cases"].asJsonArray.map { it.asJsonObject }.map {
            Case(it["network"].asString, it["why"].asString, it["text"].asString, it["was"].asString, it["expect"].asString)
        }
    }

    private val plugins: Map<String, IDispatchAppPlugin> =
        mapOf("insung" to InsungPlugin(), "hwamul24" to Hwamul24Plugin(), "kakaopicker" to KakaoPickerPlugin())

    /** 원달앱이 이 화면을 무엇으로 보나 — 건너뛰는 화면(로딩 · 자동터치 동의)은 «SKIP» */
    private fun classify(network: String, text: String): String {
        val read = ScreenDetector().detect(text, plugins.getValue(network).screens)
        return if (read.skip) "SKIP" else read.context.name
    }

    @Test fun `문제지가 있다 - 세 배차망 · 바뀌는 줄과 안 바뀌는 줄`() {
        assertEquals(setOf("insung", "hwamul24", "kakaopicker"), cases.map { it.network }.toSet())
        assertTrue(cases.any { it.was != it.expect })
        assertTrue(cases.count { it.was == it.expect } > 100)
    }

    @Test fun `모든 줄이 표 판별대로 읽힌다`() {
        val wrong = cases.mapNotNull { c ->
            val got = classify(c.network, c.text)
            if (got == c.expect) null else "${c.network} ${c.why} — 기대 ${c.expect} · 지금 $got (옛 ${c.was}) · ${c.text.take(80)}"
        }
        assertEquals("표 판별과 다른 줄 ${wrong.size}\n" + wrong.joinToString("\n"), 0, wrong.size)
    }

    /**
     * 📡 **서버로 보내는 값은 페이지 값** (reviews/35 5단계) — 원달앱 안 값의 팝업(POPUP_*)은 상세(DETAIL_*)로 · 목록 복귀 내 오더(LIST_COMPLETED)는 MY_ORDERS 로.
     * 그 밖은 안 값과 같다 · 표가 아는 화면이면 페이지 이름이 실린다.
     */
    @Test fun `보내는 값은 페이지 값 - 팝업은 상세 · 목록 복귀 내 오더는 MY_ORDERS`() {
        val wrong = cases.mapNotNull { c ->
            val r = ScreenDetector().detect(c.text, plugins.getValue(c.network).screens)
            if (r.skip) return@mapNotNull null
            val want = when (r.context.name) {
                "POPUP_PICKUP", "POPUP_DROPOFF", "POPUP_MEMO", "POPUP_ERROR" -> setOf("DETAIL_PRE_CONFIRM", "DETAIL_CONFIRMED")
                "LIST_COMPLETED" -> setOf("MY_ORDERS")
                else -> setOf(r.context.name)
            }
            val pageOk = r.context.name == "UNKNOWN" || r.page != null
            if (r.wire.name in want && pageOk) null else "${c.network} ${c.why} — 안 ${r.context} · 보냄 ${r.wire} · 페이지 ${r.page}"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    /** 🧭 실물 인성 팝업은 화면 전체를 덮어 페이지 글자가 없다 — 직전 페이지 위의 팝업으로 본다(확정 전 상세에서 연 출발지 팝업은 확정 전 상세) */
    @Test fun `페이지 글자 없는 팝업은 직전 페이지 위의 덧칸`() {
        val popup = "출발지 상세 고객 부서 담당 마일리지 전화1 전화2 출발 위치 닫기 위치보기 위치저장 길안내"
        val insung = plugins.getValue("insung").screens
        val r = ScreenDetector().detect(popup, insung, lastPage = "확정 전 상세")
        assertEquals("POPUP_PICKUP", r.context.name)
        assertEquals("DETAIL_PRE_CONFIRM", r.wire.name)
        assertEquals("확정 전 상세", r.page)
        assertEquals("출발지 상세 팝업", r.overlay)
        assertEquals("DETAIL_CONFIRMED", ScreenDetector().detect(popup, insung, lastPage = "확정 뒤 상세").wire.name)
    }

    /**
     * 🧭 **픽커 목록 위 덧칸 · 목록에서 들어가는 페이지는 이름으로 읽힌다** (운영센터 이상 기록 «미등록» A24 원문).
     * 덧칸만 보이는 판(시트 · 팝업이 목록을 가린다)은 주인 페이지 «신규 리스트» 위의 덧칸이다 — 원달앱은 그 화면에서 아무것도 안 누른다(action 없음).
     */
    @Test fun `픽커 목록 위 덧칸과 목록에서 들어가는 페이지는 이름이 있다`() {
        val picker = plugins.getValue("kakaopicker").screens
        fun named(text: String) = ScreenDetector().detect(text, picker, lastPage = "신규 리스트").let { "${it.wire} · ${it.page} · ${it.overlay}" }
        assertEquals("LIST · 신규 리스트 · 오더 탐색 종료 확인", named("close dialog 오더 탐색을 종료하시겠어요? 취소 확인"))
        assertEquals("LIST · 신규 리스트 · 정렬 시트", named("정렬 추천순 픽업지 가까운순 check 높은 가격순"))
        assertEquals("NETWORK_MENU · 퀵 배송 오더카드 설정 · null", named("오더카드 받기 소리 알림 켜기 진동 알림 켜기"))
        assertEquals("NETWORK_MENU · 수요지도 · null", named("대리 퀵 배송 tracking button 시간별 오더 정보 지금 10분 후 20분 후 30분 후 60분 후"))
        assertEquals("NETWORK_MENU · 메뉴 · null", named("공지사항 수행방법 안내 포인트 내역 수행 내역 자주묻는질문 고객센터 연결하기 뒤로가기 메뉴"))
        assertEquals("TRANSITION · 상세 시트가 닫히는 찰나 · null", named("픽업지 경기 하남시 신장1동 백억커피-하남시청역점"))
        assertEquals("NETWORK_MENU · 내 활동(미션 & 혜택) · null", named("내 배지 배지가 없어요 배지를 획득 해보세요 미션 & 혜택 퀵 배송 대리 완료한 미션"))
        // 목록을 맨 아래까지 내리면 구인 광고만 남는다 — 광고 표시 «Ad» 와 아래 탭으로 신규 리스트
        assertEquals("LIST · 신규 리스트 · null", named("픽커에서 알바도 만나보세요 Ad 프로필 등록하고, 다양한 일을 만나보세요 정기배송·운전 경기 하남시 모집 중 월급 263만원 신규 내 오더"))
        assertEquals("NETWORK_MENU · 메뉴 · null", named("변경 프로필 사진 기본 아이콘 공지사항 arrow icon 수행방법 안내 arrow icon 포인트 내역 arrow icon"))
        assertEquals("NETWORK_MENU · 메뉴 · null", named("변경 프로필 사진 기본 아이콘 arrow icon"))
        // 덧칸 둘은 할 일이 없다 — 팝업 «확인»(탐색 종료)을 누르는 갈래가 생기면 안 된다
        val overlays = picker.flatMap { it.overlays }.filter { it.name == "오더 탐색 종료 확인" || it.name == "정렬 시트" }
        assertEquals(2, overlays.size)
        assertTrue(overlays.all { it.action == null })
    }
}


package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🚚 **퀵 흰 페이지를 알아본다** — 실물 17-1 «픽업 출발» · 17-2 «픽업 이동» · 22-1 «배송»
 *
 * 퀵은 도보(지도 위 시트 · «밀어서 …»)와 페이지가 다르다. 머리 글자(«지금 바로 출발해 주세요» 등)는 원달앱이 못 읽는다
 * (`log/1dal-주행로그-20260913/폰로그/A24_logcat_전체_1000-1210.log` 11:55~11:56). 그래서 **두 겹**으로 가른다:
 *   ① 퀵 페이지 표식(«픽업지 정보» · «도착지 정보» · «픽업지 주소 복사하기» · «픽업지에 전화하기» …)이 하나라도 보이고
 *   ② 바닥 버튼 글자로 차례를 안다 — 출발하기 = 이동(TO) · 완료하기 = 완료 대기(AT). 도보가 «밀어서 픽업 완료»를 AT 로 보는 것과 같다
 * 퀵 한 콜의 버튼 네 번이 «픽업 이동 → 픽업 도착 → 배송 이동 → 배송 도착» 순서로 찍힌다.
 */
class PickerQuickPageTest {
    private val k = KakaoPickerKeywords

    /** 🟢 실물 A24 로그 11:56:32 — 화면 위쪽 (복사 · 전화 버튼 이름이 읽힌다) */
    private val realDepartTop = "픽업지 정보 경기 용인시 기흥구 어정로 100 조영프라자 111,112호 경기 용인시 기흥구 어정로 100 조영프라자 111,112호 " +
        "픽업지 주소 복사하기 난향 난향 픽업지에 전화하기 도착지 정보 경기 용인시 기흥구 강남동로 92 강남마을주공8단지아파트 803동 " +
        "도착지 주소 복사하기 강남마을주공8단지아파트, 803동103호 요기요 고객 도착지에 전화하기 픽업 장소 매장 직원에게 문의 " +
        "오더번호 F26091311081J8E3 뒤로가기 배정 취소 픽업 출발하기"

    /** 🟢 실물 A24 로그 11:55:15 — 스크롤된 화면 («도착지 정보»부터 · 복사·전화 이름이 없다) */
    private val realDepartScrolled = "도착지 정보 경기 용인시 기흥구 강남동로 92 강남마을주공8단지아파트 803동 픽업 장소 매장 직원에게 문의 " +
        "오더번호 F26091311081J8E3 물품 정보 소형 나홀로세트 메뉴: D.탕수육+간짜장 요기요 주문번호 : 2883 유의사항 " +
        "문 앞에 두고 사진 보내주세요 (벨X, 노크X) 최종 수익 7,800 7,800 배송비 3,800P 3,800P 프로모션 4,000P 4,000P 뒤로가기 배정 취소 픽업 출발하기"

    /** 시뮬레이터 퀵 페이지 — 원달앱 로그 09-16 03:23:49 · 03:23:58 · 03:24:00 (실물 17-2 · 22-1 과 같은 짜임) */
    private val body = "픽업지 정보 경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점 픽업지 주소 복사하기 초월읍 모다아울렛 곤지암점 픽업지에 전화하기 " +
        "도착지 정보 경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점 도착지 주소 복사하기 신둔면 신둔농협하나로마트 예스파크점 도착지에 전화하기 "
    private val pickupGoing = body + "픽업 장소 매장 직원에게 문의 오더번호 260916032256633 물품 정보 초소형 최종 수익 10,000 배송비 10,000P 오더 수행 팁 고객센터 연결 뒤로가기 배정 취소 픽업 완료하기"
    private val dropoffDepart = body + "물품 정보 초소형 세 변의 합 70cm ∙ 2kg 이하 최종 수익 10,000 배송비 10,000P 오더 수행 팁 고객센터 연결 뒤로가기 배송 출발하기"
    private val dropoffGoing = body + "물품 정보 초소형 세 변의 합 70cm ∙ 2kg 이하 최종 수익 10,000 배송비 10,000P 오더 수행 팁 고객센터 연결 뒤로가기 배송 완료하기"

    @Test
    fun `실물 17-1 픽업 출발 페이지는 픽업 이동이다 - 위쪽 화면도 스크롤된 화면도`() {
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, k.stageOf(realDepartTop))
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, k.stageOf(realDepartScrolled))
    }

    @Test
    fun `버튼 네 번의 차례가 순서대로 읽힌다 - 출발하기는 이동 · 완료하기는 완료 대기`() {
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, k.stageOf(realDepartTop))
        assertEquals(KakaoPickerKeywords.Stage.AT_PICKUP, k.stageOf(pickupGoing))
        assertEquals(KakaoPickerKeywords.Stage.TO_DROPOFF, k.stageOf(dropoffDepart))
        assertEquals(KakaoPickerKeywords.Stage.AT_DROPOFF, k.stageOf(dropoffGoing))
    }

    @Test
    fun `네 화면 모두 수락 뒤로 인정한다 - 잡은 콜로 올릴 수 있다`() {
        listOf(realDepartTop, realDepartScrolled, pickupGoing, dropoffDepart, dropoffGoing)
            .forEach { assertTrue(it.takeLast(20), k.isAcceptedScreen(it)) }
    }

    @Test
    fun `두 겹 - 퀵 페이지 표식 없이 버튼 글자만으로는 단계가 아니다`() {
        assertNull(k.stageOf("배송 완료하기"))
        assertNull(k.stageOf("픽업 출발하기"))
    }

    @Test
    fun `문자 전송 화면의 배송 완료는 퀵 배송 완료하기가 아니다`() {
        assertNull(k.stageOf("뒤로가기 문자 전송 문자 전송 후 배송 완료버튼을 눌러주세요. 문자 재전송 배송 완료"))
    }

    @Test
    fun `수락하기가 보이면 퀵 표식이 있어도 계약 전이다`() {
        assertNull(k.stageOf(realDepartTop + " 넘기기 수락하기"))
        assertFalse(k.isAcceptedScreen(realDepartTop + " 넘기기 수락하기"))
    }

    @Test
    fun `도보 페이지는 그대로 읽힌다 - 퀵 규칙이 도보를 가로채지 않는다`() {
        assertEquals(KakaoPickerKeywords.Stage.AT_PICKUP, k.stageOf("배송 물품 가지러 왔습니다 오더 확인 260902091827593 도움이 필요하신가요? 밀어서 픽업 완료"))
        assertEquals(KakaoPickerKeywords.Stage.TO_DROPOFF, k.stageOf("배송 시간 15분 남음 쌍용 스윗닷홈아파트 물품 파손/분실을 주의해 이동해주세요"))
    }

    @Test
    fun `퀵 페이지 표식은 배차망 표식에도 들어간다 - 퀵 페이지도 픽커 화면이다`() {
        k.QUICK_PAGE_MARKERS.forEach { assertTrue(it, listOf(it) in k.NETWORK_MARKERS) }
        k.QUICK_STAGE_BUTTONS.forEach { (_, button) -> assertTrue(button, k.ACCEPTED_SCREEN_WORDS.contains(button)) }
    }
}

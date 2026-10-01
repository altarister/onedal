package com.onedal.app.plugins.insung

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling.DROPPED
import com.onedal.app.core.Handling.READ
import com.onedal.app.core.Handling.UNUSED
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.Seen.REAL
import com.onedal.app.core.Seen.SIM
import com.onedal.app.core.Seen.UNKNOWN

/**
 * 📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/인성 · 시뮬 onedal-sim).
 * ⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다.
 */
object InsungPages {
    val pages: PageSpecs = mapOf(
        Page.LIST to listOf(
            FieldSpec(PageField.PICKUP, "출발지 칸", "@초이동 · @남양주(오남", REAL, READ, "InsungParser.parse"),
            FieldSpec(PageField.DROPOFF, "도착지 칸", "이태원동 · 김포(대곶면", REAL, READ, "InsungParser.parse"),
            FieldSpec(PageField.RESERVATION, "출발지 칸 앞글자", "낼7시/ · 낼6시30/ · 21시/ · 오후7시30/ · 10일/", REAL, READ, "InsungParser.reservationOf"),
            FieldSpec(PageField.CLOCK, "도착지 칸 앞글자 (도착 약속)", "낼8/ · 8시/ · 낼10시/", REAL, DROPPED, "InsungParser.parse — 출발지 쪽이 있으면 버림"),
            FieldSpec(PageField.VEHICLE_TYPE, "차종 칸", "1t · 다 · 라 · 1t화물", REAL, READ, "InsungParser.readVehicleAndFare"),
            FieldSpec(PageField.FARE, "요금 칸 (만 원)", "40.0 · 270.0", REAL, READ, "InsungParser.readVehicleAndFare"),
            FieldSpec(PageField.PICKUP_DISTANCE, "거리 칸 윗줄", "17.8", REAL, READ, "InsungParser.parse"),
            FieldSpec(PageField.DELIVERY_DISTANCE, "거리 칸 아랫줄", "0.0 · 341.3", REAL, READ, "InsungParser.parse"),
        ),
        Page.DETAIL to listOf(
            FieldSpec(PageField.STAGE, "상태 줄", "상태 : 배송", REAL, UNUSED),
            FieldSpec(PageField.ITEM_SIZE, "물품 줄", "물품 :", REAL, UNUSED),
            FieldSpec(PageField.VEHICLE_TYPE, "차량 줄", "차량 : 트럭-1t · 다마스", REAL, UNUSED),
            FieldSpec(PageField.FARE, "요금 줄", "요금 : 85,000(신용)(계산서)", REAL, READ, "목록 값 · 목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)",
                read = Regex("""요금\s*:\s*([\d,]+)""")),
            FieldSpec(PageField.PAYMENT, "요금 줄 괄호", "(신용)(계산서)", REAL, UNUSED),
            FieldSpec(PageField.COMMISSION, "수수료 줄", "수수료 : 23%", REAL, UNUSED),
            FieldSpec(PageField.TAGS, "구분 줄", "구분 : 편도", REAL, UNUSED),
            FieldSpec(PageField.RESERVATION, "형태 줄", "형태 : 보통 (실물에서 «예약»은 못 봄)", UNKNOWN, UNUSED),
            FieldSpec(PageField.MEMO, "적요 칸 · 적요 상세 팝업", "1시상차 6박스 카트가지고 고객님앞 갖다주세요", REAL, UNUSED, "서버가 원문으로 받는다"),
            FieldSpec(PageField.PICKUP_DISTANCE, "적요 칸 둘째 줄", "현위치 → 상차지(직선)23.5KM", REAL, UNUSED),
            FieldSpec(PageField.DELIVERY_DISTANCE, "적요 칸 셋째 줄", "상차지 → 하차지(직선)35.9KM", REAL, UNUSED),
            FieldSpec(PageField.PICKUP, "출발지 상세 팝업 «위치»", "경기 용인시 처인구 양지면 …", SIM, READ, "InsungPopupAddress"),
            FieldSpec(PageField.DROPOFF, "도착지 상세 팝업 «위치»", "서울 강남구 역삼동 …", SIM, READ, "InsungPopupAddress"),
            FieldSpec(PageField.CLOCK, "출발지 줄 가운데", "김유정 / 20시/양지면(용인", REAL, UNUSED),
            FieldSpec(PageField.CONTACT, "위치 팝업", "고객 · 부서 · 담당 · 전화1 · 전화2", SIM, UNUSED, "서버가 원문으로 받는다"),
        ),
        Page.CONFIRM to listOf(
            FieldSpec(PageField.PICKUP, "출발지 줄", "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", REAL, READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.DROPOFF, "도착지 줄", "서울강남구 / 역삼동 / 이희억", REAL, READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.FARE, "요금 줄", "요금 : 40,000(신용)", REAL, READ, "InsungSequence.buildOrderFromScreen — PageFieldRead",
                read = Regex("""요금\s*:\s*([\d,]+)""")),
            FieldSpec(PageField.CONTACT, "머리 줄", "(주)신한로직스-1588-5480", REAL, UNUSED),
            FieldSpec(PageField.MEMO, "적요 칸", "1시상차 6박스 …", REAL, UNUSED),
        ),
        Page.MY_ORDERS to listOf(
            FieldSpec(PageField.STAGE, "완료 탭 줄 배지", "완료", SIM, UNUSED),
            FieldSpec(PageField.CONTACT, "완료 탭 줄", "회사 이름", SIM, UNUSED),
            FieldSpec(PageField.CLOCK, "완료 탭 줄", "상차 시각 · 하차 시각", SIM, UNUSED),
        ),
    )
}

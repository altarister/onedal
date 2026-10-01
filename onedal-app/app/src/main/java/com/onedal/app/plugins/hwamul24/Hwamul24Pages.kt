package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.Seen

/**
 * 📄 **화물24시 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/화물24시).
 * ⚠️ 실물 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처가 근거다. 시뮬 상세 화면은 실물과 모양이 달라(머리 «배차내역») 상세까지 못 간다.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/networkPages.ts` 의 «hwamul24» — 서버도 같은 표를 읽는다(reviews/34).
 */
object Hwamul24Pages {
    val pages: PageSpecs = mapOf(
        Page.LIST to listOf(
            FieldSpec(PageField.PICKUP, "왼쪽 윗줄", "경기 시흥 정왕동", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            FieldSpec(PageField.DROPOFF, "오른쪽 윗줄", "경기 안산 상록구 장상동", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            FieldSpec(PageField.FARE, "오른쪽 아랫줄", "50,000원", Seen.REAL, Handling.READ, "Hwamul24CardGrouping.fareOf"),
            FieldSpec(PageField.VEHICLE_TYPE, "셋째 줄 앞", "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            FieldSpec(PageField.PICKUP_DISTANCE, "상차 배지 옆", "15Km", Seen.REAL, Handling.READ, "Hwamul24CardGrouping.pickupDistanceOf"),
            FieldSpec(PageField.RESERVATION, "상차 배지", "당상 · 내상(실물 캡처에는 없음)", Seen.REAL, Handling.READ, "Hwamul24Parser.reservationOf"),
            FieldSpec(PageField.TAGS, "하차 배지 · 꼬리표", "당착 · 내착 (읽음) · 수 · 지 · 독차 · 인수증 (잡음으로 뺌)", Seen.REAL, Handling.READ, "Hwamul24Parser.badgesOf"),
            FieldSpec(PageField.MEMO, "셋째 줄 화물 글", "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상", Seen.REAL, Handling.READ, "Hwamul24MemoTimes.split — 상차 쪽만 예약으로"),
            FieldSpec(PageField.CLOCK, "하차 배지 앞 시각", "06:32 (등록 시각인지 모름)", Seen.REAL, Handling.READ, "Hwamul24Parser.parse — postTime"),
        ),
        Page.DETAIL to listOf(
            FieldSpec(PageField.ORDER_NO, "머리", "화물번호:3-9483-2159", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "머리", "등록시간:05:18분", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "상차지 칸", "경기 군포 부곡동 [당상][수] 5Km", Seen.REAL, Handling.UNUSED, "목록 값을 쓴다"),
            FieldSpec(PageField.DROPOFF, "하차지 칸", "서울 중구 을지로6가 [당착][수]", Seen.REAL, Handling.UNUSED, "목록 값을 쓴다"),
            FieldSpec(PageField.DELIVERY_DISTANCE, "하차지 칸 오른쪽", "36Km", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.MEMO, "화물정보 칸", "지금상 당착 59박스 수/수-A [독차]", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «화물정보» 다음 «톤수» 앞(배지 «독차» 포함) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""화물정보\s+(?!톤수)([\s\S]*?)(?=\s+톤수|${'$'})""")),
            FieldSpec(PageField.VEHICLE_TYPE, "톤수 · 차종 · 적재중량", "1톤 · 전체 · 1톤", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.TAGS, "운행방법", "편도", Seen.REAL, Handling.UNUSED),
            /* 💰 목록 요금과 같은 «운송료»만 — 실물은 «운송료» · «60,000» 이 다른 노드, 시뮬은 «60,000원» (부가세 · 수납금액은 안 읽음) */
            FieldSpec(PageField.FARE, "운송료 · 부가세 · 수납금액", "60,000 · 6,000 · 65,144", Seen.REAL, Handling.READ, "목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)",
                read = Regex("""운송료\s*:?\s*([\d,]+)""")),
            FieldSpec(PageField.PAYMENT, "결제방법", "카드", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «카드» · «착불» · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""결제방법\s+(?!\S*\s*:)(\S+)""")),
            FieldSpec(PageField.COMMISSION, "수수료 줄", "수수료 = (운송료+부가세) x1.298%", Seen.REAL, Handling.UNUSED),
        ),
        Page.CONFIRM to listOf(
            FieldSpec(PageField.STAGE, "배차신청 뒤 화면", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
        ),
        Page.MY_ORDERS to listOf(
            FieldSpec(PageField.DROPOFF, "배차내역 상세 하차지", "서울 강서 외발산동 [당착] 92Km", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.MEMO, "배차내역 상세 화물정보", "예약 당일오후1시상 당착 다발무상.하차해줌", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.RESERVATION, "배차내역 상세 배지", "[예약]", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "하차시간", "2025-11-23 20:43분", Seen.REAL, Handling.UNUSED),
        ),
    )
}

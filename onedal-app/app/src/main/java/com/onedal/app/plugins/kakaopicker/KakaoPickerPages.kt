package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.Seen

/**
 * 📄 **카카오 픽커 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/카카오픽커/실물_2026 · 실물 로그).
 * 칸 이름은 세 배차망 공통(`PageField`) — 여기에는 «어디서 · 어떤 글자로»만 적는다.
 * 안 읽는·버리는 칸(UNUSED·DROPPED)이 다음에 읽을 재료다.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/networkPages.ts` 의 «kakaopicker» — 서버도 같은 표를 읽는다(reviews/34).
 */
object KakaoPickerPages {
    val pages: PageSpecs = mapOf(
        Page.LIST to listOf(
            FieldSpec(PageField.FARE, "목록 줄 오른쪽", "16,093", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
            FieldSpec(PageField.PICKUP_DISTANCE, "몸통 줄 맨 앞", "4.7km", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
            FieldSpec(PageField.ITEM_SIZE, "꼬리표 줄", "중형", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
            FieldSpec(PageField.TAGS, "꼬리표 줄", "퀵 반나절 승", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
            FieldSpec(PageField.RESERVATION, "꼬리표 줄 «예약» 뒤", "예약 내일 · 예약 18:30 · 예약 9/30(수) · 예약", Seen.REAL, Handling.READ, "KakaoPickerParser.listReservation"),
            FieldSpec(PageField.REMAINING, "꼬리표 줄", "준비 29분 · 31분 내", Seen.REAL, Handling.READ, "KakaoPickerParser.parse (꼬리표)"),
            FieldSpec(PageField.PICKUP, "몸통 줄 — 시·구 줄임 + 동", "광주 경안", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
            FieldSpec(PageField.DROPOFF, "꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동", "용산 한남", Seen.REAL, Handling.READ, "KakaoPickerParser.parse"),
        ),
        Page.DETAIL to listOf(
            FieldSpec(PageField.TAGS, "사진 위쪽 꼬리표 줄", "퀵 반나절 예약", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.RESERVATION, "사진 띠", "내일 14:00 픽업예약", Seen.REAL, Handling.READ, "PickerDetailOcrParser.detailReservation"),
            FieldSpec(PageField.PICKUP, "사진 첫 정거장 — 행정동 + 건물", "경기 광주시 경안동 / 람미당", Seen.REAL, Handling.READ, "PickerScreenOcr.parseDetail"),
            FieldSpec(PageField.DROPOFF, "사진 둘째 정거장", "서울 용산구 한남동 / 아라마크", Seen.REAL, Handling.READ, "PickerScreenOcr.parseDetail"),
            FieldSpec(PageField.PICKUP_DISTANCE, "사진 정거장 오른쪽", "픽업 4.7km", Seen.REAL, Handling.DROPPED, "PickerScreenOcr — straightKm 읽고 안 씀"),
            FieldSpec(PageField.DELIVERY_DISTANCE, "사진 정거장 오른쪽", "배송 26.4km", Seen.REAL, Handling.DROPPED, "PickerScreenOcr — straightKm 읽고 안 씀"),
            FieldSpec(PageField.CLOCK, "사진 정거장 시각", "내일 17:49 · 12:39까지", Seen.REAL, Handling.DROPPED, "PickerScreenOcr — 하차 at 읽고 안 씀"),
            FieldSpec(PageField.ITEM_SIZE, "사진 물품 정보", "중형 세 변의 합 140cm · 20kg 이하", Seen.REAL, Handling.READ, "PickerScreenOcr.parseDetail · 서버 제외어 찾는 칸(excludeScan) — 접근성 글에서 «최종 수익» · «유의사항» · 버튼 앞까지",
                read = Regex("""물품\s*정보\s+([\s\S]*?)(?=\s+유의사항|\s+최종 수익|\s+넘기기|\s+수락하기|${'$'})""")),
            FieldSpec(PageField.MEMO, "사진 유의사항", "바로 배송가주실 분만 잡아주세요", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «유의사항» 다음 «최종 수익» · 버튼 앞 · 원달앱은 이 칸을 안 읽는다(사진 판독도 안 씀)",
                read = Regex("""유의사항\s+([\s\S]*?)(?=\s+최종 수익|\s+넘기기|\s+수락하기|${'$'})""")),
            FieldSpec(PageField.FARE, "상세 아래 최종 수익", "최종 수익 2,387", Seen.REAL, Handling.UNUSED),
        ),
        Page.CONFIRM to listOf(
            FieldSpec(PageField.STAGE, "픽업 시트 머리", "지금 바로 출발해 주세요 · 픽업이 지연되고 있어요", Seen.REAL, Handling.READ, "KakaoPickerKeywords.stageOf (단계 낱말만)"),
            FieldSpec(PageField.REMAINING, "시트 머리", "준비 13분 · 배송 33분", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "시트 픽업지", "[태전점]롯데리아", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "시트 배송지", "쌍용 스윗닷홈아파트 304동1002호", Seen.REAL, Handling.UNUSED),
        ),
        Page.MY_ORDERS to listOf(
            FieldSpec(PageField.STAGE, "내 오더 줄 머리", "픽업 준비 14분 남음", Seen.REAL, Handling.READ, "KakaoPickerKeywords.stageOf (단계 낱말만)"),
            FieldSpec(PageField.REMAINING, "내 오더 줄 머리", "14분 남음", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "픽업 배지 옆", "[태전점]롯데리아", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "배송지 줄", "배송지: 쌍용 스윗닷홈아파트 304동1002호", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.TAGS, "오른쪽 배지", "도보", Seen.REAL, Handling.UNUSED),
        ),
    )
}

package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.OverlayKind
import com.onedal.app.core.OverlaySpec
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.OverlayAction
import com.onedal.app.core.ScreenMatch
import com.onedal.app.core.ScreenSpec
import com.onedal.app.core.Seen
import com.onedal.app.core.StandardScreen

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
            FieldSpec(PageField.ITEM_SIZE, "사진 물품 정보", "중형 세 변의 합 140cm · 20kg 이하", Seen.REAL, Handling.READ, "PickerScreenOcr.parseDetail · 서버 제외어 찾는 칸(excludeScan) — 접근성 글에서 «최종 수익» · «유의사항» · 버튼 앞까지 · 관제웹 물품 칸(서버 pageFieldOf)",
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

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords) */
    val vehicleWords: Map<String, String?> = emptyMap()

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — 목록 머리 · 수락 전 상세 버튼 둘 · 홈과 수락 뒤 단계 글자 하나씩 · 퀵 흰 페이지 칸 이름 하나씩(퀵 머리 글자는 원달앱이 못 읽는다)) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
        listOf("리스트 설정"),
        listOf("넘기기", "수락하기"),
        listOf("시작하기"),
        listOf("물품이 안전하게 전달"),
        listOf("밀어서 픽업 완료"),
        listOf("밀어서 사진 촬영"),
        listOf("배송 시간"),
        listOf("물품 파손"),
        listOf("픽업 준비"),
        listOf("픽업지 근처에"),
        listOf("픽업지 정보"),
        listOf("도착지 정보"),
        listOf("픽업지 주소 복사하기"),
        listOf("픽업지에 전화하기"),
        listOf("도착지 주소 복사하기"),
        listOf("도착지에 전화하기"),
    )

    /** 🖥️ 페이지 전부 — 차례가 판별 차례(reviews/35) · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
        ScreenSpec(
            "홈(출근 전)",
            StandardScreen.HOME,
            listOf(ScreenMatch(all = listOf("시작하기"))),
            false,
            listOf(
                OverlaySpec("관심 일거리 상자", OverlayKind.POPUP, emptyList(), "관심 일거리를 고르라는 광고 상자", Seen.REAL, listOf("ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"), wordsFrom = "server/config/keywords_picker.json adStartWords"),
                OverlaySpec("일거리 광고 줄", OverlayKind.BANNER, emptyList(), "«이런 일거리 어떤가요?» 광고", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/01_홈_출근전.png"), wordsFrom = "server/config/keywords_picker.json adStartWords"),
                OverlaySpec("프로모션 띠", OverlayKind.BANNER, emptyList(), "프로모션 안내 — 글이 바뀐다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png"), toCollect = "바뀌지 않는 알아볼 글자"),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"),
        ),
        ScreenSpec(
            "배송 완료",
            StandardScreen.RUN_DONE,
            listOf(ScreenMatch(all = listOf("물품이 안전하게 전달"))),
            false,
            listOf(
                OverlaySpec("광고 띠", OverlayKind.BANNER, emptyList(), "제휴 배송 광고 — 글이 바뀐다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg"), toCollect = "바뀌지 않는 알아볼 글자"),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg", "ex_images/카카오픽커/실물_2026/32_배송완료_2387P_같은장면.jpeg"),
        ),
        ScreenSpec(
            "퀵 배송 완료하기",
            StandardScreen.RUN_AT_DROPOFF,
            listOf(ScreenMatch(all = listOf("배송 완료하기"), any = listOf("픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/22-1_퀵_배송_완료하기.png"),
        ),
        ScreenSpec(
            "퀵 배송 출발하기",
            StandardScreen.RUN_TO_DROPOFF,
            listOf(ScreenMatch(all = listOf("배송 출발하기"), any = listOf("픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/22-1_퀵_배송_출발하기.png"),
        ),
        ScreenSpec(
            "퀵 픽업 완료하기",
            StandardScreen.RUN_AT_PICKUP,
            listOf(ScreenMatch(all = listOf("픽업 완료하기"), any = listOf("픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"))),
            false,
            listOf(
                OverlaySpec("픽업 지연 제목", OverlayKind.BANNER, listOf(ScreenMatch(any = listOf("픽업이 지연되고 있어요"))), "픽업이 늦었다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"), toCollect = "원달앱이 읽는 글자인지(퀵 머리 글자는 로그에 안 나온다)"),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"),
        ),
        ScreenSpec(
            "퀵 픽업 출발하기",
            StandardScreen.RUN_TO_PICKUP,
            listOf(ScreenMatch(all = listOf("픽업 출발하기"), any = listOf("픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"))),
            false,
            listOf(
                OverlaySpec("출발 독촉 제목", OverlayKind.BANNER, listOf(ScreenMatch(any = listOf("지금 바로 출발해 주세요"))), "픽업이 늦었다 — 바로 출발하라", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg"), toCollect = "원달앱이 읽는 글자인지(A24 로그 11:55~11:56 에 안 나옴)"),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg", "ex_images/카카오픽커/실물_20260913_내가찍음/37_기사님캡처_1158_요기요2883.jpg", "A24 폰 로그 09-13 11:55:15 · 11:56:32"),
        ),
        ScreenSpec(
            "도보 픽업지 도착",
            StandardScreen.RUN_AT_PICKUP,
            listOf(ScreenMatch(all = listOf("밀어서 픽업 완료"), none = listOf("수락하기"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/17_픽업시트_밀어서픽업완료.jpeg"),
        ),
        ScreenSpec(
            "도보 배송지 도착",
            StandardScreen.RUN_AT_DROPOFF,
            listOf(ScreenMatch(all = listOf("밀어서 사진 촬영"), none = listOf("수락하기"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/22_배송시트_밀어서사진촬영.jpeg"),
        ),
        ScreenSpec(
            "인증사진 촬영",
            StandardScreen.RUN_AT_DROPOFF,
            listOf(ScreenMatch(all = listOf("인증사진 촬영"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/25_인증사진촬영_카메라.jpeg"),
            toCollect = "원달앱이 읽는 글자(로그) — 픽커 안 카메라 화면이다",
        ),
        ScreenSpec(
            "촬영 확인",
            StandardScreen.RUN_AT_DROPOFF,
            listOf(ScreenMatch(all = listOf("촬영 확인", "문자 전송"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/26_촬영확인_문자전송.jpeg"),
        ),
        ScreenSpec(
            "문자 전송",
            StandardScreen.RUN_AT_DROPOFF,
            listOf(ScreenMatch(all = listOf("문자 재전송"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/30_문자전송후_배송완료버튼.jpeg"),
        ),
        ScreenSpec(
            "도보 배송 중",
            StandardScreen.RUN_TO_DROPOFF,
            listOf(ScreenMatch(any = listOf("배송 시간", "물품 파손"), none = listOf("수락하기"))),
            false,
            listOf(
                OverlaySpec("배송 완료 확인", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("배송을 완료하셨나요"))), "배송 목표 시간이 다가온다 — 완료했는지 묻는다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/24_배송완료확인_팝업.jpeg")),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/21_배송중_배송시간15분남음.jpeg"),
        ),
        ScreenSpec(
            "도보 픽업 이동",
            StandardScreen.RUN_TO_PICKUP,
            listOf(ScreenMatch(any = listOf("픽업 준비", "픽업지 근처에"), none = listOf("수락하기", "목록 지도"))),
            false,
            listOf(
                OverlaySpec("배정 취소 불가", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("배정 취소 불가"))), "취소 가능 시간이 지나 배정을 취소할 수 없다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/19_배정취소불가_팝업.jpeg")),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/16_픽업이동_준비13분_배송33분.jpeg", "ex_images/카카오픽커/실물_2026/18_픽업이동_준비완료_배송25분.jpeg"),
        ),
        ScreenSpec(
            "수락 후 오더 전체",
            StandardScreen.DETAIL_CONFIRMED,
            emptyList(),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/23_수락후_오더전체_최종수익2387.jpeg"),
            toCollect = "원달앱이 읽는 글자(로그)",
        ),
        ScreenSpec(
            "도움말",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("자주 묻는 질문", "고객센터 연결"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/20_도움말_픽업FAQ_오더번호.jpeg"),
        ),
        ScreenSpec(
            "상세(수락 전 시트)",
            StandardScreen.DETAIL_PRE_CONFIRM,
            listOf(ScreenMatch(all = listOf("넘기기", "수락하기"))),
            false,
            listOf(
                OverlaySpec("첫 계약 필수정보", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("필수 정보를 입력해 주세요"))), "이메일 · 거주지를 넣어야 수락할 수 있다(한 번만)", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/14_첫계약_필수정보입력_팝업_1회성.jpeg")),
                OverlaySpec("배정 실패 오류", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("이미 배정이 완료된", "다른 기사에게 배정"))), "수락했지만 남이 먼저 잡았다", Seen.UNKNOWN, listOf(), toCollect = "캡처", action = OverlayAction.ERROR),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/05_상세_지도_수락하기.png", "ex_images/카카오픽커/실물_2026/06_상세_마감시각_준비시간.jpeg", "ex_images/카카오픽커/실물_2026/07_상세_최종수익분해.jpeg", "ex_images/카카오픽커/실물_2026/08_상세_지도_판교.jpeg", "ex_images/카카오픽커/실물_2026/09_상세_가격오르기전_9693.jpeg", "ex_images/카카오픽커/실물_2026/10_상세_가격오른뒤_11393.jpeg", "ex_images/카카오픽커/실물_2026/10-1_상세_시트(상).jpeg", "ex_images/카카오픽커/실물_2026/10-2_상세_시트(중).jpeg", "ex_images/카카오픽커/실물_2026/10-3_상세_시트(하).jpeg", "ex_images/카카오픽커/실물_2026/33_상세_예약콜_위례_삼성2동.png"),
        ),
        ScreenSpec(
            "내 오더 탭",
            StandardScreen.MY_ORDERS,
            listOf(ScreenMatch(all = listOf("목록 지도", "신규", "내 오더"), none = listOf("리스트 설정", "수락하기"))),
            false,
            listOf(
                OverlaySpec("오더 없음 안내", OverlayKind.BANNER, listOf(ScreenMatch(all = listOf("진행 중인 오더가 없어요"))), "진행 중인 오더가 없다 — 수락의 증거가 아니다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg")),
                OverlaySpec("수락 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("오더를 수락했습니다"))), "방금 수락이 됐다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png")),
                OverlaySpec("합짐 개수 띠", OverlayKind.BANNER, listOf(ScreenMatch(all = listOf("최대 합짐 개수"))), "퀵을 몇 건까지 합짐할 수 있나", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg")),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/15_내오더탭_픽업준비14분남음.jpeg", "ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg", "ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png"),
        ),
        ScreenSpec(
            "콜을 누른 직후 넘어가는 틀",
            StandardScreen.TRANSITION,
            listOf(ScreenMatch(none = listOf("리스트 설정", "수락하기", "목록 지도"), shape = Regex("""(?:퀵|도보|한차) \d+(?:\.\d+)?km (?:퀵|도보|한차) """), shapeMin = 3)),
            false,
            emptyList(),
            Seen.REAL,
            listOf("A24 폰 로그 10-02 09:20:45 · 09:31:17 · 09:48:01 · 09:53:16"),
            toCollect = "캡처 — 0.3~0.7초라 로그만 있다",
        ),
        ScreenSpec(
            "신규 리스트",
            StandardScreen.LIST,
            listOf(ScreenMatch(all = listOf("리스트 설정")), ScreenMatch(all = listOf("신규 내 오더"), any = listOf("서포트모드", "서포트 모드"), none = listOf("리스트 설정", "목록 지도", "수락하기")), ScreenMatch(none = listOf("수락하기", "목록 지도"), shape = Regex("""\d+(?:\.\d+)?km\s.{0,40}?\d{1,3}(?:,\d{3})+"""), shapeMin = 3)),
            false,
            listOf(
                OverlaySpec("«배정» 알림", OverlayKind.NOTICE, listOf(ScreenMatch(any = listOf("방금 배정된 오더", "이미 배정이 완료된"))), "남이 먼저 잡았다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "실물 로그 09-30 13:08:45 «방금 배정된 오더»")),
                OverlaySpec("광고 줄", OverlayKind.BANNER, emptyList(), "목록 사이에 끼는 일거리 광고", Seen.UNKNOWN, listOf(), toCollect = "캡처", wordsFrom = "server/config/keywords_picker.json adStartWords"),
                OverlaySpec("정렬 시트", OverlayKind.POPUP, emptyList(), "목록 정렬(높은 가격순 · 추천순 · 가까운순 …)을 고른다", Seen.REAL, listOf("A24 폰 로그 10-02 09:14:30"), toCollect = "캡처 · 알아보는 글자"),
                OverlaySpec("오더카드 대기 띠", OverlayKind.BANNER, listOf(ScreenMatch(all = listOf("오더카드 대기 중"))), "지금 오더카드 없음 · 대기 중 — 늘 맨 위에 붙는다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg")),
                OverlaySpec("오더카드", OverlayKind.BANNER, emptyList(), "대기 띠 자리에 들어온 오더 한 건 — 띠 안에 «P 수락» 버튼이 있다", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg"), toCollect = "알아보는 글자(로그)"),
                OverlaySpec("서포트 모드 띠", OverlayKind.BANNER, listOf(ScreenMatch(all = listOf("서포트 모드 1장 받기"))), "퀵 서포트 모드 받기 진행 안내", Seen.REAL, listOf("ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png")),
            ),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13_리스트_가까운순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-1_신규_리스트(퀵,중형,반나절,승,예약).jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg (내려감)"),
        ),
        ScreenSpec(
            "안드로이드 공유 시트",
            StandardScreen.OTHER_APP,
            emptyList(),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/27_공유시트_문자앱고르기.jpeg"),
            toCollect = "패키지 이름",
        ),
        ScreenSpec(
            "메시지 앱 문자 작성",
            StandardScreen.OTHER_APP,
            emptyList(),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/29_문자작성_배송완료MMS.jpeg"),
            toCollect = "패키지 이름",
        ),
        ScreenSpec(
            "메시지 앱 채팅+ 안내",
            StandardScreen.OTHER_APP,
            emptyList(),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/카카오픽커/실물_2026/28_채팅플러스_안내.jpeg"),
            toCollect = "패키지 이름",
        ),
    )
}

package com.onedal.app.plugins.isflex

import com.onedal.app.core.BadgeMeaning
import com.onedal.app.core.BadgePlace
import com.onedal.app.core.BadgeWord
import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.OverlayKind
import com.onedal.app.core.OverlaySpec
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.OverlayAction
import com.onedal.app.core.ScreenButtons
import com.onedal.app.core.ScreenMatch
import com.onedal.app.core.ScreenSpec
import com.onedal.app.core.Seen
import com.onedal.app.core.StandardScreen

/**
 * 📄 **인성플렉스 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/인성플렉스 — 사진 + 접근성 글자 xml · 페이지표.md).
 * 실물은 홈 · 목록 둘 · 지도 · 진행중(빈) · 시트 둘 · 확정 전 상세 다섯 · 메뉴 여섯뿐 — 확정 뒤 화면 · 진행중 한 건 · 팝업은 실물이 없어 모름(UNKNOWN)이나 지어낸 시뮬 화면(SIM)이다.
 * 안내 그림(img_guide3_*)의 이름표가 실물과 다르면 실물이 맞다 — 실물에 안내 그림 이름표가 나오면 리뉴얼 신호다.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/network/networkPages.isflex.ts` — 서버도 같은 표를 읽는다.
 */
object IsflexPages {
    val pages: PageSpecs = mapOf(
        Page.NEW_LIST to listOf(
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선인지 모름 */
            FieldSpec(PageField.PICKUP_DISTANCE, "목록 줄 맨 왼쪽(칸 머리 «출발지까지 (km)» — 줄바꿈 든 한 글자)", "24.3", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.VEHICLE_TYPE, "거리 아래", "오토", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.PICKUP, "출발지 칸 — «@» + (예약 앞글자) + 동", "@낼08:20/수원이의동 · @역삼동", Seen.REAL, Handling.READ, "IsflexParser"),
            /* 모든 출발지에 붙어 뜻 모름 — 공유콜로 안 읽는다 */
            FieldSpec(PageField.OTHER_OFFICE, "출발지 칸 앞 «@»", "@역삼동 · @낼08:20/수원이의동", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.RESERVATION, "출발지 «@» 뒤 앞글자", "낼08:20/ · 낼8:30) · 낼09시/ · 낼06:50)", Seen.REAL, Handling.READ, "IsflexParser"),
            /* 하차 정거장 거리(상차지 → 하차지) · 직선인지 모름 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "출발지 아래", "약 30.1km", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.DROPOFF, "도착지 칸 — (마감 앞글자) + 동", "10:20전/쌍림동 · 구리수택동", Seen.REAL, Handling.READ, "IsflexParser"),
            /* 판정 시한에 넣지 않는다 — 기록만 */
            FieldSpec(PageField.CLOCK, "도착지 앞 마감 앞글자", "10:20전/", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.FARE, "수입 칸(«원» 없음)", "21,252", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.PAYMENT, "수입 아래 작은 테두리 글자", "선불 · 착불", Seen.REAL, Handling.READ, "IsflexParser"),
            /* 실물 8건에는 없다 · 안내 그림 img_guide3_1 에만 */
            FieldSpec(PageField.BILLING, "수입 아래 배지(안내 그림)", "계산서", Seen.UNKNOWN, Handling.UNUSED),
            /* 실물 8건에는 없다 · 안내 그림 img_guide3_1 에만 — 차종 바로 뒤에 오면 차종 글자에 섞일 수 있다 */
            FieldSpec(PageField.TAGS, "차종 아래 배지(안내 그림)", "급 · 왕 · 빈 · 경", Seen.UNKNOWN, Handling.UNUSED),
        ),
        Page.NEW_CALL to listOf(
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선인지 모름 */
            FieldSpec(PageField.PICKUP_DISTANCE, "지도 아래 «출발지까지» 다음", "출발지까지 26.7km", Seen.REAL, Handling.READ, "원달앱 IsflexParser — 목록 값이 없을 때만",
                read = Regex("""출발지까지\s+([\d.]+)km""")),
            FieldSpec(PageField.VEHICLE_TYPE, "거리 다음", "오토", Seen.REAL, Handling.READ, "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser",
                read = Regex("""출발지까지\s+[\d.]+km\s+(\S+)""")),
            FieldSpec(PageField.TAGS, "차종 뒤 세로 구분선 다음", "과적", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) · 서버 상세 자료 구분 · 형태(detailRecordOf → badgeWords)",
                read = Regex("""출발지까지\s+[\d.]+km\s+\S+\s+(\S+(?:\s+\S+)*?)\s+출발\s+(?:@|약\s)""")),
            FieldSpec(PageField.RESERVATION, "출발 주소 둘째 «@» 뒤 앞글자", "낼8:30)", Seen.REAL, Handling.READ, "IsflexParser"),
            /* 주소가 두 줄이면 «약 N km»가 주소 앞에 온다(실물 10) */
            FieldSpec(PageField.PICKUP, "«출발» 다음 — «@시도 시군구 @(예약)동»", "@서울 서초구 @낼8:30)방배동", Seen.REAL, Handling.READ, "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser → 정거장 상세 주소(addressDetail — fillFromDetail)",
                read = Regex("""(?:^|\s)출발\s+(?:약\s+[\d.]+km\s+)?(\S[\s\S]*?)(?:\s+약\s+[\d.]+km)?\s+도착\s""")),
            /* 하차 정거장 거리(상차지 → 하차지) · 직선인지 모름 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "출발 주소 아래", "약 2.3km", Seen.REAL, Handling.READ, "원달앱 IsflexParser — 목록 값이 없을 때만",
                read = Regex("""(?:^|\s)출발\s[\s\S]*?약\s+([\d.]+)km""")),
            /* 판정 시한에 넣지 않는다 — 기록만 */
            FieldSpec(PageField.CLOCK, "도착 주소 동 앞 마감 앞글자", "10:20전/", Seen.REAL, Handling.READ, "IsflexParser"),
            FieldSpec(PageField.DROPOFF, "«도착» 다음 — «시도 시군구 (마감)동»", "서울 강남구 대치동", Seen.REAL, Handling.READ, "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser → 정거장 상세 주소(addressDetail — fillFromDetail)",
                read = Regex("""(?:^|\s)도착\s+([\s\S]+?)\s+적요상세(?:\s|${'$'})""")),
            FieldSpec(PageField.MEMO, "«적요상세» 다음(빈 적요는 «없음»)", "1박스 3층 계단물건 있음", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «적요상세» 다음 결제 · «총 수입» 앞 · «없음»은 못 읽음(빈 적요)",
                read = Regex("""적요상세\s+(?!없음\s+(?:선불|착불|총 수입)(?:\s|${'$'}))([\s\S]*?)(?=\s+(?:선불|착불|총 수입)(?:\s|${'$'}))""")),
            FieldSpec(PageField.MEMO, "«적요상세» 다음(빈 적요는 «없음»)", "1박스 3층 계단물건 있음", Seen.REAL, Handling.READ, "서버 상세 적요(detailRecordOf detailMemo)",
                read = Regex("""적요상세\s+(?!없음\s+(?:선불|착불|총 수입)(?:\s|${'$'}))([\s\S]*?)(?=\s+(?:선불|착불|총 수입)(?:\s|${'$'}))"""), part = "body"),
            FieldSpec(PageField.PAYMENT, "적요 아래 · «총 수입» 앞", "착불 · 선불", Seen.REAL, Handling.READ, "서버 결제 칸(detailRecordOf paymentType)",
                read = Regex("""(?:^|\s)(선불|착불)\s+총 수입""")),
            FieldSpec(PageField.FARE, "아래 «총 수입» 다음", "총 수입 8,500원", Seen.REAL, Handling.READ, "서버 · 원달앱 칸 읽기(pageFieldOf · PageFieldRead) — 목록 요금과 다섯 장 모두 같다",
                read = Regex("""총 수입\s+([\d,]+)원""")),
            /* 계약 단추 — 원달앱은 어떤 모드에서도 누르지 않는다 */
            FieldSpec(PageField.FARE, "오른쪽 아래 «…원 수행하기» 단추", "8,500원 수행하기(줄바꿈 든 한 글자)", Seen.REAL, Handling.UNUSED, "",
                read = Regex("""([\d,]+)원\s*\n?수행하기"""), part = "button"),
            /* 실물 5건에는 없다 · 안내 그림 img_guide3_2 에만 */
            FieldSpec(PageField.ITEM_SIZE, "머리 줄 넷째(안내 그림)", "대박스", Seen.UNKNOWN, Handling.UNUSED),
        ),
        Page.MY_LIST to listOf(
            FieldSpec(PageField.PICKUP, "진행중 탭 잡은 콜 줄", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "진행중 탭 잡은 콜 줄", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.FARE, "진행중 탭 잡은 콜 줄", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.STAGE, "진행중 탭 잡은 콜 줄 상태", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
        ),
        Page.MY_CALL to listOf(
            FieldSpec(PageField.STAGE, "지도 아래 파란 단계 줄(안내 그림)", "16:00까지 출발지로 이동", Seen.UNKNOWN, Handling.UNUSED),
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선인지 모름 */
            FieldSpec(PageField.PICKUP_DISTANCE, "머리 줄(안내 그림)", "출발지까지 1.2km", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.VEHICLE_TYPE, "머리 줄(안내 그림)", "오토바이", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.TAGS, "머리 줄 · 적요 아래 테두리 글(안내 그림)", "급송 · 왕복 · 빈나감", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.ITEM_SIZE, "머리 줄(안내 그림)", "중박스", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "«출발» 동 + 아래 전체 주소(안내 그림)", "대구 중구 포정동 · 서구 북비산로 240", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "출발 담당자 · 전화 단추(안내 그림)", "민사소액과 담당 홍길동", Seen.UNKNOWN, Handling.UNUSED, "",
                part = "pickup"),
            /* 하차 정거장 거리(상차지 → 하차지) · 직선인지 모름 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "출발 아래(안내 그림)", "약 1.8km", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "«도착» 동 + 아래 전체 주소(안내 그림)", "부산 남구 송정동 · 강서구 녹산산단 382로 14번길 55", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "도착 회사 이름 · 전화 단추(안내 그림)", "부산신발산업진흥센터", Seen.UNKNOWN, Handling.UNUSED, "",
                part = "dropoff"),
            FieldSpec(PageField.MEMO, "적요(안내 그림 제목 «오더메모» — 실물 상세는 «적요상세»)", "주차장으로 들어와주세요", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.BILLING, "적요 아래 테두리 글(안내 그림)", "세금계산서", Seen.UNKNOWN, Handling.UNUSED),
            /* 받을 돈 — 실물 원문 0 건(안내 그림에만) */
            FieldSpec(PageField.FARE, "받으실 현금(안내 그림 — 현금 콜만)", "받으실 현금 123,000원", Seen.UNKNOWN, Handling.READ, "지금 읽는 곳 없음 — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱 돈 9(걸음 5)",
                read = Regex("""받으실 현금\s+([\d,]+)원"""), part = "collect"),
            /* 뜻 모름 — 고객이 내는 운임인지 톨비인지 실전 한 건으로 가른다 */
            FieldSpec(PageField.FARE, "탁송 금액(안내 그림)", "탁송 금액 25,000원", Seen.UNKNOWN, Handling.READ, "지금 읽는 곳 없음 — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱 돈 9(걸음 5)",
                read = Regex("""탁송 금액\s+([\d,]+)원"""), part = "unknown"),
            /* 뜻 모름 — «탁송 금액»과 함께 실전 한 건으로 가른다 */
            FieldSpec(PageField.FARE, "배송비(안내 그림)", "배송비 5,000원", Seen.UNKNOWN, Handling.READ, "지금 읽는 곳 없음 — 서버 상세는 확정 전 화면만(확정 뒤 보고는 원달앱 걸음 5 뒤)",
                read = Regex("""배송비\s+([\d,]+)원"""), part = "unknown.deliveryFee"),
            FieldSpec(PageField.FARE, "총 수익(안내 그림 — 실물 상세는 «총 수입»)", "총 수익 ₩ 123,000원", Seen.UNKNOWN, Handling.UNUSED),
        ),
    )

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords — 목록 줄 · 상세 «출발지까지» 다음 차종 글자(실물 8건 모두 «오토») · 목록 칩과 홈 배송 수단 글자(«오토바이» · «승용/소형» · «도보» · «개인이동수단») — 도보 · 개인이동수단은 우리 차종이 없다) */
    val vehicleWords: Map<String, String?> = mapOf(
        "오토" to "오토바이",
        "오토바이" to "오토바이",
        "승용/소형" to "승용차",
        "도보" to null,
        "개인이동수단" to null,
    )

    /** 📦 크기 낱말 → 라면박스 수(shared sizeWords) · null 은 박스 수 모름 */
    val sizeWords: Map<String, Int?> = mapOf(
        "대박스" to null,
        "중박스" to null,
    )

    /** 🏷️ 표시 글자 → 자리 · 뜻(shared badgeWords — 목록 · 상세 차종 뒤 꼬리표(«과적» · «급» · «왕») · 출발지 · 도착지 칸 앞글자(«@» · «급송/» · «고정기사/») · 결제 글 — 근거는 안내 그림 img_guide3 · 로컬 실물 원문) · 표에 없는 글자는 뜻 모름이 아니라 «표에 없음» */
    val badgeWords: List<BadgeWord> = listOf(
        BadgeWord("급", BadgePlace.ROW, BadgeMeaning.ORDER_FORM, "급송"),
        BadgeWord("급송", BadgePlace.ROW, BadgeMeaning.ORDER_FORM, "급송"),
        BadgeWord("급송/", BadgePlace.PICKUP, BadgeMeaning.ORDER_FORM, "급송"),
        BadgeWord("급송/", BadgePlace.DROPOFF, BadgeMeaning.ORDER_FORM, "급송"),
        BadgeWord("왕", BadgePlace.ROW, BadgeMeaning.TRIP_TYPE, "왕복"),
        BadgeWord("왕복", BadgePlace.ROW, BadgeMeaning.TRIP_TYPE, "왕복"),
        BadgeWord("왕복", BadgePlace.PICKUP, BadgeMeaning.TRIP_TYPE, "왕복"),
        BadgeWord("경", BadgePlace.ROW, BadgeMeaning.TRIP_TYPE, "경유"),
        BadgeWord("과적", BadgePlace.ROW, BadgeMeaning.UNKNOWN),
        BadgeWord("빈/반", BadgePlace.ROW, BadgeMeaning.UNKNOWN),
        BadgeWord("빈나감", BadgePlace.ROW, BadgeMeaning.UNKNOWN),
        BadgeWord("고정기사/", BadgePlace.PICKUP, BadgeMeaning.UNKNOWN),
        BadgeWord("@", BadgePlace.PICKUP, BadgeMeaning.UNKNOWN),
        BadgeWord("선불", BadgePlace.ROW, BadgeMeaning.PAYMENT),
        BadgeWord("착불", BadgePlace.ROW, BadgeMeaning.PAYMENT),
        BadgeWord("계산서", BadgePlace.ROW, BadgeMeaning.BILLING),
    )

    /** 🚚 차종 글자가 없으면 수단 상관없음인가(shared vehicleAbsentMeansAny) · 없으면 false */
    val vehicleAbsentMeansAny: Boolean = false

    /** 🏠 판정 글자 다듬기(shared addressCut — 글 맨 앞 «@» 뒤에 붙은 영문 대문자 한 글자 · 점(«@A한남동» · «@.대치동» — 실물 목록 원문)을 지운다 · 예약 · 마감 앞글자는 판정 글자 함수(stopQueryOf)의 약속 원문 떼기 몫) · 맞는 첫 부분을 지운다 · null 이면 자르기만 (`StopText.query`) */
    val addressCut: Regex? = Regex("""^@?[A-Z.](?=[가-힣])""")

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — 목록(«출발지까지» + «수입») · 상세(«총 수입» + «수행하기») · 홈(«현재 선택된 배송 수단») · 진행중 빈 화면(«진행중인 오더가 없습니다») — 실물 02 · 08 · 01 · 04 에 있고 인성 화면에는 없는 글자 묶음. 공지 띠 · «AI 배차 대기중»은 글이 바뀌거나 사라져 쓰지 않는다) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
        listOf("출발지까지", "수입"),
        listOf("총 수입", "수행하기"),
        listOf("현재 선택된 배송 수단"),
        listOf("진행중인 오더가 없습니다"),
    )

    /** ⚙️ 배차망 규칙(shared modes · packageKeywords · safeCancelSec · detailBackSec — 자동이 없다 — «…원 수행하기»가 곧 계약이고 확정 뒤 임의 취소가 안 되며 취소마다 다음 확정이 10초 막혀 원달앱이 누르지 않는다 · 안전취소가 없다 · 상세 머묾 시간은 자기 칸(isflexAlarmDetailSec — 픽커 칸과 따로) · 패키지 글자는 «quickflex»(«insung» 은 인성 표가 이미 실물 insung.quickflex 에 건다)) · 시간은 값이 아니라 설정 칸 이름(FilterConfig.secOf) */
    val modes: Set<String> = setOf("MANUAL", "SIMULATION", "ALARM")
    val packageKeywords: List<String> = listOf("quickflex")
    val safeCancelSecKey: String? = null
    val detailBackSecKey: String? = "isflexAlarmDetailSec"

    /** 🖥️ 페이지 전부 — 차례가 판별 차례 · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
        ScreenSpec(
            "상세(확정 전)",
            StandardScreen.DETAIL_PRE_CONFIRM,
            listOf(ScreenMatch(all = listOf("총 수입", "수행하기"))),
            false,
            listOf(
                OverlaySpec("수락 실패 팝업", OverlayKind.POPUP, emptyList(), "착불 콜을 적립금이 모자라 수락하지 못했다 — 원달앱은 알아보기만", Seen.UNKNOWN, listOf(), toCollect = "착불 콜 «수행하기» 뒤 뜨는 팝업 글자"),
                OverlaySpec("확정 제한 팝업", OverlayKind.POPUP, emptyList(), "확정 뒤 취소해 다음 확정이 10초 막혔다 — 원달앱은 알아보기만", Seen.UNKNOWN, listOf(), toCollect = "회원사 취소 뒤 다음 확정 때 뜨는 팝업 글자"),
            ),
            Seen.REAL,
            listOf("ex_images/인성플렉스/08_상세.png", "ex_images/인성플렉스/09_상세_선불.png", "ex_images/인성플렉스/10_상세_3.png", "ex_images/인성플렉스/11_상세_4.png", "ex_images/인성플렉스/12_상세_5.png"),
            toCollect = "꼬리표 자리에 «과적» 말고 오는 글자(«급송» · «왕복» · «경유» · 짐 크기 «대박스») · 도착 주소에 «@»가 붙는 콜 · 적요 안에 «선불» · «착불» · «총 수입»이 드는 콜 — 적요 제목 «오더메모» · 요금 제목 «수입»만(«총 수입» 아님)이 보이면 리뉴얼",
            base = "newCall",
            buttons = ScreenButtons(accept = "수행하기", filterOut = "닫기"),
        ),
        ScreenSpec(
            "내 오더 콜",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("적요상세"), any = listOf("픽업완료", "배송완료", "서명받기"), none = listOf("수행하기"))),
            false,
            emptyList(),
            Seen.SIM,
            listOf("지어낸 화면 — 시뮬레이터 인성플렉스 «내 오더 콜»(실물 캡처 없음)"),
            toCollect = "실물 화면 글자(출발지로 이동 · 배송 · 서명) · 단계 줄 «…까지 출발지로 이동» · 아래 단추 글자 — 요금 제목 «총 수익» · 적요 제목 «오더메모»가 실물에 나오나",
            landsAfterAccept = true,
            base = "myCall",
        ),
        ScreenSpec(
            "목록(신규)",
            StandardScreen.LIST,
            listOf(ScreenMatch(all = listOf("출발지까지", "수입", "퇴근하기"), none = listOf("수행하기")), ScreenMatch(all = listOf("퇴근하기", "목록", "지도", "신규"), none = listOf("출발지까지", "진행중"))),
            false,
            listOf(
                OverlaySpec("오더 목록 거리 설정 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("오더 목록 거리 설정"))), "목록 거리를 고르는 시트 — 떠 있는 동안 뒤 목록 글자가 안 온다 · 원달앱은 아무것도 안 누른다", Seen.REAL, listOf("ex_images/인성플렉스/05_필터.png")),
                OverlaySpec("오더 사이즈 설정 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("오더 사이즈 설정"))), "목록 글자 크기 · 여백을 고르는 시트 — 안의 견본 줄은 콜이 아니다 · 떠 있는 동안 뒤 목록 글자가 안 온다 · 원달앱은 아무것도 안 누른다", Seen.REAL, listOf("ex_images/인성플렉스/06_넓히기.png")),
                OverlaySpec("퇴근 확인 팝업", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("오더 수행을 종료하고", "퇴근하시겠어요"))), "목록 «퇴근하기» 뒤 퇴근할지 묻는다 — «퇴근»이면 콜을 안 받는다 · 원달앱은 아무것도 안 누른다", Seen.REAL, listOf("실물 이상 기록 11-02 · 11-03 · 11-05 · 11-06 «오더 수행을 종료하고 퇴근하시겠어요? 취소 퇴근» — 직전 화면 목록(신규)")),
            ),
            Seen.REAL,
            listOf("ex_images/인성플렉스/02_목록.png", "ex_images/인성플렉스/07_목록_스크롤.png", "실물 이상 기록 11-03 «퇴근하기 목록 지도 신규» — 목록 머리만 읽힌 틀(진행중 탭 글이 없는 틀만 — 진행중 화면을 빼앗지 않는다)"),
            toCollect = "AI 추천 콜이 실제로 뜬 목록(칸 자리 · «수락» 단추 글자) · 꼬리표 배지(«급» · «왕» · «빈» · «경») · «계산서» 배지 · 차종 «오토» 말고 다른 글자 · 오늘 예약 앞글자 꼴 — 칩 «개인이동장치»(실물은 «개인이동수단»)가 보이면 리뉴얼",
            base = "newList",
        ),
        ScreenSpec(
            "지도 보기",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("퇴근하기", "Google 지도"), none = listOf("수입"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/03_목록_지도.png"),
            toCollect = "지도 마커를 누르면 뜨는 화면",
        ),
        ScreenSpec(
            "진행중(빈)",
            StandardScreen.MY_ORDERS,
            listOf(ScreenMatch(all = listOf("진행중인 오더가 없습니다"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/04_진행중.png"),
            base = "myList",
        ),
        ScreenSpec(
            "진행중(한 건)",
            StandardScreen.MY_ORDERS,
            listOf(ScreenMatch(all = listOf("신규", "진행중", "퇴근하기"), none = listOf("출발지까지", "진행중인 오더가 없습니다"))),
            false,
            emptyList(),
            Seen.SIM,
            listOf("지어낸 화면 — 시뮬레이터 인성플렉스 «진행중» 탭 한 건(실물 캡처 없음)"),
            toCollect = "잡은 콜 줄의 칸 · 글자 · 차례 · 이 화면에 칸 머리(«출발지까지» · «수입») · 칩 · «AI 배차 대기중» · «완료» 글자가 있나",
            landsAfterAccept = true,
            base = "myList",
        ),
        ScreenSpec(
            "홈",
            StandardScreen.HOME,
            listOf(ScreenMatch(all = listOf("출근하기", "현재 선택된 배송 수단"))),
            false,
            listOf(
                OverlaySpec("공지 띠", OverlayKind.BANNER, emptyList(), "공지 제목이 돌아가며 바뀐다 — 표식으로 쓰지 않는다", Seen.REAL, listOf("ex_images/인성플렉스/01_홈.png", "ex_images/인성플렉스/01_홈_2.png"), toCollect = "바뀌지 않는 알아볼 글자"),
            ),
            Seen.REAL,
            listOf("ex_images/인성플렉스/01_홈.png", "ex_images/인성플렉스/01_홈_2.png"),
            toCollect = "«퇴근하기» 뒤 돌아오는 화면 · «변경» 뒤 배송 수단 고르기 화면 글자",
            base = "home",
        ),
        ScreenSpec(
            "메세지함",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("메세지함"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/13_편지.png"),
        ),
        ScreenSpec(
            "마이플렉스",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("마이플렉스", "적립금내역"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/14_사람.png"),
            toCollect = "나머지 메뉴(미션 · 보험 · 내 정보 · 배송 수단 · 이용안내) 화면 — 기사님이 연 화면만",
        ),
        ScreenSpec(
            "적립금 내역",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("적립금 내역", "보유 적립금"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/15_적립금.png"),
        ),
        ScreenSpec(
            "수행내역",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("수행내역", "금액은 완료된 건만 표시됩니다"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/16_수행내역.png"),
            toCollect = "끝낸 콜이 있을 때의 줄 모양",
        ),
        ScreenSpec(
            "공지사항",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("공지사항", "필수공지"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성플렉스/17_공지사항.png", "ex_images/인성플렉스/18_공지_운행취소패널티.png"),
        ),
    )
}

package com.onedal.app.plugins.hwamul24

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
            FieldSpec(PageField.PAYMENT, "결제방법", "카드", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) · 관제웹 결제 칸(서버 pageFieldOf) — «카드» · «착불» · 원달앱은 이 칸을 안 읽는다",
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

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords — 목록 셋째 줄 «낱말/…»(«1톤/전체» · «2.5톤/윙» · «다마스/전체»)의 첫 «/» 앞 낱말 — REAL 은 실물 캡처 17 · 실물 목록, SIM 은 시뮬레이터 목록에서만 봤다) */
    val vehicleWords: Map<String, String?> = mapOf(
        "1톤" to "1t",
        "1.4톤" to "1.4t",
        "2.5톤" to "2.5t",
        "3.5톤" to "3.5t",
        "5톤" to "5t",
        "11톤" to "11t",
        "25톤" to "25t",
        "다마스" to "다마스",
        "라보" to "라보",
        "오토바이" to "오토바이",
        "승용" to "승용차",
    )

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — 실시간 목록 머리(«화물정보» + «자동새로고침») · 잡기 전 상세(«화물상세정보» + «운송료»)) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
        listOf("화물정보", "자동새로고침"),
        listOf("화물상세정보", "운송료"),
    )

    /** 🖥️ 페이지 전부 — 차례가 판별 차례(reviews/35) · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
        ScreenSpec(
            "화물상세정보",
            StandardScreen.DETAIL_PRE_CONFIRM,
            listOf(ScreenMatch(all = listOf("화물상세정보", "배차신청"))),
            false,
            listOf(
                OverlaySpec("배차 실패 오류", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("이미 배차", "배차할 수 없"))), "배차신청이 안 됐다 — 남이 먼저 잡았거나 조건 미달", Seen.UNKNOWN, listOf(), toCollect = "캡처", action = OverlayAction.ERROR),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/18_화물상세정보_배차신청.png", "ex_images/화물24시/51_회원가입_약관.png (내용은 화물상세정보)"),
        ),
        ScreenSpec(
            "배차내역 상세 · 화주정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "02 화주정보", "사업장주소"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/21_화물상세_화주정보_전화번호.png"),
        ),
        ScreenSpec(
            "배차내역 상세 · 결제정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "03 결제정보", "수금상태"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/22_화물상세_결제정보.png"),
        ),
        ScreenSpec(
            "배차내역 상세 · 화물정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "02 화주정보", "배차시간"))),
            false,
            listOf(
                OverlaySpec("인수증 전송 확인", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("인수증을 전송하시겠습니까"))), "인수증 사진을 화주에게 보낼지 묻는다", Seen.REAL, listOf("ex_images/화물24시/24_세금계산서발행_계좌입력.png (내용은 «인수증 전송» 팝업)")),
                OverlaySpec("세금계산서 수정발행 창", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("계산서발행"), any = listOf("수정사유", "공급가액변동"))), "발행한 세금계산서를 고쳐 다시 발행한다", Seen.REAL, listOf("ex_images/화물24시/08_세금계산서_수정발행_팝업.png", "ex_images/화물24시/09_세금계산서_수정발행_입력.png")),
                OverlaySpec("계좌입력 확인", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("입금계좌에 계좌정보를 입력하시겠습니까"))), "세금계산서 창에서 입금계좌를 넣을지 묻는다", Seen.REAL, listOf("ex_images/화물24시/08_세금계산서_수정발행_팝업.png")),
                OverlaySpec("세금계산서 발행 창", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("계산서발행", "작성일자"), none = listOf("수정사유", "공급가액변동"))), "세금계산서를 처음 발행한다(공급자 · 공급받는자 입력)", Seen.REAL, listOf("ex_images/화물24시/12_세금계산서_발행폼.png", "ex_images/화물24시/23_세금계산서발행_입력창.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/04_배차상세_화물정보_상단.png", "ex_images/화물24시/05_배차상세_화물정보_하단.png", "ex_images/화물24시/06_배차상세_계산서발행.png", "ex_images/화물24시/10_배차상세_인수증.png", "ex_images/화물24시/13_배차상세_예약건.png", "ex_images/화물24시/24_세금계산서발행_계좌입력.png (내용은 화물정보 탭 위 «인수증 전송» 팝업)", "ex_images/화물24시/52_앱접근성_권한.png (내용은 화물정보 탭)"),
        ),
        ScreenSpec(
            "화물배차정보요약",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("화물배차정보요약"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/14_화물배차정보요약.png", "ex_images/화물24시/15_화물배차정보요약_메뉴.png (녹화 앱 메뉴가 겹침)"),
        ),
        ScreenSpec(
            "배차내역 목록",
            StandardScreen.MY_ORDERS,
            listOf(ScreenMatch(all = listOf("배차내역", "자세히 보기"), none = listOf("02 화주정보"))),
            true,
            listOf(
                OverlaySpec("안내 띠", OverlayKind.BANNER, emptyList(), "전자세금계산서 · 수금 안내 — 글이 바뀐다", Seen.REAL, listOf("ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/20_배차내역_목록.png"), toCollect = "바뀌지 않는 알아볼 글자"),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/11_배차내역_수금목록.png", "ex_images/화물24시/20_배차내역_목록.png"),
        ),
        ScreenSpec(
            "화물정보 검색조건",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("화물정보", "검색조건", "저장 후 검색"))),
            false,
            listOf(
                OverlaySpec("하차일 선택 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("하차일 선택"))), "검색조건의 하차일(전체 · 당착 · 내착 · 월착)을 고른다", Seen.REAL, listOf("ex_images/화물24시/41_마이페이지_메인.png (내용은 검색조건 + 하차일 선택)")),
                OverlaySpec("내위치 반경 선택 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("내위치 반경 선택"))), "검색조건의 내 위치 반경(5 ~ 30Km)을 고른다", Seen.REAL, listOf("ex_images/화물24시/42_설정_알림.png (내용은 검색조건 + 내위치 반경 선택)")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/38_세금계산서_목록.png (내용은 검색조건)", "ex_images/화물24시/39_계산서_발행폼.png (내용은 검색조건)", "ex_images/화물24시/41_마이페이지_메인.png (내용은 검색조건 + 하차일 선택)", "ex_images/화물24시/42_설정_알림.png (내용은 검색조건 + 내위치 반경 선택)"),
        ),
        ScreenSpec(
            "화물정보(실시간 목록)",
            StandardScreen.LIST,
            listOf(ScreenMatch(all = listOf("화물정보", "자동새로고침", "자동터치"), none = listOf("저장 후 검색"))),
            false,
            listOf(
                OverlaySpec("자동터치 동의", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("자동터치 사용시", "동의하십니까"))), "자동터치를 켤 때 책임 동의를 묻는다", Seen.REAL, listOf("ex_images/화물24시/47_이벤트_안내.png (내용은 실시간 목록 위 «알림» 팝업)"), action = OverlayAction.SKIP),
                OverlaySpec("저장완료 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("저장완료"))), "검색조건을 저장했다", Seen.REAL, listOf("ex_images/화물24시/43_공지사항_리스트.png (내용은 실시간 목록 위 토스트)")),
                OverlaySpec("자동터치 시작 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("자동터치 시작"))), "배차망 자체 자동터치를 켰다", Seen.REAL, listOf("ex_images/화물24시/48_이벤트_상세정보.png (내용은 실시간 목록 위 토스트)")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/17_화물정보_리스트.png", "ex_images/화물24시/32_오더목록_기본.png", "ex_images/화물24시/35_배차완료_내역.png (내용은 실시간 목록)", "ex_images/화물24시/36_화물정보_전체.png", "ex_images/화물24시/37_화물상세_요약.png (내용은 실시간 목록)", "ex_images/화물24시/40_인수증_전송화면.png (내용은 실시간 목록)", "ex_images/화물24시/43_공지사항_리스트.png (내용은 실시간 목록)", "ex_images/화물24시/44_공지_상세내용.png (내용은 실시간 목록)", "ex_images/화물24시/45_고객센터_메뉴.png (내용은 실시간 목록 · 자동새로고침 OFF)", "ex_images/화물24시/46_자주묻는질문.png (내용은 실시간 목록)", "ex_images/화물24시/47_이벤트_안내.png (내용은 실시간 목록)", "ex_images/화물24시/48_이벤트_상세정보.png (내용은 실시간 목록)", "ex_images/화물24시/49_로그아웃_팝업.png (내용은 실시간 목록)", "ex_images/화물24시/50_로그인_입력.png (내용은 실시간 목록)"),
        ),
        ScreenSpec(
            "홈 «전국24시콜화물»",
            StandardScreen.HOME,
            listOf(ScreenMatch(all = listOf("전국24시콜화물"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/01_메인_홈화면.png", "ex_images/화물24시/28_인수증_업로드.png (내용은 홈)", "ex_images/화물24시/33_오더상세_지도.png (내용은 홈)"),
        ),
        ScreenSpec(
            "가상계좌 정보",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("가상계좌 정보", "출금가능금액"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/34_배차신청_확인.png (내용은 가상계좌 정보)"),
        ),
        ScreenSpec(
            "인수증 보관",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("인수증 보관기간"))),
            false,
            listOf(
                OverlaySpec("인수증 전송 창", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("인수증 등록방법 선택"))), "인수증 사진을 카메라 · 갤러리에서 올린다", Seen.REAL, listOf("ex_images/화물24시/26_인수증전송_팝업.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/07_인수증_목록.png", "ex_images/화물24시/25_배차내역_목록2.png (내용은 인수증 보관)", "ex_images/화물24시/27_인수증_보관함.png"),
        ),
        ScreenSpec(
            "세금계산서 발행내역 상세",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("전자세금계산서 정보", "국세청승인"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/30_세금계산서_미발행목록.png (내용은 발행내역 상세)"),
        ),
        ScreenSpec(
            "세금계산서 발행내역 목록",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("세금계산서 발행내역", "승인번호"), none = listOf("국세청승인"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/29_세금계산서_수신내역.png (내용은 발행내역 목록)", "ex_images/화물24시/31_세금계산서_발행완료목록.png (내용은 발행내역 목록)"),
        ),
        ScreenSpec(
            "마이페이지",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("마이페이지", "가상계좌 정보", "적재물보험 정보"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/02_마이페이지.png", "ex_images/화물24시/19_마이페이지_메뉴.png"),
        ),
        ScreenSpec(
            "배차신청 누른 뒤",
            null,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 · 우리 기준 페이지",
        ),
        ScreenSpec(
            "환경설정",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (아래 탭 «환경설정» 뒤)",
        ),
        ScreenSpec(
            "로그인",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "화물등록",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «화물등록» 칸 뒤)",
        ),
        ScreenSpec(
            "음성등록",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «음성등록» 칸 뒤)",
        ),
        ScreenSpec(
            "스마트배차",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «스마트배차» 칸 뒤)",
        ),
        ScreenSpec(
            "협력업체",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «협력업체» 칸 뒤)",
        ),
        ScreenSpec(
            "고객센터",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «고객센터» 칸 뒤)",
        ),
        ScreenSpec(
            "공지사항",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «공지사항» 칸 뒤)",
        ),
        ScreenSpec(
            "사진전송",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (홈 «사진전송» 칸 뒤)",
        ),
        ScreenSpec(
            "정보이용료 세금계산서 신청",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «정보이용료 세금계산서 신청» 뒤)",
        ),
        ScreenSpec(
            "스티커 사진전송",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «스티커 사진전송» 뒤)",
        ),
        ScreenSpec(
            "전자세금계산서 수신내역",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «전자세금계산서 수신내역» 뒤)",
        ),
        ScreenSpec(
            "카드결제지원 서비스",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «카드결제지원 서비스» 뒤)",
        ),
        ScreenSpec(
            "적재물보험 정보",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «적재물보험 정보» 뒤)",
        ),
        ScreenSpec(
            "매출내역 신청",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (마이페이지 «매출내역 신청» 뒤)",
        ),
    )
}

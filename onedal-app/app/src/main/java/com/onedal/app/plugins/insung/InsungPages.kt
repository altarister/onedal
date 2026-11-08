package com.onedal.app.plugins.insung

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
 * 📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/인성 · 시뮬 onedal-sim).
 * ⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/network/networkPages.insung.ts` — 서버도 같은 표를 읽는다.
 */
object InsungPages {
    val pages: PageSpecs = mapOf(
        Page.NEW_LIST to listOf(
            FieldSpec(PageField.PICKUP, "출발지 칸", "@초이동 · @남양주(오남", Seen.REAL, Handling.READ, "InsungParser.parse"),
            FieldSpec(PageField.DROPOFF, "도착지 칸", "이태원동 · 김포(대곶면", Seen.REAL, Handling.READ, "InsungParser.parse"),
            FieldSpec(PageField.RESERVATION, "출발지 칸 앞글자", "낼7시/ · 낼6시30/ · 21시/(시각만 · 오늘) · 오후7시30/(시각만 · 오늘) · 10일/", Seen.REAL, Handling.READ, "InsungParser.reservationOf"),
            FieldSpec(PageField.CLOCK, "도착지 칸 앞글자 (도착 약속)", "낼8/ · 8시/ · 낼10시/", Seen.REAL, Handling.DROPPED, "InsungParser.parse — 출발지 쪽이 있으면 버림"),
            FieldSpec(PageField.VEHICLE_TYPE, "차종 칸", "1t · 다 · 라 · 1t화물", Seen.REAL, Handling.READ, "InsungParser.readVehicleAndFare"),
            FieldSpec(PageField.FARE, "요금 칸 (천 원 단위)", "40.0 · 270.0", Seen.REAL, Handling.READ, "InsungParser.readVehicleAndFare"),
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선으로 읽음(상세 «(직선)»과 같은 뜻 — 목록엔 표시 없음) */
            FieldSpec(PageField.PICKUP_DISTANCE, "거리 칸 윗줄", "17.8", Seen.REAL, Handling.READ, "InsungParser.parse"),
            /* 하차 정거장 거리(상차지 → 하차지) · 직선으로 읽음 · «0.0» 은 배송 거리 모름 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "거리 칸 아랫줄", "0.0 · 341.3", Seen.REAL, Handling.READ, "InsungParser.parse"),
            /* 공유콜 — 다른 사무실 콜 · «@» 가 없으면 자사콜(인성 설명 영상 2249) */
            FieldSpec(PageField.OTHER_OFFICE, "출발지 칸 앞 «@»", "@초이동 · @낼8:30/가산동", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(원달앱 번호 9 · 걸음 5 — 공유콜)"),
        ),
        Page.NEW_CALL to listOf(
            FieldSpec(PageField.STAGE, "상태 줄", "상태 : 배송", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""상태\s*:\s*(?!\S*\s*:)(\S+)""")),
            /* 실물: 이름표 «물품 :» 은 확정 전 3/3 늘 있지만 값은 0/7(확정 전 «--» · 확정 뒤 빈칸) — 읽는 법은 값을 읽으니 분류하지 않는다(늘 있음이면 «사라짐» 거짓 경고) */
            FieldSpec(PageField.ITEM_SIZE, "물품 줄", "물품 :", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다 · 값이 다음 줄에 있으면 그 줄(다른 칸 줄이면 안 읽는다)",
                read = Regex("""물품[ \t]*:[ \t]*(?:\n(?![^\n]*:))?([^\n]+)""")),
            /* 🚚 빈 «차량 :» 뒤의 다음 이름표(«탁송료 :»)를 차종으로 잡지 않는다 — 값 토막 뒤가 바로 «:» 이면 이름표다 */
            FieldSpec(PageField.VEHICLE_TYPE, "차량 줄", "차량 : 트럭-1t · 다마스", Seen.REAL, Handling.READ, "서버 detail.ts pageFieldOf — 원달앱 값 · 목록 차종이 없을 때만(원달앱은 아직 이 칸을 안 읽는다)",
                read = Regex("""차량\s*:\s*(?!\S*\s*:)([^\s(]+)""")),
            FieldSpec(PageField.FARE, "요금 줄", "요금 : 85,000(신용)(계산서)", Seen.REAL, Handling.READ, "목록 값 · 목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)",
                read = Regex("""요금\s*:\s*([\d,]+)(?![\d.])""")),
            FieldSpec(PageField.PAYMENT, "요금 줄 괄호", "(신용)(계산서)", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) · 서버 결제 칸(«착불» 정산) — 첫 괄호 «(카드)» · «(착불)» · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""요금\s*:\s*[\d,]+\(([^)]*)\)""")),
            FieldSpec(PageField.BILLING, "요금 줄 둘째 괄호", "요금 : 85,000(신용)(계산서)", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""요금\s*:\s*[\d,]+\([^)]*\)\(([^)]*)\)""")),
            FieldSpec(PageField.COMMISSION, "수수료 줄", "수수료 : 23%", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""수수료\s*:\s*(\d+(?:\.\d+)?%)""")),
            FieldSpec(PageField.TOLL, "탁송료 줄", "탁송료 : 3,000 · 탁송료 :(빈 칸)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다 · 빈 칸이면 다음 줄을 줍지 않는다",
                read = Regex("""탁송료[ \t]*:[ \t]*([\d,]+)""")),
            FieldSpec(PageField.TAGS, "구분 줄", "구분 : 편도", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «편도» · «왕복» · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""구분\s*:\s*(?!\S*\s*:)(\S+)""")),
            FieldSpec(PageField.RESERVATION, "형태 줄", "형태 : 보통 (실물에서 «예약»은 못 봄)", Seen.UNKNOWN, Handling.READ, "서버 원문 칸 읽기 — «보통» · «급송»(급송 isExpress 를 켜는지는 69 결정 · 서버가 켤 때까지 안 읽음) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""형태\s*:\s*(?!\S*\s*:)(\S+)""")),
            FieldSpec(PageField.MEMO, "적요 칸 · 적요 상세 팝업", "1시상차 6박스 카트가지고 고객님앞 갖다주세요", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — 적요 상세 팝업 «적요 내용»(팝업을 못 열었으면 본문 «적요상세» 줄)부터 적요가 끝나는 자리 — 팝업 «닫기» · 거리 줄 «현위치 →» · 화주 머리 «의뢰지» · 출발지 · 도착지 팝업 머리 — 앞까지 — 적요가 아닌 화주 이름 · 버튼 글을 안 먹게(«[적요상세/정보]» 머리표는 시작으로 안 친다 · 끝 자리가 하나도 없는 원문은 끝까지 읽는다) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""(?:적요 내용|적요상세(?!/)(?![\s\S]*적요 내용))\s+([\s\S]*?)(?=\s*(?:\[출발지상세\]|\[도착지상세\]|현위치\s*→|의뢰지|닫기)|${'$'})""")),
            FieldSpec(PageField.MEMO, "적요 상세 팝업 «적요 내용» ~ «닫기»", "까대기 있음 직접운반 / 대기 30분", Seen.SIM, Handling.READ, "서버 적요(detailMemo) — 줄바꿈을 공백으로 접는 것은 서버 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""적요 내용\s+([\s\S]*?)\s*닫기"""), part = "popup"),
            FieldSpec(PageField.MEMO, "본문 «적요상세» 줄", "적요상세 10시전하차 착불", Seen.SIM, Handling.READ, "서버 적요(detailMemo) — 팝업이 없을 때 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""적요상세(?!/)[ \t]+([^\n]+)"""), part = "body"),
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선(화면 글자 «(직선)») */
            FieldSpec(PageField.PICKUP_DISTANCE, "적요 칸 둘째 줄", "현위치 → 상차지(직선)23.5KM", Seen.REAL, Handling.UNUSED),
            /* 실물: 확정 전 상세 0/3 · 확정 뒤 5/5 — 확정 뒤에만 나온다(같은 콜 신한로직스로 확인) · 하차 정거장 거리(상차지 → 하차지) · 직선(화면 글자 «(직선)») */
            FieldSpec(PageField.DELIVERY_DISTANCE, "적요 칸 셋째 줄", "상차지 → 하차지(직선)35.9KM", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "출발지 상세 팝업 «위치»", "경기 용인시 처인구 양지면 …", Seen.SIM, Handling.READ, "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n위치[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)""")),
            FieldSpec(PageField.DROPOFF, "도착지 상세 팝업 «위치»", "서울 강남구 역삼동 …", Seen.SIM, Handling.READ, "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n위치[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)""")),
            FieldSpec(PageField.CLOCK, "출발지 줄 가운데", "김유정 / 20시/양지면(용인", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "위치 팝업", "고객 · 부서 · 담당 · 전화1 · 전화2", Seen.SIM, Handling.UNUSED, "서버가 원문으로 받는다"),
            /* 실물 머리 줄은 확정 전 3/3 «이름[전화]» · 확정 뒤 5/5 «이름-전화» — 두 꼴 모두 이름은 대괄호 앞 · «-숫자» 앞 */
            FieldSpec(PageField.CONTACT, "상세 머리 줄 «배차사-전화» · «배차사[전화]» 앞", "고양퀵서비스-031-932-7722 · (주)신한로직스[1588-5480]", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""^\s*([^\n\[]+?)(?:\[|-(?=\d))"""), part = "dispatcher"),
            FieldSpec(PageField.CONTACT, "상세 머리 줄 «배차사-전화» 뒤 · «배차사[전화]» 대괄호 안", "031-932-7722 · 1588-5480", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""^\s*[^\n\[]+?[-\[](\d[\d-]*\d)(?=\]|\s|${'$'})"""), part = "dispatcherPhone"),
            /* 콜을 맡긴 의뢰인(사람 · 가게) — 이름표만 있는 줄이면 다음 줄 값 · 한 칸 띄어 이은 글이면 «출발지» 앞까지 */
            FieldSpec(PageField.CONTACT, "의뢰지 줄", "쑥쑥 TEST · 오티디코퍼레이션/ 아크앤북동탄호수점 · ***(확정 전 실물은 가린 글자)", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(서버 번호 7 · 걸음 3 — 의뢰인) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""의뢰지[ \t]*:?[ \t]*(?:\n[ \t]*)?(?!출발지)(\S[^\n]*?)(?=[ \t]+출발지|\n|${'$'})"""), part = "requester"),
            FieldSpec(PageField.CONTACT, "출발지 상세 팝업 «고객»", "고객 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n고객[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "pickup.customer"),
            FieldSpec(PageField.CONTACT, "출발지 상세 팝업 «부서»", "부서 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n부서[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "pickup.department"),
            FieldSpec(PageField.CONTACT, "출발지 상세 팝업 «담당»", "담당 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n담당[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "pickup.contactName"),
            FieldSpec(PageField.CONTACT, "출발지 상세 팝업 «전화1»", "전화1 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n전화1[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "pickup.phone1"),
            FieldSpec(PageField.CONTACT, "출발지 상세 팝업 «전화2»", "전화2 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n전화2[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "pickup.phone2"),
            FieldSpec(PageField.CONTACT, "도착지 상세 팝업 «고객»", "고객 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n고객[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "dropoff.customer"),
            FieldSpec(PageField.CONTACT, "도착지 상세 팝업 «부서»", "부서 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n부서[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "dropoff.department"),
            FieldSpec(PageField.CONTACT, "도착지 상세 팝업 «담당»", "담당 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n담당[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "dropoff.contactName"),
            FieldSpec(PageField.CONTACT, "도착지 상세 팝업 «전화1»", "전화1 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n전화1[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "dropoff.phone1"),
            FieldSpec(PageField.CONTACT, "도착지 상세 팝업 «전화2»", "전화2 …(이름표만 있는 줄이면 다음 줄)", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n전화2[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)"""), part = "dropoff.phone2"),
        ),
        Page.MY_LIST to listOf(
            FieldSpec(PageField.STAGE, "완료 탭 줄 배지", "완료", Seen.SIM, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "완료 탭 줄", "회사 이름", Seen.SIM, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "완료 탭 줄", "상차 시각 · 하차 시각", Seen.SIM, Handling.UNUSED),
        ),
        Page.MY_CALL to listOf(
            /* 확정 뒤 상세 = 완료 탭에서 연 콜 — 인성설명서 장면 1621 · 자막 16:29 */
            FieldSpec(PageField.PICKUP, "출발지 줄", "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.DROPOFF, "도착지 줄", "서울강남구 / 역삼동 / 이희억", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.FARE, "요금 줄 «요금 :» · 착불이면 «고객에게 받을 금액» 줄 — 확정 뒤 상세의 «실운임 :» 은 수수료를 뺀 값이라 안 읽는다(영상 1621 · 1743)", "고객에게 받을 금액 45,000", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen — PageFieldRead",
                read = Regex("""(?:요금\s*:|고객에게 받을 금액)\s*([\d,]+)(?![\d.])""")),
            /* 수수료를 뺀 기사님 몫 — 목록 요금 · 확정 전 «요금 :» 과 한 돈(영상 1621 · 1743) · 이름표 없는 요금 줄은 그대로(원달앱 착불 손 확정 콜 요금 — 돈 9) */
            FieldSpec(PageField.FARE, "확정 뒤 «실운임 :» 줄", "실운임 : 34,650(착불)", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(서버 돈 7 · 걸음 3) — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱은 이 줄을 안 읽는다",
                read = Regex("""실운임\s*:\s*([\d,]+)(?![\d.])"""), part = "income"),
            /* 수수료 앞의 착불 현장 현금 = 받을 돈(영상 1743) */
            FieldSpec(PageField.FARE, "확정 뒤 «고객에게 받을 금액» 줄(착불)", "고객에게 받을 금액 45,000", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(서버 돈 7 · 걸음 3) — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱은 이 줄을 안 읽는다",
                read = Regex("""고객에게 받을 금액\s*([\d,]+)(?![\d.])"""), part = "collect"),
            FieldSpec(PageField.CONTACT, "머리 줄", "(주)신한로직스-1588-5480", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.MEMO, "적요 칸", "1시상차 6박스 …", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.STAGE, "상태 줄", "상태 : 배송", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.VEHICLE_TYPE, "차량 줄", "차량 : 다마스", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.TOLL, "탁송료 줄", "탁송료 : 0", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(서버 돈 7 · 걸음 3) — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱은 이 줄을 안 읽는다",
                read = Regex("""탁송료[ \t]*:[ \t]*([\d,]+)""")),
            FieldSpec(PageField.COMMISSION, "수수료 줄", "수수료 : 23%", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(서버 돈 7 · 걸음 3) — 확정 뒤 상세라 서버 상세 자료(detailRecordOf) 밖 · 원달앱은 이 줄을 안 읽는다",
                read = Regex("""수수료\s*:\s*(\d+(?:\.\d+)?%)""")),
        ),
    )

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords — 목록 차종 칸 한 노드(«다» · «1t») 또는 요금과 뭉친 노드(«라2.2»)의 앞 낱말 · REAL 은 표 견본 «1t · 다 · 라», 나머지는 시뮬레이터 목록 · «용/소» 는 영상 1719 목록 차종 칸에 있고 뜻은 모른다(용달/소형 같음) — 차종을 모름으로 두어 목록 줄은 묶되 차종 필터를 걸었으면 걸러진다 · «트럭-1t» 류는 확정 뒤 상세 «차량 :» 줄의 글자(실물은 «트럭-1t» 하나 · 나머지 톤수는 같은 꼴) · «바이크» 는 화면에서 못 본 오토바이 줄임말 · 원달앱은 이 표의 낱말 전부로 목록 줄을 묶는 기준 칸을 찾는다 — 목록 낱말과 상세 낱말이 함께 기준 칸이 되어, 목록에 «트럭-1t» · «바이크 3» 이 와도 차종 · 요금으로 읽힌다) */
    val vehicleWords: Map<String, String?> = mapOf(
        "오" to "오토바이",
        "다" to "다마스",
        "라" to "라보",
        "승" to "승용차",
        "1t" to "1t",
        "1.4" to "1.4t",
        "2.5t" to "2.5t",
        "2.5" to "2.5t",
        "3.5t" to "3.5t",
        "3.5" to "3.5t",
        "5t" to "5t",
        "11t" to "11t",
        "14t" to null,
        "18t" to null,
        "25t" to "25t",
        "용/소" to null,
        "바이크" to "오토바이",
        "트럭-1t" to "1t",
        "트럭-1.4t" to "1.4t",
        "트럭-2.5t" to "2.5t",
        "트럭-3.5t" to "3.5t",
        "트럭-5t" to "5t",
        "트럭-11t" to "11t",
        "트럭-25t" to "25t",
    )

    /** 📦 크기 낱말 → 라면박스 수(shared sizeWords) · null 은 박스 수 모름 */
    val sizeWords: Map<String, Int?> = emptyMap()

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — 목록 머리(«신규» + «빠른설정») · 상세(«적요상세» + «요금») · 첫 화면(«인성퀵화면분할» — 홈에서 바로 알아보기)) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
        listOf("신규", "빠른설정"),
        listOf("적요상세", "요금"),
        listOf("인성퀵화면분할"),
    )

    /** ⚙️ 배차망 규칙(shared modes · packageKeywords · safeCancelSec · detailBackSec — 자동에서 원달앱이 확정을 누르고 안전취소 시간 안에 결재를 기다린다 · 상세 머묾 시간은 없다(팝업 셋을 다 읽고 보낸다)) · 시간은 값이 아니라 설정 칸 이름(FilterConfig.secOf) */
    val modes: Set<String> = setOf("AUTO", "MANUAL", "SIMULATION", "ALARM")
    val packageKeywords: List<String> = listOf("insung")
    val safeCancelSecKey: String? = "safeCancelSecInsung"
    val detailBackSecKey: String? = null

    /** 🖥️ 페이지 전부 — 차례가 판별 차례 · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
        ScreenSpec(
            "확정 뒤 상세",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("적요상세"), any = listOf("인수증 전송", "카드 승인"))),
            false,
            listOf(
                OverlaySpec("출발지 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("출발지 상세", "상차지 상세"))), "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", Seen.REAL, listOf("ex_images/인성/출발지상세.png"), action = OverlayAction.FILL_PICKUP),
                OverlaySpec("도착지 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("도착지 상세", "하차지 상세"))), "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", Seen.REAL, listOf("ex_images/인성/도착지상세.png"), action = OverlayAction.FILL_DROPOFF),
                OverlaySpec("적요 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("적요 상세", "적요 내용"))), "적요 전문을 보여 준다", Seen.SIM, listOf("ex_images/인성/적요상세.png (시뮬레이터 화면)"), toCollect = "실물 캡처", action = OverlayAction.FILL_MEMO),
                OverlaySpec("취소 확인 팝업", OverlayKind.POPUP, emptyList(), "확정 뒤 취소를 누르면 한 번 더 묻는다", Seen.UNKNOWN, listOf(), toCollect = "캡처 · 알아보는 글자"),
                OverlaySpec("취소 불가 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("취소할 수 없"), none = listOf("적요상세"))), "안전취소 시간이 지나 취소할 수 없다", Seen.UNKNOWN, listOf(), toCollect = "캡처", action = OverlayAction.ERROR),
            ),
            Seen.REAL,
            listOf("ex_images/인성/상세-확정(다른사람 못잡음, 취소+1).png", "ex_images/인성/상세-미확정1.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정2.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정5.png (내용은 확정 뒤 상세)", "ex_images/인성/상세와확정.png (가운데 폰 — 금액 줄 «실운임 :»)", "ex_images/인성/인성설명서/영상_1621.jpg (결재 줄 «취소» · «닫기» · «카드 승인» — 금액 줄 «실운임 : 22,330(신용)»)", "ex_images/인성/인성설명서/영상_1743.jpg (같은 꼴 — 착불 «고객에게 받을 금액 45,000» 아래 «실운임 : 34,650(착불)»)"),
            base = "myCall",
            buttons = ScreenButtons(keep = "닫기", cancel = "취소"),
        ),
        ScreenSpec(
            "확정 전 상세",
            StandardScreen.DETAIL_PRE_CONFIRM,
            listOf(ScreenMatch(all = listOf("적요상세", "확정"), any = listOf("요금", "실운임"))),
            false,
            listOf(
                OverlaySpec("출발지 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("출발지 상세", "상차지 상세"))), "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", Seen.REAL, listOf("ex_images/인성/출발지상세.png"), action = OverlayAction.FILL_PICKUP),
                OverlaySpec("도착지 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("도착지 상세", "하차지 상세"))), "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", Seen.REAL, listOf("ex_images/인성/도착지상세.png"), action = OverlayAction.FILL_DROPOFF),
                OverlaySpec("적요 상세 팝업", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("적요 상세", "적요 내용"))), "적요 전문을 보여 준다", Seen.SIM, listOf("ex_images/인성/적요상세.png (시뮬레이터 화면)"), toCollect = "실물 캡처", action = OverlayAction.FILL_MEMO),
                OverlaySpec("계산서 오더 안내 띠", OverlayKind.BANNER, listOf(ScreenMatch(any = listOf("계산서 발급오더의 경우"))), "계산서 오더 — 위수탁세금계산서 발행에 동의한 기사만 처리 · 부가세 포함 입금", Seen.REAL, listOf("ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png")),
                OverlaySpec("확정 확인 팝업", OverlayKind.POPUP, emptyList(), "확정을 누르면 한 번 더 묻는다", Seen.UNKNOWN, listOf(), toCollect = "캡처 · 알아보는 글자"),
                OverlaySpec("이미 배차됨 팝업", OverlayKind.POPUP, emptyList(), "남이 먼저 잡았다", Seen.UNKNOWN, listOf(), toCollect = "캡처 · 알아보는 글자"),
                OverlaySpec("확정 실패 팝업", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("시간이 지나", "실패"), none = listOf("적요상세"))), "확정이 안 됐다 — 적요 글의 «실패» · «시간이 지나»와 가를 머리 글자가 필요하다", Seen.UNKNOWN, listOf(), toCollect = "캡처 · 팝업 머리 글자", action = OverlayAction.ERROR),
            ),
            Seen.REAL,
            listOf("ex_images/인성/상세-미확정(다른사람 잡을수 있음).png", "ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png", "ex_images/인성/인성설명서/영상_0938.jpg (금액 줄 «요금 :»)", "ex_images/인성/인성설명서/영상_0532.jpg (금액 줄 «요금 :»)"),
            toCollect = "알아보는 글자 any 의 «실운임» 은 확정 전 상세에서 본 근거가 없다(영상 0938 · 0532 는 «요금 :») — 확정 전 상세에서 «실운임 :» 이 보이는 캡처",
            base = "newCall",
            buttons = ScreenButtons(accept = "확정", filterOut = "취소"),
        ),
        ScreenSpec(
            "홈 «인성퀵화면분할»",
            StandardScreen.HOME,
            listOf(ScreenMatch(all = listOf("인성퀵화면분할"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성/인성홈.png"),
            base = "home",
        ),
        ScreenSpec(
            "배차수신 화면",
            null,
            listOf(ScreenMatch(all = listOf("배차 하시겠습니까"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성/인성설명서/영상_0526.jpg"),
            toCollect = "기준 페이지는 새 콜 화면 — 원달앱이 처리 길(상세 채우기 · 확정)을 타지 않게 화면 종류를 비워 둔다 · 기사님 인성 설정이 원터치가 아닐 때(투터치) 뜨는 «예 / 아니오» 화면",
        ),
        ScreenSpec(
            "지도형 상세",
            null,
            listOf(ScreenMatch(all = listOf("닫기", "수행하기", "출발지까지"), none = listOf("총 수입"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성/인성설명서/영상_0948.jpg"),
            toCollect = "기준 페이지는 새 콜 화면 — 원달앱이 처리 길을 타지 않게 화면 종류를 비워 둔다 · 인성플렉스 상세(총 수입 + 수행하기)와 같은 «닫기 / 수행하기» 틀이라 «총 수입이 없다»로 가른다 · 표식 «적요상세 + 요금» 으로 인성을 알아본다",
        ),
        ScreenSpec(
            "신규 콜 목록",
            StandardScreen.LIST,
            listOf(ScreenMatch(all = listOf("신규", "빠른설정"), none = listOf("장터게시판"))),
            false,
            listOf(
                OverlaySpec("로딩 토스트", OverlayKind.TOAST, listOf(ScreenMatch(any = listOf("오더 조회", "기다려 주십"))), "목록을 다시 불러오는 중 — 이 화면은 건너뛴다", Seen.UNKNOWN, listOf(), toCollect = "캡처", action = OverlayAction.SKIP),
                OverlaySpec("메뉴 층", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("업무종료", "프로그램종료", "메뉴닫기"))), "아래 «메뉴»를 누르면 목록을 오른쪽에서 덮는다 — 머리 «엘비스 Ver. …» · 당일정산 · 업무종료 · 환경설정 · 업데이트공지 · 기사정보 · 프로그램종료 · 메뉴닫기", Seen.REAL, listOf("ex_images/인성/인성설명서/영상_0544.jpg")),
                OverlaySpec("잠금 팝업", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("오더 선택 잠금 상태"))), "오더 선택 잠금이 켜져 있어 콜을 눌러도 상세가 안 열린다 — «확인» 으로 닫는다", Seen.REAL, listOf("ex_images/인성/인성설명서/영상_1328.jpg")),
                OverlaySpec("자료 없음 팝업", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("오더 상세", "자료가 존재하지 않습니다"))), "잡은 콜이 없을 때 «완료» 를 누르면 목록 위에 뜬다 — 완료 탭으로 안 넘어간다. «확인» 으로 닫는다", Seen.REAL, listOf("ex_images/인성/인성설명서/영상_1611.jpg")),
            ),
            Seen.REAL,
            listOf("ex_images/인성/위아래나뉜인성콜리스트.png", "ex_images/인성/인성콜_스플릿오더화면.png", "ex_images/인성/인성설명서/영상_0441.jpg", "ex_images/인성/인성설명서/영상_1313.jpg", "ex_images/인성/인성설명서/영상_1719.jpg"),
            base = "newList",
        ),
        ScreenSpec(
            "완료 탭",
            StandardScreen.MY_ORDERS,
            listOf(ScreenMatch(all = listOf("완료", "장터게시판"))),
            true,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/인성/인성설명서/영상_1633.jpg"),
            base = "myList",
        ),
        ScreenSpec(
            "메시지함 탭",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "GPS 탭",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "게시판",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "환경설정",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "당일정산",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "업데이트공지",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "메뉴(영상 0544)에서 눌러 가는 화면 — 캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "기사정보",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "메뉴(영상 0544)에서 눌러 가는 화면 — 캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "전표",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자",
        ),
        ScreenSpec(
            "탁송",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (상세 바닥 «탁송» 버튼 뒤)",
        ),
        ScreenSpec(
            "카드 승인",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (확정 뒤 상세 «카드 승인» 버튼 뒤)",
        ),
        ScreenSpec(
            "인수증 전송",
            StandardScreen.NETWORK_MENU,
            emptyList(),
            false,
            emptyList(),
            Seen.UNKNOWN,
            listOf(),
            toCollect = "캡처 · 알아보는 글자 (확정 뒤 상세 «인수증 전송» 버튼 뒤)",
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
    )
}

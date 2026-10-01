package com.onedal.app.plugins.insung

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.Seen

/**
 * 📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/인성 · 시뮬 onedal-sim).
 * ⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/networkPages.ts` 의 «insung» — 서버도 같은 표를 읽는다(reviews/34).
 */
object InsungPages {
    val pages: PageSpecs = mapOf(
        Page.LIST to listOf(
            FieldSpec(PageField.PICKUP, "출발지 칸", "@초이동 · @남양주(오남", Seen.REAL, Handling.READ, "InsungParser.parse"),
            FieldSpec(PageField.DROPOFF, "도착지 칸", "이태원동 · 김포(대곶면", Seen.REAL, Handling.READ, "InsungParser.parse"),
            FieldSpec(PageField.RESERVATION, "출발지 칸 앞글자", "낼7시/ · 낼6시30/ · 21시/ · 오후7시30/ · 10일/", Seen.REAL, Handling.READ, "InsungParser.reservationOf"),
            FieldSpec(PageField.CLOCK, "도착지 칸 앞글자 (도착 약속)", "낼8/ · 8시/ · 낼10시/", Seen.REAL, Handling.DROPPED, "InsungParser.parse — 출발지 쪽이 있으면 버림"),
            FieldSpec(PageField.VEHICLE_TYPE, "차종 칸", "1t · 다 · 라 · 1t화물", Seen.REAL, Handling.READ, "InsungParser.readVehicleAndFare"),
            FieldSpec(PageField.FARE, "요금 칸 (만 원)", "40.0 · 270.0", Seen.REAL, Handling.READ, "InsungParser.readVehicleAndFare"),
            FieldSpec(PageField.PICKUP_DISTANCE, "거리 칸 윗줄", "17.8", Seen.REAL, Handling.READ, "InsungParser.parse"),
            FieldSpec(PageField.DELIVERY_DISTANCE, "거리 칸 아랫줄", "0.0 · 341.3", Seen.REAL, Handling.READ, "InsungParser.parse"),
        ),
        Page.DETAIL to listOf(
            FieldSpec(PageField.STAGE, "상태 줄", "상태 : 배송", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""상태\s*:\s*(?!\S*\s*:)(\S+)""")),
            FieldSpec(PageField.ITEM_SIZE, "물품 줄", "물품 :", Seen.REAL, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""물품[ \t]*:[ \t]*([^\n]+)""")),
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
            FieldSpec(PageField.MEMO, "적요 칸 · 적요 상세 팝업", "1시상차 6박스 카트가지고 고객님앞 갖다주세요", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — 본문 «적요상세» 줄(없으면 팝업 «적요 내용»)부터 출발지 · 도착지 팝업 머리 앞까지(적요 팝업을 못 연 상세도 본문 적요를 본다 · «[적요상세/정보]» 머리표는 시작으로 안 친다 · 사이의 버튼 글 «출발지 · 도착지 · 확정 · 취소 · 닫기»도 든다) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""(?:적요상세(?!/)|적요 내용)\s+([\s\S]*?)(?=\s*(?:\[출발지상세\]|\[도착지상세\])|${'$'})""")),
            FieldSpec(PageField.MEMO, "적요 상세 팝업 «적요 내용» ~ «닫기»", "까대기 있음 직접운반 / 대기 30분", Seen.SIM, Handling.READ, "서버 적요(detailMemo) — 줄바꿈을 공백으로 접는 것은 서버 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""적요 내용\s+([\s\S]*?)\s*닫기"""), part = "popup"),
            FieldSpec(PageField.MEMO, "본문 «적요상세» 줄", "적요상세 10시전하차 착불", Seen.SIM, Handling.READ, "서버 적요(detailMemo) — 팝업이 없을 때 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""적요상세(?!/)[ \t]+([^\n]+)"""), part = "body"),
            FieldSpec(PageField.PICKUP_DISTANCE, "적요 칸 둘째 줄", "현위치 → 상차지(직선)23.5KM", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.DELIVERY_DISTANCE, "적요 칸 셋째 줄", "상차지 → 하차지(직선)35.9KM", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "출발지 상세 팝업 «위치»", "경기 용인시 처인구 양지면 …", Seen.SIM, Handling.READ, "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)",
                read = Regex("""\[출발지상세\](?:(?!\[도착지상세\])[\s\S])*?\n위치[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)""")),
            FieldSpec(PageField.DROPOFF, "도착지 상세 팝업 «위치»", "서울 강남구 역삼동 …", Seen.SIM, Handling.READ, "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)",
                read = Regex("""\[도착지상세\](?:(?!\[출발지상세\])[\s\S])*?\n위치[ \t]*:?[ \t]*(?:\n[ \t]*)?([^\n]+)""")),
            FieldSpec(PageField.CLOCK, "출발지 줄 가운데", "김유정 / 20시/양지면(용인", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "위치 팝업", "고객 · 부서 · 담당 · 전화1 · 전화2", Seen.SIM, Handling.UNUSED, "서버가 원문으로 받는다"),
            FieldSpec(PageField.CONTACT, "상세 머리 줄 «배차사-전화» 앞", "고양퀵서비스-031-932-7722", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""^\s*([^\n]+?)-(?=\d)"""), part = "dispatcher"),
            FieldSpec(PageField.CONTACT, "상세 머리 줄 «배차사-전화» 뒤", "031-932-7722", Seen.SIM, Handling.READ, "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다",
                read = Regex("""^\s*[^\n]+?-(\d[\d-]*\d)(?=\s|${'$'})"""), part = "dispatcherPhone"),
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
        Page.CONFIRM to listOf(
            FieldSpec(PageField.PICKUP, "출발지 줄", "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.DROPOFF, "도착지 줄", "서울강남구 / 역삼동 / 이희억", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen"),
            FieldSpec(PageField.FARE, "요금 줄", "요금 : 40,000(신용)", Seen.REAL, Handling.READ, "InsungSequence.buildOrderFromScreen — PageFieldRead",
                read = Regex("""요금\s*:\s*([\d,]+)(?![\d.])""")),
            FieldSpec(PageField.CONTACT, "머리 줄", "(주)신한로직스-1588-5480", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.MEMO, "적요 칸", "1시상차 6박스 …", Seen.REAL, Handling.UNUSED),
        ),
        Page.MY_ORDERS to listOf(
            FieldSpec(PageField.STAGE, "완료 탭 줄 배지", "완료", Seen.SIM, Handling.UNUSED),
            FieldSpec(PageField.CONTACT, "완료 탭 줄", "회사 이름", Seen.SIM, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "완료 탭 줄", "상차 시각 · 하차 시각", Seen.SIM, Handling.UNUSED),
        ),
    )
}

package com.onedal.app.plugins.hwamul24

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
 * 📄 **화물24시 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/화물24시).
 * ⚠️ 실물 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처가 근거다. 시뮬레이터 잡기 전 상세는 실물 18 «화물상세정보»와 같은 꼴이다 — 잡은 콜을 열면 배차내역 상세(3탭).
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (`cd onedal-web && pnpm gen:pages`). 원천은 `onedal-web/shared/src/network/networkPages.hwamul24.ts` — 서버도 같은 표를 읽는다.
 */
object Hwamul24Pages {
    val pages: PageSpecs = mapOf(
        Page.NEW_LIST to listOf(
            FieldSpec(PageField.PICKUP, "왼쪽 윗줄", "경기 시흥 정왕동", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            FieldSpec(PageField.DROPOFF, "오른쪽 윗줄", "경기 안산 상록구 장상동", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            FieldSpec(PageField.FARE, "오른쪽 아랫줄", "50,000원", Seen.REAL, Handling.READ, "Hwamul24CardGrouping.fareOf"),
            /* 운 알약이 있으면 목록 금액은 합계 · «운»이 기사님 몫 · «수»가 수수료(돈 «화물24시 목록 규칙» 1 · 2) — 선/착불 줄에만 나온다(실물 캡처 50 · 11) */
            FieldSpec(PageField.FARE, "넷째 줄 «운» 알약(만 원 단위)", "운 7.0 · 운 18.0", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(원달앱 돈 9 · 걸음 5) — 원달앱 목록 읽기는 정의 표를 안 읽는다(Hwamul24CardGrouping)",
                read = Regex("""(?:^|\s)운\s+(\d+\.\d+)(?=\s|${'$'})"""), part = "income"),
            /* 상차 · 하차 쪽 배지 «수»(수작업)와 같은 글자 — 소수 숫자 하나가 뒤에 홀로 올 때만 알약으로 읽는다(«수 5Km» · «수 3.5톤/윙» 은 아니다) */
            FieldSpec(PageField.FARE, "넷째 줄 «수» 알약(만 원 단위)", "수 1.0 · 수 2.0", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(원달앱 돈 9 · 걸음 5) — 원달앱 목록 읽기는 정의 표를 안 읽는다(Hwamul24CardGrouping)",
                read = Regex("""(?:^|\s)수\s+(\d+\.\d+)(?=\s|${'$'})"""), part = "fee"),
            FieldSpec(PageField.VEHICLE_TYPE, "셋째 줄 앞", "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)", Seen.REAL, Handling.READ, "Hwamul24Parser.parse"),
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선(설명 영상 «현위치에서 상차지까지 직선거리») */
            FieldSpec(PageField.PICKUP_DISTANCE, "상차 배지 옆", "15Km", Seen.REAL, Handling.READ, "Hwamul24CardGrouping.pickupDistanceOf"),
            FieldSpec(PageField.RESERVATION, "상차 배지", "당상 · 내상(실물 캡처에는 없음)", Seen.REAL, Handling.READ, "Hwamul24Parser.reservationOf"),
            FieldSpec(PageField.TAGS, "하차 배지 · 꼬리표", "당착 · 내착 (읽음) · 수 · 지 · 독차 · 인수증 (잡음으로 뺌)", Seen.REAL, Handling.READ, "Hwamul24Parser.badgesOf"),
            FieldSpec(PageField.MEMO, "셋째 줄 화물 글", "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상", Seen.REAL, Handling.READ, "Hwamul24MemoTimes.split — 상차 쪽만 예약으로"),
            FieldSpec(PageField.CLOCK, "하차 배지 앞 시각", "06:32 (등록 시각인지 모름)", Seen.REAL, Handling.READ, "Hwamul24Parser.parse — postTime"),
        ),
        Page.NEW_CALL to listOf(
            /* 실물 캡처 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문은 원달앱이 머리를 떼고 보내 원문 기준으로는 모름 */
            FieldSpec(PageField.ORDER_NO, "머리", "화물번호:3-9483-2159", Seen.REAL, Handling.READ, "서버 상세 자료 화물번호(detailRecordOf orderNo) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""화물번호\s*:\s*(\d-\d{4}-\d{4})""")),
            /* 주선한 배차 사무실(설명 영상 00:59) — 실물 캡처 18 · 51 · 53 · 띄어 쓴 이름은 마지막 토막만 읽힌다 */
            FieldSpec(PageField.CONTACT, "머리 이름(화물번호 위 큰 글자 · 등록 구분 동그라미 · N분 안보기 단추 앞)", "(주)엠케이물류 · 화물과퀵", Seen.REAL, Handling.READ, "서버 상세 자료 배차사(detailRecordOf dispatcherName) — 원달앱이 머리를 떼고 보내는 동안은 원문에 없다 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""(\S+)\s+(?:[A-Z]\s+)?(?:\d+분 안보기\s+)?화물번호\s*:"""), part = "dispatcher"),
            FieldSpec(PageField.CLOCK, "머리", "등록시간:05:18분", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "상차지 칸", "경기 군포 부곡동 [당상][수] 5Km", Seen.REAL, Handling.UNUSED, "목록 값을 쓴다"),
            /* 상차지 칸 주소 — 끝 «(상호)» · 배지(«[당상]» · «당상» «수» 노드) · «NKm» · «하차지» 앞까지 · 동 단위와 번지 · 건물 단위가 섞임(실물 캡처 18 · 51 · 53) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.PICKUP, "상차지 칸 주소", "경기 군포 당정동 공단로124번길 4 · 경기 군포 부곡동", Seen.REAL, Handling.READ, "서버 상세 자료 정거장 상세 주소(detailRecordOf pickupDetails addressDetail) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""상차지\s+([^\s(\[](?:(?!\s*[(\[]|\s+(?:(?:당상|내상|지상|당착|내착|지착|당/내|수|지)(?:\s|${'$'})|\d+\s*Km|하차지\s|화물정보))[\s\S])*)"""), part = "pickup.address"),
            /* 상차지 칸 주소 바로 뒤 괄호 안 글자(실물 캡처 53 «(크레텍)») — 괄호가 없으면 상호 없음 · 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.CONTACT, "상차지 칸 주소 끝 괄호", "(크레텍)", Seen.REAL, Handling.READ, "서버 상세 자료 정거장 상호(detailRecordOf pickupDetails customerName) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""상차지\s+[^\s(\[](?:(?!\s*[(\[]|\s+(?:(?:당상|내상|지상|당착|내착|지착|당/내|수|지)(?:\s|${'$'})|\d+\s*Km|하차지\s|화물정보))[\s\S])*\s*\(([^)]+)\)"""), part = "pickup.customer"),
            /* 첫 상차 정거장 거리(내 자리 → 상차지) · 직선 · 「하차지」 앞까지에서 찾는다 · 실물 캡처 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.PICKUP_DISTANCE, "상차지 칸 끝", "5Km · 18Km", Seen.REAL, Handling.READ, "원달앱 Hwamul24CardGrouping.pickupDistanceOf(손 상세 — 정의 표 줄이 아니라 그 함수 글자로 읽음)",
                read = Regex("""상차지\s(?:(?!하차지)[\s\S])*?(\d+)\s*Km""")),
            FieldSpec(PageField.DROPOFF, "하차지 칸", "서울 중구 을지로6가 [당착][수]", Seen.REAL, Handling.UNUSED, "목록 값을 쓴다"),
            /* 하차지 칸 주소 — 끝 «(상호)» · 배지 · «NKm» · «화물정보» 앞까지 · 끝 «왕복»은 주소에 남고 지오코딩 글에서 addressCut 이 뗀다(실물 캡처 51 «와동왕복 32Km») — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.DROPOFF, "하차지 칸 주소", "경기 화성 신동 703 · 경기 안산 단원구 와동왕복", Seen.REAL, Handling.READ, "서버 상세 자료 정거장 상세 주소(detailRecordOf dropoffDetails addressDetail) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""하차지\s+([^\s(\[](?:(?!\s*[(\[]|\s+(?:(?:당상|내상|지상|당착|내착|지착|당/내|수|지)(?:\s|${'$'})|\d+\s*Km|하차지\s|화물정보))[\s\S])*)"""), part = "dropoff.address"),
            /* 하차지 칸 주소 바로 뒤 괄호 안 글자 — 상차지와 같은 꼴로 읽는다(하차지 괄호 상호는 실물 캡처에 아직 없다) · 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.CONTACT, "하차지 칸 주소 끝 괄호", "(상호)", Seen.REAL, Handling.READ, "서버 상세 자료 정거장 상호(detailRecordOf dropoffDetails customerName) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""하차지\s+[^\s(\[](?:(?!\s*[(\[]|\s+(?:(?:당상|내상|지상|당착|내착|지착|당/내|수|지)(?:\s|${'$'})|\d+\s*Km|하차지\s|화물정보))[\s\S])*\s*\(([^)]+)\)"""), part = "dropoff.customer"),
            /* 하차 정거장 거리(상차지 → 하차지) · 최단거리(상세 안내 «상ㆍ하차지간 거리는 최단거리이므로 실제 도로거리와 다를 수 있습니다») — 직선으로 읽음 · 「화물정보」 앞까지에서 찾는다 · 실물 캡처 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "하차지 칸 오른쪽", "36Km · 와동왕복 32Km", Seen.REAL, Handling.READ, "지금 읽는 곳 없음(원달앱 거리 5 · 걸음 5)",
                read = Regex("""하차지\s(?:(?!화물정보)[\s\S])*?(\d+)\s*Km""")),
            FieldSpec(PageField.MEMO, "화물정보 칸", "지금상 당착 59박스 수/수-A [독차]", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) — «화물정보» 다음 «톤수» 앞(배지 «독차» 포함) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""화물정보\s+(?!톤수)([\s\S]*?)(?=\s+톤수|${'$'})""")),
            /* 콜 차종 — 목록 줄이 없을 때의 차종 글자 · 실물 캡처 ex_images/화물24시 화물상세정보 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.VEHICLE_TYPE, "차량 표 톤수", "톤수 3.5톤 · 1톤", Seen.REAL, Handling.READ, "서버 상세 자료 짐 묶음 차종 글자(detailRecordOf load.vehicleText) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""톤수\s+(\d+(?:\.\d+)?톤)"""), part = "ton"),
            /* 차 몸 모양(짐 줄 «몸 모양») · 실물 캡처 ex_images/화물24시 화물상세정보 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.VEHICLE_TYPE, "차량 표 차종", "차종 윙바디 · 전체", Seen.REAL, Handling.READ, "서버 상세 자료 짐 묶음 몸 모양 줄(detailRecordOf load) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""차종\s+(?!적재중량|운행방법|운송료)(\S+)"""), part = "body"),
            /* 실을 무게(짐 줄 «무게») — 아래 안내 «※적재중량은 화주와 통화하여 …» 는 값이 아니다 · 실물 캡처 ex_images/화물24시 화물상세정보 3/3 에 있다(18_화물상세정보_배차신청 · 51_화물상세정보 · 53/54 같은 콜) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.VEHICLE_TYPE, "차량 표 적재중량", "적재중량 3.85톤 · 2.1톤 이하", Seen.REAL, Handling.READ, "서버 상세 자료 짐 묶음 무게 줄(detailRecordOf load) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""적재중량\s+(\d+(?:\.\d+)?톤(?:\s*이하)?)"""), part = "weight"),
            FieldSpec(PageField.TAGS, "운행방법", "편도", Seen.REAL, Handling.UNUSED),
            /* 💰 목록 요금과 같은 «운송료»만 — 실물은 «운송료» · «60,000» 이 다른 노드, 시뮬은 «60,000원» (부가세 · 수납금액은 안 읽음) */
            FieldSpec(PageField.FARE, "운송료 · 부가세 · 수납금액", "60,000 · 6,000 · 65,144", Seen.REAL, Handling.READ, "목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)",
                read = Regex("""운송료\s*:?\s*([\d,]+)""")),
            /* 카드 콜에만(18 · 설명 영상 0104) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.FARE, "금액 표 부가세", "부가세 6,000", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 부가세 줄(detailRecordOf money) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""부가세\s+([\d,]+)"""), part = "vat"),
            /* 인수증 콜에만(51 · 53 · 54) — 서버 원문 0 건 */
            FieldSpec(PageField.FARE, "금액 표 합계금액", "합계금액 140,000", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 합계 줄(detailRecordOf money) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""합계금액\s+([\d,]+)"""), part = "total"),
            /* 인수증 콜에만(51 · 53 · 54) · 카드 콜의 계산법 글자 «수수료 =» 는 금액이 아니다 — 서버 원문 0 건 */
            FieldSpec(PageField.FARE, "금액 표 수수료 금액", "수수료 0", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 수수료 줄(detailRecordOf money) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""수수료\s+([\d,]+)"""), part = "fee"),
            /* 기사가 내는 산재보험료 — 실물 18 · 51 · 54 · 값이 «260원]» 노드로 갈려 온다 · 서버 원문 0 건 */
            FieldSpec(PageField.FARE, "금액 표 아래 산재보험료", "[산재보험료(차주부담액): 260원]", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 보험료 줄(detailRecordOf money) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""산재보험료[^:]*:\s*([\d,]+)\s*원"""), part = "insurance"),
            /* 뜻은 «(운송료+부가세) − 카드수납 수수료»이나 맞는 갈래가 없어 뜻 모름 줄 · 카드 콜에만(18) · 서버 원문 0 건 */
            FieldSpec(PageField.FARE, "금액 표 수납금액", "수납금액 65,144", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 뜻 모름 줄(detailRecordOf money) · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""수납금액\s+([\d,]+)"""), part = "unknown"),
            FieldSpec(PageField.PAYMENT, "결제방법", "카드", Seen.REAL, Handling.READ, "서버 제외어 찾는 칸(excludeScan) · 관제웹 결제 칸(서버 pageFieldOf) — «카드» · «착불» · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""결제방법\s+(?!\S*\s*:)(\S+)""")),
            /* «인수증»은 결제가 아니라 증빙(배차 사무실이 운반비를 입금해 주는 조건) — 결제 칸 payment 읽는 법은 그대로(제외어 찾는 칸) · 실물 51 · 53 · 54 · 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.BILLING, "결제방법 자리 «인수증»", "결제방법 인수증", Seen.REAL, Handling.READ, "서버 상세 자료 증빙(detailRecordOf billingType) — 판정 근거 서랍 · 원달앱은 이 칸을 안 읽는다",
                read = Regex("""결제방법\s+(인수증)""")),
            FieldSpec(PageField.COMMISSION, "수수료 줄", "수수료 = (운송료+부가세) x1.298%", Seen.REAL, Handling.UNUSED),
            /* 계산법 글자 통째 · 카드 콜에만(실물 18 · 앞 글자는 설명 영상 0104 ~ 0121) — 서버 원문 0 건이라 원문 기준으로는 모름 */
            FieldSpec(PageField.COMMISSION, "금액 표 위 수수료 계산법 줄", "[ 카드수납 수수료 = (운송료+부가세) x1.298% ]", Seen.REAL, Handling.READ, "서버 상세 자료 돈 묶음 수수료율 글자(detailRecordOf money.feeRateText) · 원달앱은 이 칸을 안 읽는다 — 조각 줄이라 서버 상세 자료 수수료(commissionRate)에는 안 담긴다",
                read = Regex("""(\[[^\]]*수수료\s*=[^\]]*\])"""), part = "feeRate"),
        ),
        Page.MY_LIST to listOf(
            FieldSpec(PageField.STAGE, "배차내역 줄 오른쪽 상태", "배차완료", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "배차내역 줄 상차", "경기 군포 당정동 공단로124번길 4 (크레텍)", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "배차내역 줄 하차", "경기 화성 신동 703", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.FARE, "배차내역 줄 요금", "250,000원", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.RESERVATION, "배차내역 줄 상차 · 하차 배지", "당상 · 당착", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.TAGS, "배차내역 줄 배지(미수금 — 수금 상태 · 지 — 뜻 모름)", "미수금 · 지 · 독차", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.PAYMENT, "배차내역 줄 결제", "인수증", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.VEHICLE_TYPE, "배차내역 줄 톤 · 차종", "5톤 · 윙바디", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "배차내역 줄 오른쪽 시각", "12-30 14:53", Seen.REAL, Handling.UNUSED),
        ),
        Page.MY_CALL to listOf(
            FieldSpec(PageField.STAGE, "배차신청 뒤 화면", "(실물 캡처 없음)", Seen.UNKNOWN, Handling.UNUSED),
            FieldSpec(PageField.PICKUP, "배차내역 상세 상차지", "경기 군포 당정동 공단로124번길 4 (크레텍)", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.DROPOFF, "배차내역 상세 하차지", "경기 화성 신동 703", Seen.REAL, Handling.UNUSED),
            /* 하차 정거장 거리(상차지 → 하차지) · 최단거리 — 직선으로 읽음 */
            FieldSpec(PageField.DELIVERY_DISTANCE, "배차내역 상세 하차지 끝", "34Km", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.RESERVATION, "배차내역 상세 상차지 · 하차지 배지 · 예약 배지", "당상 · 당착 · [예약]", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.TAGS, "배차내역 상세 배지(지 — 뜻 모름)", "지 · 독차", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.ORDER_NO, "배차내역 상세 화물번호", "3-4991-0836", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.MEMO, "배차내역 상세 화물정보", "당일상 당착 #연계#쿠팡 24시(군포-부천)새벽02시(부천-동탄)가는대로 하차", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.VEHICLE_TYPE, "배차내역 상세 톤 수 · 차종", "5톤 · 윙바디", Seen.REAL, Handling.UNUSED),
            FieldSpec(PageField.CLOCK, "배차내역 상세 배차시간", "배차시간: 12-30 14:53", Seen.REAL, Handling.UNUSED, "",
                part = "배차"),
            FieldSpec(PageField.CLOCK, "배차내역 상세 하차시간", "하차시간 2025-11-23 20:43분", Seen.REAL, Handling.UNUSED, "",
                part = "하차"),
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

    /** 📦 크기 낱말 → 라면박스 수(shared sizeWords) · null 은 박스 수 모름 */
    val sizeWords: Map<String, Int?> = emptyMap()

    /** 🏷️ 표시 글자 → 자리 · 뜻(shared badgeWords — 목록 · 상세 상차지 · 하차지 칸 앞 배지(«당상» · «수» · «지») · 화물 글(«독차» · «-A» · «예약») · 줄 배지(«왕복» · «N» · «인수증» · «선/착불») · 상세 «운행방법» 값 · 하차지 주소 끝 «왕복» — 근거는 03 표 · 화물24시 설명 영상) · 표에 없는 글자는 뜻 모름이 아니라 «표에 없음» */
    val badgeWords: List<BadgeWord> = listOf(
        BadgeWord("당상", BadgePlace.PICKUP, BadgeMeaning.PROMISE_DAY),
        BadgeWord("내상", BadgePlace.PICKUP, BadgeMeaning.PROMISE_DAY),
        BadgeWord("당착", BadgePlace.DROPOFF, BadgeMeaning.PROMISE_DAY),
        BadgeWord("내착", BadgePlace.DROPOFF, BadgeMeaning.PROMISE_DAY),
        BadgeWord("당/내", BadgePlace.DROPOFF, BadgeMeaning.UNKNOWN),
        BadgeWord("수", BadgePlace.PICKUP, BadgeMeaning.LOADING_METHOD),
        BadgeWord("수", BadgePlace.DROPOFF, BadgeMeaning.LOADING_METHOD),
        BadgeWord("지", BadgePlace.PICKUP, BadgeMeaning.LOADING_METHOD),
        BadgeWord("지", BadgePlace.DROPOFF, BadgeMeaning.LOADING_METHOD),
        BadgeWord("독차", BadgePlace.CARGO, BadgeMeaning.NO_MIXED_LOAD),
        BadgeWord("왕복", BadgePlace.ROW, BadgeMeaning.TRIP_TYPE, "왕복"),
        BadgeWord("편도", BadgePlace.ROW, BadgeMeaning.TRIP_TYPE, "편도"),
        BadgeWord("왕복", BadgePlace.DROPOFF, BadgeMeaning.TRIP_TYPE, "왕복"),
        BadgeWord("-A", BadgePlace.CARGO, BadgeMeaning.POSTED_BY),
        BadgeWord("-D", BadgePlace.CARGO, BadgeMeaning.POSTED_BY),
        BadgeWord("N", BadgePlace.ROW, BadgeMeaning.UNKNOWN),
        BadgeWord("인수증", BadgePlace.ROW, BadgeMeaning.BILLING),
        BadgeWord("선/착불", BadgePlace.ROW, BadgeMeaning.PAYMENT),
        BadgeWord("예약", BadgePlace.CARGO, BadgeMeaning.RESERVED),
    )

    /** 🚚 차종 글자가 없으면 수단 상관없음인가(shared vehicleAbsentMeansAny) · 없으면 false */
    val vehicleAbsentMeansAny: Boolean = false

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — 실시간 목록 머리(«화물정보» + «자동새로고침») · 잡기 전 상세(«화물상세정보» + «운송료») · 첫 화면(«전국24시콜화물» — 홈에서 바로 알아보기)) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
        listOf("화물정보", "자동새로고침"),
        listOf("화물상세정보", "운송료"),
        listOf("전국24시콜화물"),
    )

    /** ⚙️ 배차망 규칙(shared modes · packageKeywords · safeCancelSec · detailBackSec — 자동에서 원달앱이 배차신청을 누르고 안전취소 시간 안에 결재를 기다린다 · 상세 머묾 시간은 없다) · 시간은 값이 아니라 설정 칸 이름(FilterConfig.secOf) */
    val modes: Set<String> = setOf("AUTO", "MANUAL", "SIMULATION", "ALARM")
    val packageKeywords: List<String> = listOf("logione", "carrier")
    val safeCancelSecKey: String? = "safeCancelSecHwamul24"
    val detailBackSecKey: String? = null

    /** 🖥️ 페이지 전부 — 차례가 판별 차례 · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
        ScreenSpec(
            "배차신청 뒤 화물상세정보",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("화물상세정보", "배차취소하기")), ScreenMatch(all = listOf("화물상세정보", "전화걸기", "배차내역"))),
            false,
            listOf(
                OverlaySpec("배차신청 성공 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("배차신청에 성공"))), "배차신청이 됐다 — 위 «배차취소하기» 막대가 차는 동안만 앱에서 취소할 수 있다", Seen.REAL, listOf("ex_images/화물24시/54_화물상세정보_배차신청뒤.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/54_화물상세정보_배차신청뒤.png"),
            toCollect = "머리 «<»(뒤로) · «배차취소하기» · «전화걸기»를 누른 뒤 화면 · 막대가 다 차는 시간",
            landsAfterAccept = true,
            base = "myCall",
        ),
        ScreenSpec(
            "화물상세정보",
            StandardScreen.DETAIL_PRE_CONFIRM,
            listOf(ScreenMatch(all = listOf("화물상세정보", "배차신청"), none = listOf("배차취소하기", "전화걸기"))),
            false,
            listOf(
                OverlaySpec("배차 실패 오류", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("이미 배차", "배차할 수 없"))), "배차신청이 안 됐다 — 남이 먼저 잡았거나 조건 미달", Seen.UNKNOWN, listOf(), toCollect = "캡처", action = OverlayAction.ERROR),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/18_화물상세정보_배차신청.png", "ex_images/화물24시/51_화물상세정보.png", "ex_images/화물24시/53_화물상세정보_배차신청전.png"),
            base = "newCall",
            buttons = ScreenButtons(accept = "배차신청", filterOut = "돌아가기"),
        ),
        ScreenSpec(
            "배차내역 상세 · 화주정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "02 화주정보", "사업장주소"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/21_화물상세_화주정보_전화번호.png"),
            base = "myCall",
        ),
        ScreenSpec(
            "배차내역 상세 · 결제정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "03 결제정보", "수금상태"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/22_화물상세_결제정보.png"),
            base = "myCall",
        ),
        ScreenSpec(
            "배차내역 상세 · 화물정보 탭",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("배차내역", "02 화주정보", "배차시간"))),
            false,
            listOf(
                OverlaySpec("인수증 전송 확인", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("인수증을 전송하시겠습니까"))), "인수증 사진을 화주에게 보낼지 묻는다", Seen.REAL, listOf("ex_images/화물24시/24_화물정보탭_인수증전송팝업.png")),
                OverlaySpec("세금계산서 수정발행 창", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("계산서발행"), any = listOf("수정사유", "공급가액변동"))), "발행한 세금계산서를 고쳐 다시 발행한다", Seen.REAL, listOf("ex_images/화물24시/08_세금계산서_수정발행_팝업.png", "ex_images/화물24시/09_세금계산서_수정발행_입력.png")),
                OverlaySpec("계좌입력 확인", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("입금계좌에 계좌정보를 입력하시겠습니까"))), "세금계산서 창에서 입금계좌를 넣을지 묻는다", Seen.REAL, listOf("ex_images/화물24시/08_세금계산서_수정발행_팝업.png")),
                OverlaySpec("세금계산서 발행 창", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("계산서발행", "작성일자"), none = listOf("수정사유", "공급가액변동"))), "세금계산서를 처음 발행한다(공급자 · 공급받는자 입력)", Seen.REAL, listOf("ex_images/화물24시/12_세금계산서_발행폼.png", "ex_images/화물24시/23_세금계산서발행_입력창.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/04_배차상세_화물정보_상단.png", "ex_images/화물24시/05_배차상세_화물정보_하단.png", "ex_images/화물24시/06_배차상세_계산서발행.png", "ex_images/화물24시/10_배차상세_인수증.png", "ex_images/화물24시/13_배차상세_예약건.png", "ex_images/화물24시/24_화물정보탭_인수증전송팝업.png", "ex_images/화물24시/52_배차내역상세_화물정보탭.png"),
            base = "myCall",
        ),
        ScreenSpec(
            "화물배차정보요약",
            StandardScreen.DETAIL_CONFIRMED,
            listOf(ScreenMatch(all = listOf("화물배차정보요약"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/14_화물배차정보요약.png", "ex_images/화물24시/15_화물배차정보요약_메뉴.png (녹화 앱 메뉴가 겹침)"),
            base = "myCall",
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
            landsAfterAccept = true,
            base = "myList",
        ),
        ScreenSpec(
            "화물정보 검색조건",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("화물정보", "검색조건", "저장 후 검색"))),
            false,
            listOf(
                OverlaySpec("하차일 선택 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("하차일 선택"))), "검색조건의 하차일(전체 · 당착 · 내착 · 월착)을 고른다", Seen.REAL, listOf("ex_images/화물24시/41_검색조건_하차일선택.png")),
                OverlaySpec("내위치 반경 선택 시트", OverlayKind.POPUP, listOf(ScreenMatch(all = listOf("내위치 반경 선택"))), "검색조건의 내 위치 반경(5 ~ 30Km)을 고른다", Seen.REAL, listOf("ex_images/화물24시/42_검색조건_내위치반경선택.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/38_검색조건.png", "ex_images/화물24시/39_검색조건.png", "ex_images/화물24시/41_검색조건_하차일선택.png", "ex_images/화물24시/42_검색조건_내위치반경선택.png"),
        ),
        ScreenSpec(
            "화물정보(실시간 목록)",
            StandardScreen.LIST,
            listOf(ScreenMatch(all = listOf("화물정보", "자동새로고침", "자동터치"), none = listOf("저장 후 검색"))),
            false,
            listOf(
                OverlaySpec("자동터치 동의", OverlayKind.POPUP, listOf(ScreenMatch(any = listOf("자동터치 사용시", "동의하십니까"))), "자동터치를 켤 때 책임 동의를 묻는다", Seen.REAL, listOf("ex_images/화물24시/47_실시간목록_알림팝업.png"), action = OverlayAction.SKIP),
                OverlaySpec("저장완료 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("저장완료"))), "검색조건을 저장했다", Seen.REAL, listOf("ex_images/화물24시/43_실시간목록_토스트.png")),
                OverlaySpec("자동터치 시작 토스트", OverlayKind.TOAST, listOf(ScreenMatch(all = listOf("자동터치 시작"))), "배차망 자체 자동터치를 켰다", Seen.REAL, listOf("ex_images/화물24시/48_실시간목록_토스트.png")),
            ),
            Seen.REAL,
            listOf("ex_images/화물24시/17_화물정보_리스트.png", "ex_images/화물24시/32_오더목록_기본.png", "ex_images/화물24시/35_실시간목록.png", "ex_images/화물24시/36_화물정보_전체.png", "ex_images/화물24시/37_실시간목록.png", "ex_images/화물24시/40_실시간목록.png", "ex_images/화물24시/43_실시간목록_토스트.png", "ex_images/화물24시/44_실시간목록.png", "ex_images/화물24시/45_실시간목록_자동새로고침OFF.png", "ex_images/화물24시/46_실시간목록.png", "ex_images/화물24시/47_실시간목록_알림팝업.png", "ex_images/화물24시/48_실시간목록_토스트.png", "ex_images/화물24시/49_실시간목록.png", "ex_images/화물24시/50_실시간목록.png"),
            base = "newList",
        ),
        ScreenSpec(
            "홈 «전국24시콜화물»",
            StandardScreen.HOME,
            listOf(ScreenMatch(all = listOf("전국24시콜화물"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/01_메인_홈화면.png", "ex_images/화물24시/28_홈.png", "ex_images/화물24시/33_홈.png"),
            base = "home",
        ),
        ScreenSpec(
            "가상계좌 정보",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("가상계좌 정보", "출금가능금액"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/34_가상계좌정보.png"),
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
            listOf("ex_images/화물24시/07_인수증_목록.png", "ex_images/화물24시/25_인수증보관.png", "ex_images/화물24시/27_인수증_보관함.png"),
        ),
        ScreenSpec(
            "세금계산서 발행내역 상세",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("전자세금계산서 정보", "국세청승인"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/30_세금계산서_발행내역상세.png"),
        ),
        ScreenSpec(
            "세금계산서 발행내역 목록",
            StandardScreen.NETWORK_MENU,
            listOf(ScreenMatch(all = listOf("세금계산서 발행내역", "승인번호"), none = listOf("국세청승인"))),
            false,
            emptyList(),
            Seen.REAL,
            listOf("ex_images/화물24시/29_세금계산서_발행내역목록.png", "ex_images/화물24시/31_세금계산서_발행내역목록2.png"),
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

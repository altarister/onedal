import type { TargetAppType } from './index';
import type { PageField, ScreenPage } from './pageFields';

/**
 * 📄 **배차망 화면 정의 — 한 곳** (reviews/34 · 기사님 «플러그인스에 있는 값을 서버가 같이 써야»).
 * 배차망(인성 · 화물24시 · 카카오 픽커)마다 «어느 화면 · 어느 칸이 · 어디에 · 어떤 글자로 오고 · 읽나 안 읽나 · 어떻게 읽나»를 여기 한 장에만 적는다.
 * 🔴 **원천이다 — 여기를 고친다.** 원달앱 `plugins/…/…Pages.kt` 셋은 `cd onedal-web && pnpm gen:pages` 가 이 표에서 뽑은 생성 파일이고,
 *    원달앱 `NetworkPagesPairTest` 가 둘이 같은지 문다. 서버는 이 상수를 바로 읽는다(reviews/34 3단계).
 * 칸 이름은 `pageFields` 의 낱말(SCREEN_PAGES · PAGE_FIELDS)이다. `read` 는 정규식 원문 글자 — JS 와 코틀린이 같은 뜻으로 읽는 문법만 쓴다(1번 묶음이 값 · 노드 글을 한 칸 띄어 이은 줄에 댄다).
 * 몸통은 JSON 표시 주석 둘(별표 주석 «JSON») 사이의 엄격한 JSON 이다 — 뽑는 스크립트(mjs)와 원달앱 검사가 그 사이를 그대로 읽는다. 표시를 지우지 않는다.
 */
export interface NetworkFieldSpec {
    field: PageField;
    /** 화면 어디 */
    where: string;
    /** 실제로 본 글자 견본 */
    sample: string;
    /** 본 곳 — 실물 · 시뮬레이터 · 모름 */
    seen: 'REAL' | 'SIM' | 'UNKNOWN';
    /** 읽나 — 읽음 · 읽고 버림 · 안 읽음 */
    handling: 'READ' | 'DROPPED' | 'UNUSED';
    /** 읽는 곳(코드 자리) */
    usedAt?: string;
    /** 읽는 법 — 정규식 원문(1번 묶음이 값) · 없으면 공통 길이 이 칸을 읽지 않는다 */
    read?: string;
    /** 한 줄 덧말(생성 파일에 주석으로 실린다) */
    note?: string;
}
export interface NetworkPageSpec {
    /** 그 배차망 정의의 머리 글(생성 파일 머리에 실린다) */
    about: string[];
    pages: Record<ScreenPage, NetworkFieldSpec[]>;
    /**
     * 🚫 **콜 한 벌의 글** — 상세 원문에서 화면 머리 · 버튼 · 목록 잔상을 빼고 콜 부분만 꺼내는 정규식 원문(1번 묶음).
     * 서버 제외어 검사가 이 범위에서만 찾는다(`pageRead.callTextOf` · reviews/34 3단계 5③). 못 맞으면 빈 글 — 지어내지 않는다.
     * 원달앱은 읽지 않는다(원달앱 제외어는 목록 카드 글에서만 찾는다) · gen:pages 는 이 칸을 뽑지 않는다.
     */
    callText: string;
    /** 그 범위로 잡은 까닭 한 줄 */
    callTextWhy: string;
}

export const NETWORK_PAGES: Record<TargetAppType, NetworkPageSpec> = /*JSON*/{
  "insung": {
    "about": ["📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/인성 · 시뮬 onedal-sim).", "⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다."],
    "callText": "([\\s\\S]*)",
    "callTextWhy": "상세 원문은 팝업까지 모은 글이라 머리 · 버튼 글이 없다 — 통째(«구분 : 왕복»도 본다)",
    "pages": {
      "list": [
        {"field": "pickup", "where": "출발지 칸", "sample": "@초이동 · @남양주(오남", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "dropoff", "where": "도착지 칸", "sample": "이태원동 · 김포(대곶면", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "reservation", "where": "출발지 칸 앞글자", "sample": "낼7시/ · 낼6시30/ · 21시/ · 오후7시30/ · 10일/", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.reservationOf"},
        {"field": "clock", "where": "도착지 칸 앞글자 (도착 약속)", "sample": "낼8/ · 8시/ · 낼10시/", "seen": "REAL", "handling": "DROPPED", "usedAt": "InsungParser.parse — 출발지 쪽이 있으면 버림"},
        {"field": "vehicleType", "where": "차종 칸", "sample": "1t · 다 · 라 · 1t화물", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
        {"field": "fare", "where": "요금 칸 (만 원)", "sample": "40.0 · 270.0", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
        {"field": "pickupDistance", "where": "거리 칸 윗줄", "sample": "17.8", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "deliveryDistance", "where": "거리 칸 아랫줄", "sample": "0.0 · 341.3", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"}
      ],
      "detail": [
        {"field": "stage", "where": "상태 줄", "sample": "상태 : 배송", "seen": "REAL", "handling": "UNUSED"},
        {"field": "itemSize", "where": "물품 줄", "sample": "물품 :", "seen": "REAL", "handling": "UNUSED"},
        {"field": "vehicleType", "where": "차량 줄", "sample": "차량 : 트럭-1t · 다마스", "seen": "REAL", "handling": "READ", "usedAt": "서버 detail.ts pageFieldOf — 원달앱 값 · 목록 차종이 없을 때만(원달앱은 아직 이 칸을 안 읽는다)", "read": "차량\\s*:\\s*(?!\\S*\\s*:)([^\\s(]+)", "note": "🚚 빈 «차량 :» 뒤의 다음 이름표(«탁송료 :»)를 차종으로 잡지 않는다 — 값 토막 뒤가 바로 «:» 이면 이름표다"},
        {"field": "fare", "where": "요금 줄", "sample": "요금 : 85,000(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "목록 값 · 목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])"},
        {"field": "payment", "where": "요금 줄 괄호", "sample": "(신용)(계산서)", "seen": "REAL", "handling": "UNUSED"},
        {"field": "commission", "where": "수수료 줄", "sample": "수수료 : 23%", "seen": "REAL", "handling": "UNUSED"},
        {"field": "tags", "where": "구분 줄", "sample": "구분 : 편도", "seen": "REAL", "handling": "UNUSED"},
        {"field": "reservation", "where": "형태 줄", "sample": "형태 : 보통 (실물에서 «예약»은 못 봄)", "seen": "UNKNOWN", "handling": "UNUSED"},
        {"field": "memo", "where": "적요 칸 · 적요 상세 팝업", "sample": "1시상차 6박스 카트가지고 고객님앞 갖다주세요", "seen": "REAL", "handling": "UNUSED", "usedAt": "서버가 원문으로 받는다"},
        {"field": "pickupDistance", "where": "적요 칸 둘째 줄", "sample": "현위치 → 상차지(직선)23.5KM", "seen": "REAL", "handling": "UNUSED"},
        {"field": "deliveryDistance", "where": "적요 칸 셋째 줄", "sample": "상차지 → 하차지(직선)35.9KM", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "출발지 상세 팝업 «위치»", "sample": "경기 용인시 처인구 양지면 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress"},
        {"field": "dropoff", "where": "도착지 상세 팝업 «위치»", "sample": "서울 강남구 역삼동 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress"},
        {"field": "clock", "where": "출발지 줄 가운데", "sample": "김유정 / 20시/양지면(용인", "seen": "REAL", "handling": "UNUSED"},
        {"field": "contact", "where": "위치 팝업", "sample": "고객 · 부서 · 담당 · 전화1 · 전화2", "seen": "SIM", "handling": "UNUSED", "usedAt": "서버가 원문으로 받는다"}
      ],
      "confirm": [
        {"field": "pickup", "where": "출발지 줄", "sample": "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
        {"field": "dropoff", "where": "도착지 줄", "sample": "서울강남구 / 역삼동 / 이희억", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
        {"field": "fare", "where": "요금 줄", "sample": "요금 : 40,000(신용)", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen — PageFieldRead", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])"},
        {"field": "contact", "where": "머리 줄", "sample": "(주)신한로직스-1588-5480", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "적요 칸", "sample": "1시상차 6박스 …", "seen": "REAL", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "stage", "where": "완료 탭 줄 배지", "sample": "완료", "seen": "SIM", "handling": "UNUSED"},
        {"field": "contact", "where": "완료 탭 줄", "sample": "회사 이름", "seen": "SIM", "handling": "UNUSED"},
        {"field": "clock", "where": "완료 탭 줄", "sample": "상차 시각 · 하차 시각", "seen": "SIM", "handling": "UNUSED"}
      ]
    }
  },
  "hwamul24": {
    "about": ["📄 **화물24시 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/화물24시).", "⚠️ 실물 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처가 근거다. 시뮬 상세 화면은 실물과 모양이 달라(머리 «배차내역») 상세까지 못 간다."],
    "callText": "(상차지[\\s\\S]*?)(?=배차신청|$)",
    "callTextWhy": "«상차지»부터 «배차신청» 앞까지 — 화주 이름 줄(«화물과퀵»)·«60분 안보기» 버튼·잔액 머리와 아래 버튼을 뺀다(실물 캡처 18 · 시뮬은 «60분 안보기»가 없어 «상차지»로 잡는다)",
    "pages": {
      "list": [
        {"field": "pickup", "where": "왼쪽 윗줄", "sample": "경기 시흥 정왕동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "dropoff", "where": "오른쪽 윗줄", "sample": "경기 안산 상록구 장상동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "fare", "where": "오른쪽 아랫줄", "sample": "50,000원", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.fareOf"},
        {"field": "vehicleType", "where": "셋째 줄 앞", "sample": "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "pickupDistance", "where": "상차 배지 옆", "sample": "15Km", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.pickupDistanceOf"},
        {"field": "reservation", "where": "상차 배지", "sample": "당상 · 내상(실물 캡처에는 없음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.reservationOf"},
        {"field": "tags", "where": "하차 배지 · 꼬리표", "sample": "당착 · 내착 (읽음) · 수 · 지 · 독차 · 인수증 (잡음으로 뺌)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.badgesOf"},
        {"field": "memo", "where": "셋째 줄 화물 글", "sample": "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24MemoTimes.split — 상차 쪽만 예약으로"},
        {"field": "clock", "where": "하차 배지 앞 시각", "sample": "06:32 (등록 시각인지 모름)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse — postTime"}
      ],
      "detail": [
        {"field": "orderNo", "where": "머리", "sample": "화물번호:3-9483-2159", "seen": "REAL", "handling": "UNUSED"},
        {"field": "clock", "where": "머리", "sample": "등록시간:05:18분", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "상차지 칸", "sample": "경기 군포 부곡동 [당상][수] 5Km", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
        {"field": "dropoff", "where": "하차지 칸", "sample": "서울 중구 을지로6가 [당착][수]", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
        {"field": "deliveryDistance", "where": "하차지 칸 오른쪽", "sample": "36Km", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "화물정보 칸", "sample": "지금상 당착 59박스 수/수-A [독차]", "seen": "REAL", "handling": "UNUSED"},
        {"field": "vehicleType", "where": "톤수 · 차종 · 적재중량", "sample": "1톤 · 전체 · 1톤", "seen": "REAL", "handling": "UNUSED"},
        {"field": "tags", "where": "운행방법", "sample": "편도", "seen": "REAL", "handling": "UNUSED"},
        {"field": "fare", "where": "운송료 · 부가세 · 수납금액", "sample": "60,000 · 6,000 · 65,144", "seen": "REAL", "handling": "READ", "usedAt": "목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "운송료\\s*:?\\s*([\\d,]+)", "note": "💰 목록 요금과 같은 «운송료»만 — 실물은 «운송료» · «60,000» 이 다른 노드, 시뮬은 «60,000원» (부가세 · 수납금액은 안 읽음)"},
        {"field": "payment", "where": "결제방법", "sample": "카드", "seen": "REAL", "handling": "UNUSED"},
        {"field": "commission", "where": "수수료 줄", "sample": "수수료 = (운송료+부가세) x1.298%", "seen": "REAL", "handling": "UNUSED"}
      ],
      "confirm": [
        {"field": "stage", "where": "배차신청 뒤 화면", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "dropoff", "where": "배차내역 상세 하차지", "sample": "서울 강서 외발산동 [당착] 92Km", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "배차내역 상세 화물정보", "sample": "예약 당일오후1시상 당착 다발무상.하차해줌", "seen": "REAL", "handling": "UNUSED"},
        {"field": "reservation", "where": "배차내역 상세 배지", "sample": "[예약]", "seen": "REAL", "handling": "UNUSED"},
        {"field": "clock", "where": "하차시간", "sample": "2025-11-23 20:43분", "seen": "REAL", "handling": "UNUSED"}
      ]
    }
  },
  "kakaopicker": {
    "about": ["📄 **카카오 픽커 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/카카오픽커/실물_2026 · 실물 로그).", "칸 이름은 세 배차망 공통(`PageField`) — 여기에는 «어디서 · 어떤 글자로»만 적는다.", "안 읽는·버리는 칸(UNUSED·DROPPED)이 다음에 읽을 재료다."],
    "callText": "[\\s\\S]*(픽업지[\\s\\S]*?)(?=넘기기|수락하기|$)",
    "callTextWhy": "마지막 «픽업지»부터 «넘기기»/«수락하기» 앞까지 — 앞은 목록 잔상, 뒤는 버튼(서버 옛 callTextOf 와 같은 답)",
    "pages": {
      "list": [
        {"field": "fare", "where": "목록 줄 오른쪽", "sample": "16,093", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "pickupDistance", "where": "몸통 줄 맨 앞", "sample": "4.7km", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "itemSize", "where": "꼬리표 줄", "sample": "중형", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "tags", "where": "꼬리표 줄", "sample": "퀵 반나절 승", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "reservation", "where": "꼬리표 줄 «예약» 뒤", "sample": "예약 내일 · 예약 18:30 · 예약 9/30(수) · 예약", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.listReservation"},
        {"field": "remaining", "where": "꼬리표 줄", "sample": "준비 29분 · 31분 내", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse (꼬리표)"},
        {"field": "pickup", "where": "몸통 줄 — 시·구 줄임 + 동", "sample": "광주 경안", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "dropoff", "where": "꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동", "sample": "용산 한남", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"}
      ],
      "detail": [
        {"field": "tags", "where": "사진 위쪽 꼬리표 줄", "sample": "퀵 반나절 예약", "seen": "REAL", "handling": "UNUSED"},
        {"field": "reservation", "where": "사진 띠", "sample": "내일 14:00 픽업예약", "seen": "REAL", "handling": "READ", "usedAt": "PickerDetailOcrParser.detailReservation"},
        {"field": "pickup", "where": "사진 첫 정거장 — 행정동 + 건물", "sample": "경기 광주시 경안동 / 람미당", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
        {"field": "dropoff", "where": "사진 둘째 정거장", "sample": "서울 용산구 한남동 / 아라마크", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
        {"field": "pickupDistance", "where": "사진 정거장 오른쪽", "sample": "픽업 4.7km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
        {"field": "deliveryDistance", "where": "사진 정거장 오른쪽", "sample": "배송 26.4km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
        {"field": "clock", "where": "사진 정거장 시각", "sample": "내일 17:49 · 12:39까지", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — 하차 at 읽고 안 씀"},
        {"field": "itemSize", "where": "사진 물품 정보", "sample": "중형 세 변의 합 140cm · 20kg 이하", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
        {"field": "memo", "where": "사진 유의사항", "sample": "바로 배송가주실 분만 잡아주세요", "seen": "REAL", "handling": "UNUSED"},
        {"field": "fare", "where": "상세 아래 최종 수익", "sample": "최종 수익 2,387", "seen": "REAL", "handling": "UNUSED"}
      ],
      "confirm": [
        {"field": "stage", "where": "픽업 시트 머리", "sample": "지금 바로 출발해 주세요 · 픽업이 지연되고 있어요", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
        {"field": "remaining", "where": "시트 머리", "sample": "준비 13분 · 배송 33분", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "시트 픽업지", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
        {"field": "dropoff", "where": "시트 배송지", "sample": "쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "stage", "where": "내 오더 줄 머리", "sample": "픽업 준비 14분 남음", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
        {"field": "remaining", "where": "내 오더 줄 머리", "sample": "14분 남음", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "픽업 배지 옆", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
        {"field": "dropoff", "where": "배송지 줄", "sample": "배송지: 쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"},
        {"field": "tags", "where": "오른쪽 배지", "sample": "도보", "seen": "REAL", "handling": "UNUSED"}
      ]
    }
  }
}/*JSON*/ as Record<TargetAppType, NetworkPageSpec>;

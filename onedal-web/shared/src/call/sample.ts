

export const OFFICE_ORDER_SAMPLE = {
    // ── 목록 칸 (SimplifiedOfficeOrder) ──
    id: "콜 번호",
    type: "NEW_ORDER",                    // 기본 콜에 없음 — 보고 봉투의 갈래
    pickup: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",      // 상세 주소, 없으면 목록 동
    dropoff: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
    fare: 50000,                          // 목록 금액, 없으면 기사님 몫
    timestamp: "보고 시각",               // 기본 콜에 없음 — 보고 봉투의 시각
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    vehicleType: "다마스",
    rawText: "원문",                      // 기본 콜에 없음 — 보고 봉투의 원문
    pickupX: 127.312587,                  // 기본 콜에 없음 — 서버가 지오코딩으로 붙인다
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,
    pickupDistance: 101,
    deliveryDistance: 201,
    isSimulated: false,                   // 기본 콜에 없음 — 서버가 붙인다
    reserved: false,
    reservedDay: 0,
    reservedAt: "10:01",
    itemSize: "크기",
    tagsText: "꼬리표",
    verdict: "판정 축",                   // 기본 콜에 없음 — 원달앱 판정이 붙인다

    // ── 상세 칸 (DetailedOfficeOrder) ──
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    receiptStatus: "진행 글자",
    itemDescription: "물품",
    commissionRate: "수수료 비율",
    tollFare: "70001",                    // 옛 칸은 글자
    paymentType: "신용",
    billingType: "계산서",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점", requestedTime: "", memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점", requestedTime: "", memo: "하차 메모",
    }],
    companyName: "의뢰인",

    // ── 배차망 칸 (OfficeOrder) ──
    targetApp: "배차망",
    capturedVia: "수집 길",               // 기본 콜에 없음 — 서버가 붙인다
    capturedMode: "수집 모드",
    openedBy: "APP",
};

/*
 * 📚 아래는 위 `OFFICE_ORDER_SAMPLE`(지금 콜 모양)에서 한 묶음씩 바꿔 가는 견본 차례다 — 아무 코드도 읽지 않는다.
 *   `_02` 정거장 약속 → `_03` 돈(+ 배차망별 돈 예 `MONEY_EXAMPLE_*`) → `_04` 번호 → `_05` 출처 → `_06` 목록 글자 · 거리 · 표시 글자 →
 *   `_07` 정거장 정리 → `_08` 짐 → `_09` 정거장 묶음 · 돈 줄만 · 판정 축 자리 — **`_09` 가 마지막 모양**이다.
 *   `_04` 부터는 견본마다 바로 아래에 배차망 넷(인성 · 화물24시 · 카카오 픽커 · 인성플렉스)의 실물 화면 예(`*_EXAMPLE_*`)가 붙는다.
 */

/**
 * 🔍 **옛 콜 견본 — 바꿀 목록 1번(정거장 약속)을 적용한 모양** (`설계/바꿀목록_02.md` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE` 과 다른 것만:
 * - 뺌: `reserved` · `reservedDay` · `reservedAt` · `pickupTime` — 상차 약속은 `pickupDetails[0]` 의 날 · 시각 하나로
 * - 더함: 정거장마다 `requestedDay`(0 오늘 · 1 내일 · null 약속 없음) — 상차 · 하차가 같은 모양(«오늘 상차 · 내일 하차»도 담긴다)
 * - 남김: `scheduleText` — 화면 원문
 */
const OFFICE_ORDER_SAMPLE_02 = {
    // ── 목록 칸 (SimplifiedOfficeOrder) ──
    id: "콜 번호",
    type: "NEW_ORDER",
    pickup: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
    dropoff: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
    fare: 50000,
    timestamp: "보고 시각",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    vehicleType: "다마스",
    rawText: "원문",
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,
    pickupDistance: 101,
    deliveryDistance: 201,
    isSimulated: false,
    // reserved: false,                   // 삭제 — 정거장에 날이나 시각이 있으면 예약
    // reservedDay: 0,                    // 삭제 → pickupDetails[0].requestedDay
    // reservedAt: "10:01",               // 삭제 → pickupDetails[0].requestedTime
    itemSize: "크기",
    tagsText: "꼬리표",
    verdict: "판정 축",

    // ── 상세 칸 (DetailedOfficeOrder) ──
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    receiptStatus: "진행 글자",
    itemDescription: "물품",
    commissionRate: "수수료 비율",
    tollFare: "70001",
    paymentType: "신용",
    billingType: "계산서",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        requestedDay: 0, requestedTime: "10:01",          // ← reservedDay · reservedAt · pickupTime 자리
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        requestedDay: 0, requestedTime: "13:01",          // ← 하차 약속 — 날이 새로 생김
        memo: "하차 메모",
    }],
    companyName: "의뢰인",
    // pickupTime: "10:01",               // 삭제 → pickupDetails[0].requestedTime

    // ── 배차망 칸 (OfficeOrder) ──
    targetApp: "배차망",
    capturedVia: "수집 길",
    capturedMode: "수집 모드",
    openedBy: "APP",
};

/**
 * 🔍 **옛 콜 견본 — 돈을 한 묶음(`money`)으로 모은 모양** (`설계/shared/돈_정의_계획_04.md` · 아직 코드에 없음 · 아무 곳도 읽지 않는다)
 *
 * 위 `OFFICE_ORDER_SAMPLE_02` 와 다른 것만:
 * - 뺌: `fare` · `commissionRate` · `tollFare` · `paymentType` · `billingType` — 돈 칸 다섯이 `money` 한 칸 안으로 들어간다
 * - 더함: `money` — 기사님 몫 · 받을 돈은 이름 붙은 칸, 화면에 보인 돈 줄은 글자 그대로 `lines` 에
 * - 돈 줄 갈래(`kind`): income 기사님 몫 · total 합계 · fee 수수료 · collect 받을 돈 · consign 탁송료 · vat 부가세 ·
 *   insurance 보험료 · deliveryFee 배송비 · promo 프로모션 · unknown 뜻 모름
 * - 규칙: 화면이 보여 준 것만 담는다 — 없는 돈을 계산해 채우지 않는다
 */
const OFFICE_ORDER_SAMPLE_03 = {
    // ── 목록 칸 (SimplifiedOfficeOrder) ──
    id: "콜 번호",
    type: "NEW_ORDER",
    pickup: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
    dropoff: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
    // fare: 50000,                       // 삭제 → money.income (배차망마다 뜻이 달랐던 숫자 하나 — 이제 «기사님 몫»만)
    timestamp: "보고 시각",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    vehicleType: "다마스",
    rawText: "원문",
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,
    pickupDistance: 101,
    deliveryDistance: 201,
    isSimulated: false,
    itemSize: "크기",
    tagsText: "꼬리표",
    verdict: "판정 축",

    // ── 상세 칸 (DetailedOfficeOrder) ──
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    receiptStatus: "진행 글자",
    itemDescription: "물품",
    // commissionRate: "수수료 비율",     // 삭제 → money.feeRateText (화면 글자 그대로 «23%»)
    // tollFare: "70001",                 // 삭제 → money.lines 의 consign 줄 (글자였던 금액이 숫자로)
    // paymentType: "신용",               // 삭제 → money.paymentType
    // billingType: "계산서",             // 삭제 → money.billingType
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        requestedDay: 0, requestedTime: "10:01",
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        requestedDay: 0, requestedTime: "13:01",
        memo: "하차 메모",
    }],
    companyName: "의뢰인",

    // ── 돈 (새 칸 — 위에서 뺀 다섯이 여기로) ──
    money: {
        income: 50000,                    // 기사님 몫 — 판정 · 요금 거르기 · 화면 금액이 읽는다 · 화면에 없으면 null
        collect: null,                    // 받을 돈 — 착불 현장 현금 · 착불 안내 · 하차 칸 · 미수금이 읽는다 · 이 콜은 착불 아님
        lines: [                          // 화면에 보인 돈 줄 전부 — shown 은 화면 글자 그대로
            { kind: "income", won: 50000, shown: "기사님 몫 글자" },
            { kind: "consign", won: 70001, shown: "탁송료 글자" },
        ],
        feeRateText: "수수료 비율",       // 화면의 수수료율 글자(인성 «23%») — 기사님 설정의 수수료(agencyFeePercent)와 다른 값
        paymentType: "신용",              // 결제 — 신용 · 선불 · 착불 · 카드 · 현금 · 선/착불(화물24시 화면 글자 그대로)
        billingType: "계산서",            // 증빙 — 계산서 · 인수증 · 무과세
    },

    // ── 배차망 칸 (OfficeOrder) ──
    targetApp: "배차망",
    capturedVia: "수집 길",
    capturedMode: "수집 모드",
    openedBy: "APP",
};

/**
 * 🔍 돈 묶음 예 둘 — 실물 화면 글자로 `money` 를 채워 본 것 (위 `_03` 의 `money` 자리에 들어갈 값)
 *
 * 인성 착불 — ex_images/인성/이미지글자_인성.md 영상_1743(확정 뒤 상세): «실운임 : 34,650(착불)» · «고객에게 받을 금액 45,000» · «탁송료 0»
 * - 지금: `fare` 하나에 착불이면 «고객에게 받을 금액» 45,000 이 들어가 기사님 몫보다 크게 보이고,
 *   관제웹 착불 안내 · 미수금은 거꾸로 `fare`(기사님 몫)를 받을 현금으로 쓴다
 * - 묶음: 기사님 몫 34,650 과 받을 돈 45,000 이 따로 산다 · 이 화면의 수수료 줄은 기록이 없어 feeRateText 를 비운다
 */
const MONEY_EXAMPLE_INSUNG_COD = {
    income: 34650,
    collect: 45000,
    lines: [
        { kind: "income", won: 34650, shown: "실운임 : 34,650(착불)" },
        { kind: "collect", won: 45000, shown: "고객에게 받을 금액 45,000" },
        { kind: "consign", won: 0, shown: "탁송료 0" },
    ],
    feeRateText: null,
    paymentType: "착불",
    billingType: null,
};

/**
 * 화물24시 인수증 — ex_images/화물24시/이미지글자_화물24시.md 51_화물상세정보(확정 전 상세):
 * «운송료 140,000» · «수수료 0» · «결제방법 인수증» · «합계금액 140,000» · «[산재보험료(차주부담액): 610원]»
 * - 뜻(설명 영상 화물24시설명서/요소뜻_화물24시.md): «인수증» = 배차 사무실이 운반비를 입금해 주는 조건 · 산재보험료(차주부담액) = 기사님이 내는 보험료로 받는 돈에서 빠진다
 * - 지금: `fare` 는 목록 줄이 있으면 목록 금액(합계), 없으면 운송료 · «인수증»은 결제 값 목록에 없어 버려진다 · 수수료 · 합계 · 보험료는 칸이 없다
 * - 묶음: 판정 화면 금액은 기사님 몫(운송료 140,000) · 수수료 · 합계 · 보험료는 줄로 남고, «인수증»은 증빙 칸에 들어간다
 *   (실제 손에 들어오는 돈 140,000 − 610 은 화면에 없는 값이라 계산해 담지 않는다)
 */
const MONEY_EXAMPLE_HWAMUL24_RECEIPT = {
    income: 140000,
    collect: null,
    lines: [
        { kind: "income", won: 140000, shown: "운송료 140,000" },
        { kind: "fee", won: 0, shown: "수수료 0" },
        { kind: "total", won: 140000, shown: "합계금액 140,000" },
        { kind: "insurance", won: 610, shown: "[산재보험료(차주부담액): 610원]" },
    ],
    feeRateText: null,
    paymentType: null,
    billingType: "인수증",
};

/**
 * 화물24시 카드 결제 (설명 영상) — ex_images/화물24시/화물24시설명서/영상_0121.txt(확정 전 상세 · 경기 군포 부곡동 → 서울 중구 을지로6가):
 * «[ 카드수납 수수료 = (운송료+부가세) x1.298% ]» · «운송료 60,000» · «부가세 6,000» · «수납금액 65,144» · «[산재보험…(가려짐): 260원]»
 * 결제방법 칸은 «…(가려짐)드» — 자막 «카드 수수료»로 «카드»로 읽었다(풀이) · 같은 콜 목록 줄에는 «인수증 · 60,000원»
 * - 뜻(설명 영상 · 요소뜻_화물24시.md): 운송료 60,000 + 부가세 6,000 = 66,000 → 카드수납 수수료(66,000 × 1.298% ≈ 856)를 뺀 65,144 가 수납금액 →
 *   산재보험료 260 을 뺀 64,884 를 실제로 받는다(이 64,884 는 영상이 덧씌운 글자 — 앱 화면에 없다) · 부가세 6,000 은 다음 부가세 신고 때 낸다
 * - «인수증»(목록)과 «카드»(상세 결제방법)가 한 콜에 같이 있다 — 인수증은 증빙 · 지급 조건, 카드는 결제 방법이라 칸이 다르다
 * - 지금: `fare` 는 목록 60,000(운송료) · 부가세 · 카드 수수료 · 수납금액 · 보험료는 칸이 없다 · `commissionRate` 에는 수수료 계산법 글자가 안 들어간다
 * - 묶음: 판정 화면 금액은 기사님 몫(운송료 60,000) · 부가세 · 수납금액 · 보험료는 줄로 · 수수료 계산법은 화면 글자 그대로 feeRateText 에
 *   수납금액은 «부가세를 더하고 카드 수수료를 뺀, 사무실에서 들어오는 돈»이라 뜻은 알지만 갈래 목록에 맞는 이름이 없어 unknown 으로 둔다
 *   (카드 수수료 856 은 화면에 금액이 없고 계산법 글자만 있어 줄로 안 담는다)
 */
const MONEY_EXAMPLE_HWAMUL24_CARD = {
    income: 60000,
    collect: null,
    lines: [
        { kind: "income", won: 60000, shown: "운송료 60,000" },
        { kind: "vat", won: 6000, shown: "부가세 6,000" },
        { kind: "unknown", won: 65144, shown: "수납금액 65,144" },
        { kind: "insurance", won: 260, shown: "[산재보험…(가려짐): 260원]" },
    ],
    feeRateText: "[ 카드수납 수수료 = (운송료+부가세) x1.298% ]",
    paymentType: "카드",
    billingType: "인수증",
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커_필수화면_02.md 실물_2026/07_상세_최종수익분해(확정 전 상세 · 수익 상자):
 * 칸 «최종 수익» 금액 «5,600 P» · 그 아래 «배송비 5,500P» · «프로모션 100P»
 * - 지금: `fare` 에 최종 수익 5,600 이 들어간다(원달앱 사진 판독) · 배송비 · 프로모션은 칸이 없어 버려진다 · 서버는 상세에서 이 금액을 못 읽는다
 * - 묶음: 최종 수익이 기사님 몫, 배송비 · 프로모션은 그 몫을 나눈 줄로 남는다(5,500 + 100 = 5,600) · P 는 1P = 1원
 * - 이 사진에는 결제 표시가 없어 paymentType 을 비운다(목록 줄의 «착불»은 다른 콜)
 */
const MONEY_EXAMPLE_KAKAOPICKER = {
    income: 5600,
    collect: null,
    lines: [
        { kind: "income", won: 5600, shown: "5,600 P" },          // 칸 이름 «최종 수익»
        { kind: "deliveryFee", won: 5500, shown: "배송비 5,500P" },
        { kind: "promo", won: 100, shown: "프로모션 100P" },
    ],
    feeRateText: null,
    paymentType: null,
    billingType: null,
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스_필수화면_02.md 10_상세_3(확정 전 상세):
 * 칸 «총 수입» 금액 «21,252원»(앞의 «₩»는 그림 — 접근성 글자에 없다) · 단추 «21,252원 수행하기»
 * - 지금: `fare` 에 21,252 가 들어간다 — 목록 수입과 같은 돈
 * - 묶음: 기사님 몫 한 줄 · 단추 금액은 같은 값이라 줄로 안 담는다
 * - 이 사진에는 결제 줄이 없어 paymentType 을 비운다(«착불»은 08_상세 — 다른 사진)
 */
const MONEY_EXAMPLE_ISFLEX = {
    income: 21252,
    collect: null,
    lines: [
        { kind: "income", won: 21252, shown: "21,252원" },        // 칸 이름 «총 수입»
    ],
    feeRateText: null,
    paymentType: null,
    billingType: null,
};

/**
 * 인성플렉스 현금 콜 (안내 영상 · 그림 — 실물 아님) — 같은 표 영상_4확정_픽업완료 · img_guide3_3(확정 뒤 상세):
 * «받으실 현금» «123,000원» · «도착지에서 현금을 꼭 받으세요!» · «탁송 금액» «25,000원»
 * - 지금: 받을 현금 123,000 을 담을 칸이 없다 · 탁송 금액은 뜻을 모른다
 * - 묶음: 받을 돈 123,000 · 탁송 금액은 «뜻 모름» 줄로 글자 그대로 · 이 화면에는 기사님 몫 줄이 없어 income 을 비운다
 *   (총 수익 «₩ 123,000원»은 영상_6 — 다른 화면이라 섞지 않는다)
 */
const MONEY_EXAMPLE_ISFLEX_CASH = {
    income: null,
    collect: 123000,
    lines: [
        { kind: "collect", won: 123000, shown: "받으실 현금 123,000원" },
        { kind: "unknown", won: 25000, shown: "탁송 금액 25,000원" },
    ],
    feeRateText: null,
    paymentType: null,
    billingType: null,
};

/**
 * 🔍 **새 콜 견본 — 번호 묶음(CallIdentity)을 모은 모양** (`설계/shared/번호출처_정의_계획_03.md` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_03` 과 다른 것만:
 * - 모음: «이 콜이 무엇인가»를 맨 위 한 묶음으로 — 콜 번호 · 배차망 · 오더 번호 · 공유콜 · 배차사 · 의뢰인 · 진행 글자
 * - 더함: `orderNo`(배차망 오더 번호 — 상세에 보이는 곳은 화물24시뿐) · `clientOrderNo`(가게 주문 번호) · `fromOtherOffice`(공유콜 «@»)
 * - 이름 바꿈: `companyName` → `requesterName`(의뢰인) · `receiptStatus` → `stageText`(진행 글자)
 * - 저장(D5 답대로 — 배차망 오더 번호를 장부에 남김): 장부에 남는 새 칸은 `orderNo` 하나
 */
const OFFICE_ORDER_SAMPLE_04 = {
    // ── 번호 (CallIdentity · 새 묶음) ──
    id: "콜 번호",
    targetApp: "배차망",                  // ← 아래 배차망 칸에서 옮겨 옴
    orderNo: null,                        // 새 칸 — 배차망 오더 번호 «3-9483-2159»(화물24시 상세) · 인성 · 플렉스 · 픽커 상세에는 없어 null
    clientOrderNo: null,                  // 새 칸 — 가게 주문 번호 «요기요 주문번호 : 903»(픽커 물품 글) · 없으면 null
    fromOtherOffice: false,               // 새 칸 — 공유콜(인성 «@») · 뜻을 모르는 배차망은 null
    dispatcherName: "배차사",              // ← 아래 상세 칸에서 옮겨 옴
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",               // ← companyName 이름 바꿈
    stageText: "진행 글자",                // ← receiptStatus 이름 바꿈(«배차» · «배송» — 전표 상태가 아니다)

    // ── 목록 칸 (SimplifiedOfficeOrder) ──
    // id: 위 번호 묶음으로 옮김
    type: "NEW_ORDER",
    pickup: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
    dropoff: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
    timestamp: "보고 시각",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    vehicleType: "다마스",
    rawText: "원문",
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,
    pickupDistance: 101,
    deliveryDistance: 201,
    isSimulated: false,
    itemSize: "크기",
    tagsText: "표시 글자",
    verdict: "판정 축",

    // ── 상세 칸 (DetailedOfficeOrder) ──
    // dispatcherName · dispatcherPhone: 위 번호 묶음으로 옮김
    // receiptStatus: "진행 글자",        // 이름 바꿈 → stageText
    itemDescription: "물품",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        requestedDay: 0, requestedTime: "10:01",
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        requestedDay: 0, requestedTime: "13:01",
        memo: "하차 메모",
    }],
    // companyName: "의뢰인",              // 이름 바꿈 → requesterName

    // ── 돈 ──
    money: {
        income: 50000, collect: null,
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        feeRateText: "수수료 비율", paymentType: "신용", billingType: "계산서",
    },

    // ── 배차망 칸 (OfficeOrder) ──
    // targetApp: 위 번호 묶음으로 옮김
    capturedVia: "수집 길",
    capturedMode: "수집 모드",
    openedBy: "APP",
};

/**
 * 🔍 번호 묶음 예 넷 — 실물 화면 글자로 위 `_04` 의 번호 묶음을 채워 본 것 (한 예 = 한 사진의 한 콜)
 *
 * 공통 묶음: `id` 는 화면 글자가 아니다(원달앱이 붙인다) · 오더 번호는 상세에 오더 번호가 보이는 화물24시만 채운다(기사님 결정) ·
 * 공유콜은 화면이 표시하면 참 · 표시가 없으면 거짓 · 그 배차망에서 뜻을 모르거나 표시 자체가 없으면 null
 *
 * 인성 — ex_images/인성/이미지글자_인성.md 상세-미확정(다른사람 잡을수 있음).png(확정 전 상세):
 * 머리 줄 «(주)신한로직스[1588-5480]» · 상태 «배차» · 의뢰지 줄 «***» · 출발지 줄 «@1시/화성송동»
 * - 지금: 서버 읽는 법이 «이름-전화» 꼴만 알아 배차사가 «(주)신한로직스[1588», 전화는 빈 값으로 읽힌다 ·
 *   의뢰지 줄은 안 읽어 `companyName` 이 빈다 · «@» 는 담을 칸이 없다 · 상태는 `receiptStatus` «배차»
 * - 묶음: 배차사 «(주)신한로직스» 와 전화 «1588-5480» 을 가른다 · 의뢰인은 화면 글자 «***»(배차망이 가린 글자) 그대로 ·
 *   «@» 가 있어 공유콜 참(원달앱은 목록 원문의 «@» 로 정한다 — 이 사진에서는 출발지 줄 앞 «@») · 인성 화면에는 오더 번호 · 가게 주문 번호가 없어 null
 */
const IDENTITY_EXAMPLE_INSUNG = {
    id: "원달앱이 목록을 읽을 때 붙인 무작위 번호",
    targetApp: "insung",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: true,
    dispatcherName: "(주)신한로직스",
    dispatcherPhone: "1588-5480",
    requesterName: "***",
    stageText: "배차",
};

/**
 * 화물24시 — ex_images/화물24시/이미지글자_화물24시.md 51_화물상세정보.png(확정 전 상세 · 위 `MONEY_EXAMPLE_HWAMUL24_RECEIPT` 와 같은 콜):
 * 머리 왼쪽 큰 글자 «(주)전국물류» · 머리 아랫줄 «화물번호:3-7205-4006» · «[ 등록시간:06:36분 ]»
 * - 지금: 원달앱이 상세 보고 원문에서 «상차지» 앞 머리를 떼어(`Hwamul24Parser.detailTextsOf`) 서버가 배차사 · 화물번호를 볼 수 없다 — 둘 다 빈 값
 * - 묶음: 오더 번호 «3-7205-4006»(이름표 «화물번호:» 는 뗀다) · 배차사 «(주)전국물류» ·
 *   이 화면에는 배차사 전화 · 의뢰인 · 진행 글자 · 가게 주문 번호가 없어 null · 공유콜 표시가 화물24시 화면에 없어 null ·
 *   «[ 등록시간:06:36분 ]» 은 올린 시각이라 목록 글자 묶음 몫
 */
const IDENTITY_EXAMPLE_HWAMUL24 = {
    id: "24H-…(원달앱이 목록을 읽을 때 붙인 무작위 번호)",
    targetApp: "hwamul24",
    orderNo: "3-7205-4006",
    clientOrderNo: null,
    fromOtherOffice: null,
    dispatcherName: "(주)전국물류",
    dispatcherPhone: null,
    requesterName: null,
    stageText: null,
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/07_상세_최종수익분해.jpeg(확정 전 상세 · 위 `MONEY_EXAMPLE_KAKAOPICKER` 와 같은 콜):
 * 물품 정보 글 끝 «요기요 주문번호 : 903» · 픽업 장소 둘째 줄 «오더번호 F2609011638JDU17»
 * - 지금: 목록 줄에 번호가 없어 `id` 는 빈 값 → 원달앱이 «AUTO-시각» · «MANUAL-시각» 을 붙인다 ·
 *   «요기요 주문번호 : 903» 은 물품 글(`itemDescription`) 안에 섞인다 · «오더번호 …» 는 원문 보관만
 * - 묶음: 가게 주문 번호는 화면 글자 통째 «요기요 주문번호 : 903» · 오더 번호는 null —
 *   픽업 장소 줄의 «오더번호 F2609011638JDU17» 는 픽업 가게가 음식에 붙인 주문 번호라 우리 콜의 오더 번호가 아니다(기사님 결정) ·
 *   같은 콜 찾기에도 안 쓰고, 그 줄 글자는 적요(`detailMemo`)로 간다 ·
 *   배차사 · 의뢰인 · 진행 글자 · 공유콜 표시는 픽커 화면에 없어 null
 */
const IDENTITY_EXAMPLE_KAKAOPICKER = {
    id: "AUTO-… · MANUAL-…(목록 줄 번호가 빈 값이라 원달앱이 상세에서 붙임)",
    targetApp: "kakaopicker",
    orderNo: null,
    clientOrderNo: "요기요 주문번호 : 903",
    fromOtherOffice: null,
    dispatcherName: null,
    dispatcherPhone: null,
    requesterName: null,
    stageText: null,
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스.md 10_상세_3.png · 10_상세_3.xml(확정 전 상세 · 위 `MONEY_EXAMPLE_ISFLEX` 와 같은 콜):
 * 머리 줄 «@낼08:20/수원이의동 → 10:20전/쌍림동» · 출발 칸 «@경기 수원시영통구 @낼08:20/수원이의동»
 * - 지금: 배차사 · 의뢰인 · 진행 글자를 읽는 칸이 없다 · «@» 는 `IsflexAddress.clean` 이 뗀다
 * - 묶음: «@» 는 모든 출발지 앞에 붙어 뜻을 몰라 공유콜 null(인성과 같은 글자라도 안 읽는다) ·
 *   오더 번호 · 가게 주문 번호 · 배차사 · 의뢰인 · 진행 글자는 이 화면에 없어 null
 */
const IDENTITY_EXAMPLE_ISFLEX = {
    id: "FLX-…(원달앱이 목록을 읽을 때 붙인 무작위 번호)",
    targetApp: "isflex",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: null,
    dispatcherName: null,
    dispatcherPhone: null,
    requesterName: null,
    stageText: null,
};

/**
 * 🔍 **새 콜 견본 — 출처 묶음(CallProvenance)을 모은 모양** (`설계/shared/번호출처_정의_계획_03.md` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_04` 와 다른 것만:
 * - 모음: «이 보고가 어디서 어떻게 왔나»를 한 묶음으로 — 보고 종류 · 읽은 시각 · 원문 · 누가 열었나 · 그때 모드 · 연습 콜. 화면 글자가 아니다
 * - 뺌: `capturedVia` — 원달앱이 보내지 않아 서버가 늘 빈 값을 적는다
 * - 새 저장 칸 없음 — 지금도 있는 값을 모은 것뿐
 */
const OFFICE_ORDER_SAMPLE_05 = {
    // ── 번호 (CallIdentity) ──
    id: "콜 번호",
    targetApp: "배차망",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: false,
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",
    stageText: "진행 글자",

    // ── 출처 (CallProvenance · 새 묶음) ──
    type: "NEW_ORDER",                    // ← 목록 칸에서 옮겨 옴 — 보고 종류(NEW_ORDER · PICKER_DETAIL · AUTO_CLICK …)
    timestamp: "보고 시각",               // ← 목록 칸에서 옮겨 옴 — 원달앱이 화면을 읽은 시각
    rawText: "원문",                      // ← 목록 칸에서 옮겨 옴 — 화면 글자 통째
    openedBy: "APP",                      // ← 배차망 칸에서 옮겨 옴 — 상세를 누가 열었나(APP 원달앱 · DRIVER 기사님)
    capturedMode: "수집 모드",            // ← 배차망 칸에서 옮겨 옴 — 그때 폰 모드
    isSimulated: false,                   // ← 목록 칸에서 옮겨 옴 — 연습 콜인가

    // ── 목록 칸 (SimplifiedOfficeOrder) ──
    // type · timestamp · rawText · isSimulated: 위 출처 묶음으로 옮김
    pickup: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
    dropoff: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    vehicleType: "다마스",
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,
    pickupDistance: 101,
    deliveryDistance: 201,
    itemSize: "크기",
    tagsText: "표시 글자",
    verdict: "판정 축",

    // ── 상세 칸 (DetailedOfficeOrder) ──
    itemDescription: "물품",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        requestedDay: 0, requestedTime: "10:01",
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        requestedDay: 0, requestedTime: "13:01",
        memo: "하차 메모",
    }],

    // ── 돈 ──
    money: {
        income: 50000, collect: null,
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        feeRateText: "수수료 비율", paymentType: "신용", billingType: "계산서",
    },

    // ── 배차망 칸 (OfficeOrder) ──
    // capturedVia: "수집 길",            // 뺌 — 원달앱이 안 보내 늘 빈 값
    // capturedMode · openedBy: 위 출처 묶음으로 옮김
};

/**
 * 🔍 출처 묶음 예 넷 — 위 `_05` 의 출처 묶음을 배차망마다 채워 본 것 (한 예 = 한 사진의 한 콜)
 *
 * 출처 묶음은 화면 글자가 아니다 — 원달앱 · 서버가 채운다. 아래 값은 «이 사진의 화면을 원달앱이 읽어 보냈다면» 채워질 모습이다.
 * `rawText` 만 화면 글자다 — 여기에는 표에 적힌 글자 몇 조각만 « · » 로 이어 «…(발췌)» 를 붙였다(실제 원문은 화면 글자 통째).
 * `timestamp` 는 사진에 없는 값이라 뜻만 적었다 · `isSimulated` 는 SIMULATION 모드에서 기사님이 손으로 확정하지 않은 콜만 참이라 넷 다 거짓
 * 공통 지금: `capturedVia` 는 원달앱이 안 보내 늘 빈 값(그래서 뺀다) · 보고 종류 값 목록(`EVENT_TYPES`)에 실제로 오가는 PICKER_DETAIL · AUTO_CLICK · MANUAL_CLICK 이 없다 ·
 * 원문은 `intel` 에만 저장되고 `orders` 에는 칸이 없다
 *
 * 인성 — 위 `IDENTITY_EXAMPLE_INSUNG` 과 같은 사진 ex_images/인성/이미지글자_인성.md 상세-미확정(다른사람 잡을수 있음).png(확정 전 상세)
 * - 묶음: 원달앱이 목록 줄을 눌러 연 상세라고 치면 보고 종류 AUTO_CLICK · 연 쪽 APP · 그때 모드 AUTO(인성은 자동 확정 배차망)
 */
const PROVENANCE_EXAMPLE_INSUNG = {
    type: "AUTO_CLICK",
    timestamp: "원달앱이 이 화면을 읽은 시각 — 사진에는 없다",
    rawText: "(주)신한로직스[1588-5480] · 배차 · 다 · 23% · 40,000 · (신용) · 편도 · 1시상차 6박스 카트가지고 고객님앞 갖다주세요 · 현위치 → 상차지(직선)23.6KM · @1시/화성송동 · [착] …(발췌)",
    openedBy: "APP",
    capturedMode: "AUTO",
    isSimulated: false,
};

/**
 * 화물24시 — 위 `IDENTITY_EXAMPLE_HWAMUL24` 와 같은 사진 ex_images/화물24시/이미지글자_화물24시.md 51_화물상세정보.png(확정 전 상세)
 * - 지금: 원달앱이 상세 보고 원문에서 «상차지» 앞 머리(화주 이름 · 화물번호 · 등록시간)를 떼어 보낸다
 * - 묶음: 원달앱이 연 상세라고 치면 AUTO_CLICK · APP · AUTO(화물24시는 자동 확정 배차망) · 원문에 머리 줄이 남는다(번호출처 계획 걸음 9)
 */
const PROVENANCE_EXAMPLE_HWAMUL24 = {
    type: "AUTO_CLICK",
    timestamp: "원달앱이 이 화면을 읽은 시각 — 사진에는 없다",
    rawText: "(주)전국물류 · 화물번호:3-7205-4006 · [ 등록시간:06:36분 ] · 인천 동구 송림동 · 당상 · 지 · 18Km · 경기 안산 단원구 와동왕복 · 당착 · 지 · 32Km · 왕복 09시상 당착 주류-A · 독차 …(발췌)",
    openedBy: "APP",
    capturedMode: "AUTO",
    isSimulated: false,
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/06_상세_마감시각_준비시간.jpeg(확정 전 상세 · 아래 `STOP_EXAMPLE_KAKAOPICKER` 와 같은 사진)
 * - 지금: 원문은 접근성 글 + «[사진]» 판독 줄이 함께 서버로 가고 `intel.rawDetailText` 에 보관된다
 * - 묶음: 기사님이 손으로 연 상세라고 치면 보고 종류 PICKER_DETAIL(픽커 상세 수집) · 연 쪽 DRIVER ·
 *   그때 모드 ALARM(픽커는 자동 확정을 못 하는 배차망 — 잡지 않고 알람 · 수집만)
 */
const PROVENANCE_EXAMPLE_KAKAOPICKER = {
    type: "PICKER_DETAIL",
    timestamp: "원달앱이 이 화면을 읽은 시각 — 사진에는 없다",
    rawText: "퀵 단거리 · 배송 31분 남음 준비 17분 포함 · 경기 성남시 중원구 은행2동 · 퓨전중화요리-궁 · 픽업 14.6km · 17:04까지 픽업 · 경기 성남시 중원구 중앙동 · 새한맨션 · 배송 2.1km · 17:18까지 배송 · 매장 직원에게 문의 …(발췌)",
    openedBy: "DRIVER",
    capturedMode: "ALARM",
    isSimulated: false,
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스.md 10_상세_3.png · 10_상세_3.xml(확정 전 상세)
 * - 지금: 원달앱이 «출발지까지» 앞(머리 줄 «@낼08:20/수원이의동 → 10:20전/쌍림동»)을 떼어 보낸다(`IsflexParser.detailTextsOf`)
 * - 묶음: 원달앱이 목록 줄을 눌러 연 상세라고 치면 AUTO_CLICK · APP · 그때 모드 ALARM(플렉스는 자동 확정을 못 하는 배차망)
 */
const PROVENANCE_EXAMPLE_ISFLEX = {
    type: "AUTO_CLICK",
    timestamp: "원달앱이 이 화면을 읽은 시각 — 사진에는 없다",
    rawText: "출발지까지 24.4km · 오토 · 과적 · 출발 @경기 수원시영통구 @낼08:20/수원이의동 · 약 31.0km · 도착 서울 중구 10:20전/쌍림동 · 적요상세 과적 아이스박스1(제품샘플)-착지시간꼭엄수/다른 곳 들르 · 총 수입 21,252원 …(발췌)",
    openedBy: "APP",
    capturedMode: "ALARM",
    isSimulated: false,
};

/**
 * 🔍 **새 콜 견본 — 목록 글자 · 거리 · 표시 글자를 한 묶음으로 둔 모양** (`주소_정의_계획_02` · `거리_정의_계획_02` · `표시글자_정의_계획_02` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_05` 와 다른 것만:
 * - 바꿈: `pickup` · `dropoff` 는 목록 글자 원문만 — 상세를 열어도 상세 주소로 덮지 않는다(상세 주소는 정거장 `addressDetail` 에)
 * - 모음: 목록 줄에서 읽는 글자(올린 시각 · 상차 약속 원문 · 거리 · 표시 글자 · 구분 · 형태 · 적요)를 한 자리에 — 칸 이름 · 값은 그대로
 * - 거리: 목록 값이 먼저, 목록에 없으면 상세 값(U3 가 — 상세에만 보이는 배송 거리도 담음) · 둘 다 화면 직선 거리 — 서버 카카오 도로 거리와 다른 값
 * - 표시 글자: `tagsText` 원문 그대로(D6 나 — 표시 글자 묶음 칸은 안 만든다)
 * - 머리 나눔: 좌표 넷을 «서버가 붙이는 좌표» 머리 아래로 · `vehicleType` · `itemSize` · `itemDescription` 을 «그대로 남은 옛 칸» 머리 아래로 ·
 *   상세 칸 머리를 «정거장» 으로 — 칸 이름 · 값은 그대로
 * - 새 저장 칸 없음
 */
const OFFICE_ORDER_SAMPLE_06 = {
    // ── 번호 (CallIdentity) ──
    id: "콜 번호",
    targetApp: "배차망",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: false,
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",
    stageText: "진행 글자",

    // ── 출처 (CallProvenance) ──
    type: "NEW_ORDER",
    timestamp: "보고 시각",
    rawText: "원문",
    openedBy: "APP",
    capturedMode: "수집 모드",
    isSimulated: false,

    // ── 목록 글자 · 거리 · 표시 글자 (새 묶음) ──
    pickup: "초월읍",                     // 바꿈 — 목록 글자 원문(인성 «@낼8:30/가산동» 처럼 앞글자가 붙은 그대로) · 전엔 상세 주소로 덮였다
    dropoff: "신둔면",                    // 바꿈 — 위와 같다
    postTime: "올린 시각",                // 배차 사무실이 올린 시각(화물24시 «05:12»)
    scheduleText: "상차 약속 글자",       // 상차 쪽 앞글자 원문 «@낼8:30» — 사람이 읽는 원문 · 날 · 시각은 정거장 칸에
    pickupDistance: 101,                  // 상차 거리 — 내 자리 → 상차지 직선(화면 값)
    deliveryDistance: 201,                // 배송 거리 — 상차지 → 하차지 직선 · 목록에 없으면 상세 값(U3 가)
    tagsText: "표시 글자",                 // 표시 글자 원문 «당상 · 독차 · 과적» — 픽커 쌍둥이 콜을 가르는 열쇠이기도 하다
    tripType: "구분",                     // ← 상세 칸에서 옮겨 옴 — 편도 · 왕복
    orderForm: "형태",                    // ← 상세 칸에서 옮겨 옴 — 보통 · 급송
    detailMemo: "적요",                   // ← 상세 칸에서 옮겨 옴
    verdict: "판정 축",                   // 원달앱 판정에서 떨어진 축 — 원달앱이 붙인다

    // ── 서버가 붙이는 좌표 ──
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,

    // ── 그대로 남은 옛 칸 (위 견본의 목록 · 상세 칸에서 그대로) ──
    vehicleType: "다마스",
    itemSize: "크기",
    itemDescription: "물품",

    // ── 정거장 ──
    pickupDetails: [{
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당", mileage: 0,
        phone1: "상차 전화1", phone2: "상차 전화2", region: "초월읍",
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        requestedDay: 0, requestedTime: "10:01",
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당", mileage: 0,
        phone1: "하차 전화1", phone2: "하차 전화2", region: "신둔면",
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        requestedDay: 0, requestedTime: "13:01",
        memo: "하차 메모",
    }],

    // ── 돈 ──
    money: {
        income: 50000, collect: null,
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        feeRateText: "수수료 비율", paymentType: "신용", billingType: "계산서",
    },
};

/**
 * 🔍 목록 글자 · 거리 · 표시 글자 예 넷 — 실물 목록 줄 하나로 위 `_06` 의 새 묶음을 채워 본 것 (한 예 = 한 사진의 한 줄)
 *
 * 공통 묶음: `pickup` · `dropoff` 는 목록 칸 글자 원문 그대로 — 상세를 열어도 덮지 않는다(상세 주소는 정거장 `addressDetail`) ·
 * 거리는 목록 값이 먼저, 목록에 없으면 상세 값(U3 가) · `tagsText` 는 원문 글자(D6 나 — 표시 글자 묶음 칸 없음) ·
 * 구분 · 형태 · 적요는 목록 줄에 글자가 없으면 null
 *
 * 인성 — ex_images/인성/이미지글자_인성.md 영상_0515.jpg(신규 목록 새 줄 · 노랑 바탕 + 빨강 글자):
 * «2.6/20.4 @낼11-12시/구(잘림) 14시전/인천/원(잘림) 다 34.6»
 * - 지금: `pickup` · `dropoff` 에 칸 끝 동 이름만 담고, 상세를 열면 팝업 «위치» 주소로 덮는다 ·
 *   도착지 앞 «14시전» 은 출발지 쪽에 예약이 있어 버려진다 · 노랑 바탕(급송)은 접근성 글자에 없어 형태가 빈다
 * - 묶음: 칸 글자 원문(잘린 곳은 «…(잘림)») · `scheduleText` 는 상차 쪽 앞글자 «@낼11-12시»(끝 «/» 만 떼고 «@» 는 붙은 채) —
 *   정거장 약속으로는 상차 날 1 · 구간의 끝 시각 12:00, 하차 «14시전» → `dropoffDetails[끝]` 날 1 · 14:00 (정거장 묶음 몫) ·
 *   날짜 없는 하차는 상차와 같은 날로 본다(기사님 결정 — 상차가 «낼» 이라 하차도 내일) ·
 *   인성 목록에는 올린 시각 칸이 없어 `postTime` null · 표시 글자 · 구분 · 적요는 이 줄에 없어 null · 급송은 줄 색뿐이라 `orderForm` null
 */
const LIST_EXAMPLE_INSUNG = {
    pickup: "@낼11-12시/구…(잘림)",
    dropoff: "14시전/인천/원…(잘림)",
    postTime: null,
    scheduleText: "@낼11-12시",
    pickupDistance: 2.6,
    deliveryDistance: 20.4,
    tagsText: null,
    tripType: null,
    orderForm: null,
    detailMemo: null,
};

/**
 * 화물24시 — ex_images/화물24시/이미지글자_화물24시.md 17_화물정보_리스트.png 줄 1(신규 목록):
 * «경기 군포 부곡동» · «서울 중구 을지로(뒤 잘림)» · «당상» · «수» · «5Km» · «05:12» · «수» · «당착» · «1톤/전체» ·
 * «지금상 당착 59박스 수/수-A» · «독차» · «인수증» · «60,000원»
 * - 지금: `tagsText` 는 날 배지 «당상 당착» 만 · «수» · «독차» 는 잡음 낱말로 버린다 · 화물 글은 칸에 안 싣는다 ·
 *   배송 거리는 목록에 없고 상세 «36Km» 는 안 읽어 빈다
 * - 묶음: `deliveryDistance` 만 목록에 없어 같은 콜 상세 18_화물상세정보_배차신청.png «36Km»(이 칸만 다른 사진 —
 *   상차 · 하차 · «5Km» · 화물 글이 같은 콜) · `tagsText` 는 표시 글자 원문을 빈칸으로 이어서(노란 «수» = 수작업 — 금액 알약 «수»(수수료)와 다른 글자) ·
 *   «인수증» 은 증빙이라 돈 묶음 몫 · 화물 글 끝 «-A» 는 등록 구분(원문에 남음) · `scheduleText` 는 상차 쪽 «당상» ·
 *   구분 · 형태 글자는 이 줄에 없어 null(같은 콜 상세의 운행방법은 «편도»)
 */
const LIST_EXAMPLE_HWAMUL24 = {
    pickup: "경기 군포 부곡동",
    dropoff: "서울 중구 을지로…(잘림)",
    postTime: "05:12",                    // 배차 사무실이 올린 시각 — 같은 콜 상세 «[ 등록시간:05:18분 ]» 과 6분 다르다
    scheduleText: "당상",
    pickupDistance: 5,
    deliveryDistance: 36,                 // 목록에 없어 같은 콜 상세 «36Km»(U3 가)
    tagsText: "당상 수 수 당착 독차",
    tripType: null,
    orderForm: null,
    detailMemo: "지금상 당착 59박스 수/수-A",
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/13-1_신규_리스트(퀵,중형,반나절,승,예약).jpeg 목록 1번째 줄:
 * 표시 글자 «퀵» · 네모 «승» · «예약 17:30» · 몸통 «6.8km» · «광주 송정» · 오른쪽 «강남 역삼1» · «19,404»
 * - 지금: «광주 송정» · «강남 역삼1» 이 상세를 열면 사진의 행정동 주소 + 상호로 덮인다 · «승» 은 `tagsText` 에만(차종 빈 값) ·
 *   «17:30» 은 `scheduleText` · 배송 거리는 목록에 없어 빈다
 * - 묶음: 칸 글자 원문 · `scheduleText` «17:30» — 정거장 약속은 날 표시가 없어 오늘(0) · 17:30(기사님 결정: 날짜 없는 «예약» = 오늘) ·
 *   배송 거리는 목록에 없고 이 콜의 상세 사진이 없어 null(상세가 있으면 «배송 N km» 값) · 올린 시각 · 구분 · 형태 · 적요는 목록 줄에 없어 null
 */
const LIST_EXAMPLE_KAKAOPICKER = {
    pickup: "광주 송정",
    dropoff: "강남 역삼1",
    postTime: null,
    scheduleText: "17:30",
    pickupDistance: 6.8,
    deliveryDistance: null,
    tagsText: "퀵 승 예약 17:30",
    tripType: null,
    orderForm: null,
    detailMemo: null,
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스.md 02_목록.png · 02_목록.xml 첫 줄(신규 목록):
 * «24.3» · «오토» · «@낼08:20/수원이의동» · «약 30.1km» · «10:20전/쌍림동» · «21,252»
 * - 지금: «@» 를 떼고 붙은 시를 띄워 `pickup` «수원 이의동» · 상세를 열면 다듬은 상세 주소로 덮는다 ·
 *   도착지 앞 «10:20전» 은 `tagsText` 에 붙는다 · `scheduleText` «낼08:20»
 * - 묶음: 칸 글자 원문(«@» · 앞글자까지) · `scheduleText` 는 상차 쪽 앞글자 «@낼08:20»(인성과 같이 «@» 는 붙은 채) · 상세 출발 칸 «@경기 수원시영통구 @낼08:20/수원이의동» 은 목록 글자가 아니라 정거장 `addressDetail` 몫 ·
 *   «10:20전» 은 하차 약속이라 정거장 칸으로 간다 — 이 줄에는 표시 글자가 없어 `tagsText` null ·
 *   거리는 목록 값 24.3 · 30.1(같은 콜 상세 «24.4km» · «약 31.0km» 보다 먼저) · 올린 시각 · 구분 · 형태 · 적요는 목록 줄에 없어 null
 */
const LIST_EXAMPLE_ISFLEX = {
    pickup: "@낼08:20/수원이의동",
    dropoff: "10:20전/쌍림동",
    postTime: null,
    scheduleText: "@낼08:20",
    pickupDistance: 24.3,
    deliveryDistance: 30.1,
    tagsText: null,
    tripType: null,
    orderForm: null,
    detailMemo: null,
};

/**
 * 🔍 **새 콜 견본 — 정거장(D1 약속 + D2 주소)을 고친 모양** (`약속_정의_계획_04` · `주소_정의_계획_02` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_06` 과 다른 것만:
 * - 뺌: 정거장의 `mileage` — 아무도 안 읽고 안 채운다
 * - 차례: 정거장 칸을 상세 주소 · 지역 · 연락처 · 약속(날 + 시각) · 메모 차례로 한 줄씩 적고 뜻 주석을 붙였다 — 값은 `_06` 과 같다
 *   (약속 칸 `requestedDay` · `requestedTime` 은 이미 `_02` 에서 생겼다)
 * - 뜻(바뀐 것 아님): 지역 `region` = 목록에서 얻은 읍 · 면 · 동(M2 가 — 정거장 지역은 목록의 읍 · 면 · 동) ·
 *   약속 = 화면이 보인 첫 시각 하나 · 구간 «11-12시»는 끝 시각 12:00 · 날짜 없는 «예약»은 오늘(U2 — 날을 모르는 «예약»도 예약 콜) ·
 *   날짜 없는 하차는 상차와 같은 날 · null = 약속 없음
 * - 저장(D1 · D2 답대로 — 정거장 약속 · 상세 주소를 장부에 남김): 장부에 새 칸 — 상차 · 하차 약속 날 · 시각 넷, 상세 주소 둘
 */
const OFFICE_ORDER_SAMPLE_07 = {
    // ── 번호 (CallIdentity) ──
    id: "콜 번호",
    targetApp: "배차망",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: false,
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",
    stageText: "진행 글자",

    // ── 출처 (CallProvenance) ──
    type: "NEW_ORDER",
    timestamp: "보고 시각",
    rawText: "원문",
    openedBy: "APP",
    capturedMode: "수집 모드",
    isSimulated: false,

    // ── 목록 글자 · 거리 · 표시 글자 ──
    pickup: "초월읍",
    dropoff: "신둔면",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    pickupDistance: 101,
    deliveryDistance: 201,
    tagsText: "표시 글자",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    verdict: "판정 축",

    // ── 서버가 붙이는 좌표 ──
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,

    // ── 그대로 남은 옛 칸 (위 견본의 목록 · 상세 칸에서 그대로) ──
    vehicleType: "다마스",
    itemSize: "크기",
    itemDescription: "물품",

    // ── 정거장 (D1 약속 + D2 주소 · 고친 모양) ──
    pickupDetails: [{
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",   // D2 상세 주소 — 인성 팝업 · 확정 뒤 · 화물24시 상세(U5 가 — 화물24시 상세 전체 주소를 읽음) · 화면 글자 그대로
        region: "초월읍",                 // 목록에서 얻은 읍 · 면 · 동(M2 가)
        customerName: "상차 고객명",      // 상호 — 픽커 · 화물24시는 주소 괄호 안 가게 이름(S2 가 — 가게 이름을 따로 띄움)
        department: "상차 부서",
        contactName: "상차 담당",
        phone1: "상차 전화1",
        phone2: "상차 전화2",
        requestedDay: 0,                  // D1 날 — 0 오늘 · 1 내일 · 날짜 없는 «예약»은 0(U2) · null = 약속 없음
        requestedTime: "10:01",           // D1 첫 시각 — 픽커 «17:04까지 픽업»도 여기(U1 가 — 픽커 «까지 픽업»을 상차 약속으로) · 구간은 끝 시각
        memo: "상차 메모",
        // mileage: 0,                    // 뺌 — 아무도 안 읽고 안 채움
    }],
    dropoffDetails: [{
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        region: "신둔면",
        customerName: "하차 고객명",
        department: "하차 부서",
        contactName: "하차 담당",
        phone1: "하차 전화1",
        phone2: "하차 전화2",
        requestedDay: 0,                  // D1 하차 약속 날 — 인성 «14시전» · 플렉스 «10:20전» · 픽커 «19:22까지 배송»이 여기로
        requestedTime: "13:01",           // D1 하차 약속 시각 — 관제웹 «🏁 하차 13:01»로 보인다(S1 가 — 하차 약속을 화면에 보임)
        memo: "하차 메모",
        // mileage: 0,                    // 뺌
    }],

    // ── 돈 ──
    money: {
        income: 50000, collect: null,
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        feeRateText: "수수료 비율", paymentType: "신용", billingType: "계산서",
    },
};

/**
 * 🔍 정거장 예 넷 — 실물 화면 글자로 위 `_07` 의 `pickupDetails[0]` · `dropoffDetails[끝]` 을 채워 본 것 (한 예 = 한 콜)
 *
 * 공통 묶음: `region` 은 목록 줄의 읍 · 면 · 동(M2 가) — 플렉스는 같은 콜의 목록 줄 사진(02_목록)이 있어 채웠고,
 * 인성 · 화물24시 · 픽커는 같은 콜의 목록 줄 사진이 없어 null 로 두었다 ·
 * 사람 이름 · 개인 전화는 이 파일에 옮기지 않고 «(이름 가림)» · «(전화 가림)» 으로 적는다
 *
 * 인성 — ex_images/인성/이미지글자_인성.md 출발지상세.png · 도착지상세.png(확정 전 상세의 출발지 · 도착지 팝업 두 장 —
 * 인성 정거장 값은 팝업에만 있어 두 장을 한 예로 묶었다 · 두 팝업의 전화1 이 같아 한 콜로 본다):
 * 출발 «*레드캠프» · 부서 (이름 가림) · 담당 (이름 가림) · 전화1 (전화 가림) · 전화2 (전화 가림) · «출발 경기 화성시» ·
 * 위치 «경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)»
 * 도착 «SK스토아 홈쇼핑(5층하차» · 부서 «*» · 담당 «*» · 전화1 (전화 가림) · 전화2 «*» · «도착 서울 마포구» ·
 * 위치 «서울 마포구 상암동 1601 (서울 마포구 월드컵북로 402)KGIT센터»
 * - 지금: 서버가 상호 · 부서 · 담당 · 전화 둘 · 위치를 정거장에 담고, 원달앱은 같은 «위치» 로 `pickup` · `dropoff` 를 덮는다 ·
 *   판정이 끝 «)» 괄호를 지운 주소로 `pickup` 을 다시 덮는다 · «출발 경기 화성시» 는 아무도 안 읽는다 · 약속 칸은 정거장에 없다
 * - 묶음: `addressDetail` 은 «위치» 글자 그대로(괄호까지) · 팝업의 «경기 화성시» · «서울 마포구» 는 시 · 군 · 구라 `region` 에 안 담는다 ·
 *   팝업에 약속 · 메모가 없어 null — 인성 약속은 목록 앞글자에서 온다(위 `LIST_EXAMPLE_INSUNG`) ·
 *   부서 · 담당 · 전화2 의 «*» 는 배차망이 가린 화면 글자 그대로 · 전화2 «031-…» 는 개인 · 가게를 못 가려 가렸다
 */
const STOP_EXAMPLE_INSUNG = {
    pickupDetails: [{
        addressDetail: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)",
        region: null,
        customerName: "*레드캠프",
        department: "(이름 가림)",
        contactName: "(이름 가림)",
        phone1: "(전화 가림)",
        phone2: "(전화 가림)",
        requestedDay: null,
        requestedTime: null,
        memo: null,
    }],
    dropoffDetails: [{
        addressDetail: "서울 마포구 상암동 1601 (서울 마포구 월드컵북로 402)KGIT센터",
        region: null,
        customerName: "SK스토아 홈쇼핑(5층하차",
        department: "*",
        contactName: "*",
        phone1: "(전화 가림)",
        phone2: "*",
        requestedDay: null,
        requestedTime: null,
        memo: null,
    }],
};

/**
 * 화물24시 — ex_images/화물24시/이미지글자_화물24시.md 53_화물상세정보_배차신청전.png(확정 전 상세):
 * 상차지 칸 «경기 군포 당정동 공단로124번길 4 (크레텍)» · «당상» · «지» · «33Km» / 하차지 칸 «경기 화성 신동 703» · «당착» · «지» · «34Km» ·
 * 화물정보 «당일상 당착 #연계#쿠팡 24시(군포-부천)새벽02시(부천-동탄)가는대로 하차(뒤 잘림)»
 * - 지금: 상세 상차지 · 하차지 칸은 «안 씀» — 목록 짧은 주소를 쓴다 · 괄호 상호 «(크레텍)» 은 안 읽는다 · 하차 날 «당착» 은 표시 글자(`tagsText`)에만 남는다
 * - 묶음: `addressDetail` 은 상세 주소 화면 글자 그대로 «(크레텍)» 까지(U5 가 — 인성 «위치» 와 같이 괄호를 지우지 않는다) · 상호는 괄호 안 가게 이름 «크레텍» 을 따로(S2 가) ·
 *   «당상» → 상차 날 0 · «당착» → 하차 날 0, 시각은 화면에 없어 null ·
 *   화물 글 «새벽02시…가는대로 하차» 는 사람이 읽을 적요라 약속 칸에 안 담는다 · 전화 · 부서 · 담당 · 정거장 메모는 확정 전 상세에 없어 null
 */
const STOP_EXAMPLE_HWAMUL24 = {
    pickupDetails: [{
        addressDetail: "경기 군포 당정동 공단로124번길 4 (크레텍)",
        region: null,
        customerName: "크레텍",            // 주소 끝 괄호 안 가게 이름을 따로 뗀 것
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,                  // «당상»
        requestedTime: null,
        memo: null,
    }],
    dropoffDetails: [{
        addressDetail: "경기 화성 신동 703",
        region: null,
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,                  // «당착»
        requestedTime: null,
        memo: null,
    }],
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/06_상세_마감시각_준비시간.jpeg(확정 전 상세 · 위 `MONEY_EXAMPLE_KAKAOPICKER` 와 같은 콜):
 * 첫 정거장 «경기 성남시 중원구 은행2동» · 회색 «퓨전중화요리-궁» · «픽업 14.6km» · «17:04까지 픽업» /
 * 둘째 정거장 «경기 성남시 중원구 중앙동» · 회색 «새한맨션» · «배송 2.1km» · «17:18까지 배송» · 픽업 장소 «매장 직원에게 문의» · «오더번호 F2609011638JDU17»
 * - 지금: 원달앱이 행정동 주소와 회색 상호를 이어 붙여 `pickup` · `dropoff` 를 덮고 정거장 칸은 비어 간다 ·
 *   «17:04까지 픽업» · «17:18까지 배송» 은 읽지만 칸에 안 넣는다 · «매장 직원에게 문의» 는 화면 낱말 기록만
 * - 묶음: `addressDetail` 은 행정동 주소 · 상호는 회색 글자 따로 · «17:04까지 픽업» → 상차 정거장 시각(U1 가) ·
 *   «17:18까지 배송» → 하차 정거장 시각 · 상차는 날 표시가 없어 오늘(0), 하차는 상차와 같은 날(0) ·
 *   픽업 장소 두 줄 «매장 직원에게 문의» · «오더번호 F2609011638JDU17»(픽업 가게의 음식 주문 번호)은 함께 콜 적요(`detailMemo`)로 간다 — 정거장 메모는 null ·
 *   전화는 단추에 번호 글자가 없어 null · 부서 · 담당은 확정 전 상세에 없어 null
 */
const STOP_EXAMPLE_KAKAOPICKER = {
    pickupDetails: [{
        addressDetail: "경기 성남시 중원구 은행2동",
        region: null,
        customerName: "퓨전중화요리-궁",
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: "17:04",           // «17:04까지 픽업»
        memo: null,                       // 픽업 장소 줄은 정거장 메모가 아니라 콜 적요로
    }],
    dropoffDetails: [{
        addressDetail: "경기 성남시 중원구 중앙동",
        region: null,
        customerName: "새한맨션",
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: "17:18",           // «17:18까지 배송»
        memo: null,
    }],
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스.md 10_상세_3.png · 10_상세_3.xml(확정 전 상세 · 위 `MONEY_EXAMPLE_ISFLEX` 와 같은 콜):
 * «출발 @경기 수원시영통구 @낼08:20/수원이의동» · «도착 서울 중구 10:20전/쌍림동»
 * - 지금: `IsflexAddress.clean` 이 «@» · 앞글자를 떼고 다듬은 주소로 `pickup` · `dropoff` 를 덮는다 · 시도 · 시군구는 `pickup` 앞에 섞이고 `region` 은 빈다 ·
 *   하차 «10:20전» 은 `tagsText` 에 붙는다
 * - 묶음: `addressDetail` 은 출발 · 도착 칸 화면 글자 그대로(칸 이름 «출발» · «도착» 만 뗌 — 지금 원달앱은 «경기 수원시 영통구 이의동» · «서울 중구 쌍림동» 으로 다듬는다) ·
 *   `region` 은 같은 콜 목록 줄(위 `LIST_EXAMPLE_ISFLEX` · 02_목록)의 읍 · 면 · 동 «이의동» · «쌍림동» ·
 *   상차 «낼08:20» → 날 1 · 08:20 · 하차 «10:20전» → 날 1 · 10:20
 *   (날짜 없는 하차는 상차와 같은 날로 본다 — 기사님 결정) ·
 *   상호 · 부서 · 담당 · 전화는 확정 전 상세에 없어 null · 적요 «…착지시간꼭엄수…» 는 콜 적요라 정거장 메모가 아니다
 */
const STOP_EXAMPLE_ISFLEX = {
    pickupDetails: [{
        addressDetail: "@경기 수원시영통구 @낼08:20/수원이의동",
        region: "이의동",
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,                  // «낼08:20»
        requestedTime: "08:20",
        memo: null,
    }],
    dropoffDetails: [{
        addressDetail: "서울 중구 10:20전/쌍림동",
        region: "쌍림동",
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,                  // «10:20전» — 날 표시가 없어 상차와 같은 날
        requestedTime: "10:20",
        memo: null,
    }],
};

/**
 * 🔍 **새 콜 견본 — 짐 묶음(D3 — 짐 묶음을 장부에 남김)을 모은 모양** (`짐_정의_계획_02` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_07` 과 다른 것만:
 * - 뺌: `vehicleType` · `itemSize` · `itemDescription` — 짐 칸 셋이 `load` 한 칸 안으로 들어간다
 * - 더함: `load` — 화면 차종 글자 · 크기 낱말 · 물품 글 · 짐 줄, 모두 화면 글자 그대로
 *   짐 줄 갈래(`kind`): weight 무게 · dimension 치수 · body 몸 모양 · passenger 동승 · goods 품목 · care 취급 주의 · unknown 뜻 모름
 * - 라면박스 수 · 우리 차종 맞춤은 담지 않는다 — 관제웹 · 서버가 꺼내 쓴다(D4 답대로 — 라면박스 수는 저장하지 않음)
 * - 저장(D3 답대로): 장부에 새 칸 — 짐 묶음 하나
 */
const OFFICE_ORDER_SAMPLE_08 = {
    // ── 번호 (CallIdentity) ──
    id: "콜 번호",
    targetApp: "배차망",
    orderNo: null,
    clientOrderNo: null,
    fromOtherOffice: false,
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",
    stageText: "진행 글자",

    // ── 출처 (CallProvenance) ──
    type: "NEW_ORDER",
    timestamp: "보고 시각",
    rawText: "원문",
    openedBy: "APP",
    capturedMode: "수집 모드",
    isSimulated: false,

    // ── 목록 글자 · 거리 · 표시 글자 ──
    pickup: "초월읍",
    dropoff: "신둔면",
    postTime: "올린 시각",
    scheduleText: "상차 약속 글자",
    pickupDistance: 101,
    deliveryDistance: 201,
    tagsText: "표시 글자",
    tripType: "구분",
    orderForm: "형태",
    detailMemo: "적요",
    verdict: "판정 축",

    // ── 서버가 붙이는 좌표 ──
    pickupX: 127.312587,
    pickupY: 37.363298,
    dropoffX: 127.401207,
    dropoffY: 37.309733,

    // vehicleType: "다마스",             // 뺌 → load.vehicleText
    // itemSize: "크기",                  // 뺌 → load.sizeText
    // itemDescription: "물품",           // 뺌 → load.itemText

    // ── 정거장 ──
    pickupDetails: [{
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        region: "초월읍",
        customerName: "상차 고객명", department: "상차 부서", contactName: "상차 담당",
        phone1: "상차 전화1", phone2: "상차 전화2",
        requestedDay: 0, requestedTime: "10:01",
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        region: "신둔면",
        customerName: "하차 고객명", department: "하차 부서", contactName: "하차 담당",
        phone1: "하차 전화1", phone2: "하차 전화2",
        requestedDay: 0, requestedTime: "13:01",
        memo: "하차 메모",
    }],

    // ── 돈 ──
    money: {
        income: 50000, collect: null,
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        feeRateText: "수수료 비율", paymentType: "신용", billingType: "계산서",
    },

    // ── 짐 (새 묶음) ──
    load: {
        vehicleText: "다마스",            // 화면 차종 글자 그대로 «3.5톤/윙» · «다» · «승» — 없으면 null
        sizeText: "크기",                 // 크기 낱말 «소형» — 픽커는 이것으로 남은 짐칸을 센다(U8 가 — 남은 짐칸을 짐 크기로 셈) · 없으면 null
        itemText: "물품",                 // 물품 글 통째 «중형 세 변의 합 140cm · 20kg 이하»
        lines: [],                        // 짐 줄 — 예: { kind: "weight", shown: "3.85톤" } · { kind: "dimension", shown: "세 변의 합 100cm" }
    },
};

/**
 * 🔍 짐 묶음 예 넷 — 실물 화면 글자로 위 `_08` 의 `load` 를 채워 본 것 (한 예 = 한 사진의 한 콜)
 *
 * 인성 — ex_images/인성/이미지글자_인성.md 영상_1509.jpg(신규 목록 새 줄): «1.7/2.1 @폰)철산동((잘림) 폰)개봉동(C(잘림) 오 8.4»
 * - 지금: 차종 칸 «오» 는 `vehicleType` · «폰)» 은 지역 정리에서 빠지거나 동 이름에 섞이고 담을 칸이 없다
 * - 묶음: 차종 글자 «오» 그대로(우리 차종 맞춤 · 라면박스 수는 담지 않는다 — 서버 · 관제웹이 꺼낸다) ·
 *   «폰)» 은 짐 줄 «품목»(뜻은 짐 계획 표 «물건이 핸드폰» · 출발 · 도착 칸 앞에 둘 다 붙어 한 줄로) · 크기 낱말 · 물품 글은 목록 줄에 없어 null
 */
const LOAD_EXAMPLE_INSUNG = {
    load: {
        vehicleText: "오",
        sizeText: null,
        itemText: null,
        lines: [
            { kind: "goods", shown: "폰)" },
        ],
    },
};

/**
 * 화물24시 — ex_images/화물24시/이미지글자_화물24시.md 51_화물상세정보.png(확정 전 상세 · 위 `MONEY_EXAMPLE_HWAMUL24_RECEIPT` 와 같은 콜):
 * 차량 칸 «톤수 3.5톤» · «차종 윙바디» · «적재중량 3.85톤» · 단추 아래 «※적재중량은 화주와 통화하여 꼭 확인하시기 바랍니다.»
 * - 지금: 상세 톤수 · 차종 · 적재중량을 안 읽는다(목록 차종 줄을 쓴다) · 적재중량은 담을 칸이 없다
 * - 묶음: 차종 글자 «3.5톤»(목록 줄이 없는 사진이라 상세 톤수) · «윙바디» 는 짐 줄 «몸 모양» · «3.85톤» 은 «무게» ·
 *   화물24시 상세에는 크기 낱말 · 물품 칸이 없어 null — 화물 글 «왕복 09시상 당착 주류-A» 는 적요(`detailMemo`) 몫
 */
const LOAD_EXAMPLE_HWAMUL24 = {
    load: {
        vehicleText: "3.5톤",
        sizeText: null,
        itemText: null,
        lines: [
            { kind: "body", shown: "윙바디" },
            { kind: "weight", shown: "3.85톤" },
        ],
    },
};

/**
 * 카카오 픽커 — ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/33_상세_예약콜_위례_삼성2동.png(확정 전 상세):
 * 시트 맨 위 네모 «승용차» · 물품 정보 «초소형» · «초소형 세 변의 합 70cm · 2kg 이하»
 * - 지금: 원달앱 사진 판독이 크기로 시작하는 줄 통째를 `itemSize` 에, 서버가 «물품 정보» 뒤 글을 `itemDescription` 에 싣는다 ·
 *   «승용차» 는 칸에 안 들어가고, 손으로 연 상세면 `vehicleType` 을 «다마스» 로 가정해 «차종미확인» 을 단다
 * - 묶음: 차종 글자 «승용차» · 크기 낱말 «초소형» · 물품 글 통째 · 짐 줄은 « · » 로 나뉜 화면 글자 그대로(치수 · 무게)
 */
const LOAD_EXAMPLE_KAKAOPICKER = {
    load: {
        vehicleText: "승용차",
        sizeText: "초소형",
        itemText: "초소형 세 변의 합 70cm · 2kg 이하",
        lines: [
            { kind: "dimension", shown: "세 변의 합 70cm" },
            { kind: "weight", shown: "2kg 이하" },
        ],
    },
};

/**
 * 인성플렉스 (실물) — ex_images/인성플렉스/이미지글자_인성플렉스.md 10_상세_3.png · 10_상세_3.xml(확정 전 상세 · 위 `MONEY_EXAMPLE_ISFLEX` 와 같은 콜):
 * «출발지까지 24.4km» 다음 «오토» · «과적» · 적요상세 «과적 아이스박스1(제품샘플)-착지시간꼭엄수/다른 곳 들르»
 * - 지금: «오토» 는 `vehicleType`(우리 차종은 정의 표 낱말로 오토바이) · «과적» 은 원달앱 `tagsText` · 서버 `tripType`
 * - 묶음: 차종 글자 «오토» 만 · «과적» 은 표시 글자(무엇이 넘치는지 뜻 모름 — 짐 줄로 안 담는다) ·
 *   적요 속 «아이스박스1(제품샘플)» 은 적요라 물품 글로 따로 뽑지 않는다 · 크기 낱말 · 물품 칸은 이 화면에 없어 null
 *   (필수화면 원천 표는 이 글을 `itemDescription` 으로 짝지었지만, `itemText` 에는 화면 물품 칸의 글자만 담는다 — 플렉스 상세에는 물품 칸이 없다)
 */
const LOAD_EXAMPLE_ISFLEX = {
    load: {
        vehicleText: "오토",
        sizeText: null,
        itemText: null,
        lines: [],
    },
};

/**
 * 🔍 **새 콜 견본 — 정거장 묶음 · 돈 줄만 · 판정 축 자리 (마지막 모양)** (`여덟계획_맞춤_03` · 아직 코드에 없음)
 *
 * 위 `OFFICE_ORDER_SAMPLE_08` 과 다른 것만:
 * - 정거장 묶음: 정거장 한 곳(`pickupDetails[i]` · `dropoffDetails[i]`)이 자기 글자를 다 갖는다 —
 *   `listText` 목록 글자 원문(← 맨 위 `pickup` · `dropoff`) · `promiseText` 약속 원문(← 상차는 `scheduleText`, 하차는 «14시전» 같은 하차 쪽 원문 — 전엔 자리가 없었다) ·
 *   `distanceKm` 화면이 그 정거장에 붙인 «여기까지 km»(첫 상차 = 내 자리 → 상차지 · 다음 정거장 = 앞 정거장 → 여기) ·
 *   `geo` 서버가 붙이는 좌표(← `pickupX` · `pickupY` · `dropoffX` · `dropoffY` — 원달앱 플러그인은 비워 둔다)
 *   거리 예: 화물24시 상세 상차지 칸 «33Km» · 하차지 칸 «34Km» · 픽커 «픽업 14.6km» · «배송 2.1km» · 화물24시 왕복 «송림동 18Km · 와동왕복 32Km» ·
 *   배송 거리 합(옛 `deliveryDistance`)은 정거장 `distanceKm` 에서 꺼내 쓴다
 * - 돈: 모양에는 돈 줄 `lines`(+ `feeRateText` · `paymentType` · `billingType`)만 남는다 — `income` · `collect` 는 돈 줄에서 꺼내 쓴다
 * - 판정 축 `verdict` 를 출처 묶음으로 — 원달앱이 붙인 판정이라 화면 글자가 아니다
 * - 약속: `requestedDay` · `requestedTime` = 화면 표시 + 정한 규칙(날짜 없는 예약 = 오늘 · 날짜 없는 하차 = 상차와 같은 날 · 구간 = 끝 시각) · null = 약속 없음
 *   예약 콜 = 예약 글자가 화면에 보이거나, 첫 상차 정거장 날이 1 이상(내일 이후)
 * - 값 목록과 «모름»: 결제(`paymentType`) · 증빙(`billingType`) · 구분(`tripType`) · 형태(`orderForm`) 값은 값 목록의 값 하나 —
 *   «모름» = 화면에 그 자리 글자는 있는데 목록에 없는 낱말 · null = 화면에 그 자리 글자가 없다 · 뜻 모를 낱말은 버리지 않는다:
 *   결제 · 증빙은 화면 글자를 `paymentShown` · `billingShown` 에 따로 남기고(돈_정의_계획_05), 구분 · 형태는 표시 글자(`tagsText`)에 남는다(표시글자_정의_계획_03 — 따로 칸 없음)
 * - 두 곳에 보이는 글자의 기준 (한 줄씩):
 *   · 값 칸이 기준 — 표시 글자(`tagsText`) · 약속 원문(`promiseText`) · 목록 글자(`listText`)는 화면 기록
 *   · 돈은 돈 줄이 기준 — 기사님 몫 · 받을 돈은 줄에서 꺼낸 값(장부의 기사님 몫 숫자 칸은 저장 사본)
 *   · 정거장 지역(`region`)은 목록 글자에서 꺼낸 값
 *   · 같은 칸에 목록 값과 상세 값이 다르면 — 거리는 목록 먼저 · 약속 시각은 목록과 상세를 합침(목록 날 + 상세 시각) ·
 *     주소는 상세 주소가 `addressDetail`, 목록 글자는 `listText` 로 둘 다 남김
 */
const OFFICE_ORDER_SAMPLE_09 = {
    // ── 번호 (CallIdentity) ──
    id: "콜 번호",
    targetApp: "배차망",
    orderNo: null,                        // 배차망 오더 번호 — 상세에 보이는 곳은 화물24시 «화물번호:» 뿐(픽커 «오더번호 F…» 는 가게 주문 번호라 적요로)
    clientOrderNo: null,
    fromOtherOffice: false,
    dispatcherName: "배차사",
    dispatcherPhone: "배차사 전화",
    requesterName: "의뢰인",
    stageText: "진행 글자",

    // ── 출처 (CallProvenance) ──
    type: "NEW_ORDER",
    timestamp: "보고 시각",
    rawText: "원문",
    openedBy: "APP",
    capturedMode: "수집 모드",
    isSimulated: false,
    verdict: "판정 축",                   // ← 목록 글자 묶음에서 옮겨 옴 — 원달앱이 붙인 판정(화면 글자 아님)

    // ── 목록 글자 · 표시 글자 ──
    // pickup: "초월읍",                  // → 정거장 pickupDetails[0].listText
    // dropoff: "신둔면",                 // → 정거장 dropoffDetails[끝].listText
    postTime: "올린 시각",
    // scheduleText: "상차 약속 글자",    // → 정거장 pickupDetails[0].promiseText
    // pickupDistance: 101,               // → 정거장 pickupDetails[0].distanceKm
    // deliveryDistance: 201,             // → 정거장 dropoffDetails[i].distanceKm (배송 거리 합은 꺼내 쓴다)
    tagsText: "표시 글자",
    tripType: "편도",                     // 구분 — 값 목록 편도 · 왕복 · 경유 · 모름 · 목록에 없는 낱말은 «모름» + 그 글자는 `tagsText` 에
    orderForm: "보통",                    // 형태 — 값 목록 보통 · 급송 · 모름 · 위와 같다
    detailMemo: "적요",

    // ── 서버가 붙이는 좌표 ──
    // pickupX: 127.312587,               // → 정거장 pickupDetails[0].geo.x
    // pickupY: 37.363298,                // → 정거장 pickupDetails[0].geo.y
    // dropoffX: 127.401207,              // → 정거장 dropoffDetails[끝].geo.x
    // dropoffY: 37.309733,               // → 정거장 dropoffDetails[끝].geo.y

    // ── 정거장 (정거장 묶음) ──
    pickupDetails: [{
        listText: "초월읍",               // 목록 글자 원문 — 상세를 열어도 덮지 않는다
        promiseText: "상차 약속 글자",    // 약속 원문 — 인성 «@낼8:30» · 화물24시 «당상» · 픽커 «17:04까지 픽업»
        addressDetail: "경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점",
        region: "초월읍",                 // 목록에서 얻은 읍 · 면 · 동
        customerName: "상차 고객명",
        department: "상차 부서",
        contactName: "상차 담당",
        phone1: "상차 전화1",
        phone2: "상차 전화2",
        requestedDay: 0,                  // 화면 표시 + 정한 규칙 · null = 약속 없음
        requestedTime: "10:01",
        distanceKm: 101,                  // 내 자리 → 상차지(화면 직선 거리)
        geo: { x: 127.312587, y: 37.363298 },   // 서버가 붙이는 좌표 — 원달앱은 비워 둔다
        memo: "상차 메모",
    }],
    dropoffDetails: [{
        listText: "신둔면",
        promiseText: "하차 약속 글자",    // 하차 쪽 원문 — 인성 «14시전» · 플렉스 «10:20전» · 픽커 «17:18까지 배송»
        addressDetail: "경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점",
        region: "신둔면",
        customerName: "하차 고객명",
        department: "하차 부서",
        contactName: "하차 담당",
        phone1: "하차 전화1",
        phone2: "하차 전화2",
        requestedDay: 0,                  // 날짜 없는 하차 = 상차와 같은 날
        requestedTime: "13:01",
        distanceKm: 201,                  // 앞 정거장(상차지) → 여기
        geo: { x: 127.401207, y: 37.309733 },
        memo: "하차 메모",
    }],

    // ── 돈 ──
    money: {
        // income: 50000,                 // → 돈 줄에서 꺼내 쓴다(기사님 몫 = kind income 줄 · 받을 돈 = kind collect 줄) · 장부에는 기사님 몫 숫자 칸을 따로 적는다(정해짐)
        // collect: null,                 // → 위와 같다
        lines: [{ kind: "income", won: 50000, shown: "기사님 몫 글자" }, { kind: "consign", won: 70001, shown: "탁송료 글자" }],
        // 쌍둥이 요금(픽커 상세 최종 수익을 못 읽은 콜)은 돈 줄 하나(kind income · shown 에 목록 금액 글자) — 판정은 낮은 값 (`여덟계획_맞춤_03` 9번)
        feeRateText: "수수료 비율",
        paymentType: "신용",              // 결제 값 목록: 신용 · 선불 · 착불 · 카드 · 현금 · 선/착불 · 모름 — 화물24시 «선/착불» 은 목록의 값(관제웹 «💵 현장 현금» 안내가 이 값을 본다)
        paymentShown: "신용",             // 결제 화면 글자 그대로 — 새 배차망 «후불» 이면 paymentType «모름» · paymentShown «후불» · 화면에 없으면 둘 다 null
        billingType: "계산서",            // 증빙 값 목록: 계산서 · 인수증 · 무과세 · 모름
        billingShown: "계산서",           // 증빙 화면 글자 그대로
    },

    // ── 짐 ──
    load: {
        vehicleText: "다마스",
        sizeText: "크기",
        itemText: "물품",
        lines: [],                        // 짐 줄 갈래: weight · dimension · body · passenger · goods · care · unknown(뜻 모름)
    },
};

/**
 * 🔍 정거장 묶음 예 넷 — 실물 화면 글자로 위 `_09` 의 정거장(`listText` · `promiseText` · `distanceKm` · `geo`)을 채워 본 것 (한 예 = 한 콜)
 *
 * 공통: `geo` 는 서버가 붙이는 좌표라 예에서는 모두 null · 사람 이름 · 개인 전화는 옮기지 않는다 ·
 * `region` 은 같은 콜의 목록 줄이 있을 때만 그 읍 · 면 · 동 · 약속 날은 정한 규칙(날짜 없는 예약 = 오늘 · 날짜 없는 하차 = 상차와 같은 날 · 구간 = 끝 시각)
 *
 * 인성 — 위 `LIST_EXAMPLE_INSUNG` 과 같은 줄 ex_images/인성/이미지글자_인성.md 영상_0515.jpg(신규 목록):
 * «2.6/20.4 @낼11-12시/구(잘림) 14시전/인천/원(잘림) 다 34.6»
 * - 지금: 하차 «14시전» 은 출발지 쪽에 예약이 있어 버려지고, 거리 둘은 맨 위 `pickupDistance` · `deliveryDistance` 에 있다
 * - 묶음: 상차 `promiseText` «@낼11-12시» → 날 1 · 끝 시각 12:00 · 하차 `promiseText` «14시전» → 상차와 같은 날 1 · 14:00 ·
 *   거리 윗줄 2.6 = 내 자리 → 상차지 · 아랫줄 20.4 = 상차지 → 하차지 · 목록 줄뿐이라 상세 주소 · 연락처는 null · 동이 잘려(«구…» · «인천/원…») `region` 도 null
 */
const STOP_EXAMPLE_09_INSUNG = {
    pickupDetails: [{
        listText: "@낼11-12시/구…(잘림)",
        promiseText: "@낼11-12시",
        addressDetail: null,
        region: null,
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,
        requestedTime: "12:00",           // 구간 «11-12시» 의 끝 시각
        distanceKm: 2.6,
        geo: null,
        memo: null,
    }],
    dropoffDetails: [{
        listText: "14시전/인천/원…(잘림)",
        promiseText: "14시전",
        addressDetail: null,
        region: null,
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,                  // 날짜 없는 하차 = 상차와 같은 날
        requestedTime: "14:00",
        distanceKm: 20.4,
        geo: null,
        memo: null,
    }],
};

/**
 * 화물24시 — 같은 콜의 목록 줄과 상세 두 장 (위 `LIST_EXAMPLE_HWAMUL24` 와 같은 콜):
 * ex_images/화물24시/이미지글자_화물24시.md 17_화물정보_리스트.png 줄 1 «경기 군포 부곡동» · «서울 중구 을지로(뒤 잘림)» · «당상» · «5Km» · «당착» /
 * 18_화물상세정보_배차신청.png 상차지 칸 «경기 군포 부곡동» · «당상» · «5Km» · 하차지 칸 «서울 중구 을지로6가» · «당착» · «36Km»
 * - 지금: 목록 «5Km» 만 `pickupDistance` 에 담고 상세 «36Km» 는 안 읽는다 · 하차 날 «당착» 은 표시 글자에만 남는다 · 상세 주소는 안 읽는다
 * - 묶음: `listText` 는 목록 윗줄 원문 · `addressDetail` 은 상세 칸 주소 · `promiseText` «당상» → 날 0 · «당착» → 날 0 (시각은 화면에 없어 null) ·
 *   `distanceKm` 상차 5(내 자리 → 상차지) · 하차 36(상차지 → 하차지 — 목록에 없어 상세 값) ·
 *   `region` 상차는 목록 «부곡동» · 하차는 목록 글자가 «을지로» 에서 잘려 동 이름이 없어 null
 */
const STOP_EXAMPLE_09_HWAMUL24 = {
    pickupDetails: [{
        listText: "경기 군포 부곡동",
        promiseText: "당상",
        addressDetail: "경기 군포 부곡동",
        region: "부곡동",
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: null,
        distanceKm: 5,
        geo: null,
        memo: null,
    }],
    dropoffDetails: [{
        listText: "서울 중구 을지로…(잘림)",
        promiseText: "당착",
        addressDetail: "서울 중구 을지로6가",
        region: null,
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: null,
        distanceKm: 36,
        geo: null,
        memo: null,
    }],
};

/**
 * 카카오 픽커 — 위 `STOP_EXAMPLE_KAKAOPICKER` 와 같은 사진 ex_images/카카오픽커/이미지글자_카카오픽커.md 실물_2026/06_상세_마감시각_준비시간.jpeg(확정 전 상세):
 * 첫 정거장 «경기 성남시 중원구 은행2동» · «퓨전중화요리-궁» · «픽업 14.6km» · «17:04까지 픽업» /
 * 둘째 정거장 «경기 성남시 중원구 중앙동» · «새한맨션» · «배송 2.1km» · «17:18까지 배송»
 * - 지금: «픽업 14.6km» · «배송 2.1km» 는 읽지만 목록 줄 찾기에만 쓰고 칸에 안 넣는다 · 마감 시각도 칸에 안 넣는다
 * - 묶음: `promiseText` 는 마감 글자 그대로 · `distanceKm` 상차 14.6(내 자리 → 상차지) · 하차 2.1(상차지 → 하차지) ·
 *   같은 콜의 목록 줄 사진이 없어 `listText` · `region` 은 null · 픽업 장소 줄(«매장 직원에게 문의» · «오더번호 F2609011638JDU17»)은 콜 적요로
 */
const STOP_EXAMPLE_09_KAKAOPICKER = {
    pickupDetails: [{
        listText: null,
        promiseText: "17:04까지 픽업",
        addressDetail: "경기 성남시 중원구 은행2동",
        region: null,
        customerName: "퓨전중화요리-궁",
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: "17:04",
        distanceKm: 14.6,
        geo: null,
        memo: null,
    }],
    dropoffDetails: [{
        listText: null,
        promiseText: "17:18까지 배송",
        addressDetail: "경기 성남시 중원구 중앙동",
        region: null,
        customerName: "새한맨션",
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 0,
        requestedTime: "17:18",
        distanceKm: 2.1,
        geo: null,
        memo: null,
    }],
};

/**
 * 인성플렉스 (실물) — 같은 콜의 목록 줄과 상세 (위 `LIST_EXAMPLE_ISFLEX` · `STOP_EXAMPLE_ISFLEX` 와 같은 콜):
 * ex_images/인성플렉스/이미지글자_인성플렉스.md 02_목록.png 첫 줄 «24.3» · «@낼08:20/수원이의동» · «약 30.1km» · «10:20전/쌍림동» /
 * 10_상세_3 «출발 @경기 수원시영통구 @낼08:20/수원이의동» · «도착 서울 중구 10:20전/쌍림동» · «출발지까지 24.4km» · «약 31.0km»
 * - 지금: 하차 «10:20전» 은 `tagsText` 에 붙고, 상세 주소가 `pickup` · `dropoff` 를 덮는다
 * - 묶음: `promiseText` 상차 «@낼08:20» → 날 1 · 08:20 · 하차 «10:20전» → 상차와 같은 날 1 · 10:20 ·
 *   `distanceKm` 은 목록 값 먼저 — 상차 24.3 · 하차 30.1(상세 «24.4km» · «약 31.0km» 보다 먼저) · `region` 은 목록의 «이의동» · «쌍림동»
 */
const STOP_EXAMPLE_09_ISFLEX = {
    pickupDetails: [{
        listText: "@낼08:20/수원이의동",
        promiseText: "@낼08:20",
        addressDetail: "@경기 수원시영통구 @낼08:20/수원이의동",
        region: "이의동",
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,
        requestedTime: "08:20",
        distanceKm: 24.3,
        geo: null,
        memo: null,
    }],
    dropoffDetails: [{
        listText: "10:20전/쌍림동",
        promiseText: "10:20전",
        addressDetail: "서울 중구 10:20전/쌍림동",
        region: "쌍림동",
        customerName: null,
        department: null,
        contactName: null,
        phone1: null,
        phone2: null,
        requestedDay: 1,                  // 날짜 없는 하차 = 상차와 같은 날
        requestedTime: "10:20",
        distanceKm: 30.1,
        geo: null,
        memo: null,
    }],
};

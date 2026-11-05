/**
 * BaseCall 합친 안 8판 — 두 세션 리뷰와 기사님 답으로 키를 고친 것
 * 누가: 아직 아무 코드도 안 읽는다. 기사님이 끝 모습을 볼 때 본다
 * 언제: 콜 모양을 정하기 전
 * 어디서: sandbox 폴더의 후보 파일
 * 무엇을: 관심사로 나눈 기본 콜 타입 · 판정이 읽을 값 · 끝 모습 · 채운 예 · 지금 칸 대조표 · 시험
 * 어떻게: 타입과 예 값만 둔다. 지금 코드는 안 바꾼다
 * 왜: 배차망이 늘어도 칸의 뜻이 섞이지 않는 끝 모습을 먼저 보기 위해서다
 *
 * 정한 것
 * - 퀵 기사의 질문으로 나눈다: 어디서 어디로 · 얼마 · 뭘 싣나 · 언제까지 · 조건. 한 가지 일로 말할 수 없는 값은 묶지 않고 맨 위에 둔다. 페이지는 기록의 속성이다.
 * - 금액은 뜻별로 여러 줄이다. 뜻을 모르는 금액은 unknown 으로 두고 규칙이 안 읽는다.
 * - 상차 · 하차 약속은 같은 모양이다. 정시(at)와 마감(by)은 다른 칸이다.
 * - 뜻이 같은 칸은 지금 이름 그대로 쓴다. id · targetApp · dispatcherName · dispatcherPhone 은 맨 위에 두어 경로도 안 바꾼다.
 * - 기록(CallEvidence)은 콜과 따로 저장하고 소켓에 안 싣는다.
 * - 값은 «언제 생기나 · 콜 한 건의 값인가»로 나눈다. 잡기 전 콜 값은 BaseCall, 잡은 뒤 값은 NetworkProgress · CallSettlement, 콜 값이 아닌 것은 CALL_VALUES_OUTSIDE 표에 적는다.
 * - tripType · orderForm 은 지금 칸을 유지한다. 합치면 급송 판단이 옮겨 가고 저장 값이 달라질 수 있다.
 *
 * 잃는 것
 * - 같은 뜻의 값이 화면마다 다르면 칸에는 나중 값만 남는다. 앞 값은 기록의 changed 와 원문에서 본다.
 * - 읽는 코드의 경로가 바뀐다 (order.pickup → order.route.firstSeen.pickup 또는 order.route.pickup.addressDetail).
 *
 * 모름
 * - 픽커 «최종 수익» · 플렉스 «총 수입»이 수수료를 뺀 값인가, 화물24시 «수납금액»의 뜻, 플렉스 탁송 금액의 뜻, 화물24시 «-A» · «-D» · 동그라미 «A», 인성 «짐/» · «짐)» · «X@» · «[착]» (기사님도 모름)
 * - 픽커 짧은 오더 코드의 뜻, 플렉스 «픽업시간» · «배송시간»이 약속인지 실제 시각인지
 * - 인성 상세가 경유지를 어떻게 보여 주는가 (경유 콜 상세 캡처가 없다), 인성 «용/소»의 «/»가 차종과 짐 크기를 가르는가, 인성 의뢰지 전화 번호가 글자로 보이는가
 * - 화물24시 «수» 금액이 기사 몫인가 사무실에 넘기는 돈인가 — 수작업비는 아니다(14번 콜은 화주 쪽이 상하차를 해 주는데 수수료 20,000 이 붙었다). 그 전까지 판정은 지금 fare 그대로다, 선정산 · 후정산과 paymentType 의 대응 표 (기사님 말씀 «유추 가능», 표를 둘 자리는 아직 안 정했다)
 * - 화면에 적힌 거리가 직선인가 도로인가 (인성 적요 줄만 «직선»이라 적혀 있다)
 * - 같은 콜의 목록 · 상세 · 확정 글자가 한 벌로 있는 사례가 저장소에 없다
 *
 * 🔴 = 새 저장 칸, 원달앱 변경, 정의 표 변경, 또는 운행이 바뀌는 자리. 승인 없이 넣지 않는다
 */
// ━━ 리뷰: onedal-1e ━━ 7판
// - shortOrderNo 는 잡은 뒤 값이다 → NetworkProgress 로 옮김
// - partnerCall 은 제휴사로 읽힌다 → fromOtherOffice. 목록 값을 상세가 덮지 않게 적음
// - 인수증은 billingType, 선/착불만 paymentType → 그대로 넣음
// - 인성 «-» 뒤는 itemSize, basis → takeHomeBasis, pickedUpAt 추가, region 은 서버 원문, 표 밖 값을 갈 곳별로 가름 → 넣음
// - 서명은 CallStop 으로 → 안 넣음. 잡은 뒤 값이라 NetworkProgress 에 둔다 (shortOrderNo 를 옮긴 까닭과 같다)
// - 안 쓰는 mileage · requestedTime → 기사님 결정으로 뺌
// ━━ 리뷰: onedal-89 [e57856] ━━ 7판
// - 화물24시 «수»는 합계에 더해진다 → collectedFee 로 나눔. total 주석 고침
// - CallPaymentType 별칭 → 지우고 PaymentType 으로. 🔴 PAYMENT_TYPES 에 선/착불을 더해야 읽힌다
// - 화물24시 하차 시각 줄 · 내 콜 목록 줄 → 되살림
// - tagsText 를 읽는 곳 → 주석에 적음. 줄이면 동작이 바뀌어 안 줄임
// - 착불 콜의 받을 돈 · 현금 단추 → 운행 변경이라 이 파일에서 안 다룸
// ━━ 리뷰: onedal-89 [91c639] ━━ 7판
// - 기사님 답: 왕복 → time.returnPickup · 경유 → route.viaDropoffs · 폰) → itemDescription · 동승 → load.passengerCount · 선정산/후정산 → 거르는 단추 · 한차배송/대리 → 안 함
// - 1e 의 «270.0 · 341.3 근거 없음» → 위아래나뉜인성콜리스트.png 에 있어 견본을 그대로 둠
// - 근거를 못 찾아 안 넣음: 인수증 전표 번호 (전표 글자를 못 읽음)
// ━━ 리뷰: onedal-89 [e57856] ━━ 8판
// - 화물24시 정의 표에 billing 줄이 없어 인수증이 안 읽힌다 → 🔴 줄을 더해야 한다고 적음
// - 독차는 꼬리표에 안 실린다 (Hwamul24Parser.kt:97-103) → 견본을 날 배지로 고침. 코드를 대조하니 수 · 지 · 왕복 · 인수증 · 선/착불도 잡음 낱말이라 «버림»으로 고침
// - tagsText 를 읽는 곳이 더 있다 · 플렉스 목록 결제는 꼬리표에 섞인다 · 하차 날 배지는 꼬리표로 간다 → 넣음
// ━━ 리뷰: onedal-1e ━━ 8판
// - (재리뷰 e57856) networkCollect 는 «안 읽음» · 내 콜 쪽 꼬리표 견본 · «기사가 함께 받는» 문장 → 고침. 화물24시 fare 에 «수»가 들어 있는 것을 코드로 확인해 takeHomeWon 주석을 고침
// - (방향 재리뷰) 계획서 D3 · C5 · B4 끝 조건 → 계획서에서 고침. 옛 값은 지금처럼 두고 새 값은 BaseCall 에만 둔다. 픽커 itemSize 통줄 · matchType · 선/착불 자리를 고침
// - (큰 그림) 왕복 · 경유 «적요에서 채운다»는 단정이다 → 기사님 말씀과 «상세를 본 뒤 정한다»로 좁힘. E3 · E1-1 은 계획서에서 고침
// - 경유지 목록 글자를 addressDetail 에 넣으면 칸의 뜻을 어긴다 → 기사님 답대로 목록을 풀지 않고 상세 · 적요에서 채움
// - 처음 이름 extraFee 는 셈만 말한다 → collectedFee 로 고침
// - «빈나감»은 tripType 이 아니다 → tagsText. «왕복/» · 날짜 · 요일 · «경» · «카고,» · «용/소» · «@내일9시/급»(영상_2257) 줄 → 넣음
// - fromOtherOffice 의 읽는지와 desc 가 다르게 읽힌다 → 읽는지 칸은 지금 코드, desc 는 끝 모습이라고 적음
// ━━ 리뷰: onedal-89 [91c639] ━━ 8판
// - 이미지 영상_2257 을 직접 열어 «@내일9시/급»을 확인함. 표의 파일 줄 번호 · 칸 대조 · 타입 검사를 다시 봄
import type { TargetAppType } from '../../network/targetApps';
import type { ScreenPage } from '../../network/pageFields';
import type { CargoSpec } from '../../cargo/cargoSpec';
import type { VehicleType } from '../../cargo/vehicles';
import type { MyOrderStatus, OrderStatus } from '../callStatus';
import type {
    ApproxAddress, JudgmentSnapshot, LocationDetailInfo, OfficeOrder, QuickFoldFields, ServerCallFields,
} from '../orderShapes';
import type { BillingType, PaymentType } from '../paymentTypes';

/** 정거장 한 곳 — 기존 타입에 상하차 방법을 더하고, 읽는 곳이 없는 마일리지 · 요청 시각을 뺀다 */
export interface CallStop extends Omit<LocationDetailInfo, 'mileage' | 'requestedTime'> {
    loadingMethod?: string;      // 🔴 상하차 방법 글자 — 화물24시 «지»(지게차) · «수»(수작업). 자막에 «투» · «컨»도 나온다. 기사가 직접 내리는지 가른다
}

/** 어디서 어디로 가나 — 내비에 찍고 전화를 건다 */
export interface CallRoute {
    /**
     * 🔴 앱이 목록 글자에서 앞글자를 뗀 동 이름 — 인성 «@낼7시/초이동»은 «초이동». 같은 콜 찾기에 쓰고, 한 번 적으면 안 바꾼다.
     * 앞글자는 퀵사가 편한 대로 올려 일정하지 않아 풀지 않는다. 뜻은 상세 · 적요에서 읽고, 글자는 목록 기록과 원문에 남는다.
     * 지금은 원달앱이 상세 주소로 덮은 뒤 보내므로 원달앱이 따로 실어야 한다.
     */
    firstSeen?: { pickup?: string; dropoff?: string };
    /**
     * 상차지. addressDetail 은 내비에 찍을 주소(인성 팝업 «위치» · 픽커 사진 정거장 · 플렉스 상세).
     * 더 자세한 값이 오면 나중 값이 이긴다. 주소가 아닌 글(인성 내 콜의 상호)은 넣지 않는다.
     * region 은 지역 이름만 담는다. 목록 글자는 위 firstSeen 의 몫이다.
     */
    pickup: CallStop;
    dropoff: CallStop;            // 마지막 하차지 — 상차지와 같은 모양 (인성 «도착지상세» · 픽커 둘째 정거장)
    viaDropoffs?: CallStop[];     // 🔴 경유 콜에서 dropoff 전에 먼저 내리는 곳들의 주소, 차례대로. 목록 «풍납동>논현동»은 풀지 않는다. 경유인지는 상세 구분 칸으로 안다. 기사님 말씀대로 적요에 풀려 들어가고, 채우는 규칙은 경유 콜 상세를 본 뒤 정한다
    pickupDistance?: number;      // 내 위치 → 상차지 km, 화면 값 — 인성 거리 칸 윗줄 · 픽커 목록 «4.7km» (사진 «픽업 18.9km»는 지금 버린다)
    deliveryDistance?: number;    // 상차지 → 하차지 km, 화면 값 — 인성 거리 칸 아랫줄 · 플렉스 «약 2.3km» (픽커 «배송 9.7km»는 지금 버린다)
}

/** 금액 종류 — 규칙은 이 종류만 읽고 화면 이름은 읽지 않는다 */
export type MoneyKind =
    | 'total'        // 목록 요금 — 화물24시 목록. 선/착불 콜은 freight + collectedFee. 인성에는 이 값이 화면에 없다
    | 'income'       // 기사 몫으로 적힌 값 — 인성 «요금» · «실운임»(수수료를 뺀 값) · 픽커 «최종 수익» · 플렉스 «수입» · «총 수입». 수수료 앞뒤는 정의 표 줄이 말한다
    | 'collect'      // 현장에서 받을 돈 — 인성 «고객에게 받을 금액»(수수료 앞 금액) · 플렉스 «받으실 현금»
    | 'fee'          // 기사 몫에서 빠지는 수수료 — 인성 «23%» · 화물24시 식
    | 'collectedFee'     // 🔴 운송료에 더해 목록 요금이 되는 수수료 — 화물24시 알약 «수» · «수수료 20,000원». 기사 몫인지 사무실에 넘기는지 모른다. 목록 요금 기준으로 fee 와 부호가 반대다
    | 'insurance'    // 산재보험료 — 화물24시 «[산재보험료(차주부담액): 260원]». 콜 한 건 값만. 기간 합계는 안 넣는다
    | 'consign'      // 탁송료 — 인성 «탁송료» · 플렉스 «탁송 금액»(뜻 확인 필요). 판정의 통행료 tollKrw 와 다른 돈이다
    | 'freight'      // 운송료 — 화물24시 상세 · 알약 «운»
    | 'vat'          // 부가세 — 화물24시 상세
    | 'deliveryFee'  // 배송비 — 픽커 상세
    | 'promo'        // 프로모션 — 픽커 상세
    | 'unknown';     // 뜻을 아직 모르는 금액 — 화물24시 «수납금액»(수수료를 뺀 값에 가깝지만 확인한 사례가 한 건뿐). 규칙은 안 읽는다

/** 화면의 금액 한 줄 */
export interface MoneyLine {
    kind: MoneyKind;
    won?: number;     // 금액(원)
    rate?: string;    // 비율이나 식의 글자 — «23%», «(운송료+부가세) x1.298%»
    label?: string;   // 화면에 적힌 이름 — 사람이 출처를 확인할 때 본다
}

/** 결제 칸의 값 — 옛 값에 화물24시 «선/착불»을 더한다. 옛 PAYMENT_TYPES 는 그대로 두어 서버 읽기와 화면이 안 바뀐다 */
export type CallPaymentType = PaymentType | '선/착불';

/** 얼마 버나, 어떻게 받나 — 합치거나 빼지 않고 화면의 금액을 줄로 둔다 */
export interface CallMoney {
    lines: MoneyLine[];          // 같은 종류가 다시 오면 나중 값이 이긴다
    paymentType?: CallPaymentType;  // 언제 어떻게 받나: 신용 · 선불 · 착불 · 카드 · 현금 · 선/착불 — 인성 괄호 · 화물24시 결제방법 · 픽커 «착불» 네모 · 플렉스 테두리. 화물24시 «인수증» 콜은 이 칸이 빈다
    billingType?: BillingType;   // 증빙 방식: 계산서 · 인수증 · 무과세 — 인성 둘째 괄호 · 화물24시 결제방법 «인수증». 화물24시 플러그인이 결제방법 글자를 뜻대로 나눈다
}

/** 뭘 싣나 — 배차망이 말한 그대로 둔다. 실리는지는 BaseCallFacts.load 가 답한다 */
export interface CallLoad {
    vehicleType?: string;        // 콜 차종 낱말 그대로 — «다마스», «1t», «2.5톤/윙», 픽커 «승». 이 짐을 옮기라는 수단이고 내 차와 다른 개념이다
    itemSize?: string | null;    // 크기 낱말 — 픽커 목록 «소형». 지금 픽커 사진은 «소형 세 변의 합 …» 줄 통째를 옛 itemSize 에 넣는다. 그 줄은 itemDescription 으로 가고 옛 값은 바꾸는 함수가 다시 만든다 · 플렉스 «대박스»(안내 영상 · 안 읽음) · 인성 «다마스-다마»의 «다마»
    itemDescription?: string;    // 짐 글 — 인성 «박스 1개» · 앞글자 «폰)»(핸드폰), 픽커 «소형 세 변의 합 100cm ∙ 5kg 이하», 플렉스 적요 «박스1개»
    weightKg?: number;           // 🔴 무게 — 픽커 «5kg 이하» · 화물24시 적재중량 «3.85톤»
    sizeCm?: number;             // 🔴 세 변의 합 — 픽커 «100cm»
    passengerCount?: number;     // 🔴 화주가 함께 타는 사람 수 — 인성 «2분동승+» · «1인동승»
    careTags?: string[];         // 🔴 취급 주의 글자 그대로 — 픽커 «깨지기 쉬워요» · «신선식품이에요». handling 은 다른 뜻으로 쓰이는 낱말이라 피한다
}

/** 약속 한 건 — 상차와 하차가 같은 모양이다 */
export interface CallPromise {
    text?: string;               // 화면 글자 그대로 — 인성 «낼7시/» · 픽커 «내일 14:00 픽업예약» · «18:28까지 배송»
    reserved?: boolean | null;   // 예약 표시가 있나. 화물24시 «당상»은 날 표시라 예약이 아니다
    day?: number | null;         // 며칠 뒤인가 (0 = 오늘). null = 날 모름
    at?: string | null;          // 그 시각 HH:MM — 글자에 아래 두 칸의 낱말이 없으면 여기. 플렉스 «10시도착»
    after?: string | null;       // 🔴 그 시각 이후 HH:MM — 글자에 «이후» · «후» · «부터», 또는 A-B 의 A. 화물24시 «09시 이후 상차» · 인성 «낼11-12시/»
    by?: string | null;          // 🔴 그 시각까지 HH:MM — 글자에 «까지» · «전», 또는 A-B 의 B. 픽커 «15:00까지 픽업» · 플렉스 «16:00까지 배송완료»
}

/** 언제까지 가야 하나 */
export interface CallTime {
    pickup?: CallPromise;        // 상차 약속
    dropoff?: CallPromise;       // 🔴 하차 약속 — 인성 «낼8/», 픽커 «18:28까지 배송». 지금은 칸이 없어 버린다
    returnPickup?: CallPromise;  // 🔴 왕복 콜에서 하차지에서 다시 실어 출발지로 돌아가는 약속 — 인성 «왕복/낼7시/송파»의 «낼7시». 목록은 풀지 않는다. 왕복인지는 상세 구분 칸으로 안다. 기사님 말씀대로 약속은 적요에 풀려 들어가고, 채우는 규칙은 왕복 콜 상세를 본 뒤 정한다
    remaining?: string;          // 🔴 남은 시간 글자 — 픽커 «배송 31분 남음 준비 17분 포함» · «36분 지연»
    postTime?: string;           // 콜을 올린 시각 — 화물24시 «등록시간». 인성에는 이 칸이 없다 (지금 코드가 약속 시각을 넣는다)
}

/** 조건은 뭔가, 가서 뭘 해야 하나 */
export interface CallJob {
    tripType?: string;           // 편도 · 왕복 · 경유 — 인성 «구분» · 줄 바탕색
    orderForm?: string;          // 보통 · 급송 — 인성 «형태». 지금 인성만 실린다. 급송 판단(dispatchEngine.ts:158 · 576 · 771)이 읽는다
    /**
     * 제 칸이 없는 꼬리표 글자 그대로 — 픽커 «퀵 비즈», 플렉스 «과적», 화물24시 날 배지 «당착». 플렉스 목록은 결제 글자도 여기 섞인다.
     * 원달앱의 쌍둥이 키(KakaoPickerParser.kt:630 · ListSightings.kt:50) · 픽커 퀵 · 도보 판단(KakaoPickerParser.kt:709)과 관제웹 추정 요금(JudgmentSeat.tsx:153 · twinFare.ts)이 이 글자를 읽고, 사진 판독(PickerDetailOcrParser.kt:130 · 142)이 표식을 쓴다. 🔴 줄이면 동작이 바뀐다
     */
    tagsText?: string | null;
    detailMemo?: string;         // 적요 · 유의사항 원문 — 인성 적요 팝업 · 픽커 «유의사항» · 플렉스 «적요상세»
}

/**
 * 🎯 기본 콜 — 콜 한 건을 퀵 기사가 묻는 차례대로 나눈 것
 * 배차망이 준 값만 담고, 어떤 배차망이든 이 칸을 채운다. 배차망 이름이 붙은 칸은 없다.
 * 원달앱이 찾은 좌표 · 서버의 지도 경로선 · 판정 · 우리 쪽 콜 상태는 배차망이 주지 않으므로 여기 없다.
 */
export interface BaseCall {
    id: string;                  // 🔖 콜 번호 — 원달앱이 붙인다
    targetApp: TargetAppType;    // 🏷️ 어느 배차망인가 — 원달앱이 보고 때 알린다
    dispatcherName?: string;     // ☎️ 콜을 올린 사무실 — 인성 상세 머리 줄. 다른 배차망은 비어 있다
    dispatcherPhone?: string;    // ☎️ 그 사무실 전화 — 인성 상세 머리 줄
    requesterName?: string;      // 🔴 콜을 맡긴 사람이나 상호 — 인성 의뢰지 줄 «쑥쑥 TEST». «***» 은 빈 값
    fromOtherOffice?: boolean;   // 🔴 공유콜인가 — 인성 · 플렉스 목록 맨 앞 «@». 목록 값을 상세가 덮지 않는다. 합짐 여부 isShared 와 다른 값이다
    orderNo?: string;            // 🔴 배차망 오더번호 — 화물24시 «화물번호:3-9483-2159» · 픽커 «F2609011638JDU17». 지금은 안 읽는다
    clientOrderNo?: string;      // 🔴 가게 · 제휴사 주문번호 — 픽커 «요기요 주문번호 : 903»
    stage?: string;              // 배차망이 적은 진행 글자 — 인성 «상태 : 신규», 픽커 «픽업 준비 14분 남음» (지금 receiptStatus). 우리 쪽 콜 상태와 다르다
    route: CallRoute;            // 🗺️ 어디서 어디로 가나 — 상차지 · 하차지 · 거리
    money: CallMoney;            // 💰 얼마 버나, 어떻게 받나 — 금액 줄 · 결제 · 계산서
    load: CallLoad;              // 📏 뭘 싣나 — 차종 · 크기 · 짐 글
    time: CallTime;              // ⏰ 언제까지 가야 하나 — 상차 · 하차 약속 · 남은 시간
    job: CallJob;                // 📝 조건은 뭔가 — 편도 · 급송 · 꼬리표 · 적요
}

/** 원달앱 보고의 사정 — 기사의 질문이 아니다 */
export interface CallReport {
    matchType?: string;                 // 누가 잡았나 AUTO · MANUAL — 보고 봉투 값이라 BaseCall 밖이다 (원달앱)
    type: string;                       // 보고 종류 NEW_ORDER · AUTO_CLICK · MANUAL_CLICK. EventType 밖의 값이 있어 string (원달앱)
    verdict?: string | null;            // 원달앱이 목록에서 내린 판정 (원달앱)
    capturedMode?: string | null;       // 그때 돌던 모드 AUTO · ALARM · MANUAL · SIMULATION (서버)
    openedBy?: 'APP' | 'DRIVER' | null; // 상세를 누가 열었나 (원달앱이 알리고 서버가 적는다)
    isSimulated?: boolean;              // 가상 체험 콜인가 (서버)
    /**
     * 가장 늦은 상세 원문. 서버가 상세 칸을 채우고(detail.ts:106) 제외어를 찾는(OrderEvaluator.ts:647) 재료라 아직 뺄 수 없다.
     * 화물24시 화물 글을 콜에 싣고 결제 글자 전체를 담을 자리가 생기면 CallEvidence 만 남긴다. 그때까지는 지금처럼 관제웹에도 나간다.
     */
    rawText?: string;
}

/** 좌표 — 배차망이 주지 않는다. 원달앱 명부나 서버 지오코딩이 찾는다 */
export interface CallCoordinates {
    pickupX?: number;   // 상차지 X
    pickupY?: number;   // 상차지 Y
    dropoffX?: number;  // 하차지 X
    dropoffY?: number;  // 하차지 Y
}

/** 화면을 한 번 읽은 기록 */
export interface EvidenceLine {
    at: string;                  // 읽은 시각
    screen?: ScreenPage | null;  // 어느 화면인가. 페이지가 없는 배차망은 비운다
    read?: 'text' | 'photo';     // 글자로 읽었나 사진 판독인가
    rawText?: string;            // 그 화면 글자 통째
    changed?: Array<{ field: string; from: string | null; to: string | null }>;  // 이번에 값이 바뀐 칸 — 같은 값이면 비운다
}

/** 🔴 기록 — 콜 값과 다른 JSON 칸에 저장하고 소켓에 안 싣는다. 목록 글자 통째도 여기 남는다. 읽을 때마다 한 줄 더하고 덮지 않는다. 목록 줄 역사는 지금처럼 intel 표가 갖는다 */
export interface CallEvidence {
    seen: EvidenceLine[];
}

/** 잡은 뒤 진행 — 콜을 잡은 뒤 배차망 화면에 적힌 진행 사실. BaseCall 밖이고 🔴 키만 정했다. 저장 칸은 없다 */
export interface NetworkProgress {
    shortOrderNo?: string;       // 짧은 오더 코드 — 픽커 왼쪽 위 «DJYZ914». 잡은 뒤에만 보이고 같은 콜의 F번호와 다르다
    acceptedAt?: string;         // 잡은 시각 — 화물24시 «배차시간». ackedAt 은 폰이 결재를 실행한 시각이라 다르다
    pickedUpAt?: string;         // 배차망이 적은 픽업 시각 — 플렉스 «픽업시간 09:38»
    pickupSigned?: boolean;      // 상차 서명을 마쳤나 — 화물24시 «서명완료»
    dropoffSigned?: boolean;     // 하차 서명을 마쳤나
    cancelable?: boolean | null; // 지금 취소할 수 있나 — 픽커 «배정 취소 불가» · 인성 «1분 안에 취소»(자막). 잡은 뒤에만 보이고 시간이 지나면 바뀐다
    deliveredAt?: string;        // 배차망이 적은 완료 시각 — 화물24시 «하차시간» · 픽커 «완료 15:23» · 플렉스 «배송시간 15:40». 우리 쪽 completedAt 과 따로 둔다
    canceledAt?: string;         // 배차망이 적은 취소 시각 — 픽커 «취소 14:27»
    proofRule?: string;          // 사진 인증 조건 — 픽커 «물품과 장소가 함께 보이도록 촬영해주세요»
}

/** 돈 받기 — 콜을 잡은 뒤 돈을 받는 과정. BaseCall 밖이고 orderId 로 콜에 붙는다. 🔴 앞 세 칸만 지금 있는 칸이고 나머지는 키만 정했다. 옛 SettlementInfo 와 orders.dueDate 는 쓰는 코드가 없어 이어받지 않는다 */
export interface CallSettlement {
    status?: '미정산' | '수령' | '미수금';  // 우리 쪽 수금 상태 — orders.settlementStatus 의 지금 값 그대로. 착불이 아닌 콜은 미정산에 머문다
    unpaidWon?: number;          // 못 받은 돈 — orders.unpaidAmount
    settledAt?: string;          // 받은 시각 — orders.settledAt
    networkCollect?: string;     // 배차망 수금 글자 — 화물24시 «미수금» · «수금»
    collectConfirmedAt?: string; // 수금확인일 — 화물24시
    depositAccount?: string;     // 입금계좌 — 화물24시
    receipt?: { status?: string; count?: number };  // 인수증 전송 — 화물24시 «미전송» · «인수증(2)»
    taxInvoice?: {               // 세금계산서 — 화물24시
        status?: string;         // «미발행» · «발행완료»
        writtenAt?: string;      // 작성일자
        issuedAt?: string;       // 발행일
        approvalNo?: string;     // 승인번호
        supplyWon?: number;      // 공급가
        vatWon?: number;         // 부가세 — 발행한 금액이다. 콜 값 money 의 vat 와 따로 둔다
        amendReason?: string;    // 수정 사유
    };
    earned?: { won?: number; text?: string; at?: string };  // 콜 한 건의 적립 — 플렉스 «9,000원 적립» · 픽커 포인트 내역. 나간 돈은 음수 — 플렉스 «현금 결제 수행 −1,000»
}

/** 판정 · 화면이 읽는 답 — 저장하지 않고 BaseCall 에서 뽑는다. 판정 코드는 배차망을 몰라도 된다 */
export interface BaseCallFacts {
    listKey: string | null;      // 같은 콜 찾기 글자 — route.firstSeen. detail.ts:142 자리
    navAddress: { pickup: string | null; dropoff: string | null };  // 내비에 찍을 주소 — addressDetail, 없으면 firstSeen. geocodeTargetOf 자리
    phone: { pickup?: string; dropoff?: string };  // 걸 번호 — 기존 stopPhoneOf
    money: {
        grossWon: number | null;     // 수수료 전 합계. 모르면 null
        takeHomeWon: number | null;  // 🔴 손에 오는 돈. 처음에는 지금 fare 와 같은 값을 돌려 판정을 안 바꾼다. 인성 요금은 이미 수수료 뒤라 다시 빼지 않는다. 화물24시 fare 는 목록 요금이라 collectedFee 가 들어 있다. 🔴 뺄지는 그 돈의 뜻을 안 뒤 정한다. criteria.ts:125 자리
        collectWon: number | null;   // 현장에서 받을 돈. 화물24시 선/착불 콜은 목록 요금(운송료 + collectedFee)으로 본다
        takeHomeBasis: 'beforeFee' | 'afterFee' | 'unknown';  // takeHomeWon 이 수수료 앞인가 뒤인가 — 정의 표 feeBasis. 비어 있으면 unknown
    };
    load: {
        vehicle: VehicleType | null; // 우리 차종으로 맞춘 값
        spec: CargoSpec | null;      // 단위 · 수량 · 취급 — stepSeeder.ts:98 순서
        known: boolean;              // 🔴 짐을 아는가. «못 잼»으로 올리는 것은 별도 승인. 지금은 차종 용량으로 짐작한다(helpers.ts:63)
        fits: boolean | null;        // 🔴 내 차에 실리나. 처음에는 지금 계산과 같게 둔다
    };
    time: {
        pickupDueMs: number | null;  // 언제까지 상차 — timing.ts:750 자리
        reserved: boolean;
    };
    express: boolean;                // 급송 — 지금 규칙 그대로 orderForm === '급송'. 서버 값 isExpress 는 이 값을 저장한 것이다
}

/** 🔴 정의 표(networkPages.<배차망>.ts)의 줄에 더할 열 — 콜이 아니라 배차망 사실이다 */
export interface NetworkLineRules {
    callPath?: string;   // 이 화면 칸이 채우는 콜 칸 — 'route.pickup.addressDetail', 'money.lines:total'
    required?: boolean;  // 이 화면에서 필수인가. 지금 코드의 목록 필수는 요금 · 상차 · 하차 · 상차지거리. 정하는 것은 기사님이다
    feeBasis?: 'beforeFee' | 'afterFee' | 'unknown';   // 이 금액 줄이 수수료 앞인가 뒤인가. 지금 표에는 없다
    distanceBasis?: 'straight' | 'road' | 'unknown';   // 이 거리가 직선인가 도로인가
}

// 끝 모습 — 지금 타입이 이렇게 이어진다. OfficeOrder · DetailedOfficeOrder 이름은 없어진다.
// SimplifiedOfficeOrder 는 원달앱이 새 모양을 보낼 때까지 전송 모양으로 남는다 (appOrderShape 검사의 기준이다).
type ServerSide = BaseCall & CallReport & CallCoordinates & ServerCallFields;
/** 끝 모습의 심사 중 콜 — BaseCall 과 보고 값 · 좌표 · 서버 값을 합친다. 서버 메모리에만 있고, 아직 아무도 안 쓴다 */
export type NextPendingOrder = ServerSide & ApproxAddress & QuickFoldFields & { status: OrderStatus; judgeUntil?: number };
/** 끝 모습의 내 콜 — 기사님이 KEEP 해 내 것이 된 콜. 아직 아무도 안 쓴다 */
export type NextMyOrder = ServerSide & {
    status: MyOrderStatus; reservedFor?: string; completedAt?: string | null; terminatedAt?: string | null;
    judgment?: JudgmentSnapshot; progress?: NetworkProgress; settlement?: CallSettlement;
};
/** 끝 모습의 관제웹 콜 — 심사 중 콜과 내 콜을 한 모양으로 받는다. 아직 아무도 안 쓴다 */
export type NextSecuredOrder = ServerSide & ApproxAddress & QuickFoldFields & {
    status: OrderStatus; completedAt?: string | null; terminatedAt?: string | null; judgeUntil?: number;
    judgment?: JudgmentSnapshot; progress?: NetworkProgress; settlement?: CallSettlement;
};
// 🔴 옮기는 동안: 평평한 칸을 BaseCall 에서 뽑아 주는 함수를 두고 읽는 코드를 묶음별로 옮긴다.
// 🔴 합치기: evolveOrder 는 얕은 병합이라 route · money 를 통째로 지운다. 칸별로 합치고 금액은 종류별로 합치는 코드와 검사가 필요하다.
// 🔴 저장: orders 표에 BaseCall 과 기록을 담을 JSON 글자 칸을 더한다 (routePolyline 이 같은 방식).

/** 채운 예 — pageReadCases.json 인성 «고양퀵서비스» 팝업 셋을 모은 한 콜. 시뮬레이터 글자이고 목록 줄이 없는 사례다 */
export const insungExample: BaseCall = {
    id: 'ex-insung-1',
    targetApp: 'insung',
    dispatcherName: '고양퀵서비스',    // 머리 줄
    dispatcherPhone: '031-932-7722',  // 머리 줄
    stage: '신규',                     // «상태 : 신규»
    route: {
        pickup: { customerName: '가나상사', addressDetail: '경기 광주시 경안동 1-2', department: '물류팀', contactName: '김철수', phone1: '010-1234-5678', phone2: '031-000-0000' },  // [출발지상세]
        dropoff: { customerName: '다라상회', addressDetail: '서울 용산구 한남동 12', phone1: '010-9999-8888' },  // [도착지상세]
    },
    money: {
        lines: [
            { kind: 'income', won: 50000, label: '요금' },  // «요금 : 50,000(카드)(계산서)». 수수료를 뺀 값이다
            { kind: 'fee', rate: '23%', label: '수수료' },  // «수수료 : 23%». 탁송료는 빈 칸이라 줄이 없다
        ],
        paymentType: '카드',
        billingType: '계산서',
    },
    load: { vehicleType: '다마스', itemDescription: '박스 1개' },  // «차량 : 다마스» · «물품 : 박스 1개»
    time: {},  // 예약 앞글자가 없다. «03:57 상차»는 적요 글이다
    job: { tripType: '편도', orderForm: '보통', detailMemo: '까대기 있음 직접운반 대기 30분' },  // 구분 · 형태 · 적요 팝업
};

/** 위 콜의 기록 — 사례 원문 그대로 */
export const insungEvidence: CallEvidence = {
    seen: [{ at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "고양퀵서비스-031-932-7722\n전표\n상태 : 신규\n물품 : 박스 1개\n차량 : 다마스\n탁송료 :\n수수료 : 23%\n요금 : 50,000(카드)(계산서)\n구분 : 편도\n형태 : 보통\n적요상세 *카고 입니다. 세금계산서필 03:57 상차.\n[적요상세/정보]\n적요 상세\n적요 내용\n까대기 있음 직접운반\n대기 30분\n닫기\n[출발지상세]\n고객 가나상사\n위치: 경기 광주시 경안동 1-2\n부서 물류팀\n담당 김철수\n전화1 010-1234-5678\n전화2 031-000-0000\n[도착지상세]\n고객\n다라상회\n위치\n서울 용산구 한남동 12\n전화1 010-9999-8888" }],
};

/** 채운 예 — pageReadCases.json 픽커 «신촌동 → 자양2동» 한 콜. 실물이고 목록 줄이 없는 사례다 */
export const pickerExample: BaseCall = {
    id: 'ex-picker-1',
    targetApp: 'kakaopicker',
    route: {
        pickup: { addressDetail: '경기 성남시 수정구 신촌동' },  // 사진 첫 정거장
        dropoff: { addressDetail: '서울 광진구 자양2동', customerName: 'NC이스트폴' },  // 사진 둘째 정거장 · 회색 상호
        pickupDistance: 18.9,    // «픽업 18.9km». 지금은 버리는 값을 끝 모습에서 담는다고 가정한 것이다
        deliveryDistance: 9.7,   // «배송 9.7km». 지금은 버리는 값을 끝 모습에서 담는다고 가정한 것이다
    },
    money: {
        lines: [
            { kind: 'income', won: 10830, label: '최종 수익' },  // 수수료 앞인지 뒤인지 모름
            { kind: 'deliveryFee', won: 9730, label: '배송비' },
            { kind: 'promo', won: 1100, label: '프로모션' },     // 10,830 = 9,730 + 1,100
        ],
    },
    load: { itemSize: '소형', itemDescription: '소형 세 변의 합 100cm ∙ 5kg 이하', sizeCm: 100, weightKg: 5 },  // 물품 정보. 이 글에서 크기 · 숫자를 뽑는 규칙이 있다고 가정한 것이다(지금 코드에는 없다)
    time: { dropoff: { text: '18:28까지 배송', by: '18:28' } },  // 사진 오른쪽 회색 글자
    job: { tagsText: '퀵 비즈' },  // 사진 첫 줄
};

/** 위 콜의 기록 — 사례 원문 그대로. 글자와 사진이 한 줄씩 온다 */
export const pickerEvidence: CallEvidence = {
    seen: [
        { at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "픽업지 경기 성남시 수정구 신촌동 물품 정보 소형 세 변의 합 100cm ∙ 5kg 이하 최종 수익 10,830 10,830 배송비 9,730P 9,730P 프로모션 1,100P 1,100P 넘기기 수락하기" },
        { at: '읽은 시각', screen: 'newCall', read: 'photo', rawText: "[사진]\n퀵 비즈\n경기 성남시 수정구 신촌동 픽업 18.9km\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송\nNC이스트폴\n물품 정보 소헝 세 변의 합 100cm · 5kg 이하\n최종 수익 10,830", changed: [{ field: 'time.dropoff.by', from: null, to: '18:28' }] },
    ],
};

/** 채운 예 — ex_images/인성플렉스/08_상세.xml 한 콜의 리더 값. 실물이고 목록 줄이 없는 사례다 */
export const isflexExample: BaseCall = {
    id: 'ex-isflex-1',
    targetApp: 'isflex',
    route: {
        pickup: { addressDetail: '서울 강남구 역삼동' },  // tv_pick_up_point «@서울 강남구 @역삼동» 에서 «@»를 뗀 값 (IsflexAddress.clean)
        dropoff: { addressDetail: '서울 강남구 대치동' },  // tv_dest_point
        pickupDistance: 26.7,    // tv_pick_up_distance «26.7km»
        deliveryDistance: 2.3,   // tv_distance «약 2.3km»
    },
    money: {
        lines: [{ kind: 'income', won: 8500, label: '총 수입' }],  // tv_total_revenue «8,500원». 수수료 앞인지 뒤인지 모름
        paymentType: '착불',  // tv_cost_type. 상세에서 서버가 채운다
    },
    load: { vehicleType: '오토' },  // tv_delivery_type
    time: {},  // 이 콜은 예약이 없다
    job: { detailMemo: '1박스 3층 계단물건 있음' },  // tv_caution
};

/** 위 콜의 기록 — xml 의 리더 값을 차례대로 이은 것 */
export const isflexEvidence: CallEvidence = {
    seen: [{ at: '읽은 시각', screen: 'newCall', read: 'text', rawText: "@역삼동 → 대치동\n출발지까지\n26.7km\n오토\n출발\n@서울 강남구 @역삼동\n약 2.3km\n도착\n서울 강남구 대치동\n적요상세\n1박스 3층 계단물건 있음\n착불\n총 수입\n8,500원\n닫기\n8,500원 \n수행하기" }],
};

/** 지금 OfficeOrder 칸이 가는 곳 — 칸이 빠지면 타입 검사가 잡는다 */
export const officeOrderFieldMap: Record<keyof OfficeOrder, string> = {
    id: 'id (그대로)',
    type: 'CallReport.type',
    timestamp: 'CallEvidence.seen[].at',
    rawText: 'CallReport.rawText (가장 늦은 상세) · CallEvidence.seen[].rawText (전부)',
    verdict: 'CallReport.verdict',
    isSimulated: 'CallReport.isSimulated',
    pickup: 'route.firstSeen.pickup (목록 동 이름) · route.pickup.addressDetail (전체 주소)',
    dropoff: 'route.firstSeen.dropoff (목록 동 이름) · route.dropoff.addressDetail (전체 주소)',
    pickupX: 'CallCoordinates (그대로)',
    pickupY: 'CallCoordinates (그대로)',
    dropoffX: 'CallCoordinates (그대로)',
    dropoffY: 'CallCoordinates (그대로)',
    pickupDistance: 'route.pickupDistance',
    deliveryDistance: 'route.deliveryDistance',
    fare: 'money.lines (total 또는 income) 🔴 정의 표 요금 줄이 종류를 정한다',
    vehicleType: 'load.vehicleType',
    itemSize: 'load.itemSize',
    tagsText: 'job.tagsText',
    postTime: 'time.postTime',
    scheduleText: 'time.pickup.text',
    reserved: 'time.pickup.reserved',
    reservedDay: 'time.pickup.day',
    reservedAt: 'time.pickup.at',
    dispatcherName: 'dispatcherName (그대로)',
    dispatcherPhone: 'dispatcherPhone (그대로)',
    receiptStatus: 'stage',
    itemDescription: 'load.itemDescription',
    commissionRate: 'money.lines (fee)',
    tollFare: 'money.lines (consign)',
    paymentType: 'money.paymentType',
    billingType: 'money.billingType',
    tripType: 'job.tripType',
    orderForm: 'job.orderForm',
    detailMemo: 'job.detailMemo',
    pickupDetails: 'route.pickup (배열 → 하나. 지금 읽는 곳은 [0] 뿐. 읽는 곳 없는 mileage · requestedTime 은 안 옮긴다)',
    dropoffDetails: 'route.dropoff (배열 → 하나. 읽는 곳 없는 mileage · requestedTime 은 안 옮긴다)',
    companyName: '갈 곳 없음 — 채우는 곳이 없다',
    pickupTime: '갈 곳 없음 — 시험 파서만 채운다',
    targetApp: 'targetApp (그대로)',
    capturedVia: '갈 곳 없음 — 원달앱이 안 보낸다',
    capturedMode: 'CallReport.capturedMode',
    openedBy: 'CallReport.openedBy',
};

const STAYS_OUTSIDE = '그대로 BaseCall 밖 — 서버 값';
/** 지금 ServerCallFields 칸이 가는 곳 — 전부 서버가 만든 값이라 그대로 둔다. isPreview 는 확정 때 지우는 결재 상태다(dispatchEngine.ts:539) */
export const serverFieldMap: Record<keyof ServerCallFields, string> = {
    capturedDeviceId: STAYS_OUTSIDE, capturedAt: STAYS_OUTSIDE, goalCity: STAYS_OUTSIDE, isPreview: STAYS_OUTSIDE,
    kakaoCalculatedFare: STAYS_OUTSIDE, kakaoTimeExt: STAYS_OUTSIDE, routePolyline: STAYS_OUTSIDE,
    totalDistanceKm: STAYS_OUTSIDE, totalDurationMin: STAYS_OUTSIDE, kakaoSoloDistanceKm: STAYS_OUTSIDE,
    kakaoSoloDurationMin: STAYS_OUTSIDE, approachDurationMin: STAYS_OUTSIDE, osrmError: STAYS_OUTSIDE,
    sectionEtas: STAYS_OUTSIDE, sectionDriveMin: STAYS_OUTSIDE, sectionStops: STAYS_OUTSIDE, sectionEnds: STAYS_OUTSIDE,
    routeComputedAt: STAYS_OUTSIDE, arrivedPickupAt: STAYS_OUTSIDE, arrivedDropoffAt: STAYS_OUTSIDE,
    pickupEta: STAYS_OUTSIDE, dropoffEta: STAYS_OUTSIDE, rejectionReasons: STAYS_OUTSIDE, approvalReasons: STAYS_OUTSIDE,
    distanceKm: STAYS_OUTSIDE, isShared: STAYS_OUTSIDE, isExpress: STAYS_OUTSIDE,
};

/** 시험 — 새 배차망이 이것을 가져오면 틀의 무엇이 바뀌나 */
export const newNetworkTests = {
    '페이지가 없는 배차망': '틀 안 바뀜. 같은 칸에 넣고 기록 한 줄(screen 비움). 정의 표의 페이지 모양은 따로 손봐야 한다',
    '익일 오전': '칸 안 늘어남. time.pickup 의 text · day 1. 시각을 모르면 at 을 비운다. 낱말 «익일»을 읽는 규칙만 더한다',
    '02~06시 사이': '칸 안 늘어남 (after 02:00 · by 06:00). 🔴 시간 계산 · 판정 · 화면이 구간을 읽는 것은 별도 승인',
    '기본료 + 거리료': '기본료는 freight. 거리료는 뜻을 아는 값이니 MoneyKind 에 값 하나를 더하고 합계 규칙에 한 줄 더한다. 칸은 안 늘어난다',
    '수수료를 뺀 금액만': '칸 안 늘어남. income 줄 + 정의 표 feeBasis afterFee. 🔴 판정이 takeHomeWon 을 읽게 바꾸는 것은 별도 승인',
    '짐을 kg 로만': '칸 안 늘어남 (weightKg). 🔴 kg 을 라면박스로 바꾸는 규칙이 없어 load 규칙을 고친다. 기준은 기사님 몫',
};

/** 타입들이 BaseCall 과 어떻게 이어지나 — 페이지 위쪽에 보인다. 들여쓴 타입은 윗줄 타입 안에 있다. 설명은 그 타입의 주석에서 읽는다 */
export const BASE_CALL_PARTS = {
    top: true,
    spanFirst: true,
    title: '타입 지도',
    columns: [{ key: 'group', label: '어디에 있나' }, { key: 'type', label: '타입' }, { key: 'about', label: '설명' }],
    rows: [
        { group: 'BaseCall', type: 'BaseCall', depth: 0 },
        { group: 'BaseCall 안', type: 'CallRoute', depth: 0 },
        { group: 'BaseCall 안', type: 'CallStop', depth: 1 },
        { group: 'BaseCall 안', type: 'LocationDetailInfo', depth: 2, href: '/shared/call/orderShapes#t-LocationDetailInfo', about: '정거장 한 곳 — 주소 · 상호 · 담당 · 전화. orderShapes 의 기존 타입을 그대로 쓴다' },
        { group: 'BaseCall 안', type: 'CallMoney', depth: 0 },
        { group: 'BaseCall 안', type: 'MoneyLine', depth: 1 },
        { group: 'BaseCall 안', type: 'MoneyKind', depth: 2 },
        { group: 'BaseCall 안', type: 'CallLoad', depth: 0 },
        { group: 'BaseCall 안', type: 'CallTime', depth: 0 },
        { group: 'BaseCall 안', type: 'CallPromise', depth: 1 },
        { group: 'BaseCall 안', type: 'CallJob', depth: 0 },
        { group: '밖, 잡은 뒤 콜에 붙음', type: 'NetworkProgress', depth: 0 },
        { group: '밖, 잡은 뒤 콜에 붙음', type: 'CallSettlement', depth: 0 },
        { group: '밖, 콜에 함께 붙음', type: 'CallReport', depth: 0 },
        { group: '밖, 콜에 함께 붙음', type: 'CallCoordinates', depth: 0 },
        { group: '밖, 따로 저장', type: 'CallEvidence', depth: 0 },
        { group: '밖, 따로 저장', type: 'EvidenceLine', depth: 1 },
        { group: '밖, 저장 안 함', type: 'BaseCallFacts', depth: 0 },
        { group: '끝 모습', type: 'NextPendingOrder', depth: 0 },
        { group: '끝 모습', type: 'NextMyOrder', depth: 0 },
        { group: '끝 모습', type: 'NextSecuredOrder', depth: 0 },
        { group: '콜이 아님', type: 'NetworkLineRules', depth: 0 },
    ],
};

/** 칸이 없는 값 — 어디로 가는지와 왜 칸이 없는지 한 줄씩 적는다. 글자는 모두 화면 원문(CallEvidence)에 남는다 */
export const CALL_VALUES_OUTSIDE = {
    title: '칸이 없는 값',
    columns: [{ key: 'goes', label: '갈 곳' }, { key: 'value', label: '화면 값' }, { key: 'network', label: '배차망' }, { key: 'screen', label: '화면' }, { key: 'why', label: '칸이 없는 까닭' }],
    rows: [
        { goes: "원문만 남김", value: "화물 글 끝 -A · -D · 화주 옆 동그라미 A", network: "화물24시", screen: "목록 · 상세", why: "뜻을 모른다 (기사님도 모름). 글자는 job.detailMemo 에 남는다" },
        { goes: "원문만 남김", value: "«짐/» · «짐)» · «X@» · «[착]» · «[1322]» · «27:23» · 완료목표시간", network: "인성", screen: "목록 · 상세", why: "뜻을 모른다. 글자는 route.firstSeen 과 원문에 남는다" },
        { goes: "원문만 남김", value: "#연계# · 3층 계단물건 · 착지시간꼭엄수", network: "화물24시 · 플렉스", screen: "적요 · 화물 글", why: "적요 안의 글이다. 읽는 규칙이 생길 때 칸으로 뺀다. 글자는 job.detailMemo 에 남는다" },
        { goes: "원문만 남김", value: "배송지 14.8km", network: "카카오픽커", screen: "내 콜 화면", why: "지금 위치에서 배송지까지의 거리로 보인다. 상차지 → 하차지인 deliveryDistance 와 뜻이 달라 넣지 않는다" },
        { goes: "원문만 남김", value: "인수증 사진 · 물류기기 이동전표", network: "화물24시", screen: "인수증 사진", why: "사진 안의 글자다. 번호 칸을 정할 만큼 읽히지 않았다. 결제방법 인수증은 billingType, 전송 상태는 settlement.receipt 로 간다" },
        { goes: "원문만 남김", value: "마일리지", network: "인성", screen: "상세 팝업", why: "읽는 코드가 없고 본 견본은 0 이다. 기사님 결정으로 칸을 뺐다" },
        { goes: "원문만 남김", value: "독차", network: "화물24시", screen: "목록 · 상세", why: "지금 원달앱은 잡음 낱말로 버린다. 콜 고르기에 쓰게 되면 칸을 정한다" },
        { goes: "계정 표", value: "기간 합계 · 잔액 · 적립금 · 포인트 · 오늘 수익 · 오더 N건 · 산재보험료 부담액 합계", network: "전부", screen: "내 콜 목록 · 정산 화면", why: "콜 한 건의 값이 아니라 기사 계정의 값이다" },
        { goes: "계정 표", value: "입출금 내역 · 수행내역 머리", network: "인성", screen: "정산 화면", why: "기사 계정의 값이다. 콜 한 건의 금액은 CallSettlement.earned 로 간다" },
        { goes: "계정 표", value: "차량번호 · 차주명 · 멀티 CID · 운행취소횟수 · 신용도 · 배송 수단 · 보험료", network: "화물24시 · 인성 · 플렉스", screen: "내 콜 화면 · 기사 정보", why: "내 차와 내 계정의 값이다" },
        { goes: "계정 표", value: "퀵 최대 합짐 개수 6건 · 퀵 서포트 모드 N건", network: "카카오픽커", screen: "목록 · 내 콜 목록", why: "기사 계정의 값이다" },
        { goes: "거래처 표", value: "화주 업태 · 업종 · 주소 · 전자우편", network: "화물24시", screen: "화주 정보", why: "거래처의 값이다. 콜마다 반복되므로 거래처 표를 만들 때 키를 정한다" },
        { goes: "배차망 사실", value: "편도 150% · 급송 100% · 픽업 20분 · 하루 02:00~01:59", network: "플렉스 · 인성", screen: "안내 화면", why: "콜이 아니라 배차망의 규칙이다. 정의 표에 둘지는 쓰는 곳이 생길 때 정한다" },
        { goes: "배차망 사실", value: "적재중량 확인 안내 · 거리는 최단거리라는 안내", network: "화물24시", screen: "상세", why: "배차망 사실이다. 거리 안내는 정의 표 distanceBasis 로 간다" },
        { goes: "배차망 사실", value: "인성1,5,6,7그룹 / 인성2,3,4그룹 · 파란 세로줄 · 1그룹 / 2그룹", network: "인성", screen: "새 콜 목록 · 설정", why: "인성 2그룹 콜 표시. 기사님 말씀대로 하나로 합쳐질 구분이라 키를 만들지 않는다" },
        { goes: "화면 표시", value: "확정(10) · 확정(9)", network: "인성", screen: "새 콜 화면", why: "확정 단추의 남은 초 (기사님 확인). 콜 값이 아니라 화면 값이다" },
        { goes: "화면 표시", value: "선정산 · 후정산", network: "인성", screen: "수행내역", why: "목록을 거르는 동그라미 단추다. 콜의 값은 paymentType 으로 유추한다 (기사님 말씀). 대응 표는 아직 없다" },
        { goes: "화면 표시", value: "퀵 배송 · 도보배송 · 한차배송 · 대리", network: "카카오픽커", screen: "목록 맨 위", why: "목록을 고르는 단추다. 기사님은 퀵 배송만 켠다. 도보배송 · 한차배송(한 차에 실어 여러 곳에 내림) · 대리(대리운전)는 안 하신다. 원달앱의 퀵 · 도보 판단 코드는 그대로 둔다" },
        { goes: "화면 표시", value: "목록 모서리 N · 탭 N · 30분/60분 안보기 · 배차취소하기 막대 · 넘기기 단추", network: "화물24시 · 인성 · 플렉스 · 카카오픽커", screen: "목록 · 상세", why: "화면 표시와 단추다" },
        { goes: "화면 표시", value: "추천 오더 상자", network: "플렉스", screen: "목록", why: "상자 자체는 화면 표시다. 안의 콜은 목록 줄과 같은 칸으로 간다" },
        { goes: "화면 표시", value: "…원 수행하기 단추", network: "플렉스", screen: "새 콜 화면", why: "같은 화면 «총 수입»과 같은 금액이다 (실물 xml). 금액은 income 으로 간다" },
        { goes: "화면 표시", value: "도착지에서 현금을 꼭 받으세요!", network: "플렉스", screen: "내 콜 화면", why: "같은 뜻이 paymentType 과 lines collect 에 있다" },
        { goes: "화면에 없음", value: "인성 내 콜 목록 회사 이름 · 플렉스 내 콜 목록 금액", network: "인성 · 플렉스", screen: "내 콜 목록", why: "정의 표에만 있고 이미지에서 근거를 못 찾았다. 플렉스 안내 영상의 그 화면에는 금액이 없다" },
    ],
};

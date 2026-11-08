/**
 * 콜 모양
 * 누가: 서버 · 관제웹 · 운영센터
 * 언제: 콜 값을 주고받을 때
 * 어디서: 콜 타입을 쓰는 모든 자리
 * 무엇을: 목록 콜 · 상세 콜 · 대기 콜 · 내 콜 · 판정 기록 타입 · 정거장 위에 다른 정거장의 칸을 얹는 함수
 * 어떻게: 대부분 타입만 두고 값은 정거장 합치기 한 함수(withStopLists)다 · 원달앱 보고는 콜 모양 그대로다 · 번호 · 출처 묶음은 callIdentity 가, 돈 묶음은 money 가, 짐 묶음은 cargo/callLoad 가 정의한다
 * 왜: 같은 콜을 앱마다 다른 모양으로 적지 않기 위해서다
 */
import type { PaymentType, BillingType, CallMoney } from './money';
import type { OrderStatus, MyOrderStatus } from './callStatus';
import type { CallIdentity, CallProvenance, ReportKind } from './callIdentity';
import type { CallLoad } from '../cargo/callLoad';
import type { TripType, OrderForm } from './badges';

/**
 * 🚏 정거장 한 곳 — 상차지 · 하차지. 화면이 보인 것만 담고 못 읽은 칸은 비운다.
 *    칸마다 `?` 다 — 정거장 칸을 채우는 곳이 생기면 꼭 있는 칸(못 읽으면 null)으로 바꾼다.
 */
export interface CallStop {
    listText?: string | null;       // 목록 원문 (예: "@낼08:20/수원이의동") — 상세를 열어도 덮지 않는다
    region?: string | null;         // 목록 글자에서 얻은 읍 · 면 · 동 (예: "이의동") — 없거나 잘렸으면 비운다
    addressDetail?: string | null;  // 상세 주소 원문 (예: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)")
    customerName?: string | null;   // 상호 · 고객 (예: "*레드캠프", "SK스토아 홈쇼핑(5층하차")
    department?: string | null;     // 부서 (예: "정실장님", 빈 값일 경우 "*")
    contactName?: string | null;    // 담당 (예: "정종혁차장")
    phone1?: string | null;         // 전화1 (예: "010-2228-4991")
    phone2?: string | null;         // 전화2 (예: "031-267-1224", 빈 값일 경우 "*")
    /** 📝 약속 원문 — 화면 글자 그대로(인성 «@낼8:30» · 화물24시 «당상» · 픽커 «17:04까지 픽업» · 하차 «14시전») · 화면 기록 */
    promiseText?: string | null;
    /** 📅 날 — 콜을 본 날부터 며칠 뒤. 화면 표시 + 정한 규칙(날짜 없는 예약 = 오늘 · 날짜 없는 하차 = 상차와 같은 날) · null = 약속 없음 */
    requestedDay?: number | null;
    /** 🕒 시각 «HH:MM» — 화면 표시 + 정한 규칙(첫 시각 · 구간 = 끝 시각) · null = 약속 없음 */
    requestedTime?: string | null;
    /**
     * 📏 정거장 거리 — 화면이 이 정거장에 붙인 «여기까지 km». 첫 상차 = 내 자리 → 상차지 · 다음 정거장 = 앞 정거장 → 여기.
     *    목록 값이 먼저, 목록에 없으면 상세 값 · 화면에 없으면 null(좌표로 계산하지 않는다).
     *    직선인지는 배차망 정의 표 줄의 설명 글을 본다 · 카카오 도로 거리(`kakaoSoloDistanceKm`)와 다른 값이다.
     */
    distanceKm?: number | null;
    memo?: string | null;           // 그 정거장 안내 글
    geo?: { x: number; y: number } | null;   // 서버가 붙이는 좌표 — 원달앱은 비운다
    geoText?: string | null;        // 🧠 서버가 좌표를 찍은 글 — 서버 메모리만(저장 칸 아님) · 고른 글이 바뀌면 다시 찍는다 (`stopQueryOf`)
}

/**
 * 📱 원달앱 양식 — 원달앱이 배차망 목록에서 읽어 서버로 보내는 칸. 주소 · 약속 · 거리는 정거장 묶음에, 차종 · 크기 글자는 짐 묶음에도 싣는다.
 *    서버 입구는 이 보고를 그대로 콜로 쓴다(옮겨 담지 않는다).
 */
export interface SimplifiedOfficeOrder {  // 목록 콜 — 원달앱이 배차망 목록에서 읽어 서버로 보내는 칸
    /** 🌐 짐 크기 — 물품 크기 원문(초소형/소형…). 차종 칸에 섞지 않는다 (규칙 ⑤-4 ⑤) · 짐 묶음 `load` 로 옮기는 중(짐 7) */
    itemSize?: string | null;
    /** 🌐 표시 글자 화면 기록 — 화면 글자를 빈칸으로 이은 원문 · 기준 값이 아니다(구분 · 형태 값은 tripType · orderForm) */
    tagsText?: string | null;
    /**
     * 🗳️ **앱이 이 콜을 어떻게 판정했나**.
     *    `pass` · `vehicle` · `region` · `fare` · `pickup` · `blacklist` · `routeOrder` · `locked` · `reservation`(예약콜 축에 막힘)
     *
     * 🔴 화면이 판정을 **다시 계산하지 않게** 하려는 것이다 — 사본은 이미 한 번 갈라졌다.
     * ⚠️ 못 정하면 `null` — 화면은 «못 잼»으로 그린다 (규칙 ④).
     */
    verdict?: string | null;
    id: string;                       // 스캐너 앱 쪽 고유 ID
    type: ReportKind;                 // 보고 종류 — 값 목록 REPORT_KINDS(callIdentity)
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    postTime?: string;                // 콜 상차시간 · 등록시간 (예: "12:23")
    vehicleType?: string;             // 콜 차종 — 목록 줄임말("라", "다", "1t") 또는 상세의 차량 이름("다마스") · 짐 묶음 `load` 로 옮기는 중(짐 7)
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
    /** 🐥 가상 체험 모드로 잡은 가상 주문 (실서버 미수락) */
    isSimulated?: boolean;
    /** 🏢 공유콜 — 원달앱이 인성 목록 출발지 «@»에서 읽는다 · 번호 묶음 `CallIdentity.fromOtherOffice` 와 같은 칸 */
    fromOtherOffice?: boolean | null;
    /** 📅 예약 표시가 있나 — 참인데 첫 상차 정거장 `requestedDay` 가 비면 «날 모름» (원달앱 `ReservationText`) */
    reserved?: boolean | null;
    /** 🚏 상차 정거장 — 원달앱은 목록 글자 · 정거장 거리 · 약속을 싣고, 좌표 · 찍은 글은 서버가 붙인다 */
    pickupDetails?: CallStop[];
    /** 🚏 하차 정거장 — 마지막 하차의 정거장 거리가 배송 거리다(`deliveryKmOf`) */
    dropoffDetails?: CallStop[];
    /** 📦 짐 묶음 — 짐 줄 · 차종 맞춤 재료(`cargo/callLoad.ts`). 원달앱이 맨 위 차종 · 크기 글자를 그대로 싣고 서버 `/detail` 이 상세 원문 조각 줄을 얹는다 · 읽는 곳은 아직 없다 — 그동안 `vehicleType` · `itemSize` · `itemDescription` 을 읽는다 */
    load?: CallLoad;
}
export interface DetailedOfficeOrder {  // 상세 콜 — 원달앱은 안 보내고 서버가 상세 원문에서 뽑거나 계산해 채우는 칸 · 배차사 · 의뢰인 · 진행 글자는 번호 묶음(CallIdentity)
    // 1. 물품
    itemDescription?: string;         // 물품 요약 (예: "소형 가전", "박스 2개") · 짐 묶음 `load` 로 옮기는 중(짐 7)
    
    // 2. 요금 상세 스펙 — 돈 묶음 `money` 로 옮기는 중(돈 7 · 8)
    commissionRate?: string;          // 수수료율 (예: "23%", "10%", "*%")
    tollFare?: string;                // 탁송료/통행료 별도 기재 항목
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    
    // 3. 운행 조건 스펙
    tripType?: TripType | null;       // 배송 구분 — 값 목록 `TRIP_TYPES`(badges.ts)
    orderForm?: OrderForm | null;     // 배송 형태 — 값 목록 `ORDER_FORMS`(badges.ts)
    detailMemo?: string;              // 적요 상세 (원문 전체)
}

/** 배차망에서 온 콜 한 건 — 번호 묶음(이 콜이 무엇인가) + 출처 묶음(이 보고가 어디서 어떻게 왔나) + 목록 콜(정거장 · 짐 묶음 포함) + 상세 콜 + 돈 묶음. 아래 콜 모양 셋의 부모 */
export interface OfficeOrder extends CallIdentity, CallProvenance, SimplifiedOfficeOrder, DetailedOfficeOrder {
    /** 💰 돈 묶음 — 돈 줄 · 결제 · 증빙(`money.ts`). 서버 상세 원문 조각 줄이 채운다(`detailRecordOf` · 원달앱 보고는 돈 9) · 읽는 곳은 아직 없다 — 그동안 `fare` · 요금 칸 넷을 읽는다 */
    money?: CallMoney;
}

/** 📱 원달앱 보고 한 건 — 콜 모양 그대로(정거장 · 짐 묶음을 싣는다). 서버 입구 셋(/api/scrap · /confirm · /detail)이 그대로 콜로 쓴다 */
export type AppCallReport = OfficeOrder;

/** 🚏 상차 · 하차 정거장 목록 — 콜에서 정거장만 */
type StopLists = Pick<SimplifiedOfficeOrder, 'pickupDetails' | 'dropoffDetails'>;
const carried = (next: CallStop | undefined, from: CallStop | undefined, keys: ReadonlyArray<keyof CallStop>): CallStop => {
    const out: Record<string, unknown> = { ...next };
    for (const k of keys) if (from?.[k] !== undefined) out[k] = from[k];
    return out as CallStop;
};

/**
 * 🚏 **정거장 위에 다른 정거장의 칸을 얹는다** — `stops` 의 정거장 목록 그대로, 첫 상차 · 마지막 하차에만 `from` 의 같은 자리 정거장 `keys` 칸을 얹는다.
 *    `from` 에 그 칸이 없으면(undefined) `stops` 값이 남는다 · 배차망으로 가르지 않는다.
 *    정거장 목록이 비어 있으면 한 곳을 만든다 — 콜은 늘 상차 · 하차가 한 곳 이상이다.
 *    서버 `/detail` 이 두 번 부른다 — ① 원달앱 보고 정거장 위에 앞 기억의 서버 칸(좌표 · 찍은 글) ② 그 위에 상세 원문 연락처 칸.
 */
export function withStopLists(stops: StopLists, from: StopLists, keys: ReadonlyArray<keyof CallStop>): Required<StopLists> {
    const pickups = [...(stops.pickupDetails ?? [])];
    const drops = [...(stops.dropoffDetails ?? [])];
    pickups[0] = carried(pickups[0], from.pickupDetails?.[0], keys);
    const lastAt = Math.max(drops.length - 1, 0);
    drops[lastAt] = carried(drops[lastAt], from.dropoffDetails?.at(-1), keys);
    return { pickupDetails: pickups, dropoffDetails: drops };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-A] 심사 중 오더 — 서버 메모리 전용 (아직 내 퀵이 아님)
// 앱이 긁어와서 서버가 꿀/똥콜 판별 중인 임시 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 📍 **주소 대략** — 서버가 주소를 못 찾아 읍·면·동 중심으로 판정했으면 그 이름(«마장면»). 정확하면 없다.
 *    서버 판정(`OrderEvaluator`)이 싣고(앱이 보내는 칸 아님 · DB 칸 아님), 로그와 관제웹 «대략» 표시(`approxAddress`)가 읽는다. 심사 중 콜과 확정 콜이 같이 든다.
 */
export interface ApproxAddress {
    pickupApprox?: string | null;     // 상차지를 어림한 읍·면·동 이름
    dropoffApprox?: string | null;    // 하차지를 어림한 읍·면·동 이름
}

/**
 * ⏩ **빨리 접기 재료** — 서버가 심사 콜에 싣는다(DB 칸 아님).
 *    `openedByApp`: 이 상세를 앱이 알람 모드로 목록에서 눌러 열었나(/confirm · 모르면 없음 · 기록 칸 openedBy 와 따로).
 *    `foldAfterSec`: 판정 끝에 정한 빨리 접기 초(`quickFoldSecOf`) — 있으면 judgeUntil 이 판정 끝 + 그 초로 당겨진다.
 */
export interface QuickFoldFields {
    openedByApp?: boolean;            // 이 상세를 원달앱이 알람 모드로 목록에서 눌러 열었나 — 원달앱이 보내고 서버 판정이 읽는다
    foldAfterSec?: number | null;     // 판정 끝에 정한 빨리 접기 초 — 서버 판정이 정하고 기기 세션 · 결재가 읽는다
}

/** 서버가 계산하고 기록한 값 — 심사 중 콜 · 내 콜 · 관제웹 콜이 함께 물려받는다. 칸은 여기 한 번만 적는다 */
export interface ServerCallFields {
    capturedDeviceId: string;         // 이 콜을 올린 기기
    capturedAt: string;               // 콜을 잡은 시각
    /**
     * 🎯 **이 콜을 잡을 때 통과한 목적지 시**.
     *    확정 순간 서버가 그때의 필터값을 그대로 적는다 (`filterGoals.goalCityOf`) — 좌표로 가르지 않는다.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. `orders.goalCity` 에 저장되어 재시작 때 되살아난다.
     */
    goalCity?: string;
    /** 👀 미리보기 콜 — 확정 전이라 취소 횟수에 안 들어간다. 확정하면 이 칸을 지운다 (`handleDecision`) */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 글자
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 이 콜만의 단독 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 이 콜만의 단독 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // 경로 연산 실패 메세지
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간
    sectionDriveMin?: Array<number | null>;  // 출발점 기준 정거장별 누적 주행(분) — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — `sectionDriveMin` 과 같은 길이. 구간의 색 주인이고, 도착으로 정거장이 빠져도 이름으로 맞춘다 */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    /**
     * 🎨 **구간이 끝나는 자리** — `routePolyline` 안에서 각 구간의 끝 인덱스(누적)다.
     *    지도가 구간마다 그 콜의 색으로 그리려면 경계가 필요하다.
     * 🔴 선을 한 벌 더 보내지 않는다 — 같은 점열을 복제하면 초당 수백 KB 가 오가 브라우저가 죽는다. `sectionLinesOf()` 가 이 값으로 잘라 준다.
     * ⚠️ `sectionStops` 가 «정거장마다»라면 이건 «정거장 사이마다»라 길이가 하나 짧다 — 카카오 `sections` 를 그대로 따른다.
     */
    sectionEnds?: number[];
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 기준
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    rejectionReasons?: string[];      // 모든 탈락 · 패널티 사유
    approvalReasons?: string[];       // 모든 장점 사유
    distanceKm?: number;              // 운행 거리(km) — 서버가 카카오 단독 거리를 옮겨 적는다
    isShared?: boolean;               // 합짐 여부 — 서버가 저장할 때 진행 콜 수로 계산한다
    isExpress?: boolean;              // 급송 여부 — 서버가 저장할 때 `isExpressForm(orderForm)` 으로 계산한다
}

export interface PendingOrder extends OfficeOrder, ApproxAddress, QuickFoldFields, ServerCallFields {  // 심사 중 콜 — OfficeOrder + 서버의 판정 · 경로 값. 서버 메모리에만 있고 아직 내 콜이 아니다
    status: OrderStatus;                  // ORDER_PRE_SECURED | ORDER_SECURED_EVALUATING | ORDER_AWAITING_DECISION
    /**
     * ⏱️ **남은 판정 시간이 끝나는 시각** (밀리초) — 미리보기에만 싣는다. 심사석 배경이 이것으로 찬다.
     * 🔴 이 시각이 지나도 콜은 안 사라진다 — 끄는 것은 폰의 화면 상태 하나다 (`devices.leftDetail`).
     */
    judgeUntil?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 (내 퀵) — 기사가 KEEP하여 내 소유가 된 오더
// 업계 표준: 배차확정(CONFIRMED) → 상차완료(PICKED_UP) → 하차완료(DELIVERED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 🎨 **판정 스냅샷** (판정색 확정안 v2) — 심사 1회, 불변. 서버 판정(`OrderEvaluator`)이 만들고 관제웹 심사 칸 · 운영센터가 읽는다.
 * 심사 카드가 조건 전수를 이걸로 그리고, **색도 여기서 온다** (4단계).
 *
 * import 순환을 피해 `dryRun.ts` 의 `DryRunVerdict` 를 구조로 적는다.
 * 🔴 **여기 한 곳에만 적는다** (규칙 ③) — `SecuredOrder` 에만 두면 `MyOrder` 로 다니는 콜
 *    (재시작 복구가 만드는 것)에 **색이 실리지 못한다.**
 */
export interface JudgmentSnapshot {
    color: '꿀' | '보통' | '똥' | '사고';  // 판정 색
    /** 🔴 못 쟀으면 `null` — **0 이 아니다** (0 은 «나쁘다»로 읽힌다) */
    score: number | null;
    /** 🔴 못 잰 기준은 `score` 가 `null` 이다 — 0 은 «나쁘다»로 읽힌다 */
    axes: Array<{ key: string; name: string; score: number | null; weight: number; raw: string; value?: number }>;
    gates: Array<{ key: string; name: string; pass: boolean; why: string | null }>;  // 통과해야 하는 조건 — 조건마다 통과 여부와 까닭
    tags: string[];  // 판정에 붙는 표시 글자
    /**
     * 🧾 **기존 콜 정거장마다 — 이 후보를 받으면** (전수표 #43 #45 #46 #47 · 합짐 심사 때만 있다).
     *    약속(`promisedAt`) · 예정(`etaAt`) · 늦음(분 — 양수면 늦다). 모르면 `null` — 지어내지 않는다 (규칙 ④).
     *    결론은 관제웹 `seatConclusion` 한 곳이 낸다.
     */
    stops?: Array<{ name: string; stopType: 'pickup' | 'dropoff'; promisedAt: string | null; etaAt: string | null;
        lateMin: number | null; confirmed: boolean; arrived: boolean;
        /** ☎️ 그 정거장의 동 이름 — 늦으면 «전화할 곳»이다 (전수표 #42). 좌표를 모르면 `null` */
        place?: string | null }>;
    /** ❓ **기존 콜 도착을 모르는 까닭** — 있으면 심사석이 «안 밀린다»고 말하지 않는다 */
    unknownWhy?: string | null;
    /**
     * ⏱️ **더 쓰는 시간(분)** — 판정이 시급의 분모로 쓴 값 (전수표 #42 · 목업 «더 쓰는 시간»).
     *    첫짐은 이 콜 전체, 합짐은 전체 경로가 늘어나는 만큼 + 정차. 화면이 다시 재지 않는다 (규칙 ③)
     */
    extraMin?: number | null;
}

export interface MyOrder extends OfficeOrder, ServerCallFields {  // 내 콜 — OfficeOrder + 서버의 경로 · 판정 · 정산 값. 기사님이 KEEP 해 내 것이 된 콜. 서버 안에서 쓴다
    status: MyOrderStatus;            // ORDER_CONFIRMED | ORDER_PICKED_UP | ORDER_DELIVERED
    /**
     * 📅 **예약 보관 날 `YYYY-MM-DD`** — 잡은 날 + 첫 상차 정거장 `requestedDay`. 오늘보다 뒤면 이 콜은 진행 중 콜이 아니라
     *    세션의 예약 보관(`reservedOrders`)에 있다. 장부 자리는 `orders.reserved_for`. 오늘 콜이면 비어 있다.
     */
    reservedFor?: string;
    /** 🏁 하차한 시각 (장부 `orders.completedAt`) — 화면의 사이클 경계가 본다 (#40) */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /** 🎨 판정 스냅샷 — `SecuredOrder` 와 **같은 타입**을 가리킨다 (규칙 ③) */
    judgment?: JudgmentSnapshot;
    settlement?: SettlementInfo;      // 정산 및 미수금 관리 트래킹 (운행일지용)
}

export interface SecuredOrder extends OfficeOrder, ApproxAddress, QuickFoldFields, ServerCallFields {  // 관제웹이 받는 콜 — 심사 중 콜과 내 콜을 한 모양으로 담아 한 목록으로 다룬다
    status: OrderStatus;                  // 단일 통합 라이프사이클 상태
    /**
     * 🏁 **하차한 시각** (장부 `orders.completedAt`). 없으면 아직 안 내렸거나 옛 행이다.
     * 화면의 사이클 경계가 이걸 본다.
     */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /**
     * ⏱️ **남은 판정 시간이 끝나는 시각** (밀리초) — 미리보기에만 실린다. 심사석 배경이 이것으로 찬다.
     *
     * 🔴 **이 시각이 지나도 콜은 안 사라진다.** 끄는 것은 폰의 화면 상태 하나가 정한다
     *    (`devices.leftDetail`) — 기사님: *"타이머는 «남은 판정 시간»을 알려주는 기능으로만 사용된다."*
     * ⏱️ 길이는 배차망별 값이다 — 인성 · 화물24시는 안전취소 시간, 픽커는 상세 대기 시간 (DB 기본 30초).
     */
    judgeUntil?: number;
    /** 🎨 판정 스냅샷 — 심사 1회, 불변 ([[JudgmentSnapshot]]) */
    judgment?: JudgmentSnapshot;
    settlement?: SettlementInfo;  // 정산 및 미수금 기록
}

// 정산 · 미수금 기록의 모양 — 지금은 채우는 코드도 읽는 코드도 없다. 실제 정산은 `orders` 표의 `settlementStatus` 등이 한다
export interface SettlementInfo {
    status: '미정산' | '지급예정' | '정산완료' | '미수금'; // 현재 돈을 받았는지 상태
    unpaidAmount: number;             // 받지 못한 금액 (미수금) 
    payerName?: string;               // 결제/입금 담당자명 또는 회사명 (예: "레드캠프 경리팀")
    payerPhone?: string;              // 결제 담당자 연락처 (이 번호로 전화해서 청구)
    dueDate?: string;                 // 입금 예정일 (예: "매월 말일", "15일", ISO date 등)
    memo?: string;                    // 정산 관련 메모 (예: "수수료 떼고 입금하기로 함", "전화 안받음")
}

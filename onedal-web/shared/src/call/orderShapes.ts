/**
 * 콜 모양
 * 누가: 서버 · 관제웹 · 운영센터
 * 언제: 콜 값을 주고받을 때
 * 어디서: 콜 타입을 쓰는 모든 자리
 * 무엇을: 목록 콜 · 상세 콜 · 대기 콜 · 내 콜 · 판정 기록 타입 · 끝 모습인 기본 콜(BaseCall) 타입
 * 어떻게: 대부분 타입만 둔다. 값은 EVENT_TYPES 와 보기 페이지가 읽는 기본 콜 표 둘이다
 * 왜: 같은 콜을 앱마다 다른 모양으로 적지 않기 위해서다
 */
import type { PaymentType, BillingType } from './paymentTypes';
import type { OrderStatus, MyOrderStatus } from './callStatus';
import type { TargetAppType } from '../network/targetApps';
import type { ScreenPage } from '../network/pageFields';
import type { CargoSpec } from '../cargo/cargoSpec';
import type { VehicleType } from '../cargo/vehicles';

/** 콜 종류 값 — 어떤 길로 온 보고인가. 이 상수는 이 파일 밖에서 안 쓰고, 서버와 원달앱은 글자('NEW_ORDER' 등)로 맞춘다 */
export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
    MANUAL: "MANUAL" as const,
    SIMULATION: "SIMULATION" as const,
    ALARM: "ALARM" as const,
};

/** 콜 종류 — 직접 잡음 · 체험 여부를 함께 담는다. `SimplifiedOfficeOrder.type` 의 타입이다 */
export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// 상차지 · 하차지 연락처 — 인성 «출발지 상세» · «도착지 상세» 팝업의 칸과 1:1
export interface LocationDetailInfo {
    customerName?: string;    // [고객] 상호/고객명 (예: "*레드캠프", "SK스토아 홈쇼핑(5층하차")
    department?: string;      // [부서] 부서명 (예: "정실장님", 빈 값일 경우 "*")
    contactName?: string;     // [담당] 담당자명 (예: "정종혁차장")
    mileage?: number;         // [마일리지] 마일리지 포인트 (예: 0)
    phone1?: string;          // [전화1] 대표 연락처 (예: "010-2228-4991")
    phone2?: string;          // [전화2] 보조 연락처 (예: "031-267-1224", 빈 값일 경우 "*")
    region?: string;          // [출발/도착] 광역 지역명 (예: "경기 화성시", "서울 마포구")
    addressDetail?: string;   // [위치] 상세 주소+건물명 (예: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)")
    requestedTime?: string;   // 상차/하차 예약 시간 (내 콜 화면에서 파싱, 예: "13:53")
    memo?: string;            // 현장 전달사항 (적요 등에서 추출)
}

export interface SimplifiedOfficeOrder {  // 목록 콜 — 원달앱이 배차망 목록에서 읽어 서버로 보내는 칸
    /** 🌐 짐 크기 — 물품 크기 원문(초소형/소형…). 차종 칸에 섞지 않는다 (규칙 ⑤-4 ⑤) */
    itemSize?: string | null;
    /** 🌐 꼬리표 — 배차망 표시 원문(급송·예약 17:00·준비 29분…) */
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
    type: EventType;                  // NEW_ORDER 등 통신 규격
    pickup: string;                   // 예: "경기 광주 오포"
    dropoff: string;                  // 예: "강남구 역삼동"
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    postTime?: string;                // 콜 상차시간 · 등록시간 (예: "12:23")
    scheduleText?: string;            // 예약 앞글자 원문 (예: "낼09시", "11일)09시", "@")
    vehicleType?: string;             // 콜 차종 — 목록 줄임말("라", "다", "1t") 또는 상세의 차량 이름("다마스")
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
    // 좌표 — 원달앱 명부 또는 서버 지오코딩
    pickupX?: number;                 // 상차지 좌표 X
    pickupY?: number;                 // 상차지 좌표 Y
    dropoffX?: number;                // 하차지 좌표 X
    dropoffY?: number;                // 하차지 좌표 Y
    pickupDistance?: number;          // 상차지까지의 남은 직선 거리 (km)
    /**
     * 배송거리 (상차지 → 하차지, km). 리스트 최좌측 두 숫자 중 **두 번째** 값.
     * 앱의 단가 판정(`fare ≥ deliveryDistance × ratePerKm[차종]`) 입력이다.
     * 원달앱이 목록에서 읽어 보낸다. 서버는 채우지 않고 저장 · 복원하며(`orders.deliveryDistance`),
     * 카카오 거리가 없을 때 소요 시간 추정(`soloMinutesOf`)에 읽는다. 실제 판정은 카카오 도로거리로 다시 잰다.
     * 🔍 이 값이 직선거리인지 도로거리인지는 실콜 대조 대기 중
     */
    deliveryDistance?: number;
    /** 🐥 가상 체험 모드로 잡은 가상 주문 (실서버 미수락) */
    isSimulated?: boolean;
    /** 📅 예약 표시가 있나 — 참인데 `reservedDay` 가 비면 «날 모름» (원달앱 `ReservationText`) */
    reserved?: boolean | null;
    /** 📅 폰 달력으로 며칠 뒤 상차인가 (0 = 오늘) */
    reservedDay?: number | null;
    /** 📅 예약 시각 «HH:MM» */
    reservedAt?: string | null;
}
export interface DetailedOfficeOrder {  // 상세 콜 — 원달앱은 안 보내고 서버가 상세 원문에서 뽑거나 계산해 채우는 칸
    // 1. 배차사(퀵사무실) 정보 (상세화면 최상단)
    dispatcherName?: string;          // 배차 사무실 상호 (예: "고양퀵서비스")
    dispatcherPhone?: string;         // 배차 사무실 연락처 (예: "031-932-7722")
    
    // 2. 문서/전표 기본 정보
    receiptStatus?: string;           // 전표 상태 (예: "신규", "수정", "취소")
    itemDescription?: string;         // 물품 요약 (예: "소형 가전", "박스 2개")
    
    // 3. 요금 상세 스펙
    commissionRate?: string;          // 수수료율 (예: "23%", "10%", "*%")
    tollFare?: string;                // 탁송료/통행료 별도 기재 항목
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    
    // 4. 운행 조건 스펙
    tripType?: string;                // 배송 구분 (예: "편도", "왕복")
    orderForm?: string;               // 배송 형태 (예: "보통", "급송")
    detailMemo?: string;              // 적요 상세 (원문 전체)
    
    // 5. 위치 정보
    pickupDetails?: LocationDetailInfo[];  // 출발지 상세 정보 (팝업 파싱)
    dropoffDetails?: LocationDetailInfo[]; // 도착지 상세 정보 (팝업 파싱)
    
    // 6. 메타 데이터 및 호환성 필드
    companyName?: string;             // 화주 상호/이름 (과거 호환 유지 목적)
    pickupTime?: string;              // 픽업 예약 시간 지정
}

export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder {  // 배차망에서 온 콜 한 건 — 목록 콜 + 상세 콜 + 어느 배차망에서 어떻게 잡았나. 아래 콜 모양 셋의 부모
    /** 어느 배차망에서 온 콜인가 — TARGET_APPS 표준값 (앱 confirm 페이로드가 싣는다).
     *  🔴 원장(orders.targetApp)에 저장 — 배차망별 콜 검색·분석의 근거 (기사님) */
    targetApp?: string;
    /** 🖱️ 잡은 방식 — 6하원칙의 «어떻게» (CAPTURED_VIA · 기록 전용, 보호 분기는 matchType).
     *  구앱·모르는 값은 null — 지어내지 않는다 (기사님 확정) */
    capturedVia?: string | null;
    /** 🖱️ 잡은 방식 — 그때 도는 모드(명령 값 · 화면 이름은 네 모드 표 name) · 상세페이지로 진입시킨 주체 (29 P5-1 · 기록 전용 · 모르면 null) */
    capturedMode?: string | null;
    openedBy?: 'APP' | 'DRIVER' | null;  // 상세 화면을 연 주체 — 원달앱 / 기사님
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
 *    `openedByApp`: 이 상세를 앱이 알람 모드로 목록에서 눌러 열었나(/confirm · 모르면 없음 · 기록 칸 capturedVia 와 따로).
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
    isExpress?: boolean;              // 급송 여부 — 서버가 저장할 때 `orderForm` 으로 계산한다
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
     * 📅 **예약 보관 날 `YYYY-MM-DD`** — 잡은 날 + `reservedDay`. 오늘보다 뒤면 이 콜은 진행 중 콜이 아니라
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

// ━━ 기본 콜 — 끝 모습의 콜 모양. 지금 코드는 아직 안 읽는다 ━━
// 아직 모르는 것
// - 픽커 «최종 수익» · 플렉스 «총 수입»이 수수료를 뺀 값인가, 화물24시 «수납금액»의 뜻, 플렉스 탁송 금액의 뜻, 화물24시 «-A» · «-D» · 동그라미 «A», 인성 «짐/» · «짐)» · «X@» · «[착]» (기사님도 모름)
// - 픽커 짧은 오더 코드의 뜻, 플렉스 «픽업시간» · «배송시간»이 약속인지 실제 시각인지
// - 인성 상세가 경유지를 어떻게 보여 주는가 (경유 콜 상세 캡처가 없다), 인성 «용/소»의 «/»가 차종과 짐 크기를 가르는가, 인성 의뢰지 전화 번호가 글자로 보이는가
// - 화물24시 «수» 금액이 기사 몫인가 사무실에 넘기는 돈인가 — 수작업비는 아니다(14번 콜은 화주 쪽이 상하차를 해 주는데 수수료 20,000 이 붙었다). 그 전까지 판정은 지금 fare 그대로다, 선정산 · 후정산과 paymentType 의 대응 표 (기사님 말씀 «유추 가능», 표를 둘 자리는 아직 안 정했다)
// - 화면에 적힌 거리가 직선인가 도로인가 (인성 적요 줄만 «직선»이라 적혀 있다)
// - 같은 콜의 목록 · 상세 · 확정 글자가 한 벌로 있는 사례가 저장소에 없다

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
    listRegion?: { pickup?: string; dropoff?: string };
    /**
     * 상차지. addressDetail 은 내비에 찍을 주소(인성 팝업 «위치» · 픽커 사진 정거장 · 플렉스 상세).
     * 더 자세한 값이 오면 나중 값이 이긴다. 주소가 아닌 글(인성 내 콜의 상호)은 넣지 않는다.
     * region 은 지역 이름만 담는다. 목록 글자는 위 listRegion 의 몫이다.
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
    rate?: string;    // 비율이나 식의 글자 — «23%», «(운송료+부가세) x1.298%». 탁송료는 화면 금액 글자 그대로 — «3,000»
    label?: string;   // 화면에 적힌 이름 — 사람이 출처를 확인할 때 본다
}

/** 결제 칸의 값 — 옛 값에 화물24시 «선/착불»을 더한다. 옛 PAYMENT_TYPES 는 그대로 두어 서버 읽기와 화면이 안 바뀐다 */
export type CallPaymentType = PaymentType | '선/착불';

/** 얼마 버나, 어떻게 받나 — 합치거나 빼지 않고 화면의 금액을 줄로 둔다 */
export interface CallMoney {
    lines: MoneyLine[];          // 같은 종류가 다시 오면 나중 값이 이긴다. 요금 줄(total · income)은 처음 값을 지킨다
    paymentType?: CallPaymentType;  // 언제 어떻게 받나: 신용 · 선불 · 착불 · 카드 · 현금 · 선/착불 — 인성 괄호 · 화물24시 결제방법 · 픽커 «착불» 네모 · 플렉스 테두리. 화물24시 «인수증» 콜은 이 칸이 빈다
    billingType?: BillingType;   // 증빙 방식: 계산서 · 인수증 · 무과세 — 인성 둘째 괄호 · 화물24시 결제방법 «인수증». 화물24시 플러그인이 결제방법 글자를 뜻대로 나눈다
}

/** 뭘 싣나 — 배차망이 말한 그대로 둔다. 실리는지는 BaseCallFacts.load 가 답한다 */
export interface CallLoad {
    vehicleType?: string;        // 콜 차종 낱말 그대로 — «다마스», «1t», «2.5톤/윙», 픽커 «승». 이 짐을 옮기라는 수단이고 내 차와 다른 개념이다
    itemSize?: string | null;    // 크기 낱말 — 픽커 목록 «소형». 옮기는 동안은 지금 값을 담는다 — 픽커 사진은 «소형 세 변의 합 …» 줄 통째다. 낱말로 나누는 것은 읽는 코드를 옮길 때 한다 · 플렉스 «대박스»(안내 영상 · 안 읽음) · 인성 «다마스-다마»의 «다마»
    itemDescription?: string;    // 짐 글 — 인성 «박스 1개» · 앞글자 «폰)»(핸드폰), 픽커 «소형 세 변의 합 100cm ∙ 5kg 이하», 플렉스 적요 «박스1개»
    weightKg?: number;           // 🔴 무게 — 픽커 «5kg 이하» · 화물24시 적재중량 «3.85톤»
    sizeCm?: number;             // 🔴 세 변의 합 — 픽커 «100cm»
    passengerCount?: number;     // 🔴 화주가 함께 타는 사람 수 — 인성 «2분동승+» · «1인동승»
    careTags?: string[];         // 🔴 취급 주의 글자 그대로 — 픽커 «깨지기 쉬워요» · «신선식품이에요». handling 은 다른 뜻으로 쓰이는 낱말이라 피한다
}

/** 약속 한 건 — 상차와 하차가 같은 모양이다 */
export interface CallPromise {
    text?: string;               // 화면 글자 그대로. 옮기는 동안은 지금 scheduleText 값을 담는다 — 인성은 하차 앞글자, 화물24시는 하차 날 표시가 섞일 수 있다 — 인성 «낼7시/» · 픽커 «내일 14:00 픽업예약»
    reserved?: boolean | null;   // 예약 표시가 있나. 지금 코드는 화물24시 «당상» 같은 날 표시도 예약으로 읽는다(ReservationText.kt). 뜻을 나누는 것은 따로 승인을 받는다
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
    postTime?: string;           // 콜을 올린 시각 — 화물24시 «등록시간». 인성에는 이 칸이 없다. 옮기는 동안은 지금 값을 담는다 (인성은 줄의 첫 HH:MM)
}

/** 조건은 뭔가, 가서 뭘 해야 하나 */
export interface CallJob {
    tripType?: string;           // 편도 · 왕복 · 경유 — 인성 «구분» · 줄 바탕색. 옮기는 동안 플렉스는 지금 값 «과적»이 그대로 들어온다. 읽는 코드를 옮길 때 나눈다
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
    fromOtherOffice?: boolean;   // 🔴 공유콜인가 — 인성 · 플렉스 목록 맨 앞 «@». 플렉스는 줄마다 붙어 늘 true 라 가르는 힘이 없다. 목록 값을 상세가 덮지 않는다. 합짐 여부 isShared 와 다른 값이다
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
    timestamp?: string;                 // 원달앱이 콜을 읽은 시각 — 옛 timestamp (원달앱)
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

/** 돈 받기 — 콜을 잡은 뒤 돈을 받는 과정. BaseCall 밖이고 orderId 로 콜에 붙는다. 🔴 앞 세 칸만 지금 있는 칸이고 나머지는 키만 정했다. 옛 SettlementInfo 와 orders.dueDate 는 읽는 코드가 없어 이어받지 않는다 */
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
    listKey: string | null;      // 같은 콜 찾기 글자 — route.listRegion. detail.ts:142 자리
    navAddress: { pickup: string | null; dropoff: string | null };  // 내비에 찍을 주소 — addressDetail, 없으면 listRegion. geocodeTargetOf 자리
    phone: { pickup?: string; dropoff?: string };  // 걸 번호 — 기존 stopPhoneOf
    money: {
        grossWon: number | null;     // 수수료 전 합계. 모르면 null
        takeHomeWon: number | null;  // 🔴 손에 오는 돈. 처음에는 지금 fare 와 같은 값을 돌려 판정을 안 바꾼다. 인성 요금은 이미 수수료 뒤라 다시 빼지 않는다. 화물24시 fare 는 목록 요금이라 collectedFee 가 들어 있다. 🔴 뺄지는 그 돈의 뜻을 안 뒤 정한다. criteria.ts:125 자리
        collectWon: number | null;   // 현장에서 받을 돈. 화물24시 선/착불 콜의 금액은 «수»의 뜻을 안 뒤 정한다
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
/** 끝 모습의 서버 쪽 콜 — BaseCall 과 보고 값 · 좌표 · 서버 값을 합친다 */
export type NextServerSide = BaseCall & CallReport & CallCoordinates & ServerCallFields;
/** 끝 모습의 심사 중 콜 — BaseCall 과 보고 값 · 좌표 · 서버 값을 합친다. 서버 메모리에만 있고, 아직 아무도 안 쓴다 */
export type NextPendingOrder = NextServerSide & ApproxAddress & QuickFoldFields & { status: OrderStatus; judgeUntil?: number };
/** 끝 모습의 내 콜 — 기사님이 KEEP 해 내 것이 된 콜. 아직 아무도 안 쓴다 */
export type NextMyOrder = NextServerSide & {
    status: MyOrderStatus; reservedFor?: string; completedAt?: string | null; terminatedAt?: string | null;
    judgment?: JudgmentSnapshot; progress?: NetworkProgress; settlement?: CallSettlement;
};
/** 끝 모습의 관제웹 콜 — 심사 중 콜과 내 콜을 한 모양으로 받는다. 아직 아무도 안 쓴다 */
export type NextSecuredOrder = NextServerSide & ApproxAddress & QuickFoldFields & {
    status: OrderStatus; completedAt?: string | null; terminatedAt?: string | null; judgeUntil?: number;
    judgment?: JudgmentSnapshot; progress?: NetworkProgress; settlement?: CallSettlement;
};
// 🔴 옮기는 동안: 평평한 칸을 BaseCall 에서 뽑아 주는 함수를 두고 읽는 코드를 묶음별로 옮긴다.
// 🔴 합치기: evolveOrder 는 얕은 병합이라 route · money 를 통째로 지운다. 칸별로 합치고 금액은 종류별로 합치는 코드와 검사가 필요하다.
// 🔴 저장: orders 표에 BaseCall 과 기록을 담을 JSON 글자 칸을 더한다 (routePolyline 이 같은 방식).

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
        { goes: "원문만 남김", value: "«짐/» · «짐)» · «X@» · «[착]» · «[1322]» · «27:23» · 완료목표시간", network: "인성", screen: "목록 · 상세", why: "뜻을 모른다. 글자는 화면 기록(CallEvidence)과 원문에 남는다" },
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

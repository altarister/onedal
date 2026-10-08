import type { PaymentType, BillingType } from './paymentTypes';
import type { OrderStatus, MyOrderStatus } from './callStatus';

export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
    MANUAL: "MANUAL" as const,
    SIMULATION: "SIMULATION" as const,
    ALARM: "ALARM" as const,
};

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// 나중에 상세 주소나 위경도가 필요할 때를 대비한 하위 객체
export interface LocationPoint {
    code?: string;
    name: string;             // 예: "역삼동"
    fullName?: string;        // 예: "서울 강남구 역삼동"
    centroid?: [number, number];
}

// [신규] 출발지/도착지 팝업에서 긁어올 상세 정보 (운행일지 및 리뷰 작성용)
// 인성앱 "출발지 상세" / "도착지 상세" 팝업 기준 1:1 매핑
export interface LocationDetailInfo {
    customerName?: string;    // [고객] 상호/고객명 (예: "*레드캠프", "SK스토아 홈쇼핑(5층하차")
    department?: string;      // [부서] 부서명 (예: "정실장님", 빈 값일 경우 "*")
    contactName?: string;     // [담당] 담당자명 (예: "정종혁차장")
    mileage?: number;         // [마일리지] 마일리지 포인트 (예: 0)
    phone1?: string;          // [전화1] 대표 연락처 (예: "010-2228-4991")
    phone2?: string;          // [전화2] 보조 연락처 (예: "031-267-1224", 빈 값일 경우 "*")
    region?: string;          // [출발/도착] 광역 지역명 (예: "경기 화성시", "서울 마포구")
    addressDetail?: string;   // [위치] 상세 주소+건물명 (예: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)")
    requestedTime?: string;   // 상차/하차 예약 시간 (확정 페이지에서 파싱, 예: "13:53")
    memo?: string;            // 현장 전달사항 (적요 등에서 추출)
}

// 1. [목록 위젯] 매크로가 0.01초만에 읽어야 하는 겉표면 텍스트
export interface SimplifiedOfficeOrder {
    /** 🌐 픽커 전용 — 물품 크기(초소형/소형…). 차종 칸에 섞지 않는다 (규칙 ⑤-4 ⑤) */
    itemSize?: string | null;
    /** 🌐 픽커 전용 — 태그 원문(급송·예약 17:00·준비 29분…) */
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
    postTime?: string;                // [추가] 앱에서 긁어온 콜 상차시간/등록시간 (예: "12:23")
    scheduleText?: string;            // [추가] 예약일정/수식어 (예: "낼09시", "11일)09시", "@")
    vehicleType?: string;             // [추가] 차종 (예: "라", "다", "1t" 등)
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
    // (선택) MOCK 지도 연산 및 시뮬레이션 용 임시 좌표
    pickupX?: number;
    pickupY?: number;
    dropoffX?: number;
    dropoffY?: number;
    pickupDistance?: number;          // 상차지까지의 남은 직선 거리 (km)
    /**
     * 배송거리 (상차지 → 하차지, km). 리스트 최좌측 두 숫자 중 **두 번째** 값.
     * 앱의 단가 판정(`fare ≥ deliveryDistance × ratePerKm[차종]`) 입력이며,
     * 서버는 판정 근거를 로그에 남길 때 쓴다 (실제 판정은 카카오 도로거리로 다시 잰다).
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
// 2. [상세 페이지] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface DetailedOfficeOrder {
    // 1. 배차사(퀵사무실) 정보 (상세화면 최상단)
    dispatcherName?: string;          // 배차 사무실 상호 (예: "고양퀵서비스")
    dispatcherPhone?: string;         // 배차 사무실 연락처 (예: "031-932-7722")
    
    // 2. 문서/전표 기본 정보
    receiptStatus?: string;           // 전표 상태 (예: "신규", "수정", "취소")
    itemDescription?: string;         // 물품 요약 (예: "소형 가전", "박스 2개")
    vehicleType?: string;             // 차량 종류 (예: "1t", "다마스")
    
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
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
    pickupDetails?: LocationDetailInfo[];  // 출발지 상세 정보 (팝업 파싱)
    dropoffDetails?: LocationDetailInfo[]; // 도착지 상세 정보 (팝업 파싱)
    distanceKm?: number;              // 운행 거리(km)
    
    // 6. 메타 데이터 및 호환성 필드
    isMock?: boolean;                 // 목업 콜 여부
    isShared?: boolean;               // 합짐(혼적) 여부
    isExpress?: boolean;              // 급송(독차) 여부
    companyName?: string;             // 화주 상호/이름 (과거 호환 유지 목적)
    pickupTime?: string;              // 픽업 예약 시간 지정
}

// (FilterConfig removed in favor of AutoDispatchFilter)
// 3. [오더 풀스팩] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder {
    /** 어느 배차망에서 온 콜인가 — TARGET_APPS 표준값 (앱 confirm 페이로드가 싣는다).
     *  🔴 원장(orders.targetApp)에 저장 — 배차망별 콜 검색·분석의 근거 (기사님) */
    targetApp?: string;
    /** 🖱️ 잡은 방식 — 6하원칙의 «어떻게» (CAPTURED_VIA · 기록 전용, 보호 분기는 matchType).
     *  구앱·모르는 값은 null — 지어내지 않는다 (기사님 확정) */
    capturedVia?: string | null; }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-A] 심사 중 오더 — 서버 메모리 전용 (아직 내 퀵이 아님)
// 앱이 긁어와서 서버가 꿀/똥콜 판별 중인 임시 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 📍 **주소 대략** — 서버가 주소를 못 찾아 읍·면·동 중심으로 판정했으면 그 이름(«마장면»). 정확하면 없다.
 *    서버가 판정 때 싣는다(앱이 보내는 칸 아님 · DB 칸 아님). 심사 중 콜과 확정 콜이 같이 든다.
 */
export interface ApproxAddress {
    pickupApprox?: string | null;
    dropoffApprox?: string | null;
}

/**
 * ⏩ **빨리 접기 재료** — 서버가 심사 콜에 싣는다(DB 칸 아님).
 *    `openedByApp`: 이 상세를 앱이 알람 모드로 목록에서 눌러 열었나(/confirm · 모르면 없음 · 기록 칸 capturedVia 와 따로).
 *    `foldAfterSec`: 판정 끝에 정한 빨리 접기 초(`quickFoldSecOf`) — 있으면 judgeUntil 이 판정 끝 + 그 초로 당겨진다.
 */
export interface QuickFoldFields {
    openedByApp?: boolean;
    foldAfterSec?: number | null;
}

export interface PendingOrder extends OfficeOrder, ApproxAddress, QuickFoldFields {
    status: OrderStatus;                  // ORDER_PRE_SECURED | ORDER_SECURED_EVALUATING | ORDER_AWAITING_DECISION
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 **그때의 필터값**을 그대로 적는다 (`filterGoals.goalCityOf`) — 좌표로 가르지 않는다.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /** 👀 미리보기 콜 — 확정 전이라 취소 카운트에 안 들어간다 (`DispatchBasicRequest.isPreview`) */
    isPreview?: boolean;
    /**
     * ⏱️ **남은 판정 시간이 끝나는 시각** (밀리초) — 미리보기에만 싣는다. 심사석 배경이 이것으로 찬다.
     * 🔴 이 시각이 지나도 콜은 안 사라진다 — 끄는 것은 폰의 화면 상태 하나다 (`devices.leftDetail`).
     */
    judgeUntil?: number;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    /**
     * 🚚 **배송거리** (상차지 → 하차지, km) — 앱이 리스트에서 긁어 온 값.
     *
     * 🔴 **타입에만 없었다** (고침). `orders` 테이블에 `deliveryDistance REAL`
     *    로 살고 `GET /orders` 가 그대로 보내는데 여기 선언이 없어서, 관제웹이
     *    `(route as any).deliveryDistance` 로 읽고 있었다 — **`as any` 가 «타입이
     *    실제보다 좁다»는 사실을 덮고 있었다.**
     *    같은 이름이 `SimplifiedOfficeOrder` 에도 있다 (앱이 올려 주는 쪽).
     */
    deliveryDistance?: number;
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    /**
     * 🎨 **구간이 끝나는 자리** — `routePolyline` 안에서 각 구간의 **끝 인덱스(누적)** 다
     *    지도가 «구간마다 그 콜의 색»으로 그리려면 경계가 필요한데
     *    통짜 배열은 그것을 잃는다.
     *
     * 🔴 **선을 한 벌 더 보내지 않는다** — 같은 점열을 복제하면 초당 수백 KB 가 오가 브라우저가 죽는다. 경계는 숫자 몇 개뿐이고
     *    `sectionLinesOf()` 가 그것으로 잘라 준다 (파생은 한 곳 · 규칙 ③).
     * ⚠️ `sectionStops` 가 «정거장마다»라면 이건 «정거장 사이마다»라 길이가 하나 짧다 —
     *    카카오 `sections` 를 그대로 따른다.
     */
    sectionEnds?: number[];
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = 카카오호출시점
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 (내 퀵) — 기사가 KEEP하여 내 소유가 된 오더
// 업계 표준: 배차확정(CONFIRMED) → 상차완료(PICKED_UP) → 하차완료(DELIVERED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 🎨 **판정 스냅샷** (판정색 확정안 v2) — 심사 1회, 불변.
 * 심사 카드가 조건 전수를 이걸로 그리고, **색도 여기서 온다** (4단계).
 *
 * import 순환을 피해 `dryRun.ts` 의 `DryRunVerdict` 를 구조로 적는다.
 * 🔴 **여기 한 곳에만 적는다** (규칙 ③) — `SecuredOrder` 에만 두면 `MyOrder` 로 다니는 콜
 *    (재시작 복구가 만드는 것)에 **색이 실리지 못한다.**
 */
export interface JudgmentSnapshot {
    color: '꿀' | '보통' | '똥' | '사고';
    /** 🔴 못 쟀으면 `null` — **0 이 아니다** (0 은 «나쁘다»로 읽힌다) */
    score: number | null;
    /** 🔴 못 잰 기준은 `score` 가 `null` 이다 — 0 은 «나쁘다»로 읽힌다 */
    axes: Array<{ key: string; name: string; score: number | null; weight: number; raw: string; value?: number }>;
    gates: Array<{ key: string; name: string; pass: boolean; why: string | null }>;
    tags: string[];
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

export interface MyOrder extends OfficeOrder {
    status: MyOrderStatus;            // ORDER_CONFIRMED | ORDER_PICKED_UP | ORDER_DELIVERED
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 **그때의 필터값**을 그대로 적는다 (`filterGoals.goalCityOf`) — 좌표로 가르지 않는다.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /**
     * 📅 **예약 보관 날 `YYYY-MM-DD`** — 잡은 날 + `reservedDay`. 오늘보다 뒤면 이 콜은 진행 중 콜이 아니라
     *    세션의 예약 보관(`reservedOrders`)에 있다. 장부 자리는 `orders.reserved_for`. 오늘 콜이면 비어 있다.
     */
    reservedFor?: string;
    /** 🏁 하차한 시각 (장부 `orders.completedAt`) — 화면의 사이클 경계가 본다 (#40) */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /**
     * 👀 미리보기 콜. 확정되면 `false` 로 덮여 보통 콜이 된다 —
     * `PendingOrder` 와 **같은 모양이어야** 두 타입이 한 함수(`pickRouteHolder` 등)에
     * 섞여 들어갈 때 갈라지지 않는다.
     */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    /** 🎨 판정 스냅샷 — `SecuredOrder` 와 **같은 타입**을 가리킨다 (규칙 ③) */
    judgment?: JudgmentSnapshot;
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    /**
     * 🚚 **배송거리** (상차지 → 하차지, km) — 앱이 리스트에서 긁어 온 값.
     *
     * 🔴 **타입에만 없었다** (고침). `orders` 테이블에 `deliveryDistance REAL`
     *    로 살고 `GET /orders` 가 그대로 보내는데 여기 선언이 없어서, 관제웹이
     *    `(route as any).deliveryDistance` 로 읽고 있었다 — **`as any` 가 «타입이
     *    실제보다 좁다»는 사실을 덮고 있었다.**
     *    같은 이름이 `SimplifiedOfficeOrder` 에도 있다 (앱이 올려 주는 쪽).
     */
    deliveryDistance?: number;
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    /**
     * 🎨 **구간이 끝나는 자리** — `routePolyline` 안에서 각 구간의 **끝 인덱스(누적)** 다
     *    지도가 «구간마다 그 콜의 색»으로 그리려면 경계가 필요한데
     *    통짜 배열은 그것을 잃는다.
     *
     * 🔴 **선을 한 벌 더 보내지 않는다** — 같은 점열을 복제하면 초당 수백 KB 가 오가 브라우저가 죽는다. 경계는 숫자 몇 개뿐이고
     *    `sectionLinesOf()` 가 그것으로 잘라 준다 (파생은 한 곳 · 규칙 ③).
     * ⚠️ `sectionStops` 가 «정거장마다»라면 이건 «정거장 사이마다»라 길이가 하나 짧다 —
     *    카카오 `sections` 를 그대로 따른다.
     */
    sectionEnds?: number[];
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = 카카오호출시점
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    settlement?: SettlementInfo;      // 정산 및 미수금 관리 트래킹 (운행일지용)
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// [통합] SecuredOrder — PendingOrder와 MyOrder를 모두 아우르는 통합 인터페이스
// 프론트엔드(useOrderEngine, PinnedRouteCard)에서 심사 중 + 확정된 오더를 하나의 배열로 관리
export interface SecuredOrder extends OfficeOrder, ApproxAddress, QuickFoldFields {
    status: OrderStatus;                  // 단일 통합 라이프사이클 상태
    capturedDeviceId: string;
    capturedAt: string;
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 **그때의 필터값**을 그대로 적는다 (`filterGoals.goalCityOf`) — 좌표로 가르지 않는다.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /**
     * 🏁 **하차한 시각** (장부 `orders.completedAt`). 없으면 아직 안 내렸거나 옛 행이다.
     * 화면의 사이클 경계가 이걸 본다.
     */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /** 👀 미리보기 콜 — 확정 전이라 아직 안 잡은 콜이다 */
    isPreview?: boolean;
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
    kakaoCalculatedFare?: number;
    kakaoTimeExt?: string;
    routePolyline?: Array<{ x: number; y: number }>;
    /** 🎨 구간이 끝나는 자리 — `routePolyline` 을 콜 색으로 칠하려면 이 경계가 필요하다 */
    sectionEnds?: number[];
    /** 🧭 구간마다 어느 정거장인가 — `sectionEnds` 와 같은 길이. 구간의 **색 주인**이다 */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    totalDistanceKm?: number;
    totalDurationMin?: number;
    kakaoSoloDistanceKm?: number;
    kakaoSoloDurationMin?: number;
    approachDurationMin?: number;
    osrmError?: string;
    sectionEtas?: string[];
    sectionDriveMin?: Array<number | null>;
    routeComputedAt?: string;
    arrivedPickupAt?: string;
    arrivedDropoffAt?: string;
    pickupEta?: string;
    dropoffEta?: string;
    settlement?: SettlementInfo;
    rejectionReasons?: string[];
    approvalReasons?: string[];
}

// [신규] 운행일지 정산 및 미수금 추적을 위한 구조체
export interface SettlementInfo {
    status: '미정산' | '지급예정' | '정산완료' | '미수금'; // 현재 돈을 받았는지 상태
    unpaidAmount: number;             // 받지 못한 금액 (미수금) 
    payerName?: string;               // 결제/입금 담당자명 또는 회사명 (예: "레드캠프 경리팀")
    payerPhone?: string;              // 결제 담당자 연락처 (이 번호로 전화해서 청구)
    dueDate?: string;                 // 입금 예정일 (예: "매월 말일", "15일", ISO date 등)
    memo?: string;                    // 정산 관련 메모 (예: "수수료 떼고 입금하기로 함", "전화 안받음")
}

import type { CapacityConfidence } from './vehicles';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 1] 기사 행동 상태 — 기사님이 직접 버튼을 눌러 전환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type DriverAction =
    | 'WAITING'      // 콜 대기중 (주차 상태에서 앱 보며 콜 고르는 중)
    | 'DRIVING'      // 운전중 (상차지든 하차지든 어딘가로 이동 중)
    | 'LOADING'      // 상차중 (픽업지에서 물건 싣는 중)
    | 'UNLOADING'    // 하차중 (하차지에서 물건 내리는 중)
    | 'RESTING';     // 휴식중 (밥, 화장실, 일시정지)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 3] 콜 잡기 전략 단계 — DriverAction + 확정 콜 수에서 파생
// DB에 저장하지 않음. 순수 계산(Pure Function)으로만 도출.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type DispatchPhase = 'STANDBY' | 'GATHERING' | 'DELIVERING';

// 자동배차 설정 인터페이스 (전역 설정 동기화용)
// [하위 호환] 기존 코드가 LoadState를 아직 참조할 수 있으므로 alias 유지
export type LoadState = 'EMPTY' | 'LOADING' | 'DRIVING' | 'ARRIVED';

export interface AutoDispatchFilter {
    /**
     * [Phase 8.4] 지금 잔여 적재량을 얼마나 믿을 수 있는가.
     * 관제탑에 그대로 표시한다 — '추정' 상태에서 잡은 합짐은 현장에서 안 들어갈 수 있다.
     */
    capacityConfidence?: CapacityConfidence;
    allowedVehicleTypes: string[];   // 허용 차종 배열 (예: ["1t","다마스"]) — 빈 배열이면 모든 차종 허용
    isActive: boolean;              // 필터링(매크로) 활성화 여부
    /**
     * 🔒 **지금 이 폰이 심사 중인 콜이 있나** — 앱이 «잠김»의 까닭을 가르는 사실.
     *    저장하지 않는다 — 서버가 조립할 때 `deviceEvaluatingMap` 에서 파생시켜 싣는다 (`scrap.ts`).
     *    앱은 이것이 참이면 **판정은 하고 클릭만 미룬다** — `isActive=false`(만석)와 다르다.
     */
    evaluatingNow?: boolean;
    isSharedMode: boolean;          // 첫짐/합짐 분기 (true면 합짐 경유, false면 첫짐 수동)
    driverAction: DriverAction;     // [V2] 기사 행동 상태 (WAITING, DRIVING, LOADING, UNLOADING, RESTING)
    dispatchPhase: DispatchPhase;   // [V2] 콜 잡기 전략 단계 (STANDBY, GATHERING, DELIVERING) — 파생값
    pickupRadiusKm: number;         // 내위치 반경 상차지 탐색(km)
    minFare: number;                // 최소 운임 (하한선)
    maxFare: number;                // 최대 운임 (디폴트 100만)
    /**
     * 하차 목표 메인 지역 (시/군/자치구).
     * ⚠️ 앱은 이 값을 **판정에 쓰지 않는다** — 서버가 읍/면/동으로 펼쳐
     *    `destinationKeywords` 로 보내기 때문이다. (`destinationRadiusKm` 도 같다)
     */
    destinationCity: string;
    destinationRadiusKm: number;    // 하차 목표 주위 탐색 반경 (km)
    excludedKeywords: string[];     // 제외 단어 배열 (예: ["착불", "수거", "까대기"])
    destinationKeywords: string[];  // (내부망) 앱 파싱용 읍/면/동 50개 키워드 배열
    /**
     * 📋 **상차 목록** — 원달앱이 상차지를 거르는 읍·면·동 목록 (기사님 확정 · 하차 목록»).
     *    서버가 필터 영역에서 파생한다(`filterNet.rebuildPickupList`) · 저장하지 않는다. 아직 안 만들었으면 undefined.
     */
    pickupKeywords?: string[];
    /**
     * 🗂️ **상차 목록을 시 · 군 · 구로 묶은 것** (기사님 «동 점 다시 넣어줘»).
     *    서버가 `pickupKeywords` 와 함께 만든다(`filterNet.rebuildPickupList`) · 저장하지 않는다 · 원달앱에는 안 간다(`APP_FILTER_KEYS` 밖).
     *    읽는 곳: 관제웹 지도 «동 점»이 찍는다(`dongDotsOf`) — 하차 목록은 상차 목록을 빼지 않으므로 안 읽는다.
     */
    pickupGroups?: Record<string, string[]>;
    /**
     * 🗺️ **상차 영역을 지도에 그릴 재료** (기사님 «현위치 영역에 교집합 영역이 보이지 않는다»).
     *    목록을 만든 그 순간의 값 — 관제웹이 이것으로 shared `goalZonesOf` 를 다시 불러 서버와 같은 모양을 칠한다 (원 중심은 관제웹 실시간 위치).
     *    ⚠️ **앱에 안 내려간다** (`APP_FILTER_KEYS` 밖). 저장하지 않는다 — `rebuildPickupList` 가 목록과 함께 만든다.
     */
    pickupArea?: {
        /** 목록을 만든 내 위치 */
        at: { x: number; y: number };
        homeCity: string | null;
        homeOn: boolean;
        /** 집 방향 콜을 쥐었나 (`homeCallsFrom`) */
        homeCaught: boolean;
        /** 라인 띠를 썼나 — 관제웹은 지금 그리는 경로 선으로 띠를 잰다 */
        hasLine: boolean;
    };
    destinationGroups?: Record<string, string[]>; // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customCityFilters: string[];    // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    detourRadiusKm?: number;      // (합짐 모드) 경로 주변 이탈 허용 반경 (기본값 5km, DB설정값)
    userOverrides?: boolean;        // 기사가 팝업에서 수동으로 필터(destinationKeywords 등)를 조작했는지 여부(서버 덮어쓰기 방지용)

    /**
     * 📐 **마름모의 모양 — 국면 밖 한 벌** (`QuadShape`).
     *
     * 관제웹 지도가 «가는 길목»을 이 셋으로 그린다. 국면과 무관한 값이라 국면 그릇이 아니라
     * 여기(사용자당 한 벌)에 실려 온다 — DB 자리는 `user_filters`.
     *
     * ⚠️ **앱에는 안 내려간다** (`scrap.ts` 가 뗀다) — 앱은 그물 모양을 모르고,
     *    서버가 이미 읍·면·동으로 펼쳐 `destinationKeywords` 로 보낸다
     *    (`detourRadiusKm`·`callDiscountPct` 와 같은 처지).
     */
    srcAngleDeg?: number;
    dstAngleDeg?: number;
    quadRadiusKm?: number;

    /**
     * 📐 **반경 넷을 목적지까지 거리에 맞춰 자동으로**.
     *
     * 기사님: *"목적지와의 거리에 따라 … **자동으로 바뀌어 주면 좋겠다.
     * 그래서 자동, 수동으로** 만들어 주는 거야."*
     *
     * 🔴 **수동 값과 기준반경(자동) 값은 처음부터 독립된 두 벌이다**(기사님 확정 ·
     *    탭을 바꿔도 서로 안 섞이게). 수동이면 `pickupRadiusKm` 등 넷을 그대로 쓰고,
     *    기준반경이면 아래 `*Auto` 넷에 배율(거리 ÷ `radiusBaseKm`)을 곱한다 —
     *    둘 중 어느 쪽을 쓸지와 그 배율은 `effectiveRadii` 한 곳이 정한다(규칙 ③).
     *    앱에는 **계산된 반경**이 내려간다 — 앱은 모드를 모른다.
     * ⚠️ 각도 둘은 자동이 손대지 않는다 — 거리와 무관한 «방향 허용폭»이다.
     */
    /** 기준반경(자동) 전용 — 현위반경. DB 자리는 `user_filters.pickup_radius_km_auto` */
    pickupRadiusKmAuto?: number;
    /** 기준반경(자동) 전용 — 목적반경. DB 자리는 `user_filters.destination_radius_km_auto` */
    destinationRadiusKmAuto?: number;
    /** 기준반경(자동) 전용 — 라인반경. DB 자리는 `user_filters.detour_radius_km_auto` */
    detourRadiusKmAuto?: number;
    /** 기준반경(자동) 전용 — 마름모반경. DB 자리는 `user_filters.quad_radius_km_auto` */
    quadRadiusKmAuto?: number;
    /**
     * 🛣️🔷 **노선 / 동선 — 그물을 어떤 모양으로 볼까**.
     *    노선(true)은 경로 양옆(라인반경) ∪ 목적지, 동선(false)은 내 위치 → 목적지 마름모 하나.
     * 🔴 **필터 값이다** — 화면에만 두면 서버가 몰라 «동선»을 골라도 판정·앱 목록은 노선이고,
     *    새로고침하면 노선으로 돌아간다. DB 자리는 `user_filters.route_mode`.
     * ⚠️ 앱에는 안 내려간다 — 앱은 그물의 결과(동 목록)만 본다.
     */
    routeMode?: boolean;
    /**
     * 📅 **예약콜 축** — 내일 이후 예약 콜을 받나 (기사님 결정 기본 «오늘 콜만»).
     *    읽는 곳은 원달앱 1차 필터 하나다 — 서버는 이 값으로 거르지 않는다. DB 자리는 `user_filters.reservation_mode`.
     * ⚠️ 지금은 `today` 하나만 쓴다 — 내일 콜을 담을 그릇(예약 보관)이 서기 전에는 나머지 둘을 고를 수 없다.
     */
    reservationMode?: ReservationMode;
    radiusAuto?: boolean;
    /** 기준 거리 km — «지금 값이 몇 km 갈 때 맞춘 것인가». 근거는 `RADIUS_BASE_KM_DEFAULT` */
    radiusBaseKm?: number;
    /**
     * 📏 **마름모 축의 길이(km) — 서버가 잰 «재료»** · 읽기 전용 · DB 저장 안 함.
     *
     * 첫짐은 «내 위치 → 목적지», 합짐은 «마지막 하차지 → 목적지». 배율은 여기서 안 싣는다 —
     * **`effectiveRadii` 가 이 거리와 `radiusBaseKm` 으로 어디서든 낸다** (규칙 ③).
     *
     * ⚠️ 처음엔 배율(`radiusScale`)을 서버가 재서 실었다. 그러자 화면이 기준거리를 끄는 동안
     *    **지도가 못 따라왔다** — 배율을 다시 낼 재료가 없었다 (전수 조사 1단계 실측).
     *    서버는 재료만 싣고 셈은 한 함수가 한다.
     * ⚠️ 자동·수동과 무관하게 싣는다 — 그래야 수동에서 «자동이면 얼마가 되나»를 미리 볼 수 있다.
     *    못 재면 **없다** — 0 으로 지어내지 않는다.
     * 🔄 **하루에 한 번 잰 값을 들고 있는다** (`heldRadiusDistanceKm`). `null` 은 «다시 구하기» —
     *    관제웹이 보내면 서버가 지금 위치로 다시 잰다.
     */
    radiusDistanceKm?: number | null;

    /**
     * 🚚 **기사님이 «받겠다»고 고른 차종**.
     *
     * 기사님: *"내 차가 1톤이지만 **라보 다마스 짐만 받겠다** … 합짐을 위해 필요."*
     *
     * 🔴 **`allowedVehicleTypes` 와 답하는 질문이 다르다** (규칙 ⑤-4 ⑤):
     *      · `acceptedVehicleTypes` «나는 어떤 짐을 **받겠다**고 했나» — **기사님**이 정한다
     *      · `allowedVehicleTypes`  «지금 짐 때문에 어떤 것이 **막혔나**» — **서버**가 파생한다
     *    겹쳐 두면 기사님이 고른 것이 **짐 한 번에 지워진다** (사고).
     * 🔴 **비어 있으면 «제한 없음»** — 새 칸이 생겨도 아무것도 안 바뀌는 것이 기본이다.
     * ⚠️ **앱에 안 내려간다** (`APP_FILTER_KEYS` 밖) — 앱은 서버가 낸 교집합
     *    (`allowedVehicleTypes`) 하나만 본다.
     */
    acceptedVehicleTypes?: string[];

    /**
     * 🚫 **제외 지역 — 국면 밖 한 벌**.
     *    *"거긴 안 간다"* 는 그 지역이지 그 국면의 사정이 아니다. DB 자리는 `user_filters`.
     *    키 문법은 `S|도` · `R|시군구` · `D|시군구|동` — 규칙은 `shared/callNet.ts` 하나다.
     *
     * ⚠️ **앱에는 안 내려간다** (`scrap.ts` 가 뗀다). 서버가 `destinationKeywords` 를
     *    만들 때 이미 뺐으므로 앱은 제외를 몰라도 된다.
     */
    excludedRegions?: string[];
    /**
     * 🎯 **그물이 실제로 향하는 시** — 서버가 파생 · 읽기 전용 · DB 저장 안 함 (전수 조사 ①-1).
     *
     * `callTarget` 이 HOME 이면 **집이 있는 시**, 아니면 `destinationCity`. 기사님이 정한
     * `destinationCity` 는 복귀를 켜도 **한 번도 안 바뀐다** — HOME 으로 갈 때 덮어쓰면 돌아올 때
     * 덮인 값이 남아 목적지가 집 시로 굳는다.
     * 🔴 «저장했다 되돌리는» 대신 **매번 파생**한다 (규칙 ③). 목업이 그 모양이다 —
     *    복귀를 켜면 목적지가 바뀌는 게 아니라 **얹힌다.**
     * 앱에는 이 값이 `destinationCity` 자리에 실려 간다 (앱은 «어디로 가나» 하나만 안다).
     */
    goalCity?: string;
    /**
     * 🏠 **살아 있는 목적지 전부** — 서버가 파생 · 읽기 전용 · DB 저장 안 함 (전수표 #6 · `callNet.activeGoals`).
     *    복귀 끔: [목적지] · 복귀 켬·복귀콜 없음: [목적지, 집] · 복귀콜 잡음: [집]. 지도가 목적지마다 그물을 그린다.
     *    🔴 앱에 안 내려간다 — 앱은 합친 동 목록(`destinationKeywords`)만 본다.
     */
    goalCities?: string[];

    // ── 단가 판정 모델 ──
    // 셋 다 optional: 구버전 앱은 이 키들을 파싱하지 않으므로 무시된다 (호환).
    // minFare(최소 금액)는 🔍 필터에서 고친다 — 앱은 ratePerKm 을 못 쓸 때(배송거리를 모를 때) 그것으로 거른다. maxFare 는 보류 칸.
    /** 차종별 하한 단가(원/km) = 실수령 시세 × (1 − 콜할인율). 판정: fare ≥ 배송거리 × ratePerKm[차종] */
    ratePerKm?: Record<string, number>;
    /** 콜할인율 — 시세 대비 허용 할인 %. 100 = "전부"(금액 무관) */
    callDiscountPct?: number;
    /**
     * 사용 중인 적재 **박스 수** (내 1t 트럭 = 100박스 · `TRUCK_CAPACITY_SLOTS`).
     * 명목값이며 통화 확인 시 갱신.
     * ⚠️ 앱·서버·관제웹이 함께 읽는 칸이라 단위(박스)를 잘못 읽으면 비용이 크다
     */
    slotsUsed?: number;
    /** 지금 어느 국면을 콜 잡기하는가 — 기사님이 요약줄 스와이프로 고른다 (기본 DEST) */
    callTarget?: CallTarget;
    /**
     * 🗺️ 키워드 트랩 — 키워드로 시작하는 더 긴 다른 지명 (예: 남동 → [남동구]).
     * 부분 문자열 오탐 방지(regionMatch ④)의 사전. destinationKeywords 에서 매번 파생.
     */
    keywordTraps?: Record<string, string[]>;
    /**
     * 🏘️ 이름이 같은 다른 지역 동 — 오늘 도착 목록의 동 가운데 명부에서 이름이 겹치는 것만, 값은 그 동이 뜻하는 시군구 꼴(cityAliases).
     * 앞에 다른 시·군·구가 보이면 거른다 · 목록 페이지에서 상세 주소가 안 보이면 통과 (regionMatch · 서버 filterManager 가 파생).
     */
    destinationDongSigungu?: Record<string, string[]>;
}

/** 📅 예약콜 축의 값 셋 — `today` 오늘 콜만 · `tomorrowToo` 내일 콜도 · `tomorrowOnly` 내일 콜만 */
export type ReservationMode = 'today' | 'tomorrowToo' | 'tomorrowOnly';

/**
 * 📦 **앱이 필터에서 읽는 키 — 유일한 원천**.
 *
 * 서버는 하트비트 응답에 **이 표의 키만** 싣는다 (`routes/scrap.ts`).
 *
 * 🔴 **골라 싣는다, 떼어내지 않는다.** «떼는 키»를 나열하면 **새 칸이 생길 때마다 그 목록에 넣어야 하고,
 *    안 넣으면 조용히 앱으로 간다.**
 *    골라 싣는 쪽은 **기본이 «안 간다»** 라 안전하다.
 *
 * ⚠️ 내일 콜 상차 칸(`reserved…`)처럼 `AutoDispatchFilter` 에 없는 칸은 조립할 때 얹는다.
 *    그래서 이 표는 «앱이 읽는 키»이지 «평면 필터의 부분집합»이 아니다.
 * 📋 앱이 보는 지역은 두 모음이다 — 상차 목록(`pickupKeywords`) · 하차 목록(`destinationKeywords`).
 *    경로 순서 숫자는 보내지 않는다 — 목적지 가까이 두 목록이 겹치는 곳에서는 방향과 상관없이 올리는 것이 설계다.
 *
 * 🔴 **표 ↔ 앱(Kotlin)이 어긋나면 `appFilterKeys.test.ts` 가 잡는다.** 앱이 읽는데
 *    서버가 안 보내면 **조용한 고장**이고(빈 값으로 거른다), 서버가 보내는데 앱이 안 읽으면
 *    **낭비**다 (예: `destinationGroups` 하나가 응답의 27%다).
 */
export const APP_FILTER_KEYS = [
    'isActive', 'isSharedMode',
    'pickupRadiusKm', 'destinationCity', 'destinationRadiusKm',
    'destinationKeywords', 'customCityFilters', 'keywordTraps',
    /* 🏘️ 이름이 같은 다른 지역 동 — 그 동이 뜻하는 시군구 꼴 (regionMatch · filterNet refreshDongSigungu) */
    'destinationDongSigungu',
    /* 📋 상차 목록 — 칸이 없는 옛 서버를 받는 원달앱은 상차 반경(pickupRadiusKm)으로 돌아간다 */
    'pickupKeywords',
    'excludedKeywords', 'allowedVehicleTypes',
    'minFare', 'maxFare', 'ratePerKm',
    /* 📅 예약콜 축 — 원달앱 1차 필터가 읽는다 (서버는 이 값으로 거르지 않는다) */
    'reservationMode',
    /* 📅 내일 이후 예약 콜 상차 — scrap 이 조립할 때 얹는다(기본 반경 · 집 둘레 동 목록 · 시군구 묶음) · 원달앱 FilterStore 가 읽는다 */
    'reservedPickupRadiusKm', 'reservedPickupKeywords', 'reservedPickupGroups',
    /* ⏱️ 배차망별 대기 시간 — 원천 DB user_settings */
    'safeCancelSecInsung', 'safeCancelSecHwamul24', 'pickerAlarmDetailSec',
    /**
     * 🔒 **지금 심사 중인 콜이 있나** — «잠김»의 까닭을 가르는 사실 (기사님 · 실주행 오송읍).
     *
     * `isActive=false` 는 **만석**이라는 뜻으로 이미 확정돼 있다(`capacityFullHold`).
     * 선점 중에도 그것을 끄면 앱은 둘을 구별 못 해, 목록에 콜이 보여도 판정조차 안 한다 —
     * 오송읍 셋을 잡는 데 3분 25초가 걸렸다. 이 칸이 있으면 앱은 **판정은 하고 클릭만 미룬다.**
     */
    'evaluatingNow',
    /**
     * 🔒 **콜 잡기 보류 까닭 — 만석 · 필터 고장** (35 X6 ①) — isActive 와 따로. 서버가 조립할 때 holds 에서 얹고(`appFilter.ts`) 저장하지 않는다.
     *    픽커는 isActive 를 안 읽고 이것만 본다 — 있으면 알람 · 상세 열기를 멈춘다(부트스트랩 · 복구 전에는 안 실려 울린다).
     */
    'captureHold',
] as const;

/**
 * 📦 **앱 필터를 화면 줄로 — 한 벌** (관제웹 현황판 · 운영센터 현황판의 «앱에 내려갈 필터» 칸이 같이 부른다).
 *    칸 순서는 `APP_FILTER_KEYS` 먼저, 표에 없는 칸(서버가 더 얹은 것)은 뒤에. 묶음 값은 줄인다 —
 *    목록은 «N개 · 앞 여섯 …», 맵은 «N개 키». 값을 다시 계산하지 않는다.
 */
export function appFilterRowsOf(app: Record<string, unknown>): Array<[string, unknown]> {
    const known = (APP_FILTER_KEYS as readonly string[]).filter(k => k in app);
    const rest = Object.keys(app).filter(k => !known.includes(k));
    return [...known, ...rest].map(k => {
        const v = app[k];
        if (Array.isArray(v)) return [k, v.length ? `${v.length}개 · ${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}` : '(빈 목록)'];
        return [k, v && typeof v === 'object' ? `${Object.keys(v).length}개 키` : v];
    });
}

/**
 * **타겟** — 기사님이 필터의 복귀 토글로 고른다.
 *
 *   DEST(노선행) ↔ HOME(복귀행) · 관내는 따로 재지 않는다 (목적지 가까이 옴 `filterArea.withNearness`)
 *
 * 스와이프 순서가 하루의 흐름과 같다: 목적지로 가다가, 거의 도착하면 그 동네 콜을 잡고,
 * 다 내리면 집 방향으로.
 *
 * ⚠️ `DispatchPhase`(STANDBY/GATHERING/DELIVERING)와 **다른 것**이다.
 *    · `DispatchPhase` — 지금 짐이 얼마나 실렸나. **데이터에서 파생**된다 (기사님이 못 고른다)
 *    · `CallTarget`     — 어느 방향을 콜 잡기하나. **기사님이 고른다**
 *    둘은 직교한다: "복귀행이면서 합짐 수집 중"이 정상적인 상태다.
 *
 * 🔴 국면 전환은 **필터만 바꾼다. 콜 상태는 절대 건드리지 않는다.**
 *    옛 `startTwoTrack` 은 전환하면서 활성 콜을 전부 `ORDER_COMPLETED` 로 만들었다 —
 *    기사님: *"콜은 무조건 배달을 해서 완료되어야 한다."* 배달하지 않은 콜이
 *    완료로 기록되면 정산·운행일지가 통째로 틀어진다.
 */
/**
 * 🧭 **콜을 어디로 향해 찾나** — 기사님이 고르는 것은 **둘뿐**이다.
 *
 * 기사님: *"우린 **집으로 갈건지 말껀지만** 있어."*
 *
 * 🔴 **관내(`'LOCAL'`)는 고르는 것이 아니다** — 목적지에 도착해 다른 곳을 안 정했으면 그곳 일을 한다.
 *    필터 영역이 «목적지 가까이 옴»(`filterArea.withNearness`)으로 알아서 좁혀진다.
 * 🔴 **같은 일을 하는 길을 둘 두지 않는다** (규칙 ③) — 그러면 언젠가 갈라진다.
 * ⚠️ `callTarget` 은 **DB 에 없고**(메모리뿐) **앱이 안 읽는다.**
 */
export type CallTarget = 'DEST' | 'HOME';

export const CALL_TARGET_LABEL: Record<CallTarget, string> = {
    DEST: '노선행',
    HOME: '복귀행',
};

/**
 * **이 필터로 콜을 잡아도 되는가.**
 *
 * 🔴 **빈 필터는 "제한 없음"이 아니라 "고장"이다.** 막지 않으면 두 겹이 같은 방향으로 열린다:
 *
 *    앱 (`InsungParser.kt`):
 *        if (filter.destinationKeywords.isEmpty()) true   // ← 아무 데나 통과
 *    서버 (`OrderEvaluator`):
 *        if (isSharedMode && destinationKeywords.length > 0) { ...검사... }
 *
 *    경유 계산이 0개를 내거나(경로 실패)
 *    목적지 도시가 비면, `isActive` 는 켜진 채 도착지 조건만 사라진다.
 *    필터가 느슨해지는 게 아니라 **없어지는** 것이다.
 *
 *    도착지가 정의되지 않은 상태는 "제한 없음"이 아니라 **"필터가 고장났음"** 이다.
 *    앱 기본값이 안전 방향인 것과 같은 판단이다 —
 *    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
 *
 * @returns 콜 잡기해도 되면 `null`, 안 되면 **왜 안 되는지** (그대로 로그·화면에 쓴다)
 */
export function callFilterBlocker(filter: AutoDispatchFilter): string | null {
    /* 📋 빈 상차 목록은 «제한 없음»이 아니라 고장이다 (규칙 ④). 아직 안 만들었으면(undefined) 옛 흐름이라 막지 않는다 */
    if (Array.isArray(filter.pickupKeywords) && filter.pickupKeywords.length === 0) return '상차 목록이 비었습니다 — 내 위치 둘레에서 동을 못 찾았습니다';
    if (filter.isSharedMode) {
        // 합짐은 경로에서 경유가 나와야 성립한다. 경유가 없으면 "가는 길"이 없는 것이다
        if (!filter.destinationKeywords?.length) return '경유가 아직 안 잡혔습니다';
        return null;
    }
    // 첫짐은 도착 목표가 있어야 성립한다
    if (!filter.destinationCity) return '도착 희망 지역이 비어 있습니다';
    if (!filter.destinationKeywords?.length) return `${filter.destinationCity} 에서 지역을 못 찾았습니다`;
    return null;
}

/**
 * **오늘 필터를 기본 설정으로 되돌린다.**
 *
 * 두 자리에서 쓴다. 규칙이 갈라지지 않게 여기 한 곳에만 둔다.
 *   · 영업일 전환 (자정을 넘겼다)               — `ensureBusinessDay`
 *   · 세션 생성 (서버 재시작·첫 접속)
 *
 * 되돌리지 **않는** 것은 없다 — 오늘 정한 것은 전부 기본값으로 간다.
 * 다만 경유 파생값은 기본 설정에도 없는 값이라 명시적으로 비운다.
 * 비워 두면 `recalculateDerivedFields` 가 **오늘의** 목적지 도시로 다시 만든다.
 * (어제 경로에서 나온 지역으로 오늘 콜 잡기하면 안 된다)
 *
 * ⚠️ `isActive` 는 기본 설정 값을 그대로 따른다. 끄지 않는다 —
 *    기사님: *"아침에 출근시 필터 설정 없으면 그냥 디폴트 값으로 콜을 잡는 거고."*
 */
export function resetToBaseFilter(base: AutoDispatchFilter): AutoDispatchFilter {
    return {
        ...base,
        destinationKeywords: [],
        destinationGroups: {},
        customCityFilters: [],
        userOverrides: false,
        /* 📏 어제 잰 자동 반경 거리가 오늘 살아나지 않는다 */
        radiusDistanceKm: undefined,
    };
}

/**
 * [계층 3] 콜 잡기 전략 파생 함수 (Pure Function)
 * DriverAction(기사 행동) + 확정 오더 수를 조합하여 DispatchPhase를 자동 계산합니다.
 * DB에 저장하지 않으며, 하드코딩(0km, 10km)을 원천 차단합니다.
 */
/**
 * 🔴 **"운행 중"은 출발한 사실에서 나온다 — 지금 몸이 뭘 하는지가 아니라.**
 *
 * `driverAction` 은 **정류장마다 바뀐다** — 그걸로 가르면 하차지에 도착해 `UNLOADING` 이 되는 순간
 * DELIVERING 이 풀리고, 짐이 2건이면 **출발을 네 번 눌러야** 한다. 풀리면 지나온 구간 제거가 멈추고,
 * 🚀 출발 버튼이 다시 나타나고, 요약줄이 "대기"로 바뀐다.
 *
 * 기사님에게 "운행 중"은 *"이제 그만 모으고 간다"* 이고, 그건 **한 번 켜지면 마지막 하차까지
 * 유지되는 상태**다. 중간에 짐을 내리는 건 그 안에서 일어나는 일이지 운행이 끝난 게 아니다.
 *
 * 그래서 판정은 **출발했는가**(`hasDeparted`)다. `driverAction` 은 순수하게
 * "지금 몸이 뭘 하는가"로 남아 화면 표시·도착 마일스톤·통계에 쓰인다 —
 * **콜 잡기 기준을 흔들지 않는다.**
 *
 * 끝나는 조건은 따로 없다. 마지막 콜을 하차 완료하면 콜이 0건이 되어 STANDBY 로 돌아간다.
 */
export function deriveDispatchPhase(
    confirmedOrderCount: number,
    hasDeparted: boolean
): DispatchPhase {
    if (confirmedOrderCount === 0) return 'STANDBY';
    return hasDeparted ? 'DELIVERING' : 'GATHERING';
}

/**
 * [계층 3] DispatchPhase에 따라 실제 적용할 우회 반경을 결정합니다.
 * DELIVERING(운전중) 상태일 때만 0km를 강제하고, 그 외에는 기사님의 원본 설정값을 그대로 사용합니다.
 * 이 함수를 통해서만 detourRadiusKm를 결정하므로 하드코딩이 원천 차단됩니다.
 */
/**
 * 우회 반경 기본값. **한 곳에서만 정한다.**
 *
 * 🔴 부르는 곳마다 `?? N` 을 따로 두면 어느 값이 진짜인지 코드로 알 수 없다. DB 기본값(5)과 같은 값을 여기 하나에 둔다.
 */
export const DEFAULT_DETOUR_RADIUS_KM = 5;

export function getEffectiveDetourRadius(
    _phase: DispatchPhase,
    baseDetourRadiusKm: number
): number {
    /**
     * 🔴 **국면으로 덮어쓰지 않는다** — 경유 반경은 기사님이 필터에 저장한 값(`detourRadiusKm`) 한 벌이다.
     *    `DELIVERING` 이라고 0 으로 덮으면 그 설정이 영영 무시된다.
     *
     * 함수는 남겨 둔다. 호출부가 "경유 반경은 여기서만 정한다"는 계약을 지키고 있고,
     * 나중에 국면과 무관한 상한이 필요해지면 다시 여기에 넣는다.
     */
    return baseDetourRadiusKm;
}

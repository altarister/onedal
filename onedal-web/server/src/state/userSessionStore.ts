import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder, getEligibleVehicleTypes, businessDayKey, rateFloorsFrom,
         quadShapeFrom, filterValuesFrom, DEFAULT_JUDGMENT, judgmentFromRow } from "@onedal/shared";
import type { PhaseKey, JudgmentConfig } from "@onedal/shared";
import type { CapacityConfidence } from "@onedal/shared";
import db, { seedCallOptions, loadCallOptions } from "../db";
import { callTargetToday } from "../core/callTargetEvents";
import type { CallOption } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";

// ━━━ 서비스 권장 기본값 (신규 가입자용) ━━━
// 노선·반경·할인율은 여기 없다 — 그 값들의 기본값은 shared `DEFAULT_FILTER_VALUES` 하나다
// (같은 값의 두 번째 기본값을 두지 않는다)
const SERVICE_DEFAULT_FILTER: Partial<AutoDispatchFilter> = {
    minFare: 30000,           // 하한가 3만 원 (보류 칸 — 앱 피기백, 확정안 ①-삭제 #3)
    maxFare: 1000000,         // 상한가 100만 원
    isActive: false,
    isSharedMode: false,
    driverAction: 'WAITING',      // [V2] 기사 행동 상태 기본값
    dispatchPhase: 'STANDBY',     // [V2] 콜 잡기 전략 기본값
};

export interface ActiveWebSession {
    socketId: string;
    clientSessionId: string;
    deviceInfo: string;
    connectedAt: number;
}

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    /** 이 세션의 주인 — 파생 쿼리(취소 카운터 등)가 세션만 받고도 장부를 읽을 수 있게 */
    userId: string;
    /** 🖥️ 단일 활성 관제탑 웹 세션 — 다른 기기나 탭 접속 시 인계/차단 기준 */
    activeWebSession?: ActiveWebSession | null;
    /**
     * 🛰️ **궤적에 마지막으로 남긴 점** — 솎기 기준.
     *    `lastFix` 과 다르다: 저것은 «지금 위치»(매 좌표 갱신),
     *    이것은 «디스크에 남긴 마지막 점»이다. 50m·15초 문턱을 이걸로 잰다.
     */
    lastTrackPoint?: { x: number; y: number; atMs: number } | null;
    /** 📱 실기기(native/browser) GPS가 마지막으로 들어온 시각 (PC 모의 주행 mock과의 충돌 방지용 우선순위 게이트) */
    lastRealGpsAt?: number;
    /** ⛔ 만석 홀드를 이미 알렸는가 — 5초 하트비트마다 같은 로그가 쌓이지 않게 (상태 전환 시에만 찍는다) */
    capacityHoldNotified?: boolean;
    myOrders: MyOrder[];                    // [계층 2-B] 확정된 내 퀵 배열 (단일 배열, 상태 필터링으로 관리)
    // [Option B] 응답 객체 대신 판결(Decision) 데이터를 저장하는 큐 형식으로 변경
    pendingDecisions: Map<string, { action: "KEEP" | "CANCEL" | "SIMULATED_KEEP" | null; evaluatedAt: number }>;
    // [Option B] 비상벨(emergency) 시 취소할 수 있도록 안전취소 타이머 저장
    activeTimers: Map<string, NodeJS.Timeout>;
    pendingOrdersData: Map<string, PendingOrder>;  // [계층 2-A] 심사 중 오더 (아직 내 퀵이 아님)
    deviceEvaluatingMap: Map<string, string>;
    baseFilter: AutoDispatchFilter;
    activeFilter: AutoDispatchFilter;

    /**
     * 🎛️ **기사님이 콜 필터를 켜 두셨는가** — 기기 모드에서 파생.
     *
     * 🔴 `activeFilter.isActive` 가 **세 사실**을 한꺼번에 답하고 있었다:
     *    ① 기사님이 필터를 켰는가        ← **이 칸**
     *    ② 지금 콜을 물어도 되는가        ← 선점 잠금 · 불변식이 되켠다
     *    ③ 필터를 믿을 수 있는가          ← `scrap.ts` (부트스트랩·만석·미접속·고장)
     *
     * 셋은 **AND** 다 — 서로 덮어쓰면 「대기」로 두어도 불변식이 `isActive` 를 되켜 **«대기 = 필터 꺼짐» 이 거짓**이 된다.
     * 그래서 ①을 여기 따로 담아 불변식이 넘지 못하게 한다.
     *
     * ⚠️ **`undefined` 는 «켬» 이다.** 모드를 한 번도 안 고른 사용자는 켠 채로
     *    돌아야 한다 — 기본을 «끔» 으로 읽으면 콜 필터가 통째로 죽는다.
     */
    filterEnabledByMode?: boolean;

    /**
     * 🎯 **판정 기준** — 서버가 집어 온 콜에 색을 매기는 값.
     *
     * 🔴 `activeFilter`(콜 필터)와 **완전히 분리·격리**된다. 기사님 확정:
     *    *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
     *      🔍 콜 필터    앱이 콜을 **집기 전** · 한 벌 · **💾 를 안 누르면 메모리에만** · 자정에 되돌아간다
     *      🎯 판정 기준  서버가 **집은 뒤** · 한 벌 · **`오늘만` 없다** · 바꾸면 계속 적용
     *
     * 그래서 그릇이 하나다 — DB 값을 그대로 담고, 바뀌면 DB 와 함께 갱신한다.
     * 앱에는 내려보내지 않는다 (앱은 색 판정을 하지 않는다 — 규칙 ⑤-1).
     */
    judgment: JudgmentConfig;
    /** 🎛️ 화면의 선택지와 그 값 — 정차 분의 원천 ([[dwellRatesOf]]) */
    callOptions: CallOption[];
    /**
     * 📍 **마지막으로 «받은» 좌표 — 원자료다. 아무도 지우지 않는다** (개편).
     *
     * 🔴 **«지금 기점»이 아니다.** 기점은 `originOf(session)` 이 물을 때마다 고른다 —
     *    낡았나 · 빈 차인데 가짜인가 · 집 주소로 대신할까. 판단 결과를 이 칸에 써 두면 지우는 손이 여럿이라
     *    하나를 놓친다 (콜을 쥔 채 위치가 집으로 튀어 경로 순서가 뒤집힌다).
     *    **지울 일을 만들지 않는다** — 상태가 바뀌면 다음 답이 저절로 달라진다 (규칙 ③).
     */
    lastFix: { x: number; y: number } | null;
    /**
     * 🎭 이 좌표가 **시뮬레이터가 만든 것**인가 (원자료 — 어떻게 받았나).
     *    가짜는 «콜을 쥔 동안»에만 기점이 된다. 그 판단은 `originOf` 한 곳에 있다.
     */
    lastFixIsMock: boolean;
    /**
     * 📍 **이 좌표가 어디서 왔나** (원자료).
     *
     * 🔴 **`home` 이 없다** — 집 주소는 «받은 좌표»가 아니라 **없을 때 대신 쓰는 것**이라
     *    파생이다 (`originOf` 의 `source`). 한 칸에 섞으면 «받은 적 없음»과
     *    «집에서 왔음»을 구별할 수 없다 (규칙 ⑤-4 ⑤).
     *
     *   `gps`    폰이 보낸 진짜 위치
     *   `mock`   시뮬레이터 모의 주행
     *   `manual` 사람이 현황판에서 **손으로 찍은** 위치
     */
    lastFixSource?: 'gps' | 'mock' | 'manual';
    /** 🔒 모의 GPS 임자 소켓 — 관제웹 둘이 시뮬을 겹쳐 쏘면 궤적이 섞인다 */
    mockGpsOwner?: { socketId: string; at: number; warned: boolean } | null;
    /**
     * 📍 **`lastFix` 를 받은 시각** (epoch ms).
     *
     * 좌표만 들고 있으면 **얼마나 낡았는지 알 수가 없다** — 몇 시간 전 좌표를 «지금 내 위치»로 믿으면
     * 접근 구간을 엉뚱한 곳에서 그린다.
     *
     * 🔴 **낡음은 저장하는 상태가 아니라 시각 차이에서 파생된다** (규칙 ③) — `originOf` 가 잰다.
     */
    lastFixAt: number | null;
    userVehicleType: string; // user_settings의 내 차종 (동적 허용 차종 생성용)
    isRestored: boolean;     // [방안 1] 서버 재시작 복구 로직 1회 실행 여부 플래그
    /**
     * 이 세션이 마지막으로 활동한 **영업일** (`YYYY-MM-DD`, 자정 경계).
     * 날짜가 넘어가면 오늘 필터를 기본 설정으로 되돌린다 (`ensureBusinessDay`).
     */
    businessDay: string;
    /**
     * 부트스트랩(데이터 로드 → 노선 산출 → 상태 파생 → 경유 도출) 진행 중 여부.
     * true 인 동안에는 activeFilter 가 아직 미완성이므로 앱폰에 콜 잡기를 시키지 않는다.
     * (막지 않으면 복구가 끝나기 전 1~3초 동안 "첫짐 필터(경유 없음)"가 앱에 나가 경로를 벗어난 콜을 잡는다)
     */
    isBootstrapping: boolean;
    /** 지금 잔여 적재량을 얼마나 믿을 수 있는가 (추정/신고/확정) */
    capacityConfidence: CapacityConfidence;

    /**
     * 🔴 **필터 값 다섯은 `baseFilter`/`activeFilter` 안에** 평면 이름으로 산다 — 국면마다 따로 담지 않는다.
     *    평소값 ↔ 오늘값의 이원 구조는 그대로다.
     */

    /**
     * 관제탑에 마지막으로 보낸 오더 동기화 본문. **바뀌었을 때만 보내려고** 들고 있다.
     *
     * 🔴 1초마다 **무조건** 전체를 보내면 초당 수백 KB 가 오가 **브라우저가 시간이 지나면 죽는다.**
     *
     *    비교는 어차피 해야 한다. 다만 **관제웹 여럿이 매초 하는 대신 서버가 한 번** 한다.
     */
    lastOrderSyncJson: string | null;

    /**
     * 관제탑에 마지막으로 보낸 **필터** 본문. 같으면 다시 안 보낸다.
     *
     * 🔴 `updateActiveFilter` 는 호출부가 22곳이고, 불릴 때마다 무조건 broadcast 했다.
     *    KEEP 하나가 내부적으로 여러 단계를 거치면 **관제웹이 중간 상태를 다 받는다** —
     *    (예: 54ms 안에 15번).
     *    이미 같은 이유로 `isBootstrapping` 중에는 안 보내고 있었다(중간 상태로 화면이
     *    깜빡인다). 그 생각을 끝까지 민 것이다.
     */
    lastFilterJson: string | null;

    /**
     * 지나온 구간 제거를 마지막으로 돌린 위치. 0.5km 이상 움직였을 때만 다시 돈다.
     *
     * 🔴 세션 필드는 **선언하고** 쓴다 — `as any` 로 붙인 필드는 오타가 나도 tsc 가 못 잡는다.
     */
    lastTrimGPS?: { x: number; y: number };

    /**
     * 도착 감지 상태
     * · arrivalFired    한 번 찍은 정거장(`orderId:stopType`) — **한 정거장당 발화 1회**의 근거
     * · arrivalHeld     **정거장마다** «언제부터 서 있나» (실 GPS 만)
     * · arrivalNoticed  근접 예고(3km)를 이미 보낸 정거장
     * 사이클이 끝나면 셋 다 비운다 (지나온 구간 진행도와 같은 수명).
     */
    arrivalFired: Set<string>;
    /**
     * ⏱️ **정거장마다 스톱워치를 따로 든다** (밤 · 어드민 지적).
     *
     * 🔴 스톱워치가 하나뿐이면 보는 정거장이 바뀔 때 **0으로 되돌아간다** — 실 GPS 는 «500m 안 + 5km/h↓» 가
     *    **30초** 이어져야 도착으로 찍는데, 정거장 순서가 흔들리면 **그 30초가 영영 안 찬다** (기사님 실측).
     * 🔴 **«서 있었다»는 사실이지, «지금 그 정거장을 보고 있나»에 딸린 값이 아니다** —
     *    한 값이 두 질문에 답하면 안 된다 (규칙 ⑤-4 ⑤).
     * ⚠️ **모의 주행으로는 못 본다** — `source === 'mock'` 이면 근접만으로 즉시 발화해서
     *    30초 갈래가 검사에서 한 번도 안 돈다. 실 GPS 에서만 드러나는 결함이다.
     *
     * 키는 `orderId:stopType`, 값은 «언제부터 서 있나»(ms) 또는 아직 안 섰으면 null.
     * 도착이 찍히면 그 키를 지운다 (`arrivalFired` 가 대신 기억한다).
     */
    arrivalHeld: Map<string, number | null>;
    arrivalNoticed: Set<string>;
    /**
     * 🧮 **이미 센 콜** — `orderId:cancel` · `orderId:keep` 꼴 (`core/cancelCount.ts`).
     *
     * 콜이 끝나는 길이 여럿이라 **같은 콜을 두 길이 각각 셌다** (실주행: 서버 안전취소 타이머가
     * 세고, 3초 뒤 앱이 그 취소를 비상 보고로 올려 또 셌다). 조건을 더하는 방식으로는 또 샌다 —
     * 세는 자리가 스스로 «이미 셌나»를 알아야 부르는 곳이 늘어도 안전하다.
     */
    countedOnce: Set<string>;

    /**
     * 🚚 **떠남 감시** — 하차지에 도착한 뒤 «멀어졌는지»를 보려고 그 좌표를 들고 있는다
     *    (기사님 확정).
     *
     * 도착만 보고 떠남을 안 보면, 운전 중이라 버튼을 못 누른 콜이 **계속 실려 있는 것으로**
     * 남는다 — 적재가 안 풀려 다음 콜이 차종에서 막힌다.
     *
     * `arrivalFired` 와 같은 수명이다 — 사이클이 끝나면 함께 비운다.
     */
    departWatch: Map<string, { orderId: string; x: number; y: number }>;
    /**
     * 🚚 **지나침 감시 — «진입 반경 안에 들어온» 정거장과 그 좌표**.
     *
     * 들어온 적이 있어야 «지나왔다»가 성립한다 — 없으면 남의 정거장을 스쳐만 가도 찍힌다.
     * 🔴 **좌표를 들고 있는다.** «다음 정거장»만 보면, 도착이 먼저 찍혀 그 정거장이
     *    «다녀온 곳»이 되는 순간 감시에서 빠져 **완료를 영영 못 찍는다**
     *    (시뮬은 근접만으로 도착이 찍히므로 늘 그렇게 된다).
     * 찍고 나면 지운다 — 되돌아와도 다시 안 걸린다 (`departWatch` 와 같은 결).
     */
    passWatch: Map<string, {
        orderId: string; stopType: 'pickup' | 'dropoff'; x: number; y: number;
        /**
         * 🔴 **진입 반경 안에 실제로 들어왔나.** 도착(500m)이 진입(300m)보다 넓어서,
         * 도착만 보고 «들어왔다»로 치면 **450m 에서 도착 → 다음 틱에 400m 이탈**로
         * 곧바로 완료가 찍힌다 (짐을 싣기도 전에). 그래서 진입은 따로 센다.
         */
        entered: boolean;
    }>;

    /**
     * 마지막으로 위치를 받은 시각(ms). **속도를 재는 데만 쓴다.**
     * 기사님 결정: 위치 기록은 *"이동이 있을 때만"* 남긴다 —
     * 그러려면 얼마나 움직였는지와 함께 **얼마 만에** 움직였는지를 알아야 한다.
     */
    lastGpsAt?: number;

    /**
     * 🚀 **출발을 누른 시각.** null 이면 아직 모으는 중(합짐)이다.
     *
     * 🔴 이건 파생값이 아니라 **입력**이다 — 기사님이 누르지 않으면 알 수 없다.
     *    (규칙 ③ 은 *파생값*을 저장하지 말라는 것이지 입력을 저장하지 말라는 게 아니다)
     *
     * `driverAction === 'DRIVING'` 으로 대신하지 않는다 — 그 값은 **정류장마다 바뀌어**
     * 하차지에 도착해 `UNLOADING` 이 되는 순간 운행중이 통째로 풀린다.
     *
     * 끄는 것도 따로 없다 — 콜이 0건이 되면(마지막 하차 완료) 여기서 지운다.
     */
    departedAt: number | null;

    /**
     * 경유의 동마다 **경로 몇 km 지점인가** — 지나온 구간을 지울 때 쓴다.
     *
     * 🔴 **저장이 아니라 캐시다.** 경유를 만든 그 순간에 같이 나온 값이고,
     *    경유를 다시 그리면 이것도 같이 바뀐다. 따로 만들면 갈라진다.
     *    경로가 없으면 `null` — 없는 값을 지어내지 않는다.
     */
    detourProgressKm: Record<string, number> | null;
    /**
     * 🧭 경유의 동마다 **경로 몇 km 지점인가 — 순서 전용** (순수 스냅점 · #78).
     *
     * `detourProgressKm` 은 트림용이라 pad·Infinity 가 섞여 있다 — 순서 판정에 쓰면
     * 지리가 뒤집힌다 (곤지암읍이 경로 끝 뒤로 갔다). 앱 피기백(`buildAppOrderKm`)은
     * 이것만 쓴다. 역시 저장이 아니라 캐시 — 경유를 다시 그리면 같이 바뀐다.
     */
    detourOrderKm: Record<string, number> | null;
    /**
     * 📋 **상차 목록을 마지막으로 만든 자리** (하차 목록») — 여기서 0.5km 넘게 움직이면 다시 만든다.
     *    목록 자체는 `activeFilter.pickupKeywords` 에 산다. 저장이 아니라 «언제 다시 만들까»의 기준점이다.
     */
    pickupListAt: { x: number; y: number; at?: number } | null;
    /** 🎯 상차 목록을 만들 때 본 «목적지마다 가까이 옴» — 바뀌면 하차 목록도 다시 만든다 (`filterManager.rebuildPickupList`) */
    pickupNearKey: string | null;
    /**
     * 🛣️ **경로 위에 있는 동 목록** — 상차지 판정의 원천.
     *
     * `destinationKeywords` 에는 **도착 목표**(첫짐의 «여주시»)에서 온
     * 동이 섞인다. 그건 **하차지를 열려고** 넣은 것이지 «경로 위»라는 뜻이 아니다.
     *
     * 🔴 `detourProgressKm` 의 키로는 구분할 수 없다 — `centroid` 가 없어 스냅에 실패한
     *    동은 **경로 위인데도** 진행도 맵에 안 들어간다. «모르는 것»과 «경로 밖»은 다르다.
     *    그래서 경유 목록 자체를 따로 기억한다.
     *
     * 저장이 아니라 캐시다 — 경유를 다시 그리면 같이 바뀐다. 경로가 없으면 `null`.
     */
    detourFlat: string[] | null;
    /**
     * 🛣️ **필터가 쓰는 라인 — KEEP 순간 얼린 경로** (기사님 확정 · 전수표 #18).
     * 하차 완료·취소·재탐색으로 **안 바뀐다**. 첫 콜만 쥔 동안(합짐 전)은 경로 방침을 바꾸면 따라간다.
     * 메모리다 — 없으면(부팅 직후) 지금 경로를 쓴다 (`filterLineOf`). 사이클이 끝나면 비운다.
     */
    filterLine: Array<{ x: number; y: number }> | null;
    /**
     * ↩️ **새 콜을 붙이기 직전의 경로 한 벌** (기사님 확정).
     *
     * 심사 중인 콜이 취소되면 이걸 되돌린다 — 원래 콜은 아무것도 안 바뀌었는데
     * 카카오를 다시 부르던 자리다. KEEP 되면 버린다 (되돌릴 일이 없다).
     * ⚠️ 되돌리는 조건은 `restoreRouteSnapshot` 한 곳에만 있다 — 현위치가 그대로일 때만.
     */
    routeSnapshot: import('../services/routeComposer').RouteSnapshot | null;
}

const sessions = new Map<string, UserSession>();

/**
 * 🚫 제외 지역 칸은 JSON 배열 문자열이다. 깨져 있으면 **«없음»으로 본다** —
 *    세션 생성을 막지 않고, 없는 제외를 지어내지도 않는다 (규칙 ④).
 */
function safeJsonArray(v: unknown): string[] {
    if (typeof v !== 'string' || !v) return [];
    try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
}

function createDefaultSession(userId: string): UserSession {
    return {
        userId,
        activeWebSession: null,
        lastTrackPoint: null,
        myOrders: [],
        pendingDecisions: new Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>(),
        activeTimers: new Map<string, NodeJS.Timeout>(),
        pendingOrdersData: new Map<string, PendingOrder>(),
        deviceEvaluatingMap: new Map<string, string>(),
        baseFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        activeFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        // 실제 값은 아래 부트스트랩이 DB 에서 읽어 덮는다. 여기선 기본값으로 시작한다
        judgment: JSON.parse(JSON.stringify(DEFAULT_JUDGMENT)) as JudgmentConfig,
        callOptions: [],
        lastFix: null,
        lastFixIsMock: false,
        lastFixSource: undefined,
        mockGpsOwner: null,
        lastFixAt: null,
        userVehicleType: '1t',
        capacityConfidence: 'ESTIMATED',
        businessDay: businessDayKey(Date.now()),
        isRestored: false,
        isBootstrapping: false,
        detourProgressKm: null,
        detourOrderKm: null,
        pickupListAt: null,
        pickupNearKey: null,
        detourFlat: null,
        filterLine: null,
        routeSnapshot: null,
        departedAt: null,
        lastOrderSyncJson: null,
        lastFilterJson: null,
        lastTrimGPS: undefined,
        lastGpsAt: undefined,
        arrivalFired: new Set(),
        departWatch: new Map(),
        passWatch: new Map(),
        arrivalHeld: new Map(),
        arrivalNoticed: new Set(),
        countedOnce: new Set(),
    };
}

// V2의 핵심: 앞으로 모든 상태 접근은 userId 파라미터를 강제로 요구합니다.
export function getUserSession(userId: string): UserSession {
    if (!sessions.has(userId)) {
        const session = createDefaultSession(userId);

        try {
            // Lazy load user filter & settings
            const filterRow = db.prepare("SELECT * FROM user_filters WHERE user_id = ?").get(userId) as any;
            let settingsRow = db.prepare("SELECT vehicle_type FROM user_settings WHERE user_id = ?").get(userId) as any;
            if (!settingsRow) {
                db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(userId);
                settingsRow = { vehicle_type: '1t' };
            }
            const userVehicleType = settingsRow.vehicle_type || '1t';
            session.userVehicleType = userVehicleType;

            /**
             * 🎯 **판정 기준을 세션에 싣는다** — 콜 필터와 **따로** 읽는다.
             *
             * 없으면 한 줄 만든다. 컬럼의 `DEFAULT` 가 표(`JUDGMENT_FIELDS`)의 값을 채우므로
             * 여기서 값을 손으로 적지 않는다 — **기본값의 원천은 표 하나다.**
             *
             * `오늘만` 이 없으므로 그릇도 하나다 (기사님:
             * *"필터에서는 오늘만 버튼이 있어야 하고… 하지만 판정 기준은 그런 것이 없다"*).
             */
            let judgeRow = db.prepare("SELECT * FROM user_judgment WHERE user_id = ?").get(userId) as any;
            if (!judgeRow) {
                db.prepare("INSERT OR IGNORE INTO user_judgment (user_id) VALUES (?)").run(userId);
                judgeRow = db.prepare("SELECT * FROM user_judgment WHERE user_id = ?").get(userId) as any;
            }
            session.judgment = judgmentFromRow(judgeRow);

            /**
             * 🎛️ **콜 옵션 — 화면의 선택지와 그 값** (시딩 · 이음).
             *
             * 🔴 정차 값(지게차·수작업 박스당 분 · 검수 분)의 **원천이 이 표다.**
             *    그 셋은 «어떻게 잴 것인가»(판정 기준 탭)가 아니라 **화면의 칩에 붙는 숫자**다 (규칙 ③).
             */
            seedCallOptions(userId);
            session.callOptions = loadCallOptions(userId);

            /**
             * 🎛️ **값 다섯의 원천은 `user_filters` 한 행이다**.
             *    require 지연 — filterManager ↔ 여기 순환 방지.
             */
            const firstPatch = (() => {
                try {
                    const { loadFilterValues } = require('./filterManager');
                    return loadFilterValues(userId);
                } catch (e) {
                    // 세션 생성을 막지 않는다 — 표 기본값이면 콜 잡기는 돈다
                    console.error('🎛️ [필터 값] 읽기 실패 — 표 기본값으로 계속:', (e as Error).message);
                    return filterValuesFrom(null);
                }
            })();

            if (filterRow) {
                // Restore saved filter into baseFilter — 국면 파생 조각 + user_filters 잔여 칸
                session.baseFilter = {
                    ...firstPatch,
                    minFare: filterRow.min_fare,   // 보류 칸 — 앱 피기백 (확정안 ①-삭제 #3, 화물24 단가식 뒤 강등)
                    maxFare: filterRow.max_fare,
                    excludedKeywords: JSON.parse(filterRow.excluded_keywords || '[]'),
                    isActive: Boolean(filterRow.is_active),
                    // ratePerKm 은 파생값 — 콜할인율(현 국면)과 DB 단가표·수수료에서 매번 만든다.
                    // shared 폴백 상수를 쓰면 설정에서 요율을 바꿔도 앱 필터가 안 바뀐다.
                    ratePerKm: rateFloorsFrom(
                        firstPatch.callDiscountPct,
                        filterRow.vehicle_rates ? JSON.parse(filterRow.vehicle_rates) : undefined,
                        filterRow.agency_fee_percent ?? 23,
                    ),
                    // 📐 마름모의 모양 — 국면 밖 한 벌. 칸이 비었으면 기본값 110/110/25
                    ...quadShapeFrom(filterRow as any),
                    /* 🚫 제외 지역 — 국면 밖 한 벌. 깨진 JSON 은 «없음»으로 (규칙 ④) */
                    excludedRegions: safeJsonArray(filterRow.excluded_regions),
                    /**
                     * 📐🚚 **오늘 판 칸 셋** (전수 조사 ①-5) — 안 읽으면 재접속에 풀린다.
                     *    `radius_base_km` 이 NULL 이면 **모른다**로 둔다 — 화면·서버가 기본값
                     *    (`RADIUS_BASE_KM_DEFAULT`)으로 물러선다. 0 으로 읽지 않는다.
                     */
                    radiusAuto: Boolean(filterRow.radius_auto),
                    radiusBaseKm: Number.isFinite(filterRow.radius_base_km) ? filterRow.radius_base_km : undefined,
                    acceptedVehicleTypes: safeJsonArray(filterRow.accepted_vehicle_types),
                    /* 🛣️🔷 NULL(옛 행)은 노선 — 기본이 노선이다 (조사 ①-9) */
                    routeMode: filterRow.route_mode == null ? true : Boolean(filterRow.route_mode),
                } as AutoDispatchFilter;

                // [완전 격리] activeFilter = baseFilter의 독립 복사본 (로그인 시 1회만)
                //
                // 여기서는 일단 첫짐(STANDBY)으로 시작한다. 이 시점에는 아직 myOrders가
                // 비어 있어 실제 적재 상태를 알 수 없기 때문이다.
                // 진행 중인 콜이 있으면 이후 restoreAndRecalculateSession()이 DB에서
                // 콜을 복구한 뒤 dispatchPhase / isSharedMode / allowedVehicleTypes /
                // 경유 키워드를 **데이터로부터 다시 파생**시켜 덮어쓴다. (이슈 W)
                // 안 하면 진행 중인 콜이 여럿이어도 필터가 첫짐인 채로 콜 잡기가 돌아 경로를 벗어난 콜을 잡는다.
                session.activeFilter = {
                    ...session.baseFilter,
                    isSharedMode: false,
                    driverAction: 'WAITING',      // [V2] 세션 복구 시 항상 대기 상태
                    dispatchPhase: 'STANDBY',     // [V2] 세션 복구 시 항상 첫짐 탐색
                    /* 🧭 복귀 켬은 평소 설정이 아니다 — 오늘 줄에서 되살린다 (#131 · 서버 재기동에 사라지던 자리) */
                    callTarget: callTargetToday(userId, Date.now()).target,
                };
                // 여기서 무거운 지리 연산(getCityRegionsWithRadius, CPU 집약)을 하지 않는다.
                // 이 함수는 소켓 연결 시점에 **동기로** 호출되므로 이벤트 루프를 막을 수 있었다.
                // 키워드는 부트스트랩 ⑤단계(rebuildDestinationKeywords)에서 한 번만 계산한다.
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.destinationGroups = {};
                session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(userVehicleType);

                logRoadmapEvent("서버", `[Session DB Load] 유저 ${userId} 복구된 원본 필터(Raw DB): \n` + JSON.stringify(filterRow, null, 2));
            } else {
                // 신규 유저: 서비스 권장 기본값 + 국면 표 기본값(첫짐 파생)으로 초기화
                session.baseFilter = {
                    ...SERVICE_DEFAULT_FILTER, ...firstPatch,
                    ratePerKm: rateFloorsFrom(firstPatch.callDiscountPct),
                } as AutoDispatchFilter;
                session.activeFilter = {
                    ...session.baseFilter,
                    isSharedMode: false,
                    driverAction: 'WAITING',      // [V2]
                    dispatchPhase: 'STANDBY',     // [V2]
                    callTarget: callTargetToday(userId, Date.now()).target,
                } as AutoDispatchFilter;
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(userVehicleType);

                // 잔여 칸 기본값을 DB에도 저장 — 값 다섯은 같은 행에 있고 표 기본값으로 읽힌다
                db.prepare(`
                    INSERT OR IGNORE INTO user_filters (user_id, min_fare, max_fare) VALUES (?, ?, ?)
                `).run(userId, 30000, 1000000);

                console.log(`[Session] 유저 ${userId} 최초 필터 생성됨 (차종: ${userVehicleType}, 서비스 권장 기본값 적용)`);
            }
        } catch (e) {
            console.error(`[Session] 유저 ${userId} 필터 Lazy Load 중 오류:`, e);
        }

        sessions.set(userId, session);
    }
    return sessions.get(userId)!;
}

export function getAllActiveUserIds(): string[] {
    return Array.from(sessions.keys());
}

// 명시적 로그아웃 시 메모리 세션 파기용 함수
export function clearUserSession(userId: string): void {
    if (sessions.has(userId)) {
        sessions.delete(userId);
        console.log(`🧹 [Session] 유저 ${userId} 메모리 세션 완전 파기 완료`);
    }
}

/**
 * 한 오더에 걸려 있는 **모든 타이머를 끈다.**
 *
 * 🔴 타이머 키를 여러 곳에 손으로 나열하면 **한 곳만 고칠 때 나머지가 좀비 타이머로 남는다** —
 *    콜이 정상 처리된 뒤에 깨어난 타이머가 멀쩡한 콜을 취소한다.
 *
 * 새 타이머를 만들면 **키를 여기에만 더한다.**
 */
export function clearOrderTimers(session: { activeTimers: Map<string, any> }, orderId: string): void {
    for (const prefix of ['warn_', 'timeout_', 'presecured_', 'listExit_']) {
        const t = session.activeTimers.get(`${prefix}${orderId}`);
        if (t) clearTimeout(t);
        session.activeTimers.delete(`${prefix}${orderId}`);
    }
}

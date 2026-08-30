import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder, getEligibleVehicleTypes, businessDayKey, rateFloorsFrom,
         normalizePhaseSettings, applyPhaseToFilter, DEFAULT_JUDGMENT, judgmentFromRow } from "@onedal/shared";
import type { PhaseSettingsMap, PhaseKey, JudgmentConfig } from "@onedal/shared";
import type { CapacityConfidence } from "@onedal/shared";
import db, { seedCallOptions, loadCallOptions } from "../db";
import type { CallOption } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";

// ━━━ 서비스 권장 기본값 (신규 가입자용) ━━━
// 노선·반경·할인율은 여기 없다 — 그 값들의 원천은 국면 표(DEFAULT_PHASE_SETTINGS)이고,
// 로그인 때 첫짐 국면에서 파생해 얹는다 (④ 철거 — 같은 값의 두 번째 기본값을 두지 않는다)
const SERVICE_DEFAULT_FILTER: Partial<AutoDispatchFilter> = {
    minFare: 30000,           // 하한가 3만 원 (보류 칸 — 앱 피기백, 확정안 ①-삭제 #3)
    maxFare: 1000000,         // 상한가 100만 원
    isActive: false,
    isSharedMode: false,
    driverAction: 'WAITING',      // [V2] 기사 행동 상태 기본값
    dispatchPhase: 'STANDBY',     // [V2] 콜 잡기 전략 기본값
};

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    /** 이 세션의 주인 — 파생 쿼리(취소 카운터 등)가 세션만 받고도 장부를 읽을 수 있게 */
    userId: string;
    /**
     * 🛰️ **궤적에 마지막으로 남긴 점** — 솎기 기준 (2026-08-26).
     *    `driverLocation` 과 다르다: 저것은 «지금 위치»(매 좌표 갱신),
     *    이것은 «디스크에 남긴 마지막 점»이다. 50m·15초 문턱을 이걸로 잰다.
     */
    lastTrackPoint?: { x: number; y: number; atMs: number } | null;
    /** ⛔ 만석 홀드를 이미 알렸는가 — 5초 하트비트마다 같은 로그가 쌓이지 않게 (상태 전환 시에만 찍는다) */
    capacityHoldNotified?: boolean;
    myOrders: MyOrder[];                    // [계층 2-B] 확정된 내 퀵 배열 (단일 배열, 상태 필터링으로 관리)
    // [Option B] 응답 객체 대신 판결(Decision) 데이터를 저장하는 큐 형식으로 변경
    pendingDecisions: Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>;
    // [Option B] 비상벨(emergency) 시 취소할 수 있도록 안전취소 타이머 저장
    activeTimers: Map<string, NodeJS.Timeout>;
    pendingOrdersData: Map<string, PendingOrder>;  // [계층 2-A] 심사 중 오더 (아직 내 퀵이 아님)
    deviceEvaluatingMap: Map<string, string>;
    baseFilter: AutoDispatchFilter;
    activeFilter: AutoDispatchFilter;

    /**
     * 🎛️ **기사님이 콜 필터를 켜 두셨는가** — 기기 모드에서 파생 (2026-08-30).
     *
     * 🔴 `activeFilter.isActive` 가 **세 사실**을 한꺼번에 답하고 있었다:
     *    ① 기사님이 필터를 켰는가        ← **이 칸**
     *    ② 지금 콜을 물어도 되는가        ← 선점 잠금 · 불변식이 되켠다
     *    ③ 필터를 믿을 수 있는가          ← `scrap.ts` (부트스트랩·만석·미접속·고장)
     *
     * 셋은 **AND** 여야 하는데 서로 덮어쓰고 있었다. 실제로 「대기」로 두어도
     * 불변식이 `isActive` 를 곧바로 되켜서 **«대기 = 필터 꺼짐» 이 거짓**이었다
     * (2026-08-30 코드리뷰). ①을 여기 따로 담아 불변식이 넘지 못하게 한다.
     *
     * ⚠️ **`undefined` 는 «켬» 이다.** 모드를 한 번도 안 고른 사용자는 예전 그대로
     *    돌아야 한다 — 기본을 «끔» 으로 읽으면 콜 필터가 통째로 죽는다.
     */
    filterEnabledByMode?: boolean;

    /**
     * 🎯 **판정 기준** — 서버가 집어 온 콜에 색을 매기는 값 (2026-08-16 신설).
     *
     * 🔴 `activeFilter`(콜 필터)와 **완전히 분리·격리**된다. 기사님 확정:
     *    *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
     *      🔍 콜 필터    앱이 콜을 **집기 전** · 국면별 · **`오늘만` 있다** · 자정에 되돌아간다
     *      🎯 판정 기준  서버가 **집은 뒤** · 한 벌 · **`오늘만` 없다** · 바꾸면 계속 적용
     *
     * 그래서 그릇이 하나다 — DB 값을 그대로 담고, 바뀌면 DB 와 함께 갱신한다.
     * 앱에는 내려보내지 않는다 (앱은 색 판정을 하지 않는다 — 규칙 ⑤-1).
     */
    judgment: JudgmentConfig;
    /** 🎛️ 화면의 선택지와 그 값 — 정차 분의 원천 ([[dwellRatesOf]]) */
    callOptions: CallOption[];
    driverLocation: { x: number; y: number } | null;
    /**
     * `driverLocation` 이 **GPS 가 아니라 설정의 '내 주소'** 에서 온 값인가.
     * 화면이 "내 주소 기준"이라고 말할 수 있어야 한다 — 추정으로 계산했다는 사실을 숨기지 않는다.
     * GPS 가 들어오면 false 로 돌아간다 (진짜 위치가 언제나 이긴다).
     */
    driverLocationIsFallback: boolean;
    /**
     * 📍 **`driverLocation` 을 받은 시각** (epoch ms · 2026-08-25 신설).
     *
     * 좌표만 들고 있으면 **얼마나 낡았는지 알 수가 없다.** 2026-08-25 실측:
     * 14:24 에 모의 주행이 여주에서 끝났고, 4시간 25분 뒤 광주에서 콜을 잡는데도
     * 서버가 그 여주 좌표를 «지금 내 위치»로 믿어 접근 구간을 **40km 뒤로** 그렸다.
     * 실 운행에서도 터널·실내에서 GPS 가 끊기면 같은 형태로 난다.
     *
     * 🔴 **낡음은 저장하는 상태가 아니라 시각 차이에서 파생된다** (규칙 ③).
     *    타이머를 두지 않고 읽는 순간 잰다 (`dropStaleLocation`).
     */
    driverLocationAt: number | null;
    userVehicleType: string; // user_settings의 내 차종 (동적 허용 차종 생성용)
    isRestored: boolean;     // [방안 1] 서버 재시작 복구 로직 1회 실행 여부 플래그
    /**
     * 이 세션이 마지막으로 활동한 **영업일** (`YYYY-MM-DD`, 자정 경계).
     * 날짜가 넘어가면 오늘 필터를 기본 설정으로 되돌린다 (`ensureBusinessDay`).
     */
    businessDay: string;
    /**
     * [Phase 6] 부트스트랩(데이터 로드 → 노선 산출 → 상태 파생 → 경유 도출) 진행 중 여부.
     * true 인 동안에는 activeFilter 가 아직 미완성이므로 앱폰에 콜 잡기를 시키지 않는다.
     * (예전에는 복구가 끝나기 전 1~3초 동안 "첫짐 필터(경유 없음)"가 앱에 나가
     *  경로를 벗어난 콜을 잡을 수 있었다)
     */
    isBootstrapping: boolean;
    /** [Phase 8.4] 지금 잔여 적재량을 얼마나 믿을 수 있는가 (추정/신고/확정) */
    capacityConfidence: CapacityConfidence;

    /**
     * 국면별 필터 설정 (docs/지금/필터.md §3).
     *
     * `basePhaseSettings`   평소값 — DB `user_filter_phases` 행의 사본
     * `phaseSettings`       오늘값 — 자정에 평소값으로 되돌아간다
     *
     * 기존 `baseFilter`/`activeFilter` 이원 구조를 국면별로도 그대로 따른다.
     */
    basePhaseSettings: PhaseSettingsMap;
    phaseSettings: PhaseSettingsMap;
    /** 지금 어느 국면의 설정이 평면에 펼쳐져 있는가 (전환 감지용) */
    appliedPhaseKey: PhaseKey | null;

    /**
     * 관제탑에 마지막으로 보낸 오더 동기화 본문. **바뀌었을 때만 보내려고** 들고 있다.
     *
     * 🔴 예전에는 1초마다 **무조건** 전체를 보냈고, 관제웹이 받아서 `JSON.stringify` 로
     *    두 번 비교했다. 실측 초당 474KB — 한 시간이면 1.7GB 의 임시 문자열이라
     *    **브라우저가 시간이 지나면 죽었다.**
     *
     *    비교는 어차피 해야 한다. 다만 **관제웹 여럿이 매초 하는 대신 서버가 한 번** 한다.
     */
    lastOrderSyncJson: string | null;

    /**
     * 관제탑에 마지막으로 보낸 **필터** 본문. 같으면 다시 안 보낸다.
     *
     * 🔴 `updateActiveFilter` 는 호출부가 22곳이고, 불릴 때마다 무조건 broadcast 했다.
     *    KEEP 하나가 내부적으로 여러 단계를 거치면 **관제웹이 중간 상태를 다 받는다** —
     *    2026-08-14 실측 54ms 안에 15번.
     *    이미 같은 이유로 `isBootstrapping` 중에는 안 보내고 있었다(중간 상태로 화면이
     *    깜빡인다). 그 생각을 끝까지 민 것이다.
     */
    lastFilterJson: string | null;

    /**
     * 지나온 구간 제거를 마지막으로 돌린 위치. 0.5km 이상 움직였을 때만 다시 돈다.
     *
     * 🔴 예전에는 `(session as any).lastTrimGPS` 로 **선언 없이** 붙여 쓰고 있었다.
     *    `as any` 로 붙인 필드는 오타가 나도 tsc 가 못 잡는다 — 세션에서 사라진 필드를
     *    읽던 오늘의 사고와 같은 뿌리다. 쓸 거면 선언한다.
     */
    lastTrimGPS?: { x: number; y: number };

    /**
     * 도착 감지 상태 (근거: docs/기록/결정_이력.md «도착은 GPS 가 찍는다»)
     * · arrivalFired    한 번 찍은 정거장(`orderId:stopType`) — **한 정거장당 발화 1회**의 근거
     * · arrivalWatch    지금 감시 중인 "다음 정거장"의 정지 유지 상태 (실 GPS 만)
     * · arrivalNoticed  근접 예고(3km)를 이미 보낸 정거장
     * 사이클이 끝나면 셋 다 비운다 (지나온 구간 진행도와 같은 수명).
     */
    arrivalFired: Set<string>;
    arrivalWatch: { stopKey: string; heldSinceMs: number | null } | null;
    arrivalNoticed: Set<string>;

    /**
     * 🚚 **떠남 감시** — 하차지에 도착한 뒤 «멀어졌는지»를 보려고 그 좌표를 들고 있는다
     *    (기사님 확정 2026-08-25).
     *
     * 도착만 보고 떠남을 안 보면, 운전 중이라 버튼을 못 누른 콜이 **계속 실려 있는 것으로**
     * 남는다 — 적재가 안 풀려 다음 콜이 차종에서 막힌다 (2026-08-25 실측).
     *
     * `arrivalFired` 와 같은 수명이다 — 사이클이 끝나면 함께 비운다.
     */
    departWatch: Map<string, { orderId: string; x: number; y: number }>;

    /**
     * 마지막으로 위치를 받은 시각(ms). **속도를 재는 데만 쓴다.**
     * 기사님 결정(2026-08-14): 위치 기록은 *"이동이 있을 때만"* 남긴다 —
     * 그러려면 얼마나 움직였는지와 함께 **얼마 만에** 움직였는지를 알아야 한다.
     */
    lastGpsAt?: number;

    /**
     * 🚀 **출발을 누른 시각.** null 이면 아직 모으는 중(합짐)이다.
     *
     * 🔴 이건 파생값이 아니라 **입력**이다 — 기사님이 누르지 않으면 알 수 없다.
     *    (규칙 ③ 은 *파생값*을 저장하지 말라는 것이지 입력을 저장하지 말라는 게 아니다)
     *
     * 예전에는 `driverAction === 'DRIVING'` 으로 대신했는데, 그 값은 **정류장마다 바뀐다.**
     * 하차지에 도착해 `UNLOADING` 이 되는 순간 운행중이 통째로 풀렸다.
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
     * 🧭 경유의 동마다 **경로 몇 km 지점인가 — 순서 전용** (순수 스냅점 · #78 · 2026-08-30).
     *
     * `detourProgressKm` 은 트림용이라 pad·Infinity 가 섞여 있다 — 순서 판정에 쓰면
     * 지리가 뒤집힌다 (곤지암읍이 경로 끝 뒤로 갔다). 앱 피기백(`buildAppProgressKm`)은
     * 이것만 쓴다. 역시 저장이 아니라 캐시 — 경유를 다시 그리면 같이 바뀐다.
     */
    detourOrderKm: Record<string, number> | null;
    /**
     * 🛣️ **경로 위에 있는 동 목록** — 상차지 판정의 원천 (2026-08-25 신설).
     *
     * 2026-08-25 부터 `destinationKeywords` 에는 **도착 목표**(첫짐의 «여주시»)에서 온
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
     * ↩️ **새 콜을 붙이기 직전의 경로 한 벌** (기사님 확정 2026-08-23).
     *
     * 심사 중인 콜이 취소되면 이걸 되돌린다 — 원래 콜은 아무것도 안 바뀌었는데
     * 카카오를 다시 부르던 자리다. KEEP 되면 버린다 (되돌릴 일이 없다).
     * ⚠️ 되돌리는 조건은 `restoreRouteSnapshot` 한 곳에만 있다 — 현위치가 그대로일 때만.
     */
    routeSnapshot: import('../services/routeComposer').RouteSnapshot | null;
}

const sessions = new Map<string, UserSession>();

function createDefaultSession(userId: string): UserSession {
    return {
        userId,
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
        driverLocation: null,
        driverLocationIsFallback: false,
        driverLocationAt: null,
        userVehicleType: '1t',
        capacityConfidence: 'ESTIMATED',
        businessDay: businessDayKey(Date.now()),
        isRestored: false,
        isBootstrapping: false,
        basePhaseSettings: normalizePhaseSettings(null),
        phaseSettings: normalizePhaseSettings(null),
        appliedPhaseKey: null,
        detourProgressKm: null,
        detourOrderKm: null,
        detourFlat: null,
        routeSnapshot: null,
        departedAt: null,
        lastOrderSyncJson: null,
        lastFilterJson: null,
        lastTrimGPS: undefined,
        lastGpsAt: undefined,
        arrivalFired: new Set(),
        departWatch: new Map(),
        arrivalWatch: null,
        arrivalNoticed: new Set(),
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
             * 🎯 **판정 기준을 세션에 싣는다** — 콜 필터와 **따로** 읽는다 (2026-08-16).
             *
             * 없으면 한 줄 만든다. 컬럼의 `DEFAULT` 가 표(`JUDGMENT_FIELDS`)의 값을 채우므로
             * 여기서 값을 손으로 적지 않는다 — **기본값의 원천은 표 하나다.**
             *
             * `오늘만` 이 없으므로 그릇도 하나다 (기사님 2026-08-16:
             * *"필터에서는 오늘만 버튼이 있어야 하고… 하지만 판정 기준은 그런 것이 없다"*).
             */
            let judgeRow = db.prepare("SELECT * FROM user_judgment WHERE user_id = ?").get(userId) as any;
            if (!judgeRow) {
                db.prepare("INSERT OR IGNORE INTO user_judgment (user_id) VALUES (?)").run(userId);
                judgeRow = db.prepare("SELECT * FROM user_judgment WHERE user_id = ?").get(userId) as any;
            }
            session.judgment = judgmentFromRow(judgeRow);

            /**
             * 🎛️ **콜 옵션 — 화면의 선택지와 그 값** (2026-08-20 시딩 · 2026-08-29 이음).
             *
             * ⚠️ 이 자리에 «아직 아무도 안 읽는다 — 다음 단계에서 화면을 잇는다» 고
             *    적혀 있었다. **2026-08-29 에 이었다.**
             *
             * 🔴 정차 값(지게차·수작업 박스당 분 · 검수 분)의 **원천이 이 표다.**
             *    낮에 판정 기준 탭으로 올렸다가 되돌렸다 — 그 셋은 «어떻게 잴 것인가»가
             *    아니라 **화면의 칩에 붙는 숫자**이고, 이 표에 이미 칸이 있었다 (규칙 ③).
             */
            seedCallOptions(userId);
            session.callOptions = loadCallOptions(userId);

            /**
             * 🎛️ **국면 옵션의 원천은 user_filter_phases 행 하나다** (필터 확정안 v2 · ④ 완료).
             * 옛 blob·평면 칸은 철거했다. require 지연 — filterManager ↔ 여기 순환 방지.
             */
            try {
                const { loadPhaseRows } = require('./filterManager');
                session.basePhaseSettings = loadPhaseRows(userId);
            } catch (e) {
                // createDefaultSession 이 채운 표 기본값으로 계속 — 세션 생성을 막지 않는다
                console.error('🎛️ [국면] 행 읽기 실패 — 표 기본값으로 계속:', (e as Error).message);
            }
            // 오늘값 = 평소값의 독립 복사본 (자정에 되돌아간다)
            session.phaseSettings = normalizePhaseSettings(JSON.parse(JSON.stringify(session.basePhaseSettings)));
            // 로그인은 첫짐(STANDBY)에서 시작한다 — 평면 조각(도시·반경·할인율)은 첫짐 국면에서 파생
            const firstPatch = applyPhaseToFilter('first', session.basePhaseSettings.first);

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
                } as AutoDispatchFilter;

                // [완전 격리] activeFilter = baseFilter의 독립 복사본 (로그인 시 1회만)
                //
                // 여기서는 일단 첫짐(STANDBY)으로 시작한다. 이 시점에는 아직 myOrders가
                // 비어 있어 실제 적재 상태를 알 수 없기 때문이다.
                // 진행 중인 콜이 있으면 이후 restoreAndRecalculateSession()이 DB에서
                // 콜을 복구한 뒤 dispatchPhase / isSharedMode / allowedVehicleTypes /
                // 경유 키워드를 **데이터로부터 다시 파생**시켜 덮어쓴다. (이슈 W)
                // 그 연결이 없던 동안, 진행 중인 콜이 3건 있어도 필터는 첫짐인 채로
                // 콜 잡기가 돌아 경로를 벗어난 콜을 잡을 수 있는 상태였다.
                session.activeFilter = {
                    ...session.baseFilter,
                    isSharedMode: false,
                    driverAction: 'WAITING',      // [V2] 세션 복구 시 항상 대기 상태
                    dispatchPhase: 'STANDBY',     // [V2] 세션 복구 시 항상 첫짐 탐색
                };
                // [Phase 6] 여기서 무거운 지리 연산(getCityRegionsWithRadius, CPU 집약)을 하지 않는다.
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
                } as AutoDispatchFilter;
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(userVehicleType);

                // 잔여 칸 기본값을 DB에도 저장 — 국면 옵션 5행은 loadPhaseRows 가 이미 시드했다
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
 * 🔴 타이머 키가 여러 곳에 손으로 나열돼 있었다 (`warn_` · `timeout_` 을 scrap · emergency ·
 *    dispatchEngine 세 곳이 각자 지웠다). 2026-08-14 에 네 번째 키(`presecured_`)를 더하면서
 *    **한 곳만 고치면 나머지가 좀비 타이머로 남는** 구조라는 게 드러났다.
 *    콜이 정상 처리된 뒤에 깨어난 타이머가 멀쩡한 콜을 취소하는 것이 이 레포의 오래된 사고다.
 *
 * 새 타이머를 만들면 **키를 여기에만 더한다.**
 */
export function clearOrderTimers(session: { activeTimers: Map<string, any> }, orderId: string): void {
    for (const prefix of ['warn_', 'timeout_', 'presecured_']) {
        const t = session.activeTimers.get(`${prefix}${orderId}`);
        if (t) clearTimeout(t);
        session.activeTimers.delete(`${prefix}${orderId}`);
    }
}

import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder, getEligibleVehicleTypes, businessDayKey, rateFloorsFrom,
         normalizePhaseSettings, phaseFromFlat, DEFAULT_PHASE_SETTINGS, DEFAULT_JUDGMENT, judgmentFromRow } from "@onedal/shared";
import type { PhaseSettingsMap, PhaseKey, JudgmentConfig } from "@onedal/shared";
import type { CapacityConfidence } from "@onedal/shared";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";

// ━━━ 서비스 권장 기본값 (신규 가입자용) ━━━
const SERVICE_DEFAULT_FILTER: Partial<AutoDispatchFilter> = {
    minFare: 30000,           // 하한가 3만 원
    maxFare: 1000000,         // 상한가 100만 원
    pickupRadiusKm: 10,       // 상차반경 10km
    destinationRadiusKm: 10,  // 도착반경 10km
    detourRadiusKm: 5,      // 우회반경 5km
    destinationCity: "파주",
    isActive: false,
    isSharedMode: false,
    driverAction: 'WAITING',      // [V2] 기사 행동 상태 기본값
    dispatchPhase: 'STANDBY',     // [V2] 콜 잡기 전략 기본값
    // ── 단가 판정 모델 (필터_재설계_명세 §2) — DB call_discount_pct DEFAULT 10 과 같은 값 ──
    callDiscountPct: 10,
    ratePerKm: rateFloorsFrom(10),
};

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
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
    driverLocation: { x: number; y: number } | null;
    /**
     * `driverLocation` 이 **GPS 가 아니라 설정의 '내 주소'** 에서 온 값인가.
     * 화면이 "내 주소 기준"이라고 말할 수 있어야 한다 — 추정으로 계산했다는 사실을 숨기지 않는다.
     * GPS 가 들어오면 false 로 돌아간다 (진짜 위치가 언제나 이긴다).
     */
    driverLocationIsFallback: boolean;
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
     * 국면별 필터 설정 (docs/필터_재설계_명세.md §2-4).
     *
     * `basePhaseSettings`   평소값 — DB `user_filters.phase_settings` 의 사본
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
     * 도착 감지 상태 (2026-08-17 재설계 — docs/도착감지_재설계_계획.md)
     * · arrivalFired    한 번 찍은 정거장(`orderId:stopType`) — **한 정거장당 발화 1회**의 근거
     * · arrivalWatch    지금 감시 중인 "다음 정거장"의 정지 유지 상태 (실 GPS 만)
     * · arrivalNoticed  근접 예고(3km)를 이미 보낸 정거장
     * 사이클이 끝나면 셋 다 비운다 (지나온 구간 진행도와 같은 수명).
     */
    arrivalFired: Set<string>;
    arrivalWatch: { stopKey: string; heldSinceMs: number | null } | null;
    arrivalNoticed: Set<string>;

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
     * 🔴 **저장이 아니라 캐시다.** 경유을 만든 그 순간에 같이 나온 값이고,
     *    경유을 다시 그리면 이것도 같이 바뀐다. 따로 만들면 갈라진다.
     *    경로가 없으면 `null` — 없는 값을 지어내지 않는다.
     */
    detourProgressKm: Record<string, number> | null;
}

const sessions = new Map<string, UserSession>();

function createDefaultSession(): UserSession {
    return {
        myOrders: [],
        pendingDecisions: new Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>(),
        activeTimers: new Map<string, NodeJS.Timeout>(),
        pendingOrdersData: new Map<string, PendingOrder>(),
        deviceEvaluatingMap: new Map<string, string>(),
        baseFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        activeFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        // 실제 값은 아래 부트스트랩이 DB 에서 읽어 덮는다. 여기선 기본값으로 시작한다
        judgment: JSON.parse(JSON.stringify(DEFAULT_JUDGMENT)) as JudgmentConfig,
        driverLocation: null,
        driverLocationIsFallback: false,
        userVehicleType: '1t',
        capacityConfidence: 'ESTIMATED',
        businessDay: businessDayKey(Date.now()),
        isRestored: false,
        isBootstrapping: false,
        basePhaseSettings: normalizePhaseSettings(null),
        phaseSettings: normalizePhaseSettings(null),
        appliedPhaseKey: null,
        detourProgressKm: null,
        departedAt: null,
        lastOrderSyncJson: null,
        lastFilterJson: null,
        lastTrimGPS: undefined,
        lastGpsAt: undefined,
        arrivalFired: new Set(),
        arrivalWatch: null,
        arrivalNoticed: new Set(),
    };
}

// V2의 핵심: 앞으로 모든 상태 접근은 userId 파라미터를 강제로 요구합니다.
export function getUserSession(userId: string): UserSession {
    if (!sessions.has(userId)) {
        const session = createDefaultSession();

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

            if (filterRow) {
                // Restore saved filter into baseFilter
                session.baseFilter = {
                    destinationCity: filterRow.destination_city ?? "",
                    destinationRadiusKm: filterRow.destination_radius_km,
                    detourRadiusKm: filterRow.detour_radius_km,
                    minFare: filterRow.min_fare,
                    maxFare: filterRow.max_fare,
                    pickupRadiusKm: filterRow.pickup_radius_km,
                    excludedKeywords: JSON.parse(filterRow.excluded_keywords || '[]'),
                    isActive: Boolean(filterRow.is_active),
                    // ── 단가 판정 모델 (필터_재설계_명세 §2) ──
                    // call_discount_pct 의 원천은 DB (ALTER ADD COLUMN DEFAULT 10 이 기존 행도 채운다).
                    // ratePerKm 은 파생값 — 저장하지 않고 콜할인율에서 매번 만든다.
                    callDiscountPct: filterRow.call_discount_pct,
                    // 단가표는 DB 의 vehicle_rates·agency_fee_percent 에서 파생시킨다.
                    // shared 폴백 상수를 쓰면 설정에서 요율을 바꿔도 앱 필터가 안 바뀐다.
                    ratePerKm: rateFloorsFrom(
                        filterRow.call_discount_pct,
                        filterRow.vehicle_rates ? JSON.parse(filterRow.vehicle_rates) : undefined,
                        filterRow.agency_fee_percent ?? 23,
                    ),
                } as AutoDispatchFilter;

                /**
                 * 국면별 설정 (§2-4). 저장된 게 없으면 **기존 평면값을 `first` 로 옮긴다** —
                 * 오늘 쓰던 설정(상차 1km 등)을 잃지 않기 위해서다.
                 */
                if (filterRow.phase_settings) {
                    session.basePhaseSettings = normalizePhaseSettings(
                        (() => { try { return JSON.parse(filterRow.phase_settings); } catch { return null; } })()
                    );
                } else {
                    const migrated = normalizePhaseSettings(null);
                    migrated.first = phaseFromFlat({
                        pickupRadiusKm: filterRow.pickup_radius_km,
                        detourRadiusKm: filterRow.detour_radius_km,
                        destinationRadiusKm: filterRow.destination_radius_km,
                        callDiscountPct: filterRow.call_discount_pct,
                        destinationCity: filterRow.destination_city ?? "",
                    }, DEFAULT_PHASE_SETTINGS.first);
                    session.basePhaseSettings = migrated;
                    console.log(`🧭 [국면 설정] 저장된 값이 없어 기존 필터를 first 국면으로 옮겼습니다 ` +
                        `(상차 ${migrated.first.pickupRadiusKm}km · 경유 ${migrated.first.detourAllowKm}km · ` +
                        `하차 ${migrated.first.dropoffRadiusKm}km · 할인 ${migrated.first.discountPct}%)`);
                }
                // 오늘값 = 평소값의 독립 복사본 (자정에 되돌아간다)
                session.phaseSettings = normalizePhaseSettings(JSON.parse(JSON.stringify(session.basePhaseSettings)));

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
                // 신규 유저: 서비스 권장 기본값으로 초기화
                session.baseFilter = { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter;
                session.activeFilter = {
                    ...SERVICE_DEFAULT_FILTER,
                    isSharedMode: false,
                    driverAction: 'WAITING',      // [V2]
                    dispatchPhase: 'STANDBY',     // [V2]
                } as AutoDispatchFilter;
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(userVehicleType);

                // 서비스 권장 기본값을 DB에도 저장 (빈 껍데기가 아닌 의미 있는 초기값)
                db.prepare(`
                    INSERT OR IGNORE INTO user_filters 
                    (user_id, min_fare, max_fare, pickup_radius_km, destination_radius_km, detour_radius_km, destination_city) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(userId, 30000, 1000000, 10, 10, 5, '파주');

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

import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder, getEligibleVehicleTypes, businessDayKey, rateFloorsFrom,
         normalizePhaseSettings, phaseFromFlat, DEFAULT_PHASE_SETTINGS } from "@onedal/shared";
import type { PhaseSettingsMap, PhaseKey } from "@onedal/shared";
import type { CapacityConfidence } from "@onedal/shared";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";

// ━━━ 서비스 권장 기본값 (신규 가입자용) ━━━
const SERVICE_DEFAULT_FILTER: Partial<AutoDispatchFilter> = {
    minFare: 30000,           // 하한가 3만 원
    maxFare: 1000000,         // 상한가 100만 원
    pickupRadiusKm: 10,       // 상차반경 10km
    destinationRadiusKm: 10,  // 도착반경 10km
    corridorRadiusKm: 5,      // 우회반경 5km
    destinationCity: "파주",
    isActive: false,
    isSharedMode: false,
    driverAction: 'WAITING',      // [V2] 기사 행동 상태 기본값
    dispatchPhase: 'STANDBY',     // [V2] 사냥 전략 기본값
    // ── 단가 판정 모델 (필터_재설계_명세 §2) — DB eyeline_pct DEFAULT 10 과 같은 값 ──
    eyelinePct: 10,
    ratePerKm: rateFloorsFrom(10),
};

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    myOrders: MyOrder[];                    // [계층 2-B] 확정된 내 퀵 배열 (단일 배열, 상태 필터링으로 관리)
    // [Option B] 응답 객체 대신 판결(Decision) 데이터를 저장하는 큐 형식으로 변경
    pendingDecisions: Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>;
    // [Option B] 비상벨(emergency) 시 취소할 수 있도록 데스밸리 타이머 저장
    activeTimers: Map<string, NodeJS.Timeout>;
    pendingOrdersData: Map<string, PendingOrder>;  // [계층 2-A] 심사 중 오더 (아직 내 퀵이 아님)
    deviceEvaluatingMap: Map<string, string>;
    baseFilter: AutoDispatchFilter;
    activeFilter: AutoDispatchFilter;
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
     * [Phase 6] 부트스트랩(데이터 로드 → 노선 산출 → 상태 파생 → 회랑 도출) 진행 중 여부.
     * true 인 동안에는 activeFilter 가 아직 미완성이므로 앱폰에 사냥을 시키지 않는다.
     * (예전에는 복구가 끝나기 전 1~3초 동안 "첫짐 필터(회랑 없음)"가 앱에 나가
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
     * 회랑의 동마다 **경로 몇 km 지점인가** — 지나온 구간을 지울 때 쓴다.
     *
     * 🔴 **저장이 아니라 캐시다.** 회랑을 만든 그 순간에 같이 나온 값이고,
     *    회랑을 다시 그리면 이것도 같이 바뀐다. 따로 만들면 갈라진다.
     *    경로가 없으면 `null` — 없는 값을 지어내지 않는다.
     */
    corridorProgressKm: Record<string, number> | null;
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
        corridorProgressKm: null,
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

            if (filterRow) {
                // Restore saved filter into baseFilter
                session.baseFilter = {
                    destinationCity: filterRow.destination_city ?? "",
                    destinationRadiusKm: filterRow.destination_radius_km,
                    corridorRadiusKm: filterRow.corridor_radius_km,
                    minFare: filterRow.min_fare,
                    maxFare: filterRow.max_fare,
                    pickupRadiusKm: filterRow.pickup_radius_km,
                    excludedKeywords: JSON.parse(filterRow.excluded_keywords || '[]'),
                    isActive: Boolean(filterRow.is_active),
                    // ── 단가 판정 모델 (필터_재설계_명세 §2) ──
                    // eyeline_pct 의 원천은 DB (ALTER ADD COLUMN DEFAULT 10 이 기존 행도 채운다).
                    // ratePerKm 은 파생값 — 저장하지 않고 눈높이에서 매번 만든다.
                    eyelinePct: filterRow.eyeline_pct,
                    // 단가표는 DB 의 vehicle_rates·agency_fee_percent 에서 파생시킨다.
                    // shared 폴백 상수를 쓰면 설정에서 요율을 바꿔도 앱 필터가 안 바뀐다.
                    ratePerKm: rateFloorsFrom(
                        filterRow.eyeline_pct,
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
                        corridorRadiusKm: filterRow.corridor_radius_km,
                        destinationRadiusKm: filterRow.destination_radius_km,
                        eyelinePct: filterRow.eyeline_pct,
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
                // 회랑 키워드를 **데이터로부터 다시 파생**시켜 덮어쓴다. (이슈 W)
                // 그 연결이 없던 동안, 진행 중인 콜이 3건 있어도 필터는 첫짐인 채로
                // 사냥이 돌아 경로를 벗어난 콜을 잡을 수 있는 상태였다.
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
                    (user_id, min_fare, max_fare, pickup_radius_km, destination_radius_km, corridor_radius_km, destination_city) 
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

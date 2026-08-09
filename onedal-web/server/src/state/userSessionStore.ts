import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder, getEligibleVehicleTypes } from "@onedal/shared";
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
    userVehicleType: string; // user_settings의 내 차종 (동적 허용 차종 생성용)
    isRestored: boolean;     // [방안 1] 서버 재시작 복구 로직 1회 실행 여부 플래그
    /**
     * [Phase 6] 부트스트랩(데이터 로드 → 노선 산출 → 상태 파생 → 회랑 도출) 진행 중 여부.
     * true 인 동안에는 activeFilter 가 아직 미완성이므로 앱폰에 사냥을 시키지 않는다.
     * (예전에는 복구가 끝나기 전 1~3초 동안 "첫짐 필터(회랑 없음)"가 앱에 나가
     *  경로를 벗어난 콜을 잡을 수 있었다)
     */
    isBootstrapping: boolean;
    /** [Phase 8.4] 지금 잔여 적재량을 얼마나 믿을 수 있는가 (추정/신고/확정) */
    capacityConfidence: CapacityConfidence;
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
        userVehicleType: '1t',
        capacityConfidence: 'ESTIMATED',
        isRestored: false,
        isBootstrapping: false
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
                    isActive: Boolean(filterRow.is_active)
                } as AutoDispatchFilter;

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

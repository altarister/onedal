import { AutoDispatchFilter, SecuredOrder, PendingOrder, MyOrder } from "@onedal/shared";
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
    excludedKeywords: [],
    isActive: false,
    isSharedMode: false,
    loadState: 'EMPTY',
    driverAction: 'WAITING',      // [V2] 기사 행동 상태 기본값
    dispatchPhase: 'STANDBY',     // [V2] 사냥 전략 기본값
};

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    mainCallState: MyOrder | null;          // [계층 2-B] 확정된 본콜 (내 퀵)
    subCalls: MyOrder[];                    // [계층 2-B] 확정된 합짐 콜들 (내 퀵)
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
}

const sessions = new Map<string, UserSession>();

function createDefaultSession(): UserSession {
    return {
        mainCallState: null,
        subCalls: [],
        pendingDecisions: new Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>(),
        activeTimers: new Map<string, NodeJS.Timeout>(),
        pendingOrdersData: new Map<string, PendingOrder>(),
        deviceEvaluatingMap: new Map<string, string>(),
        baseFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        activeFilter: { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter,
        driverLocation: null,
        userVehicleType: '1t'
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
                // 세션 복구 시 런타임 상태는 항상 첫짐(EMPTY) (어제의 LOADING/DRIVING이 오늘 살아나는 것을 방지)
                const { getCityRegionsWithRadius } = require('../services/geoService');
                const { getSharedModeVehicleTypes } = require('@onedal/shared');
                
                session.activeFilter = {
                    ...session.baseFilter,
                    isSharedMode: false,
                    loadState: 'EMPTY',
                    driverAction: 'WAITING',      // [V2] 세션 복구 시 항상 대기 상태
                    dispatchPhase: 'STANDBY',     // [V2] 세션 복구 시 항상 첫짐 탐색
                };
                const city = session.activeFilter.destinationCity || '';
                const radius = session.activeFilter.destinationRadiusKm || 0;
                const { flat, grouped } = getCityRegionsWithRadius(city, radius);
                session.activeFilter.destinationKeywords = flat;
                session.activeFilter.destinationGroups = grouped;
                session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(userVehicleType);

                logRoadmapEvent("서버", `[Session DB Load] 유저 ${userId} 복구된 원본 필터(Raw DB): \n` + JSON.stringify(filterRow, null, 2));
            } else {
                // 신규 유저: 서비스 권장 기본값으로 초기화
                const { getSharedModeVehicleTypes } = require('@onedal/shared');

                session.baseFilter = { ...SERVICE_DEFAULT_FILTER } as AutoDispatchFilter;
                session.activeFilter = {
                    ...SERVICE_DEFAULT_FILTER,
                    isSharedMode: false,
                    loadState: 'EMPTY',
                    driverAction: 'WAITING',      // [V2]
                    dispatchPhase: 'STANDBY',     // [V2]
                } as AutoDispatchFilter;
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(userVehicleType);

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

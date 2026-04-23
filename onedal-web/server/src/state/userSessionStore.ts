import { AutoDispatchFilter, SecuredOrder } from "@onedal/shared";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    mainCallState: SecuredOrder | null;
    subCalls: SecuredOrder[];
    // [Option B] 응답 객체 대신 판결(Decision) 데이터를 저장하는 큐 형식으로 변경
    pendingDecisions: Map<string, { action: "KEEP" | "CANCEL" | null; evaluatedAt: number }>;
    // [Option B] 비상벨(emergency) 시 취소할 수 있도록 데스밸리 타이머 저장
    activeTimers: Map<string, NodeJS.Timeout>;
    pendingOrdersData: Map<string, SecuredOrder>;
    deviceEvaluatingMap: Map<string, string>;
    baseFilter: AutoDispatchFilter;
    runtimeOverrides: Partial<AutoDispatchFilter>;
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
        pendingOrdersData: new Map<string, SecuredOrder>(),
        deviceEvaluatingMap: new Map<string, string>(),
        baseFilter: {} as AutoDispatchFilter,
        runtimeOverrides: {
            isSharedMode: false,
            loadState: 'EMPTY'
        },
        activeFilter: {} as AutoDispatchFilter,
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
            const settingsRow = db.prepare("SELECT vehicle_type FROM user_settings WHERE user_id = ?").get(userId) as any;
            const userVehicleType = settingsRow?.vehicle_type || '1t';
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

                // 세션 복구 시 런타임 상태는 항상 초기화 (어제의 LOADING/DRIVING이 오늘 살아나는 것을 방지)
                session.runtimeOverrides = {
                    isSharedMode: false,
                    loadState: 'EMPTY'
                };

                // activeFilter 최초 계산은 filterManager.ts의 모듈을 재사용하지 못하므로 여기서 수동 초기화 (순환 참조 방지)
                const { getRegionsByCity } = require('../geoResolver');
                const { getSharedModeVehicleTypes } = require('@onedal/shared');
                
                session.activeFilter = { ...session.baseFilter, ...session.runtimeOverrides };
                session.activeFilter.destinationKeywords = getRegionsByCity(session.activeFilter.destinationCity || '');
                session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(userVehicleType);

                logRoadmapEvent("서버", `[Session DB Load] 유저 ${userId} 복구된 원본 필터(Raw DB): \n` + JSON.stringify(filterRow, null, 2));
            } else {
                // Initialize default filter using user's vehicle_type and all smaller vehicles
                const fallbackVehicle = settingsRow?.vehicle_type || '1t';
                const { getSharedModeVehicleTypes } = require('@onedal/shared');

                session.baseFilter = {
                    isActive: false
                } as AutoDispatchFilter;

                session.runtimeOverrides = {
                    isSharedMode: false,
                    loadState: 'EMPTY'
                };

                const { getRegionsByCity } = require('../geoResolver');

                session.activeFilter = { ...session.baseFilter, ...session.runtimeOverrides };
                session.activeFilter.destinationKeywords = [];
                session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(userVehicleType);

                // Save this initial default to DB silently
                db.prepare(`
                    INSERT OR IGNORE INTO user_filters 
                    (user_id) 
                    VALUES (?)
                `).run(userId);

                console.log(`[Session] 유저 ${userId} 최초 필터 생성됨 (차종: ${userVehicleType})`);
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


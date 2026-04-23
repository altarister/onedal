import { AutoDispatchFilter, SecuredOrder } from "@onedal/shared";
import db from "../db";

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
            isActive: false,
            isSharedMode: false,
            loadState: 'EMPTY'
        },
        activeFilter: {} as AutoDispatchFilter,
        driverLocation: null
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
            
            if (filterRow) {
                // Restore saved filter into baseFilter
                session.baseFilter = {
                    destinationCity: filterRow.destination_city || "",
                    destinationRadiusKm: filterRow.destination_radius_km || 10,
                    corridorRadiusKm: filterRow.corridor_radius_km || 1,
                    allowedVehicleTypes: JSON.parse(filterRow.allowed_vehicle_types || '[]'),
                    minFare: filterRow.min_fare || 0,
                    maxFare: filterRow.max_fare || 1000000,
                    pickupRadiusKm: filterRow.pickup_radius_km || 999,
                    excludedKeywords: JSON.parse(filterRow.excluded_keywords || '[]'),
                    destinationKeywords: JSON.parse(filterRow.destination_keywords || '[]')
                } as AutoDispatchFilter;

                // 세션 복구 시 런타임 상태는 항상 초기화 (어제의 LOADING/DRIVING이 오늘 살아나는 것을 방지)
                session.runtimeOverrides = {
                    isActive: Boolean(filterRow.is_active), // 활성화 여부는 저장된 값 유지
                    isSharedMode: false,
                    loadState: 'EMPTY'
                };
                
                // activeFilter 최초 계산
                session.activeFilter = { ...session.baseFilter, ...session.runtimeOverrides };
                
                console.log(`[Session] 유저 ${userId} 의 기존 필터 복구 완료 (loadState=EMPTY로 초기화)`);
            } else {
                // Initialize default filter using user's vehicle_type and all smaller vehicles
                const fallbackVehicle = settingsRow?.vehicle_type || '1t';
                const { getSharedModeVehicleTypes } = require('@onedal/shared');
                
                session.baseFilter = {
                    allowedVehicleTypes: getSharedModeVehicleTypes(fallbackVehicle)
                } as AutoDispatchFilter;
                
                session.runtimeOverrides = {
                    isActive: false,
                    isSharedMode: false,
                    loadState: 'EMPTY'
                };
                
                session.activeFilter = { ...session.baseFilter, ...session.runtimeOverrides };
                
                // Save this initial default to DB silently
                db.prepare(`
                    INSERT OR IGNORE INTO user_filters 
                    (user_id, allowed_vehicle_types) 
                    VALUES (?, ?)
                `).run(userId, JSON.stringify([fallbackVehicle]));
                
                console.log(`[Session] 유저 ${userId} 최초 필터 생성됨 (차종: ${fallbackVehicle})`);
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


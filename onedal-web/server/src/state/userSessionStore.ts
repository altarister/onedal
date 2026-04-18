import { AutoDispatchFilter, SecuredOrder } from "@onedal/shared";
import db from "../db";

// 1명의 기사가 가지는 '모든' 상태 캡슐화
export interface UserSession {
    mainCallState: SecuredOrder | null;
    subCalls: SecuredOrder[];
    pendingDetailRequests: Map<string, any>;
    pendingOrdersData: Map<string, SecuredOrder>;
    deviceEvaluatingMap: Map<string, string>;
    activeFilter: AutoDispatchFilter;
    driverLocation: { x: number; y: number } | null;
}

const sessions = new Map<string, UserSession>();

function createDefaultSession(): UserSession {
    return {
        mainCallState: null,
        subCalls: [],
        pendingDetailRequests: new Map<string, any>(),
        pendingOrdersData: new Map<string, SecuredOrder>(),
        deviceEvaluatingMap: new Map<string, string>(),
        activeFilter: {
            isActive: false,
            isSharedMode: false
        } as AutoDispatchFilter,
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
                // Restore saved filter
                session.activeFilter = {
                    isActive: Boolean(filterRow.is_active),
                    isSharedMode: Boolean(filterRow.is_shared_mode),
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
                console.log(`[Session] 유저 ${userId} 의 기존 필터 복구 완료`);
            } else {
                // Initialize default filter using user's vehicle_type
                const fallbackVehicle = settingsRow?.vehicle_type || '1t';
                session.activeFilter.allowedVehicleTypes = [fallbackVehicle];
                
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


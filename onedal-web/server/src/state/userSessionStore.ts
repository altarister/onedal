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
        sessions.set(userId, createDefaultSession());
    }
    return sessions.get(userId)!;
}

export function getAllActiveUserIds(): string[] {
    return Array.from(sessions.keys());
}

/**
 * 서버 재부팅 시 DB에 저장된 활성화된 필터 정보를 찾아
 * 메모리(Map)에 적재하여, 기사들이 웹에서 재저장할 필요 없도록 복구합니다.
 */
export function hydrateSessionsFromDB() {
    try {
        console.log("🔄 [Hydration] DB에서 기사님들의 필터 정보를 불러옵니다...");
        
        // SQLite에서 설정 정보를 읽습니다. (존재하지 않으면 예외가 발생할 수 있으니 try-catch로 방어)
        const filters = db.prepare("SELECT * FROM user_filters WHERE is_active = 1").all() as any[];
        
        let count = 0;
        for (const row of filters) {
            const userId = row.user_id;
            const session = getUserSession(userId);
            
            session.activeFilter = {
                isActive: Boolean(row.is_active),
                isSharedMode: Boolean(row.is_shared_mode),
                destinationCity: row.destination_city || "",
                destinationRadiusKm: row.destination_radius_km || 10,
                corridorRadiusKm: row.corridor_radius_km || 1,
                allowedVehicleTypes: JSON.parse(row.allowed_vehicle_types || '[]'),
                minFare: row.min_fare || 0,
                maxFare: row.max_fare || 1000000,
                pickupRadiusKm: row.pickup_radius_km || 999,
                excludedKeywords: JSON.parse(row.excluded_keywords || '[]'),
                destinationKeywords: JSON.parse(row.destination_keywords || '[]')
            } as AutoDispatchFilter;
            
            count++;
        }
        console.log(`✅ [Hydration] 총 ${count}명의 활성 필터 복구 완료.`);
    } catch (err: any) {
        // 테이블이 아직 없거나 에러가 날 경우 조용히 넘어갑니다.
        if (err.message && err.message.includes('no such table')) {
             console.log("⚠️ [Hydration] user_filters 테이블이 아직 생성되지 않았습니다.");
        } else {
             console.error("❌ [Hydration] 필터 복구 실패:", err);
        }
    }
}


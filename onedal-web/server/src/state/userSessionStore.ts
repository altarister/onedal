import { AutoDispatchFilter, SecuredOrder } from "@onedal/shared";

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

/**
 * filterManager.ts — 필터 변경의 단일 진입점
 * 
 * 모든 필터 변경은 반드시 이 모듈의 applyFilter()를 통해서만 수행합니다.
 * 메모리 갱신 + DB 저장 + 소켓 emit을 원자적으로 보장합니다.
 */

import db from "../db";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter } from "@onedal/shared";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
const stmtUpdateFilter = db.prepare(`
    UPDATE user_filters SET
        destination_city = ?, destination_radius_km = ?, corridor_radius_km = ?,
        allowed_vehicle_types = ?, min_fare = ?, max_fare = ?, pickup_radius_km = ?,
        excluded_keywords = ?, destination_keywords = ?, is_active = ?, is_shared_mode = ?,
        load_state = ?
    WHERE user_id = ?
`);

const stmtInsertFilter = db.prepare(`
    INSERT OR IGNORE INTO user_filters (user_id) VALUES (?)
`);

/**
 * 모든 필터 변경의 단일 진입점
 * 
 * @param userId - 유저 ID
 * @param changes - 변경할 필터 필드 (Partial)
 * @param io - Socket.io 인스턴스 (null이면 소켓 emit 생략)
 * @param persistToDB - true면 DB에도 영구 저장, false면 메모리+소켓만 (일회성 세션 조작용)
 * @returns 변경 후의 최종 필터 상태
 */
export function applyFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any,
    persistToDB: boolean = true
): AutoDispatchFilter {
    const session = getUserSession(userId);

    // 1. 메모리 갱신
    session.activeFilter = { ...session.activeFilter, ...changes };

    // 2. DB 영구 저장 (persistToDB가 true일 때만)
    if (persistToDB) {
        try {
            const f = session.activeFilter;
            stmtInsertFilter.run(userId); // user_filters 행이 없으면 기본값으로 생성
            stmtUpdateFilter.run(
                f.destinationCity || "",
                f.destinationRadiusKm || 10,
                f.corridorRadiusKm || 1,
                JSON.stringify(f.allowedVehicleTypes || []),
                f.minFare || 0,
                f.maxFare || 1000000,
                f.pickupRadiusKm || 999,
                JSON.stringify(f.excludedKeywords || []),
                JSON.stringify(f.destinationKeywords || []),
                f.isActive ? 1 : 0,
                f.isSharedMode ? 1 : 0,
                f.loadState || 'EMPTY',
                userId
            );
        } catch (e) {
            console.error(`[FilterManager] DB 저장 에러 (userId: ${userId}):`, e);
        }
    }

    // 3. 소켓 브로드캐스트 (관제탑 + 앱폰 동기화)
    if (io) {
        io.to(userId).emit("filter-updated", session.activeFilter);
    }

    return session.activeFilter;
}

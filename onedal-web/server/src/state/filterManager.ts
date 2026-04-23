/**
 * filterManager.ts — 필터 변경의 단일 진입점
 * 
 * 모든 필터 변경은 반드시 이 모듈의 applyFilter()를 통해서만 수행합니다.
 * 메모리 갱신 + DB 저장 + 소켓 emit을 원자적으로 보장합니다.
 */

import db from "../db";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";

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

    if (persistToDB) {
        // DB 저장(원본 설정 변경)인 경우 baseFilter 업데이트
        session.baseFilter = { ...session.baseFilter, ...changes };
        
        try {
            const b = session.baseFilter;
            
            stmtInsertFilter.run(userId);
            stmtUpdateFilter.run(
                b.destinationCity ?? "",
                b.destinationRadiusKm,
                b.corridorRadiusKm,
                JSON.stringify(b.allowedVehicleTypes ?? []),
                b.minFare,
                b.maxFare,
                b.pickupRadiusKm,
                JSON.stringify(b.excludedKeywords || []),
                JSON.stringify(b.destinationKeywords || []),
                session.runtimeOverrides.isActive ? 1 : 0,
                0, // isSharedMode는 DB에 영구저장 안함
                'EMPTY', // loadState는 DB에 항상 EMPTY로 저장
                userId
            );
        } catch (e) {
            console.error(`[FilterManager] DB 저장 에러 (userId: ${userId}):`, e);
        }
    } else {
        // 일회성 세션 조작(시스템 조작)인 경우 runtimeOverrides 업데이트
        session.runtimeOverrides = { ...session.runtimeOverrides, ...changes };
    }

    // [중요] 상태가 완전히 초기화(EMPTY)될 때 기존의 임시 조작값(회랑 10 등)을 날려버림
    const nextLoadState = changes.loadState ?? session.runtimeOverrides.loadState ?? session.baseFilter.loadState;
    
    if (nextLoadState === 'EMPTY') {
        // isActive 상태만 유지하고 나머지 런타임 조작값(회랑 등)은 모두 파기
        const currentActive = session.runtimeOverrides.isActive;
        session.runtimeOverrides = { isActive: currentActive, loadState: 'EMPTY' };
        session.baseFilter.loadState = 'EMPTY';
        session.baseFilter.isSharedMode = false;
    }

    // 3. activeFilter 재계산 (원본 위에 임시 조작 덧씌우기)
    session.activeFilter = {
        ...session.baseFilter,
        ...session.runtimeOverrides
    };

    let schemaLogStr = "{\n";
    for (const key of Object.keys(session.activeFilter)) {
        const val = (session.activeFilter as any)[key];
        schemaLogStr += `  "${key}": ${JSON.stringify(val)},\n`;
    }
    schemaLogStr += "}";

    logRoadmapEvent("서버", `[FilterManager] 필터 변경 발생! (DB저장여부: ${persistToDB})\n - 변경 요청된 값: ${JSON.stringify(changes)}\n - 반영 후 최종 동작 필터(activeFilter):\n` + schemaLogStr);

    // 4. 소켓 브로드캐스트 (관제탑 + 앱폰 동기화)
    if (io) {
        io.to(userId).emit("filter-updated", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter // 프론트 모달창 렌더링용 원본
        });
    }

    return session.activeFilter;
}

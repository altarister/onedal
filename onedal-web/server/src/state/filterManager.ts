/**
 * filterManager.ts — 필터 변경의 단일 진입점
 * 
 * 모든 필터 변경은 반드시 이 모듈의 applyFilter()를 통해서만 수행합니다.
 * 메모리 갱신 + DB 저장 + 소켓 emit을 원자적으로 보장합니다.
 */

import db from "../db";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getSharedModeVehicleTypes } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { getRegionsByCity } from "../geoResolver";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
const stmtUpdateFilter = db.prepare(`
    UPDATE user_filters SET
        destination_city = ?, destination_radius_km = ?, corridor_radius_km = ?,
        min_fare = ?, max_fare = ?, pickup_radius_km = ?,
        excluded_keywords = ?, is_active = ?, is_shared_mode = ?,
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

        // 런타임에 찌꺼기로 남은 값들 청소 (Shadowing 방지)
        for (const key of Object.keys(changes)) {
            if (key in session.runtimeOverrides) {
                delete (session.runtimeOverrides as any)[key];
            }
        }

        try {
            const b = session.baseFilter;

            stmtInsertFilter.run(userId);
            stmtUpdateFilter.run(
                b.destinationCity ?? "",
                b.destinationRadiusKm,
                b.corridorRadiusKm,
                b.minFare,
                b.maxFare,
                b.pickupRadiusKm,
                JSON.stringify(b.excludedKeywords || []),
                b.isActive ? 1 : 0,
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
        // 런타임 조작값 파기하되, isActive 상태(자동/수동)는 유지
        const currentIsActive = session.runtimeOverrides.isActive;
        const explicitKeywords = changes.destinationKeywords;  // 이번에 명시적으로 요청된 투트랙 키워드 등
        const explicitCity = changes.destinationCity;          // 이번에 명시적으로 요청된 커스텀 라벨

        session.runtimeOverrides = { loadState: 'EMPTY' };
        if (currentIsActive !== undefined) {
            session.runtimeOverrides.isActive = currentIsActive;
        }
        if (explicitKeywords) session.runtimeOverrides.destinationKeywords = explicitKeywords;
        if (explicitCity) session.runtimeOverrides.destinationCity = explicitCity;

        session.baseFilter.loadState = 'EMPTY';
        session.baseFilter.isSharedMode = false;
    }

    // 3. activeFilter 재계산 (원본 위에 임시 조작 덧씌우기)
    session.activeFilter = {
        ...session.baseFilter,
        ...session.runtimeOverrides
    };

    // 4. 파생 데이터 동적 생성 (사용자가 일회성 팝업으로 오버라이드하지 않은 경우에만)
    if (!session.runtimeOverrides.destinationKeywords && session.activeFilter.destinationCity) {
        session.activeFilter.destinationKeywords = getRegionsByCity(session.activeFilter.destinationCity);
    } else if (!session.runtimeOverrides.destinationKeywords && !session.activeFilter.destinationCity) {
        session.activeFilter.destinationKeywords = [];
    }
    
    if (!session.runtimeOverrides.allowedVehicleTypes) {
        session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(session.userVehicleType || '1t');
    }

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

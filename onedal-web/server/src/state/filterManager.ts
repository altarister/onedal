/**
 * filterManager.ts — 필터 변경의 단일 진입점 (완전 격리 아키텍처 v2)
 * 
 * 두 개의 명확한 함수로 분리되어 있습니다:
 *   1. saveBaseFilter()   — 톱니바퀴(SettingsModal) 전용. DB만 저장, activeFilter 불변.
 *   2. updateActiveFilter() — 돋보기(OrderFilterModal) + 시스템(State Machine) 전용. 메모리만 수정, DB 불변.
 * 
 * [핵심 원칙]
 * - baseFilter(DB)와 activeFilter(메모리)는 완전히 독립적입니다.
 * - 영구 설정을 바꿔도 현재 사냥 중인 activeFilter에는 1도 영향을 주지 않습니다.
 * - activeFilter는 직접 수정하고 직접 읽는 1등 시민(first-class citizen)입니다.
 */

import db from "../db";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getSharedModeVehicleTypes } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { getCityRegionsWithRadius } from "../services/geoService";

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

// ━━━ 내부 유틸: activeFilter 로그 출력 ━━━
function logActiveFilter(session: ReturnType<typeof getUserSession>, actionType: string, changes: Partial<AutoDispatchFilter>) {
    let schemaLogStr = "{\n";
    for (const key of Object.keys(session.activeFilter)) {
        const val = (session.activeFilter as any)[key];
        schemaLogStr += `  "${key}": ${JSON.stringify(val)},\n`;
    }
    schemaLogStr += "}";

    logRoadmapEvent(
        "서버", 
        `[FilterManager] 필터 변경 발생! (${actionType})\n` +
        ` - 변경 요청된 값: ${JSON.stringify(changes)}\n` +
        ` - 반영 후 최종 동작 필터(activeFilter):\n${schemaLogStr}`
    );
}

// ━━━ 내부 유틸: 파생 데이터(destinationKeywords, allowedVehicleTypes) 재계산 ━━━
function recalculateDerivedFields(session: ReturnType<typeof getUserSession>, changes: Partial<AutoDispatchFilter>) {
    // destinationKeywords: 명시적으로 전달된 경우에만 사용, 아니면 도시명으로 자동 생성
    if (!changes.destinationKeywords && session.activeFilter.destinationCity) {
        const city = session.activeFilter.destinationCity;
        const radius = session.activeFilter.destinationRadiusKm || 0;
        const { flat, grouped } = getCityRegionsWithRadius(city, radius);
        session.activeFilter.destinationKeywords = flat;
        session.activeFilter.destinationGroups = grouped;
    } else if (!changes.destinationKeywords && !session.activeFilter.destinationCity) {
        session.activeFilter.destinationKeywords = [];
        session.activeFilter.destinationGroups = {};
    }

    // allowedVehicleTypes: 명시적으로 전달된 경우에만 사용, 아니면 기사 차종으로 자동 생성
    if (!changes.allowedVehicleTypes) {
        session.activeFilter.allowedVehicleTypes = getSharedModeVehicleTypes(session.userVehicleType || '1t');
    }
}

// ━━━ 내부 유틸: 소켓 브로드캐스트 ━━━
function broadcastFilter(userId: string, session: ReturnType<typeof getUserSession>, io?: any) {
    if (io) {
        io.to(userId).emit("filter-updated", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter
        });
    }
}

/**
 * [톱니바퀴 전용] 영구 설정(baseFilter)을 DB에 저장합니다.
 * 
 * ⚠️ 현재 사냥 중인 activeFilter에는 절대 영향을 주지 않습니다.
 * "내일 출근할 때 적용될 설정"을 바꾸는 것입니다.
 * 
 * @param userId - 유저 ID
 * @param changes - 변경할 필터 필드 (Partial)
 */
export function saveBaseFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any
): void {
    const session = getUserSession(userId);

    // baseFilter만 업데이트
    session.baseFilter = { ...session.baseFilter, ...changes };

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

    logRoadmapEvent(
        "서버",
        `[FilterManager] 영구 설정(baseFilter) DB 저장 완료\n` +
        ` - 변경된 값: ${JSON.stringify(changes)}\n` +
        ` - ⚠️ activeFilter는 변경하지 않음 (현재 사냥에 영향 없음)`
    );

    // baseFilter 변경 내역을 프론트엔드에 실시간 전파 (초기화 버튼 클릭 시 최신값 반영을 위함)
    if (io) {
        broadcastFilter(userId, session, io);
    }
}

/**
 * [돋보기 + 시스템 전용] 현재 사냥 중인 activeFilter를 직접 수정합니다.
 * 
 * DB에는 절대 접근하지 않습니다. 메모리 + 소켓 전파만 수행합니다.
 * OrderFilterModal(돋보기), dispatchEngine(State Machine), geoService(GPS 트림) 등에서 사용합니다.
 * 
 * @param userId - 유저 ID
 * @param changes - 변경할 필터 필드 (Partial)
 * @param io - Socket.io 인스턴스 (null이면 소켓 emit 생략)
 * @returns 변경 후의 최종 필터 상태
 */
export function updateActiveFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any
): AutoDispatchFilter {
    const session = getUserSession(userId);

    // [중요] EMPTY 전환 감지: 다른 상태(LOADING/DRIVING)에서 EMPTY로 복귀할 때
    // 합짐 사이클에서 사용된 임시 값들(회랑, 차종 제한 등)을 baseFilter 기준으로 리셋
    const previousLoadState = session.activeFilter?.loadState ?? 'EMPTY';
    const nextLoadState = changes.loadState ?? previousLoadState;
    const isTransitionToEmpty = previousLoadState !== 'EMPTY' && nextLoadState === 'EMPTY';

    if (isTransitionToEmpty) {
        // 합짐 사이클 종료 → activeFilter를 baseFilter 기준으로 리셋하되, isActive는 유지
        const currentIsActive = session.activeFilter.isActive;
        session.activeFilter = {
            ...session.baseFilter,
            isActive: currentIsActive,
            isSharedMode: false,
            loadState: 'EMPTY',
            driverAction: 'WAITING',      // [V2] 합짐 사이클 종료 → 대기 상태
            dispatchPhase: 'STANDBY',     // [V2] 합짐 사이클 종료 → 첫짐 탐색
        };
        // 리셋 후 파생 데이터 재계산
        recalculateDerivedFields(session, {});
        console.log(`[FilterManager] EMPTY 상태로 복귀: activeFilter를 baseFilter 기준으로 리셋했습니다.`);
    } else {
        // 일반 변경: activeFilter에 직접 덮어쓰기
        session.activeFilter = { ...session.activeFilter, ...changes };
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes);
    }

    logActiveFilter(session, "실시간 변경(activeFilter)", changes);
    broadcastFilter(userId, session, io);

    return session.activeFilter;
}

// ━━━ 하위 호환 ━━━
// 기존 applyFilter()를 호출하는 코드가 남아있을 경우를 위한 브릿지 (추후 삭제 예정)
/** @deprecated saveBaseFilter() 또는 updateActiveFilter()를 사용하세요. */
export function applyFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any,
    persistToDB: boolean = true
): AutoDispatchFilter {
    if (persistToDB) {
        saveBaseFilter(userId, changes);
        // 하위 호환: 기존처럼 activeFilter도 반환해야 하므로 세션에서 가져옴
        return getUserSession(userId).activeFilter;
    } else {
        return updateActiveFilter(userId, changes, io);
    }
}

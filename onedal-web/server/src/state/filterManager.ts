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
import { getEligibleVehicleTypes } from "@onedal/shared";
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
    // [최적화] 지리 연산(getCityRegionsWithRadius)은 CPU 집약적(~7초)이므로,
    // destinationCity 또는 destinationRadiusKm가 실제로 변경된 경우에만 재계산.
    // isActive, minFare 등 단순 상태 변경 시에는 기존 캐시된 키워드를 그대로 재사용.
    const needsGeoRecalc =
        'destinationCity' in changes ||
        'destinationRadiusKm' in changes ||
        (!session.activeFilter.destinationKeywords || session.activeFilter.destinationKeywords.length === 0);

    if (changes.destinationKeywords) {
        // 명시적으로 키워드가 전달된 경우 (합짐 회랑 계산 결과 등) → 그대로 사용
    } else if (session.activeFilter.destinationCity && needsGeoRecalc) {
        // 도시명/반경이 변경되었거나 키워드가 아직 계산되지 않은 경우에만 무거운 연산 수행
        const city = session.activeFilter.destinationCity;
        const radius = session.activeFilter.destinationRadiusKm || 0;
        console.log(`🗺️ [FilterManager] 지리 연산 트리거 (city=${city}, radius=${radius}km)`);
        const { flat, grouped } = getCityRegionsWithRadius(city, radius);
        session.activeFilter.destinationKeywords = flat;
        session.activeFilter.destinationGroups = grouped;
    } else if (!session.activeFilter.destinationCity) {
        session.activeFilter.destinationKeywords = [];
        session.activeFilter.destinationGroups = {};
    }
    // else: 도시/반경 변경 없음 → 기존 캐시된 destinationKeywords 유지 (이벤트 루프 보호)

    // allowedVehicleTypes: 명시적으로 전달된 경우에만 사용, 아니면 기사 차종으로 자동 생성
    // (이 연산은 경량이므로 매번 실행해도 무방)
    if (!changes.allowedVehicleTypes) {
        session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(session.userVehicleType || '1t');
    }
}

// ━━━ 내부 유틸: 소켓 브로드캐스트 ━━━
function broadcastFilter(userId: string, session: ReturnType<typeof getUserSession>, io?: any) {
    // [Phase 6] 부트스트랩 중에는 중간 상태를 내보내지 않는다.
    // 복구 과정에서 updateActiveFilter 가 여러 번(상태 파생 → 회랑 재계산) 호출되는데,
    // 그때마다 filter-updated 를 쏘면 관제탑이 첫짐 → 합짐으로 깜빡인다.
    // 확정된 필터는 부트스트랩 끝에서 filter-init 으로 한 번만 나간다.
    if (session.isBootstrapping) return;

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

    // [중요] STANDBY 전환 감지: 다른 상태(GATHERING/DELIVERING)에서 STANDBY로 복귀할 때
    // 합짐 사이클에서 사용된 임시 값들(회랑, 차종 제한 등)을 baseFilter 기준으로 리셋
    const previousPhase = session.activeFilter?.dispatchPhase ?? 'STANDBY';
    const nextPhase = changes.dispatchPhase ?? previousPhase;
    const isTransitionToEmpty = previousPhase !== 'STANDBY' && nextPhase === 'STANDBY';

    if (isTransitionToEmpty) {
        // 합짐 사이클 종료 → activeFilter를 baseFilter 기준으로 리셋하되, isActive는 유지
        const currentIsActive = session.activeFilter.isActive;
        session.activeFilter = {
            ...session.baseFilter,
            isActive: currentIsActive,
            isSharedMode: false,
            driverAction: 'WAITING',      // [V2] 합짐 사이클 종료 → 대기 상태
            dispatchPhase: 'STANDBY',     // [V2] 합짐 사이클 종료 → 첫짐 탐색
        };
        // 리셋 후 파생 데이터 재계산
        recalculateDerivedFields(session, {});
        console.log(`[FilterManager] STANDBY 상태로 복귀: activeFilter를 baseFilter 기준으로 리셋했습니다.`);
    } else {
        // 일반 변경: activeFilter에 직접 덮어쓰기
        session.activeFilter = { ...session.activeFilter, ...changes };
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes);
    }

    // [자체 리뷰 B-③] isSharedMode 는 dispatchPhase 에서 파생되는 값이다.
    // (STANDBY = 첫짐 = 단독,  GATHERING/DELIVERING = 합짐)
    // 두 값을 따로 세팅해 오다 보니 서버 재시작 시 서로 어긋나는 사고(이슈 W)가 났다.
    // W 에서는 두 값을 손으로 맞춰놓기만 했을 뿐 어긋날 수 있는 구조는 그대로였으므로,
    // 여기 단일 진입점에서 불변식을 강제해 divergence 자체를 불가능하게 만든다.
    //
    // 필드 자체를 없애는 게 이상적이지만, 앱의 InsungParser 가 이 키를 파싱하고 있어
    // 페이로드 계약을 깨뜨리므로 값만 파생시킨다.
    const derivedShared = (session.activeFilter.dispatchPhase ?? 'STANDBY') !== 'STANDBY';
    if (session.activeFilter.isSharedMode !== derivedShared) {
        console.log(`🔗 [불변식] isSharedMode ${session.activeFilter.isSharedMode} → ${derivedShared} (dispatchPhase=${session.activeFilter.dispatchPhase})`);
        session.activeFilter.isSharedMode = derivedShared;
    }

    logActiveFilter(session, "실시간 변경(activeFilter)", changes);
    broadcastFilter(userId, session, io);

    return session.activeFilter;
}


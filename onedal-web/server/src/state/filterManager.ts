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
import { getActiveCalls, computeLoadedPoints } from "../core/helpers";
import { OrderRepository } from "../repositories/OrderRepository";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter, PhaseKey, PhaseSettings } from "@onedal/shared";
import { DEFAULT_CORRIDOR_RADIUS_KM, getEligibleVehicleTypes, getRemainingCapacityTypesByPoints, deriveDispatchPhase, businessDayKey, resetToBaseFilter, rateFloorsFrom, TRUCK_CAPACITY_SLOTS, resolvePhaseKey, applyPhaseToFilter, normalizePhaseSettings } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { getCityRegionsWithRadius, cityAliases, getCorridorRegions, getActivePolyline, progressAlongPolyline } from "../services/geoService";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
const stmtUpdateFilter = db.prepare(`
    UPDATE user_filters SET
        destination_city = ?, destination_radius_km = ?, corridor_radius_km = ?,
        min_fare = ?, max_fare = ?, pickup_radius_km = ?,
        excluded_keywords = ?, is_active = ?, is_shared_mode = ?,
        load_state = ?, eyeline_pct = ?, phase_settings = ?
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
function recalculateDerivedFields(session: ReturnType<typeof getUserSession>, changes: Partial<AutoDispatchFilter>, userId: string) {
    /**
     * 차종별 하한 단가표는 **눈높이에서만 파생된다** (docs/필터_재설계_명세.md §2).
     *
     * 관제웹은 `eyelinePct` 하나만 보내고 표는 만들지 않는다 — 같은 표를 두 곳에서
     * 만들면 한쪽만 고쳐진다(회랑 4벌·상태목록 3벌과 같은 사고). 원천은 DB 의
     * `eyeline_pct` 이고, 여기가 그것을 표로 펼치는 유일한 자리다.
     */
    if ('eyelinePct' in changes) {
        // 요율·수수료의 원천은 DB 다 (설정 화면에서 기사님이 바꾼다).
        const pricing = SettingsRepository.loadPricingConfig(userId);
        session.activeFilter.ratePerKm = rateFloorsFrom(
            changes.eyelinePct ?? 10,
            pricing.vehicleRates,
            pricing.agencyFeePercent,
        );
    }

    /**
     * [최적화] 지리 연산은 도시·반경이 **실제로 바뀐 경우에만** 다시 돈다.
     * `isActive`·`minFare` 같은 단순 변경에는 캐시된 키워드를 그대로 쓴다.
     *
     * ⚠️ 예전 주석은 이 연산을 **"~7초"** 라고 적어 뒀는데, 2026-08-14 실측은 이렇다:
     *     `파주시 0km` 1ms · `용인시 10km` 13ms · `파주시 10km` 42ms · `서울 0km` 0ms
     * 7초는 부팅 때 `f.simplified`(200m) 캐시를 넣기 **전** 숫자다(1415ms → 13ms 기록 참조).
     * 낡은 경고를 믿고 판단하면 **없는 위험 때문에 기능을 포기**하게 된다 — 실제로 그랬다.
     */
    const needsGeoRecalc =
        'destinationCity' in changes ||
        'destinationRadiusKm' in changes ||
        (!session.activeFilter.destinationKeywords || session.activeFilter.destinationKeywords.length === 0);

    if (changes.destinationKeywords) {
        /**
         * 명시적으로 키워드가 전달된 경우 (합짐 회랑 · 투트랙 등) → 키워드는 그대로 쓴다.
         *
         * 🔴 2026-08-12 — 다만 **시 별칭은 같이 안 오면 반드시 다시 만든다.**
         *
         * 첫짐에도 별칭을 싣기 시작하면서 생긴 구멍이다. 예전에는 첫짐 별칭이 늘 비어 있어
         * 앱의 2단계 필터가 아예 안 돌았으므로 옛 값이 남아도 무해했다. 이제는 아니다.
         *
         * `startTwoTrack` 은 `destinationKeywords` 만 넘긴다. 그러면 스프레드(`...changes`)가
         * `customCityFilters` 를 안 건드려 **직전 회랑의 별칭이 그대로 남는다.**
         * 앱은 "시가 맞고 동도 맞아야 통과"로 판정하므로, 엉뚱한 시 목록을 들고 있으면
         * 멀쩡한 투트랙 콜을 전부 걸러낸다 — 조용히, 이유도 안 남기고.
         *
         * 별칭을 못 만들면 **비운다.** 옛 값을 남기느니 2단계 필터가 안 도는 편이 낫다
         * (동 이름만 보는 것 = 예전 동작). 있지도 않은 근거로 거르는 것이 더 나쁘다.
         */
        if (!changes.customCityFilters) {
            const groups = changes.destinationGroups ?? {};
            const aliases = new Set<string>();
            for (const parent of Object.keys(groups)) {
                for (const a of cityAliases(parent)) aliases.add(a);
            }
            session.activeFilter.customCityFilters = Array.from(aliases);
        }
    } else if (session.activeFilter.destinationCity && needsGeoRecalc) {
        // 도시명/반경이 변경되었거나 키워드가 아직 계산되지 않은 경우에만 무거운 연산 수행
        const city = session.activeFilter.destinationCity;
        const radius = session.activeFilter.destinationRadiusKm || 0;
        console.log(`🗺️ [FilterManager] 지리 연산 트리거 (city=${city}, radius=${radius}km)`);
        const { flat, grouped, customCityFilters } = getCityRegionsWithRadius(city, radius);
        session.activeFilter.destinationKeywords = flat;
        session.activeFilter.destinationGroups = grouped;
        /**
         * 🔴 2026-08-12 — 첫짐에도 **시 별칭**을 실어 보낸다.
         *
         * 예전에는 여기서 안 채워서 앱의 2단계 필터(`시 + 동` 교차 확인)가
         * `customCityFilters.isNotEmpty()` 조건에 걸려 **아예 돌지 않았다.**
         * 동 이름만 보고 판정했고, 수도권 안에만 같은 이름의 동이 97개 있다 —
         * 파주 필터에 서울 서대문구 `신촌동` 콜이 그대로 통과했다.
         */
        session.activeFilter.customCityFilters = customCityFilters;
    } else if (!session.activeFilter.destinationCity) {
        session.activeFilter.destinationKeywords = [];
        session.activeFilter.destinationGroups = {};
        session.activeFilter.customCityFilters = [];
    }
    // else: 도시/반경 변경 없음 → 기존 캐시된 destinationKeywords 유지 (이벤트 루프 보호)

    // 🔴 allowedVehicleTypes — 예전에는 명시적으로 안 넘기면 **첫짐 목록으로 리셋**했다.
    //
    //     if (!changes.allowedVehicleTypes)
    //         = getEligibleVehicleTypes(내 차종)   ← 만재든 아니든 전 차종 허용
    //
    // 그래서 합짐 도중 회랑이 갱신될 때마다(syncCorridorFilter 는 키워드만 넘긴다)
    // **적재 용량 제한이 조용히 풀렸다.** 라보 2개를 싣고도 1t 콜을 잡으러 가는 상태가 된다.
    // 실측: 상태 복구가 [오토바이, 다마스, 승용차] 로 좁혀 놓은 직후 회랑 갱신 한 번에
    //       5종 전체로 되돌아갔다 (2026-08-10 스모크).
    //
    // 이슈 W·S 에서 세운 원칙과 같다 — **상태를 저장하지 말고 데이터에서 파생시킨다.**
    // 지금 실려 있는 짐이 진실이므로 거기서 매번 다시 구한다.
    if (!changes.allowedVehicleTypes) {
        const myVehicle = session.userVehicleType || '1t';
        const loaded = getActiveCalls(session);

        if (loaded.length === 0) {
            session.activeFilter.allowedVehicleTypes = getEligibleVehicleTypes(myVehicle);
            session.capacityConfidence = 'CONFIRMED';   // 빈 차는 확실하다
            session.activeFilter.capacityConfidence = 'CONFIRMED';
            session.activeFilter.slotsUsed = 0;
        } else {
            // [Phase 8.4] 통화·현장에서 실제 짐 양을 알면 그걸 쓴다.
            // 차종만 보면 "1t 콜 = 30점 만재"로 추정하는데, 실제로 박스 1개면 2점이다.
            // 그 차이만큼 **놓치던 합짐 기회**가 열린다.
            const reports = new Map(loaded.map(c => [c.id, OrderRepository.getCargoReports(c.id)]));
            const { points, confidence } = computeLoadedPoints(loaded, myVehicle, reports);
            session.activeFilter.allowedVehicleTypes = getRemainingCapacityTypesByPoints(myVehicle, points);
            session.capacityConfidence = confidence;
            session.activeFilter.capacityConfidence = confidence;

            /**
             * 관제탑 표시용 **칸** — 같은 적재 점수를 칸 단위로 환산한 것뿐이다.
             * (1칸 = 7.5점 · docs/필터_재설계_명세.md §2-2)
             *
             * 별도로 세지 않는 이유: 차종으로 다시 세면 통화로 확인한 실제 짐 양이
             * 반영되지 않아 **화면과 판정이 다른 말을 한다.** 판정이 쓰는 점수에서 파생시킨다.
             */
            session.activeFilter.slotsUsed = Math.min(
                TRUCK_CAPACITY_SLOTS,
                Math.round((points / 7.5) * 10) / 10
            );
        }
    }

    /**
     * 🔴 **마지막에 지나온 구간을 뺀다.**
     *
     * 여기가 유일한 자리인 이유: 회랑을 다시 그리는 길이 여럿인데(경로 갱신·반경 변경·
     * 국면 전환), 어느 길로 오든 **다시 그리면 지나온 동이 되살아난다.**
     * 파생 계산의 끝에 두면 그 셋을 다 덮는다.
     */
    applyTraveledTrim(session);
}

/**
 * 회랑을 새로 그렸으면 **진행도도 같이 기억한다.**
 *
 * 🔴 키워드와 진행도는 **같은 입력에서 같이 나온 한 벌**이다. 한쪽만 갱신하면
 *    옛 경로의 진행도로 새 경로의 동을 지우게 된다 — 멀쩡한 지역이 조용히 사라진다.
 *    회랑을 만드는 자리마다 이 함수를 부른다.
 */
export function rememberCorridorProgress(
    session: ReturnType<typeof getUserSession>,
    regions: { progressKm?: Record<string, number> } | null,
) {
    session.corridorProgressKm = regions?.progressKm ?? null;
}

/**
 * **지나온 구간을 필터에서 뺀다** — 회랑을 다시 그리지 않고.
 *
 * 기사님: *"성남을 지났으면 이미 지나온 광주시·성남시 콜은 목록에서 뺀다. 뒤로 안 돌아가니까."*
 *
 * 회랑을 만들 때 동마다 기록해 둔 진행도(`corridorProgressKm`)와 지금 GPS 의 진행도를
 * 비교하기만 한다 — 실측 **0.14ms**. 예전 방식(회랑 통째 재계산)은 173ms 였다.
 *
 * 안전 쪽으로 기운 규칙 셋. **일찍 빼면 잡을 수 있는 콜을 버린다:**
 *   ① 진행도를 **모르는 동은 남긴다**
 *   ② **전부 빠지면 아무것도 안 한다** — 빈 필터는 "제한 없음"이 아니라 **고장**이다
 *   ③ 동·시 묶음·별칭을 **한 벌로** 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)
 */
export function applyTraveledTrim(session: ReturnType<typeof getUserSession>): boolean {
    if (session.activeFilter.dispatchPhase !== 'DELIVERING') return false;

    const progress = session.corridorProgressKm;
    if (!progress) return false;

    const polyline = getActivePolyline(session);
    const gps = session.driverLocation;
    if (!polyline || !gps) return false;

    const at = progressAlongPolyline(polyline, gps);
    if (at === null || at <= 0) return false;

    const before = session.activeFilter.destinationKeywords ?? [];
    if (before.length === 0) return false;

    // ① 진행도를 모르는 동은 남긴다
    const kept = new Set(before.filter(d => progress[d] === undefined || progress[d] >= at));
    if (kept.size === before.length) return false;   // 뺄 게 없다
    if (kept.size === 0) return false;               // ② 전부 빠진다 — 건드리지 않는다

    // ③ 셋을 한 벌로 줄인다
    const grouped: Record<string, string[]> = {};
    for (const [parent, dongs] of Object.entries(session.activeFilter.destinationGroups ?? {})) {
        const left = dongs.filter(d => kept.has(d));
        if (left.length > 0) grouped[parent] = left;
    }
    const aliases = new Set<string>();
    for (const parent of Object.keys(grouped)) {
        for (const a of cityAliases(parent)) aliases.add(a);
    }

    session.activeFilter.destinationKeywords = Array.from(kept).sort();
    session.activeFilter.destinationGroups = grouped;
    session.activeFilter.customCityFilters = Array.from(aliases);

    console.log(`🔄 [지나온 구간] ${at.toFixed(1)}km 지점 — 동 ${before.length} → ${kept.size}개 ` +
        `(뺀 ${before.length - kept.size}개)`);
    return true;
}

/**
 * 반경이 바뀌었으면 **회랑 지역 목록도 다시 그린다.**
 *
 * 🔴 숫자만 바꾸고 지역 목록을 그대로 두면 화면과 판정이 다른 말을 한다 —
 *    "경유 5km" 라고 적혀 있는데 실제로는 옛 1km 목록으로 거르는 상태가 된다.
 *    조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 *
 * 합짐 모드가 아니면(경로가 없으면) 회랑 자체가 없으므로 아무것도 하지 않는다.
 */
function refreshCorridorIfNeeded(
    session: ReturnType<typeof getUserSession>,
    userId: string,
    before: { corridorRadiusKm?: number, destinationRadiusKm?: number },
) {
    if (!session.activeFilter.isSharedMode) return;
    const cRadius = session.activeFilter.corridorRadiusKm ?? DEFAULT_CORRIDOR_RADIUS_KM;
    const dRadius = session.activeFilter.destinationRadiusKm ?? 10;
    if (cRadius === before.corridorRadiusKm && dRadius === before.destinationRadiusKm) return;

    const regions = recalculateCorridorFilter(userId, cRadius, dRadius);
    if (!regions) return;   // 경로가 아직 없다 — 없는 값을 지어내지 않는다
    rememberCorridorProgress(session, regions);

    // 셋을 **한 벌로** 넣는다. 별칭(customCityFilters)이 빠지면 앱의 2단계 필터가 조용히 꺼진다
    session.activeFilter.destinationKeywords = regions.destinationKeywords;
    session.activeFilter.destinationGroups = regions.destinationGroups;
    session.activeFilter.customCityFilters = regions.customCityFilters;
    console.log(`🛣️ [회랑 갱신] 경유 ${cRadius}km · 하차 ${dRadius}km → 지역 ${regions.destinationKeywords.length}개`);
}

/**
 * 국면이 바뀌었으면 그 국면의 저장값을 평면 필터에 펼친다.
 *
 * 국면 키가 **실제로 바뀔 때만** 편다 — 같은 국면에서 매번 덮으면 기사님이 방금 고친 값이
 * 계속 되돌아가고, 회랑 재계산도 불필요하게 돈다.
 */
function applyPhaseSettingsIfChanged(
    session: ReturnType<typeof getUserSession>,
    changes: Partial<AutoDispatchFilter>,
    userId: string,
) {
    const key = resolvePhaseKey(
        session.activeFilter.huntPhase ?? 'DEST',
        session.activeFilter.dispatchPhase ?? 'STANDBY',
    );
    if (key === session.appliedPhaseKey) return;

    const prev = session.appliedPhaseKey;
    session.appliedPhaseKey = key;
    const before = {
        corridorRadiusKm: session.activeFilter.corridorRadiusKm,
        destinationRadiusKm: session.activeFilter.destinationRadiusKm,
        destinationCity: session.activeFilter.destinationCity,
    };

    const patch = applyPhaseToFilter(key, session.phaseSettings[key]);
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        // 기사님이 방금 고친 값은 그대로 둔다
        if (k in changes) continue;
        (session.activeFilter as any)[k] = v;
    }

    /**
     * 🔴 반경이 바뀌었으면 **지역 목록도 다시 그린다.**
     *
     * 위쪽 `recalculateDerivedFields` 는 이 함수보다 **먼저** 돌았다. 그때는 아직 옛 반경이었다.
     * 여기서 반경만 갈아 끼우고 끝내면 "하차 0km" 라고 적힌 채 **옛 7km 목록으로 거른다** —
     * 화면과 판정이 다른 말을 하는, 조용히 틀리는 종류다.
     */
    refreshCorridorIfNeeded(session, userId, before);
    const geoChanged = session.activeFilter.destinationRadiusKm !== before.destinationRadiusKm
                    || session.activeFilter.destinationCity !== before.destinationCity;
    if (!session.activeFilter.isSharedMode && geoChanged) {
        // ⚠️ `updateActiveFilter` 가 아니라 파생 계산만 다시 부른다 (재진입하면 무한 루프)
        recalculateDerivedFields(session, {
            destinationCity: session.activeFilter.destinationCity,
            destinationRadiusKm: session.activeFilter.destinationRadiusKm,
        }, userId);
    }

    console.log(`🧭 [국면 설정] ${prev ?? '없음'} → ${key} · ` +
        `상차 ${session.activeFilter.pickupRadiusKm}km · 경유 ${session.activeFilter.corridorRadiusKm}km · ` +
        `하차 ${session.activeFilter.destinationRadiusKm}km · 할인 ${session.activeFilter.eyelinePct}%`);

    // 단가표는 할인율에서 파생된다 (§2-1) — 여기서 다시 만든다
    const pricing = SettingsRepository.loadPricingConfig(userId);
    session.activeFilter.ratePerKm = rateFloorsFrom(
        session.activeFilter.eyelinePct ?? 10,
        pricing.vehicleRates,
        pricing.agencyFeePercent,
    );
}

/**
 * [관제탑 탭 전용] **한 국면의 설정만** 바꾼다 (§2-4).
 *
 * 기사님이 합짐 탭에서 하차 반경을 1km 로 고쳤다고 해서, 지금 첫짐을 사냥 중인
 * 필터가 바뀌면 안 된다 — **그 국면이 될 때** 꺼내 쓰는 값이다.
 * 다만 **지금 그 국면이라면 즉시 반영한다** (탭을 보며 고치는데 아무 일도 안 일어나면
 * 저장이 됐는지 알 수 없다).
 *
 * `saveAsDefault` 의 뜻은 필터 저장과 같다 — 없으면 **오늘만**, 있으면 **앞으로 계속**.
 */
export function savePhaseSettings(
    userId: string,
    phase: PhaseKey,
    settings: PhaseSettings,
    saveAsDefault: boolean,
    io?: any,
): void {
    const session = getUserSession(userId);

    // 한 국면만 갈아 끼운다. normalize 로 결측·비정상 값을 막는다
    const clean = normalizePhaseSettings({ ...session.phaseSettings, [phase]: settings })[phase];
    session.phaseSettings[phase] = clean;

    if (saveAsDefault) {
        session.basePhaseSettings[phase] = { ...clean };
        // 평면 필터는 그대로 두고 phase_settings 만 다시 쓴다 (saveBaseFilter 가 통째로 저장)
        saveBaseFilter(userId, {}, io);
    }

    const activeKey = resolvePhaseKey(
        session.activeFilter.huntPhase ?? 'DEST',
        session.activeFilter.dispatchPhase ?? 'STANDBY',
    );

    console.log(`🧭 [국면 저장] ${phase}${saveAsDefault ? ' (앞으로 계속)' : ' (오늘만)'} · ` +
        `상차 ${clean.pickupRadiusKm}km · 경유 ${clean.detourAllowKm}km · ` +
        `하차 ${clean.dropoffRadiusKm}km · 할인 ${clean.discountPct}%` +
        `${phase === activeKey ? ' → 지금 국면이라 바로 적용' : ` (지금은 ${activeKey}, 그 국면이 되면 적용)`}`);

    if (phase === activeKey) {
        const before = {
            corridorRadiusKm: session.activeFilter.corridorRadiusKm,
            destinationRadiusKm: session.activeFilter.destinationRadiusKm,
        };
        /**
         * 🔴 평면 이름 매핑은 여기서 하지 않는다 — `applyPhaseToFilter` 가 유일한 지점.
         *
         * `userOverrides` 를 **켜지 않는다.** 그 깃발은 자동 회랑 갱신을 멈추는 것인데,
         * 이제 기사님이 고른 반경은 국면 설정에 남아 있으므로 얼려 둘 이유가 없다.
         * 반경은 기사님 것이고, 그 반경으로 그린 **지역 목록은 경로를 따라가야 한다.**
         */
        updateActiveFilter(userId, applyPhaseToFilter(phase, clean), io);
        // 반경이 바뀌었으면 회랑을 다시 그린다 (updateActiveFilter 는 도시 기반 지리만 본다)
        refreshCorridorIfNeeded(session, userId, before);
        if (io) broadcastFilter(userId, session, io);
    } else if (io) {
        // 지금 국면이 아니면 필터는 그대로. 탭 값이 저장됐다는 것만 알린다
        broadcastFilter(userId, session, io);
    }
}

/**
 * 지금 경로 주변의 **회랑 지역**을 다시 구한다 (합짐·운행중).
 *
 * 🔴 2026-08-14 에 `dispatchEngine` 에서 여기로 옮겨 왔다. 국면별 설정이 들어오면서
 *    회랑을 다시 그려야 하는 자리가 셋이 됐는데(필터 저장 · 국면 설정 저장 · 국면 전환),
 *    뒤의 둘은 이 파일 안이라 dispatchEngine 을 부르면 순환 참조가 된다.
 *    회랑 계산이 4벌로 갈라졌던 사고를 되풀이하지 않으려면 **구현은 하나여야 한다.**
 */
export const recalculateCorridorFilter = (userId: string, corridorRadiusKm: number, destinationRadiusKm?: number) => {
    const session = getUserSession(userId);
    let polylineToUse = null;
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1].routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const regions = getCorridorRegions(polylineToUse, corridorRadiusKm, destinationRadiusKm);
        if (regions && regions.flat.length > 0) {
            return {
                destinationKeywords: regions.flat,
                destinationGroups: regions.grouped,
                customCityFilters: regions.customCityFilters,
                progressKm: regions.progressKm,
            };
        }
    }
    return null;
};

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
            baseFilter: session.baseFilter,
            // 국면별 설정 (§2-4) — 관제탑의 탭이 이걸 편집한다
            phaseSettings: session.phaseSettings,
            basePhaseSettings: session.basePhaseSettings,
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
            b.eyelinePct ?? 10,   // 눈높이 — 원천은 DB. ratePerKm 는 여기서 파생되므로 저장하지 않는다
            JSON.stringify(session.basePhaseSettings),   // 국면별 설정 (§2-4-7)
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
        /**
         * 🔴 2026-08-12 — 여기서 `{...session.baseFilter}` 로 **통째로** 덮어쓰고 있었다.
         *
         * 바로 위 주석은 *"합짐 사이클에서 사용된 임시 값들(회랑, 차종 제한 등)을 리셋"* 이라고
         * 적혀 있는데, 실제로는 **기사님이 오늘 정한 사냥 설정까지 전부** 되돌렸다 —
         * 목적지 도시·최저 운임·상차 반경·블랙리스트.
         *
         * 기사님 의도: *"출근할 때 오늘 콜이 많이 나올 만한 곳으로 필터를 바꾸고,
         * 복귀콜이나 그런 것 하면 그 값으로 돌아오게."*
         * 그런데 코드는 **콜 하나 끝낼 때마다** 돌아갔다. 하루에 대여섯 번씩
         * "오늘은 용인 쪽으로" 가 사라진 것이다.
         *
         * 그래서 되돌리는 것은 **합짐 사이클이 만든 파생값**뿐이다.
         * 오늘 필터(baseFilter → activeFilter) 는 **영업일이 바뀔 때** 되돌아간다.
         *
         * 나머지 파생값(allowedVehicleTypes · isSharedMode · dispatchPhase)은
         * 아래 불변식 블록이 활성 콜 수에서 매번 다시 구하므로 여기서 손대지 않는다.
         */
        session.activeFilter = {
            ...session.activeFilter,
            // 회랑은 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 비워 두면 recalculateDerivedFields 가 **오늘의** destinationCity 로 다시 만든다
            destinationKeywords: [],
            destinationGroups: {},
            customCityFilters: [],
            // 진행도도 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 남겨 두면 다음 운행 초반에 **옛 경로 기준으로** 동이 사라진다
            // (`corridorProgressKm` 은 아래에서 지운다 — activeFilter 가 아니라 세션 필드다)
            // 수동 고정도 사이클과 함께 풀린다 (다음 사냥은 자동 회랑으로 시작)
            userOverrides: false,
            isSharedMode: false,
            driverAction: 'WAITING',
            dispatchPhase: 'STANDBY',
        };
        session.corridorProgressKm = null;
        recalculateDerivedFields(session, {}, userId);
        console.log(`[FilterManager] STANDBY 복귀: 합짐 파생값만 되돌림 ` +
            `(오늘 필터 유지 — 도착 ${session.activeFilter.destinationCity}, 최저 ${session.activeFilter.minFare}원)`);
    } else {
        // 일반 변경: activeFilter에 직접 덮어쓰기
        session.activeFilter = { ...session.activeFilter, ...changes };
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes, userId);
    }

    // [자체 리뷰 B-③] isSharedMode 는 dispatchPhase 에서 파생되는 값이다.
    // (STANDBY = 첫짐 = 단독,  GATHERING/DELIVERING = 합짐)
    // 두 값을 따로 세팅해 오다 보니 서버 재시작 시 서로 어긋나는 사고(이슈 W)가 났다.
    // W 에서는 두 값을 손으로 맞춰놓기만 했을 뿐 어긋날 수 있는 구조는 그대로였으므로,
    // 여기 단일 진입점에서 불변식을 강제해 divergence 자체를 불가능하게 만든다.
    //
    // 필드 자체를 없애는 게 이상적이지만, 앱의 InsungParser 가 이 키를 파싱하고 있어
    // 페이로드 계약을 깨뜨리므로 값만 파생시킨다.
    //
    // 🔴 2026-08-10: 그런데 **뿌리가 여전히 저장된 값**이었다.
    //    isSharedMode 는 dispatchPhase 에서 파생시켜 놨는데, 정작 dispatchPhase 자체는
    //    누군가 명시적으로 바꿔줘야 하는 저장 상태였다.
    //    STANDBY 로 되돌리는 코드는 **취소 경로(StateMachine.rollbackOnCancel)에만** 있고
    //    **완료 경로에는 없었다.** 그래서 마지막 콜을 하차 완료해도
    //    `GATHERING` 이 남아 관제탑이 계속 "합짐 탐색중"이라 표시했다.
    //    (기사님: *"콜을 완료했는데 필터가 합짐 탐색중이야"*)
    //
    //    → dispatchPhase 도 **데이터에서 파생**시킨다. 지금 실린 콜 수가 진실이다.
    //      기존 전이(advanceOnKeep / rollbackOnCancel)와 결과가 같으므로 동작은 그대로다.
    const activeCount = getActiveCalls(session).length;

    // 실은 짐이 없으면 '운행 중'일 수 없다. 값이 남아 있으면 다음 판정이 DELIVERING 으로 새어 나간다
    if (activeCount === 0 && session.activeFilter.driverAction === 'DRIVING') {
        console.log(`🔗 [불변식] driverAction DRIVING → WAITING (활성 콜 0건)`);
        session.activeFilter.driverAction = 'WAITING';
    }

    const derivedPhase = deriveDispatchPhase(session.activeFilter.driverAction ?? 'WAITING', activeCount);
    if (session.activeFilter.dispatchPhase !== derivedPhase) {
        console.log(`🔗 [불변식] dispatchPhase ${session.activeFilter.dispatchPhase} → ${derivedPhase} (활성 콜 ${activeCount}건)`);
        session.activeFilter.dispatchPhase = derivedPhase;
    }

    const derivedShared = derivedPhase !== 'STANDBY';
    if (session.activeFilter.isSharedMode !== derivedShared) {
        console.log(`🔗 [불변식] isSharedMode ${session.activeFilter.isSharedMode} → ${derivedShared} (dispatchPhase=${derivedPhase})`);
        session.activeFilter.isSharedMode = derivedShared;
    }

    /**
     * 🧭 **국면이 바뀌었으면 그 국면의 저장값을 평면에 펼친다.** (§2-4)
     *
     * 기사님: *"첫짐 도착반경 5km 로 사냥하다 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
     *
     * ⚠️ **여기가 이 함수의 끝이어야 한다.** 조각을 펼친 뒤 `updateActiveFilter` 를 다시
     *    부르면 무한 루프가 된다. 파생값(키워드·별칭·허용차종)은 위에서 이미 계산됐고,
     *    반경이 바뀌면 회랑은 다음 경로 계산 때 새 값으로 다시 그려진다.
     *
     * 🔴 **기사님이 방금 고친 값은 덮지 않는다.** `changes` 에 들어 있는 키는 건너뛴다 —
     *    안 그러면 필터 팝업에서 저장한 값이 곧바로 국면 기본값으로 되돌아간다.
     */
    applyPhaseSettingsIfChanged(session, changes, userId);

    logActiveFilter(session, "실시간 변경(activeFilter)", changes);
    broadcastFilter(userId, session, io);

    return session.activeFilter;
}


/**
 * **영업일이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.**
 *
 * 기사님이 설명한 흐름 그대로다.
 *   *"사용자 설정에서 디폴트 값을 저장해 두고 세션이 바뀌거나 담날이 되거나 하면
 *     디폴트 값을 가져오고, 운행 시작 전 오늘 콜이 많이 나올 만한 곳으로 필터에 값을 바꾸고…"*
 *   *"아침에 출근시 필터 설정 없으면 그냥 디폴트 값으로 콜을 잡는 거고."*
 *
 * 경계는 **자정**이다 (기사님 결정 2026-08-12).
 * `isActive` 는 끄지 않는다 — 아침에는 기본 설정 그대로 사냥을 시작하는 것이 맞다고 하셨다.
 *
 * ⚠️ 타이머를 두지 않는다. 접속·스크랩처럼 **세션을 건드리는 순간**에 확인한다.
 *    타이머는 서버가 자는 사이를 못 잡고, 프로세스가 죽으면 사라진다.
 *
 * @returns 되돌렸으면 true
 */
export function ensureBusinessDay(userId: string, io?: any): boolean {
    const session = getUserSession(userId);
    const today = businessDayKey(Date.now());
    if (session.businessDay === today) return false;

    const yesterday = session.businessDay;
    session.businessDay = today;

    // 되돌리는 규칙은 shared 한 곳에만 있다 (세션 생성 때도 같은 규칙을 쓴다)
    session.activeFilter = resetToBaseFilter(session.baseFilter);

    /**
     * 국면별 오늘값도 평소값으로 되돌린다 (§2-4-7).
     * 기사님: *"오늘 하루 동안 첫짐은 10km 로 고정되는 거지"* — 하루가 지나면 풀린다.
     * 다시 펼치도록 `appliedPhaseKey` 를 비운다.
     */
    session.phaseSettings = normalizePhaseSettings(JSON.parse(JSON.stringify(session.basePhaseSettings)));
    session.appliedPhaseKey = null;

    console.log(`🌅 [영업일 전환] ${yesterday} → ${today} · 오늘 필터를 기본 설정으로 되돌립니다 ` +
        `(도착 ${session.baseFilter.destinationCity}, 국면 설정 5종 포함)`);
    logRoadmapEvent("서버", `[영업일 전환] ${yesterday} → ${today} — activeFilter 를 baseFilter 로 리셋`);

    // 파생 재계산 + 관제탑 전파
    updateActiveFilter(userId, {}, io);
    return true;
}

/**
 * filterManager.ts — 필터 변경의 단일 진입점 (완전 격리 아키텍처 v2)
 * 
 * 두 개의 명확한 함수로 분리되어 있습니다:
 *   1. saveBaseFilter()   — 톱니바퀴(SettingsModal) 전용. DB만 저장, activeFilter 불변.
 *   2. updateActiveFilter() — 돋보기(OrderFilterModal) + 시스템(State Machine) 전용. 메모리만 수정, DB 불변.
 * 
 * [핵심 원칙]
 * - baseFilter(DB)와 activeFilter(메모리)는 완전히 독립적입니다.
 * - 영구 설정을 바꿔도 현재 콜 잡는 중인 activeFilter에는 1도 영향을 주지 않습니다.
 * - activeFilter는 직접 수정하고 직접 읽는 1등 시민(first-class citizen)입니다.
 */

import db from "../db";
import { getActiveCalls, computeLoadedPoints, buildOrderSync } from "../core/helpers";
import { stepRecordsOf } from "../services/stepSeeder";
import { OrderRepository } from "../repositories/OrderRepository";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter, PhaseKey, PhaseSettings } from "@onedal/shared";
import { DEFAULT_DETOUR_RADIUS_KM, isTerminal, isDeliveredCall, getEligibleVehicleTypes, getRemainingCapacityTypesByPoints, deriveDispatchPhase, businessDayKey, resetToBaseFilter, rateFloorsFrom, TRUCK_CAPACITY_SLOTS, resolvePhaseKey, applyPhaseToFilter, normalizePhaseSettings,
         PHASE_KEYS, FILTER_FIELDS, phaseRowOf, phaseOfRow } from "@onedal/shared";
import type { PhaseSettingsMap } from "@onedal/shared";

// ─────────────────────────────────────────────────────────────
// 🎛️ 국면 옵션 (필터 확정안 v2 · 2026-08-21 전환 완료)
//
// **국면 옵션의 유일한 원천은 user_filter_phases 행이다.**
// 옛 blob(user_filters.phase_settings)과 평면 4칸은 ④에서 손으로 철거했다 —
// 병행 절차: 새 그릇 → 이중 쓰기+비교(전수 스모크 일치) → 읽기 전환 → 철거.
// ⚠️ 실서버 data.db 는 배포 때 같은 손 순서 (blob→행 이식 SQL 은 필터_확정안.md).
// ─────────────────────────────────────────────────────────────

/** 국면 5행을 새 그릇에 upsert — 컬럼 목록의 원천은 FILTER_FIELDS 표 */
export function writePhaseRows(userId: string, map: PhaseSettingsMap): void {
    const cols = FILTER_FIELDS.map(f => f.col);
    const stmt = db.prepare(`
        INSERT INTO user_filter_phases (user_id, phase, ${cols.join(', ')})
        VALUES (?, ?, ${cols.map(() => '?').join(', ')})
        ON CONFLICT(user_id, phase) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(', ')}
    `);
    const tx = db.transaction((m: PhaseSettingsMap) => {
        for (const key of PHASE_KEYS) {
            const row = phaseRowOf(m[key]);
            stmt.run(userId, key, ...cols.map(c => row[c]));
        }
    });
    tx(map);
}

/** 새 그릇에서 국면 옵션 읽기 — 전환 ③부터 이것이 읽기 원천이다 */
export function readPhaseRows(userId: string): Partial<Record<PhaseKey, PhaseSettings>> {
    const rows = db.prepare(`SELECT * FROM user_filter_phases WHERE user_id = ?`).all(userId) as any[];
    const out: Partial<Record<PhaseKey, PhaseSettings>> = {};
    for (const r of rows) out[r.phase as PhaseKey] = phaseOfRow(r, r.phase);
    return out;
}

/**
 * 로그인 때 국면 옵션을 읽는다 — **원천은 행 하나다.**
 * 행이 없는 건 신규 유저뿐이다 (기존 유저는 병행 단계에서 이식 완료) —
 * 그때만 표 기본값으로 5행을 시드한다.
 */
export function loadPhaseRows(userId: string): PhaseSettingsMap {
    try {
        const rows = readPhaseRows(userId);
        if (Object.keys(rows).length === 0) {
            const seeded = normalizePhaseSettings(null);
            writePhaseRows(userId, seeded);
            console.log(`🎛️ [국면] 행이 없어 표 기본값으로 5행 시드 (신규 유저)`);
            return seeded;
        }
        return normalizePhaseSettings(rows);            // 빠진 국면은 기본값으로 메운다
    } catch (e) {
        // 세션 생성을 막지 않는다 — 기본값이면 콜 잡기는 돌고, 값은 다음 저장에서 복원된다
        console.error(`🎛️ [국면] 행 읽기 실패 — 표 기본값으로 계속:`, (e as Error).message);
        return normalizePhaseSettings(null);
    }
}
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { getCityRegionsWithRadius, cityAliases, getDetourRegions, unionRegions, getActivePolyline, progressAlongPolyline, trapsForKeywords } from "../services/geoService";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
// 노선·반경·할인율 평면 칸은 ④에서 철거 — 그 값들은 user_filter_phases 행에 산다.
// min_fare·max_fare 는 보류 칸 (앱 피기백 — 화물24 단가식 뒤 3단계 강등, 확정안 ①-삭제 #3)
const stmtUpdateFilter = db.prepare(`
    UPDATE user_filters SET
        min_fare = ?, max_fare = ?, excluded_keywords = ?, is_active = ?
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
     * 차종별 하한 단가표는 **콜할인율에서만 파생된다** (docs/필터_재설계_명세.md §2).
     *
     * 관제웹은 `callDiscountPct` 하나만 보내고 표는 만들지 않는다 — 같은 표를 두 곳에서
     * 만들면 한쪽만 고쳐진다(경유 4벌·상태목록 3벌과 같은 사고). 원천은 국면별
     * `discount_pct`(user_filter_phases) 이고, 여기가 그것을 표로 펼치는 유일한 자리다.
     */
    if ('callDiscountPct' in changes) {
        // 요율·수수료의 원천은 DB 다 (설정 화면에서 기사님이 바꾼다).
        const pricing = SettingsRepository.loadPricingConfig(userId);
        session.activeFilter.ratePerKm = rateFloorsFrom(
            changes.callDiscountPct ?? 10,
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
         * 명시적으로 키워드가 전달된 경우 (합짐 경유 · 투트랙 등) → 키워드는 그대로 쓴다.
         *
         * 🔴 2026-08-12 — 다만 **시 별칭은 같이 안 오면 반드시 다시 만든다.**
         *
         * 첫짐에도 별칭을 싣기 시작하면서 생긴 구멍이다. 예전에는 첫짐 별칭이 늘 비어 있어
         * 앱의 2단계 필터가 아예 안 돌았으므로 옛 값이 남아도 무해했다. 이제는 아니다.
         *
         * `startTwoTrack` 은 `destinationKeywords` 만 넘긴다. 그러면 스프레드(`...changes`)가
         * `customCityFilters` 를 안 건드려 **직전 경유의 별칭이 그대로 남는다.**
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
    } else if ('destinationCity' in changes && !changes.destinationCity) {
        /**
         * 🔴 **도시를 "지웠을 때"만 경유도 지운다** (todo A번 · 2026-08-14 부터 미수정 → 08-22 수정).
         *
         * 예전 조건은 `!session.activeFilter.destinationCity` — *"도시가 **비어 있으면**"* 이었다.
         * 그래서 **도시와 무관한 변경**(최저 운임·콜 잡기 껐다 켜기·GPS 파생 재계산)에도
         * 경유 키워드가 통째로 날아갔다.
         *
         * 🔴 만드는 쪽과 지우는 쪽이 서로 다른 것을 보고 있었다:
         *    KEEP → `syncDetourFilter` 는 **경로 기반**으로 꽂는다 (도시를 안 본다)
         *    그 뒤 아무 변경 → 여기서 *"도시가 비었네"* → 전멸
         *
         * 그리고 장부상 **합짐 국면은 목적지 도시가 원래 비어 있다**(`user_filter_phases`).
         * 즉 첫짐을 KEEP 해서 합짐으로 넘어가는 **정상 흐름이 곧 그 조건**이었다.
         * 경유가 0개가 되면 앱은 아무 콜도 안 올린다 — 화면엔 에러가 없고 **조용히 멈춘다.**
         * (CLAUDE.md: *"빈 필터는 '제한 없음'이 아니라 고장이다"*)
         *
         * 2026-08-14 에 GPS 이동이 이 가지를 밟을 뻔해 전용 통로(`trimTraveled`)로 피했는데,
         * 가지 자체는 남아 있었다. 이제 **기사님이 도시를 지운 그 순간**에만 걸린다.
         */
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
    // 그래서 합짐 도중 경유이 갱신될 때마다(syncDetourFilter 는 키워드만 넘긴다)
    // **적재 용량 제한이 조용히 풀렸다.** 라보 2개를 싣고도 1t 콜을 잡으러 가는 상태가 된다.
    // 실측: 상태 복구가 [오토바이, 다마스, 승용차] 로 좁혀 놓은 직후 경유 갱신 한 번에
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
            // 🔄 파생 치환 ② — 적재의 재료도 새 장부에서
            const reports = new Map(loaded.map(c => [c.id, stepRecordsOf(c.id).reports]));
            const { points, confidence } = computeLoadedPoints(loaded, myVehicle, reports);
            session.activeFilter.allowedVehicleTypes = getRemainingCapacityTypesByPoints(myVehicle, points);
            session.capacityConfidence = confidence;
            session.activeFilter.capacityConfidence = confidence;

            /**
             * 관제탑 표시용 — 점수가 곧 **박스**다 (라면박스 축 2026-08-17).
             * 옛 축에서는 여기서 ÷7.5 로 칸 환산을 했는데, 그 잔재가 남아
             * "다마스 30박스 → 4/100박스"로 표시되는 사고가 났다 (기사님 실측 2026-08-17).
             *
             * 별도로 세지 않는 이유: 차종으로 다시 세면 통화로 확인한 실제 짐 양이
             * 반영되지 않아 **화면과 판정이 다른 말을 한다.** 판정이 쓰는 점수에서 파생시킨다.
             */
            session.activeFilter.slotsUsed = Math.min(
                TRUCK_CAPACITY_SLOTS,
                Math.round(points * 10) / 10
            );
        }
    }

    /**
     * 🔴 **마지막에 지나온 구간을 뺀다.**
     *
     * 여기가 유일한 자리인 이유: 경유을 다시 그리는 길이 여럿인데(경로 갱신·반경 변경·
     * 국면 전환), 어느 길로 오든 **다시 그리면 지나온 동이 되살아난다.**
     * 파생 계산의 끝에 두면 그 셋을 다 덮는다.
     */
    applyTraveledTrim(session);
}

/**
 * [GPS 전용] 지나온 구간을 빼고, 바뀌었으면 관제탑에 알린다.
 *
 * 🔴 **파생 재계산을 거치지 않는다.** `updateActiveFilter(userId, {})` 로 트리거하면
 *    그 안의 *"도착 도시가 비어 있으면 키워드를 지운다"* 가지에 걸려, 도시를 안 고른 채
 *    운행할 때 **0.5km 마다 경유이 통째로 지워진다.** 빈 필터는 "제한 없음"이 아니라
 *    고장이라 콜 잡기가 조용히 멈춘다.
 *
 *    지나온 구간 제거는 허용 차종·적재 칸을 다시 셀 이유가 없다. 필요한 건 숫자 비교뿐이다.
 */
export function trimTraveled(userId: string, io?: any): void {
    const session = getUserSession(userId);
    if (!applyTraveledTrim(session)) return;
    broadcastFilter(userId, session, io);
}

/**
 * 경유을 새로 그렸으면 **진행도도 같이 기억한다.**
 *
 * 🔴 키워드와 진행도는 **같은 입력에서 같이 나온 한 벌**이다. 한쪽만 갱신하면
 *    옛 경로의 진행도로 새 경로의 동을 지우게 된다 — 멀쩡한 지역이 조용히 사라진다.
 *    경유을 만드는 자리마다 이 함수를 부른다.
 */
export function rememberDetourProgress(
    session: ReturnType<typeof getUserSession>,
    regions: { progressKm?: Record<string, number>; flat?: string[] } | null,
) {
    session.detourProgressKm = regions?.progressKm ?? null;
    /**
     * 🛣️ 경로 위 동 목록도 함께 기억한다 (2026-08-25).
     * ⚠️ **여기에는 경유만 넣는다.** 도착 목표에서 온 동을 섞으면 상차지 축이 뚫린다
     *    (`buildAppProgressKm` 주석 참고 — 2026-08-18 파주 사고와 같은 형태).
     */
    session.detourFlat = regions?.flat ?? null;
}

/**
 * 🧭 **앱에 내려보낼 경로 순서 맵** — 역주행·경로 밖 상차 차단용 (기사님 확정 2026-08-18)
 *
 * 실사고: 파주 도착 직전에 `초월읍(광주) → 금촌동(파주)` 콜이 앱 필터를 통과했다
 * (2026-08-18 08:50). 앱은 하차지만 보고 상차지를 아무도 안 봐서 — 78km 역주행 콜이었다.
 *
 * · 키를 **지금 목록(destinationKeywords)으로 좁힌다** — 세션의 detourProgressKm 은
 *   지나온 동도 계속 들고 있어(트림 비교용), 그대로 보내면 지나온 동이 "경로 위"로 남는다
 * · 값 없음(스냅 실패)은 **null** — "순서를 모른다"는 뜻이고 앱은 모르면 막지 않는다
 * · 경로가 없으면(첫짐) **빈 객체** — 앱이 순서 검사를 통째로 건너뛴다
 *
 * 🔴 **`Infinity` 를 null 로 보내면 판정이 통째로 죽는다** (2026-08-18 실측으로 발견).
 *    `Infinity` 는 *하차지 원 안의 동*이라는 뜻인데, **트림에서만** 쓰는 표식이다
 *    ("도착이 가까워도 이 동네는 빼지 마라"). 순서로는 무한대가 아니라 **경로의 끝**이다.
 *    처음에 null 로 바꿔 보냈더니 운행중(경유 0km) 목록 7개가 **전부 하차지 원 안**이라
 *    7개 다 null 이 됐고, 앱은 "순서를 모른다"며 하나도 못 걸렀다.
 *    → 하차지 원 안 동은 **경로 총 길이**를 준다. 뜻도 그게 맞다.
 */
export function buildAppProgressKm(
    session: ReturnType<typeof getUserSession>,
): Record<string, number | null> {
    /**
     * 🔴 진행 중 경로가 없으면(활성 콜 0) 순서도 없다 (버그 대장 #39 · 2026-08-22).
     * 옛 사이클의 진행도 잔재를 내려보내면 앱 RouteOrderFilter 가 "경로 밖 상차지
     * 차단"을 **첫짐 탐색에** 발동한다 — 옛 경유 목록 밖 첫짐 후보가 전부 막힌다.
     * 원천(경로)이 없으면 파생도 빈 것이다 (규칙 ③).
     */
    if (getActiveCalls(session).length === 0) return {};
    const progress = session.detourProgressKm;
    if (!progress) return {};

    // 경로의 끝 = 마지막 점의 진행도. 못 구하면 하차지 원 동은 null 로 남긴다 (지어내지 않는다)
    const poly = getActivePolyline(session);
    const endKm = poly && poly.length >= 2
        ? progressAlongPolyline(poly, poly[poly.length - 1])
        : null;

    // 경로 위 동 목록 — 없으면(옛 세션) 거르지 않는다. 지금까지의 동작 그대로다
    const onRoute = session.detourFlat ? new Set(session.detourFlat) : null;

    const out: Record<string, number | null> = {};
    for (const dong of session.activeFilter.destinationKeywords ?? []) {
        /**
         * 🔴 **경유에 없는 동은 내보내지 않는다** (2026-08-25).
         *
         * 목록에는 이제 도착 목표(첫짐의 «여주시») 에서 온 동이 섞여 있다. 그건
         * **하차지를 열려고** 넣은 것이지 «경로 위»라는 뜻이 아니다.
         *
         * 여기서 `null` 로 내보내면 앱의 `RouteOrderFilter` 가 키가 있다는 이유로
         * «상차지 순서 미상 — 통과» 로 읽어 **그 동에서 싣는 콜을 허용한다** —
         * 2026-08-18 파주 사고(78km 뒤로 돌아가 싣기)와 같은 형태다.
         *
         * ⚠️ **`progress` 의 키로 거르면 안 된다.** `centroid` 가 없어 스냅에 실패한 동은
         *    경로 위인데도 진행도 맵에 없다. 그 동은 `null`(«순서 미상 — 통과»)로 나가야
         *    맞다 — «모르는 것»과 «경로 밖»은 다르다. 그래서 경유 목록으로 거른다.
         */
        if (onRoute && !onRoute.has(dong)) continue;
        const v = progress[dong];
        out[dong] = Number.isFinite(v) ? (v as number)
            : (v === Infinity ? endKm : null);
    }
    return out;
}

/**
 * **지나온 구간을 필터에서 뺀다** — 경유을 다시 그리지 않고.
 *
 * 기사님: *"성남을 지났으면 이미 지나온 광주시·성남시 콜은 목록에서 뺀다. 뒤로 안 돌아가니까."*
 *
 * 경유을 만들 때 동마다 기록해 둔 진행도(`detourProgressKm`)와 지금 GPS 의 진행도를
 * 비교하기만 한다 — 실측 **0.14ms**. 예전 방식(경유 통째 재계산)은 173ms 였다.
 *
 * 안전 쪽으로 기운 규칙 셋. **일찍 빼면 잡을 수 있는 콜을 버린다:**
 *   ① 진행도를 **모르는 동은 남긴다**
 *   ② **전부 빠지면 아무것도 안 한다** — 빈 필터는 "제한 없음"이 아니라 **고장**이다
 *   ③ 동·시 묶음·별칭을 **한 벌로** 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)
 */
export function applyTraveledTrim(session: ReturnType<typeof getUserSession>): boolean {
    /**
     * 🔴 **국면을 보지 않는다** (2026-08-14 정정).
     *
     * 처음에는 `dispatchPhase === 'DELIVERING'` 일 때만 돌렸다. 그런데 지나온 구간은
     * **국면과 무관하게 참이다** — 이미 지난 동네는 합짐이든 운행중이든 지난 동네다.
     * 게다가 도착 감지가 국면을 GATHERING 으로 떨어뜨리자 **달리는 중인데 제거가 멈췄다.**
     *
     * 조건은 데이터에 맡긴다: 진행도가 있고(= 경유을 그렸고) · 경로가 있고 · GPS 가 있으면 돈다.
     * 콜이 0건이면 경로가 없으니 자연히 안 돈다.
     */
    const progress = session.detourProgressKm;
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
 * 반경이 바뀌었으면 **경유 지역 목록도 다시 그린다.**
 *
 * 🔴 숫자만 바꾸고 지역 목록을 그대로 두면 화면과 판정이 다른 말을 한다 —
 *    "경유 5km" 라고 적혀 있는데 실제로는 옛 1km 목록으로 거르는 상태가 된다.
 *    조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 *
 * 합짐 모드가 아니면(경로가 없으면) 경유 자체가 없으므로 아무것도 하지 않는다.
 */
function refreshDetourIfNeeded(
    session: ReturnType<typeof getUserSession>,
    userId: string,
    before: { detourRadiusKm?: number, destinationRadiusKm?: number },
) {
    if (!session.activeFilter.isSharedMode) return;
    const cRadius = session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
    const dRadius = session.activeFilter.destinationRadiusKm ?? 10;
    if (cRadius === before.detourRadiusKm && dRadius === before.destinationRadiusKm) return;

    const regions = recalculateDetourFilter(userId, cRadius, dRadius);
    if (!regions) return;   // 경로가 아직 없다 — 없는 값을 지어내지 않는다
    rememberDetourProgress(session, regions);

    // 셋을 **한 벌로** 넣는다. 별칭(customCityFilters)이 빠지면 앱의 2단계 필터가 조용히 꺼진다
    session.activeFilter.destinationKeywords = regions.destinationKeywords;
    session.activeFilter.destinationGroups = regions.destinationGroups;
    session.activeFilter.customCityFilters = regions.customCityFilters;
    console.log(`🛣️ [경유 갱신] 경유 ${cRadius}km · 하차 ${dRadius}km → 지역 ${regions.destinationKeywords.length}개`);
}

/**
 * 국면이 바뀌었으면 그 국면의 저장값을 평면 필터에 펼친다.
 *
 * 국면 키가 **실제로 바뀔 때만** 편다 — 같은 국면에서 매번 덮으면 기사님이 방금 고친 값이
 * 계속 되돌아가고, 경유 재계산도 불필요하게 돈다.
 */
function applyPhaseSettingsIfChanged(
    session: ReturnType<typeof getUserSession>,
    changes: Partial<AutoDispatchFilter>,
    userId: string,
) {
    const key = resolvePhaseKey(
        session.activeFilter.callTarget ?? 'DEST',
        session.activeFilter.dispatchPhase ?? 'STANDBY',
    );
    if (key === session.appliedPhaseKey) return;

    const prev = session.appliedPhaseKey;
    session.appliedPhaseKey = key;
    const before = {
        detourRadiusKm: session.activeFilter.detourRadiusKm,
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
    refreshDetourIfNeeded(session, userId, before);
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
        `상차 ${session.activeFilter.pickupRadiusKm}km · 경유 ${session.activeFilter.detourRadiusKm}km · ` +
        `하차 ${session.activeFilter.destinationRadiusKm}km · 할인 ${session.activeFilter.callDiscountPct}%`);

    // 단가표는 할인율에서 파생된다 (§2-1) — 여기서 다시 만든다
    const pricing = SettingsRepository.loadPricingConfig(userId);
    session.activeFilter.ratePerKm = rateFloorsFrom(
        session.activeFilter.callDiscountPct ?? 10,
        pricing.vehicleRates,
        pricing.agencyFeePercent,
    );
}

/**
 * [관제탑 탭 전용] **한 국면의 설정만** 바꾼다 (§2-4).
 *
 * 기사님이 합짐 탭에서 하차 반경을 1km 로 고쳤다고 해서, 지금 첫짐을 콜 잡는 중인
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
        // saveBaseFilter 가 writePhaseRows 로 행(원천)에 저장한다
        saveBaseFilter(userId, {}, io);
    }

    const activeKey = resolvePhaseKey(
        session.activeFilter.callTarget ?? 'DEST',
        session.activeFilter.dispatchPhase ?? 'STANDBY',
    );

    console.log(`🧭 [국면 저장] ${phase}${saveAsDefault ? ' (앞으로 계속)' : ' (오늘만)'} · ` +
        `상차 ${clean.pickupRadiusKm}km · 경유 ${clean.detourAllowKm}km · ` +
        `하차 ${clean.dropoffRadiusKm}km · 할인 ${clean.discountPct}%` +
        `${phase === activeKey ? ' → 지금 국면이라 바로 적용' : ` (지금은 ${activeKey}, 그 국면이 되면 적용)`}`);

    if (phase === activeKey) {
        const before = {
            detourRadiusKm: session.activeFilter.detourRadiusKm,
            destinationRadiusKm: session.activeFilter.destinationRadiusKm,
        };
        /**
         * 🔴 평면 이름 매핑은 여기서 하지 않는다 — `applyPhaseToFilter` 가 유일한 지점.
         *
         * `userOverrides` 를 **켜지 않는다.** 그 깃발은 자동 경유 갱신을 멈추는 것인데,
         * 이제 기사님이 고른 반경은 국면 설정에 남아 있으므로 얼려 둘 이유가 없다.
         * 반경은 기사님 것이고, 그 반경으로 그린 **지역 목록은 경로를 따라가야 한다.**
         */
        updateActiveFilter(userId, applyPhaseToFilter(phase, clean), io);
        // 반경이 바뀌었으면 경유을 다시 그린다 (updateActiveFilter 는 도시 기반 지리만 본다)
        refreshDetourIfNeeded(session, userId, before);
        if (io) broadcastFilter(userId, session, io);
    } else if (io) {
        // 지금 국면이 아니면 필터는 그대로. 탭 값이 저장됐다는 것만 알린다
        broadcastFilter(userId, session, io);
    }
}

/**
 * 지금 경로 주변의 **경유 지역**을 다시 구한다 (합짐·운행중).
 *
 * 🔴 2026-08-14 에 `dispatchEngine` 에서 여기로 옮겨 왔다. 국면별 설정이 들어오면서
 *    경유을 다시 그려야 하는 자리가 셋이 됐는데(필터 저장 · 국면 설정 저장 · 국면 전환),
 *    뒤의 둘은 이 파일 안이라 dispatchEngine 을 부르면 순환 참조가 된다.
 *    경유 계산이 4벌로 갈라졌던 사고를 되풀이하지 않으려면 **구현은 하나여야 한다.**
 */
export const recalculateDetourFilter = (userId: string, detourRadiusKm: number, destinationRadiusKm?: number) => {
    const session = getUserSession(userId);
    let polylineToUse = null;
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1].routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const detour = getDetourRegions(polylineToUse, detourRadiusKm, destinationRadiusKm);
        if (detour && detour.flat.length > 0) {
            /**
             * 🎯 **지금 도착 목표를 경유에 합친다** (기사님 확정 2026-08-25).
             *
             * 기사님: *"가남→세종대왕면 , 가남→점동면 둘다 콜이 올라와야 한다고 난 보는데."*
             *
             * 경유만 쓰면 «목적지 안인데 경로에서 벗어난 곳»이 통째로 막힌다.
             * 저장하지 않고 **지금 쓰는 필터 값**에서 파생한다 (규칙 ③).
             *
             * 🔴 **`phaseSettings` 를 직접 읽지 않는다** (2026-08-25 18:58 실측 사고).
             *    한때 `phaseSettings.first` 를 읽었는데, **복귀행으로 바뀌자 판정만 옛
             *    노선 목적지(파주)를 계속 봤다.** 화면과 서버는 «복귀행 · 광주시»라고
             *    정확히 말하고 있었는데 광주로 내리는 콜이 전부 «도착지 밖»이 됐다.
             *
             *        ① 국면 설정  →  ② 평면 필터(activeFilter)  →  ③ 파생 목록
             *                applyPhaseToFilter        여기
             *
             *    ①과 ② 사이에 국면 전환·`override`·`auto` 파생이 있다. ③에서 ①을 직접
             *    읽으면 그 변환이 통째로 무시된다. **파생은 바로 윗단만 본다.**
             *    ①을 다시 해석하는 것은 `applyPhaseToFilter` 를 두 번째로 구현하는 것이다.
             *
             * 🔴 **조립은 여기 한 곳뿐이다.** 예전엔 `syncDetourFilter` 도 따로 조립해서,
             *    도착 목표를 한쪽에만 넣자 다른 쪽이 덮어썼다 (실측 12:35:50 —
             *    131개가 출발 순간 27개로 되돌아갔다). «경유 4벌» 과 같은 클래스다.
             */
            const merged = unionRegions(
                detour,
                session.activeFilter.destinationCity,
                session.activeFilter.destinationRadiusKm ?? 0,
            );
            return {
                // 필터에 실을 것 — 경유 ∪ 도착 목표 (하차지를 연다)
                destinationKeywords: merged.flat,
                destinationGroups: merged.grouped,
                customCityFilters: merged.customCityFilters,
                /**
                 * 🛣️ **경로 위가 어디인가 — 경유만이다** (상차지 축의 원천).
                 *    도착 목표에서 온 동을 여기 섞으면 앱이 «순서 미상 — 통과» 로 읽어
                 *    그 동에서 싣는 콜을 허용한다 (2026-08-18 파주 사고와 같은 형태).
                 */
                progressKm: detour.progressKm,
                flat: detour.flat,
            };
        }
    }
    return null;
};

// ━━━ 내부 유틸: 소켓 브로드캐스트 ━━━
function broadcastFilter(userId: string, session: ReturnType<typeof getUserSession>, io?: any) {
    // [Phase 6] 부트스트랩 중에는 중간 상태를 내보내지 않는다.
    // 복구 과정에서 updateActiveFilter 가 여러 번(상태 파생 → 경유 재계산) 호출되는데,
    // 그때마다 filter-updated 를 쏘면 관제탑이 첫짐 → 합짐으로 깜빡인다.
    // 확정된 필터는 부트스트랩 끝에서 filter-init 으로 한 번만 나간다.
    if (session.isBootstrapping) return;
    if (!io) return;

    const payload = {
        activeFilter: session.activeFilter,
        baseFilter: session.baseFilter,
        // 국면별 설정 (§2-4) — 관제탑의 탭이 이걸 편집한다
        phaseSettings: session.phaseSettings,
        basePhaseSettings: session.basePhaseSettings,
    };

    /**
     * 🔴 **바뀐 게 없으면 안 보낸다** (2026-08-14).
     *
     * 이 함수는 `updateActiveFilter` 끝에서 불리고, 그 호출부가 **22곳**이다.
     * 한 동작(KEEP 하나)이 내부적으로 여러 단계를 거치면 그 수만큼 나갔다 —
     * 실측 **54ms 안에 15번**. 관제웹은 중간 상태를 다 받아 그때마다 다시 그렸다.
     *
     * 바로 위 `isBootstrapping` 방어가 같은 이유로 있었다("중간 상태를 내보내면 관제탑이
     * 첫짐 → 합짐으로 깜빡인다"). 그 생각을 부트스트랩 밖까지 민 것이다.
     * 판단은 **서버가 한 번** 한다 — 관제웹 여럿이 매번 비교하는 대신.
     */
    const json = JSON.stringify(payload);
    if (json === session.lastFilterJson) return;
    session.lastFilterJson = json;

    io.to(userId).emit("filter-updated", payload);
}

/**
 * [톱니바퀴 전용] 영구 설정(baseFilter)을 DB에 저장합니다.
 * 
 * ⚠️ 현재 콜 잡는 중인 activeFilter에는 절대 영향을 주지 않습니다.
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
            b.minFare,
            b.maxFare,
            JSON.stringify(b.excludedKeywords || []),
            b.isActive ? 1 : 0,
            userId
        );
        // 🎛️ 국면 옵션(노선·반경·할인율)의 원천 — user_filter_phases 행
        writePhaseRows(userId, session.basePhaseSettings);
    } catch (e) {
        console.error(`[FilterManager] DB 저장 에러 (userId: ${userId}):`, e);
    }

    logRoadmapEvent(
        "서버",
        `[FilterManager] 영구 설정(baseFilter) DB 저장 완료\n` +
        ` - 변경된 값: ${JSON.stringify(changes)}\n` +
        ` - ⚠️ activeFilter는 변경하지 않음 (현재 콜 잡기에 영향 없음)`
    );

    // baseFilter 변경 내역을 프론트엔드에 실시간 전파 (초기화 버튼 클릭 시 최신값 반영을 위함)
    if (io) {
        broadcastFilter(userId, session, io);
    }
}

/**
 * [돋보기 + 시스템 전용] 현재 콜 잡는 중인 activeFilter를 직접 수정합니다.
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
    // 합짐 사이클에서 사용된 임시 값들(경유, 차종 제한 등)을 baseFilter 기준으로 리셋
    const previousPhase = session.activeFilter?.dispatchPhase ?? 'STANDBY';
    const nextPhase = changes.dispatchPhase ?? previousPhase;
    const isTransitionToEmpty = previousPhase !== 'STANDBY' && nextPhase === 'STANDBY';

    if (isTransitionToEmpty) {
        /**
         * 🔴 2026-08-12 — 여기서 `{...session.baseFilter}` 로 **통째로** 덮어쓰고 있었다.
         *
         * 바로 위 주석은 *"합짐 사이클에서 사용된 임시 값들(경유, 차종 제한 등)을 리셋"* 이라고
         * 적혀 있는데, 실제로는 **기사님이 오늘 정한 콜 잡기 설정까지 전부** 되돌렸다 —
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
            // 경유은 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 비워 두면 recalculateDerivedFields 가 **오늘의** destinationCity 로 다시 만든다
            destinationKeywords: [],
            destinationGroups: {},
            customCityFilters: [],
            // 진행도도 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 남겨 두면 다음 운행 초반에 **옛 경로 기준으로** 동이 사라진다
            // (`detourProgressKm` 은 아래에서 지운다 — activeFilter 가 아니라 세션 필드다)
            // 수동 고정도 사이클과 함께 풀린다 (다음 콜 잡기은 자동 경유으로 시작)
            userOverrides: false,
            isSharedMode: false,
            driverAction: 'WAITING',
            dispatchPhase: 'STANDBY',
        };
        session.detourProgressKm = null;
        session.departedAt = null;   // 사이클이 끝났다 — 다음 운행은 다시 모으기부터
        session.arrivalFired.clear();      // 도착 감지 상태도 같은 수명이다 —
        session.arrivalNoticed.clear();    // 어제 찍은 정거장이 오늘 되살아나지 않는다
        session.arrivalWatch = null;
        recalculateDerivedFields(session, {}, userId);
        console.log(`[FilterManager] STANDBY 복귀: 합짐 파생값만 되돌림 ` +
            `(오늘 필터 유지 — 도착 ${session.activeFilter.destinationCity}, 최저 ${session.activeFilter.minFare}원)`);
    } else {
        // 일반 변경: activeFilter에 직접 덮어쓰기
        session.activeFilter = { ...session.activeFilter, ...changes };
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes, userId);
    }

    // 🗺️ 키워드 트랩 — 지금 키워드에서 매번 파생한다 (regionMatch 사전 확장 · 기사님 확정 ④).
    //    "남동"→"인천 남동구" 오탐의 원천 수리. 원천은 전국 지명 사전(geoService)이고,
    //    앱·서버 매칭(anyRegionHit)이 이 트랩으로 부분 문자열 오탐을 거른다.
    session.activeFilter.keywordTraps = trapsForKeywords(session.activeFilter.destinationKeywords ?? []);

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

    /**
     * 실은 짐이 없으면 **'운행 중'도 '하차 중'도 될 수 없다.**
     *
     * 🔴 2026-08-14 — 예전에는 `DRIVING` 만 되돌렸다. 그래서 도착 감지가 켠 `UNLOADING` 이
     *    콜을 다 끝낸 뒤에도 남아, **빈 차인데 화면은 "하차 중"** 이라고 말했다.
     *    (도착 감지가 죽어 있던 동안에는 이 값이 켜질 일이 없어 드러나지 않았다)
     *    판정에는 영향이 없지만 — `deriveDispatchPhase` 는 콜 0건이면 무조건 STANDBY —
     *    화면이 사실과 다르게 말하고 다음 콜 잡기가 '하차 중'으로 시작한다.
     */
    if (activeCount === 0 && session.activeFilter.driverAction !== 'WAITING') {
        console.log(`🔗 [불변식] driverAction ${session.activeFilter.driverAction} → WAITING (활성 콜 0건)`);
        session.activeFilter.driverAction = 'WAITING';
    }

    /**
     * 🚀 출발을 눌렀다 — 관제웹은 `driverAction: 'DRIVING'` 으로 알린다.
     * 그 **사실**을 세션에 새긴다. 이후 정류장에서 driverAction 이 어떻게 바뀌든
     * 운행 중은 유지된다 (마지막 하차로 콜이 0건이 될 때까지).
     */
    if (changes.driverAction === 'DRIVING' && !session.departedAt) {
        session.departedAt = Date.now();
        console.log(`🚀 [출발] 이제 모으지 않고 갑니다 — 운행 중 유지 (정류장에서 안 풀림)`);
    }
    // 실은 짐이 없으면 출발했을 리도 없다
    if (activeCount === 0 && session.departedAt) {
        session.departedAt = null;
    }
    // 경로가 끝났으면 진행도 잔재도 남기지 않는다 (#39 — departedAt 과 같은 수명.
    // 함수 첫머리의 STANDBY 복귀 정리는 changes 로 온 전환만 보고, 불변식이 아래에서
    // 파생으로 되돌리는 전환은 못 본다 — 그래서 여기서 데이터 기준으로 지운다)
    if (activeCount === 0 && session.detourProgressKm) {
        session.detourProgressKm = null;
    }

    const derivedPhase = deriveDispatchPhase(activeCount, !!session.departedAt);
    if (session.activeFilter.dispatchPhase !== derivedPhase) {
        console.log(`🔗 [불변식] dispatchPhase ${session.activeFilter.dispatchPhase} → ${derivedPhase} (활성 콜 ${activeCount}건)`);
        session.activeFilter.dispatchPhase = derivedPhase;
    }

    /**
     * 🔴 **선점 중인 콜이 없으면 콜 잡기은 켜져 있어야 한다** (2026-08-14).
     *
     * `isActive` 는 "지금 콜을 물어도 되는가" 다. `/orders/confirm` 이 콜을 선점하면서
     * `false` 로 끄고(결재 날 때까지 다른 콜을 안 물게), **결재가 나면** `rollbackOnCancel`
     * 이 다시 켠다.
     *
     * 그런데 결재를 거치지 않는 취소 경로가 셋이었다 — 화면 이탈 강제 취소 ·
     * `/detail` 35초 타임아웃 · 비상 보고. **끄기만 하고 켜지 않았다.**
     * 실측(22:04:07): 기사님이 앱에서 손으로 리스트로 빠져나오자 카드는 사라졌는데
     * **콜 잡기가 죽은 채로 남았다.** 화면에 아무 표시도 없어 왜 콜이 안 잡히는지 알 수 없다.
     *
     * 켜는 책임을 취소 경로마다 흩지 않는다 — **선점 중인 콜이 없다**는 데이터에서 파생시킨다.
     * 관제웹은 이 값을 보내지 않으므로(기사님이 손으로 끄는 스위치가 아니다) 안전하다.
     *
     * ⚠️ `pendingOrdersData.size` 로 세면 안 된다 — 그 캐시에는 **종료된 콜도 남아 있다**
     *    (`buildOrderSync` 가 거기서 terminated 를 뽑는다). 세어야 할 것은 **아직 끝나지 않은**
     *    콜이다. 2026-08-14 재현에서 이걸 틀려 한 번 헛돌았다.
     */
    const evaluating = Array.from(session.pendingOrdersData.values())
        .filter((o: any) => !isTerminal(o.status));
    if (!session.activeFilter.isActive && evaluating.length === 0) {
        console.log(`🔗 [불변식] isActive false → true (선점 중인 콜 0건 — 콜 잡기를 다시 켠다)`);
        session.activeFilter.isActive = true;
    }

    const derivedShared = derivedPhase !== 'STANDBY';
    if (session.activeFilter.isSharedMode !== derivedShared) {
        console.log(`🔗 [불변식] isSharedMode ${session.activeFilter.isSharedMode} → ${derivedShared} (dispatchPhase=${derivedPhase})`);
        session.activeFilter.isSharedMode = derivedShared;
    }

    /**
     * 🧭 **국면이 바뀌었으면 그 국면의 저장값을 평면에 펼친다.** (§2-4)
     *
     * 기사님: *"첫짐 도착반경 5km 로 콜을 잡다가 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
     *
     * ⚠️ **여기가 이 함수의 끝이어야 한다.** 조각을 펼친 뒤 `updateActiveFilter` 를 다시
     *    부르면 무한 루프가 된다. 파생값(키워드·별칭·허용차종)은 위에서 이미 계산됐고,
     *    반경이 바뀌면 경유은 다음 경로 계산 때 새 값으로 다시 그려진다.
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
 * `isActive` 는 끄지 않는다 — 아침에는 기본 설정 그대로 콜 잡기를 시작하는 것이 맞다고 하셨다.
 *
 * ⚠️ 타이머를 두지 않는다. 접속·스크랩처럼 **세션을 건드리는 순간**에 확인한다.
 *    타이머는 서버가 자는 사이를 못 잡고, 프로세스가 죽으면 사라진다.
 *
 * @returns 되돌렸으면 true
 */
/**
 * 📊 하루의 성과를 설정 스냅샷과 함께 남긴다 — filter_day_results (필터 정의 4장).
 *
 * 근사 둘을 정직하게 적는다:
 *   · 매출·콜수는 **잡은 날(capturedAt KST)** 기준 — 자정을 넘긴 배송은 잡은 날에 계상
 *   · "그냥 매출"이다 (관제앱은 업무 단위 — 미수금·비용은 정산 페이지의 일)
 * INSERT OR IGNORE — 같은 날을 두 번 쓰지 않는다 (세션 여럿이 자정을 함께 넘어도 1회).
 */
export function recordDayResult(userId: string, day: string, settingsSnapshot: unknown): void {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const range = [`${day}T00:00:00+09:00`, `${day}T24:00:00+09:00`]
        .map(t => new Date(t).toISOString());
    /**
     * 🔴 매출은 **하차한 날**의 것이다 (버그 대장 #38 · 2026-08-22).
     * 잡은 날(capturedAt) 기준으로 세면 자정을 걸친 콜(어제 잡고 새벽 하차)이
     * 어느 날 기록에도 안 잡힌다 — 어제 기록은 이미 확정됐고 오늘 집계는 잡은 날로
     * 거르니까. 관제앱은 업무 단위 — 콜의 끝은 하차고, 매출은 그날 것이다.
     * completedAt 이 없는 옛 행만 잡은 날로 근사한다 (지어내지 않는 폴백).
     */
    const done = db.prepare(`
        SELECT COALESCE(SUM(fare), 0) AS revenue, COUNT(*) AS calls FROM orders
        WHERE userId = ? AND status IN ('ORDER_DELIVERED', 'ORDER_COMPLETED')
          AND COALESCE(completedAt, capturedAt) >= ? AND COALESCE(completedAt, capturedAt) < ?`)
        .get(userId, range[0], range[1]) as any;
    const cancels: Record<string, number> = {};
    for (const r of db.prepare(`
        SELECT COALESCE(targetApp, 'insung') AS app, COUNT(*) AS n FROM orders
        WHERE userId = ? AND status = 'SAFE_CANCEL' AND capturedAt >= ? AND capturedAt < ?
        GROUP BY COALESCE(targetApp, 'insung')`).all(userId, range[0], range[1]) as any[]) {
        cancels[r.app] = r.n;
    }
    const colors: Record<string, number> = {};
    for (const r of db.prepare(`
        SELECT color, COUNT(*) AS n FROM order_judgments
        WHERE userId = ? AND judgedAt >= ? AND judgedAt < ? GROUP BY color`)
        .all(userId, range[0], range[1]) as any[]) {
        colors[r.color] = r.n;
    }
    db.prepare(`INSERT OR IGNORE INTO filter_day_results
                (user_id, day, settings, revenue, calls, cancels, colors)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, day, JSON.stringify(settingsSnapshot ?? {}),
           done.revenue, done.calls, JSON.stringify(cancels), JSON.stringify(colors));
    console.log(`📊 [성과 기록] ${day} — 매출 ${done.revenue.toLocaleString()}원 · 완료 ${done.calls}콜 · ` +
        `취소 ${JSON.stringify(cancels)} · 색 ${JSON.stringify(colors)}`);
}

export function ensureBusinessDay(userId: string, io?: any): boolean {
    const session = getUserSession(userId);
    const today = businessDayKey(Date.now());
    if (session.businessDay === today) return false;

    const yesterday = session.businessDay;
    session.businessDay = today;

    /**
     * 📊 **성과 기록 — 어제치를 리셋 전에 집계한다** (필터 정의 4장 · 확정안 구현 6).
     * "이 설정이 얼마를 벌었나" — 설정 스냅샷은 **리셋되기 전의 어제 오늘값**이어야
     * 하므로 아래 되돌리기보다 먼저 찍는다. 실패해도 전환은 계속 (계측이지 흐름이 아니다).
     */
    try { recordDayResult(userId, yesterday, session.phaseSettings); }
    catch (e) { console.error('📊 [성과 기록] 실패:', (e as Error).message); }

    /**
     * 🖥️ **어제 하차분을 화면 사이클에서 정리한다** (버그 대장 #37 · 2026-08-22).
     *
     * `deckOfCycle`(기사님 확정 2026-08-19)은 *"진행 중이 남으면 하차한 콜도 같이
     * 보여준다"* — 6단계 채워진 모습을 보기 위한 화면 규칙이다. 사이클이 자정을
     * 걸치면(미하차 콜을 남기고 잠들면) 어제 하차한 콜이 오늘 "진행 중"으로 계속
     * 보였다. 재부팅 복구는 이미 영업일로 거르는데 **살아 있는 세션만 구멍**이었다.
     *
     * 하차한 날의 원천은 장부(orders.completedAt)다 — 오늘이 아니면 화면 재료
     * (메모리)에서만 뺀다. 미하차 콜·장부·매출은 건드리지 않는다 (규칙 ① ·
     * "상태는 콜별 즉시, 화면만 사이클 단위").
     */
    try {
        const gone = session.myOrders.filter(o => {
            if (!isDeliveredCall(o)) return false;
            const row = db.prepare(`SELECT completedAt FROM orders WHERE id = ? AND userId = ?`)
                .get(o.id, userId) as { completedAt?: string } | undefined;
            return !row?.completedAt || businessDayKey(Date.parse(row.completedAt)) !== today;
        });
        if (gone.length) {
            session.myOrders = session.myOrders.filter(o => !gone.includes(o));
            for (const o of gone) session.pendingOrdersData.delete(o.id);
            console.log(`🌅 [영업일 전환] 어제 하차 완료 ${gone.length}건을 화면 사이클에서 정리 (장부·매출은 그대로)`);
            if (io) io.to(userId).emit("sync-active-orders", buildOrderSync(session));
        }
    } catch (e) { console.error('🌅 [영업일 전환] 하차분 정리 실패 (전환은 계속):', (e as Error).message); }

    // 되돌리는 규칙은 shared 한 곳에만 있다 (세션 생성 때도 같은 규칙을 쓴다)
    session.activeFilter = resetToBaseFilter(session.baseFilter);

    /**
     * 국면별 오늘값도 평소값으로 되돌린다 (§2-4-7).
     * 기사님: *"오늘 하루 동안 첫짐은 10km 로 고정되는 거지"* — 하루가 지나면 풀린다.
     * 다시 펼치도록 `appliedPhaseKey` 를 비운다.
     */
    session.phaseSettings = normalizePhaseSettings(JSON.parse(JSON.stringify(session.basePhaseSettings)));
    session.appliedPhaseKey = null;
    session.departedAt = null;   // 어제 출발한 것이 오늘 되살아나지 않는다

    console.log(`🌅 [영업일 전환] ${yesterday} → ${today} · 오늘 필터를 기본 설정으로 되돌립니다 ` +
        `(도착 ${session.baseFilter.destinationCity}, 국면 설정 5종 포함)`);
    logRoadmapEvent("서버", `[영업일 전환] ${yesterday} → ${today} — activeFilter 를 baseFilter 로 리셋`);

    // 파생 재계산 + 관제탑 전파
    updateActiveFilter(userId, {}, io);
    return true;
}

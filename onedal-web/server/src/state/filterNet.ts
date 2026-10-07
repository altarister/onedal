/**
 * 🕸️ **그물 · 상차 목록 셈** — 경유 그물(지나갈 동) · 지나온 몫 걷기 · 함정 낱말 · 상차 목록 · 내일 상차.
 * 🔴 이 파일은 위(filterManager)를 가져오지 않는다 — 방향: filterManager → filterNet → filterGoals.
 * 바깥 일을 하는 함수: holdRadiusDistance · rememberDetourProgress · applyTraveledTrim · refreshDetourIfNeeded · filterLineOf · netFilterOf · netOfGoals · refreshKeywordTraps · refreshAdminDongs · refreshDongSigungu · ensureReservedPickupList · rebuildPickupList (세션 · 지금 시각 · 설정 저장소 · DB) (나머지는 값만 받는다 — 지도 자료는 부팅 때 한 번 읽은 것)
 */
import { SAME_NAME_DONGS, ADMIN_SAME_NAME_DONGS, withAdminDongs, reservedPickupRadiusKmOf } from "@onedal/shared";
import { getActiveCalls } from "../core/helpers";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getUserSession } from "./userSessionStore";
import { DEFAULT_DETOUR_RADIUS_KM, nearGoalCitiesOf, goalStateLabel, pickupPartsOf, pickupAreaKey, dropoffPartsOf, lastDropOf, lineUntil, lineFromPoint, mergeDropoffGroups, quadShapeFrom, pruneExcludedRegions, netForGoal, cityCenter, autoRadii, heldRadiusDistanceKm, progressAlongKm, RADIUS_BASE_KM_DEFAULT, effectiveRadii } from "@onedal/shared";
import { planArrivalStops } from '../services/routeComposer';
import { mapFeatureCount, cityAliases, trapsForKeywords } from "../services/geoService";
import { getCityRegionsWithRadius, pickupListFor, regionsTouchingCircleGrouped, regionsTouchingNetGrouped, getDetourRegions } from "../services/geoRegions";
import { getActivePolyline, originOf, homeOriginOf } from "../services/geoMotion";
import { haversineKm } from "@onedal/shared";
import { slog } from "../utils/fileLogger";
import { goalZonesNow } from "./filterGoals";

type Session = ReturnType<typeof getUserSession>;
type Filter = Session['activeFilter'];

/**
 * 📏 **자동 반경이 쓸 «잰 거리»를 들고 있게 한다 — 한 곳** (#149).
 *    들고 있으면 그대로, 비어 있으면 «내 위치 → 목적지»로 재서 싣는다(`radiusDistanceKm`).
 *    🔴 상차 목록(`rebuildPickupList`)과 하차 목록(`netKeywordsOf`)이 **반경을 쓰기 전에** 부른다 —
 *    한쪽만 재면 서버를 다시 켠 직후 먼저 만든 목록이 안 줄인 원래 반경으로 만들어진다.
 *    목적지 좌표를 모르면 재지 않는다 (규칙 ④).
 */
export function holdRadiusDistance(session: ReturnType<typeof getUserSession>, city: string, me: { x: number; y: number } | null): number | undefined {
    const distanceKm = radiusDistanceFrom(session.activeFilter.radiusDistanceKm, city, me);
    session.activeFilter.radiusDistanceKm = distanceKm;
    return distanceKm;
}

/** 📏 잰 거리 — 값만 받는 셈 (들고 있는 거리 · 목적지 · 내 위치) */
export function radiusDistanceFrom(held: number | null | undefined, city: string, me: { x: number; y: number } | null): number | undefined {
    let goal: { lng: number; lat: number } | null = null;
    try { goal = cityCenter(city); } catch { goal = null; }
    const measured = me && goal && Number.isFinite(goal.lng) && Number.isFinite(goal.lat)
        ? haversineKm(me, goal) : null;
    return heldRadiusDistanceKm(held, measured);
}

/**
 * 🕸️ **그물이 만든 하차지 목록** — 서버도 실험실과 **같은 계산**을 쓴다.
 *
 * 앱이 보는 `destinationKeywords` 는 **«이 콜의 하차지가 내 그물 안인가»** 하나를 답한다
 * (`InsungParser.kt` 의 `anyHit(pureDropoffText, …)`). 실험실의 `dropIn` 과 같은 질문이라
 * 그대로 맞물린다 (규칙 ⑤-4 ⑤).
 *
 * ```
 * 첫짐   line: null  · anchor: 내 위치       → 내 위치 원 ∪ 목적지 원 ∪ 마름모
 * 합짐   line: 지금 경로 · lastDrop: 라인 끝 → 라인 띠 ∪ 목적지 원 ∪ 마름모
 * ```
 *
 * 🔴 **못 그리면 도시 둘레로 물러선다** — 목적지를 모르거나(`cityCenter` 가
 *    좌표를 못 냄) 첫짐인데 내 위치를 모르면 그물의 꼭짓점이 없다. 그때 **비우지 않는다**:
 *    빈 목록은 «제한 없음»이 아니라 **고장**이고(루트 README.md), 없는 값을 지어내지도
 *    않는다(규칙 ④). 잴 수 있는 방법으로 물러설 뿐이다.
 *
 * ⚠️ 그물은 동을 **중심점 하나**로 담는다 — 원 · 마름모 · 띠 가장자리에 걸친 동은 아래에서 따로 더한다.
 *    도시 둘레(폴리곤)와의 차이는 `pnpm net:compare` 로 잰다.
 */
export function netKeywordsFrom(
    f: Filter,
    city: string,
    radiusKm: number,
    /** 그 목적지의 조각 — 라인(확정콜의 마지막 하차지까지 자른 것 · 동선이면 부르는 쪽이 null 로 준다) · 확정콜의 마지막 하차지 · 현위치 원을 넣나 · 🎯 가까이 옴 (shared `dropoffPartsOf`) */
    part: { line: Array<[number, number]> | null; lastDrop: { x: number; y: number } | null; withMe: boolean; nearGoal: boolean },
    /** 📍 그물의 꼭짓점은 «지금 기점» — 낡거나 빈 차의 가짜면 집 주소가 대신한다 (부르는 쪽이 `originOf` 로 낸다) */
    me: { x: number; y: number } | null,
): { flat: string[]; grouped: Record<string, string[]>; byNet: boolean; pruned: number; progressKm: Record<string, number>;
    /** 🎯 목적지 원 반경(km) — `dstDiamKm / 2` · 가까이 온 목적지의 하차 목록이 쓰는 그 원이다. */
    destRingKm: number;
    /** 📏 잰 거리를 썼나 · 그 값 — 부르는 쪽이 세션에 싣는다 (그물을 못 그려 물러설 때는 안 잰다) */
    measured: boolean; distanceKm: number | undefined } {
    const line = part.line;
    const excluded = f.excludedRegions ?? [];
    let measured = false;
    let distanceKm: number | undefined;
    /** 🚫 제외로 **몇 개가 빠졌나** — 로그가 «왜 줄었는지»를 말할 수 있어야 한다 */
    const prune = (grouped: Record<string, string[]>, byNet: boolean) => {
        const before = new Set(Object.values(grouped).flat()).size;
        const kept = pruneExcludedRegions(grouped, excluded);
        return { ...kept, byNet, pruned: before - kept.flat.length };
    };
    /* 🔴 물러선 목록에는 라인이 없다 — 진행도도 없다 (지어내지 않는다 · 규칙 ④) */
    const fallback = () => ({ ...prune(getCityRegionsWithRadius(city, radiusKm).grouped, false), progressKm: {} as Record<string, number>, destRingKm: radiusKm, measured, distanceKm });
    const goal = cityCenter(city);
    if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return fallback();

    if (!line && !me) return fallback();        // 첫짐인데 꼭짓점이 없다

    const quad = quadShapeFrom(f as any);
    /**
     * 📐 **반경 자동 맞춤** — 목적지와의 거리에 따라 반경이 자동으로 바뀐다 · 자동/수동.
     *
     * 🔴 **거리는 하루에 한 번 잰다** (#117) — 들고 있으면 그것을 쓰고, 비어 있을 때만
     *    «내 위치 → 목적지»로 잰다(`holdRadiusDistance`). 합짐마다 «마지막 하차지 → 목적지»로 다시 재면
     *    목적지 앞에서 원이 거의 0 이 되어 관내콜도 가는 길의 좋은 콜도 못 받는다.
     *    비우는 곳: 다시 구하기(`null`) · 목적지 변경(`updateActiveFilter`) · 영업일 전환(`resetToBaseFilter`).
     * 🔴 **계산은 `shared` 한 곳이다** — 관제웹 지도(`useStageAreas` «상차» · «하차» 레이어 · `effectiveRadii`)가 **같은 함수**를 부른다.
     *    두 벌이면 «지도는 든다는데 판정은 탈락»이 된다 (규칙 ③).
     * ⚠️ **수동이면 손대지 않는다.** 그리고 거리를 못 재면 자동도 **받은 값 그대로** 둔다
     *    (`autoRadii` 안에서 걸러진다 · 규칙 ④).
     */
    distanceKm = radiusDistanceFrom(f.radiusDistanceKm, city, me);
    measured = true;
    const auto = f.radiusAuto
        ? autoRadii(distanceKm, {
            pickupRadiusKm: f.pickupRadiusKm ?? 10,
            destinationRadiusKm: radiusKm,
            quadRadiusKm: quad.quadRadiusKm,
            detourRadiusKm: f.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM,
        }, f.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT)
        : null;
    const params = {
        ...quad,
        ...(auto ? { quadRadiusKm: auto.quadRadiusKm } : {}),
        srcDiamKm: (auto ? auto.pickupRadiusKm : (f.pickupRadiusKm ?? 10)) * 2,
        dstDiamKm: (auto ? auto.destinationRadiusKm : radiusKm) * 2,
    };
    /**
     * 📏 **자동이 지금 얼마로 줄였나** — 화면에는 배율이 아니라 **잰 거리**를 싣는다 (위 `holdRadiusDistance` 가 이미 실었다).
     *    셈은 `effectiveRadii` 한 곳이다.
     *    🔴 기사님이 정한 원값(`pickupRadiusKm` 등)은 **안 건드린다** (규칙 ④).
     */
    /**
     * 🎯 **목적지 가까이 옴 → 그 목적지 원에 걸친 동 전체**.
     *    관내를 따로 재지 않는다 — «가까이 옴»(`withNearness`)이 갈랐다. 상차 목록 동도 안 뺀다 (`mergeDropoffGroups`).
     *    걸침은 상차 목록과 같은 식이다 (`geoService.regionsTouchingAreaGrouped` — 격자 점 ∪ 동 꼭짓점).
     */
    if (part.nearGoal) {
        const ringKm = Math.max(0, params.dstDiamKm / 2);
        const grouped = regionsTouchingCircleGrouped({ lng: goal.lng, lat: goal.lat }, ringKm);
        if (!Object.keys(grouped).length) return fallback();
        return { ...prune(grouped, true), progressKm: {}, destRingKm: ringKm, measured, distanceKm };
    }

    /* 🏁 마름모의 시작 — 그 목적지 콜의 마지막 하차지(`lastDropOf` · 부르는 쪽이 고른다) · 모르면 라인 끝 */
    const lastDrop = part.lastDrop
        ? { name: '현시점 확정콜의 마지막 하차지', lng: part.lastDrop.x, lat: part.lastDrop.y }
        : line && line.length >= 2
            ? { name: '현시점 확정콜의 마지막 하차지', lng: line[line.length - 1][0], lat: line[line.length - 1][1] }
            : null;
    /* 그물 입력 한 벌 — 중심점 그물(`netForGoal`)과 걸친 동(`regionsTouchingNetGrouped`)이 같은 입력을 본다 (규칙 ③) */
    const netOpts = {
        line,
        lineRadiusKm: auto ? auto.detourRadiusKm : (f.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM),
        lastDrop,
        params,
        anchor: me ? { name: '내 위치', lng: me.x, lat: me.y } : { name: '내 위치', lng: goal.lng, lat: goal.lat },
        /* 🧩 **현위치 영역은 조각이 넣으라 할 때만** — 콜 없음 · 경로 생김(운행 전)이면 넣고 운행 뒤면 뺀다 (shared `dropoffPartsOf`) */
        me: part.withMe && me ? { name: '내 위치', lng: me.x, lat: me.y } : null,
    };
    const net = netForGoal(goal, netOpts);
    /* 🔴 그물이 아무것도 못 담으면 그것도 «고장»이다 — 물러선다 */
    if (!net.pass.length) return fallback();

    const grouped: Record<string, string[]> = {};
    for (const d of net.pass) {
        const region = d.region ?? '기타 지역';
        (grouped[region] ??= []).push(d.name);
    }
    /**
     * 🔵 **원 · 마름모 가장자리에 걸친 동도 넣는다** — 영역에 걸치면 들어간다.
     *    그물은 동을 중심점 하나로 담아, 넓은 읍 · 면은 가장자리에 걸쳐도 빠진다. 판정은 그물과 같은 `netAreaTesterOf` · 걸침은 상차 목록과 같은 식.
     */
    const edge = regionsTouchingNetGrouped({ goal, ...netOpts });
    for (const [region, names] of Object.entries(edge)) (grouped[region] ??= []).push(...names);
    /**
     * 🧩 **경로 영역은 동 경계가 띠에 걸치면 넣는다.**
     *    그물은 동을 **중심점 하나**로 본다. 목업은 상차지 **좌표**로 재니 괜찮지만 원달앱은 **지역명만** 본다 —
     *    상차지가 띠 안인데 동 중심점이 띠 밖이면 목록에 없어 막힌다.
     *    앱은 넉넉하게 올리고 판정이 가른다(규칙 ⑤) — 띠에 걸친 동을 더한다. 폭은 그물 라인과 같은 값(자동이면 줄인 값).
     */
    const touch = line
        ? getDetourRegions(line.map(([x, y]) => ({ x, y })),
            auto ? auto.detourRadiusKm : (f.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM),
            undefined,
            /* ✂️ 하차 조각이라 현위치 원을 도려낸다 — 그물(`netForGoal`) · 걸친 동(`netAreaTesterOf`)과 같은 규칙.
                  `withMe`(출발 전 현위치 원을 **더하는** 경우)면 빼지 않는다 */
            part.withMe || !me ? undefined : { lng: me.x, lat: me.y, km: Math.max(0, params.srcDiamKm / 2) })
        : null;
    /**
     * 🔴 **띠에 걸친 동을 여기서 또 더하지 않는다** (기사님 지적 — *"연산이 왜 떨어져 3갈래인지부터 봐야 하는 거 아냐?"*).
     *
     * 바로 위 `regionsTouchingNetGrouped`(=`netAreaTesterOf` = 그물과 **같은 판정**)가 이미
     * «격자 점 ∪ 동 꼭짓점»으로 걸침을 본다 — 라인 띠도 그 판정 안에 있다. 여기서 turf 버퍼로 한 번 더
     * 더하면 **같은 질문에 답이 두 벌**이 되고, 한쪽만 고쳐져 어긋난다. `touch` 는 이제 **진행도(`orderKm`)만** 낸다.
     */
    for (const k of Object.keys(grouped)) grouped[k] = [...new Set(grouped[k])].sort();
    /**
     * 📏 **진행도도 같은 그물에서 낸다** — 라인 띠로만 든 동에 붙은
     *    «라인 시작부터 몇 km 지점인가»(`callNet.buildLineNet`). 목록과 진행도가 **한 벌**이라야
     *    다른 계산의 진행도로 새 목록의 동을 지우지 않는다. 같은 이름이 둘이면 먼 쪽.
     */
    const progressKm: Record<string, number> = {};
    for (const d of net.pass) {
        if (d.progressKm == null) continue;
        const prev = progressKm[d.name];
        if (prev === undefined || d.progressKm > prev) progressKm[d.name] = d.progressKm;
    }
    /* 🧩 띠에 걸쳐 더한 동도 경로 위다 — 순서는 그 동의 경로 스냅점(순서 전용 값 · #78)으로 */
    /* 🔴 **그물이 이미 넣은 동에는 안 붙인다** — 목적지·마름모로 든 동은 «아직 안 간 곳»이라 진행도가 없다
          (`callNet.lineZoneOf` 의 `onlyByLine`). 붙이면 지나온 곳 빼기가 아직 안 간 동을 지운다 */
    /* 원 · 마름모로만 걸쳐 든 동도 «아직 안 간 곳»이다 — 띠에 걸친 동(`touch`)만 진행도를 받는다 */
    const bandNames = new Set(touch ? Object.values(touch.grouped).flat() : []);
    const inNet = new Set([...net.pass.map(d => d.name), ...Object.values(edge).flat().filter(n => !bandNames.has(n))]);
    if (touch) for (const [name, km] of Object.entries(touch.orderKm)) {
        if (inNet.has(name) || progressKm[name] !== undefined || !Number.isFinite(km)) continue;
        progressKm[name] = km;
    }
    return { ...prune(grouped, true), progressKm, destRingKm: Math.max(0, params.dstDiamKm / 2), measured, distanceKm };
}


/**
 * 경유를 새로 그렸으면 **진행도도 같이 기억한다.**
 *
 * 🔴 키워드와 진행도는 **같은 입력에서 같이 나온 한 벌**이다. 한쪽만 갱신하면
 *    옛 경로의 진행도로 새 경로의 동을 지우게 된다 — 멀쩡한 지역이 조용히 사라진다.
 *    경유를 만드는 자리마다 이 함수를 부른다.
 */
export function rememberDetourProgress(
    session: ReturnType<typeof getUserSession>,
    regions: { progressKm?: Record<string, number>; flat?: string[] } | null,
) {
    session.detourProgressKm = regions?.progressKm ?? null;
    /**
     * 🛣️ 경로 위 동 목록도 함께 기억한다.
     * ⚠️ **여기에는 경유만 넣는다.** 도착 목표에서 온 동을 섞으면 «경로 위»로 읽혀
     *    뒤로 돌아가 싣는 콜이 통과한다.
     */
    session.detourFlat = regions?.flat ?? null;
}

/**
 * **지나온 구간을 필터에서 뺀다** — 경유를 다시 그리지 않고.
 *
 * 까닭: 이미 지나온 곳으로는 뒤로 안 돌아간다 (기사님).
 *
 * 경유를 만들 때 동마다 기록해 둔 진행도(`detourProgressKm`)와 지금 GPS 의 진행도를
 * 비교하기만 한다 — 경유를 통째로 다시 계산하지 않는다.
 *
 * 안전 쪽으로 기운 규칙 셋. **일찍 빼면 잡을 수 있는 콜을 버린다:**
 *   ① 진행도를 **모르는 동은 남긴다**
 *   ② **전부 빠지면 아무것도 안 한다** — 빈 필터는 "제한 없음"이 아니라 **고장**이다
 *   ③ 동·시 묶음·별칭을 **한 벌로** 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)
 */
export function applyTraveledTrim(session: ReturnType<typeof getUserSession>): boolean {
    /**
     * 🔴 **국면을 보지 않는다.** 지나온 구간은 **국면과 무관하게 참이다** — 이미 지난 동네는
     *    합짐이든 운행중이든 지난 동네다. 국면으로 거르면 도착 감지가 국면을 GATHERING 으로
     *    떨어뜨릴 때 **달리는 중인데 제거가 멈춘다.**
     *
     * 조건은 데이터에 맡긴다: 진행도가 있고(= 경유를 그렸고) · 경로가 있고 · GPS 가 있으면 돈다.
     * 콜이 0건이면 경로가 없으니 자연히 안 돈다.
     */
    const progress = session.detourProgressKm;
    if (!progress) return false;

    /**
     * 🧭 **지금 위치로만 뺀다** — 묵었거나 집 주소로 대신한 위치면 안 뺀다.
     *    부팅 때 되살린 지난 위치로 빼면 새 경로의 앞길까지 «지나왔다»며 지운다.
     */
    const here = originOf(session as Parameters<typeof originOf>[0]);
    const before = session.activeFilter.destinationKeywords ?? [];
    const trim = traveledTrimFrom({
        progress,
        polyline: filterLineOf(session),
        gps: here && !here.isFallback ? here : null,
        keywords: before,
        groups: session.activeFilter.destinationGroups ?? {},
    });
    if (!trim) return false;

    session.activeFilter.destinationKeywords = trim.keywords;
    session.activeFilter.destinationGroups = trim.groups;
    session.activeFilter.customCityFilters = trim.aliases;
    refreshAdminDongs(session);   // 지나간 법정동의 행정동도 걷는다 — 이 길은 refreshKeywordTraps 를 안 지난다

    /* 🔄 뺀 동 이름도 싣는다 — 숫자만 있으면 «곧 내릴 하차지 동이 빠졌나»를 로그로 못 가린다 · 많으면 앞 여섯 + 외 N */
    const gone = trim.gone;
    const goneText = gone.slice(0, 6).join('·') + (gone.length > 6 ? ` 외 ${gone.length - 6}` : '');
    slog('필터', `🔄 [지나온 구간] ${trim.at.toFixed(1)}km 지점 — 동 ${before.length} → ${trim.keywords.length}개 ` +
        `(뺀 ${gone.length}개: ${goneText})`);
    return true;
}

/** 🔄 지나온 동을 뺀 목록 한 벌 — 값만 받는 셈 (진행도 · 얼린 라인 · 지금 GPS · 목록 · 묶음) · 뺄 게 없으면 null */
export function traveledTrimFrom(o: {
    progress: Record<string, number>;
    polyline: Array<{ x: number; y: number }> | null;
    gps: { x: number; y: number } | null;
    keywords: string[];
    groups: Record<string, string[]>;
}): { at: number; keywords: string[]; groups: Record<string, string[]>; aliases: string[]; gone: string[] } | null {
    const { progress, polyline, gps } = o;
    if (!polyline || !gps) return null;

    /* 🛣️ 얼린 라인 위 GPS 진행도 — 그물이 동마다 붙인 진행도와 **같은 셈**(`progressAlongKm`)이다 */
    const at = progressAlongKm({ lng: gps.x, lat: gps.y }, polyline.map(p => [p.x, p.y] as [number, number]));
    if (at === null || at <= 0) return null;

    const before = o.keywords;
    if (before.length === 0) return null;

    // ① 진행도를 모르는 동은 남긴다
    const kept = new Set(before.filter(d => progress[d] === undefined || progress[d] >= at));
    if (kept.size === before.length) return null;   // 뺄 게 없다
    if (kept.size === 0) return null;               // ② 전부 빠진다 — 건드리지 않는다

    // ③ 셋을 한 벌로 줄인다
    const grouped: Record<string, string[]> = {};
    for (const [parent, dongs] of Object.entries(o.groups)) {
        const left = dongs.filter(d => kept.has(d));
        if (left.length > 0) grouped[parent] = left;
    }
    const aliases = new Set<string>();
    for (const parent of Object.keys(grouped)) {
        for (const a of cityAliases(parent)) aliases.add(a);
    }
    return { at, keywords: Array.from(kept).sort(), groups: grouped, aliases: Array.from(aliases), gone: before.filter(d => !kept.has(d)) };
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
export function refreshDetourIfNeeded(
    session: ReturnType<typeof getUserSession>,
    userId: string,
    before: { detourRadiusKm?: number, destinationRadiusKm?: number, excludedRegions?: string[] },
) {
    if (!session.activeFilter.isSharedMode) return;
    const cRadius = session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
    const dRadius = session.activeFilter.destinationRadiusKm ?? 10;
    /**
     * 🚫 **제외 지역이 바뀌어도 다시 그린다.**
     *    반경만 보면 합짐 국면에서 «제외했는데 경로 주변 목록은 그대로»가 된다 —
     *    첫짐에선 빠지는데 합짐에선 들어오는, 국면마다 다른 말을 하는 모양이다.
     */
    const exBefore = JSON.stringify(before.excludedRegions ?? []);
    const exNow = JSON.stringify(session.activeFilter.excludedRegions ?? []);
    if (cRadius === before.detourRadiusKm && dRadius === before.destinationRadiusKm && exBefore === exNow) return;

    /**
     * 🕸️ **합짐도 그물 한 곳이 만든다** — 경로 버퍼(`recalculateDetourFilter`)를 부르지 않는다.
     *    목록 · 묶음 · 별칭 · 진행도가 **한 벌**로 나온다. 라인은 KEEP 순간 얼린 경로다(`filterLineOf`).
     */
    const kept = netFilterOf(session, userId);
    if (!kept?.line) return;   // 경로가 아직 없다 — 없는 값을 지어내지 않는다
    rememberDetourProgress(session, progressOf(kept.progressKm));
    session.activeFilter.destinationKeywords = kept.flat;
    session.activeFilter.destinationGroups = kept.grouped;
    session.activeFilter.customCityFilters = kept.aliases;
    slog('필터', `🛣️ [경유 갱신] 라인 ${cRadius}km · 하차 ${dRadius}km → `
        + `${kept.byNet ? '그물' : '도시 둘레(물러섬)'} 지역 ${kept.flat.length}개`
        + (kept.pruned > 0 ? ` (제외로 ${kept.pruned}개 뺌)` : ''));
}

/**
 * 🛣️ **필터가 쓰는 라인 — KEEP 순간 얼린 경로.**
 *
 * 경로가 다시 재져도(하차 완료·취소·재탐색) 필터 라인은 안 바뀐다 — 기사는 어찌 되었건 그 목적지로 간다 (기사님).
 * ⚠️ 얼린 값이 없으면(서버가 막 켜짐) **지금 경로**를 쓴다 — 메모리라 재시작하면 비어 있다.
 * 콜이 0건이면 라인이 없다.
 */
export function filterLineOf(session: ReturnType<typeof getUserSession>): Array<{ x: number; y: number }> | null {
    if (getActiveCalls(session).length === 0) return null;
    const line = session.filterLine ?? getActivePolyline(session);
    return line && line.length >= 2 ? line : null;
}

/** 진행도 한 벌 → 세션이 기억하는 두 칸 (트림용 · 경로 위 목록). 둘이 같은 값에서 나온다 */
export function progressOf(progressKm: Record<string, number>) {
    return { progressKm, flat: Object.keys(progressKm) };
}

/**
 * 🕸️ **지금 필터 목록 한 벌** — 목록을 만드는 모든 때(부팅 · 콜 0건 · KEEP · 경로 재계산 · 반경 변경)가 여기를 지난다.
 * 목적지를 모르면 `null`.
 */
export function netFilterOf(session: ReturnType<typeof getUserSession>, userId: string) {
    const line = filterLineOf(session);
    const kept = netOfGoals(session, userId, line ? line.map(p => [p.x, p.y] as [number, number]) : null);
    if (!kept.goals.length) return null;
    /* 🔴 별칭은 목록에 든 시 전부에서 — 목적지 시 하나만 실으면 앱의 «시 + 동» 2단계가 경로 위 다른 시를 막는다 */
    const aliases = new Set<string>();
    for (const parent of Object.keys(kept.grouped)) for (const a of cityAliases(parent)) aliases.add(a);
    return { ...kept, aliases: [...aliases], line };
}

/**
 * 🔵 **하차 목록 — 살아 있는 목적지마다 조각을 만들어 합친다**.
 *
 * 목적지 상태 · 가까이 옴은 `goalZonesNow`(상차 목록과 같은 값), 조각은 shared `dropoffPartsOf`,
 * 확정콜의 마지막 하차지는 경로 순서(`planArrivalStops` — 관제웹 `routeStops` 와 같은 순서)에서 그 목적지 콜의 마지막 하차지(`lastDropOf`),
 * 라인은 얼린 경로를 거기까지 자른 것(`lineUntil`). 합치기는 `mergeDropoffGroups`.
 * 🔴 필터는 상차 목록 · 하차 목록 두 모음뿐이다 — 겹치는 지역은 방향과 무관하게 둘 다 든다 · 하차에서 상차를 빼지 않는다.
 * 관내는 따로 재지 않는다 — 가까이 옴이 갈랐다.
 */
export function netOfGoals(session: ReturnType<typeof getUserSession>, userId: string, line: Array<[number, number]> | null) {
    const origin = originOf(session as Parameters<typeof originOf>[0]);
    const out = netOfGoalsFrom({
        filter: session.activeFilter,
        origin,
        goals: goalZonesNow(session, userId, origin),
        activeCalls: getActiveCalls(session),
        line,
    });
    /* 📏 그물이 잰 거리를 싣는다 — 목적지마다 재도 들고 있는 거리를 이어 쓰므로 마지막 값 하나다 */
    if (out.measured) session.activeFilter.radiusDistanceKm = out.distanceKm;
    return out;
}

/** 🔵 하차 목록 — 값만 받는 셈 (필터 · 지금 기점 · 살아 있는 목적지 · 쥔 콜 · 얼린 라인) */
export function netOfGoalsFrom(o: {
    filter: Filter;
    origin: { x: number; y: number } | null;
    goals: ReturnType<typeof goalZonesNow>;
    activeCalls: Session['myOrders'];
    line: Array<[number, number]> | null;
}) {
    const { origin, activeCalls, line } = o;
    const { zones, homeOn, homeCity, departed } = o.goals;
    /* 📏 잰 거리는 목적지마다 이어 쓴다 — 앞 목적지에서 잰 값을 다음 목적지가 들고 있는 거리로 본다 */
    let f = o.filter;
    let measured = false;
    let distanceKm: number | undefined;
    const stops = activeCalls.length ? planArrivalStops(activeCalls, origin) : [];
    /* 🔷 **동선이면 경로를 안 본다 — 정하는 곳은 여기 하나다** · 조각(`dropoffPartsOf`)과 그물(`netKeywordsFrom`)이 이 값을 받는다.
          지도(`useStageAreas` 의 `dropoffLine` · `pickupLine`)와 같은 분기 · 서버가 이 값을 안 보면 «동선»을 골라도 판정·앱 목록은 노선이 된다 */
    const lineXY = !line || f.routeMode === false ? null : line.map(([x, y]) => ({ x, y }));
    const radius = f.destinationRadiusKm || 0;
    const parts: Array<{ nearGoal: boolean; grouped: Record<string, string[]>; progressKm: Record<string, number> }> = [];
    /** 🔎 목적지마다 무엇으로 만들었나 — 로그 한 줄로 확인할 수 있게 (`rebuildNetFilter` 가 찍는다) */
    const details: string[] = [];
    let byNet = zones.length > 0, pruned = 0;
    for (const z of zones) {
        /* 🔴 마름모 시작점은 «그 목적지의 마지막 하차지를 아는가»로 정한다 — 「가까이 옴」은 여기 안 든다 */
        const lastDrop = !z.hasCalls ? null
            : lastDropOf({ isHome: z.isHome, homeOn, homeCity, stops, calls: activeCalls });
        /**
         * ✂️ **운행 뒤에는 라인을 현위치부터 쓴다** — 관제웹 지도(`useStageAreas` 하차 띠)와 **같은 `lineFromPoint`**.
         *
         * 🔴 얼린 경로 그대로 쓰면 띠의 시작이 **콜을 잡던 자리**다. 띠 끝을 직각으로 잘라도(`lineZoneOf`)
         *    그 자름은 거기에 그어지므로, 지금 내 뒤에 있는 동이 여전히 «앞»으로 남는다 (#159).
         */
        const ridden = lineXY && departed && origin
            ? lineFromPoint(lineXY.map(p => [p.x, p.y] as [number, number]), { lng: origin.x, lat: origin.y }).map(([x, y]) => ({ x, y }))
            : lineXY;
        const goalLine = ridden && lastDrop ? lineUntil(ridden, lastDrop) : [];
        const shape = dropoffPartsOf(goalLine.length >= 2);
        const kept = netKeywordsFrom(f, z.city, radius, {
            line: shape.line ? goalLine.map(p => [p.x, p.y] as [number, number]) : null,
            lastDrop: shape.quadFrom === 'lastDrop' ? lastDrop : null,
            withMe: false,   // 🔴 현위치 원은 하차 조각에 안 넣는다 (shared `dropoffPartsOf` 머리)
            nearGoal: !!z.nearGoal,
        }, origin);
        if (kept.measured) {
            measured = true;
            distanceKm = kept.distanceKm;
            f = { ...f, radiusDistanceKm: kept.distanceKm };
        }
        parts.push({ nearGoal: !!z.nearGoal, grouped: kept.grouped, progressKm: kept.progressKm });
        const names = [...new Set(Object.values(kept.grouped).flat())];
        /* 🔎 켜진 조각을 그대로 적는다 — 조합을 이름 하나로 뭉치지 않는다 */
        const pieces = [
            shape.line && '라인',
            shape.quadFrom === 'lastDrop' ? '마름모(확정콜의 마지막 하차지)' : '마름모(현위치)',
            z.nearGoal ? '원(가까이 옴 · 상차 동 안 뺌)' : '원',
        ].filter(Boolean);
        details.push(`${z.city}:${goalStateLabel(z.hasCalls, departed)}${z.nearGoal ? '·가까이' : ''}${z.hasCalls && !lastDrop ? '·확정콜의 마지막 하차지 모름' : ''} `
            + `[${pieces.join('·')}] 걸친 ${names.length}곳${kept.byNet ? '' : ' (도시 둘레로 물러섬)'}`);
        byNet = byNet && kept.byNet;
        pruned += kept.pruned;
    }
    const merged = mergeDropoffGroups(parts);
    return { flat: merged.flat, grouped: merged.grouped, byNet, pruned, progressKm: merged.progressKm, goals: zones.map(z => z.city), details, measured, distanceKm };
}

/**
 * 🗺️ **키워드 트랩 — 한 곳.**
 *    "남동"→"인천 남동구" 같은 부분 문자열 오탐을 막는다. 원천은 전국 지명 사전(geoService)이고, 앱·서버 매칭(anyRegionHit)이 이 트랩으로 거른다.
 *    📋 **상차 목록 ∪ 하차 목록으로 한 벌** — 막는 낱말이 늘 뿐이라 통과를 넓히지 않는다.
 *    🔴 목록을 바꾸는 두 길(`updateActiveFilter` · `rebuildPickupList`)이 **이 함수 하나**를 부른다 — 계산이 두 벌이면 한쪽 목록을 빠뜨린다.
 */
export function refreshKeywordTraps(session: ReturnType<typeof getUserSession>): void {
    refreshAdminDongs(session);
    const f = session.activeFilter;
    f.keywordTraps = trapsForKeywords([...new Set([...(f.destinationKeywords ?? []), ...(f.pickupKeywords ?? [])])]);
    refreshDongSigungu(session);
}

/**
 * 🗺️ **도착 목록에 행정동을 함께 싣는다** (기사님 «가» · onedal-69 · f5) — 판단은 shared `withAdminDongs` 한 곳.
 *    픽커 화면의 행정동 하차(위례동 · 역삼1동 · 처인구 중앙동)가 목적지 안인데 «경유 이탈»로 떨어졌다. 관할 법정동이 묶음에 있는 행정동만 더하고,
 *    법정동이 빠지면 걷는다(되풀이해도 같다). 원달앱은 이 목록을 그대로 받아 맞춘다(원달앱 코드 무변화).
 *    🔴 목록을 바꾸는 길 셋 중 둘은 refreshKeywordTraps 를 지나고, 지나온 구간 빼기(applyTraveledTrim)는 끝에서 이것을 직접 부른다.
 */
function refreshAdminDongs(session: ReturnType<typeof getUserSession>): void {
    const f = session.activeFilter;
    const next = adminDongsFrom(f.destinationGroups ?? {}, f.destinationKeywords ?? []);
    if (!next) return;
    f.destinationGroups = next.groups;
    f.destinationKeywords = next.keywords;
}

/** 🗺️ 행정동을 더하고 빠진 법정동의 행정동을 걷은 목록 — 값만 받는 셈 · 바뀐 게 없으면 null */
export function adminDongsFrom(before: Record<string, string[]>, keywords: string[]): { groups: Record<string, string[]>; keywords: string[] } | null {
    const grouped = withAdminDongs(before);
    const had = new Set(Object.values(before).flat()), now = new Set(Object.values(grouped).flat());
    const removed = new Set([...had].filter(d => !now.has(d)));
    const added = [...now].filter(d => !had.has(d));
    if (!removed.size && !added.length) return null;
    return { groups: grouped, keywords: [...new Set([...keywords.filter(k => !removed.has(k)), ...added])].sort() };
}

/**
 * 🏘️ **이름이 같은 다른 지역 동 — 오늘 도착 목록이 뜻하는 시군구를 붙인다** (평택 고덕동 실사고 · 기사님 «가»).
 *    도착 목록 가운데 명부에서 이름이 둘 이상 시군구에 있는 동(SAME_NAME_DONGS)만 → 값은 그 동이 든 묶음 부모(시·구)를 cityAliases 로 편 꼴.
 *    앱 RegionMatch · 서버 anyRegionHit 가 «앞에 다른 시·군·구가 보이면 거름 · 목록 페이지에서 상세 주소가 안 보이면 통과»로 쓴다.
 *    🔴 트랩과 같은 자리 하나에서 파생 — 목록을 바꾸는 두 길이 refreshKeywordTraps 를 부른다. 도착 목록 **전체**에서 만든다
 *       부모를 못 찾은 동은 싣지 않는다(= 지금처럼 통과).
 *    상차 목록은 이번 범위 밖(기사님 «가»는 하차지).
 */
function refreshDongSigungu(session: ReturnType<typeof getUserSession>): void {
    const f = session.activeFilter;
    f.destinationDongSigungu = dongSigunguFrom(f.destinationKeywords ?? [], f.destinationGroups ?? {});
}

/** 🏘️ 이름이 같은 다른 지역 동 → 그 동이 뜻하는 시군구 꼴 — 값만 받는 셈 */
export function dongSigunguFrom(keywords: string[], groups: Record<string, string[]>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const dong of keywords) {
        if (!SAME_NAME_DONGS.has(dong) && !ADMIN_SAME_NAME_DONGS.has(dong)) continue;   // 행정동 겹침 이름(위례동 = 수정구 · 송파구)도
        const forms = new Set<string>();
        for (const [parent, dongs] of Object.entries(groups)) {
            if (!dongs.includes(dong)) continue;
            for (const a of cityAliases(parent)) forms.add(a);
            /* 구가 있는 시(«성남시 분당구»)는 구를 건너뛴 «시 + 동» 주소(«경기 성남시 정자동»)도 받는다 — 시 꼴도 싣는다 (04) */
            const city = parent.split(' ')[0];
            if (parent.includes(' ') && /시$/.test(city)) for (const a of cityAliases(city)) forms.add(a);
        }
        if (forms.size) out[dong] = [...forms];
    }
    return out;
}

/**
 * 📋 **상차 목록을 만든다**.
 *
 * 목적지 상태는 shared `goalZonesOf`, 계산은 `geoService.pickupListFor` 한 곳 — 여기서는 세션 값을 넘기기만 한다.
 * 관제웹 «상차» 레이어가 **같은 `goalZonesOf`** 로 그린다 (규칙 ③).
 * 반경은 앱·지도·그물이 쓰는 그 함수(`effectiveRadii`)에서 — 자동이면 줄인 값. «복귀콜을 잡았나»는 `homeCallsOf` 한 곳.
 * @returns 목록이 바뀌었나 (부르는 쪽이 관제웹에 알릴지 정한다)
 */
/**
 * 📅 **내일 콜 상차 목록** (기사님 «내일콜 가») — 집 둘레 기본 상차 반경 안의 동.
 *    서버 판정이 내일 콜을 재는 그 두 값(집 `homeOriginOf` · 기본 반경 `reservedPickupRadiusKmOf`)으로 오늘 상차 목록과 같은 함수를 부른다.
 *    원달앱은 집까지 거리를 모르니 이 목록으로 내일 이후 예약 콜의 상차지를 거른다(앱 필터 reservedPickupKeywords · reservedPickupGroups).
 *    집 · 반경 · 지도가 바뀔 때만 다시 센다 — 영업일 · 자동 반경 · 차 위치와 무관하다. 집이나 기본 반경이 없으면 null(칸을 안 싣는다).
 *    관제앱 공급(state/phoneSupply)이 1초마다 불러도 계산 · 로그가 늘지 않는다 — 0곳도 열쇠와 함께 붙잡는다.
 */
export function ensureReservedPickupList(session: ReturnType<typeof getUserSession>, userId: string): { keywords: string[]; groups: Record<string, string[]> } | null {
    const home = homeOriginOf(userId);
    const radiusKm = reservedPickupRadiusKmOf(session.baseFilter);
    if (!home || radiusKm == null) { session.reservedPickup = null; return null; }
    const key = `${home.x.toFixed(5)},${home.y.toFixed(5)}|${radiusKm}|${mapFeatureCount()}`;
    if (session.reservedPickup?.key === key) return session.reservedPickup.keywords.length > 0 ? session.reservedPickup : null;
    const { list, grouped } = pickupListFor({
        me: { x: home.x, y: home.y },
        radii: { pickupRadiusKm: radiusKm, detourRadiusKm: 0 },
        line: null,
        parts: { line: false, goalCities: [] },
    });
    /* 🔴 빈 목록은 싣지 않는다 — 앱은 빈 목록을 «내일 콜 전부 탈락»으로 읽는다. 붙잡기는 한다 — 열쇠에 지도 지역 수가 들어 지도 자료가 올라오면 열쇠가 바뀌어 다시 센다 */
    if (list.length === 0) {
        session.reservedPickup = { key, keywords: [], groups: {} };
        slog('필터', `📋 [내일 상차 목록] 집 · 반경 ${radiusKm}km → 0곳 — 싣지 않는다(집 · 반경 · 지도가 바뀌면 다시 센다)`);
        return null;
    }
    session.reservedPickup = { key, keywords: list, groups: grouped };
    slog('필터', `📋 [내일 상차 목록] 집 ${SettingsRepository.getHomeLocation(userId)?.address ?? '?'} · 반경 ${radiusKm}km → ${list.length}곳`);
    return session.reservedPickup;
}

export function rebuildPickupList(session: ReturnType<typeof getUserSession>, userId: string): boolean {
    const me = originOf(session as Parameters<typeof originOf>[0]);
    if (!me) return false;
    const f = session.activeFilter;
    /* 📏 반경을 먼저 잰다 — 재시작 직후엔 «잰 거리»가 비어 있어, 안 재면 자동 반경이 원값으로 목록을 만든다 (#149). 하차 목록과 같은 첫 목적지 */
    const firstGoal = goalZonesNow(session, userId, null).zones[0]?.city;
    if (firstGoal) holdRadiusDistance(session, firstGoal, me);
    const eff = effectiveRadii(f);
    const line = f.routeMode === false ? null : filterLineOf(session);
    const { zones, homeOn, homeCity, homeCaught, departed } = goalZonesNow(session, userId, me);
    /* 🟢 조각이 **사실**을 직접 본다 — 목적지 목록을 뒤져 «내가 달리나»를 묻지 않는다 */
    const parts = pickupPartsOf({
        departed,
        hasLine: !!line && line.length >= 2,
        nearGoalCities: nearGoalCitiesOf(zones),
    });
    /* 🔴 **목적지를 모르면 빈 목록이다** — «제한 없음»이 아니라 «고장»이다 (규칙 ④ · `callFilterBlocker` 가 막는다).
          목적지 개수는 조각이 볼 사실이 아니므로 여기서 가른다 */
    const { list, grouped } = zones.length === 0
        ? { list: [] as string[], grouped: {} as Record<string, string[]> }
        : pickupListFor({ me: { x: me.x, y: me.y }, radii: eff, line, parts });
    const prev = f.pickupKeywords;
    const prevArea = pickupAreaKey(f.pickupArea);
    session.pickupListAt = { x: me.x, y: me.y, at: Date.now() };   // ⏱️ 언제 만들었나 — 최소 간격이 읽는다
    f.pickupKeywords = list;
    f.pickupGroups = grouped;
    /* 🗺️ 관제웹 «상차» · «하차» 레이어가 **같은 `goalZonesOf`** 를 부를 재료를 싣는다 (집 · 복귀 · 복귀콜 쥠) */
    f.pickupArea = { at: { x: me.x, y: me.y }, homeCity, homeOn, homeCaught, hasLine: !!line && line.length >= 2 };
    refreshKeywordTraps(session);
    /* 🔴 목록이 그대로여도 **지도 재료가 바뀌면** 알린다 — 안 그러면 복귀를 꺼도 지도가 옛 «복귀 켬»으로 그린다 (#146) */
    /* 🎯 목적지마다 가까이 옴이 바뀌어도 알린다 — 하차 목록이 가까이 온 목적지는 원 전체 · 먼 목적지는 빼기로 달라진다 */
    const nearGoalKey = zones.map(z => `${z.city}:${z.nearGoal ? 1 : 0}`).join('|');
    const nearChanged = session.pickupNearKey !== nearGoalKey;
    session.pickupNearKey = nearGoalKey;
    const changed = !prev || prev.join(',') !== list.join(',') || prevArea !== pickupAreaKey(f.pickupArea) || nearChanged;
    /* 🔎 켜진 조각을 그대로 적는다 — 조합을 이름 하나로 뭉치면 새 조합이 «없음»으로 찍힌다 */
    const shown = ['내 위치', parts.line && '라인(현위치부터)', parts.goalCities.length ? `목적지 원(${parts.goalCities.join('·')})` : '']
        .filter(Boolean).join(' ∩ ');
    if (changed) slog('필터', `📋 [상차 목록] ${zones.map(z => `${z.city}:${goalStateLabel(z.hasCalls, departed)}${z.nearGoal ? '·가까이' : ''}`).join(' · ') || '목적지 없음'} → `
        + `${shown} · 내 위치 ${eff.pickupRadiusKm.toFixed(1)}km${me.isFallback ? '(집 주소로 대신)' : ''} → ${list.length}곳`);
    return changed;
}

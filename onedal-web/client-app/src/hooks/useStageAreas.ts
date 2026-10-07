import { useMemo } from 'react';
import type { AutoDispatchFilter, SecuredOrder, RouteStopInfo, GoalZone } from '@onedal/shared';
import { effectiveRadii, isEvaluating, lineFromPoint, withNearness, pickupPartsOf, nearGoalCitiesOf,
    dropoffPartsOf, lastDropOf, lineUntil, dongDotsOf, quadShapeFrom, quadOutline, cityCenter, haversineKm } from '@onedal/shared';

/**
 * 🗺️ **무대 지도의 상차 영역 · 하차 영역 · 동 점** — 무대(`StageView`)가 지도(`PinnedRouteCanvas`)에 넘기는 값.
 * 이 파일은 위(`StageView`)를 가져오지 않는다 — 방향: StageView → useStageAreas → shared.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 필터 · 콜 · 내 위치 · 경로 선은 부르는 쪽이 읽어 넘긴다.
 */
export function useStageAreas(
    filter: AutoDispatchFilter | null,
    liveRoute: SecuredOrder[],
    routeStops: RouteStopInfo[],
    myLocation: { x: number; y: number } | null,
    routeMode: boolean,
    derived: { drawHolder?: { routePolyline?: Array<{ x: number; y: number }> } | null },
) {
    /**
     * 📐 **반경 · 마름모 모양은 기사님이 필터에서 고친 값이다.**
     *
     * 🔴 **곱하는 자리를 만들지 않는다** — 자동 반경이면 «줄인 값»으로 그리고, 그 답은 `shared` 의
     *    `effectiveRadii` 하나다. 필터 화면도 같은 함수를 부른다 — 곱셈이 두 곳이면
     *    «서버는 줄였는데 지도는 원값»이 된다 (규칙 ③).
     * 🔴 마름모 모양은 **국면 그릇을 안 본다** — 국면과 무관한 **한 벌**이라 평면 필터에 실려 온다
     *    (DB 자리는 `user_filters`). 국면 행마다 두면 손 안 댄 행에 옛 값이 남는다.
     */
    const radii = effectiveRadii(filter);

    /**
     * 🟢 **상차 영역 — 살아 있는 목적지마다 상태로 정한다**.
     *
     * 🔴 모양은 shared `goalZonesOf` → `pickupShapeOf` 한 곳 — 하나라도 운행 뒤가 아니면 **현위치 영역 전체**,
     *    전부 운행 뒤면 **현위치 영역 ∩ 라인 영역**. 하차 레이어도 같은 `goalZonesOf` 를 쓴다.
     * 🔴 서버 상차 목록(`filterManager.rebuildPickupList`)도 **같은 `goalZonesOf`** 로 동을 찾는다 (규칙 ③).
     * 재료: 집 · 복귀 · 복귀콜 쥠은 서버가 싣는다(`filter.pickupArea`) · 실린 콜은 `liveRoute` 중 **판정 중 후보콜을 뺀 것** ·
     *    운행 시작은 서버 국면(`DELIVERING`) · 반지름·띠 폭은 서버와 같은 `effectiveRadii`.
     * 📍 **원의 중심은 실시간 내 위치**(`myLocation`)다 — 서버가 목록을 만든 자리(`pickupArea.at`)는
     *    0.5km 움직여 목록이 바뀔 때만 와서 원이 뒤처진다.
     *    ⚠️ 그래서 서버가 목록을 다시 만들기 전까지 지도 원과 원달앱 목록은 0.5km 남짓 어긋날 수 있다.
     * ⚠️ 라인 띠는 **지금 그리는 경로 선**으로 잰다 — 서버의 얼린 경로와 심사 중 잠깐 다를 수 있다.
     */
    /* 🔴 판정 중 후보콜은 안 센다 — 서버 `getActiveCalls` 는 확정 콜만 본다. 세면 지도만 «경로 생김»이 되고 후보콜 하차지를 확정콜의 마지막 하차지로 잡는다 */
    const confirmedCalls = useMemo(() => liveRoute.filter(o => !isEvaluating(o.status)), [liveRoute]);
    const pickupAreaIn = filter?.pickupArea;
    const homeOn = pickupAreaIn?.homeOn ?? false;
    const homeCity = pickupAreaIn?.homeCity ?? null;
    /* 🔴 «출발했나»는 목적지마다가 아니라 **하나**다 — 조각이 이 값을 직접 본다 */
    const departed = filter?.dispatchPhase === 'DELIVERING';
    /**
     * 🎯 **목적지 목록은 서버가 정한 것을 받는다** — 여기서 다시 계산하지 않는다 (규칙 ③).
     *
     * 목적지는 «필터값 ∪ 진행 중인 마지막 확정 콜의 목표값»인데, **KEEP 차례는 관제웹이 모른다** —
     * 서버가 보내는 콜 목록은 캐시와 장부를 합친 것이라 KEEP 차례가 아니다. 서버가 낸 `goalCities`
     * (shared `goalZonesOf`)를 그대로 쓴다. 나머지 두 칸은 여기서 채워도 서버와 같은 값이다.
     */
    const zonesKeyIn = (filter?.goalCities ?? []).join('|');
    const zones: GoalZone[] = useMemo(() => (zonesKeyIn ? zonesKeyIn.split('|') : []).map(city => ({
        city,
        isHome: !!homeCity && city === homeCity,
        hasCalls: confirmedCalls.some(c => c.goalCity === city),
    })), [zonesKeyIn, homeCity, confirmedCalls]);
    /**
     * 🎯 **목적지 가까이 옴 — 현위치가 그 목적지 영역 안인가** (shared `isNearGoal`).
     *    목적지 반경 하나로만 잰다. 켜지면 **더하기만 한다** — 상차에 목적지 원을 더하고, 하차에서 상차 동을 안 뺀다.
     *    서버 `rebuildPickupList` 와 **같은 `withNearness`** 다. 마름모 계산이 무거워 내 위치를 ~300m 눈금으로 굳힌다.
     */
    const quadShape = quadShapeFrom(filter as unknown as Record<string, unknown>);
    const meGridX = myLocation ? Math.round(myLocation.x * 300) / 300 : null;
    const meGridY = myLocation ? Math.round(myLocation.y * 300) / 300 : null;
    const zonesKey = JSON.stringify(zones);
    const nearZones = useMemo(() => {
        const base = JSON.parse(zonesKey) as typeof zones;
        if (meGridX == null || meGridY == null) return base;   // 내 위치를 모르면 «멀다»로 둔다
        return withNearness(base, { me: { x: meGridX, y: meGridY }, destinationRadiusKm: radii.destinationRadiusKm });
    }, [zonesKey, meGridX, meGridY, radii.destinationRadiusKm]);
    const nearGoalKey = JSON.stringify(nearZones);

    /**
     * 🔵 **하차 영역 — 살아 있는 목적지마다 조각을 모은다**.
     *
     * 조각은 shared `dropoffPartsOf` — 그 목적지까지 자른 라인이 있으면 «라인 ∪ Q(마지막 하차지→목적지) ∪ 목적지 원»,
     *    없으면 «Q(현위치→목적지) ∪ 목적지 원». 목적지가 집이어도 같다. 🔴 현위치 원은 안 넣는다.
     * 확정콜의 마지막 하차지는 경로 순서(`routeStops`)에서 그 목적지 콜의 마지막 하차지(`lastDropOf`) · 라인은 지금 그리는 경로 선을 거기까지 자른 것(`lineUntil`).
     * 🔴 서버 하차 목록(`filterManager.netOfGoals`)도 같은 규칙이다 — 다만 원달앱은 상차 목록 동을 **동 목록**으로 빼고 지도는 **도형**으로 지워,
     *    경계에 걸친 큰 읍·면에서 조금 다를 수 있다 (알고 둔 차이).
     * 📐 마름모는 계산이 무거워 내 위치를 ~300m 눈금으로 굳혀 다시 만든다 — 원 중심은 실시간 위치다.
     */
    const dropoffLine = routeMode ? derived.drawHolder?.routePolyline ?? null : null;
    const dropoffParts = useMemo(() => {
        if (meGridX == null || meGridY == null) return null;
        const params = {
            srcAngleDeg: quadShape.srcAngleDeg, dstAngleDeg: quadShape.dstAngleDeg, quadRadiusKm: radii.quadRadiusKm,
            srcDiamKm: radii.pickupRadiusKm * 2, dstDiamKm: radii.destinationRadiusKm * 2,
        };
        const meGrid = { name: '내 위치', lng: meGridX, lat: meGridY };
        return (JSON.parse(nearGoalKey) as typeof zones).flatMap(z => {
            let center: { lng: number; lat: number };
            try { center = cityCenter(z.city); } catch { return []; }   // 지도에 없는 시 — 그 목적지는 모른다
            if (!Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return [];
            /* 🔴 마름모 시작점은 «그 목적지의 마지막 하차지를 아는가»로 정한다 — 「가까이 옴」은 여기 안 든다 */
            const lastDrop = !z.hasCalls ? null
                : lastDropOf({ isHome: z.isHome, homeOn, homeCity, stops: routeStops, calls: confirmedCalls });
            const line = dropoffLine && lastDrop ? lineUntil(dropoffLine, lastDrop) : [];
            const parts = dropoffPartsOf(line.length >= 2);
            /* 🔴 확정콜의 마지막 하차지를 모르면 그 마름모는 안 그린다 — 앞 정거장으로 대신하지 않는다 (규칙 ④) */
            const from = parts.quadFrom === 'me' ? meGrid
                : parts.quadFrom === 'lastDrop' && lastDrop ? { name: '확정콜의 마지막 하차지', lng: lastDrop.x, lat: lastDrop.y } : null;
            const quad = from && haversineKm(from, center) >= 1
                ? quadOutline(params, from, { name: z.city, lng: center.lng, lat: center.lat }).map(q => ({ x: q.lng, y: q.lat }))
                : null;
            return [{ center: { x: center.lng, y: center.lat }, nearGoal: !!z.nearGoal, line: parts.line ? line : null, quad }];
        });
    }, [nearGoalKey, meGridX, meGridY, dropoffLine, routeStops, confirmedCalls, homeOn, homeCity,
        quadShape.srcAngleDeg, quadShape.dstAngleDeg, radii.quadRadiusKm, radii.pickupRadiusKm, radii.destinationRadiusKm]);
    const dropoffDeparted = filter?.dispatchPhase === 'DELIVERING';
    const dropoffArea = useMemo(() => {
        /* 🔴 내 위치를 모르면 그리지 않는다 (규칙 ④) */
        if (!myLocation || !dropoffParts) return null;
        return {
            /* 먼 목적지 조각 — 캔버스가 여기서 상차 영역을 지운다 (원달앱은 상차 목록 동을 뺀다) */
            circles: dropoffParts.filter(p => !p.nearGoal).map(p => ({ ...p.center, km: radii.destinationRadiusKm })),
            /* 🎯 가까이 온 목적지 원 — 지운 뒤에 칠한다 (빼지 않는다) */
            nearCircles: dropoffParts.filter(p => p.nearGoal).map(p => ({ ...p.center, km: radii.destinationRadiusKm })),
            quads: dropoffParts.flatMap(p => (p.quad ? [p.quad] : [])),
            /* 🎯 살아 있는 목적지 — 마커 */
            goals: dropoffParts.map(p => p.center),
            /* ✂️ 운행 뒤에는 현위치부터 앞으로만 긋는다 — 시작은 캔버스가 평평하게 자른다 (상차 띠와 같은 `lineFromPoint`) */
            lines: dropoffParts.flatMap(p => {
                if (!p.line) return [];
                const points = dropoffDeparted
                    ? lineFromPoint(p.line.map(q => [q.x, q.y] as [number, number]), { lng: myLocation.x, lat: myLocation.y }).map(([x, y]) => ({ x, y }))
                    : p.line;
                return points.length >= 2 ? [{ points, km: radii.detourRadiusKm }] : [];
            }),
        };
    }, [myLocation, dropoffParts, dropoffDeparted, radii.destinationRadiusKm, radii.detourRadiusKm]);

    /* 🟢 상차 영역 도형 — 위 «상차 영역» 주석. ⚠️ 하차 계산 **뒤에** 둔다: 앞에 두면 하차 계산이 같은 재료(`liveRoute` · 경로 선)를
          함수에 넘기는 것을 React 컴파일러가 «메모 뒤의 변경»으로 보고 이 메모를 포기한다 (lint:gate) */
    /* 🔷 동선이면 띠가 없다 — 서버 `rebuildPickupList` 도 `routeMode === false` 면 라인을 안 넘긴다 */
    const drawLine = routeMode ? derived.drawHolder?.routePolyline ?? null : null;
    /* 🟢 조각이 **사실**을 직접 본다 — 서버 `rebuildPickupList` 와 같은 `pickupPartsOf` */
    const pickupParts = useMemo(
        () => pickupPartsOf({ departed, hasLine: !!drawLine && drawLine.length >= 2, nearGoalCities: nearGoalCitiesOf(nearZones) }),
        [departed, drawLine, nearZones]);
    const pickupLine = pickupParts.line ? drawLine : null;
    const pickupArea = useMemo(() => {
        /* 🔴 내 위치를 모르면 원을 지어내지 않는다 — 안 그린다 (규칙 ④) */
        if (!myLocation || nearZones.length === 0) return null;
        /* ✂️ 띠는 현위치부터 앞으로만 — 지나온 길은 상차 영역이 아니다 (서버 `pickupListFor` 와 같은 `lineFromPoint`) */
        const ahead = pickupLine && pickupLine.length >= 2
            ? lineFromPoint(pickupLine.map(p => [p.x, p.y] as [number, number]), { lng: myLocation.x, lat: myLocation.y }).map(([x, y]) => ({ x, y }))
            : [];
        /* 🎯 가까이 온 목적지들의 원 — **더한 것**(∪) 안이어야 한다. 지도에 없는 시는 뺀다 (지어내지 않는다 · 규칙 ④) */
        const goals: Array<{ at: { x: number; y: number }; km: number }> = [];
        for (const city of pickupParts.goalCities) {
            try {
                const c = cityCenter(city);
                if (Number.isFinite(c.lng) && Number.isFinite(c.lat)) goals.push({ at: { x: c.lng, y: c.lat }, km: radii.destinationRadiusKm });
            } catch { /* 지도에 없는 시 */ }
        }
        return {
            me: myLocation, meKm: radii.pickupRadiusKm,
            goals,
            /* 🔴 띠가 없으면(동선 · 경로를 모름) 원 전체 — 서버 `pickupListFor` 가 그렇게 목록을 만든다. 안 그리면 하차에서도 안 지워진다 */
            line: ahead.length >= 2 ? ahead : null,
            lineKm: radii.detourRadiusKm,
        };
    }, [myLocation, pickupParts, pickupLine, nearZones, radii.pickupRadiusKm, radii.detourRadiusKm, radii.destinationRadiusKm]);

    /* 📍 동 점 — 원달앱에 실제로 내려간 상차 목록 · 하차 목록 (shared `dongDotsOf`). 지도가 따로 계산하지 않는다 */
    const dongDots = useMemo(() => (filter
        ? dongDotsOf({ pickupGroups: filter.pickupGroups ?? {}, dropoffGroups: filter.destinationGroups ?? {} })
        : null), [filter]);

    return { confirmedCalls, dropoffLine, pickupArea, dropoffArea, dongDots };
}

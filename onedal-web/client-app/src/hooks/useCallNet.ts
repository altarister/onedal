/**
 * 🕸️ **콜 그물 — 지금 필터가 무엇을 담고 있나** (이식 B3-2 · 2026-09-11).
 *
 * 지도 실험실이 나흘 동안 기사님과 맞춰 온 그물을 **실물 지도에도** 그리려고 만든 훅이다.
 * 계산은 `@onedal/shared` 의 `netForGoal` 하나다 — 실험실과 **같은 함수**를 부른다
 * (기사님 확정 2026-09-11 · 계획서 §4 Q1: *«실험실 계산을 올린다»*).
 *
 * ```
 * 동선   마름모 하나 — 기점은 내 위치
 * 노선   잡은 콜들이 만든 실제 경로 양옆 «라인 반경» ∪ 마지막 하차지 → 목적지 마름모
 * ```
 *
 * 🔴 **재료가 하나라도 없으면 `null` 이다** — 그물을 지어내지 않는다 (규칙 ④).
 *    목적지를 모르거나 내 위치를 모르면 그릴 것이 없다.
 *
 * ✅ **마름모 각도·반경은 이제 기사님이 고치신다** (2026-09-11 · 이식 C3).
 *    `user_filters` 에 칸 셋이 생겼고(출발각·목적각·마름모반경), 무대가 **한 벌 값**을
 *    이 훅에 넘긴다. 화면이 그리는 값과 기사님이 고치는 값이 같아졌다 (규칙 ⑤-4 ④).
 */
import { useMemo } from 'react';
import { netForGoal, mergeGoalNets, cityCenter, type NetPoint, type NetResult } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';

/**
 * 📐 **마름모의 모양을 못 받았을 때의 값** — 실험실 기본값 그대로.
 * 🔴 ✅ **2026-09-11 (이식 C3) — 이제 기사님이 고칠 수 있다.** 칸이 `user_filters` 에
 *    생겼고(`srcAngleDeg`·`dstAngleDeg`·`quadRadiusKm`), 이 훅은 그 값을 받아 쓴다.
 *    여기 숫자는 **아직 필터가 안 온 첫 순간**의 폴백일 뿐이다 — 화면이 빈 채로 서지 않게.
 */
export const NET_SHAPE_DEFAULTS = {
    /** 출발지 각도(전체 °) — 얼마나 돌아도 되나 */
    srcAngleDeg: 110,
    /** 목적지 각도(전체 °) — 둘레를 얼마나 넓게 볼까 */
    dstAngleDeg: 110,
    /** 마름모 반경 km — 축에서 좌우로 */
    quadRadiusKm: 25,
} as const;

export interface CallNetInput {
    /** 도착 목표 — 시·군·구 이름 (필터의 `destinationCity`) */
    destinationCity?: string;
    /** 내 위치 — 마름모의 출발 꼭짓점 */
    myLocation: { x: number; y: number } | null;
    /** 상차 반경 km (필터) */
    pickupRadiusKm?: number;
    /** 하차지 주변 반경 km (필터) */
    destinationRadiusKm?: number;
    /** 라인 반경 km — 경로 양옆으로 몇 km 까지 (필터의 `detourRadiusKm` 자리) */
    lineRadiusKm?: number;
    /** 🧭 경로를 든 콜 — 있으면 «노선»(라인 그물), 없으면 «동선»(마름모 하나) */
    routeHolder?: SecuredOrder | null;
    /**
     * 🛣️ **기사님이 고른 모양** — `false`(동선)면 경로가 있어도 **라인을 안 쓴다**
     *    (이식 · 2026-09-11 · 명세 §5).
     *
     * 🔴 **«고른 것»과 «실제»는 다르다.** 노선을 골라도 경로가 아직 없으면 마름모로 본다 —
     *    그때 `usedLine` 이 `false` 로 나오므로 **화면이 그렇게 말할 수 있다.**
     *    직선으로 지어내지 않는다 (규칙 ④).
     */
    routeMode?: boolean;
    /**
     * 📐 **마름모의 모양** — 기사님이 필터에서 고친 값 (이식 C3 · 2026-09-11).
     *    안 주면 `NET_SHAPE_DEFAULTS` 를 쓴다 — 필터가 아직 안 온 첫 순간뿐이다.
     */
    shape?: { srcAngleDeg?: number; dstAngleDeg?: number; quadRadiusKm?: number };
    /**
     * 🚫 **제외 지역** — `S|도` · `R|시군구` · `D|시군구|동` (이식 C2).
     *    🔴 **서버만 빼면 화면이 거짓말한다** — 지도가 «든다»고 그려 놓고 판정은 탈락시킨다.
     *    2026-09-11 저녁 자리표 대조에서 바로 그 상태가 발견됐다.
     */
    excludedRegions?: readonly string[];
    /**
     * 🧾 **서버가 앱에 내린 지역명 목록** (전수표 #19 · 2026-09-14) — 동 점은 이것과 겹치는 것만 남긴다.
     *    서버는 얼린 라인 위 GPS 진행도로 지나온 동을 뺀다(`filterManager.applyTraveledTrim`). 지도가 제 계산만 보면
     *    **지나온 동이 계속 점으로 남아** 화면과 판정이 다른 말을 한다. 비어 있으면(필터가 아직 안 옴) 거르지 않는다.
     */
    serverKeywords?: readonly string[];
    /**
     * 🚀 **출발했나** — 안 했으면 경로가 생겨도 내 영역을 함께 그린다 (기사님 확정 2026-09-14 · 필터.md §5 «필터 영역»).
     *    서버 `netKeywordsOf` 가 `session.departedAt` 으로 같은 갈림을 한다 — 관제웹은 국면(`DELIVERING`)으로 안다.
     */
    departed?: boolean;
    /**
     * 🏠 **살아 있는 목적지 전부** — 서버 파생값 그대로 (`goalCities` · 전수표 #15 #71 #75).
     *    복귀 대기면 [목적지, 집] — 목적지마다 그물을 만들어 합친다. 안 주면 `destinationCity` 하나.
     */
    goalCities?: readonly string[];
}

export interface CallNet {
    net: NetResult;
    /** 라인으로 만든 그물인가 — 그리는 쪽이 제 조건으로 다시 판단하지 않게 함께 낸다 (규칙 ③) */
    usedLine: boolean;
    /** 🎯 목적지 — 지도가 마커로 찍는다 (첫 목적지) */
    goal: NetPoint;
    /** 🏠 살아 있는 목적지 전부 — 마커를 목적지마다 찍는다 */
    goals: NetPoint[];
    /** 목적지마다 마름모 — 한 겹으로 칠한다 */
    tris: Array<Array<[number, number]>>;
}

export function useCallNet(i: CallNetInput): CallNet | null {
    const { destinationCity, myLocation, pickupRadiusKm, destinationRadiusKm, lineRadiusKm, routeHolder, shape, serverKeywords, departed, goalCities } = i;
    /** 🔴 배열을 문자로 굳혀 의존성으로 삼는다 — 매 렌더 새 배열이면 그물을 매번 다시 만든다 */
    const serverKey = serverKeywords?.length ? JSON.stringify([...serverKeywords].sort()) : '';
    /** 🔴 목적지 목록도 문자로 굳힌다 — 순서가 뜻이다(첫째가 목적지 · 관내는 거기만) */
    const goalKey = goalCities?.length ? JSON.stringify([...goalCities]) : '';
    /** 🛣️ 안 주면 «노선» — 목업 기본값과 같다 (기사님 확정 2026-09-09) */
    const routeMode = i.routeMode ?? true;
    /**
     * 🔴 배열을 문자로 굳혀 의존성으로 삼는다 — 매 렌더 새 배열이면 그물을 매번 다시 만든다.
     * 🔴 **`join('|')` 이 아니다** (2026-09-12 전수 조사 4단계 실측). 키 자체가 `R|광주시`·`S|서울`
     *    처럼 `|` 를 품고 있어 되풀 때 `["R","광주시"]` 로 깨졌다 — **지도는 제외지역을 한 번도
     *    제대로 뺀 적이 없었다.** 서버는 173 → 148 로 뺐는데 지도 수는 176 그대로였다.
     *    JSON 으로 굳히고 JSON 으로 되푼다 — 구분자가 키와 겹칠 수 없다.
     */
    const excludedKey = JSON.stringify(i.excludedRegions ?? []);
    const srcAngleDeg = shape?.srcAngleDeg ?? NET_SHAPE_DEFAULTS.srcAngleDeg;
    const dstAngleDeg = shape?.dstAngleDeg ?? NET_SHAPE_DEFAULTS.dstAngleDeg;
    const quadRadiusKm = shape?.quadRadiusKm ?? NET_SHAPE_DEFAULTS.quadRadiusKm;
    /* 🔷 **동선이면 경로를 안 본다** — 그물이 «내 위치 → 목적지» 마름모로 돌아온다 */
    const polyline = routeMode ? routeHolder?.routePolyline : undefined;

    /** 🔴 점열을 **문자로 굳혀** 의존성으로 삼는다 — 매 렌더 새 배열이면 그물을 매번 다시 만든다 */
    const lineKey = useMemo(
        () => (polyline?.length ?? 0) >= 2 ? `${polyline!.length}:${polyline![0].x},${polyline![polyline!.length - 1].y}` : '',
        [polyline]);

    /**
     * 📍 **내 위치를 ~300m 격자로 굳힌다 — 목업이 이미 쓰는 방어다** (이식 2026-09-12).
     *
     * ── 왜 지금 필요해졌나 ──
     * 여태 실물에서는 이 값이 거의 안 바뀌었다 — 클라 GPS 가 없으면 **집 좌표로 고정**이라
     * 재계산이 아예 없었다. 2026-09-12 에 위치가 **서버에서 1초마다** 오게 되면서
     * 그 전제가 깨졌다. 좌표가 매초 바뀌면 아래 `useMemo` 가 매초 통째로 다시 돈다 —
     * `buildLineNet` 은 라인이 길면(대전~김포) **수천만 연산**이다.
     *
     * 🔴 **어제 목업에서 그 사고가 실측됐다** (`f7a5564`): 앵커가 매 틱 새 값이라
     *    그물 만들기가 매 틱 재실행 → 프레임 p95 **183ms**. 격자 스냅으로 **50ms** 가 됐다.
     *    그 고침은 `MapMockup.tsx` 에만 들어갔고 **여기에는 없었다** — 지금 옮긴다.
     * ⚠️ **판정이 거칠어지지 않는다.** 그물 반경은 km 단위라 300m 눈금은 경계에 못 미친다.
     *    정밀 좌표가 필요한 곳(거리 재기·지도 마커)은 `myLocation` 을 그대로 쓴다.
     */
    const gridX = myLocation ? Math.round(myLocation.x * 300) / 300 : null;
    const gridY = myLocation ? Math.round(myLocation.y * 300) / 300 : null;

    return useMemo(() => {
        if (!destinationCity || !myLocation) return null;
        /* 🏠 살아 있는 목적지마다 그물 하나 — 복귀 대기면 목적지 ∪ 집 (서버 `goalCitiesOf` 가 정해 내려준다) */
        const cities = goalKey ? JSON.parse(goalKey) as string[] : [destinationCity];
        const goals: NetPoint[] = cities.map(c => ({ ...cityCenter(c), name: c }))
            .filter(g => Number.isFinite(g.lng) && Number.isFinite(g.lat));
        if (goals.length === 0) return null;   // 모르는 도시 — 지어내지 않는다
        const goal = goals[0];

        const line: Array<[number, number]> | null = (polyline?.length ?? 0) >= 2
            ? polyline!.map(p => [p.x, p.y] as [number, number]) : null;
        /** 🏁 마름모가 시작하는 자리 — 라인이 끝나는 곳(마지막 하차지). 라인이 없으면 내 위치에서 시작한다 */
        const lastDrop: NetPoint | null = line
            ? { name: '마지막 하차지', lng: line[line.length - 1][0], lat: line[line.length - 1][1] }
            : null;

        const nets = goals.map(g => netForGoal(g, {
            line,
            lineRadiusKm: lineRadiusKm ?? 6,
            lastDrop,
            params: {
                srcAngleDeg,
                dstAngleDeg,
                quadRadiusKm,
                srcDiamKm: (pickupRadiusKm ?? 10) * 2,
                dstDiamKm: (destinationRadiusKm ?? 15) * 2,
            },
            anchor: { name: '내 위치', lng: myLocation.x, lat: myLocation.y },
            /* 🧩 내 영역은 출발 전에만 — 서버 옛 그물과 같은 값 */
            me: departed ? null : { name: '내 위치', lng: myLocation.x, lat: myLocation.y },
        }));
        const net = nets[0];
        /* 원은 목적지마다 · 내 영역 원은 한 번만 */
        const circles = nets.flatMap(n => n.circles).filter((c, ci, all) => all.findIndex(x => x.name === c.name) === ci);
        const usedLine = !!line;
        /**
         * 🔴 **합치는 규칙은 `mergeGoalNets` 한 곳이다** — 겹침·지나온 곳·통째 제외를 거기서 본다.
         * 🚫 **제외 지역은 서버와 같은 목록을 본다** (이식 C2 · 2026-09-11 저녁).
         *    전에는 `excluded: []` 였고 주석은 *"실물에 아직 칸이 없다"* 고 적혀 있었다 —
         *    그 칸을 그날 오후에 팠는데도. **서버는 빼고 지도는 안 빼는** 상태였다.
         * ⚠️ 진행도 트림(`myProgressKm`)은 아직 안 건다 — 달리며 지나온 동을 빼는 것은 다음 판이다.
         */
        const merged = mergeGoalNets(nets, {
            departed: false, myProgressKm: 0,   // 🔴 지나온 동은 서버가 뺀다 — 아래에서 서버 목록과 겹친다
            excluded: JSON.parse(excludedKey) as string[],
        });
        if (!serverKey) return { net: { ...net, circles, pass: merged.pass, groups: merged.groups, count: merged.count }, usedLine, goal, goals, tris: nets.map(n => n.tri) };
        const onServer = new Set(JSON.parse(serverKey) as string[]);
        const pass = merged.pass.filter(p => onServer.has(p.name));
        const byRegion = new Map<string, string[]>();
        for (const p of pass) byRegion.set(p.region, [...(byRegion.get(p.region) ?? []), p.name]);
        const groups = [...byRegion.entries()].map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length);
        return { net: { ...net, circles, pass, groups, count: pass.length }, usedLine, goal, goals, tris: nets.map(n => n.tri) };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- polyline 은 lineKey 로 굳혀 본다 (위 주석)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 내 위치는 격자(gridX·gridY)로 굳혀 본다 (위 주석)
    }, [destinationCity, gridX, gridY, pickupRadiusKm, destinationRadiusKm, lineRadiusKm, lineKey,
        srcAngleDeg, dstAngleDeg, quadRadiusKm, excludedKey, routeMode, serverKey, departed, goalKey]);
}

import { Router } from "express";
import { getAllActiveUserIds, getUserSession } from "../state/userSessionStore";
import { isLiveServer } from "../config/env";
import { getActiveCalls } from "../core/helpers";
import { mapCoverage } from "../services/geoService";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { BOOTED_AT } from "./health";
import { calculateSoloRoute } from "../services/kakaoService";

const router = Router();

/**
 * 🧪 **배차망 시뮬레이터 전용 문** (기사님 확정 2026-08-31).
 *
 * 시뮬(`onedal-sim` · :5173)이 콜을 출제할 때 **«현위치 → 상차지» 거리**를 화면에 적는데,
 * 그 현위치가 **URL 로 한 번 고른 뒤 움직이지 않는 고정 좌표**였다. 기사님은 달리는데
 * 숫자는 그대로라, 상차 반경 축이 **실제 지리와 무관한 값으로 채점**됐다 —
 * 실측(0831): 적요는 «7.2km»인데 실제는 11.4km 였고, 22.4km 뒤 상차지가 통과했다.
 *
 * 실제 인성은 배차망 서버가 그 거리를 **매번 계산해서** 화면에 띄운다. 시뮬도 같아야
 * 책상 판의 채점이 진짜가 된다 — 그래서 여기서 «지금 어디»를 내준다.
 *
 * 🔴 **개발 빌드에서만 열린다.** 기사님의 실시간 위치는 노출하면 안 되는 값이다
 *    (2026-08-09 에 무인증 `GET /api/scrap` 을 «정찰 정보 노출»로 지운 것과 같은 이유).
 *    운영에서는 404 — 시뮬레이터가 없는 곳에는 이 문도 없다.
 *
 * 🔴 **«라이브인가»를 혼자 판정하지 않는다** (0831 리뷰에서 잡힘).
 *    레포에는 이미 `isLiveServer()` 가 있고 그 주석이 이 함정을 적어 뒀다 —
 *    *"신호를 둘 본다… 한쪽만 보면 그 설정이 빠진 날 조용히 열린다."*
 *    처음엔 `NODE_ENV` 하나만 봤는데, PM2 설정에서 그게 빠지면 **기사님 실시간 좌표가
 *    무인증으로 열린다.** 2026-08-09 에 «정찰 정보 노출»로 지운 자리보다 민감한 값이다.
 */
const isDevBuild = () => !isLiveServer();

router.get("/driver-location", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    /**
     * 로컬 판은 기사님 한 분이다 — 세션이 여럿이면 **고르지 않는다**(누구 위치인지 모르는
     * 값을 내주면 시뮬이 엉뚱한 거리로 출제한다 · 규칙 ④).
     */
    const userIds = getAllActiveUserIds();
    if (userIds.length !== 1) {
        return res.json({ ok: false, reason: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    }
    const session = getUserSession(userIds[0]);
    const loc = session.driverLocation;
    if (!loc) return res.json({ ok: false, reason: "현위치를 아직 모릅니다" });

    return res.json({
        ok: true,
        x: loc.x, y: loc.y,
        /** GPS 가 아니라 «내 주소»로 메운 값인가 — 시뮬이 화면에 그대로 밝힌다 */
        isFallback: !!session.driverLocationIsFallback,
        at: session.driverLocationAt ?? null,
        /**
         * 📍 **이 위치가 «어디서 왔나»** (2026-09-11 · 기사님 지시로 신설).
         *
         * 기사님: *"GPS 가 안 오는 건 PC 에서 테스트할 때 말고는 없는 상황이야.
         * 그럼 오른쪽에 내 위치 넣을 수 있게 할까?"*
         *
         * 🔴 **값은 한 칸(`driverLocation`)이고 문만 셋이다** — 읽는 쪽은 늘 그 한 칸만 본다.
         *    갈라지는 것을 막는 것은 **«어디서 왔는지 화면이 말하는 것»**이다 (규칙 ⑤-2).
         *    지금까지는 «집 주소로 대신»이 **로그에만** 찍혀서, 기사님이 *"내 위치가
         *    대전으로 박혀있나봐"* 하고 한참 헤매셨다 (2026-09-11).
         *
         *   `gps`    폰이 보낸 진짜 위치
         *   `manual` 손으로 찍은 위치 (관제웹·시뮬이 `dashboard-gps-update` 로 보낸다)
         *   `home`   아무것도 없어 **설정의 집 주소로 대신**한 것
         */
        source: session.driverLocationIsFallback ? 'home'
              : session.driverLocationIsMock ? 'manual' : 'gps',
    });
});

/**
 * 🧪 **판 점검 — «지금 이 문제지를 채점할 수 있는 상태인가»** (기사님 지시 2026-09-06)
 *
 * 기사님: *"뭐가 우리 테스트에 가장 큰 문제야?"* → 그날 콜이 안 올라온 것이 **일곱 번**인데
 * **단 한 번도 «우리 시스템이 옳게 걸렀다»가 아니었다.** 전부 판이 오염돼 있었다 —
 * 문제지 이름이 안 맞아 랜덤이 흐르고, 현위치가 초월이라 상차가 118km 로 잡히고,
 * 재기동마다 도착 목표가 옛 값으로 돌아가고, 취소했는데 필터가 합짐 모드에 남았다.
 *
 * 🔴 **콜이 안 올라오면 둘 중 하나인데 구분할 방법이 없었다:**
 *      ㉮ 우리 시스템이 옳게 걸렀다 (채점 결과)
 *      ㉯ 판이 오염됐다             (잡음)
 *    매번 ㉯였고, 알아내는 데 판마다 20~30분이 갔다.
 *
 * 그래서 **문제지가 요구하는 상태와 지금 상태를 기계가 대조**하게 한다.
 * `pnpm preflight` 는 «비우기»고 이건 «맞는가»다 — 둘은 다른 일이다.
 *
 * 🔴 `/driver-location` 과 같은 문이다 — **개발 빌드에서만 열린다.**
 *    기사님의 현위치·필터가 나가는 값이라 운영에서는 404 다.
 */
router.get("/preflight", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    const userIds = getAllActiveUserIds();
    if (userIds.length !== 1) {
        return res.json({ ok: false, reason: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    }
    const userId = userIds[0];
    const session = getUserSession(userId);
    const f = session.activeFilter;
    const home = SettingsRepository.getHomeLocation(userId);

    return res.json({
        ok: true,
        bootedAt: BOOTED_AT.toISOString(),
        /** 도는 필터(메모리) — 설정(DB)이 아니다. 둘이 갈라지는 것이 오늘의 사고였다 */
        destinationCity: f?.destinationCity ?? null,
        destinationRadiusKm: f?.destinationRadiusKm ?? null,
        pickupRadiusKm: f?.pickupRadiusKm ?? null,
        destinationDongCount: f?.destinationKeywords?.length ?? 0,
        isSharedMode: !!f?.isSharedMode,
        dispatchPhase: f?.dispatchPhase ?? null,
        activeCalls: getActiveCalls(session).length,
        /** 시뮬이 거리를 재는 기준 — 여기가 틀리면 상차 반경이 통째로 헛것이 된다 */
        driverLocation: session.driverLocation
            ? { x: session.driverLocation.x, y: session.driverLocation.y,
                isFallback: !!session.driverLocationIsFallback }
            : null,
        homeAddress: home?.address ?? null,
        /** 충청 확장이 실렸는가 — 1,968 이면 실렸고 1,239 면 옛 지도다 */
        map: mapCoverage(),
    });
});

export default router;

/**
 * 🗺️ **실험실 전용 — 정거장 점들을 실도로 곡선으로 잇는다** (기사님 2026-09-07).
 *
 * 지도 실험실(`/mockup/map`)이 콜을 확정해 경로가 다시 짜일 때 한 번 부른다.
 * 다리(연속 두 점)마다 카카오 길찾기 1회 — 구간별 폴리라인을 따로 돌려줘야
 * 실험실이 콜 색대로 구간을 칠할 수 있다. 무료 쿼터(일 1만)의 티끌이다.
 * 운영에서는 다른 sim 문들과 같이 404 다.
 */
router.post("/route", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const points = req.body?.points as Array<{ x: number; y: number }> | undefined;
        const valid = Array.isArray(points) && points.length >= 2 && points.length <= 24
            && points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
        if (!valid) return res.status(400).json({ error: "points 는 2~24개의 {x,y} 배열이어야 합니다" });
        // 옵션 축 — 노선에서 고른 것(우선순위·회피)을 콜 실측·확정 경로가 따라간다 (기사님 2026-09-08)
        const priority = ["RECOMMEND", "TIME", "DISTANCE"].includes(req.body?.priority) ? req.body.priority as string : "RECOMMEND";
        const avoid = ["motorway", "toll"].includes(req.body?.avoid) ? req.body.avoid as string : undefined;

        const legs: Array<Array<{ x: number; y: number }>> = [];
        /** 구간별 실측 — 콜 리스트 카드(거리·시간·톨비)가 읽는다 (기사님 2026-09-08) */
        // 🔴 못 잰 구간은 **null** 이다 — 0 도 직선 근사도 아니다 (규칙 ④). `/chain` 과 같은 규약
        const legInfo: Array<{ distKm: number | null; durMin: number | null; tollWon: number | null; failed?: boolean }> = [];
        let distance = 0, duration = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            // 같은 자리 두 점(하차 즉시 그 자리 상차)은 카카오를 부르지 않는다
            if (Math.hypot((a.x - b.x) * 88.6, (a.y - b.y) * 110.574) < 0.05) {
                legs.push([a, b]); legInfo.push({ distKm: 0, durMin: 0, tollWon: 0 }); continue;
            }
            // 🔴 구간 하나의 실패(예: 103 도착지점 탐색불가 — 도로 없는 자리)가 **전체를 죽이면 안 된다**
            //    (2026-09-08 실측: 한 구간 103 에 전체가 502 → 멀쩡한 구간까지 직선 폴백 + 반복 재시도)
            try {
                const r = await calculateSoloRoute(a.x, a.y, b.x, b.y, null, priority, 1, false, avoid);
                legs.push(r.polyline && r.polyline.length >= 2 ? r.polyline : [a, b]);
                legInfo.push({
                    distKm: +(r.distance / 1000).toFixed(1),
                    durMin: Math.round(r.duration / 60),
                    tollWon: (r.raw as { fare?: { toll?: number } } | undefined)?.fare?.toll ?? null,
                });
                distance += r.distance; duration += r.duration;
            } catch (legErr) {
                /**
                 * 🔴 **못 쟀으면 «못 쟀다»고 한다 — 직선 km 를 지어내지 않는다** (규칙 ④ · 2026-09-09).
                 *
                 * 예전엔 직선거리를 넣고 `durMin: 0` 을 붙였다. **0분은 «즉시 도착»으로 읽힌다** —
                 * 그 값이 시급(요금 ÷ 분)에 들어가면 색이 통째로 틀린다. 같은 파일의 `/chain`
                 * 은 이미 `null` 로 두고 있었으니 **한 서버가 같은 질문에 두 답**을 하던 셈이다.
                 * 실물도 카카오가 실패하면 `kakaoSoloDurationMin` 을 null 로 남긴다.
                 */
                console.warn(`⚠️ [sim/route] 구간 ${i} 실측 실패 — 못 쟀다로 남긴다:`, String((legErr as Error)?.message ?? legErr));
                legs.push([]);
                legInfo.push({ distKm: null, durMin: null, tollWon: null, failed: true });
            }
        }
        return res.json({ legs, legInfo, distance, duration });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});

/**
 * 🛣️ **실험실 전용 — 길 찾기: 카카오 «모든 옵션»을 실시간으로, 합치지 않고 그대로**
 * (기사님 2026-09-08: *"길찾기를 합하지 말고 카카오 모든 옵션을 뿌려주면? — 카카오 호출하자는 이야기"*).
 *
 * 미리 만든 길 파일과 달리 **누르는 그 시각의 소요시간**이 나온다 — 밤 출발이면 밤의 길.
 * 옵션 5종(추천·최단시간·최단거리·고속도로 피하기·톨게이트 피하기) × 대안 경로, 중복 병합 없음.
 * 점은 ~0.4km 간격으로 솎는다. 운영에서는 다른 sim 문들과 같이 404.
 */
router.post("/roads", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const { origin, dest, waypoints } = req.body ?? {};
        const ok = (p: unknown): p is { x: number; y: number } =>
            !!p && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y);
        if (!ok(origin) || !ok(dest)) return res.status(400).json({ error: "origin/dest 는 {x,y} 여야 합니다" });
        // ➕ 경유지를 이어 붙인 경로 (기사님 2026-09-08 «두 단으로 가기») — 카카오가 «빠름» 축만 알아서
        //    남쪽으로 도는 길을 절대 안 준다. 경유점을 지나는 조건을 걸면 그 길이 나온다
        const wps: Array<{ x: number; y: number }> = Array.isArray(waypoints) ? waypoints.filter(ok).slice(0, 5) : [];
        const wpParam = wps.length ? `&waypoints=${wps.map(w => `${w.x},${w.y}`).join("|")}` : "";

        // 4개만, 대안 없이 (기사님 확정 2026-09-08: «추천·최단거리·최단시간·톨게이트 피하기 이렇게 4개만»)
        const COMBOS: Array<[string, string, string]> = [
            ["RECOMMEND", "", "추천"],
            ["DISTANCE", "", "최단거리"],
            ["TIME", "", "최단시간"],
            ["RECOMMEND", "toll", "톨게이트 피하기"],
        ];
        const rad = (x: number) => x * Math.PI / 180;
        const km = (a: [number, number], b: [number, number]) =>
            Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(rad(a[1])), (b[1] - a[1]) * 110.574);
        const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY || ""}` };

        const roads: Array<{ option: string; name: string; distKm: number; durMin: number; tollWon: number | null; line: Array<[number, number]> }> = [];
        for (const [priority, avoid, label] of COMBOS) {
            const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin.x},${origin.y}&destination=${dest.x},${dest.y}${wpParam}`
                + `&priority=${priority}${avoid ? `&avoid=${avoid}` : ""}&alternatives=false&road_details=true&car_type=1`;
            const r = await fetch(url, { headers });
            if (!r.ok) continue;                              // 옵션 하나가 막혀도 나머지는 뿌린다
            const d = await r.json() as { routes?: Array<{ result_code: number; summary: { distance: number; duration: number; fare?: { toll?: number } }; sections?: Array<{ roads?: Array<{ name?: string; distance: number; vertexes?: number[] }> }> }> };
            (d.routes ?? []).filter(rt => rt.result_code === 0).forEach((rt, ai) => {
                const pts: Array<[number, number]> = [];
                const roadKm = new Map<string, number>();
                for (const sec of rt.sections ?? []) for (const road of sec.roads ?? []) {
                    if (road.name) roadKm.set(road.name, (roadKm.get(road.name) ?? 0) + road.distance);
                    const v = road.vertexes ?? [];
                    for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
                }
                const line: Array<[number, number]> = [];
                for (const p of pts) if (!line.length || km(line[line.length - 1], p) >= 0.4)
                    line.push([+p[0].toFixed(5), +p[1].toFixed(5)]);
                const top = [...roadKm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
                roads.push({
                    option: ai === 0 ? label : `${label} 대안${ai}`,
                    name: top.join("·") || "이름 없는 길",
                    distKm: +(rt.summary.distance / 1000).toFixed(1),
                    durMin: Math.round(rt.summary.duration / 60),
                    tollWon: rt.summary.fare?.toll ?? null,
                    line,
                });
            });
        }
        return res.json({ roads });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});

/**
 * 🧭 **실험실 전용 — 정거장 전부를 한 번에, 구간별로 그대로** (기사님 확정 2026-09-08).
 *
 * 기사님 순서(②~⑥ · ⑫~⑭) 그대로다:
 *   재배치된 좌표들을 통째로 한 번 보내면 → **카카오가 구간마다 nkm/n분을 나눠서 준다.**
 *   그 값을 **합치지 않고 그대로** 돌려준다 — 우회는 «같은 구간의 전/후 차이»로 화면이 계산한다.
 *
 * 🔴 `calculateDetourRoute` 를 안 쓴다: 그것은 **총합 차이(merged−base)** 만 준다.
 *    기사님 정의는 «우회상차시간 = (출발지-첫콜상차) − (내위치-첫콜상차)» 처럼
 *    **구간별**이라, 총합만으로는 어디서 얼마나 늘었는지 답할 수 없다 (2026-09-08 정정).
 *
 * 요청: `{ stops: [{x,y,label?}, ...] }` — 첫 점이 출발지(보통 내 위치)
 * 응답: `{ legs: [{from,to,distKm,durMin,line}], totalKm, totalMin }` — legs[i] = stops[i]→stops[i+1]
 */
/** 폴리라인 솎기 — `/roads` 와 같은 0.4km 규약. 안 솎으면 8정거장에 154KB 가 나간다 (2026-09-08 리뷰) */
function thinLine(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    const rad = (v: number) => v * Math.PI / 180;
    const km = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot((b.x - a.x) * 111.32 * Math.cos(rad(a.y)), (b.y - a.y) * 110.574);
    const out: Array<{ x: number; y: number }> = [];
    for (const p of pts) if (!out.length || km(out[out.length - 1], p) >= 0.4) out.push({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) });
    const last = pts[pts.length - 1];
    if (last && out.length && km(out[out.length - 1], last) > 0.05) out.push({ x: +last.x.toFixed(5), y: +last.y.toFixed(5) });
    return out;
}

router.post("/chain", async (req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });
    try {
        const stops = req.body?.stops as Array<{ x: number; y: number; label?: string }> | undefined;
        const valid = Array.isArray(stops) && stops.length >= 2 && stops.length <= 30
            && stops.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
        if (!valid) return res.status(400).json({ error: "stops 는 2~30개의 {x,y} 배열이어야 합니다" });

        const priority = ["RECOMMEND", "TIME", "DISTANCE"].includes(req.body?.priority) ? req.body.priority as string : "RECOMMEND";
        const avoid = ["motorway", "toll"].includes(req.body?.avoid) ? req.body.avoid as string : undefined;
        const origin = stops[0], dest = stops[stops.length - 1], waypoints = stops.slice(1, -1);

        const body = {
            origin: { x: String(origin.x), y: String(origin.y) },
            destination: { x: String(dest.x), y: String(dest.y) },
            waypoints: waypoints.map((w, i) => ({ name: `wp${i}`, x: String(w.x), y: String(w.y) })),
            priority, car_type: 1, ...(avoid ? { avoid: [avoid] } : {}),
        };
        const r = await fetch("https://apis-navi.kakaomobility.com/v1/waypoints/directions", {
            method: "POST",
            headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY || ""}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const d = await r.json() as {
            code?: number; msg?: string;
            routes?: Array<{ result_code: number; result_msg?: string; summary?: { distance: number; duration: number; fare?: { toll?: number } };
                sections?: Array<{ distance: number; duration: number; roads?: Array<{ vertexes?: number[] }> }> }>;
        };
        // 🔴 «경로 없음이 아닌 실패»(키 오류·좌표 뒤바뀜·쿼터 소진)를 삼키지 않는다 —
        //    전부 «이 경로는 불가능하다»로 읽히면 오진한다 (2026-09-08 리뷰)
        if (!r.ok || d.code !== undefined) {
            return res.status(502).json({ error: `카카오 오류: ${d.msg ?? `HTTP ${r.status}`}`, kakaoCode: d.code ?? null });
        }
        const route = d.routes?.[0];
        if (!route || route.result_code !== 0) {
            /**
             * 🔴 **구간 하나의 실패가 전체를 죽이지 않는다** — `/route` 와 같은 규약.
             * 전체 경로가 통째로 실패하면 **정거장 쌍마다 따로** 재서 살릴 구간은 살린다.
             * (2026-09-08 리뷰: 도로 밖 좌표 하나에 멀쩡한 구간까지 사라졌다)
             */
            const legs: Array<{ from: string | null; to: string | null; distKm: number | null; durMin: number | null; line: Array<{ x: number; y: number }>; failed: boolean }> = [];
            for (let i = 0; i + 1 < stops.length; i++) {
                const s1 = stops[i], s2 = stops[i + 1];
                try {
                    const one = await calculateSoloRoute(s1.x, s1.y, s2.x, s2.y, null, priority, 1, false, avoid);
                    legs.push({ from: s1.label ?? null, to: s2.label ?? null,
                        distKm: +(one.distance / 1000).toFixed(1), durMin: Math.round(one.duration / 60),
                        line: thinLine(one.polyline ?? []), failed: false });
                } catch {
                    legs.push({ from: s1.label ?? null, to: s2.label ?? null, distKm: null, durMin: null, line: [], failed: true });
                }
            }
            const okLegs = legs.filter(l => !l.failed);
            return res.json({
                legs, partial: true,
                note: `전체 경로 통째 실패(${route?.result_msg ?? "경로 없음"}) — 구간별로 다시 쟀다`,
                totalKm: okLegs.length ? +okLegs.reduce((t, l) => t + (l.distKm ?? 0), 0).toFixed(1) : null,
                totalMin: okLegs.length ? okLegs.reduce((t, l) => t + (l.durMin ?? 0), 0) : null,
                tollWon: null,
            });
        }
        // 🔴 구간을 **합치지 않는다** — 카카오가 나눠 준 그대로가 기사님이 쓰는 값이다
        const legs = (route.sections ?? []).map((sec, i) => {
            const line: Array<{ x: number; y: number }> = [];
            for (const road of sec.roads ?? []) {
                const v = road.vertexes ?? [];
                for (let k = 0; k + 1 < v.length; k += 2) line.push({ x: v[k], y: v[k + 1] });
            }
            return {
                // 🔴 라벨을 지어내지 않는다 — 클라가 이걸 구간 조인 키로 쓴다 (없으면 null)
                from: stops[i]?.label ?? null, to: stops[i + 1]?.label ?? null,
                distKm: +(sec.distance / 1000).toFixed(1), durMin: Math.round(sec.duration / 60),
                line: thinLine(line), failed: false,
            };
        });
        const sum = route.summary;
        return res.json({
            legs, partial: false,
            // 없는 값은 null 이다 — 0.0km 라고 단언하지 않는다 (규칙 ④)
            totalKm: sum ? +(sum.distance / 1000).toFixed(1) : null,
            totalMin: sum ? Math.round(sum.duration / 60) : null,
            tollWon: sum?.fare?.toll ?? null,
        });
    } catch (e) {
        return res.status(502).json({ error: String((e as Error)?.message ?? e) });
    }
});

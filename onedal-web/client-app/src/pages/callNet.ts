/**
 * 🕸️ **그물 셋업 — 동선 사각형을 실시간으로 계산한다** (기사님 요청 2026-09-07)
 *
 * «동선» = 지금 자리와 목적지 **사이**를 잇는 줄 (용어집 §3 · 기사님 확정 2026-09-07).
 * 사각형(두 꼭짓점 원뿔의 교집합) + 꼭짓점 둘레 원으로 «이 콜이 내 줄에 붙는가»를 잰다.
 * 기하는 docs/기획/노선_고르는_법.md ⑭ 그대로다:
 *   · 출발지 각도 — 얼마나 돌아도 되나 (느긋 100° ↔ 급함 30°)
 *   · 목적지 각도 — 목적지 둘레를 얼마나 넓게 볼까 (검산 기준 50°)
 *   · 꼭짓점 원 — 꼭짓점 자신은 방위가 없어 각도를 잴 수 없다. 원이 그 답 (지름 15km)
 *   · 서울은 뺀다 — 트래픽으로 한 콜에 시간을 다 먹는다 (⑭ «서울은 뺀다»)
 *
 * 🔴 예전에는 이 판을 미리 구운 상수(QUAD_YEOJU)로 뒀는데, 인풋으로 각도를 받게 되며
 *    **실시간 계산 하나로 대체했다** — 같은 답의 원천을 두 벌 두지 않는다 (규칙 ③).
 *
 * 🔴 대기(여주) 프리셋에서 **부발읍이 1° 차이로 빠진다** — 출발지각 14°인데 목적지각 26° > ±25°,
 *    여주 시내에서 12.3km 라 원(7.5km)에도 안 든다. 가남읍(77°)·대신면(47°)·북내면(89°)도
 *    같은 이유 — 볼트가 실제로 잡았던 «여주 대신»이 이 그물에는 없다.
 *    **짧은 동선(32km)에서는 목적지 쪽이 좁다** — 파주 판의 용인(18°↔70°) 관찰의 목적지 판본.
 *    → 각도·지름을 «거리에서 파생»할 것인가가 열린 질문이다 (규칙 ⑤-4 확정 전).
 *
 * 좌표는 지도(merged_map) 무게중심(dongCentroids.ts)이다 — 지어내지 않았다 (규칙 ④).
 */
import { DONG_CENTROIDS } from './dongCentroids';

const rad = (d: number) => d * Math.PI / 180;

function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** 원점에서 방위 brg 로 km 만큼 간 지점 (이 스케일에서는 평면 근사로 충분) */
function rayPoint(o: { lng: number; lat: number }, brg: number, km: number) {
    return {
        lng: o.lng + km * Math.sin(rad(brg)) / (111.320 * Math.cos(rad(o.lat))),
        lat: o.lat + km * Math.cos(rad(brg)) / 110.574,
    };
}

/** 광선 p1→p2 와 p3→p4 의 교점 (경위도 평면 근사) */
function intersect(p1: { lng: number; lat: number }, p2: { lng: number; lat: number }, p3: { lng: number; lat: number }, p4: { lng: number; lat: number }) {
    const d = (p2.lng - p1.lng) * (p4.lat - p3.lat) - (p2.lat - p1.lat) * (p4.lng - p3.lng);
    const t = ((p3.lng - p1.lng) * (p4.lat - p3.lat) - (p3.lat - p1.lat) * (p4.lng - p3.lng)) / d;
    return { lng: p1.lng + t * (p2.lng - p1.lng), lat: p1.lat + t * (p2.lat - p1.lat) };
}

/** 꼭짓점 둘레 원 링 (지리 좌표 64점 — 화면 픽셀이 아니라 «땅 위의 원»이라야 줌에 안 흔들린다) */
function ringOf(c: { lng: number; lat: number }, radiusKm: number): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 64; i++) {
        const t = i / 64 * 2 * Math.PI;
        pts.push([
            +(c.lng + radiusKm * Math.sin(t) / (111.320 * Math.cos(rad(c.lat)))).toFixed(5),
            +(c.lat + radiusKm * Math.cos(t) / 110.574).toFixed(5),
        ]);
    }
    return pts;
}

/**
 * 🔴 이름만으로 찾으면 **동명이인**에 걸린다 (2026-09-07 실측: 창전동은 서울 마포·이천·안성
 * 셋에 있고, 「이천 시내」 표지가 마포에 찍히고 있었다 — 그물 밖이라 화면에서 안 보였을 뿐).
 * 두 곳 이상이면 region(시군구)을 대야 하고, 안 대면 조용히 첫 놈을 집는 대신 **터진다.**
 */
function centroidOfDong(name: string, region?: string) {
    const hits = DONG_CENTROIDS.filter(d => d[0] === name && (!region || d[1].includes(region)));
    if (hits.length === 0) throw new Error(`지도에 없는 동: ${name}${region ? ` (${region})` : ''}`);
    if (hits.length > 1) throw new Error(`동명이인: ${name} — ${hits.map(h => h[1]).join('/')} 중 region 을 대야 한다`);
    return { lng: hits[0][2], lat: hits[0][3] };
}

/** 그물의 꼭짓점 하나 — 이름과 좌표 */
export interface NetPoint { name: string; lng: number; lat: number }

/** 도시의 «시내» 좌표 — 그 시 법정동('동' 행) 평균. 여주 시내(NET_DST)와 같은 셈법이다 */
export function cityCenter(city: string, label?: string): NetPoint {
    const all = DONG_CENTROIDS.filter(d => d[1] === city);
    if (all.length === 0) throw new Error(`지도에 없는 시군구: ${city}`);
    const dongs = all.filter(d => d[0].endsWith('동'));
    const use = dongs.length ? dongs : all;
    return {
        name: label ?? `${city.replace(/시$/, '')} 시내`,
        lng: use.reduce((s, d) => s + d[2], 0) / use.length,
        lat: use.reduce((s, d) => s + d[3], 0) / use.length,
    };
}

/**
 * 대기 판의 두 꼭짓점 — 지금 자리(초월읍 집)와 목적지(여주 시내 = 여주시 법정동 평균)
 * 🔴 집은 **실좌표**다 — `docs/기획/경로.md` «집 → 가산동» 검증에 쓰던 그 좌표.
 * 처음엔 `centroidOfDong('초월읍')`(폴리곤 평균)을 썼는데 산자락으로 **북동 2.6km** 밀려
 * 지도의 내 위치가 어긋났다 (기사님 지적 2026-09-07).
 */
export const NET_SRC: NetPoint = { name: '초월(집)', lng: 127.294001, lat: 37.377178 };
const yeojuDongs = DONG_CENTROIDS.filter(d => d[1] === '여주시' && d[0].endsWith('동'));
export const NET_DST: NetPoint = {
    name: '여주 시내',
    lng: yeojuDongs.reduce((s, d) => s + d[2], 0) / yeojuDongs.length,
    lat: yeojuDongs.reduce((s, d) => s + d[3], 0) / yeojuDongs.length,
};

/**
 * 🛍️ 곤지암 판 — 콜 하나를 쥔 상태의 그물 (기사님 확정 2026-09-07)
 *
 * 잡은 콜: 모다아울렛 곤지암점(초월읍 경충대로 907) → **곤지암성당**(곤지암읍 경충대로543번길 19).
 * 좌표는 카카오 키워드 검색 실측 — 지어내지 않았다 (규칙 ④).
 *
 * 🔴 **그물의 출발 꼭짓점은 현위치(모다아울렛)가 아니라 «경로의 하차지»다** —
 *    기사님: *"하차지에서 여주를 잇는 사각형이 되야지."* 출발·귀가의
 *    «기점은 현위치가 아니라 최종 하차지»와 같은 구조이고, 파주 목업의
 *    «용인→시흥»(첫 콜을 잡으면 꼭짓점이 하차지로 옮겨간다)과도 같은 규칙이다.
 *    → 그래서 이 판은 곤지암성당 → 여주 27.3km 를 잇는다.
 *
 * 실측 수확: 초월→여주 판에서 1° 차이로 빠지던 **부발읍이 이 판에서는 든다**(목적지각 19°) —
 * 꼭짓점이 하차지로 옮겨지며 축이 부발 줄기 위로 온 것이다. 각도를 안 건드리고 풀렸다.
 */
export const GONJIAM_DROP: NetPoint = { name: '곤지암성당(하차)', lng: 127.34864, lat: 37.34621 };

/** ⛓️ 첫콜의 세 점 — 출발지(초월 집) → ① 상차(모다아울렛) → ① 하차(곤지암성당). 지도에 직선으로 잇는다 (기사님 2026-09-07) */
export const GONJIAM_CALL_PATH: Array<{ x: number; y: number; label: string; color?: string }> = [
    { x: NET_SRC.lng, y: NET_SRC.lat, label: '출발 · 초월(집)' },
    { x: 127.31259, y: 37.36330, label: '① 상차 · 모다아울렛' },
    { x: GONJIAM_DROP.lng, y: GONJIAM_DROP.lat, label: '① 하차 · 곤지암성당' },
];

/**
 * 🏫 둘째 콜을 잡은 뒤 — 한국도로공사 경기광주지사(곤지암읍 독고개길 15) →
 * **동원대학교**(곤지암읍 경충대로 26). 좌표는 카카오 키워드 검색 실측 (2026-09-07).
 *
 * 마지막 하차지가 동원대로 옮겨져 그물은 동원대 → 여주 22.1km 가 된다.
 * 실측 수확 둘:
 *   · **그물이 닫힌다** — 초월(대기) 48동 → 곤지암성당 43동 → 동원대 40동.
 *     지나온 초월읍(집)이 이 판부터 빠진다 (출발지각 152°) — ⑭ «하루가 스스로 끝난다» 그대로
 *   · **곤지암읍은 각도로는 뒤(131°)인데 든다** — 동원대에서 4.3km 라 출발지 원(7.5km)이
 *     담는다. «꼭짓점 자신은 각도를 잴 수 없다 — 원이 그 답»의 실측 표본
 */
export const DONGWON_DROP: NetPoint = { name: '동원대(하차)', lng: 127.40395, lat: 37.32902 };

/**
 * ⛓️ 둘째 콜까지의 경로 — 기존(① 장미색) 뒤에 **이번 콜(② 보라색)** 을 이어 붙인다
 * (기사님 2026-09-07: *"기존 경로에 더해 이번 경로를 직선으로 색을 넣어 그려줘"*).
 * ② 상차 = 한국도로공사 경기광주지사(곤지암읍 독고개길 15) — 카카오 실측.
 * 성당→도로공사 구간도 보라색이다 — 둘째 콜 때문에 **새로 늘어난 주행**이 색으로 보인다.
 */
export const DONGWON_CALL_PATH: Array<{ x: number; y: number; label: string; color?: string }> = [
    ...GONJIAM_CALL_PATH,
    { x: 127.31735, y: 37.35860, label: '② 상차 · 도로공사 광주지사', color: '#a78bfa' },
    { x: DONGWON_DROP.lng, y: DONGWON_DROP.lat, label: '② 하차 · 동원대', color: '#a78bfa' },
];

/**
 * 🕯️ 셋째 콜을 잡은 뒤 — 르노코리아서비스 경기광주정비사업소(곤지암읍 경충대로184번길 7-5) →
 * **보람여주장례식장**(여주시 세종대왕면 중부대로 2710-48). 좌표는 카카오 키워드 검색 실측 (2026-09-07).
 *
 * ③ 상차는 동원대 바로 옆(2.1km)이고, ③ 하차는 **여주 시내에서 3.9km** — 하차지가 목적지
 * 원 안으로 들어왔다. 그물은 25동, 전부 여주다: **48 → 43 → 40 → 25, 하루가 스스로 끝난다**
 * (⑭ «마지막엔 목적지 둘레 원만 남는다» 그대로). 부발·곤지암도 이 판부터 지나온 곳이 되어 빠진다.
 */
export const BORAM_DROP: NetPoint = { name: '보람여주장례식장(하차)', lng: 127.60899, lat: 37.29638 };

/** ⛓️ 셋째 콜까지의 경로 — ① 장미 · ② 보라 · **③ 청록** */
export const BORAM_CALL_PATH: Array<{ x: number; y: number; label: string; color?: string }> = [
    ...DONGWON_CALL_PATH,
    { x: 127.38139, y: 37.33259, label: '③ 상차 · 르노 정비사업소', color: '#2dd4bf' },
    { x: BORAM_DROP.lng, y: BORAM_DROP.lat, label: '③ 하차 · 보람여주장례식장', color: '#2dd4bf' },
];

/**
 * 🏥 넷째 콜을 잡은 뒤 — 세종대왕면 행정복지센터(여주 세종대왕면 번도1길 2-9) →
 * **경기도의료원 이천병원**(이천시 경충대로 2742). 좌표는 카카오 키워드 검색 실측 (2026-09-07).
 *
 * ④ 상차는 보람여주 바로 옆(3.2km)인데, ④ 하차는 목적지(여주) **반대편 서쪽**이다.
 * 마지막 하차지가 이천병원으로 옮겨지며 그물은 이천병원 → 여주 18.8km —
 * **닫혔던 그물(25동)이 43동으로 다시 열린다.** 하차지가 그물을 이끈다는 것이 거꾸로도 참이다.
 */
export const ICHEON_DROP: NetPoint = { name: '이천병원(하차)', lng: 127.43304, lat: 37.28280 };

/** ⛓️ 넷째 콜까지의 경로 — ① 장미 · ② 보라 · ③ 청록 · **④ 주황** */
export const ICHEON_CALL_PATH: Array<{ x: number; y: number; label: string; color?: string }> = [
    ...BORAM_CALL_PATH,
    { x: 127.57350, y: 37.30020, label: '④ 상차 · 세종대왕면 행정복지센터', color: '#fb923c' },
    { x: ICHEON_DROP.lng, y: ICHEON_DROP.lat, label: '④ 하차 · 이천병원', color: '#fb923c' },
];

export interface NetParams {
    /** 출발지 꼭짓점 원 지름 km */
    srcDiamKm: number;
    /** 출발지 각도(전체 °) — 얼마나 돌아도 되나 */
    srcAngleDeg: number;
    /** 목적지 각도(전체 °) — 둘레를 얼마나 넓게 볼까 */
    dstAngleDeg: number;
    /** 목적지 꼭짓점 원 지름 km */
    dstDiamKm: number;
}

/** ⏳ 대기 프리셋 — «여주를 목적지로 느긋하게» (기사님 2026-09-07 · ⑭ 검산 값 그대로) */
export const WAIT_PRESET: NetParams = { srcDiamKm: 15, srcAngleDeg: 100, dstAngleDeg: 50, dstDiamKm: 15 };

/** 경계 표지 — 무엇이 들고 무엇이 아깝게 빠지는지 이름으로 보인다 */
const MARK_DONGS: Array<{ name: string; dong: string; region?: string }> = [
    { name: '곤지암', dong: '곤지암읍' },
    { name: '이천 시내', dong: '창전동', region: '이천시' },   // 창전동은 마포·이천·안성 셋 — 시를 댄다
    { name: '세종대왕면', dong: '세종대왕면' },
    { name: '부발', dong: '부발읍' },
    { name: '가남', dong: '가남읍' },
    { name: '여주 대신', dong: '대신면' },
];

/** 그물 판정 하나로 1,968동을 훑는다 — 서울 제외(⑭)는 여기 한 곳에서만 건다 */
function collectDongs(inNet: (pt: { lng: number; lat: number }) => boolean) {
    // 점에 이름·시군구를 같이 싣는다 — 지도가 «어느 동을 제외했나»를 점 단위로 표현해야 한다 (기사님 2026-09-07 제외지역)
    const pass: Array<{ x: number; y: number; name: string; region: string }> = [];
    const grouped = new Map<string, string[]>();
    for (const [name, region, lng, lat] of DONG_CENTROIDS) {
        if (region.startsWith('서울')) continue;               // ⑭ «서울은 뺀다»
        if (!inNet({ lng, lat })) continue;
        pass.push({ x: lng, y: lat, name, region });
        const names = grouped.get(region) ?? [];
        names.push(name);
        grouped.set(region, names);
    }
    return { pass, grouped };
}

export interface NetResult {
    tri: Array<[number, number]>;
    pass: Array<{ x: number; y: number; name: string; region: string }>;
    marks: Array<{ name: string; x: number; y: number; inside: boolean }>;
    circles: Array<{ name: string; ring: Array<[number, number]> }>;
    count: number;
    /** 시군구별 명단 — 많은 순. 표로 그린다 */
    groups: Array<{ region: string; names: string[] }>;
    /** ⛓️ 잡은 콜의 경로(출발→상차→하차) — 있는 판만 싣는다. 지도가 직선으로 잇는다 */
    callPath?: Array<{ x: number; y: number; label: string }>;
}

/** 사각형(두 원뿔의 교집합)만 — 꼭짓점 원 제외. «내 반경 ∩ 마름모»의 마름모가 이것이다 */
function makeInQuad(p: NetParams, src: NetPoint, dst: NetPoint) {
    const srcHalf = Math.min(85, Math.max(2, p.srcAngleDeg / 2));
    const dstHalf = Math.min(85, Math.max(2, p.dstAngleDeg / 2));
    const axisAB = bearingDeg(src, dst), axisBA = bearingDeg(dst, src);
    return (pt: { lng: number; lat: number }) =>
        angDiff(bearingDeg(src, pt), axisAB) <= srcHalf && angDiff(bearingDeg(dst, pt), axisBA) <= dstHalf;
}

/** 그물 소속 판정 하나를 만든다 — buildNet 과 judgeTwoStage 가 같은 식을 본다 (규칙 ③ — 원천 하나) */
function makeInNet(p: NetParams, src: NetPoint, dst: NetPoint) {
    const srcR = Math.max(0, p.srcDiamKm / 2), dstR = Math.max(0, p.dstDiamKm / 2);
    const inQuad = makeInQuad(p, src, dst);
    return (pt: { lng: number; lat: number }) =>
        haversineKm(src, pt) <= srcR || haversineKm(dst, pt) <= dstR || inQuad(pt);
}

/** 동선 그물을 계산한다 — 꼭짓점 기본은 대기 판(초월→여주), 각도·지름은 인풋 */
export function buildNet(p: NetParams, src: NetPoint = NET_SRC, dst: NetPoint = NET_DST, markDongs: Array<{ name: string; dong: string; region?: string }> = MARK_DONGS): NetResult {
    const srcHalf = Math.min(85, Math.max(2, p.srcAngleDeg / 2));
    const dstHalf = Math.min(85, Math.max(2, p.dstAngleDeg / 2));
    const srcR = Math.max(0, p.srcDiamKm / 2), dstR = Math.max(0, p.dstDiamKm / 2);
    const axisAB = bearingDeg(src, dst), axisBA = bearingDeg(dst, src);
    const inNet = makeInNet(p, src, dst);

    const { pass, grouped } = collectDongs(inNet);

    // 사각형 꼭짓점 — 두 원뿔 변 광선의 교점 (그리기 전용, 판정은 위 각도 검사가 한다)
    // 꼭짓점 둘이 겹치면(목적지 = 집에 서 있는 복귀 판) 사각형은 못 그린다 — 원만 남긴다
    if (haversineKm(src, dst) < 1) {
        return {
            tri: [], pass,
            marks: markDongs.map(m => {
                const c = centroidOfDong(m.dong, m.region);
                return { name: m.name, x: c.lng, y: c.lat, inside: inNet(c) };
            }),
            circles: [
                { name: src.name, ring: ringOf(src, srcR) },
                { name: dst.name, ring: ringOf(dst, dstR) },
            ],
            count: pass.length,
            groups: [...grouped.entries()]
                .map(([region, names]) => ({ region, names }))
                .sort((a, b) => b.names.length - a.names.length),
        };
    }
    const far = haversineKm(src, dst) * 3;
    const quad = [
        src,
        intersect(src, rayPoint(src, axisAB - srcHalf, far), dst, rayPoint(dst, axisBA + dstHalf, far)),
        dst,
        intersect(src, rayPoint(src, axisAB + srcHalf, far), dst, rayPoint(dst, axisBA - dstHalf, far)),
        src,
    ];

    return {
        tri: quad.map(q => [+q.lng.toFixed(5), +q.lat.toFixed(5)]),
        pass,
        marks: markDongs.map(m => {
            const c = centroidOfDong(m.dong, m.region);
            return { name: m.name, x: c.lng, y: c.lat, inside: inNet(c) };
        }),
        circles: [
            { name: src.name, ring: ringOf(src, srcR) },
            { name: dst.name, ring: ringOf(dst, dstR) },
        ],
        count: pass.length,
        groups: [...grouped.entries()]
            .map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length),
    };
}

/**
 * 🕳️/🛣️ **첫짐이 목적지 그 자체일 때의 두 판** (기사님 2026-09-07 «그림으로 알려줘»)
 *
 * 첫짐 = 초월(집) → 여주 시내. 마지막 하차지가 곧 목적지라 **사각형이 점으로 쪼그라들고
 * 여주 원만 남는다** — 그러면 내가 지나갈 곤지암·이천 길이 그물에서 통째로 사라진다.
 * 그 빈 곳을 채우는 것이 **경유(길 주변 폭)** 다: 길 양옆 ±5km 를 합치면 돌아온다.
 * (±5km 근거: 볼트 궤적 실측 — mockPlans 볼트 판 «라인이면 ±5km·401동» 주석)
 *
 * → 콜을 쥔 뒤의 완전한 그물 = **경유(경로 주변) ∪ 사각형(마지막 하차지→목적지)**.
 *   실물 filterManager 의 «경유 ∪ 도착 목표» 합집합에서 원 자리를 사각형으로 갈아끼우는 것.
 *
 * ⚠️ 길은 직선 근사다 — 실제 경유는 카카오 경로 기준. 부발읍이 직선에서 5.4km 라
 *    여기서는 빠지지만, 실제 도로(3번 국도)는 부발을 지나므로 실물에서는 담긴다.
 */
export function buildFirstLegDemo(withDetourBand: boolean): NetResult {
    const DETOUR_KM = 5;
    const dstR = WAIT_PRESET.dstDiamKm / 2;
    // km 평면에서 점 → 선분(초월→여주) 거리
    const KX = 111.32 * Math.cos(rad(NET_SRC.lat)), KY = 110.574;
    const toKm = (pt: { lng: number; lat: number }): [number, number] =>
        [(pt.lng - NET_SRC.lng) * KX, (NET_SRC.lat - pt.lat) * KY];
    const toGeo = (x: number, y: number): [number, number] =>
        [+(NET_SRC.lng + x / KX).toFixed(5), +(NET_SRC.lat - y / KY).toFixed(5)];
    const [bx, by] = toKm(NET_DST);
    const segLen = Math.hypot(bx, by);
    const segDistKm = (pt: { lng: number; lat: number }) => {
        const [px, py] = toKm(pt);
        const t = Math.max(0, Math.min(1, (px * bx + py * by) / (segLen * segLen)));
        return Math.hypot(px - t * bx, py - t * by);
    };

    const inNet = (pt: { lng: number; lat: number }) =>
        haversineKm(NET_DST, pt) <= dstR || (withDetourBand && segDistKm(pt) <= DETOUR_KM);

    const { pass, grouped } = collectDongs(inNet);

    // 경유 띠 네 귀퉁이 — 길 양옆 ±5km 직사각형 (그리기 전용)
    const nx = -by / segLen * DETOUR_KM, ny = bx / segLen * DETOUR_KM;
    const tri: Array<[number, number]> = withDetourBand
        ? [toGeo(nx, ny), toGeo(bx + nx, by + ny), toGeo(bx - nx, by - ny), toGeo(-nx, -ny), toGeo(nx, ny)]
        : [];

    return {
        tri,
        pass,
        marks: MARK_DONGS.map(m => {
            const c = centroidOfDong(m.dong, m.region);
            return { name: m.name, x: c.lng, y: c.lat, inside: inNet(c) };
        }),
        circles: [{ name: '여주 시내 (하차 = 목적지)', ring: ringOf(NET_DST, dstR) }],
        count: pass.length,
        groups: [...grouped.entries()]
            .map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length),
    };
}

/** 좌표에서 가장 가까운 동 — 점이 어느 동네인가의 근사 (폴리곤이 없어 중심점 최근접으로 잰다) */
export function nearestDong(pt: { lng: number; lat: number }): { name: string; region: string } {
    let best = DONG_CENTROIDS[0], bestD = Infinity;
    for (const row of DONG_CENTROIDS) {
        const d = haversineKm({ lng: row[2], lat: row[3] }, pt);
        if (d < bestD) { bestD = d; best = row; }
    }
    return { name: best[0], region: best[1] };
}

/**
 * ⚖️ **필터 두 단계 판정** (기사님 확정 2026-09-07: *"하차지가 우리 영역에 있는지 확인한 후
 * 있다면 거리 검사를 하는 거지"*)
 *
 *   1단계 · 영역 — 어디까지 보나(폭): 하차지가 그물 안 + 상차지가 현위치 둘레(상차 반경) 안
 *     🔴 첫 콜 뒤에는 상차 영역 = **내 반경 ∩ 사각형** (기사님 확정 2026-09-07 «내 위치 반경이
 *        마름모와 교집합인 부분만»). 대기 중엔 방향이 없으니 360°, 첫 콜이 방향을 정하면
 *        뒤쪽 반원이 닫힌다 — ②의 여유값(반경)이 살려 버리던 «옆 3km 뒤 상차» 구멍을 막는다
 *   2단계 · 거리 — 어느 쪽으로 가나(방향): 목적지까지 세 거리 «상차 : 하차 : 현위치»로
 *     ① 하차가 상차보다 멀면 탈락 (단, 하차가 목적지 원 안이면 통과 — 목적지 도착은 역주행이 아니다)
 *     ② 상차가 현위치보다 멀면 탈락 (여유 = 상차 반경 — 옆 동네 픽업과 GPS 흔들림을 살린다)
 *
 * 🔴 사각형의 기점은 **현위치**다 (기사님 재확정 2026-09-07 오후). 오전의 «하차지 기점»은
 *    사각형이 방향까지 맡던 시절의 답이고, 두 단계가 갈라진 뒤에는 방향을 거리식이 맡으므로
 *    현위치 기점이어야 «출발 전 내 앞길 콜»(현위치~하차지 사이)을 안 버린다.
 *
 * 검산(볼첨지 이틀 12콜 · 노하우_추출 표 «남은 거리» 칸): ①에 걸린 콜 0 · ②에 걸린 콜은
 * 7번 하나(~152:26:~137 — 상차가 15km 등 뒤)였고 **그 콜만 취소로 끝났다.**
 * 폭은 후하게, 방향은 엄격하게 — 영역을 넓혀도 2단계가 뒤를 막는다.
 */
export interface TwoStageVerdict {
    /** 상차·하차 좌표의 최근접 동 (근사 — 폴리곤이 아니라 중심점 거리) */
    pickupDong: { name: string; region: string };
    dropDong: { name: string; region: string };
    /** 1단계 갈래별 결과 */
    dropInNet: boolean;
    pickupNearMe: boolean;
    /** 상차지가 **사각형(원뿔, 꼭짓점 원 제외)** 안인가 — 첫 콜 뒤(routeStarted)에만 통과 조건.
     *  원을 포함해 재면 등 뒤 상차가 원으로 되살아나 ∩ 규칙이 무력해진다 */
    pickupInNet: boolean;
    /** 목적지까지 세 거리 (km) — 화면의 «a : b : c» */
    distPickKm: number;
    distDropKm: number;
    distMeKm: number;
    /** 2단계 갈래별 탈락 사유 */
    dropBackward: boolean;
    pickupBackward: boolean;
    pass: boolean;
}

export function judgeTwoStage(
    p: NetParams, src: NetPoint, dst: NetPoint,
    me: { lng: number; lat: number },
    pickup: { lng: number; lat: number },
    drop: { lng: number; lat: number },
    /** 첫 콜을 잡았는가 — 잡았으면 상차 영역이 «내 반경 ∩ 사각형»으로 조여진다 */
    routeStarted = false,
    /** 🏘️ 관내 국면 — 방향을 안 본다. 상차·하차가 둘 다 목적지 원 안이면 통과 (isLocalPhase 로 판단해 넘긴다) */
    local = false,
    /** 🛣️ 길 경유 띠 모드 — 주면 1단계 소속(하차·상차)을 사각형 대신 이것으로 잰다 (roadZoneOf) */
    zone?: { dropIn(pt: { lng: number; lat: number }): boolean; pickupIn(pt: { lng: number; lat: number }): boolean },
): TwoStageVerdict {
    if (local) {
        const ringKm = Math.max(0, p.dstDiamKm / 2);
        const pIn = haversineKm(dst, pickup) <= ringKm, dIn = haversineKm(dst, drop) <= ringKm;
        return {
            pickupDong: nearestDong(pickup), dropDong: nearestDong(drop),
            dropInNet: dIn, pickupNearMe: pIn, pickupInNet: true,
            distPickKm: +haversineKm(dst, pickup).toFixed(1),
            distDropKm: +haversineKm(dst, drop).toFixed(1),
            distMeKm: +haversineKm(dst, me).toFixed(1),
            dropBackward: false, pickupBackward: false,
            pass: pIn && dIn,
        };
    }
    const inNet = makeInNet(p, src, dst);
    const pickupRadiusKm = Math.max(0, p.srcDiamKm / 2);   // 상차 반경 = 출발지 원 반경을 그대로 쓴다
    const dstRingKm = Math.max(0, p.dstDiamKm / 2);

    const distPickKm = haversineKm(dst, pickup);
    const distDropKm = haversineKm(dst, drop);
    const distMeKm = haversineKm(dst, me);

    const dropInNet = zone ? zone.dropIn(drop) : inNet(drop);
    const pickupNearMe = haversineKm(me, pickup) <= pickupRadiusKm;
    /**
     * ∩ 의 예외 둘 (2026-09-07 다섯 콜 사슬 검산에서 잡힘) — «꼭짓점 자신은 각도를 잴 수 없다»:
     *   · 발밑(1.5km 안) 상차 — 부발에서 부발 상차가 각도 소음으로 잘리면 안 된다.
     *     1.5km 는 아침의 차단 사례(모다 3.8km 뒤)보다 작게 잡은 값이다
     *   · 목적지 원 안 상차 — 도착지 마무리 콜(연라동→단현동)은 방향이 무의미하다
     */
    const pickupInNet = (zone ? zone.pickupIn(pickup) : makeInQuad(p, src, dst)(pickup))
        || haversineKm(me, pickup) <= 1.5
        || haversineKm(dst, pickup) <= dstRingKm;
    const dropBackward = distDropKm > distPickKm && distDropKm > dstRingKm;
    const pickupBackward = distPickKm > distMeKm + pickupRadiusKm;

    return {
        pickupDong: nearestDong(pickup), dropDong: nearestDong(drop),
        dropInNet, pickupNearMe, pickupInNet,
        distPickKm: +distPickKm.toFixed(1), distDropKm: +distDropKm.toFixed(1), distMeKm: +distMeKm.toFixed(1),
        dropBackward, pickupBackward,
        pass: dropInNet && pickupNearMe && (!routeStarted || pickupInNet) && !dropBackward && !pickupBackward,
    };
}

/** 경로의 정거장 하나 — call 은 콜 번호(1부터), kind 는 상·하차 */
export interface RouteStop { call: number; kind: '상차' | '하차'; pt: { lng: number; lat: number } }

/**
 * 🛣️ **정거장 순서를 서버처럼 다시 짠다** (기사님 2026-09-07 «콜을 받으면 서버가 경로를 수정할 거야»).
 * 잡은 순서가 아니라 **가까운 곳 먼저**, 단 **하차는 제 상차 뒤**(안 실은 짐은 못 내린다)라는
 * 제약의 탐욕 순서다. 실물 서버는 카카오 경로 시간 기준이고 여기는 직선거리 근사 — 목업 전용.
 */
export function orderStopsGreedy(
    start: { lng: number; lat: number },
    calls: Array<{ pickup: { lng: number; lat: number }; drop: { lng: number; lat: number } }>,
): RouteStop[] {
    const remaining: RouteStop[] = calls.flatMap((c, i) => [
        { call: i + 1, kind: '상차' as const, pt: c.pickup },
        { call: i + 1, kind: '하차' as const, pt: c.drop },
    ]);
    const ordered: RouteStop[] = [];
    const pickedUp = new Set<number>();
    let pos = start;
    while (remaining.length) {
        let bi = -1, bd = Infinity;
        remaining.forEach((s, i) => {
            if (s.kind === '하차' && !pickedUp.has(s.call)) return;
            const d = haversineKm(pos, s.pt);
            if (d < bd) { bd = d; bi = i; }
        });
        const s = remaining.splice(bi, 1)[0];
        if (s.kind === '상차') pickedUp.add(s.call);
        ordered.push(s); pos = s.pt;
    }
    return ordered;
}

/** 사각형(원뿔) 판정을 밖에서도 쓴다 — 지도 실험실이 «내 반경 ∩ 마름모»를 그릴 때 */
export function quadTesterOf(p: NetParams, src: NetPoint, dst: NetPoint) {
    return makeInQuad(p, src, dst);
}

/**
 * ⛔ **가면 안 되는 지역** (기사님 요청 2026-09-07 «노하우에 가면 안 되는 지역이 있거든»)
 *
 * 하차하고 나면 다음 콜이 안 떠서 갇히는 자리들 — 출처가 있는 것만 올린다 (규칙 ④).
 * 🔴 **필터가 자르지 않는다** — 콜의 주인은 기사님이다 (규칙 ①). 지도에 ⛔ 로 표시하고
 *    판정 카드에 경고만 얹는다. 목록이 자라면 places 테이블(장소 이력)로 옮길 자리다.
 */
export interface TrapDong { dong: string; region: string; why: string; pt: { lng: number; lat: number } }
export const TRAP_DONGS: TrapDong[] = [
    { dong: '산북면', region: '여주시', why: '갇힘 위험 — 콜이 안 뜨는 산지 (기사님 전언 2026-09-07)', pt: centroidOfDong('산북면', '여주시') },
    { dong: '양서면', region: '양평군', why: '두물머리 갇힘 — 볼트 실측 «이 동네 콜이 하나도 없다» (노선_고르는_법 §11-3)', pt: centroidOfDong('양서면', '양평군') },
    { dong: '안중읍', region: '평택시', why: '«어중간하게 떨어져 콜에서 막힐 위기» — 브릿지 콜로 탈출한 자리 (§10-7)', pt: centroidOfDong('안중읍', '평택시') },
];

/**
 * 🏘️ **관내 국면 인지** (기사님 확정 2026-09-07: *"출발지에서 내 위치 거리, 목적지에서 내 위치
 * 거리, 두 개를 알면 그 이후 잡은 콜은 관내 콜로 인지할 수 있다"*)
 *
 * 도착 = 내 위치가 **목적지 원 안** && **출발지 원 밖**(하루를 진행해 왔다).
 * 출발지 거리가 꼭 필요하다 — 복귀 판(목적지=집)은 아침부터 목적지 원 안이라,
 * 목적지 거리 하나로는 «도착»과 «출발 전»을 못 가른다.
 * 관내에서는 방향을 안 본다 — 상차·하차가 둘 다 원 안이면 통과 (복귀 전환은 기사님 클릭).
 */
export function isLocalPhase(p: NetParams, origin: { lng: number; lat: number }, dst: NetPoint, me: { lng: number; lat: number }): boolean {
    return haversineKm(dst, me) <= Math.max(0, p.dstDiamKm / 2)
        && haversineKm(origin, me) > Math.max(0, p.srcDiamKm / 2);
}

/* ── 🛣️ 길(경로) 경유 띠 — «길을 잡아서 작동하는 노선» (기사님 확정 2026-09-07) ── */

/** 점 → 폴리라인 최소 거리 (km 평면 근사 — 이 스케일에서 충분) */
function distToLineKm(pt: { lng: number; lat: number }, line: Array<[number, number]>): number {
    const KX = 111.32 * Math.cos(rad(pt.lat)), KY = 110.574;
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
        const ax = (line[i - 1][0] - pt.lng) * KX, ay = (line[i - 1][1] - pt.lat) * KY;
        const bx = (line[i][0] - pt.lng) * KX, by = (line[i][1] - pt.lat) * KY;
        const dx = bx - ax, dy = by - ay;
        const L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
}

/** 경유 띠 폭 — 볼트 궤적 실측 «라인이면 ±5km · 401동». 값을 바꿀 일이 생기면 손잡이로 뺀다 */
export const ROAD_DETOUR_KM = 5;

/** 길 경유 띠 소속 — 길 양옆 ±폭 ∪ 목적지 원. 1단계 영역을 사각형 대신 이것으로 갈아끼운다 */
export function roadZoneOf(line: Array<[number, number]>, dst: NetPoint, dstDiamKm: number, detourKm: number = ROAD_DETOUR_KM) {
    const ringKm = Math.max(0, dstDiamKm / 2);
    const inZone = (pt: { lng: number; lat: number }) =>
        haversineKm(dst, pt) <= ringKm || distToLineKm(pt, line) <= detourKm;
    return { dropIn: inZone, pickupIn: inZone };
}

/** 길 경유 띠의 동 목록 — 지도에 파란 점·표로 그릴 재료 (사각형 판의 buildNet 과 같은 꼴) */
export function buildRoadNet(line: Array<[number, number]>, dst: NetPoint, dstDiamKm: number, detourKm: number = ROAD_DETOUR_KM): NetResult {
    const { dropIn } = roadZoneOf(line, dst, dstDiamKm, detourKm);
    const { pass, grouped } = collectDongs(dropIn);
    return {
        tri: [], pass,
        marks: MARK_DONGS.map(m => {
            const c = centroidOfDong(m.dong, m.region);
            return { name: m.name, x: c.lng, y: c.lat, inside: dropIn(c) };
        }),
        circles: [{ name: dst.name, ring: ringOf(dst, Math.max(0, dstDiamKm / 2)) }],
        count: pass.length,
        groups: [...grouped.entries()]
            .map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length),
    };
}

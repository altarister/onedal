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
    // 구가 있는 시는 사전 표기가 «화성시 동탄구»처럼 갈라져 있다 — 정확 일치가 없으면 접두로 모은다 (2026-09-08 화성시에서 실측)
    let all = DONG_CENTROIDS.filter(d => d[1] === city);
    if (all.length === 0) all = DONG_CENTROIDS.filter(d => d[1].startsWith(`${city} `));
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
    /**
     * 🏘️ **관내 규칙으로 쟀는가** (기사님 지적 2026-09-09).
     *
     * 🔴 화면이 이걸 안 읽고 «관내 모드인가»만 보다가 **거짓말을 했다.** 관내 규칙은
     *    «그 목적지가 고른 목적지일 때»만 도는데(복귀로 접히면 안 돈다), 화면은 배지도 칩도
     *    관내 문구를 그대로 띄웠다 — 「내 위치 반경 밖」을 「상차 **원** 밖」이라고 적었다.
     *    **잰 쪽이 그렇게 쟀다고 말해야 한다.**
     */
    local: boolean;
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
    /** 🛣️ 노선 모드 — 주면 1단계 소속(하차·상차)을 마름모 대신 이것으로 잰다 (lineZoneOf) */
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
            dropBackward: false, pickupBackward: false, local: true,
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
     * ∩ 의 예외 둘 (2026-09-07 다섯 콜 이어 달리기 검산에서 잡힘) — «꼭짓점 자신은 각도를 잴 수 없다»:
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
        dropBackward, pickupBackward, local: false,
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

/**
 * 🧭 **재배치 — «가는 길에 하나 더» 끼워 넣기** (기사님 순서 ④⑫ 2026-09-08:
 * *"콜에 있는 모든 좌표를 가지고 우리 시스템이 «최적경로»를 찾은 후 최적경로순으로 재배치해"*).
 *
 * 🔴 **첫 콜을 다 끝내고 다음으로 가면 그건 합짐이 아니다** (기사님: *"가는 길에 하나 더
 * 가져가는 거지 — 그래서 순번이 있는 것 아냐"*). 그래서 콜 단위로 묶어 나열하지 않는다.
 *
 * 방식은 **가장 싸게 끼워 넣기(cheapest insertion)**:
 *   콜을 **잡은 순서대로** 하나씩, 그 콜의 상차·하차를 지금 순서의 어느 자리에 넣을 때
 *   총 거리가 가장 짧은지 전부 재 보고 그 자리에 넣는다 (상차는 언제나 제 하차보다 앞).
 *
 * 이 방식을 고른 이유 — 실측(2026-09-08):
 *   · 같은 판 두 콜   순차 76.2km → **40.6km**
 *   · 판이 다른 세 콜 판 그룹 157.3km → **83.4km**
 *   · 옛 요요 사고    판 그룹 83.7km → **83.4km** (되내려오는 요요도 없다)
 * 잡은 콜들의 **상대 순서를 안 흔든다**는 것도 중요하다 — 이미 약속한 순서가 재계산마다
 * 뒤집히면 기사님이 화면을 못 믿는다. `visited` 는 그대로 앞에 잠근다.
 */
export function orderStopsInsert(
    start: { lng: number; lat: number },
    calls: Array<{ pickup: { lng: number; lat: number }; drop: { lng: number; lat: number }; destName: string }>,
    visited: Array<{ call: number; kind: '상차' | '하차' }> = [],
): RouteStop[] {
    const ptOf = (v: { call: number; kind: '상차' | '하차' }) =>
        v.kind === '상차' ? calls[v.call - 1].pickup : calls[v.call - 1].drop;
    const valid = visited.filter(v => v.call >= 1 && v.call <= calls.length);
    const visitedKey = new Set(valid.map(v => `${v.call}-${v.kind}`));
    const locked: RouteStop[] = valid.map(v => ({ call: v.call, kind: v.kind, pt: ptOf(v) }));
    const from = locked.length ? locked[locked.length - 1].pt : start;
    const lengthOf = (seq: RouteStop[]) => {
        let total = 0, pos = from;
        for (const s of seq) { total += haversineKm(pos, s.pt); pos = s.pt; }
        return total;
    };

    let seq: RouteStop[] = [];
    calls.forEach((c, i) => {
        const call = i + 1;
        const pick: RouteStop = { call, kind: '상차', pt: c.pickup };
        const dropStop: RouteStop = { call, kind: '하차', pt: c.drop };
        const need = [pick, dropStop].filter(s => !visitedKey.has(`${s.call}-${s.kind}`));
        if (need.length === 0) return;
        let best: { len: number; seq: RouteStop[] } | null = null;
        const tryIt = (candidate: RouteStop[]) => {
            const len = lengthOf(candidate);
            if (!best || len < best.len) best = { len, seq: candidate };
        };
        if (need.length === 2) {
            for (let a = 0; a <= seq.length; a++)
                for (let b = a; b <= seq.length; b++) {
                    const t = [...seq];
                    t.splice(b, 0, dropStop); t.splice(a, 0, pick);   // 하차 먼저 넣고 상차를 앞에 — 상차가 항상 앞선다
                    tryIt(t);
                }
        } else {
            for (let a = 0; a <= seq.length; a++) { const t = [...seq]; t.splice(a, 0, need[0]); tryIt(t); }
        }
        seq = best!.seq;
    });
    return [...locked, ...seq];
}

/**
 * 🎯 **목적지별 판정 — ⑮ 동선의 기준** (기사님 확정 2026-09-08:
 * *"목적지가 하나면 하나고 둘이면 마름모가 둘. 목적지당 마름모 하나씩, 목적지는 반경의 원을 가진다"*).
 *
 * 목적지 하나 = 마름모 하나. 콜은 **목적지마다 각각** 재고 **하나라도 통과하면 통과**다.
 * 통과한 목적지가 그 콜의 판(destName)이 된다.
 *   · 둘 다 통과하면 **복귀가 이긴다** (복귀 콜은 잡기 어려우니 우선 — 목록 순서와 무관)
 *   · 목적지는 «기사님의 의도»라 **콜을 다 해도 안 죽는다** — 이 함수는 콜 유무를 안 본다
 *   · 🔴 예외 장치(homeCaught·∩ 전환·주/부 트랙)는 **폐기했다.** 목적지는 각자 제 마름모로
 *     살아 있을 뿐이고, 첫 콜 뒤 ∩ 는 각 마름모 안에서 자기 원뿔로 걸린다
 */
export interface GoalVerdict { goal: NetPoint; verdict: TwoStageVerdict }
export interface GoalsVerdict { results: GoalVerdict[]; pass: boolean; wonGoal: NetPoint | null; won: TwoStageVerdict | null }
export function judgeGoals(
    p: NetParams, anchor: NetPoint, goals: NetPoint[],
    me: { lng: number; lat: number },
    pickup: { lng: number; lat: number },
    drop: { lng: number; lat: number },
    opts: {
        /**
         * 🔴 **짐을 실은 목적지들** (⑮ 기준 5 · 2026-09-08 회귀에서 갈랐다).
         * ∩(상차 조이기)는 «짐을 실었으면 되돌아가지 않는다»는 규칙이라 **그 목적지에만** 건다 —
         * 아직 아무것도 안 실은 목적지(복귀 대기)는 원 전체가 상차 영역이다. 미리 잡는 그물을
         * 실은 짐이 묶으면 안 된다: 파주 짐을 싣고 복귀를 켠 그 순간이 이 기능의 유일한 쓸모다.
         */
        loadedNames?: string[];
        /** 이 목적지에 «도착»했는가 (관내 — 원 규칙). 목적지 이름으로 답한다 */
        isLocal?: (goal: NetPoint) => boolean;
        /** 노선(길 띠) 판정기 — 그 목적지의 길이 정해졌을 때 */
        zoneOf?: (goal: NetPoint) => { dropIn(pt: { lng: number; lat: number }): boolean; pickupIn(pt: { lng: number; lat: number }): boolean } | undefined;
        /** 우선하는 목적지 이름 (복귀). 둘 다 통과하면 이쪽이 이긴다 */
        preferName?: string;
    } = {},
): GoalsVerdict {
    const results: GoalVerdict[] = goals.map(goal => ({
        goal,
        verdict: judgeTwoStage(p, anchor, goal, me, pickup, drop,
            (opts.loadedNames ?? []).includes(goal.name),        // ∩ — 짐 실은 목적지에만
            opts.isLocal?.(goal) ?? false, opts.zoneOf?.(goal)),
    }));
    const passed = results.filter(r => r.verdict.pass);
    const won = passed.find(r => r.goal.name === opts.preferName) ?? passed[0] ?? null;
    return { results, pass: !!won, wonGoal: won?.goal ?? null, won: won?.verdict ?? null };
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

/**
 * 🧩 **노선의 그물 — 라인 ∪ 남은 구간 마름모** (기사님 확정 2026-09-09).
 *
 * 기사님: *"내 위치에서 평촌까지는 노선처럼 라인 반경으로 가고 마름모는 평촌에서 파주로 만들어.
 * 그럼 쓸데없는 면적이 줄어드니까 노이즈가 줄고, 평촌부터 파주까지는 어떤 경로든 허용하고
 * 내 위치에서 평촌까지는 계속 합짐의 기회가 있어."*
 *
 * ```
 * 내 위치 ──라인 반경──▶ (잡은 콜들의 정거장) ──▶ 마지막 하차지 ──마름모──▶ 목적지
 *         가기로 정해진 구간 = 길이 하나다      아직 안 정한 구간 = 어느 길이든 열린다
 * ```
 *
 * 🔴 **상차와 하차가 보는 곳이 다르다** (기사님 확정 2026-09-09).
 *   · 상차지 — **라인 위**만. 판정은 여기에 «내 위치 반경»을 **곱한다**(`judgeTwoStage` 의
 *     `pickupNearMe`), 그래서 결과가 «내 위치 원 ∩ 라인»이 된다. 지금 갈 수 있는 곳에서만 싣는다
 *   · 하차지 — **라인 ∪ 마름모 ∪ 목적지 원.** 그래야 광주에서 파주로 바로 가는 큰 콜이 산다
 *
 * `lastDrop` 이 없으면(콜을 아직 안 쥠) 마름모 자리는 비고 라인만 남는다 — 호출부가
 * 그 경우 애초에 이 함수를 안 부른다(마름모 하나로 본다).
 */
export function lineZoneOf(
    line: Array<[number, number]>, lineRadiusKm: number,
    lastDrop: NetPoint | null, p: NetParams, dst: NetPoint,
) {
    const ringKm = Math.max(0, p.dstDiamKm / 2);
    /**
     * 🔴 **마름모의 시작 꼭짓점에는 원을 두르지 않는다** (기사님 지적 2026-09-09:
     * *"중간 기착지인 평촌동도 점선 라인과 영역에 지역들을 가지고 있는데 이걸 빼야 해"*).
     *
     * 동선의 마름모(`makeInNet`)는 **두 꼭짓점 원 ∪ 사각형**이다. 출발 꼭짓점의 원은
     * «내가 서 있는 자리는 방위를 잴 수 없다»를 메우려고 두른 것이라 **내 위치일 때만** 뜻이 있다.
     * 노선에서 그 자리는 **마지막 하차지**이고, 거기는 이미 **라인의 끝**이라 라인 반경이 담는다.
     * 원을 또 두르면 **지나온 뒤쪽까지** 담겨 노이즈가 된다 — 그래서 여기는 사각형만 쓴다.
     */
    const inRest = lastDrop ? makeInQuad(p, lastDrop, dst) : () => false;
    const onLine = (pt: { lng: number; lat: number }) => line.length >= 2 && distToLineKm(pt, line) <= lineRadiusKm;
    return {
        dropIn: (pt: { lng: number; lat: number }) => onLine(pt) || haversineKm(dst, pt) <= ringKm || inRest(pt),
        pickupIn: onLine,
    };
}

/** 노선 그물의 동 목록 — 지도에 점·표로 그릴 재료. 사각형은 «마지막 하차지 → 목적지» 것을 쓴다 */
export function buildLineNet(
    line: Array<[number, number]>, lineRadiusKm: number,
    lastDrop: NetPoint | null, p: NetParams, dst: NetPoint,
): NetResult {
    const { dropIn } = lineZoneOf(line, lineRadiusKm, lastDrop, p, dst);
    const rest = lastDrop ? buildNet(p, lastDrop, dst) : null;
    const { pass, grouped } = collectDongs(dropIn);
    return {
        tri: rest?.tri ?? [],
        pass,
        marks: MARK_DONGS.map(m => {
            const c = centroidOfDong(m.dong, m.region);
            return { name: m.name, x: c.lng, y: c.lat, inside: dropIn(c) };
        }),
        // 🔴 원은 **목적지 하나**다 — 마지막 하차지 원은 위 주석대로 안 두른다 (기사님 2026-09-09)
        circles: [{ name: dst.name, ring: ringOf(dst, Math.max(0, p.dstDiamKm / 2)) }],
        count: pass.length,
        groups: [...grouped.entries()]
            .map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length),
    };
}

/**
 * 🎯 **목적지 하나의 그물을 고른다 — 라인이 있으면 라인, 없으면 마름모** (기사님 지적 2026-09-09).
 *
 * 🔴 **이 갈림을 화면 안에 두었다가 사고가 났다.** 라인을 «노선 목적지»에만 걸어서,
 *    복귀콜을 잡아 목적지가 «집»으로 접히는 순간 **라인이 통째로 빠졌다** —
 *    기사님: *"복귀콜로 집에 가는 중인데 이 모습은 첫짐의 동선과 같다."*
 *    갈림을 여기로 꺼내야 검사가 잡는다 (그 버그는 화면 안에 있어서 아무 검사도 못 봤다).
 *
 * 🔴 **라인은 목적지에서 나오지 않는다 — 잡은 콜들에서 나온다.** 목적지가 파주든 집이든
 *    달릴 길은 하나뿐이고, 갈리는 것은 마름모(마지막 하차지 → 그 목적지)뿐이다.
 */
export function netForGoal(goal: NetPoint, o: {
    /** 잡은 콜들이 만든 실제 경로. `null` 이면 아직 없다 — 그때는 마름모 하나다 */
    line: Array<[number, number]> | null;
    lineRadiusKm: number;
    /** 마름모가 시작하는 자리 (마지막 하차지). 라인이 없으면 안 쓴다 */
    lastDrop: NetPoint | null;
    params: NetParams;
    /** 라인이 없을 때 마름모의 출발 꼭짓점 — 내 위치 */
    anchor: NetPoint;
}): NetResult {
    return o.line
        ? buildLineNet(o.line, o.lineRadiusKm, o.lastDrop, o.params, goal)
        : buildNet(o.params, o.anchor, goal);
}

/**
 * 🏠 **지금 살아 있는 목적지 — 복귀는 세 상태다** (기사님 확정 2026-09-09).
 *
 * 기사님: *"파주를 목적으로 콜을 수행하던 중 복귀콜을 누르면, 그 의미는 **복귀콜을 잡기
 * 전까지 관내콜을 진행하다가 복귀콜을 잡으면 복귀를 진행한다** 이거야.
 * **복귀가 진행되면 목적지를 향한 콜이 뜨면 안 되는 거고.**"*
 *
 * | 상태 | 살아 있는 목적지 | 뜻 |
 * |---|---|---|
 * | 복귀 끔 | 목적지 | 평소 |
 * | 복귀 켬 · 복귀콜 없음 | **둘 다** | 복귀 대기 — 그동안 관내콜을 진행한다 |
 * | 복귀 켬 · **복귀콜 잡음** | **집 하나** | 복귀 진행 — 목적지 콜은 뜨면 안 된다 |
 *
 * 🔴 **⑮ 기준의 «목적지는 콜을 다 해도 안 죽는다» 는 죽는 조건을 잘못 적은 것이었다**
 *    (2026-09-09 정정). 죽는 조건은 «그 목적지 콜을 다 했나»가 아니라 **«복귀콜을 잡았나»** 다.
 *    폐기한 것은 «파주를 집 원뿔로 자른다»(∩ 전환 특례)이지 이 규칙이 아니었는데,
 *    둘을 한 덩어리로 묶어 같이 버렸다.
 *
 * 실물도 같은 말을 한다 — `PHASE_FIELDS.home.destinationCity = 'auto'`,
 * `PHASE_AUTO_SOURCE.home = '설정의 집 주소'` (복귀 국면이면 도착 목표가 집이 된다).
 */
export function activeGoals<T>(dst: T, home: T, opts: { homeOn: boolean; homeCaught: boolean }): T[] {
    if (!opts.homeOn) return [dst];
    return opts.homeCaught ? [home] : [dst, home];
}

/**
 * 🚗 **다음 목표 정거장 — 주행은 되돌아가지 않는다** (2026-09-09 실측으로 잡은 규칙).
 *
 * 경로 **전체**에서 가장 가까운 점을 고르면, 수도권처럼 경로가 제 몸을 스쳐 지나가는
 * 곳에서 «이미 지나온 구간»이 제일 가까울 수 있다. 그러면 목표가 뒤로 뛰고 차가
 * 되돌아간다 — 실측: «1→2→3 을 두 번 왕복»했고, 그동안 모의 시계만 흘러 65분짜리
 * 마지막 구간을 **3시간 38분** 동안 못 끝냈다.
 *
 * 🔴 그래서 **아직 안 지난 구간에서만** 고른다. 점의 `seq` 는 «향하는 정거장 순번»이라,
 *    `seq > visitedCount` 인 것부터가 앞길이다.
 */
export function pickNextTarget(
    path: ReadonlyArray<{ lng: number; lat: number; seq: number }>,
    from: { lng: number; lat: number },
    visitedCount: number,
): number {
    if (path.length < 1) return 0;
    const firstAhead = path.findIndex(p => p.seq > visitedCount);
    const start = firstAhead < 0 ? path.length - 1 : firstAhead;
    let best = start, bd = Infinity;
    for (let i = start; i < path.length; i++) {
        const d = Math.hypot((path[i].lng - from.lng) * 88.6, (path[i].lat - from.lat) * 110.574);
        if (d < bd) { bd = d; best = i; }
    }
    return Math.min(best + 1, path.length - 1);
}

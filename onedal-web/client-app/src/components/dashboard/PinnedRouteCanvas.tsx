import { sectionLinesOf } from '@onedal/shared';
import React, { useRef, useCallback, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
import { isEvaluating } from "@onedal/shared";
import sidoDataRaw from '../../mapData/sidoData.json';
import { getDistanceKm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS, withAlpha } from '../../styles/themes';
import { callNodeFill, callNodeStroke, callNodeText } from '../../styles/callPalette';
import {
    TILE_SIZE, TILE_MAX_ZOOM, anchorBaseOf, computeViewport, toScreenPoint, panAfterZoom, pinchStep, mapTileTone, routeLineWidth, viewCoordsFor, effectiveZoom, type MapViewMode,
    type Viewport, pickViewMode } from '../../lib/mapProjection';
import { occludedPx as occludedOf } from '../../lib/stageLayout';

const sidoData = sidoDataRaw as any; // GeoJSON FeatureCollection

/**
 * 🗺️ **배경 타일 — 회색조로 연하게** (기사님 확정 2026-09-01 · 세 안 비교 후 C 채택).
 *
 * 지도한테 빌리는 것은 **«어느 동네 어느 도로인가» 하나뿐**이다. 마커·경로선·발자취·
 * 이름표·탭 판정은 전부 우리가 그린다 — 그래서 SDK 를 들이지 않는다. SDK 를 쓰면
 * 줌·팬의 임자를 통째로 내줘야 하는데, 그건 «배경만»이 아니게 된다.
 *
 * 🔴 **키가 없다.** 카카오 지도는 JS 키 + 도메인 등록 + 관제앱(Capacitor)의
 *    `localhost` 오리진 처리가 붙는다. 배경 한 장 때문에 치를 값이 아니다.
 *    표기 의무(© OpenStreetMap)는 캔버스 우하단에 그린다.
 */
/** 타일 이미지 캐시 — 컴포넌트가 다시 떠도 산다 (재요청 = OSM 서버에 대한 결례) */
const tileCache = new Map<string, HTMLImageElement>();
const TILE_CACHE_MAX = 600;

/** `ctx.filter` 는 옛 사파리에 없다 — 없으면 색 그대로 깔리되 투명도로만 눌린다 */
const supportsCanvasFilter = (ctx: CanvasRenderingContext2D) => typeof ctx.filter === 'string';

/**
 * 🖼️ **지금 화면에 걸치는 타일을 모아 준다** — 아직 안 온 것은 요청만 하고 빼놓는다.
 *
 * 🔴 «없으면 안 그린다»가 맞다. 반쯤 온 배경 위에 시·도 외곽선을 겹쳐 그리면
 *    두 배경이 비쳐 지저분해진다 — 하나라도 오면 타일, 아니면 외곽선(부르는 쪽에서 가른다).
 */
function collectTiles(
    v: Viewport, width: number, height: number, onTileReady: () => void,
): Array<{ img: HTMLImageElement; cx: number; cy: number; size: number }> {
    const { worldSize, anchorX, anchorY, centerNx, centerNy } = v;
    const z = Math.max(0, Math.min(TILE_MAX_ZOOM, Math.round(Math.log2(worldSize / TILE_SIZE))));
    const count = Math.pow(2, z);
    const tileScreenSize = worldSize / count;
    if (!Number.isFinite(tileScreenSize) || tileScreenSize <= 0) return [];

    /** 화면 모서리를 정규 좌표로 되돌린다 — 어느 타일이 걸치는지 알려면 */
    const toNx = (screenX: number) => (screenX - anchorX) / worldSize + centerNx;
    const toNy = (screenY: number) => (screenY - anchorY) / worldSize + centerNy;

    const txFrom = Math.floor(toNx(0) * count), txTo = Math.floor(toNx(width) * count);
    const tyFrom = Math.floor(toNy(0) * count), tyTo = Math.floor(toNy(height) * count);

    // 🛟 화면이 아주 넓게 축소되면 타일 수가 폭발한다 — 그럴 땐 외곽선으로 떨어진다
    if ((txTo - txFrom + 1) * (tyTo - tyFrom + 1) > 120) return [];

    const ready: Array<{ img: HTMLImageElement; cx: number; cy: number; size: number }> = [];
    for (let tx = txFrom; tx <= txTo; tx++) {
        for (let ty = tyFrom; ty <= tyTo; ty++) {
            if (tx < 0 || ty < 0 || tx >= count || ty >= count) continue;
            const key = `${z}/${tx}/${ty}`;
            let img = tileCache.get(key);
            if (!img) {
                if (tileCache.size >= TILE_CACHE_MAX) {
                    const oldest = tileCache.keys().next().value;      // 들어온 순서대로 버린다
                    if (oldest) tileCache.delete(oldest);
                }
                img = new Image();
                img.onload = onTileReady;
                img.onerror = () => { (img as any).failed = true; };   // 실패해도 다시 안 조른다
                img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
                tileCache.set(key, img);
            }
            if (!img.complete || !img.naturalWidth || (img as any).failed) continue;
            ready.push({
                img,
                cx: (tx / count - centerNx) * worldSize + anchorX,
                cy: (ty / count - centerNy) * worldSize + anchorY,
                size: tileScreenSize,
            });
        }
    }
    return ready;
}

export interface RoutePoint {
    type: string;
    name: string;
    isEvaluating: boolean;
    x?: number;
    y?: number;
    routeId?: string;
    /**
     * 🔢 이 정거장의 사이클 번호 — **밖에서 실어 준다**(`stopNoOf`).
     * 🔴 캔버스가 «남은 목록의 몇 번째»로 세면 안 된다 — 2026-09-01 실측:
     *    이름표는 «1. 곤지암읍», 지도 마커는 «2 곤지암읍» 이라 한 화면이 두 답을 했다.
     */
    no?: number;
    /**
     * 🌈 **몇 번 콜인가** — 색상(hue)이 이걸로 정해진다 (`rainbowNodes` 켤 때만 쓴다).
     * 🔴 정거장 번호(`no`)와 **다른 값**이다 — 콜 하나가 정거장 둘을 갖는다 (규칙 ⑤ «읽는 곳»).
     */
    callNo?: number;
    /** 👣 이미 다녀온 정거장인가 — 테두리가 흰색↔회색으로 갈린다 */
    visited?: boolean;
}

interface Props {
    /** 👣 지나온 발자취 — 표시 전용. no = 방문 순서로 동결된 사이클 번호표 (①) */
    visitedTrail?: Array<{
        x: number; y: number; type: '상차' | '하차'; orderId: string; name: string; no: number;
        /** 🌈 몇 번 콜인가 — 색표를 켜면 남은 정거장과 같은 규칙으로 그린다 */
        callNo?: number;
    }>;
    /** 🎨 콜 ID → 고유 색 — 마커 테두리와 덱 카드 점이 같은 색을 본다 (②) */
    callColors?: Map<string, string>;
    /** 🖐️ 마커 탭 — 그 콜 카드로 (S6 문법: 지나온 곳은 확인·수정) */
    onStopTap?: (orderId: string) => void;
    /** 👣 이번 사이클에 실제로 달린 자취 — 연한 선으로 남는다 (표시 전용) */
    drivenTrail?: Array<{ x: number; y: number }>;
    /** 🧭 경로를 든 콜 — 서버가 고른 답. 여기서 다시 찾지 않는다 (0831 잔상 수리) */
    routeHolder?: SecuredOrder | null;
    /**
     * 🔺 **첫 콜 그물을 눈으로 본다** — 목업 전용 (기사님 2026-09-06).
     * 꼭짓점을 «목적지»에 둔 삼각형. 출발점 쪽이 넓고 목적지로 갈수록 좁다 —
     * 가까운 곳은 크게 돌아도 싸고, 먼 곳은 조금만 벗어나도 비싸기 때문이다.
     * 지도 위에 겹쳐 그려서 «무엇이 들어오고 무엇이 빠지나»를 보고 이야기한다.
     */
    coneOverlay?: {
        tri: Array<[number, number]>;
        pass?: Array<{ x: number; y: number }>;
        marks?: Array<{ name: string; x: number; y: number; inside: boolean }>;
        /** ⭕ 꼭짓점 둘레의 원 — 좌표 배열로 받는다 (화면 픽셀이 아니라 «땅 위의 원»이라야 줌에 안 흔들린다) */
        circles?: Array<{ name: string; ring: Array<[number, number]> }>;
        /** ⛓️ 잡은 콜의 경로 — 출발지→상차→하차를 직선으로 잇고 점마다 이름표를 단다 (기사님 2026-09-07).
         *  `color` 는 그 점과 **그 점으로 들어오는 구간**의 색 — 기존 경로와 이번 콜을 색으로 가른다 */
        callPath?: Array<{ x: number; y: number; label: string; color?: string }>;
    } | null;
    /**
     * 🕸️ **콜 그물 — 지금 필터가 무엇을 담고 있나** (이식 B3-2 · 2026-09-11).
     *
     * 🔴 위 `coneOverlay` 와 **다른 것**이다. 그쪽은 시트 목업이 쓰는 옛 모양(하늘색 점·호박 원)이고,
     *    이쪽은 **지도 실험실 모양** — 마름모·원을 한 겹으로 옅게 깔고, 라인 띠를 두르고,
     *    든 동을 점으로 찍는다. 둘을 한 prop 으로 합치면 한쪽을 고칠 때 다른 쪽이 흔들린다.
     * ⚠️ `usedLine` 은 **계산이 함께 내놓는다** — 그리기가 제 조건으로 다시 판단하면 갈린다
     *    (2026-09-09 사고: 계산은 라인 그물인데 그리기만 마름모인 척했다 · 규칙 ③).
     */
    netOverlay?: {
        tri: Array<[number, number]>;
        pass: Array<{ x: number; y: number; name: string; region: string }>;
        circles: Array<{ name: string; ring: Array<[number, number]> }>;
        usedLine: boolean;
        /** 라인 띠의 폭 — 경로 양옆 km */
        lineRadiusKm: number;
        /** 🎯 목적지 — 마름모의 끝 꼭짓점이자 지도 마커 */
        goal: { name: string; lng: number; lat: number };
    } | null;
    unifiedRoutePoints: RoutePoint[];
    /** **진행 중인 콜만** 넘긴다. 종료된 콜을 여기서 거르지 않는다 —
     *  계약을 좁히면 거르기를 잊을 자리가 없어진다 (2026-08-10 전수조사) */
    liveRoute: SecuredOrder[];
    myLocation: { x: number, y: number } | null;
    children?: React.ReactNode;
    /** 🎭 무대 배경일 때 — 부모를 가득 채운다 (기본 h-64는 옛 화면용) */
    fill?: boolean;
    /**
     * 🪟 **지금 시트가 어디까지 올라와 있나** — 그만큼 지도가 위로 비켜 준다
     * (기사님 요청 2026-09-01: *"반쯤 열리면 같이 볼 수 있을 것 같은데"*).
     * 옛 화면은 시트가 없으므로 넘기지 않는다 — 그때는 화면 전체가 지도다.
     */
    /**
     * 🗺️ **아래가 몇 px 가려졌나** (2026-09-05 · 부품 결합을 끊으며 바뀐 이름).
     *
     * 🔴 예전에는 `sheetSnap`·`sheetPx` 로 **«시트»를 받았다.** 그러면 지도가
     *    «시트라는 것이 있고 세 단을 갖는다»를 알게 되어, **시트를 갈아치우는 날
     *    지도가 함께 깨진다.** 지도가 알아야 할 것은 «아래가 얼마나 가려졌나» 하나다.
     * ⚠️ 상한(무대의 58%)은 `lib/stageLayout` 이 건다 — 여기서 또 자르지 않는다.
     */
    occludedPx?: number;
    /**
     * 🌈 **콜 색표로 그린다** (기사님 확정 2026-09-04 · `styles/callPalette.ts`).
     * 색상=콜 · 채도=상차/하차 · 테두리=다녀왔나.
     *
     * 🔴 **기본은 꺼져 있다** — 실물은 예전대로 그리고, 목업(`/mockup/sheet`)만 켠다.
     *    기사님이 «이걸로 가자» 하시면 그때 기본값을 뒤집고 이 프롭을 지운다
     *    (화면개편의 «토글 병행»과 같은 방식).
     */
    /**
     * 🌈 **09-04 색표를 쓰는가** — 기본이 «쓴다»다 (기사님 확정 2026-09-05).
     * 🔴 기본이 꺼짐이면 **안 넘기는 화면이 조용히 옛 문법**(상차 초록·하차 로즈)으로 그린다.
     *    끄는 자리는 목업 조작판 하나뿐이다 (옛 색과 나란히 보려고 남긴다).
     */
    rainbowNodes?: boolean;
}

export default function PinnedRouteCanvas({ unifiedRoutePoints, liveRoute, myLocation, children, fill, visitedTrail, callColors, onStopTap, drivenTrail, routeHolder, coneOverlay, netOverlay, occludedPx, rainbowNodes = true }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const mapColors = MAP_THEME_COLORS[theme];

    // 초경량 성능을 위한 퓨어 줌/팬 상태 (React State 대신 Ref 사용으로 60fps 보장)
    /**
     * 🔭 **지도가 무엇에 맞춰지나** — 전체 / 이번 구간 / 현위치 (기사님 실주행 09-03).
     * 🔴 **손이 이긴다** — 팬·줌을 하면 `all` 로 풀린다. 손으로 옮겨 놓은 화면을
     *    다음 그림에서 코드가 도로 끌어가면 «내 손이 안 먹는다»가 된다.
     */
    const [viewMode, setViewMode] = React.useState<MapViewMode>('all');
    /**
     * 🧅 **레이어 — 무엇을 보고 무엇을 덮을까** (이식 B4 · 2026-09-11 · 지도 실험실에서).
     *
     * ⚠️ **다섯이다 — 실험실은 여섯**이었다. 여섯째 «시험콜»은 *지도를 눌러 만든 콜*이라
     *    실물에 대응이 없다 (콜은 배차망이 준다). 없는 것을 토글로 두면 눌러도 아무 일이 없다.
     *
     * 🔴 **한 버튼 뒤에 접어 둔다** — 이 레포가 이미 쓴 문법이다 (`a41edca` 폰 줄: *"모드를 하나로 —
     *    누르면 셋이 펼쳐진다"*). 운전 중에는 입력을 못 하므로(실측: 안전취소 24건) 버튼 여섯이
     *    늘 떠 있으면 지도만 좁아진다. 한 번 정해 두고 접는 값이다.
     * 🔴 **고른 것은 기억한다** — 그물을 껐는데 다음에 켜져 있으면 또 끈다.
     *    브라우저에만 남는 편의값이라 못 읽어도 그만이다 (읽기·쓰기 전부 try).
     */
    const [layers, setLayers] = React.useState<Record<string, boolean>>(() => {
        const defaults = { base: true, border: true, net: true, route: true, trail: true };
        try {
            const v = localStorage.getItem('mapLayers');
            return v ? { ...defaults, ...JSON.parse(v) } : defaults;
        } catch { return defaults; }
    });
    const [layersOpen, setLayersOpen] = React.useState(false);
    const toggleLayer = (k: string) => setLayers(prev => {
        const next = { ...prev, [k]: !prev[k] };
        try { localStorage.setItem('mapLayers', JSON.stringify(next)); } catch { /* 못 적어도 화면은 돈다 */ }
        return next;
    });
    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const lastDist = useRef(0);
    /** 마지막으로 그린 마커의 화면 좌표 — 탭 히트 판정용 (그릴 때마다 갱신) */
    const markerHits = useRef<Array<{ cx: number; cy: number; orderId: string }>>([]);
    const movedPx = useRef(0);   // 팬과 탭을 가른다
    /**
     * 🖼️ 타일이 늦게 도착하면 **그때 다시 그린다** — 이미지 `onload` 가 부를 최신 `drawMap`.
     *    `drawMap` 은 매번 새 함수라 `onload` 에 직접 걸면 옛 함수가 박힌다.
     */
    const drawRef = useRef<() => void>(() => { });
    /**
     * 🪟 **시트를 따라 «미끄러져» 간다** — 지금 반영 중인 가림 높이(px).
     *
     * 시트는 `height .25s ease` 로 움직인다. 지도가 목표값으로 **한 번에 튀면** 시트가
     * 아직 오는 중인데 경로만 먼저 뛰어 두 개가 따로 논다. 매 프레임 남은 거리의 일부만
     * 좁혀 같은 시간에 함께 도착하게 한다. `null` 은 «아직 한 번도 안 그렸다» —
     * 첫 그림은 애니메이션 없이 제자리에서 시작한다.
     */
    const occludedNow = useRef<number | null>(null);

    // 캔버스 미니맵 렌더링 (단독 함수로 분리하여 제스처 시 즉각 호출)
    const drawMap = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 고해상도(DPI) 디스플레이 대응
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);

        const validPoints = unifiedRoutePoints.filter(p => typeof p.x === 'number' && typeof p.y === 'number') as (RoutePoint & { x: number, y: number })[];

        // 🧭 경로선의 주인은 서버가 정한다 — 여기서 추측하면 판정이 세 벌이 된다 (0831)
        const currentPolyline = routeHolder?.routePolyline || [];
        // 🟡 S4 — 평가 중 후보를 붙인 경로는 «미리보기»다. 확정 경로인 척하면 안 된다 (#64)
        const isPreviewRoute = !!routeHolder && isEvaluating(routeHolder.status);
        const hasPolyline = currentPolyline.length > 0;

        const validPolyline = currentPolyline.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        const trail = (visitedTrail ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const driven = (drivenTrail ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const allCoords = [...validPoints, ...validPolyline, ...trail, ...driven] as { x: number, y: number }[];
        if (myLocation) allCoords.push(myLocation);
        /* 🔺 그물을 켜면 그 삼각형까지 보이게 — 안 그러면 현위치만 확대돼 선 하나만 스쳐 간다 */
        if (coneOverlay) for (const [x, y] of coneOverlay.tri) allCoords.push({ x, y });
        // 🕸️ 그물도 화면에 들어와야 한다 — 안 넣으면 마름모가 화면 밖으로 잘린다
        if (netOverlay) { for (const [x, y] of netOverlay.tri) allCoords.push({ x, y });
            for (const c of netOverlay.circles) for (const [x, y] of c.ring) allCoords.push({ x, y }); }
        if (coneOverlay?.callPath) for (const p of coneOverlay.callPath) allCoords.push({ x: p.x, y: p.y });

        if (allCoords.length === 0) {
            ctx.fillStyle = mapColors.textMuted;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '12px sans-serif';
            ctx.fillText("위치 데이터를 기다리는 중...", width / 2, height / 2);
            return;
        }

        // 🪟 시트가 덮은 높이 — 목표를 향해 매 프레임 조금씩 좁힌다 (한 번에 튀면 시트와 따로 논다)
        const occludedTarget = occludedOf(height, occludedPx);
        if (occludedNow.current == null) occludedNow.current = occludedTarget;   // 첫 그림은 제자리에서
        const gap = occludedTarget - occludedNow.current;
        if (Math.abs(gap) > 0.5) {
            occludedNow.current += gap * 0.22;                                   // ≈ 시트의 .25s 와 맞는 속도
            requestAnimationFrame(() => drawRef.current());
        } else {
            occludedNow.current = occludedTarget;
        }

        // 🔭 시점(視點)은 한 곳에서 — 제스처도 같은 `anchorBaseOf` 를 본다 (규칙 ③)
        /* 🔭 무엇에 맞출지만 고른다 — 뷰포트 기계는 그대로다 (규칙 ③) */
        const nextStop = validPoints[0] ?? null;
        /* 👣 구간의 시작점 = 직전에 다녀온 정거장. 없으면(첫 구간) 현위치가 시작점이다 */
        const prevStop = trail.length > 0 ? trail[trail.length - 1] : null;
        const fitCoords = viewCoordsFor(viewMode, allCoords, myLocation ?? null, nextStop, prevStop);
        const viewport = computeViewport(fitCoords, width, height, zoomRef.current, panRef.current, occludedNow.current);
        /**
         * 🔭 **실제 배율** — 손으로 확대했든 「구간」·「현위치」로 맞춰 확대됐든 하나의 답.
         * 「전체 보기 · 손 안 댐」을 1 로 삼고 지금이 몇 배인지 잰다.
         * 딤이 걷히는 규칙(`mapTileTone`)이 이 값을 본다 — 어느 길로 확대했든 같아야 한다.
         */
        const baseViewport = computeViewport(allCoords, width, height, 1, { x: 0, y: 0 }, occludedNow.current);
        const shownZoom = effectiveZoom(viewport.worldSize, baseViewport.worldSize);
        const getScreenPt = (p: { x: number, y: number }) => toScreenPoint(p, viewport);

        // 0. 🗺️ 배경 — 타일이 왔으면 타일, 아직 없으면 시·도 외곽선 (터널·음영에서도 빈 화면이 안 된다)
        const readyTiles = collectTiles(viewport, width, height, () => drawRef.current());
        if (readyTiles.length > 0) {
            ctx.save();
            /* 🎨 회색조·연하게 — 배경이 시끄러우면 색이 안 읽힌다 (규칙 ⑤-3).
               🔍 다만 **확대하면 서서히 제 색을 되찾는다** — 확대는 «지도를 보겠다»는
                  손짓이다 (기사님 2026-09-04 · `mapTileTone`). */
            /* 🔆 밝은 테마는 지도가 흰 바탕 위라 더 밝게 뜬다 — 조금 더 눌러 준다 (기사님 2026-09-04) */
            const tone = mapTileTone(shownZoom, theme === 'dark' ? 0.5 : 0.62);
            if (supportsCanvasFilter(ctx) && tone.filter) ctx.filter = tone.filter;
            ctx.globalAlpha = tone.alpha;
            // 🧅 «배경» 레이어 — 끄면 타일만 빠지고 경계·경로는 남는다
            if (layers.base) readyTiles.forEach(t => ctx.drawImage(t.img, t.cx, t.cy, t.size + 1, t.size + 1));
            ctx.restore();
            if (theme === 'dark') {
                ctx.fillStyle = 'rgba(10, 14, 22, 0.35)';   // 어두운 테마에서 한 겹 더 눌러 준다
                ctx.fillRect(0, 0, width, height);
            }
        } else if (sidoData.features) {
            const sortedFeatures = [...sidoData.features].sort((a: any, b: any) =>
                (a.properties?.isGyeonggiSigungu ? 1 : 0) - (b.properties?.isGyeonggiSigungu ? 1 : 0)
            );

            sortedFeatures.forEach((feature: any) => {
                const isGyeonggiSigungu = feature.properties?.isGyeonggiSigungu;

                ctx.fillStyle = withAlpha(mapColors.sidoFill, 0.15);
                ctx.strokeStyle = withAlpha(mapColors.sidoStroke, isGyeonggiSigungu ? 0.4 : 0.3);
                ctx.lineWidth = isGyeonggiSigungu ? 0.5 : 1;
                const geom = feature.geometry;
                if (!geom) return;
                let polygons: number[][][][] = [];
                if (geom.type === 'Polygon') polygons = [geom.coordinates];
                else if (geom.type === 'MultiPolygon') polygons = geom.coordinates;

                polygons.forEach(polygon => {
                    polygon.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach((pt, _i) => {
                            const mapped = getScreenPt({ x: pt[0], y: pt[1] });
                            if (_i === 0) ctx.moveTo(mapped.cx, mapped.cy);
                            else ctx.lineTo(mapped.cx, mapped.cy);
                        });
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    });
                });
            });
        }

        /**
         * 0.5. 🗺️ **경계선 — 타일 위에도 얹는다** (기사님 확정 2026-09-04).
         *
         * 기사님: *"지도가 보기 좋기는 한데.. 구역이 나뉘어 있지 않으니까
         * **서울로 간 건지 성남으로 간 건지 잘 모르겠어.**"*
         *
         * 자료는 이미 있었다(`sidoData` 60구역 — 서울특별시 + 경기도 시·군·구).
         * 그런데 **타일이 없을 때만** 그리고 있었다 — 있는 것을 안 쓰고 있었던 셈이다.
         *
         * 🔴 **선만 얹는다. 면은 안 칠한다** — 채우면 회색조 지도가 또 한 겹 탁해져
         *    판정 색이 안 읽힌다 (규칙 ⑤-3).
         * 🔴 **배율과 무관하게 선명도를 유지한다** (기사님 2026-09-04: *"라인은 지도에도
         *    표시가 없어. 라인은 선명도를 유지하는 걸로 해줘"*).
         *    처음엔 «확대하면 타일에 경계가 나오니 물러나자» 고 만들었는데 — **틀렸다.**
         *    이 타일에는 행정 경계가 없다. 물러나면 그냥 사라진다.
         */
        if (layers.border && readyTiles.length > 0 && sidoData.features) {   // 🧅 «경계» 레이어
            ctx.save();
            ctx.strokeStyle = withAlpha(mapColors.sidoStroke, 0.55);
            ctx.lineWidth = 1;
            sidoData.features.forEach((feature: any) => {
                const geom = feature.geometry;
                if (!geom) return;
                const polygons: number[][][][] =
                    geom.type === 'Polygon' ? [geom.coordinates]
                        : geom.type === 'MultiPolygon' ? geom.coordinates : [];
                polygons.forEach(polygon => polygon.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((pt, i) => {
                        const m = getScreenPt({ x: pt[0], y: pt[1] });
                        if (i === 0) ctx.moveTo(m.cx, m.cy); else ctx.lineTo(m.cx, m.cy);
                    });
                    ctx.closePath();
                    ctx.stroke();
                }));
            });
            ctx.restore();
        }

        /**
         * 🕸️ **콜 그물 — 지도 실험실 모양 그대로** (이식 B3-2 · 2026-09-11).
         *
         * 그리는 차례가 뜻이다 — **면을 먼저 옅게 깔고**(마름모·원·라인 띠 한 겹),
         * 그 위에 **테두리**를 얹고, 마지막에 **든 동**을 점으로 찍는다.
         * 🔴 면을 한 겹으로 모아 칠하는 이유: 마름모와 원이 겹치는 자리가 **두 번 칠해지면**
         *    더 진해져서 «여기가 더 안쪽»처럼 읽힌다. 실험실이 오프스크린 화포를 쓴 이유가 그것이다.
         *    여기서는 같은 일을 `globalAlpha` 한 번으로 한다 — 한 path 에 모아 한 번 칠한다.
         */
        if (layers.net && netOverlay) {   // 🧅 «그물» 레이어
            ctx.save();
            const NET_SOLID = '#2563eb', NET_EDGE = 'rgba(37,99,235,.85)';
            /** 📏 km → px — 이 화면에서 1km 가 몇 픽셀인가 (줌이 바뀌면 같이 바뀐다) */
            const a = getScreenPt({ x: netOverlay.goal.lng, y: netOverlay.goal.lat });
            const b = getScreenPt({ x: netOverlay.goal.lng + 0.01, y: netOverlay.goal.lat });
            const pxPerKm = Math.abs(b.cx - a.cx) / (0.01 * 88.6);

            // ── 면 (마름모 + 꼭짓점 원) — 한 path 에 모아 **한 번만** 칠한다
            ctx.globalAlpha = 0.22;
            ctx.beginPath();
            netOverlay.tri.forEach(([x, y], i) => {
                const { cx, cy } = getScreenPt({ x, y });
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            });
            if (netOverlay.tri.length) ctx.closePath();
            for (const c of netOverlay.circles) {
                c.ring.forEach(([x, y], i) => {
                    const { cx, cy } = getScreenPt({ x, y });
                    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                });
                ctx.closePath();
            }
            ctx.fillStyle = NET_SOLID; ctx.fill();

            // ── 라인 띠 — 잡은 콜들이 만든 실제 경로 양옆 (노선일 때만)
            if (netOverlay.usedLine && validPolyline.length >= 2) {
                ctx.beginPath();
                validPolyline.forEach((p, i) => {
                    const { cx, cy } = getScreenPt(p);
                    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                });
                ctx.strokeStyle = NET_SOLID;
                ctx.lineWidth = Math.max(3, netOverlay.lineRadiusKm * 2 * pxPerKm);
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // ── 테두리 — 목적지 원은 실선, 내 위치 원은 점선 (기점이 어느 쪽인지 눈으로 갈린다)
            ctx.lineWidth = 2; ctx.strokeStyle = NET_EDGE;
            for (const c of netOverlay.circles) {
                ctx.setLineDash(c.name === netOverlay.goal.name ? [] : [6, 5]);
                ctx.beginPath();
                c.ring.forEach(([x, y], i) => {
                    const { cx, cy } = getScreenPt({ x, y });
                    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                });
                ctx.closePath(); ctx.stroke();
            }
            ctx.setLineDash([]);

            // ── 든 동 — 파란 점. 그물에 무엇이 들었는지가 **점의 수**로 보인다
            for (const p of netOverlay.pass) {
                const { cx, cy } = getScreenPt(p);
                ctx.fillStyle = 'rgba(2,132,199,.8)';
                ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
            }

            // ── 🎯 목적지 — 실물 지도에 없던 마커다 (자리표 B-2)
            const g = getScreenPt({ x: netOverlay.goal.lng, y: netOverlay.goal.lat });
            ctx.fillStyle = mapColors.nodeEvaluating;
            ctx.beginPath(); ctx.arc(g.cx, g.cy, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
        }

        /* 🔺 첫 콜 그물 (목업 전용) — 통과한 동을 점으로, 삼각형을 선으로 */
        if (coneOverlay) {
            ctx.save();
            for (const p of coneOverlay.pass ?? []) {
                const { cx, cy } = getScreenPt(p);
                ctx.fillStyle = 'rgba(56,189,248,0.30)';
                ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fill();
            }
            for (const c of coneOverlay.circles ?? []) {
                ctx.beginPath();
                c.ring.forEach(([x, y], i) => {
                    const { cx, cy } = getScreenPt({ x, y });
                    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                });
                ctx.closePath();
                ctx.fillStyle = 'rgba(251,191,36,0.10)'; ctx.fill();
                ctx.strokeStyle = 'rgba(251,191,36,0.85)'; ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
            }
            ctx.beginPath();
            coneOverlay.tri.forEach(([x, y], i) => {
                const { cx, cy } = getScreenPt({ x, y });
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            });
            ctx.closePath();
            ctx.fillStyle = 'rgba(56,189,248,0.07)'; ctx.fill();
            ctx.strokeStyle = 'rgba(56,189,248,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
            for (const m of coneOverlay.marks ?? []) {
                const { cx, cy } = getScreenPt(m);
                ctx.fillStyle = m.inside ? '#38bdf8' : '#f87171';
                ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
                ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
                ctx.strokeText(m.name, cx, cy - 8); ctx.fillText(m.name, cx, cy - 8);
            }
            /* ⛓️ 잡은 콜의 경로 — 출발지→상차→하차 직선. 이름표는 점 아래(경계 표지는 위라 안 겹친다).
               구간 색 = 도착점의 color — 기존 경로(장미)와 이번 콜(다른 색)이 갈라 보인다 */
            if (coneOverlay.callPath?.length) {
                const path = coneOverlay.callPath;
                for (let i = 1; i < path.length; i++) {
                    const a = getScreenPt(path[i - 1]), b = getScreenPt(path[i]);
                    ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy);
                    ctx.strokeStyle = path[i].color ?? '#fb7185'; ctx.lineWidth = 2.5; ctx.stroke();
                }
                for (const p of path) {
                    const { cx, cy } = getScreenPt(p);
                    const tone = p.color ?? '#fb7185';
                    ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
                    ctx.font = '800 10px system-ui'; ctx.textAlign = 'center';
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
                    ctx.strokeText(p.label, cx, cy + 17); ctx.fillStyle = tone; ctx.fillText(p.label, cx, cy + 17);
                }
            }
            ctx.restore();
        }

        /**
         * 1.5. 기초 연결선 — 정거장을 **직선으로** 잇는 보조 점선.
         *
         * 🔴 **경로선이 있으면 안 그린다** (기사님 실물 2026-09-04:
         *    *"지도에서 궤적이 있으면 직선을 표시하지 않는다고 한 것 같은데 점선이 남아 있어"*).
         *    맞다 — 그때 없앤 것은 «직선 N km» **글자**였고 이 **선**은 그대로 남아 있었다.
         *    카카오가 준 실제 도로 경로가 있는데 그 위에 직선을 겹치면 **길이 두 개**로 보인다.
         *    경로가 아직 없거나 실패했을 때만 «대충 이 방향»으로 남긴다 (규칙 ④).
         */
        if (validPolyline.length >= 2) { /* 경로선이 대신 말한다 */ } else {
        ctx.beginPath();
        ctx.strokeStyle = withAlpha(mapColors.sidoStroke, 0.4);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);

        let pathStarted = false;

        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);
            ctx.moveTo(cx, cy);
            pathStarted = true;
        }

        validPoints.forEach((p) => {
            const { cx, cy } = getScreenPt(p);
            if (!pathStarted) {
                ctx.moveTo(cx, cy);
                pathStarted = true;
            } else {
                ctx.lineTo(cx, cy);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);

        }

        /**
         * 현위치 - 첫 상차지 간 회색 점선 지점에 직선거리(km) 표기
         *
         * 🔴 **경로선이 있으면 안 그린다** (기사님 2026-09-04: *"우리에게 직선 거리가
         *    중요할까? 아닌 것 같은데"*). 맞다 — 기사님은 **도로**를 달리지 직선을 달리지 않는다.
         *    카카오가 준 «주행 68.0km / 106분» 이 더 정확하고, **버퍼·데드라인이 전부 그 값**을 쓴다.
         *    둘을 나란히 두면 한 화면이 **두 답**을 한다.
         *
         *    다만 **경로가 아직 없거나 계산이 실패했을 때**는 «대충 얼마나 먼가»의 유일한
         *    답이다 — 그때만 남긴다 (규칙 ④: 모르면 모른다고 하되, 아는 만큼은 말한다).
         *
         * 🔴 **두 점이 가까워도 안 그린다.** 이 글자는 두 점의 **중간**에 놓여서, 둘이 붙으면
         *    중간점이 **마커 위에 올라앉아** 현위치와 이름표를 함께 덮는다
         *    (기사님 실물 확대 캡처 2026-09-04).
         */
        const MIN_GAP_PX = 90;   // 이보다 가까우면 글자가 마커를 덮는다
        if (myLocation && validPoints.length > 0 && validPolyline.length < 2) {
            const startPt = getScreenPt(myLocation);
            const endPt = getScreenPt(validPoints[0]);
            const distKm = getDistanceKm(myLocation.y, myLocation.x, validPoints[0].y, validPoints[0].x);

            const midX = Math.round((startPt.cx + endPt.cx) / 2);
            const midY = Math.round((startPt.cy + endPt.cy) / 2);
            const gapPx = Math.hypot(endPt.cx - startPt.cx, endPt.cy - startPt.cy);
            /* ⚠️ `return` 을 쓰면 **뒤의 마커까지 통째로 안 그려진다** — 조건으로만 감싼다 */
            if (gapPx >= MIN_GAP_PX) {
                const text = `직선 ${distKm.toFixed(1)}km`;
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                const tWidth = ctx.measureText(text).width;

                ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.7);
                ctx.fillRect(midX - (tWidth / 2) - 4, midY - 14, tWidth + 8, 18);

                ctx.fillStyle = mapColors.stroke;
                ctx.fillText(text, midX, midY - 1);
            }
        }

        /**
         * 1. 🛣️👣 **두 선을 겹쳐 «얼마나 벗어났나»를 보여 준다** (기사님 안 2026-09-04).
         *
         * 기사님: *"카카오에서 받아온 걸 **아래** 두고 내가 간 걸 **위**에 두는 거지..
         * 그럼 얼마나 경로 이탈한 건지 한눈에 볼 수 있겠다. 둘 다 **투명도를 50%씩** 주면
         * 정확히 지나가면 지도를 가릴 거고 아니면 지도가 보이니 좋을 듯싶다."*
         *
         * 🔴 **색을 나눈다. 투명도로 겹치게 하지 않는다** (기사님 재확인 2026-09-04:
         *    *"이렇게 보니 경로와 내가 간 길하고 어떤 것이 맞는 건지 모르겠다..
         *    투명도를 빼고 색을 달리 하자"*).
         *    처음엔 «같은 색 반 투명 둘이 포개지면 진해진다»로 만들었는데 —
         *    «따라갔나»는 보여 줘도 **«어느 쪽이 뭔지»를 못 갈랐다.**
         *
         *      파란 굵은 선   카카오가 준 **가야 할 길**   (아래)
         *      흰 얇은 선     내가 **실제로 간 길**        (위)
         *
         *    벗어나면 흰 선이 파란 길 밖으로 나간다 — 그게 이탈이다.
         * 🔴 순서가 뜻이다 — 계획이 **아래**, 실제가 **위**. 실제가 계획을 덮는다.
         */
        const drawPath = (pts: Array<{ x: number; y: number }>, widthScale: number, dash?: number[]) => {
            if (pts.length < 2) return;
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = routeLineWidth(shownZoom) * widthScale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (dash) ctx.setLineDash(dash);
            pts.forEach((p, i) => {
                const { cx, cy } = getScreenPt(p);
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
            ctx.restore();
        };

        /**
         * ① 아래 — 카카오가 준 «가야 할 길».
         *
         * 🌈 **구간마다 그 콜의 색으로 칠한다** (2026-09-11 · 이식 B2 · 지도 실험실 모양).
         *    서버가 구간 경계(`sectionEnds`)와 구간 주인(`sectionStops`)을 함께 보낸다 —
         *    실측으로 **둘의 길이가 같고**, 구간 i 는 «정거장 i 에 닿는 길»이다
         *    (`ends [66,175,912,1432]` ↔ `stops 4개`). 그래서 색은 그 정거장의 콜 색이다.
         * 🔴 **재료가 어긋나면 한 색으로 물러난다** — 길이가 다르거나 색표가 없으면 옛 모양 그대로.
         *    색이 밀려 그려지는 것보다 한 색이 낫다 (규칙 ④: 지어내지 않는다).
         * ⚠️ 미리보기(결재 전)는 **노란 점선 한 색**을 지킨다 — «아직 내 콜이 아니다»가 색의 뜻이다.
         */
        if (layers.route && hasPolyline && validPolyline.length > 0) {   // 🧅 «경로» 레이어
            const secStops = routeHolder?.sectionStops;
            const secLines = isPreviewRoute ? [] : sectionLinesOf(validPolyline, routeHolder?.sectionEnds);
            const canPaintPerSection = !!callColors && !!secStops
                && secLines.length > 1 && secLines.length === secStops.length
                && validPolyline.length === currentPolyline.length;   // 걸러진 점이 있으면 경계가 어긋난다
            if (canPaintPerSection) {
                secLines.forEach((line, i) => {
                    ctx.strokeStyle = callColors!.get(secStops![i].orderId) ?? mapColors.routeLine;
                    drawPath(line, 1);
                });
            } else {
                ctx.strokeStyle = isPreviewRoute ? '#e6b422' : mapColors.routeLine;
                // 노란 점선 = 아직 결재 전 (v23 Ⅱ)
                drawPath(validPolyline, 1, isPreviewRoute ? [10, 8] : undefined);
            }
        }

        // ② 위 — 내가 «실제로 간 길». 얇고 밝다. 파란 길 밖으로 나가면 그게 이탈이다
        if (layers.trail && driven.length > 1) {   // 🧅 «동선» 레이어
            ctx.strokeStyle = mapColors.drivenLine;
            drawPath(driven, 0.55);
        }

        /**
         * 1.7. 👣 지나온 발자취 — 번호는 방문 순서로 동결 (①)
         *
         * 🔴 **색표를 켜면 남은 정거장과 같은 규칙으로 그린다** (2026-09-04).
         *    예전에는 여기만 «초록 채움 + 콜색 테두리»라, 같은 화면에서 **다녀온 곳과
         *    남은 곳이 다른 문법**으로 그려졌다. 색표의 뜻(색상=콜 · 밝기=상차/하차 ·
         *    흰 링=다녀옴)이 절반만 적용되던 셈이다.
         */
        markerHits.current = [];
        trail.forEach((p) => {
            const { cx, cy } = getScreenPt(p);
            markerHits.current.push({ cx, cy, orderId: p.orderId });
            const kind = p.type === '상차' ? 'pickup' : 'dropoff';
            const fill = rainbowNodes && p.callNo ? callNodeFill(p.callNo, kind, theme) : null;
            ctx.beginPath();
            ctx.arc(cx, cy, fill ? 10 : 9, 0, 2 * Math.PI);
            ctx.fillStyle = fill ?? withAlpha('#35c3a9', 0.4);       // 초록 채움 = 다녀옴 (옛 문법)
            ctx.fill();
            ctx.lineWidth = fill ? 1 : 2.5;
            ctx.strokeStyle = fill
                ? callNodeStroke(true, fill)                          // 다녀왔으니 «동그라미»를 친다
                : (callColors?.get(p.orderId) ?? '#35c3a9');
            ctx.stroke();
            ctx.fillStyle = fill ? callNodeText(kind, theme) : '#d7f5ee';
            ctx.font = fill ? 'bold 12.5px sans-serif' : 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(p.no), cx, cy + 0.5);
        });

        // 2. 노드 렌더링
        validPoints.forEach((p) => {
            const { cx, cy } = getScreenPt(p);

            if (p.routeId) markerHits.current.push({ cx, cy, orderId: p.routeId });
            ctx.beginPath();
            /* 🔍 마커는 **목록 동그라미와 같은 크기**다 (기사님 2026-09-04:
               *"지도에 순번도 리스트에 있는 사이즈로 같이 만들자 지도를 너무 많이 가리는 것 같다"*).
               한 화면에서 같은 것이 두 크기로 보이면 다른 것처럼 읽힌다. */
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            const stopKind = p.type === '상차' ? 'pickup' : 'dropoff';
            /* 🌈 색상=콜 · 밝기=상차/하차 (기사님 2026-09-04) */
            const rainbowFill = rainbowNodes && p.callNo ? callNodeFill(p.callNo, stopKind, theme) : null;
            ctx.fillStyle = rainbowFill
                ?? (p.type === '상차' ? mapColors.nodePickup : mapColors.nodeDropoff);

            if (p.isEvaluating) {
                ctx.fillStyle = mapColors.nodeEvaluating;
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = mapColors.nodeStrokeEvaluating;
            } else if (rainbowFill) {
                /* 🖊️ 다녀온 곳에 **동그라미를 친다** — 안 간 곳은 바탕색이라 링이 안 보인다.
                   1px 로 얇게 — 목록 동그라미와 같은 두께다 (기사님 2026-09-04) */
                ctx.lineWidth = 1;
                ctx.strokeStyle = callNodeStroke(!!p.visited, rainbowFill);
            } else {
                ctx.lineWidth = 2.5;
                // 🎨 테두리 = 콜 색 (②) — 어느 콜의 정거장인지 색으로 읽힌다
                ctx.strokeStyle = (p.routeId && callColors?.get(p.routeId)) || mapColors.nodeStrokeRegular;
            }
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = rainbowNodes && p.callNo ? callNodeText(stopKind, theme) : mapColors.textBody;
            /* 🔍 정거장 번호 — 달리면서 먼발치로 읽는 숫자다 (기사님 2026-09-04:
               *"글자가 커져야 하는데 원만 커진 것 같아"*) */
            ctx.font = rainbowNodes ? 'bold 12.5px sans-serif' : 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 🔒 번호는 방문한 개수 다음부터 — 지나간 번호를 재사용하지 않는다 (①)
            ctx.fillText(String(p.no ?? ''), cx, cy + 1);   // 번호는 stopNoOf 하나에서 온다

            const textWidth = ctx.measureText(p.name).width;
            ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.45);
            ctx.fillRect(cx - (textWidth / 2) - 6, cy + 14, textWidth + 12, 18);

            ctx.fillStyle = p.isEvaluating ? mapColors.nodeStrokeEvaluating : mapColors.textBody;
            ctx.textBaseline = 'top';
            ctx.fillText(p.name, cx, cy + 16);
        });

        // 3. 내 위치(GPS) 렌더링
        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);

            const time = Date.now() / 1000;
            const pulseRadius = 15 + Math.sin(time * 3) * 5;

            ctx.beginPath();
            ctx.arc(cx, cy, pulseRadius, 0, 2 * Math.PI);
            ctx.fillStyle = withAlpha(mapColors.myLocationPulse, 0.2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = mapColors.myLocationPulse;
            ctx.strokeStyle = mapColors.myLocationStroke;
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, 0.45);
            ctx.fillRect(cx - 20, cy + 10, 40, 16);

            ctx.fillStyle = mapColors.myLocationDotText;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("현위치", cx, cy + 22);
        }

        // 4. © 표기 — 타일을 쓴 화면에만. 빌린 것은 빌렸다고 적는다 (OSM 라이선스)
        if (readyTiles.length > 0) {
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = withAlpha(mapColors.textMuted, 0.7);
            ctx.fillText('© OpenStreetMap', width - 4, height - 3);
        }
    }, [unifiedRoutePoints, liveRoute, myLocation, visitedTrail, drivenTrail, routeHolder, coneOverlay, netOverlay, layers, callColors, theme, mapColors, occludedPx, rainbowNodes, viewMode]);

    useEffect(() => {
        drawRef.current = drawMap;   // 늦게 온 타일이 부를 최신 그리기
        drawMap();
    }, [drawMap]);

    // 제스처 핸들러 (드래그 팬 & 줌)
    const handlePointerDown = (e: any) => {
        isDragging.current = true;
        movedPx.current = 0;
        if (e.touches && e.touches.length === 1) {
            lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.clientX !== undefined) {
            lastPos.current = { x: e.clientX, y: e.clientY };
        } else if ('touches' in e && e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastDist.current = Math.hypot(dx, dy);
        }
    };

    const handlePointerMove = (e: any) => {
        if (!isDragging.current) return;

        let clientX = 0; let clientY = 0;

        if (e.touches) {
            if (e.touches.length === 1) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                /**
                 * 🤏 **두 손가락 «중간»을 붙잡은 채 배율만 바꾼다** (기사님 지적 2026-09-03:
                 * *"손가락 중간을 기준점으로 줌인이 될 거라 생각했는데.. 한쪽 방향으로
                 * 치우쳐서 줌인되었어"*).
                 *
                 * 🔴 예전에는 `zoomRef += scaleDiff` 로 **배율만** 바꾸고 팬을 안 건드렸다.
                 *    그래서 확대의 중심이 화면이 원래 잡고 있던 곳이었고, 손가락이
                 *    가운데서 벗어날수록 쏠렸다. 09-01 의 «기준점» 수리가 이 갈래를 안 지났다.
                 * 🔴 계산은 `pinchStep` 하나에 있다 — 휠·버튼(`zoomAround`)과 **같은 공식**이다.
                 */
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                // 중간점은 **캔버스 안 좌표**여야 한다 — 화면 좌표 그대로면 여백만큼 어긋난다
                const mid = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
                };
                // 🪟 그리는 쪽이 지금 쓰는 가림 높이를 그대로 본다 — 두 벌이면 확대점이 어긋난다
                const base = anchorBaseOf(rect.width, rect.height, occludedNow.current ?? 0);
                /* ✋ 핀치도 모드를 안 푼다 — 배율은 기준 위에 곱해진다 */
                const step = pinchStep(lastDist.current, dist, mid, base, zoomRef.current, panRef.current);
                zoomRef.current = step.zoom;
                panRef.current = step.pan;
                lastDist.current = dist;
                drawMap();
                return;
            }
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        if (clientX === 0 && clientY === 0) return;

        const deltaX = clientX - lastPos.current.x;
        const deltaY = clientY - lastPos.current.y;

        /* ✋ **끌어도 모드를 안 푼다** (기사님 2026-09-04: *"구간, 현위치를 선택한 후
           드래그하면 줌이 유지되어야 할 것 같아"*).
           🔴 처음엔 여기서 `setViewMode('all')` 을 했다 — «손이 이긴다»를 지키려는
              뜻이었는데, 층을 헷갈렸다. 모드는 **기준 배율**을 정하고 팬·줌은 그 **위에
              더해지는 값**이라, 모드를 풀면 기준이 통째로 바뀌어 **화면이 튀어나갔다.**
              팬은 모드와 무관하게 그대로 쌓이므로 **안 풀어도 손은 이미 이긴다.** */
        panRef.current.x += deltaX;
        panRef.current.y += deltaY;
        movedPx.current += Math.abs(deltaX) + Math.abs(deltaY);

        lastPos.current = { x: clientX, y: clientY };
        drawMap();
    };

    const handlePointerUp = (e?: any) => {
        isDragging.current = false;
        if (!onStopTap || movedPx.current > 8) return;   // 팬이었다 — 탭 아님
        const canvas = canvasRef.current;
        const pt = e?.changedTouches?.[0] ?? e;
        if (!canvas || pt?.clientX == null) return;
        const rect = canvas.getBoundingClientRect();
        const x = pt.clientX - rect.left, y = pt.clientY - rect.top;
        const hit = markerHits.current.find(h => Math.hypot(h.cx - x, h.cy - y) <= 20);
        if (hit) onStopTap(hit.orderId);
    };

    /**
     * 🔍 **누른 자리를 붙잡은 채 배율만 바꾼다.**
     *
     * 🔴 기준점은 `anchorBaseOf` 다 — 예전 공식은 화면 원점(0,0)을 기준으로 삼았는데,
     *    실제 원점은 버튼 여백만큼 밀려 있어 **확대할수록 지도가 옆으로 흘렀다.**
     */
    const zoomAround = (screenX: number, screenY: number, zoomDelta: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const newZoom = Math.max(0.5, Math.min(10, zoomRef.current * zoomDelta));
        const ratio = newZoom / zoomRef.current;
        // 🪟 그리는 쪽이 지금 쓰고 있는 가림 높이를 그대로 본다 — 두 벌이면 확대점이 어긋난다
        const base = anchorBaseOf(rect.width, rect.height, occludedNow.current ?? 0);

        panRef.current.x = panAfterZoom(screenX, base.x, panRef.current.x, ratio);
        panRef.current.y = panAfterZoom(screenY, base.y, panRef.current.y, ratio);

        zoomRef.current = newZoom;
        drawMap();
    };

    const handleZoomClick = (zoomDelta: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAround(rect.width / 2, rect.height / 2, zoomDelta);
    };

    const handleWheel = (e: any) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.9 : 1.1);
    };

    return (
        <div style={{ backgroundColor: mapColors.fill }} className={`relative w-full ${fill ? "h-full" : "h-64"} cursor-grab active:cursor-grabbing overflow-hidden`}>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
            />

            {/**
              * 🗺️ **위는 지도, 아래는 콜** (기사님 확정 2026-09-04).
              *   좌상단 무엇에 맞출까 · 우상단 배율 · 좌하단 내비 · 우하단 콜 이름표.
              *   자리가 뜻을 나누면 운전 중에 **손이 기억한다.**
              *
              * 🔴 셋을 **풀어서** 놓는다 — 순환 버튼은 «지금 뭐지»를 눌러 봐야 알았다.
              * 🔴 켜진 것은 **바탕을 안 뒤집는다** — 테두리·글자만 파랗게.
              *    (기사님: *"현위치에서는 색이 반전되어 잘 보이지 않아"*)
              */}
            <div className="absolute top-3 left-3 flex gap-1.5 z-10">
                {([['all', '전체'], ['leg', '현구간'], ['follow', '현위치']] as [MapViewMode, string][]).map(([m, label]) => (
                    <button
                        key={m}
                        onClick={() => pickViewMode(m, { setViewMode, zoom: zoomRef, pan: panRef, draw: drawMap })}
                        title={m === 'all' ? '정거장·경로가 다 보이게' : m === 'leg' ? '지금 가는 구간이 다 보이게' : '내 위치 둘레를 크게'}
                        className={`h-8 px-2.5 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg backdrop-blur-sm text-[11px] font-black transition-all ${
                            viewMode === m
                                ? 'border border-info text-info'
                                : 'border border-border text-text-primary opacity-80 hover:opacity-100'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/**
              * 🧅 **레이어 — 한 버튼 뒤에 접어 둔다** (이식 B4 · 2026-09-11).
              *
              * 🔴 여섯을 늘 띄우면 400px 화면에서 지도가 그만큼 좁아진다. 그리고
              *    **운전 중에는 입력을 못 한다**(실측: 안전취소 24건) — 한 번 정하고 접는 값이다.
              *    이 레포가 이미 쓴 문법이다 (`a41edca` 폰 줄: *"모드를 하나로 — 누르면 셋이 펼쳐진다"*).
              * 🔴 자리는 **좌상단** — «무엇에 맞출까»(전체·현구간·현위치) 바로 아래다.
              *    보는 방식을 정하는 것끼리 모인다 (기사님 0904: *자리가 뜻을 나누면 손이 기억한다*).
              */}
            <div className="absolute top-[52px] left-3 flex flex-col items-start gap-1.5 z-10">
                <button
                    onClick={() => setLayersOpen(o => !o)}
                    title="지도에 무엇을 그릴까"
                    className={`h-8 px-2.5 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg backdrop-blur-sm text-[11px] font-black transition-all ${
                        layersOpen ? 'border border-info text-info' : 'border border-border text-text-primary opacity-80 hover:opacity-100'
                    }`}
                >
                    🧅 {Object.values(layers).filter(Boolean).length}/{Object.keys(layers).length}
                </button>
                {layersOpen && (
                    <div className="flex flex-col gap-1">
                        {([['base', '배경'], ['border', '경계'], ['net', '그물'], ['route', '경로'], ['trail', '동선']] as [string, string][]).map(([k, label]) => (
                            <button
                                key={k}
                                onClick={() => toggleLayer(k)}
                                className={`h-7 px-2 flex items-center gap-1 bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg backdrop-blur-sm text-[11px] font-black transition-all ${
                                    layers[k] ? 'border border-info text-info' : 'border border-border text-text-muted opacity-70'
                                }`}
                            >
                                {layers[k] ? '👁' : '🚫'} {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="absolute top-3 right-3 flex flex-col space-y-2 z-10">
                <button
                    onClick={() => handleZoomClick(1.2)}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    +
                </button>
                <button
                    onClick={() => handleZoomClick(0.8)}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    -
                </button>
                <button
                    onClick={() => pickViewMode('all', { setViewMode, zoom: zoomRef, pan: panRef, draw: drawMap })}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm text-[10px] font-bold opacity-80 hover:opacity-100 transition-all"
                >
                    초기화
                </button>
            </div>
            {children}
        </div>
    );
}

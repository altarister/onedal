import { sectionLinesOf, aheadOf, callBandsOf, uncoveredSectionsOf } from '@onedal/shared';
import { SOAK } from './JudgmentSeat';
import { logStateChange } from '../../lib/roadmapLogger';
import React, { useRef, useCallback, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
import { isEvaluating } from "@onedal/shared";
import sidoDataRaw from '../../mapData/sidoData.json';
import { getDistanceKm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS, withAlpha } from '../../styles/themes';
import { offsetScreenPath } from '../../lib/parallelPath';
import { bandStrokeOf } from '../../lib/bandStroke';
import { callNodeFill, callNodeStroke, callNodeText } from '../../styles/callPalette';
import {
    TILE_SIZE, TILE_MAX_ZOOM, anchorBaseOf, computeViewport, toScreenPoint, panAfterZoom, pinchStep, routeLineWidth, viewCoordsFor, effectiveZoom, type MapViewMode,
    type Viewport, type GeoBox, pickViewMode, areaBoxOf, stickyFitBox, tileToneFor, capAreaBox, layersByViewFrom, setLayerInView } from '../../lib/mapProjection';
import { occludedPx as occludedOf } from '../../lib/stageLayout';

const sidoData = sidoDataRaw as any; // GeoJSON FeatureCollection

/**
 * 🗺️ **배경 타일 — 회색조로 연하게** (기사님 확정).
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
     * 🔴 캔버스가 «남은 목록의 몇 번째»로 세지 않는다 — 이름표와 지도 마커가 다른 번호를 말하게 된다.
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
    /**
     * 👣 지나온 발자취 — 표시 전용. no = 방문 순서로 동결된 사이클 번호표 (①)
     *
     * 🔴 **좌표는 `null` 일 수 있다** — 이력(`GET /api/orders`)에는 좌표 칸이 없어서, 소켓이
     *    그 콜을 안 실어 준 렌더에서는 좌표를 모른다. 그래도 **번호는 살아야** 하므로 목록은
     *    그 정거장을 담는다 — **못 그리는 것은 지도의 사정**이고, 아래에서 거른다.
     *    목록이 좌표를 요구하게 하면 그런 렌더에서 번호가 줄어든다.
     */
    visitedTrail?: Array<{
        x: number | null; y: number | null; type: '상차' | '하차'; orderId: string; name: string; no: number;
        /** 🌈 몇 번 콜인가 — 색표를 켜면 남은 정거장과 같은 규칙으로 그린다 */
        callNo?: number;
    }>;
    /** 🎨 콜 ID → 고유 색 — 마커 테두리와 덱 카드 점이 같은 색을 본다 (②) */
    callColors?: Map<string, string>;
    /** 🖐️ 마커 탭 — 그 콜 카드로 (지나온 곳은 확인·수정) */
    onStopTap?: (orderId: string) => void;
    /** 👣 이번 사이클에 실제로 달린 자취 — 연한 선으로 남는다 (표시 전용) */
    /**
     * 👣 **구간 배열이다** — `[[점,점…], [점,점…]]`. GPS 가 끊겼다 이어진 자리를
     *    한 줄로 이으면 지도를 가로지르는 직선이 생긴다 (`drivenTrailStore` · `pushTrail`).
     */
    drivenTrail?: Array<Array<{ x: number; y: number }>>;
    /** 🧭 경로를 든 콜 — 서버가 고른 답. 여기서 다시 찾지 않는다 */
    routeHolder?: SecuredOrder | null;
    /**
     * 🟡 **심사 중인 후보의 경로 — 확정 경로 «위에» 노란 점선으로 겹쳐 그린다** (기사님 확정).
     *    «가고 있는 길»과 «이 콜을 붙이면 갈 길»을 함께 보고 1~2초에 누르신다.
     *    🔴 `routeHolder` 와 같은 콜이면 넘기지 않는다 — 두 번 그리게 된다 (`useRouteDerivations`가 가른다).
     *    🔴 영역(상차·하차)에는 안 쓴다 — 잡지도 않은 콜이 원달앱 목록을 흔들면 안 된다.
     */
    candidateHolder?: SecuredOrder | null;
    /**
     * 🔺 **첫 콜 그물을 눈으로 본다** — 목업 전용.
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
        /** ⛓️ 잡은 콜의 경로 — 출발지→상차→하차를 직선으로 잇고 점마다 이름표를 단다.
         *  `color` 는 그 점과 **그 점으로 들어오는 구간**의 색 — 기존 경로와 이번 콜을 색으로 가른다 */
        callPath?: Array<{ x: number; y: number; label: string; color?: string }>;
    } | null;
    unifiedRoutePoints: RoutePoint[];
    /** **진행 중인 콜만** 넘긴다. 종료된 콜을 여기서 거르지 않는다 —
     *  계약을 좁히면 거르기를 잊을 자리가 없어진다 */
    liveRoute: SecuredOrder[];
    myLocation: { x: number, y: number } | null;
    /**
     * 📍 **이 자리가 낡았나** — 낡았으면 **흐리게** 그린다. 지우지도, 집으로 옮기지도 않는다.
     *    GPS 가 잠깐 끊겼다고 지도가 집으로 날아가면 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다.
     *    마지막 자리는 몇 km 어긋날 뿐이고 집보다 비교가 안 되게 가깝다.
     */
    myLocationStale?: boolean;
    /**
     * 📋 **상차 영역 — 원달앱이 상차지를 거르는 영역**.
     *
     * 🔴 아래 `dropoffArea`(하차 영역 · 합집합)와 **다른 것**이다. 상차 영역은 **현위치 영역 전체** 아니면
     *    **켜진 조각을 전부 겹친 것**이다 (조각은 shared `pickupPartsOf`).
     *    교집합은 도형을 겹쳐 칠하면 합집합으로 보이니 **잘라(clip) 가며** 좁힌 뒤 마지막에 한 번 칠한다.
     */
    pickupArea?: {
        me: { x: number; y: number };
        meKm: number;
        /** `null` 이면 현위치 영역 전체 · 있으면 현위치 영역 ∩ 이 라인의 띠 */
        line: Array<{ x: number; y: number }> | null;
        lineKm: number;
        /**
         * 🎯 **가까이 온 목적지들의 원**. 있으면 그 원들을 **더한 것**(∪)과 겹친다.
         * 🔴 **`line` 과 함께 올 수 있다** — 「가까이 옴」은 라인을 끄지 않는다. 셋 다 겹친다.
         */
        goals: Array<{ at: { x: number; y: number }; km: number }>;
    } | null;
    /**
     * 🔵 **하차 영역 — 원달앱이 하차지를 거르는 영역**.
     *
     * 살아 있는 목적지마다 원 · 마름모 · 라인 띠를 모은 **합집합**이다 — 조각은 shared `dropoffPartsOf` 가 정한다.
     */
    dropoffArea?: {
        /** 먼 목적지 조각의 원 — 여기서 상차 영역을 지운다 */
        circles: Array<{ x: number; y: number; km: number }>;
        /** 🎯 가까이 온 목적지 원 — 상차 영역을 지운 **뒤에** 칠한다 (빼지 않는다) */
        nearCircles: Array<{ x: number; y: number; km: number }>;
        quads: Array<Array<{ x: number; y: number }>>;
        /** 🎯 살아 있는 목적지 — 마커를 찍고 화면 맞춤에 넣는다 */
        goals: Array<{ x: number; y: number }>;
        /** 운행 뒤면 현위치부터 앞으로만 (부르는 쪽이 `lineFromPoint` 로 자른다) · 시작은 평평하게 · 먼 끝만 둥글게 긋는다 */
        lines: Array<{ points: Array<{ x: number; y: number }>; km: number }>;
    } | null;
    /**
     * 📍 **동 점 — 원달앱에 실제로 내려간 목록** (shared `dongDotsOf`).
     *    🔵 하차만 · 🟢 상차만 · 둘 다는 파랑 (테두리 없음). 좌표는 동 중심점 — 영역 도형과 달리 **목록**을 보여 준다.
     */
    dongDots?: {
        pickup: Array<{ x: number; y: number }>;
        dropoff: Array<{ x: number; y: number }>;
        both: Array<{ x: number; y: number }>;
        /** 좌표를 모르는 동 — 로그로만 센다 */
        missing: number;
    } | null;
    children?: React.ReactNode;
    /**
     * 🔝 **오른쪽 위 줄에 이어 붙일 버튼** — 확대(＋ − 초기화) 세로 묶음의 **왼쪽**에 같은 줄로 들어간다.
     *
     * 🔴 바깥에서 `absolute top-[104px]` 처럼 **좌표로 맞추지 않는다** (기사님 지적 — 좌표로 두면 QR 이 초기화를 덮는다).
     *    확대 버튼 수가 바뀌거나 글꼴이 달라지면 그 숫자가 바로 어긋난다. 같은 줄에 넣으면
     *    간격을 `gap-2` 하나가 정하므로 갈라질 자리가 없다 (규칙 ③).
     */
    rightButtons?: React.ReactNode;
    /**
     * 🔝 **지도 위 한가운데에 놓을 버튼** — 왼쪽 줄과 오른쪽 줄 사이 빈 자리다 (기사님 지시).
     * 🔴 좌표를 안 쓴다 — `left-1/2 -translate-x-1/2` 라 폭이 바뀌어도 늘 가운데다.
     */
    centerButtons?: React.ReactNode;
    /** 🎭 무대 배경일 때 — 부모를 가득 채운다 (안 주면 높이 h-64 로 선다) */
    fill?: boolean;
    /**
     * 🗺️ **아래가 몇 px 가려졌나** — 그만큼 지도가 위로 비켜 준다. 안 넘기면 화면 전체가 지도다.
     *
     * 🔴 **«시트»(단 · 높이)를 받지 않는다** — 지도가 «시트라는 것이 있고 세 단을 갖는다»를
     *    알게 되면 **시트를 갈아치우는 날 지도가 함께 깨진다.** 지도가 알아야 할 것은
     *    «아래가 얼마나 가려졌나» 하나다.
     * ⚠️ 상한(무대의 58%)은 `lib/stageLayout` 이 건다 — 여기서 또 자르지 않는다.
     */
    occludedPx?: number;
    /**
     * 🌈 **콜 색표를 쓰는가** (`styles/callPalette.ts`) — 기본이 «쓴다»다.
     * 색상=콜 · 채도=상차/하차 · 테두리=다녀왔나.
     * 🔴 기본을 «쓴다»로 둔다 — 꺼짐이 기본이면 **안 넘기는 화면이 조용히 한 색 문법**(상차 초록·하차 로즈)으로 그린다.
     *    끄는 자리는 목업 조작판 하나뿐이다 (두 색 문법을 나란히 보려고).
     */
    rainbowNodes?: boolean;
}

/**
 * 🎛️ **지도 버튼 한 벌 — 모양은 여기서만 낸다.**
 *
 * 왼쪽(전체·구간·위치·🧅) · 가운데(QR) · 오른쪽(방침·＋ −·초기화)이 **같은 버튼**인데
 * 바탕·그림자·테두리를 각자 손으로 적고 있었다. 크기나 색을 한 번 고치려면 여섯 곳을
 * 찾아다녀야 했고, 실제로 「고른 것은 파랗게」 규칙이 자리마다 조금씩 달랐다.
 *
 * 🔴 **켜진 것은 바탕을 안 뒤집는다** — 테두리·글자만 파랗게 (뒤집으면 잘 안 보인다 · 기사님 확정).
 * @param active 지금 골라져 있나
 * @param extra  그 자리에서만 다른 것 (크기 · 글자 크기)
 */
function mapBtn(active: boolean, extra = ''): string {
    return [
        'flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover',
        'rounded-md shadow-lg backdrop-blur-sm font-black transition-all border',
        active ? 'border-info text-info' : 'border-border text-text-primary opacity-80 hover:opacity-100',
        extra,
    ].join(' ');
}

export default function PinnedRouteCanvas({ unifiedRoutePoints, liveRoute, candidateHolder, myLocation, myLocationStale, children, rightButtons, centerButtons, fill, visitedTrail, callColors, onStopTap, drivenTrail, routeHolder, coneOverlay, pickupArea, dropoffArea, dongDots, occludedPx, rainbowNodes = true }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const mapColors = MAP_THEME_COLORS[theme];

    // 초경량 성능을 위한 퓨어 줌/팬 상태 (React State 대신 Ref 사용으로 60fps 보장)
    /**
     * 🔭 **지도가 무엇에 맞춰지나** — 전체 / 이번 구간 / 현위치.
     * 🔴 **손이 이긴다** — 팬·줌은 모드가 정한 기준 위에 쌓인다(모드는 안 푼다 · 아래 `handlePointerMove`).
     *    손으로 옮겨 놓은 화면을 다음 그림에서 코드가 도로 끌어가면 «내 손이 안 먹는다»가 된다.
     */
    const [viewMode, setViewMode] = React.useState<MapViewMode>('all');
    /**
     * 🧅 **레이어 — 무엇을 보고 무엇을 덮을까**.
     *
     * ⚠️ 실험실의 «시험콜»(지도를 눌러 만든 콜) 레이어는 두지 않는다 — 실물에 대응이 없다
     *    (콜은 배차망이 준다). 없는 것을 토글로 두면 눌러도 아무 일이 없다.
     *
     * 🔴 **한 버튼 뒤에 접어 둔다** — 운전 중에는 입력을 못 하므로 버튼이 늘 떠 있으면
     *    지도만 좁아진다. 한 번 정해 두고 접는 값이다.
     * 🔴 **고른 것은 기억한다** — 레이어를 껐는데 다음에 켜져 있으면 또 끈다.
     *    브라우저에만 남는 편의값이라 못 읽어도 그만이다 (읽기·쓰기 전부 try).
     */
    /**
     * 🧅 **보기마다 따로 기억한다** — 전체에서는 영역을 보고, 구간·현위치에서는 길만 본다.
     *    한 벌로 두면 «현구간에서만 상차를 끄고 싶다»가 안 된다. 기본값·되살리기는 `layersByViewFrom` 한 곳 (보기 구분 없이 한 벌로 저장된 값도 읽는다).
     * 📋 «상차» · «하차» — 원달앱이 상차지 · 하차지를 거르는 영역 · 🌓 «어둡게» — 배경을 눌러 색·영역이 읽히게 한다.
     */
    const [layersByView, setLayersByView] = React.useState(() => {
        try { return layersByViewFrom(JSON.parse(localStorage.getItem('mapLayers') ?? 'null')); }
        catch { return layersByViewFrom(null); }
    });
    const layers = layersByView[viewMode];
    const [layersOpen, setLayersOpen] = React.useState(false);
    /**
     * 🔎 **지도가 실제로 그리는 상차 · 하차 모양 — 바뀔 때만 한 줄**.
     *    관제웹 콘솔은 서버 로그로 넘어간다(`roadmapLogger` · `[🖥️콘솔]`) — 서버 `🔵 [하차 목록]` · `📋 [상차 목록]` 줄과 나란히 대조한다.
     *    🔴 좌표는 안 싣는다 — 내 위치가 매초 바뀌어 줄이 매초 찍힌다. 모양 · 반지름 · 조각 수 · 레이어 켬만.
     */
    const areaSummary = [
        `상차 ${pickupArea
            ? `${['원', pickupArea.line && '라인(현위치부터)', pickupArea.goals.length ? `목적지원×${pickupArea.goals.length}` : ''].filter(Boolean).join('∩')} ${pickupArea.meKm.toFixed(1)}km`
            : '없음'}`,
        `하차 ${dropoffArea
            ? `먼 원 ${dropoffArea.circles.length} · 가까이 원 ${dropoffArea.nearCircles.length} · 마름모 ${dropoffArea.quads.length} · 띠 ${dropoffArea.lines.length}${pickupArea ? ' · 상차 영역 지움' : ''}`
            : '없음'}`,
        `점 ${dongDots ? `상차 ${dongDots.pickup.length + dongDots.both.length} · 하차 ${dongDots.dropoff.length + dongDots.both.length}${dongDots.missing ? ` · 좌표 모름 ${dongDots.missing}` : ''}` : '없음'}`,
        `레이어 상차 ${layers.pickup ? '켬' : '끔'} · 하차 ${layers.dropoff ? '켬' : '끔'} · 동 점 ${layers.dots ? '켬' : '끔'}`,
    ].join(' | ');
    React.useEffect(() => {
        console.log(`🗺️ [지도 영역] ${areaSummary}`);
    }, [areaSummary]);
    /* 🧅 지금 보기의 레이어 하나만 바꾼다 — 다른 보기는 그대로다 (`setLayerInView`). 저장은 보기별 한 벌을 통째로 */
    const toggleLayer = (k: string) => setLayersByView(prev => {
        const next = setLayerInView(prev, viewMode, k, !prev[viewMode][k]);
        try { localStorage.setItem('mapLayers', JSON.stringify(next)); } catch { /* 못 적어도 화면은 돈다 */ }
        return next;
    });
    const zoomRef = useRef(1);
    /**
     * 🎨 **레이어를 칠할 때 쓰는 가리개·테두리 캔버스 — 한 장씩 쥐고 다시 쓴다**
     *    (기사님: «상차·하차 레이어가 있으면 확실히 버벅인다»).
     *
     * 크기가 바뀔 때만 다시 잡고 평소엔 지워서 쓴다 — 까닭은 `makeMask` 주석.
     */
    const maskRef = useRef<HTMLCanvasElement | null>(null);
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
    /** 🔭 «전체» 맞춤에 넣는 영역 네모 — 영역이 밖으로 나가거나 절반 아래로 줄 때만 새로 잡는다 (`stickyFitBox` · #150) */
    const fitBoxRef = useRef<GeoBox | null>(null);
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

        // 🧭 경로선의 주인은 서버가 정한다 — 여기서 추측하면 판정이 세 벌이 된다
        const currentPolyline = routeHolder?.routePolyline || [];
        // 🟡 평가 중 후보를 붙인 경로는 «미리보기»다. 확정 경로인 척하면 안 된다 (#64)
        const isPreviewRoute = !!routeHolder && isEvaluating(routeHolder.status);
        const hasPolyline = currentPolyline.length > 0;

        const validPolyline = currentPolyline.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        /* 🗺️ 좌표를 모르는 발자취는 **그릴 수 없다** — 번호는 살아 있고 지도만 건너뛴다.
           술어로 걸러야 뒤에서 좌표를 «있는 것»으로 쓸 수 있다 (지어내지 않는다 · 규칙 ④) */
        const trail = (visitedTrail ?? []).filter(
            (p): p is typeof p & { x: number; y: number } => Number.isFinite(p.x) && Number.isFinite(p.y));
        const drivenSegs = (drivenTrail ?? [])
            .map(seg => seg.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
            .filter(seg => seg.length > 1);
        const driven = drivenSegs.flat();

        /**
         * 🔬 **계측 — «왜 선이 없나»**.
         *
         * 🔴 **그리는 조건이 셋이다** — 어느 것에 걸렸는지 적지 않으면 「다 돌아서 없는 것」과
         *    「홀더가 비어서 없는 것」과 「레이어가 꺼진 것」을 가릴 수 없다. 재료 쪽은 `[경로재료]`(`useRouteDerivations`)가 답한다 —
         *    이 줄은 **그렸나**만 답한다 (한 줄이 두 질문에 답하지 않게 · 규칙 ⑤-4 ⑤).
         * ⚠️ `logStateChange` 는 값이 바뀔 때만 찍는다 — 손짓마다 다시 그려도 로그가 안 밀린다.
         * ⚠️ 계측이다. 원인이 확정되면 지우거나 정식 로그로 승격한다.
         */
        logStateChange("경로그림",
            `레이어 ${layers.route ? '켜짐' : '꺼짐'}` +
            ` · 카카오 ${currentPolyline.length}점(성한 것 ${validPolyline.length})` +
            ` · 자취 ${drivenSegs.length}구간` +
            ` → ${!layers.route ? '안 그림 — 레이어 꺼짐'
                : !hasPolyline ? '안 그림 — 홀더에 궤적이 없다'
                    : validPolyline.length === 0 ? '안 그림 — 좌표가 다 깨졌다'
                        : '그렸다'}`,
            "진행중경로");
        const allCoords = [...validPoints, ...validPolyline, ...trail, ...driven] as { x: number, y: number }[];
        if (myLocation) allCoords.push(myLocation);
        /* 🔺 그물을 켜면 그 삼각형까지 보이게 — 안 그러면 현위치만 확대돼 선 하나만 스쳐 간다 */
        if (coneOverlay) for (const [x, y] of coneOverlay.tri) allCoords.push({ x, y });
        /* 🔭 상차 · 하차 영역도 화면에 들어오게 — 영역을 감싼 네모를 넣는다. 네모는 영역이 밖으로 나가거나 절반 아래로 줄 때만 새로 잡는다:
              마름모는 달리는 동안 300m 눈금 · «가까이 옴»으로 계속 바뀌어, 점을 그대로 넣으면 확대가 매번 다시 잡힌다 (#150) */
        const areaBox = stickyFitBox(fitBoxRef.current, areaBoxOf({
            circles: [
                ...(pickupArea ? [{ x: pickupArea.me.x, y: pickupArea.me.y, km: pickupArea.meKm }] : []),
                ...(dropoffArea ? [...dropoffArea.circles, ...dropoffArea.nearCircles] : []),
            ],
            polygons: dropoffArea ? dropoffArea.quads : [],
            lines: dropoffArea ? dropoffArea.lines : [],
        }));
        fitBoxRef.current = areaBox;   // 🔭 흔들림 방지 기억은 **자르기 전** 값이다 — 자른 값을 넣으면 매 프레임 다시 잡힌다
        /* 🔭 영역은 경로 네모의 2배 안까지만 — 통째로 담으면 먼 원 하나가 화면을 다 먹어 경로가 실처럼 보인다 (`capAreaBox`) */
        const routeBox = areaBoxOf({ circles: [], polygons: [allCoords], lines: [] });
        const fitArea = capAreaBox(routeBox, areaBox);
        if (fitArea) allCoords.push({ x: fitArea.minX, y: fitArea.minY }, { x: fitArea.maxX, y: fitArea.maxY });
        /* 🎯 목적지 마커 — 움직이지 않는다 */
        if (dropoffArea) for (const g of dropoffArea.goals) allCoords.push(g);
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
         * 경로선 두께(`routeLineWidth`)가 이 값을 본다 — 어느 길로 확대했든 같아야 한다.
         */
        const baseViewport = computeViewport(allCoords, width, height, 1, { x: 0, y: 0 }, occludedNow.current);
        const shownZoom = effectiveZoom(viewport.worldSize, baseViewport.worldSize);
        const getScreenPt = (p: { x: number, y: number }) => toScreenPoint(p, viewport);

        // 0. 🗺️ 배경 — 타일이 왔으면 타일, 아직 없으면 시·도 외곽선 (터널·음영에서도 빈 화면이 안 된다)
        const readyTiles = collectTiles(viewport, width, height, () => drawRef.current());
        if (readyTiles.length > 0) {
            ctx.save();
            /* 🎨 회색조·연하게 — 배경이 시끄러우면 색 · 영역이 안 읽힌다 (규칙 ⑤-3).
               배율과 상관없이 늘 같은 톤이다 — 확대해도 제 색으로 안 돌린다 (`mapTileTone`). */
            /* 🔆 밝은 테마는 지도가 흰 바탕 위라 더 밝게 뜬다 — 조금 더 눌러 준다 */
            /* 🌓 밝기는 «어둡게» 레이어와 배율이 정한다 — 확대할수록 옅어진다 (`tileToneFor` 한 곳) */
            const tone = tileToneFor(theme, shownZoom, !!layers.dim);
            if (supportsCanvasFilter(ctx) && tone.filter) ctx.filter = tone.filter;
            ctx.globalAlpha = tone.alpha;
            // 🧅 «배경» 레이어 — 끄면 타일만 빠지고 경계·경로는 남는다
            if (layers.base) readyTiles.forEach(t => ctx.drawImage(t.img, t.cx, t.cy, t.size + 1, t.size + 1));
            ctx.restore();
            if (tone.overlay > 0) {
                ctx.fillStyle = `rgba(10, 14, 22, ${tone.overlay})`;   // 어두운 테마에서 한 겹 더 눌러 준다
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
         * 0.5. 🗺️ **경계선 — 타일 위에도 얹는다** — 구역이 안 나뉘면 «서울로 간 건지 성남으로 간 건지» 모른다
         *    (자료는 `sidoData` — 서울특별시 + 경기도 시·군·구).
         *
         * 🔴 **선만 얹는다. 면은 안 칠한다** — 채우면 회색조 지도가 또 한 겹 탁해져
         *    판정 색이 안 읽힌다 (규칙 ⑤-3).
         * 🔴 **배율과 무관하게 선명도를 유지한다** — «확대하면 타일에 경계가 나오니 물러나자»가 아니다.
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
         * 🕸️ **영역 레이어 (상차 · 하차)**.
         *
         * 그리는 차례가 뜻이다 — **면을 먼저 옅게 깔고**(마름모·원·라인 띠 한 겹),
         * 그 위에 **테두리**를 얹고, 마지막에 **동 점**을 찍는다.
         * 🔴 면을 한 겹으로 모아 칠하는 이유: 마름모와 원이 겹치는 자리가 **두 번 칠해지면**
         *    더 진해져서 «여기가 더 안쪽»처럼 읽힌다. 그래서 숨은 틀(`makeMask`)에 불투명으로 모은 뒤 한 번에 옅게 올린다.
         */
        /** 🎭 기기 픽셀 크기의 숨은 캔버스 — 영역을 **불투명으로 모아 그리는 틀** (겹쳐도 두 번 짙어지지 않고, 테두리를 딸 수 있다) */
        /**
         * 🎨 **가리개 캔버스는 만들지 말고 다시 쓴다** (기사님: «상차·하차 레이어가 있으면 버벅인다»).
         *
         * 레이어마다 화면 크기 캔버스를 새로 만들면, 상차·하차 둘만 켜도 한 번 그릴 때마다
         * **전화면 캔버스 넷**이 났다 사라진다 — 폰에서 할당·회수 비용이 그대로 프레임에 얹힌다.
         * 하나를 쥐고 있다가 **지우고 다시 쓴다.**
         */
        const makeMask = () => {
            const off = maskRef.current ??= document.createElement('canvas');
            if (off.width !== canvas.width || off.height !== canvas.height) {
                off.width = canvas.width; off.height = canvas.height;
            }
            const oc = off.getContext('2d');
            if (oc) {
                oc.setTransform(1, 0, 0, 1, 0, 0);   // 앞 레이어가 남긴 배율을 지운다
                oc.clearRect(0, 0, off.width, off.height);
                oc.globalCompositeOperation = 'source-over';
                oc.globalAlpha = 1;
                oc.scale(dpr, dpr);
            }
            return { off, oc };
        };
        /**
         * ✏️ **칠한 모양의 바깥 테두리만 긋는다**.
         * 틀을 8방향으로 `px` 만큼 밀어 겹친 뒤 원래 틀을 지우면 **바깥 띠만** 남는다 — 원 · 마름모 · 띠가 겹친 안쪽에는 선이 안 생긴다.
         * ⚠️ 방향을 늘리면 테두리가 더 고르지만 그릴 때마다 전체 화면을 그만큼 더 옮긴다 — 2px 에는 8방향이면 이음새가 안 보인다.
         */
        /**
         * ✂️ **라인 시작(현위치)에서 경로와 직각인 선 앞쪽만 칠하게 자른다** — 서버와 같은 `aheadOf` (#151).
         *    끝을 평평하게(butt) 그리는 것만으로는 짧게 꺾인 자리의 둥근 이음이 차 뒤를 덮었다 — 선 하나로 자른다.
         */
        const clipAhead = (c2d: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>, km: number) => {
            const cut = aheadOf(pts.map(p => [p.x, p.y] as [number, number]), km);
            if (!cut) return;
            const s = getScreenPt({ x: cut.start.lng, y: cut.start.lat });
            const f = getScreenPt({
                x: cut.start.lng + cut.dir.x / (111.32 * Math.cos((cut.start.lat * Math.PI) / 180)),
                y: cut.start.lat + cut.dir.y / 110.574,
            });
            const len = Math.hypot(f.cx - s.cx, f.cy - s.cy) || 1;
            const dx = (f.cx - s.cx) / len, dy = (f.cy - s.cy) / len;
            const big = (width + height) * 4;
            c2d.beginPath();
            c2d.moveTo(s.cx - dy * big, s.cy + dx * big);
            c2d.lineTo(s.cx - dy * big + dx * big, s.cy + dx * big + dy * big);
            c2d.lineTo(s.cx + dy * big + dx * big, s.cy - dx * big + dy * big);
            c2d.lineTo(s.cx + dy * big, s.cy - dx * big);
            c2d.closePath();
            c2d.clip();
        };

        /**
         * 🟢 **상차 영역 모양을 그린다 — 한 곳** · 칠하는 색 · 합성 방식은 부르는 쪽이 정한다.
         *    «상차» 레이어가 칠하고, «하차» 레이어가 같은 모양을 **지운다**(먼 목적지는 상차 영역을 뺀다).
         */
        const tracePickup = (c2d: CanvasRenderingContext2D, area: NonNullable<Props['pickupArea']>) => {
            const c = getScreenPt(area.me);
            const east = getScreenPt({ x: area.me.x + 1 / (111.32 * Math.cos((area.me.y * Math.PI) / 180)), y: area.me.y });
            const pxPerKm = Math.abs(east.cx - c.cx);
            const meR = Math.max(0, area.meKm) * pxPerKm;
            const band = area.line && area.line.length >= 2 ? area.line : null;
            c2d.save();
            /* 🔴 **켜진 조각을 전부 겹친다**(∩) — 하나씩 clip 으로 좁히고 마지막에 한 번 칠한다.
                  겹쳐 칠하면 합집합으로 보인다 (기사님이 잡아 주신 자리) */
            c2d.beginPath(); c2d.arc(c.cx, c.cy, meR, 0, Math.PI * 2); c2d.clip();
            if (area.goals.length) {
                /* 🎯 가까이 온 목적지 원들은 서로 **더한다**(∪) — 한 경로에 원 여럿을 그리면 합집합으로 clip 된다 */
                c2d.beginPath();
                for (const g of area.goals) {
                    const s = getScreenPt(g.at);
                    c2d.moveTo(s.cx + Math.max(0, g.km) * pxPerKm, s.cy);
                    c2d.arc(s.cx, s.cy, Math.max(0, g.km) * pxPerKm, 0, Math.PI * 2);
                }
                c2d.clip();
            }
            if (band) {
                /* ✂️ 시작을 평평하게 자른다 — 띠의 둥근 끝이 지나온 곳을 덮지 않게 (서버 `pickupListFor` 와 같다).
                   🔴 방향은 **첫 점 → 끝점**이다. 마지막 한 구간에서 뽑으면 골목이 영역을 통째로 돌린다 */
                clipAhead(c2d, [band[0], band[band.length - 1]], area.lineKm);
                c2d.beginPath();
                band.forEach((p, i) => { const s = getScreenPt(p); if (i === 0) c2d.moveTo(s.cx, s.cy); else c2d.lineTo(s.cx, s.cy); });
                c2d.lineWidth = area.lineKm * 2 * pxPerKm;
                c2d.lineCap = 'round'; c2d.lineJoin = 'round';
                c2d.stroke();
            } else {
                /* 띠가 없으면 여기까지 좁힌 영역을 통째로 칠한다 */
                c2d.beginPath(); c2d.arc(c.cx, c.cy, meR, 0, Math.PI * 2); c2d.fill();
            }
            c2d.restore();
        };

        /**
         * 🟢 «상차» 레이어 — 원달앱이 상차지를 거르는 영역.
         * 현위치 영역 전체를 칠하거나, **내 위치 원으로 잘라(clip)** 그 안에서만 라인 띠를 칠한다 — 원 ∩ 라인이 테두리 매끈하게 나온다.
         * 틀에 모아 옅게 올리고 **바깥 테두리**를 긋는다. 하차(파랑)와 가르려고 초록으로 칠한다.
         */
        if (layers.pickup && pickupArea) {
            const { off, oc } = makeMask();
            if (oc) {
                oc.fillStyle = '#16a34a'; oc.strokeStyle = '#16a34a';
                tracePickup(oc, pickupArea);
                ctx.save();
                ctx.globalAlpha = 0.28;
                ctx.drawImage(off, 0, 0, width, height);
                ctx.restore();
                /* 🔴 **테두리는 긋지 않는다** (기사님 지시) — 채움만으로 영역이 읽히고, 폰에서 값이 싸다 */
            }
        }

        /**
         * 🔵 «하차» 레이어 — 원달앱이 하차지를 거르는 영역.
         * 원 · 마름모 · 띠의 **합집합**이다. 틀에 불투명으로 모아 그린 뒤 한 번에 옅게 올리고 **바깥 테두리**를 긋는다.
         * ✂️ 먼 목적지 조각에서 **상차 영역을 지우고**, 🎯 가까이 온 목적지 원은 **지운 뒤에** 칠한다.
         * ⚠️ 원달앱은 **동 목록**으로 빼고 지도는 **도형**으로 지운다 — 경계에 걸친 큰 읍·면에서 둘이 조금 다를 수 있다.
         * 🔴 모르는 조각(좌표를 모르는 목적지 · 확정콜의 마지막 하차지)은 부르는 쪽이 이미 뺐다 — 여기서 지어내지 않는다 (규칙 ④).
         */
        if (layers.dropoff && dropoffArea && (dropoffArea.circles.length || dropoffArea.nearCircles.length || dropoffArea.quads.length || dropoffArea.lines.length)) {
            const { off, oc } = makeMask();
            if (oc) {
                const pxPerKmAt = (p: { x: number; y: number }) => {
                    const a = getScreenPt(p);
                    const b = getScreenPt({ x: p.x + 1 / (111.32 * Math.cos((p.y * Math.PI) / 180)), y: p.y });
                    return Math.abs(b.cx - a.cx);
                };
                oc.fillStyle = '#2563eb'; oc.strokeStyle = '#2563eb';
                for (const c of dropoffArea.circles) {
                    const s = getScreenPt(c);
                    oc.beginPath(); oc.arc(s.cx, s.cy, Math.max(0, c.km) * pxPerKmAt(c), 0, Math.PI * 2); oc.fill();
                }
                for (const q of dropoffArea.quads) {
                    if (q.length < 3) continue;
                    oc.beginPath();
                    q.forEach((p, i) => { const s = getScreenPt(p); if (i === 0) oc.moveTo(s.cx, s.cy); else oc.lineTo(s.cx, s.cy); });
                    oc.closePath(); oc.fill();
                }
                for (const l of dropoffArea.lines) {
                    if (l.points.length < 2) continue;
                    oc.save();
                    /* ✂️ 시작(운행 뒤면 현위치 — 부르는 쪽이 `lineFromPoint` 로 잘랐다)에서 경로와 직각으로 자른 선 앞쪽만 */
                    clipAhead(oc, l.points, l.km);
                    oc.beginPath();
                    l.points.forEach((p, i) => { const s = getScreenPt(p); if (i === 0) oc.moveTo(s.cx, s.cy); else oc.lineTo(s.cx, s.cy); });
                    oc.lineWidth = Math.max(3, l.km * 2 * pxPerKmAt(l.points[0]));
                    oc.lineCap = 'round'; oc.lineJoin = 'round';
                    oc.stroke();
                    oc.restore();
                }
                /* ✂️ 먼 목적지 조각에서 상차 영역을 지운다 — 상차 레이어를 꺼도 뺀다 (보기 스위치와 규칙은 따로다) */
                if (pickupArea) {
                    oc.save();
                    oc.globalCompositeOperation = 'destination-out';
                    tracePickup(oc, pickupArea);
                    oc.restore();
                }
                /* 🎯 가까이 온 목적지 원은 지운 뒤에 칠한다 — 빼지 않는다 (관내콜) */
                for (const c of dropoffArea.nearCircles) {
                    const s = getScreenPt(c);
                    oc.beginPath(); oc.arc(s.cx, s.cy, Math.max(0, c.km) * pxPerKmAt(c), 0, Math.PI * 2); oc.fill();
                }
                ctx.save();
                ctx.globalAlpha = 0.22;
                ctx.drawImage(off, 0, 0, width, height);
                ctx.restore();
                /* 🔴 **테두리는 긋지 않는다** (기사님 지시) — 채움만으로 영역이 읽히고, 폰에서 값이 싸다 */
            }
        }

        /* 📍 «동 점» 레이어 — 원달앱에 내려간 목록 (🔵 하차 · 🟢 상차 · 둘 다는 파랑 · 테두리 없음 · 목적지 마커 아래) */
        if (layers.dots && dongDots) {
            const dot = (p: { x: number; y: number }, fill: string) => {
                const { cx, cy } = getScreenPt(p);
                ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                ctx.fillStyle = fill; ctx.fill();
            };
            for (const p of dongDots.dropoff) dot(p, 'rgba(2,132,199,.42)');
            for (const p of dongDots.pickup) dot(p, 'rgba(22,163,74,.45)');
            /* 🟣 **둘 다는 보라** — 하차와 같은 파랑으로 찍으면 «이 동이 상차로도 등록됐나»를
               화면에서 못 가린다 (기사님 지적). 🔴 청록·노랑은 안 된다 — 지도가 이미 쓴다
               (자취 `#35c3a9` · 목적지 마커 주황). 보라만 남은 자리다 */
            for (const p of dongDots.both) dot(p, 'rgba(192,132,252,.5)');
        }

        /* 🎯 목적지 마커 — 살아 있는 목적지마다 */
        if (layers.dropoff && dropoffArea) {
            for (const goalPt of dropoffArea.goals) {
                const g = getScreenPt(goalPt);
                ctx.fillStyle = mapColors.nodeEvaluating;
                ctx.beginPath(); ctx.arc(g.cx, g.cy, 6, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
            }
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
         * 🔴 **경로선이 있으면 안 그린다** — 아래 «직선 N km» 글자와 짝이다 (둘 다 같은 조건으로 끈다).
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
         * 🔴 **경로선이 있으면 안 그린다** — 기사님은 **도로**를 달리지 직선을 달리지 않는다.
         *    카카오가 준 «주행 68.0km / 106분» 이 더 정확하고, **버퍼·데드라인이 전부 그 값**을 쓴다.
         *    둘을 나란히 두면 한 화면이 **두 답**을 한다.
         *
         *    다만 **경로가 아직 없거나 계산이 실패했을 때**는 «대충 얼마나 먼가»의 유일한
         *    답이다 — 그때만 남긴다 (규칙 ④: 모르면 모른다고 하되, 아는 만큼은 말한다).
         *
         * 🔴 **두 점이 가까워도 안 그린다.** 이 글자는 두 점의 **중간**에 놓여서, 둘이 붙으면
         *    중간점이 **마커 위에 올라앉아** 현위치와 이름표를 함께 덮는다.
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
         * 1. 🛣️👣 **두 선을 겹쳐 «얼마나 벗어났나»를 보여 준다**.
         *
         * 🔴 **색을 나눈다. 투명도로 겹치게 하지 않는다** — 같은 색 반투명 둘을 포개면
         *    «따라갔나»는 보여도 **«어느 쪽이 뭔지»를 못 가른다.**
         *
         *      파란 굵은 선   카카오가 준 **가야 할 길**   (아래)
         *      흰 얇은 선     내가 **실제로 간 길**        (위)
         *
         *    벗어나면 흰 선이 파란 길 밖으로 나간다 — 그게 이탈이다.
         * 🔴 순서가 뜻이다 — 계획이 **아래**, 실제가 **위**. 실제가 계획을 덮는다.
         */
        const drawPath = (pts: Array<{ x: number; y: number }>, widthScale: number, dash?: number[],
            /** 🌈 진행 방향의 직각으로 몇 픽셀 밀어 그린다 — 콜 띠를 나란히 둘 때 (`offsetScreenPath`) */
            offsetPx = 0) => {
            if (pts.length < 2) return;
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = routeLineWidth(shownZoom) * widthScale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (dash) ctx.setLineDash(dash);
            const screen = offsetScreenPath(pts.map(getScreenPt), offsetPx);
            screen.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.cx, p.cy); else ctx.lineTo(p.cx, p.cy);
            });
            ctx.stroke();
            ctx.restore();
        };

        /**
         * ① 아래 — 카카오가 준 «가야 할 길».
         *
         * 🌈 **구간마다 그 콜의 색으로 칠한다**.
         *    서버가 구간 경계(`sectionEnds`)와 구간 주인(`sectionStops`)을 함께 보낸다 —
         *    **둘의 길이가 같고**, 구간 i 는 «정거장 i 에 닿는 길»이다. 그래서 색은 그 정거장의 콜 색이다.
         * 🔴 **재료가 어긋나면 한 색으로 물러난다** — 길이가 다르거나 색표가 없으면 경로 전체를 한 색으로.
         *    색이 밀려 그려지는 것보다 한 색이 낫다 (규칙 ④: 지어내지 않는다).
         * ⚠️ 미리보기(결재 전)는 **노란 점선 한 색**을 지킨다 — «아직 내 콜이 아니다»가 색의 뜻이다.
         */
        if (layers.route && hasPolyline && validPolyline.length > 0) {   // 🧅 «경로» 레이어
            const secStops = routeHolder?.sectionStops;
            const secLines = sectionLinesOf(validPolyline, routeHolder?.sectionEnds);
            const sectionsOk = !!secStops && secLines.length > 1 && secLines.length === secStops.length
                && validPolyline.length === currentPolyline.length;   // 걸러진 점이 있으면 경계가 어긋난다
            const canPaintPerSection = !isPreviewRoute && !!callColors && sectionsOk;
            /**
             * 🗺️ **심사 중 — 이 후보가 늘린 구간을 판정 색으로 굵게** («이 콜을 끼면 이렇게 간다»).
             *    통째로 노란 점선이면 1~2초에 «어디가 늘었나»가 안 보인다. 구간 주인이 후보 콜이면 판정 색,
             *    나머지는 노란 점선 그대로 — «아직 내 콜이 아니다»는 지킨다. 판정 전이면 후보 구간도 노랑.
             * ⚠️ 깜빡이게 하지 않는다 — 캔버스를 0.26초마다 다시 칠해야 한다.
             */
            const candidateColor = routeHolder?.judgment?.color ? SOAK[routeHolder.judgment.color].bar : '#e6b422';
            if (isPreviewRoute && sectionsOk) {
                secLines.forEach((line, i) => {
                    const mine = secStops![i].orderId === routeHolder!.id;
                    ctx.strokeStyle = mine ? candidateColor : '#e6b422';
                    drawPath(line, mine ? 1.6 : 1, mine ? undefined : [10, 8]);
                });
            } else if (canPaintPerSection) {
                /**
                 * 🌈 **콜마다 «내 짐이 차에 있는 동안»을 자기 색 띠로 겹쳐 그린다** (기사님 확정).
                 *
                 * 구간 하나를 한 콜에만 칠하면 «이 길은 A 만 간다»로 읽힌다 — 그동안 B 도 차에 실려 있다.
                 * 그래서 콜마다 실으러 가는 구간부터 내리는 구간까지를 **반투명**으로 긋는다.
                 * 겹친 구간은 두 색이 함께 보여 «둘을 같이 싣고 간다»가 그대로 읽힌다 (`callBandsOf`).
                 *
                 * 🔴 **바닥 한 줄을 먼저 긋는다** — 띠가 없는 구간(다 내린 뒤 집으로 가는 길 등)이
                 *    비어 보이면 경로가 끊긴 것으로 읽힌다.
                 */
                /**
                 * 🩶 **빈 차로 가는 길은 회색 점선** — 어느 콜의 짐도 안 실린 구간이다
                 *    (다 내리고 다음 상차지로 가는 길 · 마지막 하차 뒤 집으로 가는 길).
                 *    콜 색으로 그으면 «이 콜을 싣고 간다»로 읽힌다 — 색과 모양을 함께 달리한다.
                 */
                ctx.strokeStyle = mapColors.textMuted;
                for (const i of uncoveredSectionsOf(secStops!, secLines.length)) drawPath(secLines[i], 0.8, [7, 6]);
                /**
                 * 🎨 **색은 진하게, 두께는 같게, 자리는 나란히** (기사님 지시 — 투명도로 섞으니 흐려서 안 읽힌다).
                 *    콜마다 진행 방향의 직각으로 밀어 그린다. 함께 가는 구간은 두 줄로 보인다.
                 * 🔴 **지금 향하는 콜을 맨 나중에 긋는다** — 겹치는 자리에서 가장 급한 콜이 위로 온다.
                 */
                const bands = [...callBandsOf(secStops!)];
                const nextOrderId = secStops![0]?.orderId;
                const drawOrder = bands
                    .map((b, i) => ({ b, i }))
                    .sort((p, q) => Number(p.b[0] === nextOrderId) - Number(q.b[0] === nextOrderId));
                for (const { b: [orderId, band], i: bi } of drawOrder) {
                    const color = callColors!.get(orderId);
                    if (!color) continue;
                    /* 🌈 콜이 늘면 두께·간격이 함께 준다 — 전체 폭이 넘치면 굵은 띠 하나로 뭉쳐 보인다 */
                    const { widthScale, shiftPx } = bandStrokeOf(bands.length, bi);
                    ctx.strokeStyle = color;
                    for (let i = band.from; i <= band.to && i < secLines.length; i++) drawPath(secLines[i], widthScale, undefined, shiftPx);
                }
            } else {
                ctx.strokeStyle = isPreviewRoute ? '#e6b422' : mapColors.routeLine;
                // 노란 점선 = 아직 결재 전
                drawPath(validPolyline, 1, isPreviewRoute ? [10, 8] : undefined);
            }
        }

        /**
         * ①-2 🟡 **후보 경로 — 확정 경로 «위에» 겹쳐 그린다** (기사님 확정).
         *
         * *"지금 영역은 그냥 경로에 그려 두고, 새로 추가되는 경로(후보)는 새 레이어에 그리자.
         * 그러면 기존 경로와 새 경로가 한 지도 위에 보일 거고, 버리면 새 레이어만 리셋하면 되니까."*
         *
         * 🔴 **확정 경로를 지우지 않는다** — «가고 있는 길»과 «붙이면 갈 길»을 견주어 1~2초에 누르신다.
         *    «확정 ?? 후보»로 하나만 고르면 콜을 쥐고 있을 때 이 점선이 안 뜬다.
         * 🔴 **영역에는 안 쓴다** — 잡지도 않은 콜이 원달앱 상차·하차 목록을 흔들면 안 된다.
         *    버리면 이 레이어만 사라진다 (`candidateHolder` 가 null 이 된다).
         * 🌈 늘어난 구간은 판정 색으로 굵게 — 위 «심사 중» 규칙과 같은 모양이다.
         */
        const candLine = (candidateHolder?.routePolyline ?? [])
            .filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        if (layers.route && candidateHolder && candLine.length > 1) {   // 🧅 «경로» 레이어 위
            const cStops = candidateHolder.sectionStops;
            const cLines = sectionLinesOf(candLine, candidateHolder.sectionEnds);
            const cOk = !!cStops && cLines.length > 1 && cLines.length === cStops.length
                && candLine.length === (candidateHolder.routePolyline?.length ?? 0);
            const cColor = candidateHolder.judgment?.color ? SOAK[candidateHolder.judgment.color].bar : '#e6b422';
            if (cOk) {
                cLines.forEach((line, i) => {
                    const mine = cStops![i].orderId === candidateHolder.id;
                    ctx.strokeStyle = mine ? cColor : '#e6b422';
                    drawPath(line, mine ? 1.6 : 1, mine ? undefined : [10, 8]);
                });
            } else {
                ctx.strokeStyle = '#e6b422';
                drawPath(candLine, 1, [10, 8]);
            }
        }

        // ② 위 — 내가 «실제로 간 길». 얇고 밝다. 파란 길 밖으로 나가면 그게 이탈이다
        if (layers.trail) {   // 🧅 «동선» 레이어 — 🔴 구간마다 **따로** 긋는다 (목업과 한 벌)
            /**
             * 🔴 **콜이 늘면 동선도 함께 얇아진다** (기사님 지시) — 콜 띠는 콜 수에 맞춰 얇아지는데
             *    동선만 그대로면 흰 줄이 색 줄을 덮어 «어느 콜의 길인가»가 안 읽힌다.
             */
            const trailWidth = 0.55 * (bandStrokeOf(callColors?.size ?? 1, 0).widthScale / 0.9);
            ctx.strokeStyle = mapColors.drivenLine;
            for (const seg of drivenSegs) drawPath(seg, trailWidth);
        }

        /**
         * 1.7. 👣 지나온 발자취 — 번호는 방문 순서로 동결 (①)
         *
         * 🩶 **색표를 켜면 다녀온 곳은 회색 원 · 진한 회색 번호 · 테두리 투명** — 색은 아직 안 간 콜만 쓴다.
         *    색이 넷이라 다녀온 콜이 색을 들고 있으면 5번째 콜과 같은 색으로 보인다.
         */
        markerHits.current = [];
        trail.forEach((p) => {
            const { cx, cy } = getScreenPt(p);
            markerHits.current.push({ cx, cy, orderId: p.orderId });
            const fill = rainbowNodes && p.callNo ? mapColors.textMuted : null;
            ctx.beginPath();
            ctx.arc(cx, cy, fill ? 10 : 9, 0, 2 * Math.PI);
            ctx.fillStyle = fill ?? withAlpha('#35c3a9', 0.4);       // 초록 채움 = 다녀옴 (색표를 안 쓸 때)
            ctx.fill();
            ctx.lineWidth = fill ? 1 : 2.5;
            ctx.strokeStyle = fill
                ? callNodeStroke(true, fill)                          // 다녀왔으니 «동그라미»를 친다
                : (callColors?.get(p.orderId) ?? '#35c3a9');
            ctx.stroke();
            ctx.fillStyle = fill ? '#374151' : '#d7f5ee';   // 🩶 다녀온 곳 번호는 진한 회색 — 흰 글자는 회색 원 위에서 여전히 눈을 끈다
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
            /* 🔍 마커는 **목록 동그라미와 같은 크기**다 — 크면 지도를 가리고,
               한 화면에서 같은 것이 두 크기로 보이면 다른 것처럼 읽힌다. */
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            const stopKind = p.type === '상차' ? 'pickup' : 'dropoff';
            /* 🌈 색상=콜 · 밝기=상차/하차 */
            const rainbowFill = rainbowNodes && p.callNo ? callNodeFill(p.callNo, stopKind, theme) : null;
            ctx.fillStyle = rainbowFill
                ?? (p.type === '상차' ? mapColors.nodePickup : mapColors.nodeDropoff);

            if (p.isEvaluating) {
                ctx.fillStyle = mapColors.nodeEvaluating;
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = mapColors.nodeStrokeEvaluating;
            } else if (rainbowFill) {
                /* 🖊️ 테두리는 `callNodeStroke` 가 정한다 — 다녀온 곳은 투명, 안 간 곳은 채움과 같은 색이라 링이 따로 안 보인다.
                   1px 로 얇게 — 목록 동그라미와 같은 두께다 */
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
            /* 🔍 정거장 번호 — 달리면서 먼발치로 읽는 숫자다. 원만 키우지 말고 글자도 키운다 */
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

            /**
             * 📍 **낡은 자리는 흐리게 — 옮기지도 지우지도 않는다** (기사님 확정).
             *
             * 🔴 **맥박(퍼지는 원)은 «지금 여기 있다»는 말**이다. 낡았으면 그 말을 멈춘다 —
             *    숨 쉬는 마커가 몇 분 전 자리에서 뛰고 있으면 화면이 거짓말한다 (규칙 ⑤-2).
             * ⚠️ 그래도 **점은 남긴다.** 지우면 «어디 있는지 아무 단서가 없는» 화면이 되고,
             *    마지막 자리는 집보다 비교가 안 되게 가깝다.
             */
            const time = Date.now() / 1000;
            const pulseRadius = 15 + Math.sin(time * 3) * 5;

            if (!myLocationStale) {
                ctx.beginPath();
                ctx.arc(cx, cy, pulseRadius, 0, 2 * Math.PI);
                ctx.fillStyle = withAlpha(mapColors.myLocationPulse, 0.2);
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = myLocationStale
                ? withAlpha(mapColors.myLocationPulse, 0.45)   // 흐리게 — «여기 있었다»
                : mapColors.myLocationPulse;
            ctx.strokeStyle = myLocationStale
                ? withAlpha(mapColors.myLocationStroke, 0.5) : mapColors.myLocationStroke;
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
    }, [unifiedRoutePoints, liveRoute, myLocation, visitedTrail, drivenTrail, routeHolder, coneOverlay, pickupArea, dropoffArea, dongDots, layers, callColors, theme, mapColors, occludedPx, rainbowNodes, viewMode]);

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
                 * 🤏 **두 손가락 «중간»을 붙잡은 채 배율만 바꾼다** (#96).
                 *
                 * 🔴 `zoomRef` 에 배율만 더하고 팬을 안 건드리면 확대의 중심이 화면이 원래 잡고 있던
                 *    곳이 되어, 손가락이 가운데서 벗어날수록 쏠린다.
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

        /* ✋ **끌어도 모드를 안 푼다** — 구간·현위치를 고른 뒤 끌어도 줌이 유지된다.
           🔴 여기서 `setViewMode('all')` 을 하지 않는다 — 모드는 **기준 배율**을 정하고 팬·줌은 그
              **위에 더해지는 값**이라, 모드를 풀면 기준이 통째로 바뀌어 **화면이 튀어나간다.**
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
     * 🔴 기준점은 `anchorBaseOf` 다 — 화면 원점(0,0)을 기준으로 삼지 않는다.
     *    실제 원점은 버튼 여백만큼 밀려 있어 **확대할수록 지도가 옆으로 흐른다.**
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
              * 🗺️ **위는 지도, 아래는 콜** (기사님 확정).
              *   좌상단 무엇에 맞출까 · 우상단 배율 · 좌하단 내비 · 우하단 콜 이름표.
              *   자리가 뜻을 나누면 운전 중에 **손이 기억한다.**
              *
              * 🔴 셋을 **풀어서** 놓는다 — 순환 버튼은 «지금 뭐지»를 눌러 봐야 알았다.
              * 🔴 켜진 것은 **바탕을 안 뒤집는다** — 테두리·글자만 파랗게 (뒤집으면 잘 안 보인다).
              */}
            {/**
              * 🗺️ **왼쪽 위 — 줌 묶음과 같은 꼴** (기사님 지시): 바깥 한 겹 안에
              *   ① **전체 · 구간 · 위치**를 왼쪽 끝 **세로**로 세워 늘 보이게
              *   ② 🧅 레이어 · QR코드는 그 옆에
              * 자리가 뜻을 나누면 운전 중에 손이 기억한다.
              */}
            <div className="absolute top-3 left-3 flex flex-row gap-2 items-start z-10">
                {/* 🔭 무엇에 맞출까 — 세로 한 줄, 상시 노출 */}
                <div className="flex flex-col items-start gap-2">
                {/* 🔤 글자는 짧게 — 달리면서 1~2초에 읽는 줄이다 (기사님 지시) */}
                {([['all', '전체'], ['leg', '구간'], ['follow', '위치']] as [MapViewMode, string][]).map(([m, label]) => (
                    <button
                        key={m}
                        onClick={() => pickViewMode(m, { setViewMode, zoom: zoomRef, pan: panRef, draw: drawMap })}
                        title={m === 'all' ? '정거장·경로가 다 보이게' : m === 'leg' ? '지금 가는 구간이 다 보이게' : '내 위치 둘레를 크게'}
                        className={mapBtn(viewMode === m, 'h-8 px-2.5 text-[11px]')}
                    >
                        {label}
                    </button>
                ))}
                </div>
                {/* 🧅 레이어 · QR코드 — 그 옆에 세로로 */}
                <div className="flex flex-col items-start gap-2">
                    {/* 🔴 **펼침 목록은 버튼 바로 아래에 붙는다** — 좌표(`top-[52px]`)로 두면 버튼이
                        옮겨질 때마다 목록만 옛 자리에 남는다 (규칙 ③). `relative` 안에서 따라다닌다. */}
                    <div className="relative">
                        <button
                            onClick={() => setLayersOpen(o => !o)}
                            title="지도에 무엇을 그릴까"
                            className={mapBtn(layersOpen, 'h-8 px-2.5 text-[11px]')}
                        >
                            🧅 {Object.values(layers).filter(Boolean).length}/{Object.keys(layers).length}
                        </button>
                        {layersOpen && (
                            <div className="absolute top-full left-0 mt-2 flex flex-col gap-1 z-10">
                                {([['base', '배경'], ['dim', '어둡게'], ['border', '경계'], ['pickup', '상차'], ['dropoff', '하차'], ['dots', '동 점'], ['route', '경로'], ['trail', '동선']] as [string, string][]).map(([k, label]) => (
                                    <button
                                        key={k}
                                        onClick={() => toggleLayer(k)}
                                        className={mapBtn(layers[k], 'h-7 px-2 gap-1 text-[11px] whitespace-nowrap')}
                                    >
                                        {layers[k] ? '👁' : '🚫'} {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/**
              * 🧅 **레이어 — 한 버튼 뒤에 접어 둔다**.
              *
              * 🔴 늘 띄우면 400px 화면에서 지도가 그만큼 좁아진다. 그리고
              *    **운전 중에는 입력을 못 한다** — 한 번 정하고 접는 값이다.
              * 🔴 자리는 **좌상단** — «무엇에 맞출까»(전체·현구간·현위치) 바로 아래다.
              *    보는 방식을 정하는 것끼리 모인다 (자리가 뜻을 나누면 손이 기억한다).
              */}
            {/* 🔝 지도 위 한가운데 — 왼쪽 줄과 오른쪽 줄 사이 (`centerButtons` 주석) */}
            {centerButtons && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                    {centerButtons}
                </div>
            )}

            {/**
              * 🔝 **오른쪽 위 — 바깥 버튼(방침·QR)은 가로로, ＋ − 초기화는 그 오른쪽에 세로 한 줄로** (기사님 지시).
              *
              * 여섯을 세로로 쌓으면 지도를 반이나 덮고, 여섯을 가로로 늘어놓으면 왼쪽 줄과 부딪힌다.
              * 자주 쓰는 것(방침·QR)은 윗줄에 가로로, **＋ − 초기화는 따로 세로로 세워 늘 보이게** 둔다.
              * 간격은 `gap-2` 하나가 정한다 — 좌표로 맞추지 않는다 (규칙 ③).
              */}
            {/* 🔝 오른쪽 위 — 바깥 버튼(방침)과 줌 셋이 **가로로 나란히** 선다 (기사님 지시) */}
            <div className="absolute top-3 right-3 flex flex-row gap-2 items-start z-10">
                {rightButtons}
                {/* 🔍 줌 셋은 세로 한 줄 — 늘 보인다 */}
                <div className="flex flex-col items-end gap-2">
                    <button
                        onClick={() => handleZoomClick(1.2)}
                        className={mapBtn(false, 'w-8 h-8')}
                    >
                        +
                    </button>
                    <button
                        onClick={() => handleZoomClick(0.8)}
                        className={mapBtn(false, 'w-8 h-8')}
                    >
                        -
                    </button>
                    <button
                        onClick={() => pickViewMode('all', { setViewMode, zoom: zoomRef, pan: panRef, draw: drawMap })}
                        className={mapBtn(false, 'w-8 h-8 text-[10px]')}
                    >
                        초기화
                    </button>
                </div>
            </div>
            {children}
        </div>
    );
}

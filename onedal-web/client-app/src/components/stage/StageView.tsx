import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { hasVisitedStop, effectiveRadii, isDeliveredCall, isEvaluating, lineFromPoint, goalZonesOf, withNearness, pickupShapeOf,
    dropoffPartsOf, lastDropOf, lineUntil, dongDotsOf, quadShapeFrom, quadOutline, cityCenter, haversineKm } from '@onedal/shared';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import { getAddressLabel, getDistanceKm } from '../../lib/routeUtils';
import PinnedRouteCanvas from '../dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from './StageSheet';
import { stageStep, initialStageMemory, type StageEvent } from './stageRules';
/* 🪟 높이와 «열린 것»을 함께 정하는 규칙 — 한 곳에만 산다 (규칙 ③) */
import { sheetTransition } from './sheetTransition';
import { barFocusOf, type BarFocus } from './barFocus';
/* 🎬 상태바 문구는 여기 한 곳이 정한다 — 화면은 그리기만 한다 (규칙 ③) */
import { sheetStatus } from '../../lib/sheetStatus';
import { remainOnRouteKm } from '../../lib/remainOnRoute';
import { trailOfShown, hiddenPastIds } from '../../lib/pastCalls';
import { deckOrder } from '../../lib/deckFocus';
/**
 * ✅ **«도착»이라고 말할 반경** (기사님 «기준점반경 100m»).
 *    🔴 서버가 도착을 **찍는** 조건(500m + 정지 30초)과 **다른 값이다.** 이것은 «화면이
 *       도착이라고 말할 자리»이고, 그쪽은 «장부에 도착을 적을 자리»다 (규칙 ⑤-4 ⑤).
 */
const ARRIVED_HERE_M = 100;

/** 📍 곁(`ARRIVED_HERE_M`)에 있는 다녀온 정거장 열쇠 — `orderId:pickup|dropoff` (시트 규칙이 미룬 도착을 다시 물을 때) */
function hereStopsOf(trail: Array<{ orderId: string; type: string; x?: number | null; y?: number | null }>,
                     me: { x: number; y: number } | null): string[] {
    if (!me) return [];
    return trail
        .filter(v => v.x != null && v.y != null && getDistanceKm(me.y, me.x, v.y!, v.x!) * 1000 <= ARRIVED_HERE_M)
        .map(v => `${v.orderId}:${v.type === '상차' ? 'pickup' : 'dropoff'}`);
}
import { callNodeFill, callNodeText } from '../../styles/callPalette';
import { useTheme } from '../../contexts/ThemeContext';
import { PinnedRouteBody } from '../dashboard/PinnedRoute';
import { useDepartureDue } from '../dashboard/DepartureCountdown';
import { useDriveMotion } from '../dashboard/VehicleStatusPanel';
import { useGpsFocusStore } from '../../stores/gpsFocusStore';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { logRoadmapEvent, logStateChange } from '../../lib/roadmapLogger';
import { socket } from '../../lib/socket';
/* 🗺️ 지도 아래 두 귀퉁이 — 규칙과 이름은 한 곳에서 온다 (규칙 ③) */
import { ROUTE_PRIORITIES, isPriorityLocked } from '../../lib/routePriority';
import NaviQr from '../dashboard/NaviQr';
import JudgmentSeat from '../dashboard/JudgmentSeat';

/**
 * 🎭 **무대 — 지도 배경 + 3단 시트.**
 *
 * «새 화면 미리보기» 토글이 켜졌을 때만 그려진다 — 꺼진 동안 옛 화면(PinnedRoute 단독)이
 * 그대로다. 파생은 여기서 제조소를 **한 번만** 부르고, 시트 내용물(PinnedRoute sheetOnly)
 * 에 넘긴다 — 🔴 훅 두 번 = 구독·상태 두 벌이라 금지.
 */
interface Props {
    activeRoute: SecuredOrder[];
    routeStops: RouteStopInfo[];
    routeComputedAt: string | null;
    /** 🧭 경로를 든 콜 — 서버가 고른 답 */
    routeHolderId?: string | null;
    /** 🟡 심사 중인 콜의 미리보기 궤적 홀더 */
    previewRouteHolderId?: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';
    setViewFilter: (f: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL') => void;
    /**
     * 🛣️ **노선 ↔ 🔷 동선 — 기사님이 고르는 그물 모양** (명세 §5).
     *
     * 🔴 **부모(`Dashboard`)가 쥔다** — 고르는 버튼은 **필터**에 있고 그리는 것은 **지도**라,
     *    한쪽이 제 상태를 들면 «필터는 동선인데 지도는 노선»이 된다 (규칙 ③).
     */
    routeMode: boolean;
}

export default function StageView(props: Props) {
    const { activeRoute, routeStops, routeComputedAt, routeHolderId, previewRouteHolderId, routeMode } = props;
    const derived = useRouteDerivations(activeRoute, routeStops, routeComputedAt, routeHolderId, previewRouteHolderId);
    const { liveRoute, cycleDeck, unifiedRoutePoints, myLocation, visitOrderMap } = derived;
    const [snap, setSnap] = useState<SheetSnap>('list');
    /**
     * 🙈 **지나간 콜 숨기기** — 상태바 오른쪽 끝 버튼이 이 값을 뒤집는다.
     *
     * 🔴 **고른 것은 기억한다** — 숨겼는데 다음 판에 다시 보이면 또 숨겨야 한다
     *    (지도 레이어와 같은 규칙·같은 이유). 브라우저에만 남는 편의값이라 못 읽어도 그만이다.
     */
    const [hidePast, setHidePast] = useState<boolean>(() => {
        try { return localStorage.getItem('hidePastCalls') === '1'; } catch { return false; }
    });
    const toggleHidePast = () => setHidePast(prev => {
        const next = !prev;
        try { localStorage.setItem('hidePastCalls', next ? '1' : '0'); } catch { /* 못 적어도 화면은 돈다 */ }
        return next;
    });
    /**
     * 🗺️ **시트가 아래를 몇 px 덮고 있나** — 시트가 재서 알려 준다.
     *    지도는 «시트»를 모르고 이 숫자만 받는다 — 부품끼리 얽히지 않게 (규칙 ③).
     */
    const [sheetPx, setSheetPx] = useState(0);
    /** 🧭 경로 방침(추천·시간·거리)을 펼쳤나 — 레이어 버튼과 같은 방식 (기사님 지시) */
    const [priorityOpen, setPriorityOpen] = useState(false);
    /** 🧭 QR 덮개 — «눌러서 크게» (작게 늘 띄우면 못 찍힌다) */
    const [qrOpen, setQrOpen] = useState(false);
    /** 🪧 결재 처리 중인 콜 — 두 번 눌리는 것을 막는다 (판정석이 스스로 재우지 않는다) */
    const [seatProcessingId, setSeatProcessingId] = useState<string | null>(null);
    /* 🎨 상태바 동그라미가 지도·목록과 같은 색을 쓴다 */
    const { theme } = useTheme();
    /**
     * 🪗 **열린 줄** — `-1` 은 «전부 닫힘»이다.
     * 🔴 **처음은 «전부 닫힘»(-1)이다** — 「나」는 콜의 아코디언 제목만 보이는 높이다 (L4).
     * ⚠️ `0` 으로 두면 **「나」인데 하나가 열려** 남는 자리가 없어 그 카드가 찌부러진다.
     *    여는 것은 「다」의 일이다.
     */
    const [openIdx, setOpenIdx] = useState<number>(-1);
    /** 📞 방금 KEEP 한 콜 — 시트가 「다」로 올라갈 때 **그 콜을 연다** */
    const keepFocusRef = useRef<string | null>(null);
    /** 🕰️ 사건이 가리켰는데 **아직 덱에 없어** 못 연 콜 — 덱이 갱신되면 그때 연다 */
    const pendingOpenRef = useRef<string | null>(null);
    const NAVI_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    const NAVI_ORIGIN = (import.meta.env.VITE_KAKAO_JS_ORIGIN as string | undefined)
        ?? 'https://1dal.altari.com';
    /**
     * 🧭 **이번에 건넬 정거장** — 다음 하나와 그 앞의 경유지들.
     * 🔴 카카오내비가 경유지를 **3개까지** 받는다 — 그래서 넷을 넘겨 자르지 않는다
     *    (`buildKakaoNaviUrl` 이 규격을 안다 · 규칙 ③).
     * ⚠️ 좌표가 없는 정거장은 **빼지 않고 멈춘다** — 지어내면 엉뚱한 데로 안내한다 (규칙 ④).
     */
    const qrSlice = derived.unifiedRoutePoints.slice(0, 4);
    const toNaviStop = (p: { name: string; x?: number; y?: number; type?: string }) =>
        (typeof p?.x === 'number' && typeof p?.y === 'number')
            ? { name: `${p.name}${p.type ? ` ${p.type}` : ''}`, x: p.x, y: p.y } : null;
    const qrStop = qrSlice.length ? toNaviStop(qrSlice[qrSlice.length - 1]) : null;
    const qrVia = qrSlice.slice(0, -1).map(toNaviStop)
        .filter(Boolean) as { name: string; x: number; y: number }[];
    const { filter, updateFilter } = useFilterConfig();
    /**
     * 📐 **반경 · 마름모 모양은 기사님이 필터에서 고친 값이다.**
     *
     * 🔴 **곱하는 자리를 만들지 않는다** — 자동 반경이면 «줄인 값»으로 그리고, 그 답은 `shared` 의
     *    `effectiveRadii` 하나다. 필터 화면도 같은 함수를 부른다 — 곱셈이 두 곳이면
     *    «서버는 줄였는데 지도는 원값»이 된다 (규칙 ③).
     * 🔴 마름모 모양은 **국면 그릇을 안 본다** — 국면과 무관한 **한 벌**이라 평면 필터에 실려 온다
     *    (명세 §3 · DB 자리는 `user_filters`). 국면 행마다 두면 손 안 댄 행에 옛 값이 남는다.
     */
    const radii = effectiveRadii(filter);

    /**
     * 🟢 **상차 영역 — 살아 있는 목적지마다 상태로 정한다** (`docs/지금/필터.md` «상차 영역»).
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
    /* 🔴 판정 중 후보콜은 안 센다 — 서버 `getActiveCalls` 는 확정 콜만 본다. 세면 지도만 «경로 생김»이 되고 후보콜 하차지를 종착지로 잡는다 */
    const confirmedCalls = useMemo(() => liveRoute.filter(o => !isEvaluating(o.status)), [liveRoute]);
    const pickupAreaIn = filter?.pickupArea;
    const homeOn = pickupAreaIn?.homeOn ?? false;
    const homeCity = pickupAreaIn?.homeCity ?? null;
    const zones = goalZonesOf({
        destinationCity: filter?.destinationCity,
        homeCity,
        homeOn,
        homeCaught: pickupAreaIn?.homeCaught ?? false,
        departed: filter?.dispatchPhase === 'DELIVERING',
        activeCalls: confirmedCalls,
    });
    /**
     * 🎯 **목적지 가까이 옴** — 마름모가 현위치 원 ∪ 목적지 원 안에 통째로면 상차 A 전체 · 하차 그 목적지 원 전체 (필터.md «필터 영역»).
     *    서버 `rebuildPickupList` 와 **같은 `withNearness`** 다. 마름모 계산이 무거워 내 위치를 ~300m 눈금으로 굳힌다.
     */
    const quadShape = quadShapeFrom(filter as unknown as Record<string, unknown>);
    const meGridX = myLocation ? Math.round(myLocation.x * 300) / 300 : null;
    const meGridY = myLocation ? Math.round(myLocation.y * 300) / 300 : null;
    const zonesKey = JSON.stringify(zones);
    const nearZones = useMemo(() => {
        const base = JSON.parse(zonesKey) as typeof zones;
        if (meGridX == null || meGridY == null) return base;   // 내 위치를 모르면 «멀다»로 둔다
        return withNearness(base, {
            me: { x: meGridX, y: meGridY },
            params: {
                srcAngleDeg: quadShape.srcAngleDeg, dstAngleDeg: quadShape.dstAngleDeg, quadRadiusKm: radii.quadRadiusKm,
                srcDiamKm: radii.pickupRadiusKm * 2, dstDiamKm: radii.destinationRadiusKm * 2,
            },
        });
    }, [zonesKey, meGridX, meGridY, quadShape.srcAngleDeg, quadShape.dstAngleDeg, radii.quadRadiusKm, radii.pickupRadiusKm, radii.destinationRadiusKm]);
    const nearKey = JSON.stringify(nearZones);
    const pickupShape = pickupShapeOf(nearZones);

    /**
     * 🔵 **하차 영역 — 살아 있는 목적지마다 조각을 모은다** (`docs/지금/필터.md` «하차 영역»).
     *
     * 조각은 shared `dropoffPartsOf` — 콜 없음: 현위치 원 ∪ Q(현위치→목적지) ∪ 목적지 원 · 경로 생김: 현위치 원 ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 원
     *    · 운행 뒤: 라인 ∪ Q(종착지→목적지) ∪ 목적지 원. 목적지가 집이어도 같다.
     * 종착지는 경로 순서(`routeStops`)에서 그 목적지 콜의 마지막 하차지(`lastDropOf`) · 라인은 지금 그리는 경로 선을 거기까지 자른 것(`lineUntil`).
     * 🔴 서버 하차 목록(`filterManager.netOfGoals`)도 같은 규칙이다 — 다만 원달앱은 상차 목록 동을 **동 목록**으로 빼고 지도는 **도형**으로 지워,
     *    경계에 걸친 큰 읍·면에서 조금 다를 수 있다 (알고 둔 차이 · 필터.md «지금 코드와 다른 곳»).
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
        return (JSON.parse(nearKey) as typeof zones).flatMap(z => {
            let center: { lng: number; lat: number };
            try { center = cityCenter(z.city); } catch { return []; }   // 지도에 없는 시 — 그 목적지는 모른다
            if (!Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return [];
            /* 🎯 가까이 온 목적지는 목적지 원뿐 — 종착지 · 라인 · 마름모를 안 만든다 */
            const lastDrop = z.state === 'idle' || z.near ? null
                : lastDropOf({ isHome: z.isHome, homeOn, homeCity, stops: routeStops, calls: confirmedCalls });
            const line = dropoffLine && lastDrop ? lineUntil(dropoffLine, lastDrop) : [];
            const parts = dropoffPartsOf(z.state, line.length >= 2, z.near);
            /* 🔴 종착지를 모르면 그 마름모는 안 그린다 — 앞 정거장으로 대신하지 않는다 (규칙 ④) */
            const from = parts.quadFrom === 'me' ? meGrid
                : parts.quadFrom === 'lastDrop' && lastDrop ? { name: '종착지', lng: lastDrop.x, lat: lastDrop.y } : null;
            const quad = from && haversineKm(from, center) >= 1
                ? quadOutline(params, from, { name: z.city, lng: center.lng, lat: center.lat }).map(q => ({ x: q.lng, y: q.lat }))
                : null;
            return [{ center: { x: center.lng, y: center.lat }, near: !!z.near, me: parts.me, line: parts.line ? line : null, quad }];
        });
    }, [nearKey, meGridX, meGridY, dropoffLine, routeStops, confirmedCalls, homeOn, homeCity,
        quadShape.srcAngleDeg, quadShape.dstAngleDeg, radii.quadRadiusKm, radii.pickupRadiusKm, radii.destinationRadiusKm]);
    const dropoffDeparted = filter?.dispatchPhase === 'DELIVERING';
    const dropoffArea = useMemo(() => {
        /* 🔴 내 위치를 모르면 그리지 않는다 (규칙 ④) */
        if (!myLocation || !dropoffParts) return null;
        return {
            /* 먼 목적지 조각 — 캔버스가 여기서 상차 영역을 지운다 (필터.md «하차 영역» · 원달앱은 상차 목록 동을 뺀다) */
            circles: dropoffParts.filter(p => !p.near).flatMap(p => [
                { ...p.center, km: radii.destinationRadiusKm },
                ...(p.me ? [{ x: myLocation.x, y: myLocation.y, km: radii.pickupRadiusKm }] : []),
            ]),
            /* 🎯 가까이 온 목적지 원 — 지운 뒤에 칠한다 (빼지 않는다) */
            nearCircles: dropoffParts.filter(p => p.near).map(p => ({ ...p.center, km: radii.destinationRadiusKm })),
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
    }, [myLocation, dropoffParts, dropoffDeparted, radii.destinationRadiusKm, radii.pickupRadiusKm, radii.detourRadiusKm]);

    /* 🟢 상차 영역 도형 — 위 «상차 영역» 주석. ⚠️ 하차 계산 **뒤에** 둔다: 앞에 두면 하차 계산이 같은 재료(`liveRoute` · 경로 선)를
          함수에 넘기는 것을 React 컴파일러가 «메모 뒤의 변경»으로 보고 이 메모를 포기한다 (lint:gate) */
    /* 🔷 동선이면 띠가 없다 — 서버 `rebuildPickupList` 도 `routeMode === false` 면 라인을 안 넘긴다 */
    const pickupLine = routeMode && pickupShape === 'meLine' ? derived.drawHolder?.routePolyline ?? null : null;
    const pickupArea = useMemo(() => {
        /* 🔴 내 위치를 모르면 원을 지어내지 않는다 — 안 그린다 (규칙 ④) */
        if (!myLocation || !pickupShape) return null;
        /* ✂️ 띠는 현위치부터 앞으로만 — 지나온 길은 상차 영역이 아니다 (서버 `pickupListFor` 와 같은 `lineFromPoint`) */
        const ahead = pickupLine && pickupLine.length >= 2
            ? lineFromPoint(pickupLine.map(p => [p.x, p.y] as [number, number]), { lng: myLocation.x, lat: myLocation.y }).map(([x, y]) => ({ x, y }))
            : [];
        return {
            me: myLocation, meKm: radii.pickupRadiusKm,
            /* 🔴 띠가 없으면(동선 · 경로를 모름) 원 전체 — 서버 `pickupListFor` 가 그렇게 목록을 만든다. 안 그리면 하차에서도 안 지워진다 */
            line: ahead.length >= 2 ? ahead : null,
            lineKm: radii.detourRadiusKm,
        };
    }, [myLocation, pickupShape, pickupLine, radii.pickupRadiusKm, radii.detourRadiusKm]);

    /* 📍 동 점 — 원달앱에 실제로 내려간 상차 목록 · 하차 목록 (shared `dongDotsOf`). 지도가 따로 계산하지 않는다 */
    const dongDots = useMemo(() => (filter
        ? dongDotsOf({ pickupGroups: filter.pickupGroups ?? {}, dropoffGroups: filter.destinationGroups ?? {} })
        : null), [filter]);


    /**
     * 🧠 **상태 규칙은 `stageRules.stageStep` 한 곳에 있다.**
     *
     * 여기(화면)는 **신호를 재서 넣고, 결과를 그릴 뿐**이다 — 🔴 규칙을 화면 안에 두면 검사할 수가 없다.
     */
    const drive = useDriveMotion();
    const mem = useRef(initialStageMemory());
    const judging = derived.judging;
    /**
     * 🙈 **덱에 실제로 그려지는 목록** — 숨길 id 를 고르는 자리와 «몇 번째가 열렸나»가
     *    **같은 배열**을 봐야 한다 (규칙 ③). `PinnedRoute` 가 넘기는 것과 글자까지 같다.
     * 🔴 사건이 «열 콜»의 자리를 찾는 곳도 이 배열이다 — `cycleDeck`(심사 콜 포함)에서 찾으면 자리가 어긋난다 (#143)
     */
    const deckList = deckOrder(cycleDeck).filter(o => o.id !== judging?.id);

    /**
     * 📡 **시트 전환은 전부 사유와 함께 로그로 남긴다.**
     *    서버 로그에 중계되므로(관제웹 로그 릴레이) GPS 궤적(gps_tracks)과 시각을
     *    맞대 «언제 내려가고 올라왔어야 했나»를 사후 검증할 수 있다.
     */
    const [ruleTick, setRuleTick] = useState(0);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 규칙에 한 걸음 먹인다 — 결과(높이·사유·미룸)를 화면에 옮기는 것이 여기 할 일의 전부 */
    /** 🎬 시트 상태바가 가리키는 콜·단계 — 아래(상태바 재료 옆)에서 매 렌더 채운다. feed 는 사건 때 이것을 읽는다 (#143) */
    const barFocusRef = useRef<BarFocus | null>(null);
    const feed = (ev: StageEvent) => {
        const now = Date.now();
        const r = stageStep(mem.current, {
            nowMs: now, calls: liveRoute.length, judging: !!judging, drive,
            /* 📍 곁(100m)의 다녀온 정거장 — 유예 중 미룬 도착을 다시 물을 때 «아직 곁인가» (stageRules) */
            hereStops: hereStopsOf(derived.visitedTrail, myLocation),
            /* 🪜 「나」에 보일 콜 줄이 없나 — 콜 없음 · 지난 콜 숨김으로 전부 가림 · 판정 중이면 판정석이 있어 안 빈다 (#147) */
            listEmpty: !judging && deckList.every(o => hidePast && isDeliveredCall(o)),
            /* 🪧 심사가 뜰 때 «올릴까»는 지금 높이에 달렸다 (`snapOnJudging`) */
            snap,
        }, ev);
        mem.current = r.mem;
        if (r.snap) {
            logStateChange("시트", `${r.snap}·${r.reason}`, "무대");
            /**
             * 🔴 **자동 전환도 «높이 규칙»(`sheetTransition`) 한 곳을 거친다** — `setSnap` 만 하면
             *    KEEP·도착으로 「다」에 올라가도 아코디언이 안 열려 **빈 시트가 지도를 덮는다**
             *    (S3 「다」는 하나 열린 상태 · S4 가·나로 내려오면 닫는다).
             * 🪜 **사건이 가리킨 콜은 «강한 지시»(`focusIdx`)로 넘긴다** — «그 콜의 그 단계»를 연다 (화면규칙 S13).
             *    ⚠️ `preferIdx`(약한 추천)로 넘기면 안 된다 — 열려 있던 딴 콜에 밀린다.
             */
            /* 🎬 맨 위로 올라가면 **시트 상태바가 가리키는 콜**을 연다 — KEEP 만 방금 잡은 콜 · 손 탭은 손이 고른 줄 (#143) */
            const eventId = r.snap !== 'full' ? null
                          : ev.type === 'keep' || ev.type === 'keepReady' ? keepFocusRef.current
                          : ev.type === 'tap' ? null
                          : barFocusRef.current?.orderId ?? (ev.type === 'arrive' ? ev.orderId ?? null : null);
            const want = eventId ? deckList.findIndex(o => o.id === eventId) : -1;
            /**
             * 🕰️ **KEEP 한 콜이 아직 덱에 없으면 «열 것»으로 남겨 둔다.**
             *
             * 🔴 KEEP 사건은 서버가 `order-confirmed` 를 쏘는 **그 순간** 오는데, 그 콜이
             *    덱(`cycleDeck`)에 들어오는 것은 `sync-active-orders` 가 온 **뒤**다 —
             *    이 자리에서는 `findIndex` 가 -1 이라 못 연다 (도착은 이미 덱에 있는 콜이라 된다).
             * 🟢 못 열었으면 ref 를 **비우지 않는다** — 덱이 갱신되는 아래 효과가 다시 연다.
             */
            if (eventId && want < 0) pendingOpenRef.current = eventId;
            else if (ev.type === 'keep' || ev.type === 'keepReady') pendingOpenRef.current = null;
            const mv = sheetTransition(r.snap, {
                openIdx, callCount: deckList.length,
                focusIdx: want >= 0 ? want : undefined,
            });
            setSnap(mv.snap);
            setOpenIdx(mv.openIdx);
            /**
             * 🪜 **«어느 콜을 열었나»를 함께 남긴다** — 시트 «높이»만 찍으면 안 열린 경우를 로그로 되짚을 수 없다.
             *    도착 통보가 그 콜이 덱에서 빠진 **뒤**에 오면 열 대상이 없다 — 그것도 로그에 남긴다.
             */
            if (mv.openIdx !== openIdx) {
                const who = mv.openIdx >= 0 ? (deckList[mv.openIdx]?.dropoff ?? '?') : '없음';
                const miss = eventId && want < 0 ? ` 🔴 가리킨 콜이 덱에 없다(${eventId.slice(-6)})` : '';
                logStateChange("시트연콜", `${mv.openIdx} ${who}${miss}`, "무대");
            }
        }
        /**
         * 🔁 미룬 결정은 **유예가 끝나면 다시 묻는다** — 안 그러면 유예 중에 온 전환이
         *    영영 사라져 시트가 전체에 눌러앉는다.
         */
        if (r.deferred) {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            holdTimer.current = setTimeout(() => setRuleTick(x => x + 1), (r.mem.userHoldUntil - now) + 200);
        }
        return r;
    };
    /**
     * 🔴 **소켓 처리처럼 한 번만 등록되는 곳은 이 ref 로 부른다** (#143) — `feed` 를 직접 붙잡으면
     *    화면이 처음 떴을 때의 빈 덱·닫힌 `openIdx` 를 계속 봐, KEEP 해도 그 콜이 안 열렸다.
     */
    const feedRef = useRef(feed);
    useLayoutEffect(() => { feedRef.current = feed; });   // 그리는 도중에 ref 를 안 건드린다 (react-hooks refs)
    /**
     * ⏳ **«하차 영역이 쓸 경로선이 있나»를 필터 판이 읽게 올린다** — 경로선은 무대만 안다 (store `netUsedLine`).
     *    확정 콜이 없으면 `null`(모른다 — 문구를 안 띄운다 · 규칙 ④). ⚠️ 무대가 사라지면 `null` 로 비운다.
     */
    const setNetUsedLine = useFilterStore(st => st.setNetUsedLine);
    const lineReady = confirmedCalls.length > 0 ? !!dropoffLine && dropoffLine.length >= 2 : null;
    useEffect(() => {
        setNetUsedLine(lineReady);
        return () => { setNetUsedLine(null); };
    }, [lineReady, setNetUsedLine]);

    useEffect(() => { logStateChange("주행신호", drive, "무대"); }, [drive]);
    useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

    /* 🪧 새 판정이 뜨면 손 유예보다 먼저 — 규칙에 judge 로 넣는다 (#144) */
    const judgingId = judging ? judging.id : null;
    useEffect(() => { if (judgingId) feed({ type: 'judge' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [judgingId]);

    useEffect(() => { feed({ type: 'signal' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, judging ? judging.id : null, liveRoute.length, ruleTick]);

    /**
     * 📞 S5 — KEEP 직후: 시트 전체 + 그 콜 포커스 (킵 직후 바로 통화 원칙).
     * 포커스 전달은 기존 근접 포커스와 같은 그릇(gpsFocusStore) — 덱이 이미 읽는다.
     */
    useEffect(() => {
        const onConfirmed = (orderId: string) => {
            useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'focus' } });
            keepFocusRef.current = orderId;      // 시트가 열 콜 — feed 가 읽는다
            feedRef.current({ type: 'keep' });   // 🔴 한 번만 등록된 처리라 최신 feed 를 ref 로 부른다 (#143)
        };
        socket.on('order-confirmed', onConfirmed);
        return () => { socket.off('order-confirmed', onConfirmed); };
    }, []);

    /**
     * 🏁 S7 — 정거장 도착: 시트 전체로 마중 (화면규칙 S13).
     *
     * 🔴 **소켓을 여기서 직접 듣지 않는다** — 듣는 곳은 `gpsFocusStore` 하나이고, 이 화면은
     *    그 스토어가 남긴 «방금 도착»(`arrival`)을 **본다.** 듣는 곳이 둘이면
     *    «덱이 가리킨 콜»과 «시트가 연 콜»이 갈라진다.
     * ⚠️ 포커스 한 칸에 근접·도착을 섞어도 안 된다 — **도착이 덮여 사라진다.**
     *    🟢 **칸을 가르되(`arrival`) 듣는 곳은 하나.**
     */
    const arrival = useGpsFocusStore(st => st.arrival);
    useEffect(() => {
        if (!arrival) return;
        /* 🪜 «그 콜의 그 단계»를 함께 싣는다 — 시트가 무엇을 열지 알아야 한다 */
        const r = feed({ type: 'arrive', orderId: arrival.orderId, stopType: arrival.stopType });
        if (!r.snap) return;                       // 손 유예 중이면 마중도 미룬다
        /**
         * 🪜 마중은 «그 콜의 지금 단계»를 보여 주는 것까지다 (기사님 수순 ⑥).
         *    단계 블록은 카드 안에서 늘 열려 있으므로 맨 위로 올리면 덱·단계가 함께 보인다.
         */
        requestAnimationFrame(() => {
            const sc = document.querySelector('[data-sheet-scroll]') as HTMLElement | null;
            if (sc) sc.scrollTop = 0;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [arrival?.tick]);

    /**
     * 🕰️ **덱이 갖춰지면 «못 연 콜»을 연다.**
     *
     * KEEP 사건은 콜이 덱에 들어오기 **전에** 오므로 그 자리에서는 열 수가 없다 —
     * 여기서 한 박자 뒤에 마저 연다.
     * 🔴 **여기서 높이를 직접 정하지 않는다** — 규칙(`keepReady`)을 지난다. 따로 정하면
     *    높이를 정하는 손이 둘이 된다 (S6 — 높이를 바꾸는 길은 하나다).
     */
    useEffect(() => {
        const want = pendingOpenRef.current;
        if (!want) return;
        if (deckList.findIndex(o => o.id === want) < 0) return;
        /* 🕰️ 규칙을 지나 연다 — 정차면 올라와 열리고 · 주행이면 올라왔다 내려가고 · 손 유예 중이면 미룬다 (#144) */
        keepFocusRef.current = want;
        feedRef.current({ type: 'keepReady' });
        /* 🔴 길이가 아니라 **콜 id** 가 바뀔 때 — 심사 콜이 KEEP 으로 넘어와도 길이는 그대로다 (#143) */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckList.map(o => o.id).join(',')]);

    /**
     * 🚪 **완료 행동이 문을 닫는다** (화면규칙 S14) — 통화 완료·시트 저장 → focus 해제 +
     *    **시트 자동 복귀** (뒤로가기를 찾을 일 없음).
     *
     * 🔴 **완료는 손이 아니다** — 닫는 길이 «손»뿐이면 그 손이 S11 유예(30초)를 걸어
     *    **다음 도착 마중까지 먹는다.** 손은 «내 뜻»이지만 완료는 일을 마친 것이라 유예를 걸지 않는다.
     *
     * 🔴 **보내는 곳이 아니라 «받는 곳»에서 잡는다** (규칙 ③) — `report-milestone` 은
     *    스텝 시트 여러 자리에서 나가지만, 서버가 확인해 주는 `milestone-result` 는
     *    한 곳이다. 도착(`auto-arrived`)과 **같은 문법**이다.
     */
    useEffect(() => {
        /**
         * 🔴 **실패한 보고로는 문을 닫지 않는다** — 서버가 `success: false` 를 돌려주면
         *    그 일은 안 끝난 것이다. 닫아 버리면 기사님이 «했다»고 믿고 지나간다 (규칙 ④).
         *    ⚠️ 실패 «표시»는 `useServerErrors` 가 맡는다 — 여기는 «문을 닫을까»만 본다.
         */
        const onDone = (r?: { success?: boolean }) => {
            if (r?.success === false) return;
            feed({ type: 'done' });
        };
        socket.on('milestone-result', onDone);
        return () => { socket.off('milestone-result', onDone); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * 🚀 **국면이 «운행 중»으로 바뀌면 시트를 내린다** (기사님 수순 ④).
     *    버튼을 눌렀을 때는 위에서 이미 내렸고, 이 줄은 **라이브에서 이동이 감지되어
     *    서버가 국면을 바꿨을 때**를 받는다 — 손을 안 대도 같은 수순이 된다.
     */
    const phase = filter?.dispatchPhase;
    useEffect(() => {
        if (phase !== 'DELIVERING') return;
        feed({ type: 'depart' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    /**
     * 🚀 **주행이 감지되면 출발이다** — 🔴 «🚀 지금 출발» 버튼에만 맡기지 않는다: 운전 중에는 누를 수 없다.
     *    출발이 안 켜지면 필터 영역이 «출발 전»에 머물러 내 영역이 운행 내내 남는다 (필터.md §5 «필터 영역»).
     *    콜을 쥐고(`GATHERING`) 경로가 있을 때만 — 빈 차로 달리는 것은 출발이 아니다.
     */
    const hasRoute = liveRoute.length > 0;
    useEffect(() => {
        if (drive !== 'drive') return;
        if (phase !== 'GATHERING' || !hasRoute) return;
        logRoadmapEvent("웹", "무대 주행 감지 → 🚀 출발 (운행 중 국면)");
        updateFilter({ driverAction: 'DRIVING' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, phase, hasRoute]);

    /* 🗺️ 다음 정거장 이름표 재료 — 서버 경로 순서(routeStops)에서 첫 미방문 */
    const next = (() => {
        const idx = routeStops.findIndex(st => {
            const o = liveRoute.find(r => r.id === st.orderId);
            return !!o && !hasVisitedStop(o, st.stopType);
        });
        if (idx < 0) return null;
        const st = routeStops[idx];
        const o = liveRoute.find(r => r.id === st.orderId)!;
        /**
         * 🔴 **콜 번호는 색과 같은 것을 센다** — 콜 색은 `cycleDeck`(이번 사이클,
         *    하차 완료해도 끝까지 남는 목록) 기준이다. `liveRoute`(지금 실린 콜)로 세면
         *    **하차를 하나 끝내는 순간 «N번 콜»만 앞당겨져** 색과 번호가 다른 답을 한다.
         *    색만 보고 1~2초에 누르는 화면에서 그 둘이 어긋나면 안 된다 (규칙 ⑤-3).
         */
        const callNo = cycleDeck.findIndex(r => r.id === st.orderId) + 1;
        return {
            orderId: st.orderId,
            x: st.stopType === 'pickup' ? o.pickupX : o.dropoffX,
            y: st.stopType === 'pickup' ? o.pickupY : o.dropoffY,
            name: getAddressLabel(st.stopType === 'pickup' ? o.pickup : o.dropoff),
            stopLabel: st.stopType === 'pickup' ? '상차' : '하차',
            callNo, driveMinutes: st.driveMinutes,
            visitNo: (() => { const vo = visitOrderMap.get(st.orderId) as { pickupIdx?: number; dropoffIdx?: number } | number | undefined;
                if (typeof vo === 'number') return vo;
                return (st.stopType === 'pickup' ? vo?.pickupIdx : vo?.dropoffIdx) ?? idx + 1; })(),
        };
    })();

    /**
     * 🎬 **시트 상태바** — 읽는 줄. 누르는 부분이 «시트 상태바의 버튼».
     *
     * 🔴 **문구를 여기서 만들지 않는다** (규칙 ③) — `lib/sheetStatus` 가 **요소별로** 돌려준다
     *    (기호 · 번호 · 지명 · ~분 · 꼬리). 화면이 제 문장을 따로 지으면 규칙 파일은
     *    목업과 검사만 쓰게 된다 (#96·#97 과 같은 병).
     * 🔴 거리(km)가 아니라 **주행 분**이다 — 기사님이 읽는 값은 «얼마나 걸리나»다.
     *    직선 km 는 도로를 안 따른다.
     */
    /**
     * ✅ **지금 곁에 서 있는 «다녀온 정거장»** — «도착» 경우의 방아쇠.
     *    🔴 **타이머가 아니라 위치다.** 떠나면 저절로 다음 경우로 넘어가므로 «끄는 것을
     *       잊는» 일이 없다 (관제웹 CLAUDE.md — 깃발을 끄는 걸 잊어 화면이 거짓말한 그 모양).
     *    ⚠️ 좌표를 모르는 발자취(이력만 남은 행)는 건너뛴다 — 거리를 못 잰다.
     */
    const arrivedHere = (() => {
        if (!myLocation) return null;
        for (const v of derived.visitedTrail) {
            if (v.x == null || v.y == null) continue;
            if (getDistanceKm(myLocation.y, myLocation.x, v.y, v.x) * 1000 > ARRIVED_HERE_M) continue;
            return { visitNo: v.no, name: v.name, stop: v.type as '상차' | '하차',
                     callNo: derived.callNoOf(v.orderId), orderId: v.orderId };
        }
        return null;
    })();
    /** 🎬 시트가 맨 위에서 열 «콜 · 단계» — 상태바와 같은 재료(도착 곁 · 다음 정거장)에서 한 곳이 정한다 (#143) */
    const barFocus = barFocusOf({ arrivedHere, next });
    useLayoutEffect(() => { barFocusRef.current = barFocus; });   // 그리는 도중에 ref 를 안 건드린다 (react-hooks refs)

    /**
     * 🔍 **다음 정거장까지 직선 m** — «찾기» 경우가 쓴다.
     *    🔴 **근접은 직선이 맞다** — 눈으로 찾는 거리이고 서버 도착 감지도 직선이다.
     *       먼 거리는 아래 `remainKm`(길을 따라)이 답한다 — 둘은 다른 질문이다 (규칙 ⑤-4 ⑤).
     */
    const nearMeters = myLocation && next?.x != null && next?.y != null
        ? getDistanceKm(myLocation.y, myLocation.x, next.y, next.x) * 1000 : null;

    /**
     * 🛣️ **길을 따라 남은 km** — «정차» 경우가 쓴다. 카카오 폴리라인이 곧 도로이고 재는 함수도
     *    `shared` 에 있다 — 서버에 더 달라고 하지 않는다 (`lib/remainOnRoute` 머리 참조).
     */
    const remainKm = remainOnRouteKm(derived.drawHolder?.routePolyline, myLocation,
        next?.x != null && next?.y != null ? { x: next.x, y: next.y } : null);

    /** 🕐 다음 정거장 도착 예정 시각 — 타임라인이 이미 낸 값을 읽는다 (규칙 ③) */
    const nextEta = next
        ? (next.stopLabel === '상차'
            ? derived.etaMap.get(next.orderId)?.pickupEta
            : derived.etaMap.get(next.orderId)?.dropoffEta) ?? null
        : null;

    const pastCount = deckList.filter(isDeliveredCall).length;
    /**
     * 🙈 **숨길 콜은 한 벌이다** — 시트와 **지도가 같은 집합**을 본다 (규칙 ③).
     *
     * 🔴 식을 시트 JSX 안과 지도에 따로 두지 않는다 — 한쪽에 조건이 붙는 순간
     *    **«목록에선 접혔는데 지도엔 남는»** 상태가 된다 («파생 두 벌»).
     */
    const hiddenIds = hiddenPastIds(deckList, hidePast, deckList[openIdx]?.id ?? null);
    /**
     * 🗺️ **지도의 발자취도 같이 접는다** — 정거장 동그라미와 그 안의 순번이 함께 사라진다.
     *
     * 🟢 **번호는 안 밀린다** — 순번은 위(`stopNoOf`)에서 이미 박아 넣은 값이라, 목록에서
     *    빼도 남은 것들의 번호가 그대로다 (규칙 ③ — 세는 곳이 하나다).
     * ⚠️ **지도 맞춤(zoom)도 남은 것만 본다** — 숨긴 자리까지 품지 않으므로 남은 경로가
     *    크게 보인다. 접는 목적에 맞다.
     * ⚠️ 하차를 마치지 **않은** 콜의 «다녀온 상차지»는 그대로 남는다 — 그 콜은 진행 중이다.
     */
    /** 🗺️ 숨김이 켜졌으면 «보이는 콜 중 가장 먼저 잡은 시각» — 그보다 앞선 자취는 숨긴 콜들의 길이다 */
    const shownSinceMs = hiddenIds.size === 0 ? null
        : Math.min(...deckList.filter(o => !hiddenIds.has(o.id)).map(o => Date.parse(o.capturedAt ?? '')).filter(Number.isFinite));
    const shownTrail = hiddenIds.size === 0
        ? derived.visitedTrail
        : derived.visitedTrail.filter(v => !hiddenIds.has(v.orderId));

    /* 🚩 출발 조각 — 계산은 `useDepartureDue` 한 곳 · 진행 중인 콜만 본다 (끝난 약속을 기준으로 잡지 않게) */
    const departure = useDepartureDue({ orders: liveRoute, records: derived.stepRecords, routeStops, routeComputedAt });
    const bar = sheetStatus({
        due: departure?.due ?? null,
        /* 🗓️ «대기»는 오늘 한 일도 없을 때 — 오늘 하차분이 있으면 «오늘 N콜 마침 · 새 콜 대기» (사이클 = 하루) */
        idle: cycleDeck.length === 0,
        doneToday: cycleDeck.filter(isDeliveredCall).length,
        judging: !!judging,
        moving: drive === 'drive',
        next: next ? {
            visitNo: next.visitNo, name: next.name,
            callNo: next.callNo, stop: next.stopLabel as '상차' | '하차',
        } : null,
        arrivedHere,
        nearMeters,
        remainKm: remainKm != null ? Math.round(remainKm * 10) / 10 : null,
        etaHhmm: nextEta,
        driveMinutes: next?.driveMinutes ?? null,
    });

    /**
     * 🧭 **달리는 중에는 덱도 «향해가는 콜»을 본다.**
     *
     * 정차 중엔 방금 도착한 콜이 맞고, **달리기 시작하면 향해가는 콜**이 맞다 — 도착 마중이
     * 잡아 둔 포커스가 남으면 상태바는 다음 정거장인데 **덱만 방금 끝낸 콜**을 든다.
     * 서버의 근접 예고(3km)만 기다리면 **다음 정거장이 3km 밖인 구간 내내** 끝난 콜을 보게 된다.
     *
     * 🔴 시트는 건드리지 않는다 — `kind: 'approach'` 는 덱만 옮긴다 (주행 중 지도가 주인공).
     */
    useEffect(() => {
        if (drive !== 'drive' || !next) return;
        if (Date.now() < mem.current.userHoldUntil) return;   // 손이 이긴다
        useGpsFocusStore.setState({ gpsFocus: { orderId: next.orderId, tick: Date.now(), kind: 'approach' } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, next?.orderId]);

    /** 🖐️ 마커 탭 → 그 콜 카드 (S6 문법 — 지나온 곳도 확인·수정) */
    const focusCall = (orderId: string) => {
        useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'focus' } });
        feed({ type: 'tap' });
    };

    return (
                // 📏 🔴 높이는 실측하지 않는다 — 부모(flex 사슬)가 준다. 실측(rect.top)은 페이지 스크롤과
        //    되먹임을 만들어 로딩 후 상단이 밀려 숨는다
        <section id="stage-view" className="relative flex-1 min-h-0">
            {/* 지도 배경 — 캔버스 재사용 (배경 어댑터 자리: 훗날 카카오 타일 실험) */}
            <div className="absolute inset-0">
                <PinnedRouteCanvas
                    fill
                    /* 🪟 시트가 올라온 만큼 지도가 위로 비켜 준다 — 반쯤 열면 둘을 같이 본다 */
                    /* 🗺️ 지도는 «시트»를 모른다 — **아래가 얼마나 가려졌나**만 받는다 (부품끼리 얽히지 않게) */
                    occludedPx={sheetPx}
                    /**
                     * 🔝 **QR · 경로 방침도 지도 버튼과 한 묶음이다** (기사님 지시 — *"같은 뎁스에 넣어줘"*).
                     *
                     * 예전엔 이 둘을 지도 **위에 따로 얹고** `top-[104px]` 처럼 좌표로 맞췄다.
                     * 확대 버튼 수·글꼴이 조금만 달라도 어긋나 **QR 이 「초기화」를 덮었다**.
                     * 이제 자리는 지도의 오른쪽 묶음 하나가 정한다 — 겹칠 자리가 없다 (규칙 ③).
                     */
                    /**
                     * 🔝 **«QR코드» 는 지도 위 한가운데** (기사님 지시) — 왼쪽 줄과 오른쪽 줄 사이 빈 자리다.
                     */
                    centerButtons={qrStop && (
                        <button type="button" onClick={() => setQrOpen(true)}
                            className="px-2.5 h-8 flex items-center justify-center rounded-md
                                       text-[11px] font-black text-white whitespace-nowrap active:scale-95"
                            style={{ background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)',
                                     boxShadow: '0 4px 12px rgba(79,141,249,.35)' }}>
                            QR코드
                        </button>
                    )}
                    rightButtons={(
                        <>
                            {/**
                              * 🧭 **경로 방침 — 한 버튼 뒤에 접어 둔다** (기사님 지시 · 레이어 버튼과 같은 방식).
                              *
                              * 셋을 늘 펼쳐 두면 400px 가로줄에서 자리를 셋이나 먹는다. 지금 고른 하나만 보이고,
                              * 누르면 **줄 아래로** 셋이 내려온다 — 줄 안에서 늘어나면 옆 버튼을 밀어낸다.
                              */}
                            {liveRoute.length > 0 && (() => {
                                /* 🔴 **화면에 올라 있는 콜을 센다 — 심사 중인 것도 함께**.
                                   합짐은 «첫짐 경로 위에서 산출된» 콜이라, 심사 중에 경로를 바꾸면
                                   «가는 길에 있다»는 산출 근거 자체가 사라진다. */
                                const locked = isPriorityLocked(liveRoute.length);
                                const holder = derived.routeHolder ?? liveRoute[liveRoute.length - 1];
                                /**
                                 * 🔴 **지금 방침은 «다시 물은 결과 문구»에서 읽는다** — 콜에 방침 칸이 없다.
                                 *    `kakaoTimeExt` 에 `[최단시간]`·`[최단거리]` 가 붙는다 (`PinnedRoute` 와 같은 법).
                                 * ⚠️ 둘 다 없으면 기본값 «내비추천»이다.
                                 */
                                const ext = holder?.kakaoTimeExt || '';
                                const now = ext.includes('[최단시간]') ? 'TIME'
                                          : ext.includes('[최단거리]') ? 'DISTANCE' : 'RECOMMEND';
                                const shown = ROUTE_PRIORITIES.filter(b => !locked || b.key === now);
                                /**
                                 * 🔤 **카카오내비 화면의 이름 그대로** (`naviLabel` · 기사님 2026-09-05).
                                 *    관제폰이 「시간」이라 하고 개인폰 내비가 「큰길 우선」이라 하면 같은 것을
                                 *    다르게 부르는 것이라 그 자리에서 헷갈린다. 접어 두니 긴 이름도 자리를 안 먹는다.
                                 */
                                const nowLabel = ROUTE_PRIORITIES.find(b => b.key === now)?.naviLabel ?? '내비추천';
                                /* 🔴 «잠겼다»는 **버튼 하나만 남은 것으로 이미 보인다** — 글자를 덧붙이지 않는다 */
                                const pick = `px-2.5 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg
                                              backdrop-blur-sm text-[11px] font-black whitespace-nowrap transition-all border`;
                                return (
                                    <div className="relative">
                                        {/* 🧭 지금 고른 것 하나 — 누르면 아래로 펼친다 */}
                                        <button type="button" onClick={() => setPriorityOpen(o => !o)}
                                            title="어느 길로 갈까"
                                            className={`${pick} ${priorityOpen ? 'border-info text-info' : 'border-border text-text-primary opacity-80 hover:opacity-100'}`}>
                                            {nowLabel}
                                        </button>
                                        {priorityOpen && (
                                            /* 🔴 **줄 아래로 띄운다** — 줄 안에서 늘어나면 옆 버튼을 밀어낸다 */
                                            <div className="absolute top-full right-0 mt-2 flex flex-col gap-2 z-10">
                                                {shown.map(b => (
                                                    <button key={b.key} type="button"
                                                        onClick={() => {
                                                            setPriorityOpen(false);
                                                            if (holder) props.onRecalculate?.(holder.id, b.key);
                                                        }}
                                                        disabled={locked}
                                                        className={`${pick} ${now === b.key
                                                            ? 'border-info text-info'
                                                            : 'border-border text-text-primary opacity-80 hover:opacity-100'}`}>
                                                        {/* 🔤 카카오내비 화면의 이름 그대로 (위 `nowLabel` 주석) */}
                                                        {b.naviLabel}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                    unifiedRoutePoints={unifiedRoutePoints}
                    liveRoute={liveRoute}
                    myLocation={myLocation}
                    visitedTrail={shownTrail}
                    /* 🗺️ 숨긴 콜의 자취도 가린다 — 보이는 콜 중 가장 먼저 잡은 시각보다 앞선 점 (`trailOfShown`) */
                    drivenTrail={trailOfShown(derived.drivenTrail, shownSinceMs)}
                    routeHolder={derived.drawHolder}
                    callColors={derived.callColors}
                    /* 📋 상차 영역 — 원 중심은 실시간 내 위치 (위 «상차 영역» 주석) */
                    pickupArea={pickupArea}
                    /* 🔵 하차 영역 — 살아 있는 목적지마다 원 · 마름모 · 띠 (필터.md «하차 영역») */
                    dropoffArea={dropoffArea}
                    /* 📍 동 점 — 원달앱이 받은 목록 그대로 */
                    dongDots={dongDots}
                    onStopTap={focusCall}
                >
                    {/**
                      * 🔴 **지도 위에 다음 정거장 이름표를 두지 않는다** — 지도 좌상단
                      *    `전체·현구간·현위치` 버튼과 **같은 자리**라 셋을 덮는다 (코드만 읽으면 안 보인다).
                      *    같은 사실을 시트 상태바가 이미 말한다 (`lib/sheetStatus` · 규칙 ③).
                      */}

                    {/* 🚀 지금 출발 — 옛 지도와 같은 자리·같은 동작 (짐 있고 출발 전일 때만) */}
                    {filter && filter.dispatchPhase !== 'DELIVERING' && liveRoute.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                logRoadmapEvent("웹", "무대 지도 🚀 지금 출발 클릭 → 운행 중 국면");
                                updateFilter({ driverAction: 'DRIVING' });
                                /**
                                 * 🚀 **출발을 누르면 시트가 내려간다** (기사님 수순).
                                 *    누르는 순간이 «이제 달린다»는 의사 표현이다 — 주행 감지(10초)를
                                 *    기다리면 그 사이 시트가 지도를 가린다. 손이 이긴다(유예 30초)는
                                 *    규칙 위에서, 이 손짓만은 내리는 쪽으로 쓴다.
                                 */
                                feed({ type: 'depart' });
                            }}
                            className="absolute left-3 bottom-20 z-10 rounded-xl px-4 py-2.5 text-[14px] font-black text-white active:scale-95 transition-transform"
                            style={{ background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 6px 18px rgba(79,141,249,.4)' }}>
                            🚀 지금 출발
                        </button>
                    )}
                    {/**
                      * ⏳ **«고른 것»과 «실제»를 가른다** — 노선을 골라도 경로가 아직 없으면
                      *    마름모로 보고, 화면이 **그렇게 말한다**. 직선으로 지어내지 않는다 (규칙 ④).
                      *
                      * ⚠️ 노선/동선을 **고르는 버튼은 필터에 있다** — 여기는
                      *    «지금 지도가 무엇을 그리고 있나»라 지도 자리가 맞다.
                      */}
                    <div className="absolute top-[92px] left-3 z-10 flex flex-col items-start gap-1">
                        {/* 🔴 **노선인데 경로가 아직이면 말한다** — 안 그러면 «노선인데 마름모»가 조용한 거짓말이 된다 */}
                        {routeMode && lineReady === false && (
                            <span className="px-2 py-1 rounded-md bg-warning/15 text-warning text-[10px] font-bold shadow-lg backdrop-blur-sm">
                                ⏳ 경로를 기다립니다 — 올 때까지 마름모로 봅니다
                            </span>
                        )}
                    </div>

                    {/**
                      * 🗺️ **아래 두 귀퉁이**:
                      *   **좌하단** 경로 방침 — 내비추천 · 큰길 우선 · 최단거리
                      *   **우하단** 「QR 코드」 — **치수가 왼쪽과 같다.** 두 귀퉁이가 한 짝으로 읽힌다
                      * 🔴 **시트가 잰 높이 위에 뜬다** (`sheetPx`) — 시트가 «내용만큼» 서면
                      *    snap 이 정한 높이와 실제가 갈라져 버튼이 엉뚱한 자리에 뜬다 (규칙 ③).
                      */}
                </PinnedRouteCanvas>
            </div>

            {/**
              * 🔳 **QR 덮개 — 세 줄이면 끝난다** (다음 정거장 · QR · «카메라로 찍어 내비를 켜세요»).
              * 🔴 **눌러서 크게** 띄운다 — 작게 늘 띄우면 못 찍힌다.
              */}
            {qrOpen && qrStop && (
                <div onClick={() => setQrOpen(false)}
                     className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm p-6">
                    <div className="text-center">
                        <p className="text-[13px] font-black text-info">다음 정거장</p>
                        <p className="text-[24px] font-black text-white leading-tight">{qrStop.name}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                        <NaviQr stop={qrStop} via={qrVia} here={myLocation} kind="navi"
                                size={210} naviKey={NAVI_KEY} naviOrigin={NAVI_ORIGIN} />
                    </div>
                    <p className="text-[14px] font-bold text-white/90">카메라로 찍어 내비를 켜세요</p>
                    <p className="text-[12px] text-white/50">아무 데나 누르면 닫힙니다</p>
                </div>
            )}

            {/* 3단 시트 — 내용물은 기존 콜 화면 그대로 (sheetOnly) */}
            <StageSheet snap={snap} onSnapChange={(s) => feed({ type: 'drag', to: s })}
                        /* 🪧 판정 중에는 손잡이·상태바·콜 목록을 잠근다 — 판정 영역만 누른다 (#144) */
                        locked={!!judging}
                        onHeightChange={setSheetPx}
                        /**
                         * 🎬 **요소별로 그린다** — 목업과 같은 모양.
                         *    `▶ ①여수동 ~31분        2번 콜 · 상차 ›`
                         * 🔴 번호 동그라미는 **지도·목록과 같은 색표**다 — 색이 «몇 번 콜»을 말한다.
                         * 🔴 누르면 **「다」로 올라가며 그 콜이 열린다** — 이 줄을 누른 것은
                         *    «열어서 보겠다»는 뜻이라, 주행 중(엿보기)에도 올라간다.
                         *    자동으로 안 올리는 것과 다르다 — **손이 시킨 것**이다.
                         */
                        peekBar={
                          /* 🔴 **버튼 안에 버튼을 넣지 않는다** — 줄 전체가 «시트를 여는 버튼»
                             이었는데 오른쪽에 숨기기 버튼이 붙으므로 형제로 나눈다 */
                          <div className="w-full flex items-center gap-1">
                            <button type="button"
                                onClick={() => {
                                    /* 🎬 상태바가 가리키는 콜을 연다 — 도착 곁이면 그 콜 (#143) */
                                    if (!barFocus) return;
                                    const i = deckList.findIndex(o => o.id === barFocus.orderId);
                                    const mv = sheetTransition('full',
                                        { openIdx: i, callCount: deckList.length, preferIdx: i });
                                    setSnap(mv.snap);
                                    setOpenIdx(mv.openIdx);
                                }}
                                className="w-full flex items-center gap-1.5 text-left min-h-[30px] active:opacity-70 transition-opacity">
                                <span className="shrink-0">{bar.mark}</span>
                                {bar.notice ? (
                                    <span className="text-text-muted font-semibold">· {bar.notice}</span>
                                ) : null}
                                {!bar.notice && (
                                    <>
                                        <span className="shrink-0 w-[19px] h-[19px] rounded-full grid place-items-center text-[12px] font-black leading-none"
                                            /* 🎨 **색도 번호도 `bar` 에서 온다** — «도착» 경우엔 번호가
                                                 다녀온 정거장인데 색이 다음 콜이면 «색 = 번호»가 깨진다 (규칙 ⑤-3) */
                                            style={bar.callNo != null && bar.stopKind ? {
                                                background: callNodeFill(bar.callNo, bar.stopKind, theme),
                                                color: callNodeText(bar.stopKind, theme),
                                            } : { background: 'var(--color-info)', color: '#fff' }}>
                                            {bar.no}
                                        </span>
                                        <span className="shrink-0">{bar.name}</span>
                                        {bar.lead && <span className="shrink-0 text-text-muted font-semibold">{bar.lead}</span>}
                                        <span className="ml-auto shrink-0 text-text-muted font-semibold truncate">{bar.tail}</span>
                                    </>
                                )}
                                {bar.due && departure && (
                                    /* 🚩 늦으면 붉게 · 15분 안이면 노랗게 — 근거 전문은 손대면 나온다 (title) */
                                    <span title={departure.title}
                                        className={`${bar.notice ? 'ml-auto ' : ''}shrink-0 tabular-nums font-black ${
                                            departure.late ? 'text-danger' : departure.tight ? 'text-warning' : 'text-info'}`}>
                                        {bar.due}
                                    </span>
                                )}
                                {!bar.notice && <span className="shrink-0 text-text-muted">›</span>}
                            </button>
                            {/**
                              * 🙈 **지나간 콜 숨기기.**
                              *    🔴 **끝난 콜이 있을 때만 뜬다** — 없을 때 떠 있으면 한 줄(56칸)을
                              *       괜히 먹는다.
                              *    ⚠️ ▾ 는 «보이는 중», ▸ 는 «접힌 중» — 아코디언과 같은 문법이다.
                              */}
                            {pastCount > 0 && (
                                <button type="button" onClick={toggleHidePast}
                                    title={hidePast ? '지나간 콜 보기' : '지나간 콜 숨기기'}
                                    className="shrink-0 ml-auto px-1.5 py-0.5 rounded-md text-[11px] font-bold text-text-muted active:opacity-70">
                                    {hidePast ? '▸' : '▾'} 지난 {pastCount}
                                </button>
                            )}
                          </div>
                        }
                        /**
                         * 🪧 **판정석은 시트 맨 아래다.**
                         *
                         * 🔴 위쪽(필터 줄)은 늘 보이지만 **엄지에서 멀다.**
                         *    여기는 **콜 목록 바로 밑**이라 KEEP 을 누르면 그 콜이 바로 위
                         *    목록으로 올라간다 — 위에서 아래로 읽는 순서와 손이 맞는다.
                         * 🔴 **맨 아래 붙박이**라 목록이 아무리 길어도 안 밀린다.
                         * ⚠️ 주행 중 시트가 내려가 있어도 **상태바가 한 줄 심사석**이 된다 —
                         *    그러라고 시트가 3단이다 (놓치지 않는다).
                         */
                        bottomBox={derived.judging ? (
                            <JudgmentSeat
                                route={derived.judging}
                                confirmedActive={cycleDeck.filter(o => o.id !== derived.judging!.id).length}
                                onDecision={props.onDecision}
                                processingId={seatProcessingId}
                                setProcessingId={setSeatProcessingId}
                            />
                        ) : undefined}>
                <PinnedRouteBody {...props} sheetOnly d={derived}
                    /* 🙈 지나간 콜 — 배열에서 빼지 않고 가린다 (`lib/pastCalls` 머리 참조).
                       열어 둔 콜은 끝났어도 안 가린다 — 손이 고른 것이 규칙보다 세다 */
                    hiddenIds={hiddenIds}
                    /* 📏 «내용만큼» 서는 판인가 — 아코디언의 높이 문법이 갈린다 */
                    fit={snap === 'list'}
                    openIdx={openIdx}
                    /* 🎬 맨 위일 때만 상태바의 «콜 · 단계»를 카드에 넘긴다 (#143) */
                    focus={snap === 'full' ? barFocus : null}
                    onOpenIdx={(i) => {
                        /**
                         * 🪟 **여는 것이 곧 「다」, 닫는 것이 곧 「나」다** (기사님 정의).
                         *
                         * | 다 | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
                         * | 나 | 상태바 + 타이틀 전부 (+ 판정) |
                         *
                         * 🔴 여기서 높이를 정하는 것은 **곁다리가 아니다** — «열었다»가 곧
                         *    «다 보겠다»는 뜻이라 **높이가 그 행동의 결과다.**
                         * 🔴 같은 줄을 다시 누르면 **닫힌다** — 닫을 길이 없으면 손으로
                         *    「나」로 돌아갈 수가 없다.
                         * ⚠️ 엿보기(가)에 계셨다면 안 올린다 — 주행 중이라 지도를 덮으면 안 된다.
                         * 🔴 높이 규칙은 `sheetTransition` 한 곳이 안다 (규칙 ③).
                         */
                        const next = i === openIdx ? -1 : i;
                        /* 손으로 한 일이므로 규칙에 «탭»으로 먹여 유예까지 함께 얻는다 (S11) */
                        const r = feed({ type: 'tap' });
                        setOpenIdx(next);
                        if (!r.snap) return;                      // 유예 중이면 높이는 그대로
                        if (snap !== 'peek') {
                            const mv = sheetTransition(next >= 0 ? 'full' : 'list',
                                { openIdx: next, callCount: deckList.length, preferIdx: next });
                            setSnap(mv.snap);
                            setOpenIdx(mv.openIdx);
                        }
                    }} />
            </StageSheet>
        </section>
    );
}

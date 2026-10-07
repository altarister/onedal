import { anchorBaseOf, panAfterZoom, pinchStep } from '../lib/mapProjection';

/**
 * 🖐️ **지도 손짓 — 끌기 · 두 손가락 확대 · 휠 · ＋ − 버튼 · 마커 탭** (지도 부품 `PinnedRouteCanvas` 가 쓴다).
 * 이 파일은 위(`PinnedRouteCanvas`)를 가져오지 않는다 — 방향: PinnedRouteCanvas → usePinnedRouteGestures → lib/mapProjection.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 배율 · 팬 · 손짓 기억은 부품이 쥔 ref 로 받아 바꾸고, 다시 그리기(`drawMap`)와 탭(`onStopTap`)은 받은 함수를 부른다.
 */
type Ref<T> = { current: T };
export interface GestureDeps {
    canvasRef: Ref<{ getBoundingClientRect(): { left: number; top: number; width: number; height: number } } | null>;
    zoomRef: Ref<number>;
    panRef: Ref<{ x: number; y: number }>;
    /** 🪟 그리는 쪽이 지금 쓰는 가림 높이 — 확대 기준점이 이것을 본다 (두 벌이면 확대점이 어긋난다) */
    occludedNow: Ref<number | null>;
    isDragging: Ref<boolean>;
    lastPos: Ref<{ x: number; y: number }>;
    lastDist: Ref<number>;
    /** 팬과 탭을 가른다 */
    movedPx: Ref<number>;
    /** 마지막으로 그린 마커의 화면 좌표 — 탭 히트 판정용 (그릴 때마다 갱신) */
    markerHits: Ref<Array<{ cx: number; cy: number; orderId: string }>>;
    drawMap: () => void;
    onStopTap?: (orderId: string) => void;
}

/** 🖐️ 손짓 처리기 넷 — 부품이 그릴 때마다 새로 받는다(최신 `drawMap` 을 부른다) */
export function gestureHandlersOf({ canvasRef, zoomRef, panRef, occludedNow, isDragging, lastPos, lastDist, movedPx, markerHits, drawMap, onStopTap }: GestureDeps) {
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

    return { handlePointerDown, handlePointerMove, handlePointerUp, handleZoomClick, handleWheel };
}

/** 🖐️ 지도 부품이 부르는 겉 — React 훅을 쓰지 않는다(ref 는 부품이 쥔다 · 훅 순서가 그대로다) */
export function usePinnedRouteGestures(deps: GestureDeps) {
    return gestureHandlersOf(deps);
}

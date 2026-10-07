import { describe, it, expect } from 'vitest';
import { anchorBaseOf, pinchStep } from '../lib/mapProjection';
import { gestureHandlersOf, type GestureDeps } from './usePinnedRouteGestures';

/**
 * 🖐️ **지도 손짓** — 부품 없이 ref 와 가짜 캔버스(자리 · 크기만)로 손짓을 넣고 배율 · 팬 · 탭을 본다.
 * 계산의 옳음(`pinchStep` · `anchorBaseOf`)은 `lib/mapProjection.test.ts` 가 본다 — 여기서는 «손짓이 그 계산을 그 값으로 부르나».
 * 못 잡는 것: 브라우저 이벤트 순서 · 실제 손가락 떨림 · 맞춤 모드 버튼(부품 몫 — `pinchZoomAnchor`).
 */
const RECT = { left: 30, top: 50, width: 400, height: 700 };
function deps(o: Partial<GestureDeps> = {}) {
    const d = {
        canvasRef: { current: { getBoundingClientRect: () => RECT } },
        zoomRef: { current: 1 }, panRef: { current: { x: 0, y: 0 } }, occludedNow: { current: 200 },
        isDragging: { current: false }, lastPos: { current: { x: 0, y: 0 } }, lastDist: { current: 0 }, movedPx: { current: 0 },
        markerHits: { current: [{ cx: 100, cy: 100, orderId: 'A' }] },
        draws: 0, taps: [] as string[],
        ...o,
    };
    const g: GestureDeps = { ...d, drawMap: () => { d.draws++; }, onStopTap: id => { d.taps.push(id); } };
    return { d, g, h: gestureHandlersOf(g) };
}
const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

describe('🤏 두 손가락 확대', () => {
    it('🔴 두 손가락 «중간»(캔버스 안 좌표)을 붙잡고 · 기준점은 그리는 쪽의 가림 높이로 — pinchStep 의 답 그대로', () => {
        const { d, h } = deps();
        h.handlePointerDown({ touches: [touch(100, 300)] });
        d.lastDist.current = 100;
        h.handlePointerMove({ touches: [touch(130, 300), touch(280, 300)] });
        const mid = { x: (130 + 280) / 2 - RECT.left, y: 300 - RECT.top };
        const want = pinchStep(100, 150, mid, anchorBaseOf(RECT.width, RECT.height, 200), 1, { x: 0, y: 0 });
        expect(d.zoomRef.current).toBe(want.zoom);
        expect(d.panRef.current).toEqual(want.pan);
        expect(d.lastDist.current).toBe(150);
        expect(d.draws).toBe(1);
    });
    it('🔴 가림 높이가 다르면 기준점이 달라진다 — 그리는 쪽과 같은 값을 본다', () => {
        const a = deps(), b = deps({ occludedNow: { current: 0 } });
        for (const { d, h } of [a, b]) {
            h.handlePointerDown({ touches: [touch(100, 300)] });
            d.lastDist.current = 100;
            h.handlePointerMove({ touches: [touch(130, 300), touch(280, 300)] });
        }
        expect(a.d.panRef.current).not.toEqual(b.d.panRef.current);
    });
});

describe('✋ 끌기 · 탭 · 휠', () => {
    it('끌면 팬만 쌓인다 — 배율(맞춤 모드의 기준 위)은 그대로', () => {
        const { d, h } = deps({ zoomRef: { current: 2.5 } });
        h.handlePointerDown({ clientX: 100, clientY: 100 });
        h.handlePointerMove({ clientX: 140, clientY: 90 });
        expect(d.panRef.current).toEqual({ x: 40, y: -10 });
        expect(d.zoomRef.current).toBe(2.5);
    });
    it('제자리에서 떼면 그 자리 마커(20px 안)의 콜을 연다 · 끈 뒤면 열지 않는다', () => {
        const tap = deps();
        tap.h.handlePointerDown({ clientX: 130 + 5, clientY: 150 });
        tap.h.handlePointerUp({ clientX: 130 + 5, clientY: 150 });
        expect(tap.d.taps).toEqual(['A']);
        const drag = deps();
        drag.h.handlePointerDown({ clientX: 100, clientY: 100 });
        drag.h.handlePointerMove({ clientX: 120, clientY: 100 });
        drag.h.handlePointerUp({ clientX: 135, clientY: 150 });
        expect(drag.d.taps).toEqual([]);
    });
    it('휠은 누른 자리를 붙잡고 배율을 바꾼다 · ＋ 버튼은 가운데', () => {
        const { d, h } = deps();
        h.handleWheel({ clientX: RECT.left + 200, clientY: RECT.top + 100, deltaY: -1 });
        expect(d.zoomRef.current).toBeCloseTo(1.1, 9);
        h.handleZoomClick(1.2);
        expect(d.zoomRef.current).toBeCloseTo(1.32, 9);
        expect(d.draws).toBe(2);
    });
});

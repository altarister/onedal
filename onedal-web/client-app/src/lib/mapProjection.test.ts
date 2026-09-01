import { describe, it, expect } from 'vitest';
import {
    projectMercator, anchorBaseOf, computeViewport, toScreenPoint, panAfterZoom,
    PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM,
    type GeoPoint,
} from './mapProjection';

/**
 * 🧭 **지도 투영·시점 검사** — 2026-09-01 배경 타일을 들이며 신설.
 *
 * 두 가지가 여기서 갈렸다:
 * ① 투영이 **선형에서 메르카토르로** 바뀌었다 — 안 바꾸면 마커가 도로에서 밀린다
 * ② 확대·축소의 기준점이 **그리는 쪽과 달랐다** — 확대할수록 지도가 옆으로 흘렀다
 */

/** 2026-08-25 실측 문제지의 정거장들 (drive.mjs 와 같은 좌표) */
const STOPS: GeoPoint[] = [
    { x: 127.294440, y: 37.376687 },   // 초월(집)
    { x: 127.312587, y: 37.363298 },   // 모다아울렛 곤지암
    { x: 127.401207, y: 37.309733 },   // 신둔농협
    { x: 127.446936, y: 37.277421 },   // 이천터미널
];
const W = 360, H = 620;
const NO_PAN = { x: 0, y: 0 };

describe('projectMercator — 타일이 쓰는 투영', () => {
    it('적도·본초자오선이 정규 좌표의 한가운데다', () => {
        const n = projectMercator(0, 0);
        expect(n.nx).toBeCloseTo(0.5, 10);
        expect(n.ny).toBeCloseTo(0.5, 10);
    });

    it('북쪽으로 갈수록 ny 가 작아진다 (화면 위쪽)', () => {
        const south = projectMercator(127, 37.0);
        const north = projectMercator(127, 37.5);
        expect(north.ny).toBeLessThan(south.ny);
    });

    it('경도는 위도와 무관하게 선형이다', () => {
        const a = projectMercator(127.0, 37.3);
        const b = projectMercator(128.0, 37.3);
        expect(b.nx - a.nx).toBeCloseTo(1 / 360, 12);
    });

    /**
     * 🔴 **이 검사가 옛 선형 투영을 잡는다.** 옛 캔버스는 위도·경도를 같은 축척으로
     *    놓았다 — 그러면 이 비가 1.0 이 되어 한국 위도에서 세로가 25% 눌린다.
     */
    it('한국 위도(37도)에서 세로 축척이 가로의 1/cos(37°) ≈ 1.25배다', () => {
        const d = 0.001;
        const dx = projectMercator(127 + d, 37).nx - projectMercator(127, 37).nx;
        const dy = projectMercator(127, 37).ny - projectMercator(127, 37 + d).ny;
        expect(dy / dx).toBeCloseTo(1 / Math.cos(37 * Math.PI / 180), 3);
        expect(dy / dx).toBeGreaterThan(1.24);   // 선형이었다면 정확히 1.0 이다
    });
});

describe('anchorBaseOf — 그리는 쪽과 제스처 쪽의 같은 기준점', () => {
    it('좌우 여백이 달라 화면 한가운데가 아니다', () => {
        const base = anchorBaseOf(W, H);
        expect(base.x).not.toBeCloseTo(W / 2, 5);
        expect(base.x).toBeCloseTo(PADDING_LEFT + (W - PADDING_LEFT - PADDING_RIGHT) / 2, 10);
        expect(base.y).toBeCloseTo(PADDING_TOP + (H - PADDING_TOP - PADDING_BOTTOM) / 2, 10);
    });
});

describe('computeViewport — 처음 화면(배율 1·팬 0)', () => {
    it('모든 정거장이 여백 안에 들어온다', () => {
        const v = computeViewport(STOPS, W, H, 1, NO_PAN);
        STOPS.forEach(s => {
            const p = toScreenPoint(s, v);
            expect(p.cx).toBeGreaterThanOrEqual(PADDING_LEFT - 0.001);
            expect(p.cx).toBeLessThanOrEqual(W - PADDING_RIGHT + 0.001);
            expect(p.cy).toBeGreaterThanOrEqual(PADDING_TOP - 0.001);
            expect(p.cy).toBeLessThanOrEqual(H - PADDING_BOTTOM + 0.001);
        });
    });

    it('가로세로 비가 잠겨 있다 — 두 배 넓은 화면에서도 두 점의 거리비가 같다', () => {
        const ratioAt = (w: number, h: number) => {
            const v = computeViewport(STOPS, w, h, 1, NO_PAN);
            const a = toScreenPoint(STOPS[0], v), b = toScreenPoint(STOPS[3], v);
            return (b.cx - a.cx) / (b.cy - a.cy);
        };
        expect(ratioAt(W, H)).toBeCloseTo(ratioAt(W * 2, H * 2), 6);
    });

    it('정거장이 하나뿐이어도 숫자가 무너지지 않는다', () => {
        const v = computeViewport([STOPS[0]], W, H, 1, NO_PAN);
        const p = toScreenPoint(STOPS[0], v);
        expect(Number.isFinite(v.worldSize)).toBe(true);
        expect(Number.isFinite(p.cx)).toBe(true);
        expect(Number.isFinite(p.cy)).toBe(true);
    });
});

describe('확대 — 누른 자리가 붙잡혀 있다', () => {
    const zoomAt = (screenX: number, screenY: number, from: number, ratio: number, pan: { x: number; y: number }) => {
        const base = anchorBaseOf(W, H);
        return {
            zoom: from * ratio,
            pan: {
                x: panAfterZoom(screenX, base.x, pan.x, ratio),
                y: panAfterZoom(screenY, base.y, pan.y, ratio),
            },
        };
    };

    /**
     * 🔴 **회귀** — 확대했을 때 손가락 아래에 있던 지점이 그 자리에 남아야 한다.
     *    2026-09-01 에 시점을 뷰포트 모델로 바꾸며 이 성질이 깨질 뻔했다:
     *    제스처 쪽 공식이 기준점을 (0,0) 으로 알고 있었다.
     */
    it('확대점 아래의 좌표가 화면에서 움직이지 않는다', () => {
        const px = 300, py = 180;                       // 손가락을 댄 자리
        const before = computeViewport(STOPS, W, H, 1, NO_PAN);

        // 그 자리에 있던 지점이 어느 정거장인지는 상관없다 — 화면 좌표 하나를 골라 되돌린다
        const held = STOPS[2];
        const heldBefore = toScreenPoint(held, before);

        const next = zoomAt(heldBefore.cx, heldBefore.cy, 1, 2.5, NO_PAN);
        const after = computeViewport(STOPS, W, H, next.zoom, next.pan);
        const heldAfter = toScreenPoint(held, after);

        expect(heldAfter.cx).toBeCloseTo(heldBefore.cx, 6);
        expect(heldAfter.cy).toBeCloseTo(heldBefore.cy, 6);
        expect(px + py).toBeGreaterThan(0);             // (자리 값은 위 주석의 예시일 뿐이다)
    });

    it('기준점을 0 으로 잘못 알면 어긋난다 — 그래서 한 곳에서 온다', () => {
        const held = STOPS[2];
        const before = computeViewport(STOPS, W, H, 1, NO_PAN);
        const heldBefore = toScreenPoint(held, before);
        const ratio = 2.5;

        // 옛 공식: 기준점이 화면 원점이라고 본다
        const wrongPan = {
            x: panAfterZoom(heldBefore.cx, 0, 0, ratio),
            y: panAfterZoom(heldBefore.cy, 0, 0, ratio),
        };
        const after = computeViewport(STOPS, W, H, ratio, wrongPan);
        const heldAfter = toScreenPoint(held, after);

        // 여백만큼 밀린다 — 배율이 클수록 크게
        expect(Math.abs(heldAfter.cx - heldBefore.cx)).toBeGreaterThan(100);
    });

    it('여러 번 확대·축소해 배율이 1 로 돌아오면 화면도 제자리다', () => {
        const held = STOPS[1];
        const start = computeViewport(STOPS, W, H, 1, NO_PAN);
        const startPt = toScreenPoint(held, start);

        let zoom = 1, pan = { ...NO_PAN };
        // 되짚어 오려면 역수여야 한다 — 1.1 과 0.9 는 서로의 역이 아니다 (1.1³·0.9³ = 0.97)
        for (const r of [1.1, 1.1, 1.1, 1 / 1.1, 1 / 1.1, 1 / 1.1]) {
            const anchorPt = toScreenPoint(held, computeViewport(STOPS, W, H, zoom, pan));
            const next = zoomAt(anchorPt.cx, anchorPt.cy, zoom, r, pan);
            zoom = next.zoom; pan = next.pan;
        }
        const endPt = toScreenPoint(held, computeViewport(STOPS, W, H, zoom, pan));
        expect(zoom).toBeCloseTo(1, 10);
        expect(endPt.cx).toBeCloseTo(startPt.cx, 6);
        expect(endPt.cy).toBeCloseTo(startPt.cy, 6);
    });
});

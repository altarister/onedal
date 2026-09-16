import { describe, it, expect } from 'vitest';
import {
    projectMercator, anchorBaseOf, computeViewport, toScreenPoint, panAfterZoom, pinchStep, mapTileTone, routeLineWidth, viewCoordsFor, FOLLOW_RADIUS_KM, effectiveZoom,
    PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM,
    type GeoPoint, pickViewMode, areaBoxOf, stickyFitBox, tileToneFor, capAreaBox, AREA_FIT_MAX_RATIO, layersForView, DIM_FADE_ZOOM } from './mapProjection';

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

/**
 * 🪟 **시트가 덮은 자리를 피한다** (기사님 요청 2026-09-01 — *"반쯤 열리면 같이 볼 수 있을 것 같은데"*).
 * 시트는 무대의 58% 를 덮는다. 그 상태에서 경로가 **위쪽 42% 안에** 들어와야 둘을 같이 본다.
 */
describe('시트 연동 — 가려진 자리에 경로를 그리지 않는다', () => {
    const SHEET = H * 0.58;   // half 일 때 시트가 덮는 높이

    it('시트를 반쯤 열면 모든 정거장이 시트 위에 남는다', () => {
        const v = computeViewport(STOPS, W, H, 1, NO_PAN, SHEET);
        const sheetTop = H - SHEET;
        STOPS.forEach(s => {
            const p = toScreenPoint(s, v);
            expect(p.cy).toBeLessThanOrEqual(sheetTop);
            expect(p.cy).toBeGreaterThanOrEqual(PADDING_TOP - 0.001);
        });
    });

    /** 🔴 이 검사가 «연동 안 함»을 잡는다 — 가림을 무시하면 아래 정거장이 시트 뒤로 숨는다 */
    it('가림을 모르면 시트 뒤로 숨는 정거장이 생긴다', () => {
        const v = computeViewport(STOPS, W, H, 1, NO_PAN);           // occludedBottom 없음
        const sheetTop = H - SHEET;
        const hidden = STOPS.filter(s => toScreenPoint(s, v).cy > sheetTop);
        expect(hidden.length).toBeGreaterThan(0);
    });

    it('시트가 열릴수록 경로가 위로 올라온다', () => {
        const centerY = (occluded: number) => {
            const v = computeViewport(STOPS, W, H, 1, NO_PAN, occluded);
            const ys = STOPS.map(s => toScreenPoint(s, v).cy);
            return (Math.min(...ys) + Math.max(...ys)) / 2;
        };
        expect(centerY(SHEET)).toBeLessThan(centerY(72));       // half 가 peek 보다 위
        expect(centerY(72)).toBeLessThan(centerY(0));           // peek 이 시트 없음보다 위
    });

    it('시트가 다 덮어도 지도가 무너지지 않는다 — 최소 자리를 남긴다', () => {
        const v = computeViewport(STOPS, W, H, 1, NO_PAN, H);    // 화면 전체를 덮는 값
        STOPS.forEach(s => {
            const p = toScreenPoint(s, v);
            expect(Number.isFinite(p.cx)).toBe(true);
            expect(Number.isFinite(p.cy)).toBe(true);
        });
        expect(v.worldSize).toBeGreaterThan(0);
    });

    it('시트가 없으면 옛 화면 그대로다 — 기본값은 가림 0', () => {
        const a = computeViewport(STOPS, W, H, 1, NO_PAN);
        const b = computeViewport(STOPS, W, H, 1, NO_PAN, 0);
        expect(a.anchorY).toBeCloseTo(b.anchorY, 10);
        expect(a.worldSize).toBeCloseTo(b.worldSize, 10);
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

/**
 * 🤏 **핀치 줌 — 두 손가락 중간이 제자리에 남는다** (기사님 실주행 지적 2026-09-03)
 *
 * 기사님: *"손가락 중간을 기준점으로 줌인이 될 거라 생각했는데..
 * 한쪽 방향으로 치우쳐서 줌인되었어."*
 *
 * 뿌리 — 휠·버튼은 `zoomAround` 가 기준점을 잡고 팬을 보정했는데,
 * **핀치만 배율만 바꾸고 팬을 안 건드렸다.** 09-01 수리가 이 갈래를 안 지났다.
 */
describe('🤏 핀치 — 두 손가락 중간이 붙잡혀 있다', () => {
    const base = anchorBaseOf(W, H);
    const NO = { x: 0, y: 0 };

    /**
     * 그 화면 좌표에 있던 지점이 확대 뒤에도 같은 자리에 있는가.
     * ⚠️ `toScreenPoint` 는 `{cx, cy}` 를 준다 — 제스처 좌표 `{x, y}` 로 옮겨 넘긴다.
     */
    const heldStays = (which: number, prev: number, now: number) => {
        const before = computeViewport(STOPS, W, H, 1, NO);
        const held = toScreenPoint(STOPS[which], before);
        const step = pinchStep(prev, now, { x: held.cx, y: held.cy }, base, 1, NO);
        const after = computeViewport(STOPS, W, H, step.zoom, step.pan);
        const moved = toScreenPoint(STOPS[which], after);
        return Math.hypot(moved.cx - held.cx, moved.cy - held.cy);
    };

    it('확대해도 손가락 중간의 지점이 안 움직인다', () => {
        expect(heldStays(2, 100, 260)).toBeLessThan(0.5);
    });

    it('축소해도 마찬가지다', () => {
        expect(heldStays(2, 260, 100)).toBeLessThan(0.5);
    });

    it('배율은 거리의 «비»다 — 두 배 벌리면 두 배', () => {
        const r = pinchStep(100, 200, { x: 300, y: 180 }, base, 1, NO);
        expect(r.zoom).toBeCloseTo(2, 6);
    });

    it('🔴 중간점이 화면 가운데가 아니어도 그 자리가 붙잡힌다 — 쏠림의 정체', () => {
        // 왼쪽 위 구석을 잡고 확대한다. 팬을 안 고치면 여기가 크게 밀린다
        const before = computeViewport(STOPS, W, H, 1, NO);
        const corner = { x: 60, y: 50 };
        const step = pinchStep(100, 300, corner, base, 1, NO);
        const after = computeViewport(STOPS, W, H, step.zoom, step.pan);
        // 그 화면점이 가리키던 세상 좌표가 그대로여야 한다 — 정거장으로 대신 잰다
        expect(heldStays(0, 100, 300)).toBeLessThan(0.5);
        expect(after.worldSize).toBeGreaterThan(before.worldSize);
    });

    it('상한에 걸리면 팬도 안 흔들린다 — 더 벌려도 그림이 안 튄다', () => {
        const r = pinchStep(100, 400, { x: 300, y: 180 }, base, 10, { x: 12, y: -7 });
        expect(r.zoom).toBe(10);
        expect(r.pan).toEqual({ x: 12, y: -7 });
    });

    it('손가락 거리가 0 이면 아무것도 안 바꾼다 (규칙 ④)', () => {
        const r = pinchStep(0, 120, { x: 10, y: 10 }, base, 2, { x: 5, y: 5 });
        expect(r).toEqual({ zoom: 2, pan: { x: 5, y: 5 } });
    });
});

/**
 * 🎨 **배경 지도 톤은 배율과 상관없이 늘 같다** (기사님 2026-09-15 «줌인할수록 흐려지는 기능은 필요 없을꺼 같아» · «어»)
 *
 * 2026-09-04 에는 «확대하면 지도가 제 색을 되찾는다»였다. 확대할수록 배경이 밝아져 그 위의 옅은 상차 · 하차 영역이
 * 상대적으로 흐려 보였다 — 영역이 주인공인 지도라 배경은 늘 눌러 둔다.
 */
describe('🎨 배경 지도 톤 — 배율과 상관없이 평소 톤', () => {
    const DIM = 0.5;   // 어두운 테마의 평소 진하기

    it('🔴 평소 톤 — 흐리고 회색조', () => {
        const t = mapTileTone(DIM);
        expect(t.alpha).toBeCloseTo(DIM, 6);
        expect(t.filter).toMatch(/grayscale\(1\.000\)/);
    });

    it('밝은 테마는 자기 평소값 — 값을 지어내지 않는다', () => {
        expect(mapTileTone(0.75).alpha).toBeCloseTo(0.75, 6);
    });
});

/**
 * 🖊️ **경로선 두께 — 확대해도 도로를 덮지 않는다** (기사님 지적 2026-09-04)
 *
 * 기사님: *"라인이 너무 두꺼워 길을 잘 간 건지 모르겠어. 줌에 따라 두께가 달라져야 할 것 같아."*
 * 옛 식 `3 * zoom` 은 10배에서 30px 띠가 되어 도로를 통째로 덮었다.
 */
describe('🖊️ 경로선 두께', () => {
    it('기본 배율에서는 3px', () => {
        expect(routeLineWidth(1)).toBeCloseTo(3, 6);
    });

    it('🔴 확대해도 배율만큼 굵어지지 않는다 — 옛 식이면 10배에서 30px 였다', () => {
        expect(routeLineWidth(10)).toBeLessThan(10);
    });

    it('확대하면 조금은 굵어진다 — 아주 고정이면 확대한 보람이 없다', () => {
        expect(routeLineWidth(4)).toBeGreaterThan(routeLineWidth(1));
    });

    it('상한에서 멈춘다 — 더 확대해도 그대로', () => {
        expect(routeLineWidth(9)).toBeCloseTo(routeLineWidth(100), 6);
    });

    it('축소해도 사라지지 않는다', () => {
        expect(routeLineWidth(0.5)).toBeGreaterThan(1);
        expect(routeLineWidth(0)).toBeGreaterThan(0);
    });
});

/**
 * 🔭 **지도가 무엇에 맞춰지나 — 세 가지** (기사님 실주행 09-03)
 *
 * *"지금 가고 있는 곳만 볼 수 있으면 좋겠어"* · *"네비처럼 현위치가 가운데 있는 옵션도"*
 * 새 기계 없이 «무엇을 주느냐»만 바꾼다.
 */
describe('🔭 지도 보기 — 전체 · 이번 구간 · 현위치', () => {
    const ALL = [{ x: 127.0, y: 37.4 }, { x: 126.8, y: 37.6 }, { x: 127.3, y: 37.3 }];
    const ME = { x: 127.29, y: 37.37 };
    const NEXT = { x: 127.12, y: 37.42 };

    it('전체 — 주는 것이 그대로다', () => {
        expect(viewCoordsFor('all', ALL, ME, NEXT)).toEqual(ALL);
    });

    const PREV = { x: 127.298, y: 37.374 };

    it('이번 구간 — **직전 정거장 → 다음 정거장**이 다 보인다 (현위치도 함께)', () => {
        expect(viewCoordsFor('leg', ALL, ME, NEXT, PREV)).toEqual([PREV, NEXT, ME]);
    });

    /**
     * 🔴 처음엔 «현위치 → 다음 정거장»으로 잡았다 — 그러면 달릴수록 둘이 가까워져
     *    **화면이 계속 확대된다.** 구간은 달리는 동안 가만히 있어야 한다.
     */
    it('🔴 달려도 구간이 안 좁아진다 — 시작점이 «직전 정거장»이라 안 움직인다', () => {
        const start = viewCoordsFor('leg', ALL, ME, NEXT, PREV);
        const almostThere = viewCoordsFor('leg', ALL, { x: NEXT.x + 0.001, y: NEXT.y }, NEXT, PREV);
        // 어디까지 갔든 구간의 두 끝은 그대로다
        expect(almostThere).toContainEqual(PREV);
        expect(almostThere).toContainEqual(NEXT);
        expect(start).toContainEqual(PREV);
    });

    it('직전 정거장이 없으면(첫 구간) 현위치가 시작점이다', () => {
        expect(viewCoordsFor('leg', ALL, ME, NEXT, null)).toEqual([ME, NEXT, ME]);
    });

    it('현위치 — 그 둘레 상자다. 가운데가 현위치다', () => {
        const box = viewCoordsFor('follow', ALL, ME, NEXT);
        expect(box).toHaveLength(2);
        expect((box[0].x + box[1].x) / 2).toBeCloseTo(ME.x, 9);
        expect((box[0].y + box[1].y) / 2).toBeCloseTo(ME.y, 9);
    });

    it('현위치 상자는 반경만큼이다 — 위도로 재면 ±0.6km (골목이 읽히는 배율)', () => {
        const box = viewCoordsFor('follow', ALL, ME, NEXT);
        expect((box[1].y - box[0].y) * 111 / 2).toBeCloseTo(FOLLOW_RADIUS_KM, 3);
    });

    it('🔴 재료가 없으면 전체로 떨어진다 — 빈 지도를 보여주지 않는다', () => {
        expect(viewCoordsFor('leg', ALL, null, null, null)).toEqual(ALL);
        expect(viewCoordsFor('leg', ALL, ME, null)).toEqual(ALL);
        expect(viewCoordsFor('follow', ALL, null, NEXT)).toEqual(ALL);
    });
});

/**
 * 🔆 **현위치로 보면 지도를 누르지 않는다** — 그 배율에서는 골목·건물을 눈으로 따라가야 한다.
 * 전체·구간은 회색조로 눌러 둔다 — 넓게 볼 때 배경이 시끄러우면 색과 영역이 안 읽힌다 (규칙 ⑤-3).
 */
describe('🌓 지도 밝기 — «어둡게» 레이어와 배율이 정한다', () => {
    it('전체 배율(1배)에서는 회색조로 누른다', () => {
        const t = tileToneFor('dark', 1, true);
        expect(t.filter).toMatch(/grayscale/);
        expect(t.alpha).toBeLessThan(1);
        expect(t.overlay).toBeGreaterThan(0);
    });

    it('🔴 확대할수록 옅어진다 — 많이 확대하면 제 색 그대로', () => {
        const mid = tileToneFor('dark', (1 + DIM_FADE_ZOOM) / 2, true);
        const near = tileToneFor('dark', 1, true);
        expect(mid.alpha).toBeGreaterThan(near.alpha);
        expect(mid.overlay).toBeLessThan(near.overlay);

        const far = tileToneFor('dark', DIM_FADE_ZOOM, true);
        expect(far.filter).toBeNull();
        expect(far.alpha).toBe(1);
        expect(far.overlay).toBe(0);
        /* 더 확대해도 더 밝아질 것이 없다 */
        expect(tileToneFor('dark', DIM_FADE_ZOOM * 3, true)).toEqual(far);
    });

    it('🔴 «어둡게»를 끄면 배율과 상관없이 제 색 그대로', () => {
        for (const theme of ['dark', 'light'] as const) {
            const t = tileToneFor(theme, 1, false);
            expect(t.filter).toBeNull();
            expect(t.alpha).toBe(1);
            expect(t.overlay).toBe(0);
        }
    });

    it('밝은 테마는 덮개를 안 쓴다 (지도가 흰 바탕이라 회색조로 충분하다)', () => {
        expect(tileToneFor('light', 1, true).overlay).toBe(0);
    });
});

/**
 * 🧅 **현위치로 보면 영역을 덮는다** — 골목 배율에서 상차·하차 영역이 화면을 덮으면 길이 안 보인다.
 * 🔴 기사님이 끈 레이어를 켜지는 않는다 — 덮기만 한다.
 */
describe('🧅 보기 모드가 덮는 레이어 — layersForView', () => {
    const on = { base: true, border: true, route: true, trail: true, pickup: true, dropoff: true, dots: true };

    it('전체·구간은 고른 그대로 둔다', () => {
        for (const m of ['all', 'leg'] as const) expect(layersForView(m, on)).toEqual(on);
    });

    it('🔴 현위치는 상차·하차·동 점을 덮는다 — 나머지는 그대로', () => {
        const v = layersForView('follow', on);
        expect([v.pickup, v.dropoff, v.dots]).toEqual([false, false, false]);
        expect([v.base, v.border, v.route, v.trail]).toEqual([true, true, true, true]);
    });

    it('🔴 꺼 둔 것을 켜지 않는다', () => {
        const off = { ...on, route: false, pickup: false };
        expect(layersForView('follow', off).route).toBe(false);
        expect(layersForView('all', off).pickup).toBe(false);
    });
});

/**
 * 🔭 **영역은 경로 네모의 2배까지만** — 통째로 담으면 먼 원 하나가 화면을 다 먹어 경로가 실처럼 보인다.
 * 🔴 아주 빼지는 않는다 — 가까운 영역은 보여야 한다 (전에 «영역이 너무 짤린다»고 하셨다).
 */
describe('🔭 영역 네모 자르기 — capAreaBox', () => {
    const route = { minX: 127.0, minY: 37.0, maxX: 127.1, maxY: 37.1 };

    it('경로 네모 안에 드는 영역은 그대로 둔다', () => {
        const small = { minX: 127.02, minY: 37.02, maxX: 127.08, maxY: 37.08 };
        expect(capAreaBox(route, small)).toEqual(small);
    });

    it('🔴 넓은 영역은 경로 네모 안으로 자른다 — 영역 때문에 화면이 넓어지지 않는다', () => {
        const huge = { minX: 126.0, minY: 36.0, maxX: 128.0, maxY: 38.0 };
        const cut = capAreaBox(route, huge)!;
        expect((cut.maxX - cut.minX)).toBeCloseTo((route.maxX - route.minX) * AREA_FIT_MAX_RATIO, 9);
        expect((cut.maxY - cut.minY)).toBeCloseTo((route.maxY - route.minY) * AREA_FIT_MAX_RATIO, 9);
        /* 가운데는 경로 네모의 가운데다 — 한쪽으로 쏠리지 않는다 */
        expect((cut.minX + cut.maxX) / 2).toBeCloseTo((route.minX + route.maxX) / 2, 9);
    });

    it('경로가 없으면 영역을 그대로 쓴다 · 영역이 없으면 없다', () => {
        const area = { minX: 126.9, minY: 36.9, maxX: 127.4, maxY: 37.4 };
        expect(capAreaBox(null, area)).toEqual(area);
        expect(capAreaBox(route, null)).toBeNull();
    });
});

/**
 * 🔭 **실제 배율** — 손으로 확대하든 「구간」·「현위치」로 맞춰 확대되든 답이 하나여야 한다.
 * 그래야 «확대하면 지도가 제 색을 되찾는다»가 어느 길로 확대했든 똑같이 작동한다.
 */
describe('🔭 실제 배율', () => {
    it('전체 보기와 같으면 1 배다', () => {
        expect(effectiveZoom(1000, 1000)).toBeCloseTo(1, 9);
    });

    it('맞춤으로 크게 그려지면 그만큼 커진다 — 손을 안 댔어도', () => {
        expect(effectiveZoom(4000, 1000)).toBeCloseTo(4, 9);
    });

    it('기준이 없으면 1 로 둔다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(effectiveZoom(4000, 0)).toBe(1);
    });
});

/**
 * 🔭 **짧은 축 때문에 통째로 줌아웃되던 것** (기사님 실측 2026-09-04)
 *
 * 기사님: *"4~5 가산동은 다른 지점이 보일 만큼 줌 아웃 되어 있어."* ·
 * *"지도가 보이는 영역에 지점이 꽉 차서 보여야 하는데.. 그렇지 못해."*
 *
 * 옛 식은 «범위 < 0.01°(1.1km) 면 0.2°(22km) 로» 였다 — 세로로 뻗은 구간은 가로가
 * 짧다는 이유로 22km 를 뒤집어썼고 `min()` 이 그 축을 골라 화면이 통째로 축소됐다.
 */
describe('🔭 뷰포트 맞춤 — 짧은 축이 화면을 줄이지 않는다', () => {
    const W = 400, H = 560, OCC = 72, NO = { x: 0, y: 0 };
    /** ④가산동 → ⑤구로동 — 가로 1.0km · 세로 4.1km 의 «세로 구간» (09-03 실제 좌표) */
    const VERTICAL = [{ x: 126.883619010738, y: 37.4689667062309 },
                      { x: 126.874476183809, y: 37.5056847560909 }];

    it('🔴 세로 구간이 세로에 맞춰진다 — 두 점이 화면에서 멀리 벌어진다', () => {
        const v = computeViewport(VERTICAL, W, H, 1, NO, OCC);
        const a = toScreenPoint(VERTICAL[0], v), b = toScreenPoint(VERTICAL[1], v);
        // 옛 식에서는 세로 간격이 60px 남짓이었다 (가로 22km 가 배율을 눌렀다)
        expect(Math.abs(a.cy - b.cy)).toBeGreaterThan(250);
    });

    it('두 점이 모두 그리는 영역 안에 있다 — 가장자리에 딱 붙지 않는다', () => {
        const v = computeViewport(VERTICAL, W, H, 1, NO, OCC);
        for (const p of VERTICAL) {
            const s = toScreenPoint(p, v);
            expect(s.cx).toBeGreaterThan(PADDING_LEFT * 0.5);
            expect(s.cx).toBeLessThan(W - PADDING_RIGHT * 0.5);
            expect(s.cy).toBeGreaterThan(PADDING_TOP * 0.9);
            expect(s.cy).toBeLessThan(H - OCC - PADDING_BOTTOM * 0.5);
        }
    });

    it('가로 구간도 마찬가지다 — 짧은 세로가 배율을 안 누른다', () => {
        const HORIZONTAL = [{ x: 126.90, y: 37.45 }, { x: 127.20, y: 37.452 }];
        const v = computeViewport(HORIZONTAL, W, H, 1, NO, OCC);
        const a = toScreenPoint(HORIZONTAL[0], v), b = toScreenPoint(HORIZONTAL[1], v);
        expect(Math.abs(a.cx - b.cx)).toBeGreaterThan(200);
    });

    it('한 점뿐이면 주변이 보이는 폭으로 — 0 으로 나누지 않는다', () => {
        const v = computeViewport([{ x: 127.0, y: 37.4 }], W, H, 1, NO, OCC);
        expect(Number.isFinite(v.worldSize)).toBe(true);
        expect(v.worldSize).toBeGreaterThan(0);
    });
});

/**
 * 🔭 **보기 버튼 — 언제나 되돌리고 언제나 다시 그린다** (버그 2026-09-05)
 *
 * 기사님: *"현위치에서 드래그하고 **다시 현위치를 누르면 현위치로 안 와.**"*
 *
 * 🔴 버튼이 `setViewMode` 만 부르고 그리기는 **리렌더에 얹어** 있었다. 이미 그 모드면
 *    리액트가 상태를 안 바꾸므로 리렌더가 없고, 따라서 **그리기도 없다.**
 *    ref 인 `zoom`·`pan` 만 조용히 되돌아가고 **화면은 옛 자리에 남았다.**
 */
describe('🔭 보기 버튼을 눌렀다 — pickViewMode', () => {
    const ctx = () => {
        const seen: string[] = [];
        return {
            seen,
            setViewMode: (m: string) => seen.push(`mode:${m}`),
            zoom: { current: 3.4 },
            pan: { current: { x: -120, y: 55 } },
            draw: () => { seen.push('draw'); },
        };
    };

    it('손으로 만진 것(팬·줌)을 되돌린다', () => {
        const o = ctx();
        pickViewMode('follow', o);
        expect(o.zoom.current).toBe(1);
        expect(o.pan.current).toEqual({ x: 0, y: 0 });
    });

    it('🔴 **같은 모드를 다시 눌러도** 다시 그린다 — 이것이 그 버그다', () => {
        const o = ctx();
        pickViewMode('follow', o);          // 이미 follow 였다고 치자
        expect(o.seen).toContain('draw');
    });

    it('되돌린 **뒤에** 그린다 — 순서가 뒤집히면 옛 팬으로 한 번 그려진다', () => {
        const o = ctx();
        let panWhenDrawn: { x: number; y: number } | null = null;
        o.draw = () => { panWhenDrawn = { ...o.pan.current }; };
        pickViewMode('all', o);
        expect(panWhenDrawn).toEqual({ x: 0, y: 0 });
    });

    it('어느 모드로 눌러도 같다', () => {
        for (const m of ['all', 'leg', 'follow'] as const) {
            const o = ctx();
            pickViewMode(m, o);
            expect(o.seen).toEqual([`mode:${m}`, 'draw']);
        }
    });
});

/**
 * 🔭 **화면 맞춤에 영역을 넣되 흔들리지 않게** — 막는 것: 영역이 화면 밖으로 잘림 · 달리는 동안 «전체» 화면이 줄었다 늘었다 함 (#150).
 * 네모는 영역이 밖으로 나가거나 절반 아래로 줄 때만 새로 잡는다.
 */
describe('🔭 영역 네모 — 잘리지 않고 흔들리지 않게', () => {
    it('원 · 다각형 · 띠를 감싼 경위도 네모 — 원과 띠는 km 만큼 넓힌다', () => {
        const b = areaBoxOf({ circles: [{ x: 127, y: 37, km: 10 }], polygons: [[{ x: 127.5, y: 37.2 }, { x: 127.6, y: 36.9 }]], lines: [] })!;
        expect(b.minX).toBeCloseTo(127 - 10 / (111.32 * Math.cos(37 * Math.PI / 180)), 4);
        expect(b.maxY).toBeCloseTo(37.2, 6);
        expect(b.minY).toBeCloseTo(Math.min(36.9, 37 - 10 / 110.574), 6);
        expect(b.maxX).toBeCloseTo(127.6, 6);
        expect(areaBoxOf({ circles: [], polygons: [], lines: [] })).toBeNull();
    });
    it('🔴 조금 움직인 영역이 네모 안이면 네모는 그대로 — 화면이 안 흔들린다', () => {
        const first = stickyFitBox(null, { minX: 127, minY: 37, maxX: 127.2, maxY: 37.2 })!;
        expect(first.minX).toBeLessThan(127);   // 여유를 두고 잡는다
        const moved = stickyFitBox(first, { minX: 127.003, minY: 37.002, maxX: 127.203, maxY: 37.202 });
        expect(moved).toBe(first);
    });
    it('🔴 영역이 네모 밖으로 나가면 다시 잡는다 — 잘리지 않는다', () => {
        const first = stickyFitBox(null, { minX: 127, minY: 37, maxX: 127.2, maxY: 37.2 })!;
        const out = stickyFitBox(first, { minX: 127, minY: 37, maxX: 127.5, maxY: 37.2 })!;
        expect(out).not.toBe(first);
        expect(out.maxX).toBeGreaterThanOrEqual(127.5);
    });
    it('🔴 절반 아래로 줄면 다시 잡는다 · 영역이 없으면 네모도 없다', () => {
        const first = stickyFitBox(null, { minX: 127, minY: 37, maxX: 127.4, maxY: 37.4 })!;
        const small = stickyFitBox(first, { minX: 127.1, minY: 37.1, maxX: 127.2, maxY: 37.2 })!;
        expect(small).not.toBe(first);
        expect(small.maxX).toBeLessThan(127.3);
        expect(stickyFitBox(first, null)).toBeNull();
    });
});


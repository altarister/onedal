import { describe, it, expect } from 'vitest';
import { MAP_THEME_COLORS } from '../../styles/themes';
import { SOAK } from './JudgmentSeat';
import {
    tileUrlOf, drawCredit, polylineOf, routeStrokesOf, candidateStrokeOf, trailStrokesOf, drawStrokes,
    visitedMarksOf, routeStopMarksOf, dongDotMarksOf, aheadCutOf, pickupTraceOf, tracePickup, dropoffTraceOf, paintDropoffMask,
    fitCoordsOf, straightGuideOf, type Project,
} from './pinnedRouteLayers';

/**
 * 🗺️ **지도 그리기의 층** — 값을 넣고 «무엇을 그리나»를 본다 (화면 · 부품 없이).
 * 가짜 ctx 는 부른 것만 적는다 — 픽셀은 안 본다. 실제 그림이 같은지는 화면 사진 견주기 몫이다.
 * 못 잡는 것: 그리는 차례(부르는 쪽 `drawMap` 이 정한다) · 그리는 때(효과 · rAF · 타일 도착) · 픽셀.
 */
const C = MAP_THEME_COLORS.dark;
/** 땅 좌표 → 화면: 경도 1° = 1000px, 위도는 위로 */
const P: Project = p => ({ cx: (p.x - 127) * 1000, cy: (38 - p.y) * 1000 });

/** 부른 것을 적는 가짜 ctx — `[이름, 값…]` */
function fakeCtx() {
    const log: Array<[string, ...unknown[]]> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
        get(t, k: string) {
            if (k === 'log') return log;
            if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
            if (k in t) return t[k];
            return (...a: unknown[]) => { log.push([k, ...a]); };
        },
        set(t, k: string, v) { t[k] = v; log.push([`=${k}`, v]); return true; },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const LINE = [{ x: 127.30, y: 37.40 }, { x: 127.33, y: 37.38 }, { x: 127.36, y: 37.35 }, { x: 127.40, y: 37.31 }];
const holder = (o: Record<string, unknown> = {}) => ({ id: 'A', status: 'ORDER_CONFIRMED', routePolyline: LINE, ...o }) as any;

describe('배경 — 키 없는 OpenStreetMap 타일 · © 표기', () => {
    it('타일 주소는 OpenStreetMap 이다 — 카카오 지도 키 · SDK 가 없다', () => {
        expect(tileUrlOf(12, 3490, 1585)).toBe('https://tile.openstreetmap.org/12/3490/1585.png');
    });
    it('© 표기를 오른쪽 아래에 적는다', () => {
        const { ctx, log } = fakeCtx();
        drawCredit(ctx, 400, 600, C);
        expect(log).toContainEqual(['fillText', '© OpenStreetMap', 396, 597]);
        expect(log).toContainEqual(['=textAlign', 'right']);
    });
});

describe('경로선 — 주인은 서버가 고른 홀더', () => {
    it('🔴 그리는 선은 routeHolder 의 routePolyline 그대로 · 깨진 좌표만 거른다 (스스로 홀더를 찾지 않는다)', () => {
        const bad = [...LINE, { x: NaN, y: 1 }, { x: 'x', y: 2 }];
        expect(polylineOf(holder({ routePolyline: bad })).valid).toEqual(LINE);
        expect(polylineOf(null).valid).toEqual([]);
        const s = routeStrokesOf({ on: true, routeHolder: holder(), mapColors: C });
        expect(s).toEqual([{ pts: LINE, color: C.routeLine, widthScale: 1, dash: undefined }]);
    });
    it('«경로» 레이어를 끄면 · 궤적이 없으면 안 긋는다', () => {
        expect(routeStrokesOf({ on: false, routeHolder: holder(), mapColors: C })).toEqual([]);
        expect(routeStrokesOf({ on: true, routeHolder: holder({ routePolyline: [] }), mapColors: C })).toEqual([]);
    });
    it('🔴 미리보기는 구간을 나눠 — 후보 콜 구간은 판정 색 굵게 · 나머지는 노란 점선', () => {
        const preview = holder({
            status: 'ORDER_SECURED_EVALUATING', judgment: { color: '꿀' }, sectionEnds: [2, 4],
            sectionStops: [{ orderId: 'B', stopType: 'pickup' }, { orderId: 'A', stopType: 'dropoff' }],
        });
        const s = routeStrokesOf({ on: true, routeHolder: preview, mapColors: C });
        expect(s.map(x => [x.color, x.widthScale, x.dash])).toEqual([['#e6b422', 1, [10, 8]], [SOAK['꿀'].bar, 1.6, undefined]]);
        /* 재료가 어긋나면(구간 주인 수 ≠ 구간 수) 한 줄 노란 점선으로 물러난다 */
        const off = routeStrokesOf({ on: true, routeHolder: { ...preview, sectionStops: [{ orderId: 'A', stopType: 'dropoff' }] }, mapColors: C });
        expect(off).toEqual([{ pts: LINE, color: '#e6b422', widthScale: 1, dash: [10, 8] }]);
    });
    it('확정 경로는 콜마다 제 색 띠 · 빈 차 구간은 회색 점선 · 지금 향하는 콜을 맨 나중에', () => {
        const h = holder({
            sectionEnds: [2, 3, 4],
            sectionStops: [{ orderId: 'A', stopType: 'pickup' }, { orderId: 'A', stopType: 'dropoff' }, { orderId: 'B', stopType: 'pickup' }],
        });
        const s = routeStrokesOf({ on: true, routeHolder: h, callColors: new Map([['A', '#a00'], ['B', '#0b0']]), mapColors: C });
        expect(s).toContainEqual({ pts: LINE.slice(3, 4), color: C.textMuted, widthScale: 0.8, dash: [7, 6] });   // A 를 내린 뒤 B 상차로 가는 빈 길
        expect(s.at(-1)!.color).toBe('#a00');                                               // 첫 정거장의 콜(A)이 위로
        const both = routeStrokesOf({ on: true, mapColors: C, callColors: new Map([['A', '#a00'], ['B', '#0b0']]), routeHolder: holder({
            sectionEnds: [1, 2, 3, 4],
            sectionStops: [{ orderId: 'A', stopType: 'pickup' }, { orderId: 'B', stopType: 'pickup' }, { orderId: 'A', stopType: 'dropoff' }, { orderId: 'B', stopType: 'dropoff' }],
        }) });
        expect(both.map(x => x.color)).toEqual(['#0b0', '#0b0', '#0b0', '#a00', '#a00', '#a00']);   // B 를 먼저 · 지금 향하는 A 를 위에 (내리는 차례로는 A 가 먼저다)
        expect(both[0].offsetPx).not.toBe(both[3].offsetPx);                                        // 함께 가는 구간은 나란히
    });
});

describe('후보 경로 — 따로 한 줄', () => {
    it('🔴 판정 전이면 노란 점선 · 판정 뒤면 판정 색 실선 굵게', () => {
        expect(candidateStrokeOf({ on: true, candidateHolder: holder({ id: 'C' }) }))
            .toEqual({ pts: LINE, color: '#e6b422', widthScale: 1, dash: [10, 8] });
        expect(candidateStrokeOf({ on: true, candidateHolder: holder({ id: 'C', judgment: { color: '사고' } }) }))
            .toEqual({ pts: LINE, color: SOAK['사고'].bar, widthScale: 1.6, dash: undefined });
    });
    it('🔴 구간으로 쪼개지 않는다 — 구간 경계가 있어도 처음부터 끝까지 한 줄', () => {
        const c = candidateStrokeOf({ on: true, candidateHolder: holder({ sectionEnds: [2, 4], sectionStops: [{ orderId: 'X', stopType: 'pickup' }, { orderId: 'C', stopType: 'dropoff' }] }) });
        expect(c!.pts).toEqual(LINE);
    });
    it('🔴 «후보» 레이어를 끄면 안 긋는다 · 점이 둘보다 적으면 안 긋는다', () => {
        expect(candidateStrokeOf({ on: false, candidateHolder: holder() })).toBeNull();
        expect(candidateStrokeOf({ on: true, candidateHolder: holder({ routePolyline: [LINE[0]] }) })).toBeNull();
        expect(candidateStrokeOf({ on: true, candidateHolder: null })).toBeNull();
    });
});

describe('달린 자취 — 구간마다 따로', () => {
    it('🔴 구간 하나에 선 하나 — 이으면 GPS 가 끊긴 자리가 직선으로 남는다', () => {
        const segs = [LINE.slice(0, 2), LINE.slice(2)];
        const s = trailStrokesOf({ on: true, segs, callCount: 1, color: '#fff' });
        expect(s.map(x => x.pts)).toEqual(segs);
        expect(trailStrokesOf({ on: false, segs, callCount: 1, color: '#fff' })).toEqual([]);
    });
    it('긋는 굵기는 배율 굵기 × 배수 · 점선은 그 선에만', () => {
        const { ctx, log } = fakeCtx();
        drawStrokes(ctx, [{ pts: LINE, color: '#123', widthScale: 2, dash: [10, 8] }], P, 3);
        expect(log).toContainEqual(['=lineWidth', 6]);
        expect(log).toContainEqual(['setLineDash', [10, 8]]);
        expect(log.filter(l => l[0] === 'lineTo')).toHaveLength(LINE.length - 1);
    });
});

describe('정거장 마커', () => {
    it('🔴 다녀온 정거장은 흐린 회색 원 · 테두리 투명 · 번호는 방문 순서로 동결된 값', () => {
        const [m] = visitedMarksOf({ trail: [{ x: 127.3, y: 37.4, orderId: 'A', no: 3, callNo: 2 }], rainbowNodes: true, mapColors: C });
        expect(m).toMatchObject({ fill: C.textMuted, stroke: 'transparent', label: '3' });
        const [plain] = visitedMarksOf({ trail: [{ x: 127.3, y: 37.4, orderId: 'A', no: 3 }], rainbowNodes: true, mapColors: C, callColors: new Map([['A', '#abc']]) });
        expect(plain).toMatchObject({ stroke: '#abc', label: '3' });
    });
    it('🔴 남은 정거장 번호는 실려 온 p.no 그대로 — 캔버스가 «몇 번째»로 세지 않는다', () => {
        const pt = (no: number | undefined) => ({ x: 127.3, y: 37.4, type: '상차', name: '곤지암', isEvaluating: false, no });
        const marks = routeStopMarksOf({ points: [pt(7), pt(9), pt(undefined)], rainbowNodes: true, mapColors: C, theme: 'dark' });
        expect(marks.map(m => m.label)).toEqual(['7', '9', '']);
    });
});

describe('동 점 — 원달앱에 내려간 목록', () => {
    it('🔴 상차 · 하차 둘 다 든 동은 보라 · 차례는 하차 → 상차 → 둘 다', () => {
        const a = { x: 1, y: 1 }, b = { x: 2, y: 2 }, c = { x: 3, y: 3 };
        expect(dongDotMarksOf({ dropoff: [a], pickup: [b], both: [c] })).toEqual([
            { at: a, fill: 'rgba(2,132,199,.42)' }, { at: b, fill: 'rgba(22,163,74,.45)' }, { at: c, fill: 'rgba(192,132,252,.5)' },
        ]);
    });
});

describe('상차 · 하차 띠 — 시작을 평평하게 자른다 (서버와 같은 aheadOf)', () => {
    /* 첫 구간이 옆으로 꺾인 띠 — 첫 구간으로 방향을 재면 끝점 방향과 다르다 */
    const BAND = [{ x: 127.30, y: 37.40 }, { x: 127.305, y: 37.40 }, { x: 127.30, y: 37.33 }, { x: 127.30, y: 37.25 }];
    it('🔴 상차 띠의 자르는 방향은 «첫 점 → 끝점» — 골목 한 구간이 영역을 돌리지 않게', () => {
        const t = pickupTraceOf({ me: BAND[0], meKm: 10, line: BAND, lineKm: 2, goals: [] }, P, 400, 600);
        expect(t.cut).toEqual(aheadCutOf([BAND[0], BAND[3]], 2, P, 400, 600));
        expect(t.cut).not.toEqual(aheadCutOf(BAND, 2, P, 400, 600));
        expect(t.band).toEqual(BAND.map(P));
    });
    it('🔴 상차 띠 끝은 둥글다(평평한 끝으로 대신하지 않는다) · 띠가 없으면 원을 통째로 칠한다', () => {
        const { ctx, log } = fakeCtx();
        tracePickup(ctx, pickupTraceOf({ me: BAND[0], meKm: 10, line: BAND, lineKm: 2, goals: [] }, P, 400, 600));
        expect(log).toContainEqual(['=lineCap', 'round']);
        expect(log.filter(l => l[0] === 'clip')).toHaveLength(2);   // 원 · 자르는 네모
        const whole = fakeCtx();
        tracePickup(whole.ctx, pickupTraceOf({ me: BAND[0], meKm: 10, line: null, lineKm: 2, goals: [] }, P, 400, 600));
        expect(whole.log.some(l => l[0] === 'fill')).toBe(true);
        expect(whole.log.some(l => l[0] === 'stroke')).toBe(false);
    });
    it('🔴 하차 띠는 띠 전체로 방향을 재 자른다', () => {
        const t = dropoffTraceOf({ circles: [], nearCircles: [], quads: [], lines: [{ points: BAND, km: 3 }] }, P, 400, 600);
        expect(t.lines[0].cut).toEqual(aheadCutOf(BAND, 3, P, 400, 600));
    });
    it('🔴 먼 목적지 조각에서 상차 영역을 지우고(destination-out) · 가까이 온 목적지 원은 지운 뒤에 칠한다', () => {
        const { ctx, log } = fakeCtx();
        const drop = dropoffTraceOf({ circles: [{ x: 127.4, y: 37.3, km: 5 }], nearCircles: [{ x: 127.5, y: 37.2, km: 5 }], quads: [], lines: [] }, P, 400, 600);
        paintDropoffMask(ctx, drop, pickupTraceOf({ me: BAND[0], meKm: 10, line: null, lineKm: 2, goals: [] }, P, 400, 600));
        const erase = log.findIndex(l => l[0] === '=globalCompositeOperation' && l[1] === 'destination-out');
        const arcAt = (x: number, y: number) => log.findIndex(l => l[0] === 'arc' && l[1] === P({ x, y }).cx && l[2] === P({ x, y }).cy);
        expect(arcAt(127.4, 37.3)).toBeGreaterThan(-1);
        expect(arcAt(127.4, 37.3)).toBeLessThan(erase);        // 먼 원이 먼저
        expect(arcAt(127.5, 37.2)).toBeGreaterThan(erase);     // 가까이 온 원은 지운 뒤
    });
});

describe('화면 맞춤 — 영역은 흔들리지 않는 네모로', () => {
    const area = (dx: number) => ({
        circles: [], nearCircles: [], lines: [], goals: [{ x: 127.6, y: 37.1 }],
        quads: [[{ x: 127.3 + dx, y: 37.3 }, { x: 127.5 + dx, y: 37.35 }, { x: 127.45 + dx, y: 37.2 }]],
    });
    const base = { validPoints: [{ x: 127.3, y: 37.4 }, { x: 127.5, y: 37.2 }], validPolyline: [], trail: [], driven: [], myLocation: { x: 127.31, y: 37.41 } };
    it('🔴 마름모 꼭짓점은 그대로 넣지 않는다 · 목적지는 넣는다', () => {
        const { allCoords } = fitCoordsOf({ ...base, prevFitBox: null, dropoffArea: area(0) });
        for (const q of area(0).quads[0]) expect(allCoords).not.toContainEqual(q);
        expect(allCoords).toContainEqual({ x: 127.6, y: 37.1 });
    });
    it('🔴 마름모가 조금 움직여 네모 안이면 네모를 다시 잡지 않는다', () => {
        const first = fitCoordsOf({ ...base, prevFitBox: null, dropoffArea: area(0) }).fitBox;
        expect(fitCoordsOf({ ...base, prevFitBox: first, dropoffArea: area(0.003) }).fitBox).toBe(first);
        expect(fitCoordsOf({ ...base, prevFitBox: first, dropoffArea: area(0.5) }).fitBox).not.toBe(first);
    });
});

describe('직선 보조선 — 경로선이 없을 때만', () => {
    const me = { x: 127.30, y: 37.40 }, stop = { x: 127.40, y: 37.30 };
    it('🔴 경로선이 있으면 보조선도 «직선 N km» 도 없다', () => {
        expect(straightGuideOf({ validPolyline: LINE, myLocation: me, validPoints: [stop] }, P)).toEqual({ path: null, label: null });
    });
    it('경로선이 없으면 현위치부터 정거장을 잇고 · 멀면 가운데에 «직선 N km»', () => {
        const g = straightGuideOf({ validPolyline: [], myLocation: me, validPoints: [stop] }, P);
        expect(g.path).toEqual([P(me), P(stop)]);
        expect(g.label?.text).toMatch(/^직선 \d+\.\dkm$/);
    });
    it('🔴 두 점이 가까우면(90px 아래) 글자를 안 쓴다 — 마커를 덮는다', () => {
        expect(straightGuideOf({ validPolyline: [], myLocation: me, validPoints: [{ x: 127.301, y: 37.401 }] }, P).label).toBeNull();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { effectiveRadii, lineFromPoint, lineUntil, quadOutline, quadShapeFrom, cityCenter, dongDotsOf } from '@onedal/shared';

/**
 * 🗺️ **무대 지도가 그리는 상차 · 하차 영역은 서버와 같은 shared 함수의 답이다** — 지도가 따로 계산하지 않는다 (규칙 ③).
 *
 * 무대(`StageView`)를 노드에서 그려, 지도(`PinnedRouteCanvas`)에 넘기는 `pickupArea` · `dropoffArea` · `dongDots` 를 잡는다.
 * 기대값은 shared 함수(`effectiveRadii` · `lineFromPoint` · `lineUntil` · `quadOutline` · `dongDotsOf`)로 따로 낸다.
 * 영역 셈이 어느 파일에 있든(무대 안 · 훅 · 순수 함수) 같은 답이어야 한다 — 그래서 무대를 그려 본다.
 * 못 잡는 것: 캔버스가 받은 값을 어떻게 칠하나(사진 몫) · 내 위치가 움직일 때 다시 계산하는 횟수 · 효과(useEffect) 안의 일.
 */
vi.hoisted(() => {
    const g = globalThis as any;
    const mem = new Map<string, string>();
    g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() };
});

const box = vi.hoisted(() => ({ canvas: null as any, derived: null as any, filter: null as any }));

vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});
vi.mock('../dashboard/PinnedRouteCanvas', () => ({ default: (p: any) => { box.canvas = p; return null; } }));
vi.mock('../../hooks/useRouteDerivations', () => ({ useRouteDerivations: () => box.derived }));
vi.mock('../../hooks/useFilterConfig', () => ({ useFilterConfig: () => ({ filter: box.filter, updateFilter: () => {} }) }));
vi.mock('../../hooks/useSidePanelRoom', () => ({ useSidePanelRoom: () => false }));
vi.mock('../dashboard/DepartureCountdown', () => ({ useDepartureDue: () => null }));
vi.mock('../dashboard/VehicleStatusPanel', () => ({ useDriveMotion: () => 'idle' }));
vi.mock('../dashboard/PinnedRoute', () => ({ PinnedRouteBody: () => null }));
vi.mock('../dashboard/JudgmentSeat', () => ({ default: () => null, UnreadableSeat: () => null }));
/* 시트는 상태바만 그린다 — 상태바가 그리다 터지지 않는지도 함께 본다 */
vi.mock('./StageSheet', () => ({ default: (p: any) => <div data-peek>{p.peekBar}</div> }));

import { ThemeProvider } from '@onedal/ui/theme';
import StageView from './StageView';

/** 내 위치 — 경기 광주 · 이천 사이. ~300m 눈금(1/300°) 위의 점이라 무대가 굳힌 값과 같다 */
const ME = { x: 38178 / 300, y: 11223 / 300 };
/** 지금 그리는 경로 선 — 내 뒤에서 시작해 이천 쪽으로 */
const LINE = [
    { x: 127.20, y: 37.45 }, { x: ME.x, y: ME.y }, { x: 127.33, y: 37.36 }, { x: 127.40, y: 37.30 }, { x: 127.47, y: 37.26 },
];
const DROP = { x: 127.40, y: 37.30 };

const call = (o: Record<string, unknown> = {}) => ({
    id: 'c1', status: 'ORDER_CONFIRMED', type: 'AUTO', goalCity: '이천시', pickup: '경기 광주시 경안동', dropoff: '경기 이천시 부발읍',
    pickupX: 127.25, pickupY: 37.42, dropoffX: DROP.x, dropoffY: DROP.y, ...o,
});

function setUp(o: { filter?: Record<string, unknown>; calls?: any[]; me?: { x: number; y: number } | null } = {}) {
    const calls = o.calls ?? [call()];
    box.filter = {
        goalCities: ['이천시'], pickupArea: { homeOn: false, homeCity: null }, dispatchPhase: 'GATHERING',
        pickupRadiusKm: 10, destinationRadiusKm: 8, detourRadiusKm: 3, quadRadiusKm: 25, srcAngleDeg: 110, dstAngleDeg: 110,
        pickupGroups: {}, destinationGroups: {}, ...o.filter,
    };
    box.derived = {
        liveRoute: calls, cycleDeck: calls, unifiedRoutePoints: [], myLocation: o.me === undefined ? ME : o.me,
        visitOrderMap: new Map(), drawHolder: { id: 'c1', routePolyline: LINE }, candidateHolder: null, routeHolder: null,
        judging: null, visitedTrail: [], drivenTrail: [], callColors: new Map(), etaMap: new Map(), stepRecords: [],
        callNoOf: () => 1,
    };
}

function draw(routeMode = true) {
    box.canvas = null;
    renderToStaticMarkup(<ThemeProvider>
        <StageView activeRoute={[]} routeStops={[{ orderId: 'c1', stopType: 'pickup' }, { orderId: 'c1', stopType: 'dropoff' }] as any}
            routeComputedAt={null} routeMode={routeMode} />
    </ThemeProvider>);
    return box.canvas as { pickupArea: any; dropoffArea: any; dongDots: any };
}

const toXY = (pts: Array<[number, number]>) => pts.map(([x, y]) => ({ x, y }));
const center = (city: string) => { const c = cityCenter(city); return { x: c.lng, y: c.lat }; };

describe('🗺️ 무대 지도 영역 — shared 함수와 같은 답', () => {
    beforeEach(() => setUp());

    it('🔴 반경은 effectiveRadii 의 값이다 — 자동 반경이면 줄인 값으로 그린다 (원값 · 제 손 곱셈 아님)', () => {
        setUp({ filter: { radiusAuto: true, radiusDistanceKm: 5, radiusBaseKm: 30, dispatchPhase: 'DELIVERING' } });
        const eff = effectiveRadii(box.filter);
        expect(eff.pickupRadiusKm).toBeLessThan(10);              // 이 문제지는 실제로 줄인다
        const c = draw();
        expect(c.pickupArea.meKm).toBeCloseTo(eff.pickupRadiusKm, 9);
        expect(c.pickupArea.lineKm).toBeCloseTo(eff.detourRadiusKm, 9);
        expect(c.dropoffArea.circles[0].km).toBeCloseTo(eff.destinationRadiusKm, 9);
        expect(c.dropoffArea.lines[0].km).toBeCloseTo(eff.detourRadiusKm, 9);
    });

    it('🔴 하차 영역 재료는 확정 콜만 — 판정 중 후보콜은 «마지막 하차지»가 되지 않는다', () => {
        /* 확정 콜이면 그 하차지까지 자른 라인 띠가 생긴다 */
        expect(draw().dropoffArea.lines).toHaveLength(1);
        /* 판정 중이면 그 목적지에 콜이 없는 것 — 라인 없이 현위치에서 마름모 */
        setUp({ calls: [call({ status: 'ORDER_SECURED_EVALUATING' })] });
        const c = draw();
        expect(c.dropoffArea.lines).toHaveLength(0);
        expect(c.dropoffArea.quads).toHaveLength(1);
    });

    it('🔴 목적지는 서버가 낸 goalCities 그대로 — 콜의 판으로 다시 세지 않는다', () => {
        setUp({ calls: [call({ goalCity: '여주시' })] });
        expect(draw().dropoffArea.goals).toEqual([center('이천시')]);
        setUp({ filter: { goalCities: ['이천시', '여주시'] } });
        expect(draw().dropoffArea.goals).toEqual([center('이천시'), center('여주시')]);
    });

    it('🔴 하차 띠 — 출발 전에는 마지막 하차지까지 통째로 · 출발 뒤에는 현위치부터 (lineFromPoint)', () => {
        const until = lineUntil(LINE, DROP);
        expect(draw().dropoffArea.lines[0].points).toEqual(until);
        setUp({ filter: { dispatchPhase: 'DELIVERING' } });
        const ahead = toXY(lineFromPoint(until.map(p => [p.x, p.y] as [number, number]), { lng: ME.x, lat: ME.y }));
        expect(ahead[0]).not.toEqual(LINE[0]);
        expect(draw().dropoffArea.lines[0].points).toEqual(ahead);
    });

    it('🔴 상차 띠 — 출발해야 생기고(pickupPartsOf) · 현위치부터 앞으로만 (lineFromPoint)', () => {
        const before = draw().pickupArea;
        expect(before.line).toBeNull();
        expect(before.me).toEqual(ME);
        setUp({ filter: { dispatchPhase: 'DELIVERING' } });
        expect(draw().pickupArea.line).toEqual(toXY(lineFromPoint(LINE.map(p => [p.x, p.y] as [number, number]), { lng: ME.x, lat: ME.y })));
    });

    it('🔴 동선(routeMode 끔)이면 라인을 안 쓴다 — 상차 띠 · 하차 띠가 없고 마름모는 현위치에서', () => {
        setUp({ filter: { dispatchPhase: 'DELIVERING' } });
        const c = draw(false);
        expect(c.pickupArea.line).toBeNull();
        expect(c.dropoffArea.lines).toHaveLength(0);
        const q = quadShapeFrom(box.filter);
        const eff = effectiveRadii(box.filter);
        const goal = cityCenter('이천시');
        const want = quadOutline({ srcAngleDeg: q.srcAngleDeg, dstAngleDeg: q.dstAngleDeg, quadRadiusKm: eff.quadRadiusKm,
            srcDiamKm: eff.pickupRadiusKm * 2, dstDiamKm: eff.destinationRadiusKm * 2 } as any,
            { name: '내 위치', lng: ME.x, lat: ME.y }, { name: '이천시', lng: goal.lng, lat: goal.lat }).map(p => ({ x: p.lng, y: p.lat }));
        expect(c.dropoffArea.quads).toEqual([want]);
    });

    it('🔴 마름모 모양은 평면 필터(quadShapeFrom)에서 — 국면 그릇(phaseSettings)은 안 본다', () => {
        const base = draw(false).dropoffArea.quads;
        setUp({ filter: { srcAngleDeg: 60 } });
        expect(draw(false).dropoffArea.quads).not.toEqual(base);
        setUp({ filter: { phaseSettings: { GATHERING: { srcAngleDeg: 60, dstAngleDeg: 60, quadRadiusKm: 5 } } } });
        expect(draw(false).dropoffArea.quads).toEqual(base);
    });

    it('🔴 동 점은 원달앱에 내려간 목록 그대로 — dongDotsOf(상차 목록 · 하차 목록)', () => {
        const pickupGroups = { '광주시': ['경안동', '송정동'] };
        const destinationGroups = { '이천시': ['부발읍'], '광주시': ['경안동'] };
        setUp({ filter: { pickupGroups, destinationGroups } });
        const dots = draw().dongDots;
        expect(dots).toEqual(dongDotsOf({ pickupGroups, dropoffGroups: destinationGroups }));
        expect(dots.both.length + dots.pickup.length + dots.dropoff.length).toBeGreaterThan(0);
    });

    it('🔴 목적지 가까이 오면 상차는 조각을 걷는다(현위치 원만) · 하차는 그 목적지 원을 «가까이 온 원»으로', () => {
        setUp({ filter: { dispatchPhase: 'DELIVERING' } });
        const far = draw();
        expect(far.pickupArea.line).not.toBeNull();
        expect(far.dropoffArea.nearCircles).toHaveLength(0);
        const g = center('이천시');
        const nearMe = { x: Math.round(g.x * 300) / 300, y: Math.round(g.y * 300) / 300 };
        setUp({ filter: { dispatchPhase: 'DELIVERING' }, me: nearMe });
        const near = draw();
        expect(near.pickupArea.line).toBeNull();
        expect(near.pickupArea.goals).toEqual([]);
        expect(near.dropoffArea.nearCircles).toHaveLength(1);
        expect(near.dropoffArea.circles).toHaveLength(0);
    });

    it('🔴 내 위치를 모르면 영역을 지어내지 않는다 — 안 그린다', () => {
        setUp({ me: null });
        const c = draw();
        expect(c.pickupArea).toBeNull();
        expect(c.dropoffArea).toBeNull();
    });

    it('상태바가 그려진다 — 콜이 있으면 시트 손잡이 줄이 빈 줄이 아니다', () => {
        const html = renderToStaticMarkup(<ThemeProvider>
            <StageView activeRoute={[]} routeStops={[{ orderId: 'c1', stopType: 'pickup' }] as any} routeComputedAt={null} routeMode />
        </ThemeProvider>);
        expect(html).toMatch(/data-peek/);
        expect(html).toMatch(/›/);
    });
});

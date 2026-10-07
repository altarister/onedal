import { describe, it, expect } from 'vitest';
import { cityCenter, lineFromPoint, lineUntil } from '@onedal/shared';
import { goalZonesFrom, nearZonesFrom, dropoffPartsByGoal, dropoffAreaFrom, pickupAreaFrom } from './useStageAreas';

/**
 * 🗺️ **무대 지도 영역의 순수 셈** — 값만 넣고 값을 본다 (훅 · 저장소 · 화면 없이).
 * 무대가 이 값을 지도에 실제로 넘기는지는 `components/stage/stageAreas.test.tsx` 가 무대를 그려 본다.
 * 못 잡는 것: memo 의 열쇠(무엇이 바뀌면 다시 셈하나) · 캔버스가 칠하는 모양.
 */
const ICHEON = cityCenter('이천시');
const ME = { x: 127.26, y: 37.41 };
const LINE = [{ x: 127.20, y: 37.45 }, { x: 127.26, y: 37.41 }, { x: 127.33, y: 37.36 }, { x: 127.40, y: 37.30 }, { x: 127.47, y: 37.26 }];
const RADII = { quadRadiusKm: 25, pickupRadiusKm: 10, destinationRadiusKm: 8, detourRadiusKm: 3 };
const QUAD = { srcAngleDeg: 110, dstAngleDeg: 110 };
const call = { id: 'c1', goalCity: '이천시', dropoffX: 127.40, dropoffY: 37.30 } as any;
const STOPS = [{ orderId: 'c1', stopType: 'pickup' }, { orderId: 'c1', stopType: 'dropoff' }] as any;
const zone = (o: Record<string, unknown> = {}) => ({ city: '이천시', isHome: false, hasCalls: false, ...o });
const parts = (o: Record<string, unknown> = {}) => dropoffPartsByGoal({
    zones: [zone()], meGridX: ME.x, meGridY: ME.y, dropoffLine: LINE, routeStops: STOPS, confirmedCalls: [call],
    homeOn: false, homeCity: null, quadShape: QUAD, radii: RADII, ...o,
});

describe('goalZonesFrom — 목적지마다 집인가 · 확정 콜이 있나', () => {
    it('집 시만 isHome · 그 판의 확정 콜이 있을 때만 hasCalls · 순서는 받은 그대로', () => {
        expect(goalZonesFrom({ goalCities: ['이천시', '광주시'], homeCity: '광주시', confirmedCalls: [{ goalCity: '이천시' }] })).toEqual([
            { city: '이천시', isHome: false, hasCalls: true },
            { city: '광주시', isHome: true, hasCalls: false },
        ]);
        expect(goalZonesFrom({ goalCities: ['이천시'], homeCity: null, confirmedCalls: [{ goalCity: '여주시' }] }))
            .toEqual([{ city: '이천시', isHome: false, hasCalls: false }]);
    });
});

describe('nearZonesFrom — 목적지 가까이 옴', () => {
    it('내 위치를 모르면 받은 그대로 · 목적지 반경 안이면 가까이 · 밖이면 멀다', () => {
        const base = [zone()];
        expect(nearZonesFrom({ base, meGridX: null, meGridY: ME.y, radii: { destinationRadiusKm: 8 } })).toBe(base);
        expect(nearZonesFrom({ base, meGridX: ICHEON.lng, meGridY: ICHEON.lat, radii: { destinationRadiusKm: 8 } })[0].nearGoal).toBe(true);
        expect(nearZonesFrom({ base, meGridX: ME.x, meGridY: ME.y, radii: { destinationRadiusKm: 8 } })[0].nearGoal).toBe(false);
    });
});

describe('dropoffPartsByGoal — 목적지마다 하차 조각', () => {
    it('내 위치를 모르면 null — 조각을 지어내지 않는다', () => {
        expect(parts({ meGridX: null })).toBeNull();
    });
    it('그 목적지에 확정 콜이 없으면 라인 없이 현위치에서 마름모', () => {
        const [p] = parts()!;
        expect(p.line).toBeNull();
        expect(p.quad).not.toBeNull();
        expect(p.center).toEqual({ x: ICHEON.lng, y: ICHEON.lat });
    });
    it('확정 콜이 있으면 라인은 마지막 하차지까지 자른 것 · 마름모는 그 하차지에서', () => {
        const [withCall] = parts({ zones: [zone({ hasCalls: true })] })!;
        expect(withCall.line).toEqual(lineUntil(LINE, { x: 127.40, y: 37.30 }));
        const [fromMe] = parts()!;
        expect(withCall.quad).not.toEqual(fromMe.quad);
    });
    it('확정 콜이 있어도 라인이 없으면(동선) 현위치에서 마름모 · 지도에 없는 시는 뺀다', () => {
        const [p] = parts({ zones: [zone({ hasCalls: true })], dropoffLine: null })!;
        expect(p.line).toBeNull();
        expect(p.quad).toEqual(parts()![0].quad);
        expect(parts({ zones: [zone({ city: '없는시' })] })).toEqual([]);
    });
    it('가까이 옴은 그대로 싣기만 한다 — 조각을 바꾸지 않는다', () => {
        const [near] = parts({ zones: [zone({ nearGoal: true })] })!;
        expect(near.nearGoal).toBe(true);
        expect(near.quad).toEqual(parts()![0].quad);
    });
});

describe('dropoffAreaFrom — 하차 영역', () => {
    const p = (o: Record<string, unknown> = {}) => ({ center: { x: 1, y: 2 }, nearGoal: false, line: null as any, quad: null as any, ...o });
    it('내 위치나 조각을 모르면 null', () => {
        expect(dropoffAreaFrom({ myLocation: null, dropoffParts: [p()], dropoffDeparted: false, radii: RADII })).toBeNull();
        expect(dropoffAreaFrom({ myLocation: ME, dropoffParts: null, dropoffDeparted: false, radii: RADII })).toBeNull();
    });
    it('먼 목적지는 circles · 가까이 온 목적지는 nearCircles — 반경은 목적지 반경', () => {
        const a = dropoffAreaFrom({ myLocation: ME, dropoffParts: [p(), p({ center: { x: 3, y: 4 }, nearGoal: true })], dropoffDeparted: false, radii: RADII })!;
        expect(a.circles).toEqual([{ x: 1, y: 2, km: 8 }]);
        expect(a.nearCircles).toEqual([{ x: 3, y: 4, km: 8 }]);
        expect(a.goals).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    });
    it('띠 — 출발 전에는 통째로 · 출발 뒤에는 현위치부터 · 굵기는 경유 반경', () => {
        const before = dropoffAreaFrom({ myLocation: ME, dropoffParts: [p({ line: LINE })], dropoffDeparted: false, radii: RADII })!;
        expect(before.lines).toEqual([{ points: LINE, km: 3 }]);
        const after = dropoffAreaFrom({ myLocation: ME, dropoffParts: [p({ line: LINE })], dropoffDeparted: true, radii: RADII })!;
        const ahead = lineFromPoint(LINE.map(q => [q.x, q.y] as [number, number]), { lng: ME.x, lat: ME.y }).map(([x, y]) => ({ x, y }));
        expect(after.lines).toEqual([{ points: ahead, km: 3 }]);
        expect(after.lines[0].points[0]).not.toEqual(LINE[0]);
    });
});

describe('pickupAreaFrom — 상차 영역', () => {
    const near = [zone()];
    it('내 위치나 목적지를 모르면 null', () => {
        expect(pickupAreaFrom({ myLocation: null, nearZones: near, pickupParts: { line: false, goalCities: [] }, pickupLine: null, radii: RADII })).toBeNull();
        expect(pickupAreaFrom({ myLocation: ME, nearZones: [], pickupParts: { line: false, goalCities: [] }, pickupLine: null, radii: RADII })).toBeNull();
    });
    it('띠가 없으면 원 전체(line null) · 있으면 현위치부터 앞으로 · 반경은 상차 · 경유 반경', () => {
        const whole = pickupAreaFrom({ myLocation: ME, nearZones: near, pickupParts: { line: false, goalCities: [] }, pickupLine: null, radii: RADII })!;
        expect(whole).toEqual({ me: ME, meKm: 10, goals: [], line: null, lineKm: 3 });
        const band = pickupAreaFrom({ myLocation: ME, nearZones: near, pickupParts: { line: true, goalCities: [] }, pickupLine: LINE, radii: RADII })!;
        expect(band.line).toEqual(lineFromPoint(LINE.map(q => [q.x, q.y] as [number, number]), { lng: ME.x, lat: ME.y }).map(([x, y]) => ({ x, y })));
    });
    it('조각이 넘긴 목적지 원을 더한다 — 지도에 없는 시는 뺀다', () => {
        const a = pickupAreaFrom({ myLocation: ME, nearZones: near, pickupParts: { line: false, goalCities: ['이천시', '없는시'] }, pickupLine: null, radii: RADII })!;
        expect(a.goals).toEqual([{ at: { x: ICHEON.lng, y: ICHEON.lat }, km: 8 }]);
    });
});

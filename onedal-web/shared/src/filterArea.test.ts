import { describe, it, expect } from 'vitest';
import { goalZonesOf, pickupPartsOf, nearGoalCitiesOf, dropoffPartsOf, lastDropOf, lineUntil, isNearGoal, withNearness, mergeDropoffGroups, dongDotsOf } from './filterArea';

/**
 * 🔵 **하차 목록 합치기**
 * 막는 것: 싣는 동에 내리는 콜이 새는 것 · 가까이 온 목적지의 관내콜이 빠지는 것 · 먼 도시의 같은 이름 동까지 빠지는 것.
 */
describe('🔵 하차 목록 — 목적지마다 합친다 (상차 목록은 빼지 않는다)', () => {
    const pickupList = { 광주시: ['초월읍', '곤지암읍'], 이천시: ['중리동'] };
    /**
     * 🔴 **상차 목록을 빼지 않는다** (기사님 확정 — *"하차지에서 상차지 빼는 것을 하지 말자"*).
     *
     * 하차 조각에서 **현위치 원(A)을 빼면** 하차 영역은 가는 방향(마름모 ∪ 목적지 원)만 담는다 —
     * 역방향이 애초에 안 든다. 그런데도 상차 목록을 빼면 **가는 방향의 동까지 같이 지워진다**:
     * 광주(집)에서 이천으로 갈 때 신둔면이 상차 반경 안이라는 이유로 하차에서 빠져
     * «광주 → 신둔면»(명백한 전진 콜)을 못 잡았다.
     */
    it('🔴 상차 목록 동도 그대로 남는다 — 가는 방향이면 싣는 곳 근처라도 내린다', () => {
        const r = mergeDropoffGroups([
            { nearGoal: false, grouped: { 광주시: ['초월읍', '곤지암읍'], 이천시: ['신둔면', '중리동'] }, progressKm: { 곤지암읍: 5, 신둔면: 12 } },
        ], pickupList);
        expect(r.grouped).toEqual({ 광주시: ['곤지암읍', '초월읍'], 이천시: ['신둔면', '중리동'] });
        expect(r.flat).toEqual(['곤지암읍', '신둔면', '중리동', '초월읍']);
        expect(r.progressKm).toEqual({ 곤지암읍: 5, 신둔면: 12 });   // 진행도 없는 동은 안 싣는다
    });
    it('🔴 가까이 온 목적지 동은 상차 목록과 겹쳐도 남는다 — 관내콜', () => {
        const r = mergeDropoffGroups([
            { nearGoal: true, grouped: { 이천시: ['중리동', '관고동'] }, progressKm: {} },
            { nearGoal: false, grouped: { 광주시: ['초월읍', '경안동'] }, progressKm: {} },
        ], pickupList);
        // 이제 먼 목적지에서도 안 빼므로 초월읍(상차 목록)도 남는다
        expect(r.grouped).toEqual({ 이천시: ['관고동', '중리동'], 광주시: ['경안동', '초월읍'] });
    });
    it('같은 동이 두 목적지에서 오면 한 번 · 어느 쪽에서든 진행도 없이 들었으면 진행도를 없앤다 (지나온 곳 빼기에 안 먹힌다)', () => {
        const r = mergeDropoffGroups([
            { nearGoal: false, grouped: { 이천시: ['신둔면'] }, progressKm: { 신둔면: 12 } },
            { nearGoal: false, grouped: { 이천시: ['신둔면', '사음동'] }, progressKm: { 사음동: 3 } },
        ], {});
        expect(r.grouped).toEqual({ 이천시: ['사음동', '신둔면'] });
        expect(r.progressKm).toEqual({ 사음동: 3 });
    });
    /** 🔴 상차 목록은 이제 아무것도 안 뺀다 — 같은 이름이든 다른 시든 그대로 남는다 */
    it('🔴 상차 목록에 같은 이름이 있어도 하차에서 안 지운다', () => {
        const r = mergeDropoffGroups([
            { nearGoal: false, grouped: { '서울 중구': ['중앙동'], 이천시: ['중리동'] }, progressKm: {} },
        ], { 광주시: ['중앙동'], 이천시: ['중리동'] });
        expect(r.grouped).toEqual({ '서울 중구': ['중앙동'], 이천시: ['중리동'] });
    });
    it('🔴 가까이 온 목적지에서 든 동은 진행도가 없다 — 먼 쪽 진행도가 있어도 지운다', () => {
        const r = mergeDropoffGroups([
            { nearGoal: true, grouped: { 이천시: ['중리동'] }, progressKm: {} },
            { nearGoal: false, grouped: { 이천시: ['신둔면'] }, progressKm: { 신둔면: 12 } },
        ], { 이천시: ['중리동'] });
        expect(r.flat).toEqual(['신둔면', '중리동']);
        expect(r.progressKm).toEqual({ 신둔면: 12 });
    });
});
import { cityCenter } from './callNet';

/**
 * 🎯 **목적지 가까이 옴 — 현위치가 그 목적지 영역 안인가**
 * 막는 것: 아직 목적지 영역 밖인데 «가까이 옴»으로 보는 것 · 「가까이 옴」이 재료를 끄는 것.
 * 좌표는 이천 왕복 시나리오 실값.
 */
describe('🎯 목적지 가까이 옴 — 현위치가 목적지 영역 안인가', () => {
    const TERMINAL = { x: 127.446936, y: 37.277421 };   // 이천터미널 — 이천 중심 1.2km
    const MODA = { x: 127.312587, y: 37.363298 };       // 모다아울렛 — 이천 중심 16km
    const ICHEON = cityCenter('이천시');

    it('🔴 이천터미널에 서 있으면 이천은 가까이 옴', () => {
        expect(isNearGoal({ me: TERMINAL, goal: ICHEON, destinationRadiusKm: 4.55 })).toBe(true);
    });
    it('🔴 모다아울렛이면 이천은 멀다 — 목적지 영역 밖이다', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, destinationRadiusKm: 4.55 })).toBe(false);
    });
    it('목적지 반경을 크게 두면(수동) 더 먼 곳에서도 가까이 옴 — 기사님 «수동으로 둘의 크기를 다르게 설정할 수 있어»', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, destinationRadiusKm: 20 })).toBe(true);
    });
    it('목적지마다 따로 — 이천에 와서 복귀를 켜면 이천은 가까이 옴 · 집(광주)은 멀다 · 모르는 시는 멀다로 둔다', () => {
        const z = withNearness([
            { city: '이천시', isHome: false, hasCalls: false },
            { city: '광주시', isHome: true, hasCalls: false },
            { city: '없는시', isHome: false, hasCalls: false },
        ], { me: TERMINAL, destinationRadiusKm: 4.55 });
        expect(z.map(g => g.nearGoal)).toEqual([true, false, false]);
    });

    /**
     * 🔴 **「가까이 옴」은 더하기만 한다** (기사님 확정) — 상차에 목적지 원을 더할 뿐,
     *    라인도 마름모도 끄지 않는다. 목적지에 닿아 콜을 다 내리면 경로가 없어져 라인이 저절로 사라진다.
     */
    it('🔴 가까이 와도 라인을 끄지 않는다 — 목적지 원을 더할 뿐이다', () => {
        const nearZone = [{ city: '이천시', isHome: false, hasCalls: true, nearGoal: true }];
        expect(pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: nearGoalCitiesOf(nearZone) }))
            .toEqual({ line: true, goalCities: ['이천시'] });
    });
    it('🔴 가까이 와도 하차 재료는 그대로다 — 라인이 있으면 라인 ∪ 마름모(마지막 하차지)', () => {
        expect(dropoffPartsOf(true)).toEqual({ line: true, quadFrom: 'lastDrop' });
    });
});

/* 🎯 목적지 눈금(필터값 ∪ 마지막 KEEP 콜의 목표값)은 `filterFacts.test.ts` 로 옮겼다 */

/* 🔵 하차 조각 눈금은 `filterFacts.test.ts` 로 옮겼다 — 조각은 사실 하나(라인이 있나)만 본다 */

describe('목적지마다 경로의 확정콜의 마지막 하차지 — 경로 순서에서 그 목적지 콜의 마지막 하차지', () => {
    const calls = [
        { id: 'a', goalCity: '이천시', dropoffX: 127.43, dropoffY: 37.28 },
        { id: 'b', goalCity: '광주시', dropoffX: 127.30, dropoffY: 37.37 },
        { id: 'c', goalCity: '이천시', dropoffX: 127.41, dropoffY: 37.29 },
    ];
    const stops = [
        { orderId: 'a', stopType: 'pickup' as const }, { orderId: 'b', stopType: 'pickup' as const },
        { orderId: 'c', stopType: 'dropoff' as const }, { orderId: 'a', stopType: 'dropoff' as const },
        { orderId: 'b', stopType: 'dropoff' as const },
    ];
    const home = { homeOn: true, homeCity: '광주시' };
    it('목적지 쪽은 목적지 콜 중 가장 뒤에 내리는 곳 (a) · 집 쪽은 집 콜 (b)', () => {
        expect(lastDropOf({ isHome: false, ...home, stops, calls })).toEqual({ x: 127.43, y: 37.28 });
        expect(lastDropOf({ isHome: true, ...home, stops, calls })).toEqual({ x: 127.30, y: 37.37 });
    });
    it('복귀 끔이면 모든 콜이 목적지 콜 — 마지막 하차지는 b', () => {
        expect(lastDropOf({ isHome: false, homeOn: false, homeCity: '광주시', stops, calls })).toEqual({ x: 127.30, y: 37.37 });
    });
    it('그 목적지 하차 정거장이 없거나 좌표를 모르면 null — 지어내지 않는다', () => {
        expect(lastDropOf({ isHome: true, ...home, stops: stops.slice(0, 4), calls })).toBeNull();
        expect(lastDropOf({ isHome: true, ...home, stops, calls: calls.map(c => ({ ...c, dropoffX: undefined })) })).toBeNull();
    });
});

/**
 * 📍 **지도 동 점**
 * 막는 것: 지도 점이 원달앱에 내려간 목록과 다른 것 · 같은 이름의 다른 동에 점이 찍히는 것.
 */
describe('📍 동 점 — 원달앱에 내려간 목록을 «시·군·구 + 동»으로 찍는다', () => {
    it('🔴 상차만 · 하차만 · 둘 다를 가른다 — 좌표는 동 중심점', () => {
        const r = dongDotsOf({ pickupGroups: { 광주시: ['초월읍', '곤지암읍'] }, dropoffGroups: { 광주시: ['곤지암읍'], 이천시: ['중리동'] } });
        expect(r.pickup.map(d => d.name)).toEqual(['초월읍']);
        expect(r.dropoff.map(d => d.name)).toEqual(['중리동']);
        expect(r.both.map(d => d.name)).toEqual(['곤지암읍']);
        expect(r.dropoff[0]).toMatchObject({ x: 127.44073, y: 37.27423 });
        expect(r.missing).toBe(0);
    });
    it('🔴 이름이 같아도 다른 시·군·구면 안 찍는다 — 좌표를 모르는 동은 센다 (지어내지 않는다 · 규칙 ④)', () => {
        const r = dongDotsOf({ pickupGroups: {}, dropoffGroups: { 광주시: ['중리동'] } });
        expect(r.dropoff).toEqual([]);
        expect(r.missing).toBe(1);
    });
});

describe('라인을 확정콜의 마지막 하차지까지 자른다', () => {
    const line = [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.02, y: 0 }, { x: 0.03, y: 0 }];
    it('확정콜의 마지막 하차지에서 가장 가까운 점까지', () => {
        expect(lineUntil(line, { x: 0.019, y: 0.001 })).toEqual(line.slice(0, 3));
    });
    it('🔴 같은 곳을 두 번 지나면 뒤에 지나는 쪽까지 — 앞 통과에서 자르면 되돌아오는 라인을 잃는다 (D3 · 리뷰 2026-09-15)', () => {
        const back = [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.02, y: 0 }, { x: 0.01, y: 0.0001 }, { x: 0, y: 0.0002 }];
        expect(lineUntil(back, { x: 0.01, y: 0 })).toEqual(back.slice(0, 4));
    });
    it('끝점이 확정콜의 마지막 하차지면 통째로 · 점이 둘보다 적으면 빈 라인', () => {
        expect(lineUntil(line, { x: 0.03, y: 0 })).toEqual(line);
        expect(lineUntil([{ x: 0, y: 0 }], { x: 0, y: 0 })).toEqual([]);
    });
});

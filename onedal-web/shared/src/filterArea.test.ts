import { describe, it, expect } from 'vitest';
import { goalZonesOf, pickupShapeOf, dropoffPartsOf, lastDropOf, lineUntil, isNearGoal, withNearness, mergeDropoffGroups, dongDotsOf } from './filterArea';

/**
 * 🔵 **하차 목록 합치기** (`docs/지금/필터.md` «하차 영역»)
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
 * 🎯 **목적지 가까이 옴** (`docs/지금/필터.md` «필터 영역»)
 * 막는 것: 마름모가 두 원 밖으로 나가는데 «가까이 옴»으로 보는 것 · 가까이 온 목적지에서 상차 · 하차 영역이 좁혀지는 것.
 * 좌표는 이천 왕복 시나리오 실값 · 반경 · 모양은 그때 자동 반경이 준 값.
 */
describe('🎯 목적지 가까이 옴 — 마름모가 두 원 안에 통째로', () => {
    const TERMINAL = { x: 127.446936, y: 37.277421 };   // 이천터미널 — 이천 중심 1.2km
    const MODA = { x: 127.312587, y: 37.363298 };       // 모다아울렛 — 이천 중심 16km
    const ICHEON = cityCenter('이천시');
    const params = { srcAngleDeg: 120, dstAngleDeg: 120, quadRadiusKm: 15.9, srcDiamKm: 4.55 * 2, dstDiamKm: 4.55 * 2 };
    it('🔴 이천터미널에 서 있으면 이천은 가까이 옴', () => {
        expect(isNearGoal({ me: TERMINAL, goal: ICHEON, params })).toBe(true);
    });
    it('🔴 모다아울렛이면 이천은 멀다 — 마름모가 두 원 밖으로 넓게 나간다', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, params })).toBe(false);
    });
    it('반경을 크게 두면(수동) 더 먼 곳에서도 가까이 옴 — 기사님 «수동으로 둘의 크기를 다르게 설정할 수 있어»', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, params: { ...params, quadRadiusKm: 2, srcDiamKm: 24, dstDiamKm: 24 } })).toBe(true);
    });
    it('목적지마다 따로 — 이천에 와서 복귀를 켜면 이천은 가까이 옴 · 집(광주)은 멀다 · 모르는 시는 멀다로 둔다', () => {
        const z = withNearness([
            { city: '이천시', isHome: false, state: 'idle' },
            { city: '광주시', isHome: true, state: 'idle' },
            { city: '없는시', isHome: false, state: 'idle' },
        ], { me: TERMINAL, params });
        expect(z.map(g => g.nearGoal)).toEqual([true, false, false]);
    });
    /* 🔄 «가까이 오면 A 전체»는 기사님이 「나」안으로 바꾸셨다 — **A ∩ 목적지 원**.
       A 전체면 권역 밖 뒤쪽이 통과한다 (복정에서 26.5km 뒤 도척면). 눈금은 `nearGoalPickup.test.ts` */
    it('🔴 가까이 온 목적지가 있으면 운행 중이어도 라인으로 안 자른다 — 대신 목적지 원과 겹친 곳', () => {
        expect(pickupShapeOf([{ city: '이천시', isHome: false, state: 'driving', nearGoal: true }])).toBe('meGoal');
        expect(pickupShapeOf([{ city: '이천시', isHome: false, state: 'driving', nearGoal: false }])).toBe('meLine');
    });
    it('🔴 가까이 온 목적지의 하차 조각은 목적지 원뿐 — 현위치 원 · 라인 · 마름모 없음', () => {
        expect(dropoffPartsOf('driving', true, true)).toEqual({ me: false, line: false, quadFrom: null });
        expect(dropoffPartsOf('idle', false, true)).toEqual({ me: false, line: false, quadFrom: null });
    });
});

/**
 * 🧩 **필터 영역 — 살아 있는 목적지마다 상태 셋** (`docs/지금/필터.md` «필터 영역» · «상차 영역» · «하차 영역»).
 * 막는 것: 목적지 · 집이 살아야 할 때 죽거나 그 반대 · 상태에 맞지 않는 상차 도형.
 *
 * | 그 목적지의 상태 | 필터 영역 | 상차 영역 |
 * | 콜 없음 (idle)            | A ∪ Q(현위치→목적지) ∪ 목적지 영역 | A |
 * | 경로 생김 · 운행 전 (routed) | A ∪ 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 영역 | A |
 * | 운행 뒤 (driving)         | (A ∩ 라인) ∪ 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 영역 | A ∩ 라인 |
 *
 * 살아 있는 목적지: 목적지 = 복귀 끔 · 복귀콜 아직 못 잡음 · 목적지 콜 남음 / 집 = 복귀 켬
 */
const base = { destinationCity: '이천시', homeCity: '광주시', homeOn: false, homeCaught: false, departed: false };
const destCall = { goalCity: '이천시' };
const homeCall = { goalCity: '광주시' };

describe('살아 있는 목적지와 상태 — 기사님이 적은 경우 그대로', () => {
    it('콜 없음 → 목적지 하나 · 콜 없음 · 상차는 A', () => {
        const z = goalZonesOf({ ...base, activeCalls: [] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'idle' }]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('콜을 잡아 경로가 생김 (운행 전) → 상차는 A 전체', () => {
        const z = goalZonesOf({ ...base, activeCalls: [destCall] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'routed' }]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('운행 시작 뒤 → 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, departed: true, activeCalls: [destCall] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'driving' }]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
    it('🔴 운행 뒤 · 목적지 콜 남음 · 복귀 켬 → 집은 «콜 없음»이라 상차는 A 전체', () => {
        const z = goalZonesOf({ ...base, homeOn: true, departed: true, activeCalls: [destCall] });
        expect(z).toEqual([
            { city: '이천시', isHome: false, state: 'driving' },
            { city: '광주시', isHome: true, state: 'idle' },
        ]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('🔴 위 + 집 가는 콜 잡음 → 목적지 콜이 남았으니 목적지도 산다 · 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, departed: true, activeCalls: [destCall, homeCall] });
        expect(z).toEqual([
            { city: '이천시', isHome: false, state: 'driving' },
            { city: '광주시', isHome: true, state: 'driving' },
        ]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
    it('목적지 콜 끝 · 복귀 켬 · 집 가는 콜 잡음 → 집만 · 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, departed: true, activeCalls: [homeCall] });
        expect(z).toEqual([{ city: '광주시', isHome: true, state: 'driving' }]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
});

describe('표에 안 적힌 경우 — 같은 규칙으로', () => {
    it('복귀 켬 · 복귀콜 아직 없음 · 콜 0건 → 목적지 ∪ 집 · 둘 다 콜 없음 (관내 가까운 콜도 하자)', () => {
        const z = goalZonesOf({ ...base, homeOn: true, activeCalls: [] });
        expect(z.map(g => [g.city, g.state])).toEqual([['이천시', 'idle'], ['광주시', 'idle']]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('복귀콜을 잡았다 내렸고 둘째를 아직 못 잡음 → 집만 · 콜 없음 (목적지는 다시 안 산다)', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, activeCalls: [] });
        expect(z).toEqual([{ city: '광주시', isHome: true, state: 'idle' }]);
    });
    it('🏘️ 관내는 따로 없다 — 목적지에서 콜을 다 내리면 그냥 «콜 없음»', () => {
        expect(goalZonesOf({ ...base, activeCalls: [] })[0].state).toBe('idle');
    });
});

describe('모르는 값은 지어내지 않는다 (규칙 ④)', () => {
    it('목적지를 모르면 목적지가 없다 · 상차 도형도 없다', () => {
        const z = goalZonesOf({ ...base, destinationCity: null, activeCalls: [] });
        expect(z).toEqual([]);
        expect(pickupShapeOf(z)).toBeNull();
    });
    it('복귀 켬인데 집을 모르면 목적지만 — 서버 `goalCitiesOf` 와 같다', () => {
        const z = goalZonesOf({ ...base, homeCity: null, homeOn: true, activeCalls: [destCall] });
        expect(z.map(g => g.city)).toEqual(['이천시']);
    });
});

/**
 * 🔵 **하차 조각에는 현위치 원(A)을 넣지 않는다** (기사님 확정).
 *
 * A 는 사방으로 퍼진 원이라 뒤쪽 동까지 하차 후보가 됐고, 그것을 «상차 목록 빼기»로 지웠다.
 * 그런데 상차 목록도 A 라서 **A 를 넣었다가 A 를 도로 빼는 꼴**이었고, 그 과정에서
 * A 와 마름모가 겹치는 **가는 방향의 동(신둔면)까지 함께 지워졌다.**
 * A 를 아예 안 넣으면 하차 영역이 «마름모 ∪ 목적지 원»만 남아 방향이 저절로 지켜지고,
 * 빼기도 필요 없어진다.
 */
describe('🔵 하차 영역 — 목적지 하나에 넣는 조각 (목적지 원은 늘 넣는다 · 현위치 원은 안 넣는다)', () => {
    it('콜 없음: 현위치→목적지 마름모 (현위치 원은 안 넣는다)', () => {
        expect(dropoffPartsOf('idle', false)).toEqual({ me: false, line: false, quadFrom: 'me' });
    });
    it('경로 생김 (운행 전): 라인 ∪ 확정콜의 마지막 하차지→목적지 마름모', () => {
        expect(dropoffPartsOf('routed', true)).toEqual({ me: false, line: true, quadFrom: 'lastDrop' });
    });
    it('운행 뒤: 라인 ∪ 확정콜의 마지막 하차지→목적지 마름모 — (A ∩ 라인)은 라인 안이라 현위치 원은 안 넣는다', () => {
        expect(dropoffPartsOf('driving', true)).toEqual({ me: false, line: true, quadFrom: 'lastDrop' });
    });
    it('🔷 라인이 없으면(동선 · 경로를 모름) 라인을 지어내지 않는다 — 마름모는 현위치에서', () => {
        expect(dropoffPartsOf('routed', false)).toEqual({ me: false, line: false, quadFrom: 'me' });
    });
    it('🔴 운행 뒤에는 라인이 없어도 현위치 원을 다시 넣지 않는다 — 운행 뒤 하차 영역에 A 가 없다 (리뷰 2026-09-15)', () => {
        /* 상차가 A ∩ 라인이면 라인 밖 A 동이 안 빠져 «뒤쪽 동에 내리는 콜»이 샌다 */
        expect(dropoffPartsOf('driving', false)).toEqual({ me: false, line: false, quadFrom: 'me' });
    });
});

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

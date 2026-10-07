// @ts-nocheck
import { processDriverMovement, originOf, getActivePolyline, getLastDropoffCoord } from '../../src/services/geoMotion';
import { getDetourRegions, pickupListFor, regionsTouchingCircleGrouped } from '../../src/services/geoRegions';
import { initGeoService } from '../../src/services/geoService';
import * as gpsTrackStore from '../../src/services/gpsTrackStore';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { DEFAULT_JUDGMENT, cityCenter, haversineKm } from '@onedal/shared';

/**
 * 🧭 **GPS 한 틱 · 기점 · 경로 · 지역 셈 규칙을 동작으로 문다** — processDriverMovement 를 세션 · 콜과 함께 불러
 * 도착 · 근접 예고 · 떠남 · 지나침 · 지나온 곳 빼기 · 정차 줄 · 궤적 · 받은 시각/출처를 보고, 기점 고르기 ·
 * 쓰는 경로 · 상차 목록 조각 겹침 · 경로 둘레 진행도를 값으로 본다.
 * 규칙마다 «안 일어나야 함 + 일어나야 함». 시각은 고정해 두고 틱마다 직접 민다. 소스 글자로 보면 파일을 나눌 때 옮긴 글자를 따라가 동작이 바뀌어도 초록이다.
 */
const T0 = Date.parse('2026-10-07T03:00:00.000Z');
const P = { x: 127.40, y: 37.30 };                       // 상차지
const D = { x: 127.40, y: 37.40 };                       // 하차지 (북쪽 약 11km)
const north = (pt, km) => ({ x: pt.x, y: pt.y + km / 111.0 });
const HOME = { x: 127.29444, y: 37.37669, address: '경기 광주시 초월읍' };

let now = T0;
let ev;
beforeAll(() => { initGeoService(); });
beforeEach(() => {
    now = T0;
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'hrtime', 'performance'] });
    jest.spyOn(SettingsRepository, 'getHomeLocation').mockReturnValue(HOME);
    jest.spyOn(gpsTrackStore, 'bufferGpsPoint').mockImplementation(() => {});
    ev = { filter: [], trim: [], arrival: [], approach: [], departed: [], passed: [] };
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

function make(u, status = 'ORDER_CONFIRMED', phase = 'GATHERING') {
    clearUserSession(u);
    const s = getUserSession(u);
    s.myOrders = [{ id: `${u}-c1`, status, pickupX: P.x, pickupY: P.y, dropoffX: D.x, dropoffY: D.y, routePolyline: [P, D] }];
    s.activeFilter.dispatchPhase = phase;
    return s;
}
/** 한 틱 — 시각을 secs 만큼 민 뒤 좌표 하나를 넣는다 */
function tick(u, s, pt, { secs = 60, source = 'mock', stopped = false, mult } = {}) {
    now += secs * 1000;
    jest.setSystemTime(now);
    processDriverMovement(u, pt.y, pt.x, s,
        (uid, f) => ev.filter.push(f), (uid) => ev.trim.push(uid), source,
        (uid, st) => ev.arrival.push(`${st.orderId.split('-').pop()}:${st.stopType}`),
        (uid, st, km) => ev.approach.push(`${st.stopType}`),
        (uid, orderId) => ev.departed.push(orderId),
        (uid, st) => ev.passed.push(`${st.stopType}`),
        mult, stopped);
}

describe('🏁 도착 · 근접 예고', () => {
    it('🔴 한 정거장은 한 번만 찍는다 — 500m 안에서 서 있어도 두 번째 틱은 아무 일 없음', () => {
        const s = make('m-once');
        tick('m-once', s, north(P, -5));
        tick('m-once', s, P, { stopped: true });
        expect(ev.arrival).toEqual(['c1:pickup']);
        tick('m-once', s, north(P, 0.05), { secs: 5, stopped: true });
        expect(ev.arrival).toEqual(['c1:pickup']);
        expect(s.arrivalFired.has('m-once-c1:pickup')).toBe(true);
    });

    it('🔴 근접 예고(3km)는 다음 정거장마다 한 번', () => {
        const s = make('m-notice');
        tick('m-notice', s, north(P, -5));
        expect(ev.approach).toEqual([]);
        tick('m-notice', s, north(P, -2));
        tick('m-notice', s, north(P, -1.5));
        expect(ev.approach).toEqual(['pickup']);
    });

    it('🔴 짐을 안 실은 콜의 하차지는 도착이 아니다 · 실은 뒤에는 도착이다', () => {
        const s = make('m-unloaded');
        tick('m-unloaded', s, north(D, -5));
        tick('m-unloaded', s, D, { stopped: true });
        expect(ev.arrival).toEqual([]);
        const t = make('m-loaded', 'ORDER_PICKED_UP');
        tick('m-loaded', t, north(D, -5));
        tick('m-loaded', t, D, { stopped: true });
        expect(ev.arrival).toEqual(['c1:dropoff']);
    });

    it('🔴 위치가 튄 틱은 도착을 판단하지 않고 정지 유지 스톱워치를 비운다', () => {
        const s = make('m-jump');
        tick('m-jump', s, north(P, -20));
        s.arrivalHeld.set('m-jump-c1:pickup', now);
        tick('m-jump', s, P, { secs: 2, stopped: true });   // 20km 를 2초에 — 점프
        expect(ev.arrival).toEqual([]);
        expect(s.arrivalHeld.size).toBe(0);
        tick('m-jump', s, north(P, 0.01), { secs: 60, stopped: true });
        expect(ev.arrival).toEqual(['c1:pickup']);
    });
});

describe('🚚 떠남 · 지나침', () => {
    it('🔴 하차 도착 → 하차 중 알림 · 2km 멀어지면 떠남 한 번 · 상차 도착은 떠남 감시 안 함', () => {
        const s = make('m-depart', 'ORDER_PICKED_UP');
        tick('m-depart', s, north(D, -5));
        tick('m-depart', s, D, { stopped: true });
        expect(ev.filter).toContainEqual({ driverAction: 'UNLOADING' });
        tick('m-depart', s, north(D, 2.5), { secs: 600 });
        tick('m-depart', s, north(D, 5), { secs: 600 });
        expect(ev.departed).toEqual(['m-depart-c1']);
        ev.filter = [];
        const p = make('m-depart-p');
        tick('m-depart-p', p, north(P, -5));
        tick('m-depart-p', p, P, { stopped: true });
        expect(ev.arrival).toContain('c1:pickup');
        expect(p.departWatch.size).toBe(0);
        expect(ev.filter).not.toContainEqual({ driverAction: 'UNLOADING' });
    });

    it('🔴 도착을 450m 에서 찍으면 «들어왔다»가 아니다 — 420m 로 멀어져도 지나침이 아니다 · 들어왔다 나가면 지나침', () => {
        const s = make('m-pass450');
        tick('m-pass450', s, north(P, -5));
        tick('m-pass450', s, north(P, -0.45), { stopped: true });
        expect(ev.arrival).toEqual(['c1:pickup']);
        expect(s.passWatch.get('m-pass450-c1:pickup')).toMatchObject({ entered: false });
        tick('m-pass450', s, north(P, 0.42));
        expect(ev.passed).toEqual([]);
        tick('m-pass450', s, north(P, 0.1));
        tick('m-pass450', s, north(P, 0.5));
        expect(ev.passed).toEqual(['pickup']);
    });

    it('🔴 지나침 거리는 판정 기준(세션)에서 — 100m 진입 · 200m 이탈이면 250m 에서 지나침', () => {
        const run = (u, pass) => {
            const s = make(u);
            if (pass) s.judgment = { ...DEFAULT_JUDGMENT, pass };
            tick(u, s, north(P, -5));
            tick(u, s, north(P, -0.05));
            tick(u, s, north(P, 0.25));
            return ev.passed.splice(0);
        };
        expect(run('m-pass-cfg', { nearM: 100, awayM: 200 })).toEqual(['pickup']);
        expect(run('m-pass-def', null)).toEqual([]);
    });
});

describe('🔄 지나온 곳 빼기 · 정차 · 궤적 · 받은 좌표', () => {
    it('🔴 운행 중 0.5km 넘게 움직이면 지나온 곳 빼기 통로를 부른다 — 필터 변경({})은 안 부른다 · 모으는 중엔 안 부른다', () => {
        const s = make('m-trim', 'ORDER_PICKED_UP', 'DELIVERING');
        tick('m-trim', s, north(P, 1));
        tick('m-trim', s, north(P, 2));
        expect(ev.trim).toEqual(['m-trim', 'm-trim']);
        expect(ev.filter).not.toContainEqual({});
        ev.trim = [];
        const g = make('m-trim-g', 'ORDER_PICKED_UP', 'GATHERING');
        tick('m-trim-g', g, north(P, 1));
        tick('m-trim-g', g, north(P, 2));
        expect(ev.trim).toEqual([]);
    });

    it('🔴 정차는 시작 · 끝 두 줄 — 매 틱이 아니다', () => {
        const s = make('m-stop');
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        tick('m-stop', s, north(P, -5));
        tick('m-stop', s, north(P, -5), { secs: 10, stopped: true });
        tick('m-stop', s, north(P, -5), { secs: 10, stopped: true });
        tick('m-stop', s, north(P, -4), { secs: 60 });
        const lines = log.mock.calls.map(c => String(c[0]));
        expect(lines.filter(l => l.includes('[정차 시작]')).length).toBe(1);
        expect(lines.filter(l => l.includes('[정차 끝]')).length).toBe(1);
    });

    it('🔴 받은 시각과 출처를 «온 그대로» 적는다 — 모르는 출처는 지어내지 않는다', () => {
        const s = make('m-src');
        tick('m-src', s, north(P, -5), { source: 'native' });
        expect(s.lastFixAt).toBe(now);
        expect(s.lastFixSource).toBe('gps');
        tick('m-src', s, north(P, -4), { source: 'mock' });
        expect(s.lastFixSource).toBe('mock');
        tick('m-src', s, north(P, -3), { source: 'weird' });
        expect(s.lastFixSource).toBeUndefined();
    });

    it('🔴 궤적 — 서 있으면 같은 자리도 남긴다 · 속도는 배속으로 나눈 값', () => {
        const s = make('m-track');
        const buf = gpsTrackStore.bufferGpsPoint;
        tick('m-track', s, north(P, -5));
        buf.mockClear();
        /* 5초 · 같은 자리 — 거리 · 시간 문턱 둘 다 안 넘는다. 서 있다는 사실만으로 남긴다 */
        tick('m-track', s, north(P, -5), { secs: 5 });
        expect(buf).not.toHaveBeenCalled();
        tick('m-track', s, north(P, -5), { secs: 5, stopped: true });
        expect(buf).toHaveBeenCalledTimes(1);
        buf.mockClear();
        tick('m-track', s, north(P, -4), { secs: 60, mult: 10 });   // 1km/60초 = 60km/h · 배속 10
        expect(buf.mock.calls[0][1]).toMatchObject({ speedKmh: 6, speedMultiplier: 10 });
    });
});

describe('📍 기점 · 경로', () => {
    it('🔴 가짜 좌표는 콜을 쥔 동안에만 기점 — 빈 차면 집으로 물러선다(대신 쓴 표시) · 고르기만 하고 세션을 안 바꾼다', () => {
        const s = make('m-origin', 'ORDER_CONFIRMED', 'GATHERING');
        Object.assign(s, { lastFix: P, lastFixAt: T0, lastFixIsMock: true, lastFixSource: 'mock' });
        const before = JSON.stringify({ ...s, myOrders: s.myOrders });
        expect(originOf(s, T0)).toMatchObject({ x: P.x, y: P.y, source: 'mock', isFallback: false });
        s.activeFilter.dispatchPhase = 'STANDBY';
        expect(originOf(s, T0)).toMatchObject({ x: HOME.x, y: HOME.y, source: 'home', isFallback: true });
        s.activeFilter.dispatchPhase = 'GATHERING';
        expect(JSON.stringify({ ...s, myOrders: s.myOrders })).toBe(before);
    });

    it('🔴 쓰는 경로는 마지막 진행 콜의 경로 · 마지막 하차지는 그 경로의 끝점', () => {
        const s = make('m-poly');
        const second = [north(P, 1), north(P, 2), north(P, 3)];
        s.myOrders.push({ id: 'm-poly-c2', status: 'ORDER_CONFIRMED', pickupX: P.x, pickupY: P.y, dropoffX: 0, dropoffY: 0, routePolyline: second });
        expect(getActivePolyline(s)).toEqual(second);
        expect(getLastDropoffCoord(s)).toEqual(second[2]);
    });
});

describe('📋 상차 목록 — 켜진 조각을 전부 겹친다(∩)', () => {
    it('🔴 목적지 가까이 오면 현위치 원 ∩ 목적지 원 — 목적지 원 밖 동은 현위치 원 안이어도 안 든다', () => {
        const g = cityCenter('이천시');
        const me = { x: g.lng + 0.03, y: g.lat };   // 목적지 중심에서 동쪽 약 2.7km
        const radii = { pickupRadiusKm: 6, detourRadiusKm: 0, destinationRadiusKm: 1.5 };
        const meOnly = pickupListFor({ me, radii, line: null, parts: { line: false, goalCities: [] } }).list;
        const both = pickupListFor({ me, radii, line: null, parts: { line: false, goalCities: ['이천시'] } }).list;
        const ring = new Set(Object.values(regionsTouchingCircleGrouped({ lng: g.lng, lat: g.lat }, 1.5)).flat());
        expect(both.length).toBeGreaterThan(0);
        expect(both.length).toBeLessThan(meOnly.length);
        for (const n of both) expect(meOnly).toContain(n);
        expect(meOnly.some(n => !ring.has(n))).toBe(true);
    });
});

describe('🗺️ 경로 둘레 진행도', () => {
    const MODA = { x: 127.312587, y: 37.363298 };
    const TERMINAL = { x: 127.446936, y: 37.277421 };
    it('🔴 동마다 진행도를 함께 낸다 — 하차지 둘레 동은 끝까지 남기고(무한) · 넓은 동은 중심보다 늦게 뺀다', () => {
        const line = [MODA, TERMINAL];
        const r = getDetourRegions(line, 2, 5);
        expect(r.flat.length).toBeGreaterThan(3);
        expect(r.progressKm['중리동']).toBe(Infinity);
        const finite = Object.entries(r.progressKm).filter(([, v]) => v != null && Number.isFinite(v));
        expect(finite.length).toBeGreaterThan(1);
        /* 넓은 동은 그 동 «경로상 자리»(orderKm)보다 늦게 — 동의 반지름만큼 여유 */
        for (const [name, v] of finite) expect(v).toBeGreaterThan(r.orderKm[name]);
    });
});

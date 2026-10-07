// @ts-nocheck
import { movementFrom, fixSourceOf, originFixFrom, DRIVER_LOCATION_STALE_MS, MOCK_GPS_OWNER_QUIET_MS } from '../../src/services/geoMotion';

/**
 * 🧮 **GPS 셈을 값만 넣어 문다** — movementFrom · fixSourceOf · originFixFrom 은 세션 · 설정 · 지금 시각을 안 읽는다.
 * 규칙마다 «안 일어나야 함 + 일어나야 함». GPS 틱을 끝까지 돌리는 검사는 geoRules.
 */
const A = { x: 127.40, y: 37.30 };
const north = (km) => ({ x: A.x, y: A.y + km / 111.0 });
const T = 1_000_000;

describe('🚗 한 틱의 움직임 — 값만', () => {
    it('🔴 거리 · 걸린 초 · 속도', () => {
        const m = movementFrom(A, T, north(1), T + 60_000, 'native');
        expect(m.movedKm).toBeCloseTo(1, 1);
        expect(m.elapsedS).toBe(60);
        expect(m.kmh).toBeCloseTo(60, 0);
        expect(m.teleported).toBe(false);
        expect(m.tooFast).toBe(false);
    });

    it('🔴 순간 이동 — 5km 이상을 30초 안에 · 30초 넘으면 아님', () => {
        expect(movementFrom(A, T, north(6), T + 10_000, 'native').teleported).toBe(true);
        expect(movementFrom(A, T, north(6), T + 40_000, 'native').teleported).toBe(false);
        expect(movementFrom(A, T, north(1), T + 10_000, 'native').teleported).toBe(false);   // 30초 안이어도 5km 아래면 아님
    });

    it('🔴 너무 빠름 — 200km/h 넘고 표본이 쓸 만할 때만 · 모의는 안 본다 · 표본이 작으면 안 본다', () => {
        expect(movementFrom(A, T, north(3), T + 40_000, 'native').tooFast).toBe(true);    // 270km/h
        expect(movementFrom(A, T, north(3), T + 40_000, 'mock').tooFast).toBe(false);
        expect(movementFrom(A, T, north(0.01), T + 100, 'native').tooFast).toBe(false);   // 10m · 0.1초
        expect(movementFrom(A, T, north(1), T + 40_000, 'native').tooFast).toBe(false);   // 90km/h
    });
});

describe('📍 출처 — 값만', () => {
    it('🔴 온 말 그대로 · 실 GPS 세 이름은 gps · 모르는 말은 모른다', () => {
        expect(fixSourceOf('mock')).toBe('mock');
        expect(fixSourceOf('manual')).toBe('manual');
        for (const s of ['native', 'browser', 'real']) expect(fixSourceOf(s)).toBe('gps');
        expect(fixSourceOf('weird')).toBeUndefined();
        expect(fixSourceOf('')).toBeUndefined();
    });
});

describe('🧭 받은 좌표가 기점이 되나 — 값만', () => {
    const base = { lastFix: A, lastFixAt: T, lastFixIsMock: false, lastFixSource: 'gps', activeFilter: { dispatchPhase: 'STANDBY' }, mockGpsOwner: null };
    it('🔴 신선하면 기점 · 낡으면 없음(부르는 쪽이 집으로 물러선다)', () => {
        expect(originFixFrom(base, T + 1000)).toMatchObject({ x: A.x, y: A.y, source: 'gps', isFallback: false });
        expect(originFixFrom(base, T + DRIVER_LOCATION_STALE_MS + 1)).toBeNull();
        expect(originFixFrom({ ...base, lastFix: null }, T)).toBeNull();
    });

    it('🔴 가짜 좌표 — 콜을 쥔 동안(모으는 중 · 운행 중)이나 모의 주행이 지금 돌 때만', () => {
        const mock = { ...base, lastFixIsMock: true, lastFixSource: 'mock' };
        expect(originFixFrom(mock, T)).toBeNull();
        expect(originFixFrom({ ...mock, activeFilter: { dispatchPhase: 'GATHERING' } }, T)).toMatchObject({ source: 'mock' });
        expect(originFixFrom({ ...mock, activeFilter: { dispatchPhase: 'DELIVERING' } }, T)).toMatchObject({ source: 'mock' });
        expect(originFixFrom({ ...mock, mockGpsOwner: { at: T } }, T + 1000)).toMatchObject({ source: 'mock' });
        expect(originFixFrom({ ...mock, mockGpsOwner: { at: T } }, T + MOCK_GPS_OWNER_QUIET_MS + 1)).toBeNull();
    });
});

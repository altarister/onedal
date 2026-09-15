import { getUserSession } from '../../src/state/userSessionStore';
import { goalOfCall } from '../../src/state/filterManager';
import { initGeoService } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

/**
 * 🎯 **복귀 대기 중 관내콜은 «복귀콜»이 아니다 — 하차지가 목적지 원 안이면 목적지 판** (2026-09-15 여섯 번째 바퀴 · 기사님 확정).
 *
 * 10:56:07 B3(이천 사음동 → 이천 중리동 · 관내콜)를 복귀를 켠 뒤 잡자 «🎯 [판] → 광주시»로 적혔다.
 * 집 그물은 꼭짓점이 «내 위치»인 집 방향 마름모라, 차 바로 옆 동(중리동)이 꼭짓점 근처에 들었다 →
 * «복귀콜 잡음»이 되어 하차 목록이 집만 남고 그 뒤 관내콜이 막혔다 (기사님 뜻 «집 방향 콜 잡기 전까지 관내 하자»와 어긋남).
 * 기사님 확정: **하차지가 목적지 원(관내로 재는 그 원) 안이면 관내콜 · 그 밖이면서 집 그물이면 복귀콜.** 새 값 없음.
 * ⚠️ 목적지 원이 집 쪽으로 걸치면 그 안의 집 방향 하차지도 관내콜로 적힌다 (onedal-49 짚음 · 원이 작아 손해가 작다).
 */
const USER = 'test-goal-of-call-local';
const HOME = { x: 127.294440, y: 37.376687, address: '경기 광주시 초월읍' };   // 여섯 번째 바퀴 집 좌표
const JUNGNI = { x: 127.446936, y: 37.277421 };      // 이천터미널 (중리동) — B3 하차
const GWANGO = { x: 127.429230, y: 37.285068 };      // 이천제일 (관고동) — 차가 선 곳
const CHOWOL = { x: 127.299905, y: 37.373379 };      // 초월역 — C3 하차 (복귀콜)

beforeAll(() => { initGeoService(); });
beforeEach(() => { jest.spyOn(SettingsRepository, 'getHomeLocation').mockReturnValue(HOME as any); });
afterEach(() => jest.restoreAllMocks());

function waitingHome() {
    const s = getUserSession(USER);
    s.activeFilter.destinationCity = '이천시';
    s.activeFilter.destinationRadiusKm = 5;
    s.activeFilter.callTarget = 'HOME';
    s.activeFilter.dispatchPhase = 'GATHERING';
    s.myOrders = [];
    (s as any).lastFix = { x: GWANGO.x, y: GWANGO.y };
    (s as any).lastFixAt = Date.now();
    (s as any).lastFixIsMock = false;
    (s as any).lastFixSource = 'gps';
    return s;
}

describe('🎯 복귀 대기 중 콜의 판', () => {
    it('🔴 하차지가 이천 목적지 원 안(중리동)이면 관내콜 — 목적지 판', () => {
        expect(goalOfCall(waitingHome(), USER, { dropoffX: JUNGNI.x, dropoffY: JUNGNI.y })).toBe('이천시');
    });
    it('하차지가 목적지 원 밖이면서 집 쪽(초월역)이면 복귀콜 — 집 판', () => {
        expect(goalOfCall(waitingHome(), USER, { dropoffX: CHOWOL.x, dropoffY: CHOWOL.y })).toBe('광주시');
    });
});

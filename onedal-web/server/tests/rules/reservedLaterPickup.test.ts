// @ts-nocheck
import { evaluationInputsOf, firstLoadNeedsCall, reservedLaterLineOf } from '../../src/core/engine/OrderEvaluator';
import { pickupBackwardOf } from '../../src/core/engine/judgeFacts';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📅 **내일 콜은 상차 반경도 내일 기준 · 오늘 무통보 약속과 견주지 않는다** (③④ · 기사님 «가» · onedal-1f).
 * ③ 등 뒤 상차의 여유(상차 반경)는 내일 콜이면 기본 설정 값(baseFilter) — 오늘 자동 반경으로 줄인 값이 아니다. 기본 값이 비면 «모름»(깎지 않음).
 * ④ «통화 필수 — 무통보 상차 한계 밖»은 오늘 잡은 뒤 20분 안에 상차하느냐는 약속이다 — 집에서 잰 내일 콜 접근 분과 견주지 않는다.
 */
const U = 'test-reserved-later-pickup';
const now = new Date().toISOString();
const tomorrowCall = { reservedDay: 1, capturedAt: now };
const todayCall = { reservedDay: null, capturedAt: now };
/** 김포 목적지 · 현위치 대전 — 상차지는 현위치보다 목적지에서 약 10km 더 멀다 */
const me = { x: 127.38, y: 36.35 };
const pickup = { x: 127.42, y: 36.27 };

beforeEach(() => {
    clearUserSession(U);
    const s = getUserSession(U);
    s.activeFilter = { ...s.activeFilter, pickupRadiusKm: 5 };
    s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 15, destinationCity: '김포시' };
});
afterAll(() => clearUserSession(U));

describe('③ 내일 콜의 상차 반경', () => {
    it('🔴 내일 콜은 기본 설정 반경(15km) — 10km 등 뒤는 «등 뒤» 아님', () => {
        const { pickupRadiusNow } = evaluationInputsOf(U, getUserSession(U), tomorrowCall);
        expect(pickupRadiusNow()).toBe(15);
        expect(pickupBackwardOf({ me, pickup, goalCity: '김포시', pickupRadiusKm: pickupRadiusNow() })).toBe(false);
    });

    it('오늘 콜은 오늘 반경(5km) 그대로 — 같은 상차가 «등 뒤»', () => {
        const { pickupRadiusNow } = evaluationInputsOf(U, getUserSession(U), todayCall);
        expect(pickupRadiusNow()).toBe(5);
        expect(pickupBackwardOf({ me, pickup, goalCity: '김포시', pickupRadiusKm: pickupRadiusNow() })).toBe(true);
    });

    it('🔴 기본 설정 반경이 비면 오늘 반경으로 물러서지 않고 «모름»', () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: undefined };
        const { pickupRadiusNow } = evaluationInputsOf(U, s, tomorrowCall);
        expect(pickupRadiusNow()).toBeNull();
        expect(pickupBackwardOf({ me, pickup, goalCity: '김포시', pickupRadiusKm: pickupRadiusNow() })).toBeNull();
    });
});

describe('④ 내일 콜에는 «통화 필수» 딱지가 없다', () => {
    it('🔴 집→상차 40분 · 약속 20분 — 내일 콜은 딱지 없음', () => {
        expect(firstLoadNeedsCall(40, 20, true)).toBe(false);
    });
    it('오늘 콜은 그대로 딱지', () => {
        expect(firstLoadNeedsCall(40, 20, false)).toBe(true);
        expect(firstLoadNeedsCall(15, 20, false)).toBe(false);
        expect(firstLoadNeedsCall(null, 20, false)).toBe(false);
    });
});

describe('📅 판정 로그 — 내일 콜이면 기점·반경·보관 날 한 줄', () => {
    it('🔴 내일 콜은 «기점 집 · 반경 기본 N km · 보관 날 M/D»', () => {
        expect(reservedLaterLineOf('2026-10-03', { x: 127, y: 37 }, 15)).toBe('📅 [내일 콜] 기점 집 · 반경 기본 15km · 보관 날 10/3');
    });
    it('집 좌표나 기본 반경이 비면 «모름»으로 적는다', () => {
        expect(reservedLaterLineOf('2026-10-03', null, null)).toBe('📅 [내일 콜] 기점 집(모름) · 반경 기본 모름 · 보관 날 10/3');
    });
});

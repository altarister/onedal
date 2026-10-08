// @ts-nocheck
import { appFilterOf } from '../../src/state/appFilter';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🔒 **콜 잡기 보류 까닭을 isActive 와 따로 싣는다** (35 X6 ① · 기사님 «가: 넷 다 픽커도 멈춘다»).
 *
 * 인성 · 화물24시는 isActive=false 면 멈추지만 픽커는 isActive 를 안 읽어, 만석이거나 필터가 고장 난 날에도 울리고 상세를 열었다.
 * 픽커가 읽을 칸 `captureHold` 에는 «만석»과 필터 고장(callFilterBlocker 넷)만 싣는다 —
 * 부트스트랩 · 복구 전은 isActive 만 끄고 이 칸은 비운다(그때 픽커는 지금처럼 울린다).
 */
const U = 'test-capture-hold';
const ready = () => {
    clearUserSession(U);
    const s = getUserSession(U);
    s.isRestored = true;
    s.isBootstrapping = false;
    s.activeFilter = { ...s.activeFilter, isActive: true, isSharedMode: false, destinationCity: '이천시',
        destinationKeywords: ['관고동'], allowedVehicleTypes: ['다마스'], pickupKeywords: undefined };
    return s;
};
afterAll(() => clearUserSession(U));

describe('🔒 captureHold — 픽커가 멈추는 까닭', () => {
    it('🔴 만석이면 «만석»', () => {
        const s = ready();
        s.activeFilter.allowedVehicleTypes = [];
        const { filter } = appFilterOf(s, U, null, null);
        expect(filter.isActive).toBe(false);
        expect(filter.captureHold).toBe('만석');
    });

    it('🔴 필터 고장(목적지가 빔)이면 그 까닭 글', () => {
        const s = ready();
        s.activeFilter.destinationCity = '';
        const { filter } = appFilterOf(s, U, null, null);
        expect(filter.captureHold).toBe('도착 희망 지역이 비어 있습니다');
    });

    it('🔴 부트스트랩 · 복구 전은 isActive 만 끄고 칸은 없다 — 픽커는 지금처럼 울린다', () => {
        const a = ready();
        a.isBootstrapping = true;
        const r1 = appFilterOf(a, U, null, null).filter;
        expect(r1.isActive).toBe(false);
        expect(r1.captureHold).toBeUndefined();
        const b = ready();
        b.isRestored = false;
        const r2 = appFilterOf(b, U, null, null).filter;
        expect(r2.isActive).toBe(false);
        expect(r2.captureHold).toBeUndefined();
    });

    /**
     * 🔴 서버가 다시 켜진 뒤 관제웹이 붙기 전에는 하차 목록이 아직 안 지어져 «지역을 못 찾았습니다»가 함께 걸린다(로그 10-09 05:52).
     *    지어지지 않은 필터의 고장 · 진행 중 콜을 모르는 만석은 아직 사실이 아니다 — 칸을 싣지 않아 픽커는 지금처럼 울린다.
     */
    it('🔴 복구 전 · 부트스트랩 중에는 하차 목록이 비었거나 만석이어도 칸이 없다', () => {
        const a = ready();
        a.isRestored = false;
        a.activeFilter.destinationKeywords = [];
        expect(appFilterOf(a, U, null, null).filter.captureHold).toBeUndefined();
        const b = ready();
        b.isRestored = false;
        b.activeFilter.allowedVehicleTypes = [];
        expect(appFilterOf(b, U, null, null).filter.captureHold).toBeUndefined();
        const c = ready();
        c.isBootstrapping = true;
        c.activeFilter.allowedVehicleTypes = [];
        expect(appFilterOf(c, U, null, null).filter.captureHold).toBeUndefined();
    });

    it('대조 — 복구 뒤 하차 목록이 비면 그 까닭 글', () => {
        const s = ready();
        s.activeFilter.destinationKeywords = [];
        expect(appFilterOf(s, U, null, null).filter.captureHold).toBe('이천시 에서 지역을 못 찾았습니다');
    });

    it('보류가 없으면 칸이 없다', () => {
        expect(appFilterOf(ready(), U, null, null).filter.captureHold).toBeUndefined();
    });
});

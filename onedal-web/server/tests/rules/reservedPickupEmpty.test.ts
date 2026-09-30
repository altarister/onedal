// @ts-nocheck
import db from '../../src/db';
import { initGeoService } from '../../src/services/geoService';
import { ensureReservedPickupList } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📅 **내일 상차 목록이 비면 칸을 안 싣고 붙잡지도 않는다** (onedal-1f · 04 리뷰).
 * 원달앱은 빈 목록을 «내일 콜 전부 탈락»으로 읽는다. 지도 자료를 못 읽어 한 번 비었을 때 (집|반경) 열쇠로 붙잡으면
 * 서버를 다시 띄울 때까지 계속 빈다 — 비었으면 다음에 다시 센다.
 */
const U = 'test-reserved-pickup-empty';

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'reservedempty@test', '내일상차빈목록검사');
    db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U);
    db.prepare(`UPDATE user_settings SET home_x = 127.4432, home_y = 37.2723, home_address = '경기 이천시' WHERE user_id = ?`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📅 빈 내일 상차 목록', () => {
    it('🔴 지도 자료가 없어 비면 null · 열쇠를 안 붙잡아 지도가 올라온 뒤 다시 센다', () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 };
        expect(ensureReservedPickupList(s, U)).toBeNull();
        expect(s.reservedPickup).toBeNull();
        initGeoService();
        const r = ensureReservedPickupList(s, U);
        expect(r?.keywords.length).toBeGreaterThan(10);
    });
});

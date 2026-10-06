// @ts-nocheck
import db from '../../src/db';
import * as geo from '../../src/services/geoService';
import * as fileLogger from '../../src/utils/fileLogger';
const { initGeoService } = geo;
import { ensureReservedPickupList } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📅 **내일 상차 목록이 비면 칸을 안 싣는다 · 붙잡되 지도가 올라오면 다시 센다** (onedal-1f · 04 리뷰 · 관제 3f0bd368 리뷰).
 * 원달앱은 빈 목록을 «내일 콜 전부 탈락»으로 읽는다. 열쇠에 지도 지역 수가 들어 지도 자료를 못 읽어 빈 것은 지도가 올라오면 열쇠가 바뀐다.
 * 붙잡으므로 관제앱 공급(1초 주기)이 불러도 다시 세지 않고 로그도 안 찍는다.
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
    it('🔴 지도 자료가 없어 비면 null · 다시 불러도 다시 세지 않고 로그 0 · 지도가 올라오면 다시 센다', () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 };
        expect(ensureReservedPickupList(s, U)).toBeNull();
        expect(s.reservedPickup?.keywords).toEqual([]);
        const count = jest.spyOn(geo, 'pickupListFor');
        const log = jest.spyOn(fileLogger, 'slog');
        expect(ensureReservedPickupList(s, U)).toBeNull();
        expect(count).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        count.mockRestore();
        log.mockRestore();
        initGeoService();
        const r = ensureReservedPickupList(s, U);
        expect(r?.keywords.length).toBeGreaterThan(10);
    });
});

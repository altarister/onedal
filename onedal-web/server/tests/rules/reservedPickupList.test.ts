// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { initGeoService } from '../../src/services/geoService';
import { ensureReservedPickupList } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📅 **내일 콜 상차 목록 — 집 둘레 기본 상차 반경 안의 동** (기사님 «내일콜 가» · onedal-1f).
 * 서버 판정은 내일 콜을 집(`homeOriginOf`)에서 기본 반경(`reservedPickupRadiusKmOf`)으로 잰다. 원달앱은 집까지 거리를 모르니
 * 서버가 같은 두 값으로 오늘 상차 목록과 같은 함수(`pickupListFor`)를 불러 동 목록을 앱 필터에 싣는다(reservedPickupKeywords · reservedPickupGroups).
 * 집이나 기본 반경이 없으면 칸이 없다(앱은 옛 길) · 집·반경이 바뀔 때만 다시 센다.
 */
const U = 'test-reserved-pickup';
/* 이천시 중심 근처 — 이천 동은 들고, 40km 넘는 서울 강북 동은 없어야 한다 */
const HOME = { x: 127.4432, y: 37.2723 };

beforeAll(() => {
    initGeoService();
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'reservedpickup@test', '내일상차검사');
    db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});
const setHome = (h: { x: number; y: number } | null) =>
    db.prepare(`UPDATE user_settings SET home_x = ?, home_y = ?, home_address = ? WHERE user_id = ?`).run(h?.x ?? null, h?.y ?? null, h ? '경기 이천시' : null, U);

describe('📅 내일 콜 상차 목록', () => {
    it('🔴 집 · 기본 반경 25 → 집 둘레 동은 들고 먼 동은 없다 · 시로 묶은 것도 함께', () => {
        setHome(HOME);
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 };
        const r = ensureReservedPickupList(s, U);
        expect(r).not.toBeNull();
        expect(r.keywords.length).toBeGreaterThan(10);
        expect(Object.keys(r.groups).some(city => city.includes('이천'))).toBe(true);
        expect(Object.keys(r.groups).some(city => city.includes('도봉'))).toBe(false);
        expect(new Set(Object.values(r.groups).flat()).size).toBe(new Set(r.keywords).size);
    });

    it('🔴 같은 집 · 같은 반경이면 다시 안 센다 — 같은 목록 한 벌', () => {
        const s = getUserSession(U);
        const a = ensureReservedPickupList(s, U);
        const b = ensureReservedPickupList(s, U);
        expect(b).toBe(a);
    });

    it('🔴 기본 반경이 바뀌면 다시 센다', () => {
        const s = getUserSession(U);
        const a = ensureReservedPickupList(s, U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 10 };
        const b = ensureReservedPickupList(s, U);
        expect(b).not.toBe(a);
        expect(b.keywords.length).toBeLessThan(a.keywords.length);
    });

    it('🔴 집이 없으면 없다(앱은 옛 길)', () => {
        setHome(null);
        expect(ensureReservedPickupList(getUserSession(U), U)).toBeNull();
    });
});

describe('📅 서버 판정과 같은 값 · 앱에 싣기', () => {
    it('🔴 판정과 같은 두 함수(homeOriginOf · reservedPickupRadiusKmOf)와 오늘 상차 목록의 pickupListFor 를 부른다', () => {
        const fm = readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8');
        const body = fm.slice(fm.indexOf('export function ensureReservedPickupList'));
        expect(body.slice(0, 2500)).toMatch(/homeOriginOf\(userId\)/);
        expect(body.slice(0, 2500)).toMatch(/reservedPickupRadiusKmOf\(session\.baseFilter\)/);
        expect(body.slice(0, 2500)).toMatch(/pickupListFor\(/);
    });
    it('🔴 앱 필터에 reservedPickupKeywords · reservedPickupGroups 로 싣는다', () => {
        /* 폰 문이 목록을 재고(ensure) · 싣는 칸은 appFilterOf 가 얹는다 */
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        const appFilter = readFileSync(join(__dirname, '../../src/state/appFilter.ts'), 'utf8');
        expect(scrap).toMatch(/ensureReservedPickupList\(session, userId\)/);
        expect(appFilter).toMatch(/filter\.reservedPickupKeywords = /);
        expect(appFilter).toMatch(/filter\.reservedPickupGroups = /);
    });
});

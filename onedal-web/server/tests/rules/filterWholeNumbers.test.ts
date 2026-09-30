// @ts-nocheck
import db from '../../src/db';
import { updateActiveFilter, saveBaseFilter } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🔢 **원달앱이 정수로 받는 필터 칸은 서버가 정수로 거른다** (교차 리뷰 · onedal-1f).
 * 원달앱 FilterConfig 의 minFare · maxFare 는 Int 다. 소수(22999.999…)가 한 번 들어가면 Gson 이 목록 보고 응답 전체를 버려,
 * 그 필터가 도는 동안 폰이 결재·모드·필터를 하나도 못 받는다(빨리 접기 remainSec 소수와 같은 병).
 */
const U = 'test-filter-whole';

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'whole@test', '정수칸검사');
});
afterAll(() => {
    db.prepare(`DELETE FROM user_filters WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🔢 필터 정수 칸', () => {
    it('🔴 오늘 필터에 소수 요금이 와도 정수로 든다', () => {
        updateActiveFilter(U, { minFare: 22999.999999999996, maxFare: 150000.4 } as any);
        const f = getUserSession(U).activeFilter;
        expect(f.minFare).toBe(23000);
        expect(f.maxFare).toBe(150000);
    });

    it('🔴 DB 에 이미 소수가 있어도 세션을 만들 때 정수로 읽는다', () => {
        db.prepare(`INSERT OR IGNORE INTO user_filters (user_id) VALUES (?)`).run(U);
        db.prepare(`UPDATE user_filters SET min_fare = 22999.7, max_fare = 99999.5 WHERE user_id = ?`).run(U);
        clearUserSession(U);
        const s = getUserSession(U);
        expect(s.baseFilter.minFare).toBe(23000);
        expect(s.baseFilter.maxFare).toBe(100000);
        expect(Number.isInteger(s.activeFilter.minFare)).toBe(true);
    });

    it('🔴 평소 필터 저장도 정수로', () => {
        saveBaseFilter(U, { minFare: 15000.5 } as any);
        expect(Number.isInteger(getUserSession(U).baseFilter.minFare)).toBe(true);
    });
});

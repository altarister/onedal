import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { homeOriginOf } from '../../src/services/geoService';
import { destProgressOf } from '../../src/core/engine/judgeFacts';

/**
 * 📅⚖️ **내일 콜 판정 — 그날 첫 콜로 가정한다** (reviews/23 B-3 · 기사님 결정 3 «가»).
 *
 * 내일 이후 콜(보관 날이 오늘 뒤)은 ① 접근 구간을 **지금 자리가 아니라 집**에서 재고 ② **합칠 상대가 없다**(첫짐 단독).
 * 가르는 것은 그 콜 하나의 사실(보관 날)뿐이다 — 모드 이름 조건문이 아니다.
 * 🔴 집 좌표가 비면 기점이 없다 → 접근 축은 «잴 게 없음»이지 빨강이 아니다(`criteria.ts` WAIT).
 */
const SRC = join(__dirname, '../../src');
const evaluator = readFileSync(join(SRC, 'core/engine/OrderEvaluator.ts'), 'utf8');

describe('⚖️ 기점과 합짐 상대는 한 곳에서 정한다', () => {
    it('기점은 originNow() 하나 — 내일 콜이면 집, 아니면 지금처럼 originOf', () => {
        expect(evaluator).toMatch(/const originNow = \(\) => reservedLater \? homeOriginOf\(userId\) : originOf\(session\);/);
        expect(evaluator.match(/originOf\(session\)/g)?.length).toBe(1);
    });

    it('합칠 상대는 내일 콜이면 없다 — 첫짐 단독으로 잰다', () => {
        expect(evaluator).toMatch(/const activeCallsNow = \(\) => reservedLater \? \[\] : getActiveCalls\(session\);/);
        expect(evaluator.match(/getActiveCalls\(session\)/g)?.length).toBe(1);
    });

    it('가름은 콜 하나의 사실(보관 날이 오늘 뒤)이다', () => {
        expect(evaluator).toContain('const reservedLater = isLaterThan(reservedForOf(securedOrder), businessDayKey(Date.now()));');
    });
});

describe('🏠 집 기점 — homeOriginOf', () => {
    const U = 'test-reserved-judgment';
    beforeAll(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'rj@test', '내일판정검사');
    });
    afterAll(() => {
        try { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U); } catch { /* 없으면 넘어간다 */ }
        db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    });

    it('🔴 집이 비면 null — 지어내지 않는다(그 축은 «잴 게 없음»)', () => {
        try { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U); } catch { /* 없으면 넘어간다 */ }
        expect(homeOriginOf(U)).toBeNull();
    });

    it('집이 있으면 집 좌표 · 출처 home · 대신 쓴 값', () => {
        db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U);
        db.prepare(`UPDATE user_settings SET home_address = '경기 광주시 초월읍', home_x = 127.29, home_y = 37.37 WHERE user_id = ?`).run(U);
        expect(homeOriginOf(U)).toEqual({ x: 127.29, y: 37.37, source: 'home', isFallback: true });
    });
});

describe('🧭 방향 축의 목적지 — 내일 콜은 내일의 목적지(기본 설정)로', () => {
    it('goalNow() 하나 — 내일 콜이면 baseFilter 목적지, 아니면 지금처럼 goalCityOf', () => {
        expect(evaluator).toMatch(/const goalNow = \(\) => reservedLater \? \(session\.baseFilter\.destinationCity \?\? ''\) : goalCityOf\(session, userId\);/);
        expect(evaluator.match(/goalCityOf\(session, userId\)/g)?.length).toBe(1);
    });

    it('🔴 기본 설정 목적지가 비면 방향은 «모름»이다 — 깎지 않는다(빨강 아님)', () => {
        const r = destProgressOf({ me: { x: 127.29, y: 37.37 }, dropoff: { x: 127.43, y: 37.28 }, goalCity: '' });
        expect(r.ratio).toBeNull();
        expect(r.unknownWhy).toBe('목적지 미설정');
    });
});

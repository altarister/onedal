import db from '../../src/db';
import { applyWebFilter, ensureBusinessDay } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🔍 **«적용»한 오늘 값은 그날 안에는 서버가 다시 켜져도 남고, 다음 영업일에는 평소 설정으로 돌아간다** (기사님 «가»).
 * 서버를 다시 켜는 것은 메모리 세션을 버리고 다시 만드는 것과 같다(`clearUserSession` → `getUserSession`).
 * 못 잡는 것: 실서버 배포 때의 재시작(로컬 재시작으로만 본다) · 관제웹이 다시 붙은 뒤 화면에 그 값이 그려지는가.
 */
const U = 'test-filter-today';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 서버를 다시 켠 것처럼 — 메모리 세션을 버리고 다시 만든다 */
const restart = () => { clearUserSession(U); return getUserSession(U); };

beforeAll(() => { approvedUser(U); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => {
    clearUserSession(U);
    for (const t of ['user_filter_today', 'user_filters', 'user_settings', 'user_judgment']) {
        try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(U); } catch { /* 표가 없으면 그만 */ }
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('🔍 오늘 값 — 서버가 다시 켜져도', () => {
    beforeEach(() => {
        restart();
        applyWebFilter(U, { minFare: 30000, destinationCity: '이천시', saveAsDefault: true });
    });

    it('«적용»한 값이 그날 안에는 남는다', () => {
        applyWebFilter(U, { minFare: 7000, destinationCity: '서울 용산구' });
        const s = restart();
        expect(s.activeFilter.minFare).toBe(7000);
        expect(s.activeFilter.destinationCity).toBe('서울 용산구');
        /* 평소 설정은 그대로다 */
        expect(s.baseFilter.minFare).toBe(30000);
        expect(s.baseFilter.destinationCity).toBe('이천시');
    });

    it('«적용»을 두 번 하면 두 번 다 남는다 — 뒤의 것이 앞의 것을 지우지 않는다', () => {
        applyWebFilter(U, { minFare: 7000 });
        applyWebFilter(U, { destinationCity: '서울 용산구' });
        const s = restart();
        expect(s.activeFilter.minFare).toBe(7000);
        expect(s.activeFilter.destinationCity).toBe('서울 용산구');
    });

    it('다음 영업일에 다시 켜지면 평소 설정으로 시작한다', () => {
        applyWebFilter(U, { minFare: 7000 });
        const tomorrow = Date.now() + DAY_MS;
        jest.spyOn(Date, 'now').mockReturnValue(tomorrow);
        const s = restart();
        expect(s.activeFilter.minFare).toBe(30000);
    });

    it('켜진 채로 영업일이 바뀌면 평소 설정으로 돌아가고, 그 뒤 다시 켜져도 평소 설정이다', () => {
        applyWebFilter(U, { minFare: 7000 });
        const tomorrow = Date.now() + DAY_MS;
        jest.spyOn(Date, 'now').mockReturnValue(tomorrow);
        expect(ensureBusinessDay(U)).toBe(true);
        expect(getUserSession(U).activeFilter.minFare).toBe(30000);
        expect(restart().activeFilter.minFare).toBe(30000);
    });

    it('«서버 저장» 뒤에는 오늘 값과 평소 설정이 같다 — 앞서 «적용»한 값이 되살아나지 않는다', () => {
        applyWebFilter(U, { minFare: 7000 });
        applyWebFilter(U, { minFare: 9000, saveAsDefault: true });
        const s = restart();
        expect(s.activeFilter.minFare).toBe(9000);
        expect(s.baseFilter.minFare).toBe(9000);
    });

    it('«저장»은 보낸 칸만 오늘 줄에서 뺀다 — 설정 탭에서 반경만 저장해도 오늘 «적용»한 제외 지역은 남는다', () => {
        applyWebFilter(U, { excludedRegions: ['D|이천시|창전동'], minFare: 7000, userOverrides: true });
        applyWebFilter(U, { radiusBaseKm: 30, saveAsDefault: true });
        const s = restart();
        expect(s.activeFilter.excludedRegions).toEqual(['D|이천시|창전동']);
        expect(s.activeFilter.minFare).toBe(7000);
        expect(s.activeFilter.radiusBaseKm).toBe(30);
    });

    it('«저장»한 칸은 오늘 줄의 옛 «적용» 값이 덮지 않는다', () => {
        applyWebFilter(U, { minFare: 7000 });
        applyWebFilter(U, { minFare: 9000, saveAsDefault: true });
        expect(restart().activeFilter.minFare).toBe(9000);
    });

    it('세션을 새로 만들 때 운행 상태는 오늘 값에서 되살리지 않는다 — 대기 · 첫짐부터', () => {
        /* 무대의 «🚀 지금 출발»도 같은 문(`update-filter`)으로 온다 */
        applyWebFilter(U, { minFare: 7000, driverAction: 'DRIVING' });
        const s = restart();
        expect(s.activeFilter.minFare).toBe(7000);
        expect(s.activeFilter.driverAction).toBe('WAITING');
        expect(s.activeFilter.dispatchPhase).toBe('STANDBY');
        expect(s.activeFilter.destinationKeywords).toEqual([]);
    });
});

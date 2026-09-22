import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { goalCityOf } from '../../src/state/filterManager';
import { initGeoService } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

/**
 * 🎯 **콜의 목표값은 잡던 순간의 «필터값»이다 — 하차지 좌표로 가르지 않는다** (기사님 확정).
 *
 * 목적지는 «필터값 ∪ 마지막으로 KEEP 한 콜의 목표값»이고 최대 둘이다. 그 계산이 맞으려면
 * 콜에 적히는 목표값이 **틀림없어야** 한다. 기사님이 그 필터값을 보고 잡으신 것이니 답이 이미 적혀 있다.
 *
 * 무엇을 막나
 * - **좌표로 되짚는 것** — 하차지가 어느 목적지 권역에 드는지로 가르면, 집 방향 마름모의
 *   꼭짓점이 차 바로 옆이라 **관내 하차지가 집 목표로 찍히고**, 그 한 건으로 목적지가 잘못 합쳐져
 *   관내콜이 막힌다. 그래서 KEEP 할 때 그때의 필터값(`goalCityOf`)을 그대로 적는다
 * - **목표값을 메모리에만 두는 것** — 재기동하면 마지막 KEEP 콜의 목표값을 잃는다 (DB 칸 `orders.goalCity`)
 */
const USER = 'test-goal-city-of';
const HOME = { x: 127.294440, y: 37.376687, address: '경기 광주시 초월읍' };
const SRC = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

beforeAll(() => { initGeoService(); });
beforeEach(() => { jest.spyOn(SettingsRepository, 'getHomeLocation').mockReturnValue(HOME as any); });
afterEach(() => jest.restoreAllMocks());

function session(callTarget: 'DEST' | 'HOME') {
    const s = getUserSession(USER);
    s.activeFilter.destinationCity = '이천시';
    s.activeFilter.destinationRadiusKm = 5;
    s.activeFilter.callTarget = callTarget;
    s.myOrders = [];
    return s;
}

describe('🎯 목표값은 그때의 필터값이다', () => {
    it('복귀를 안 켰으면 기사님이 정한 목적지', () => {
        expect(goalCityOf(session('DEST'), USER)).toBe('이천시');
    });

    it('🔴 복귀를 켜면 집이 필터값이다 — 그 뒤 잡는 콜은 하차지가 어디든 집 목표다', () => {
        expect(goalCityOf(session('HOME'), USER)).toBe('광주시');
    });
});

describe('🔒 좌표로 되짚는 계산이 없다', () => {
    it('🔴 KEEP 할 때 필터값을 그대로 적는다', () => {
        const eng = SRC('services/dispatchEngine.ts');
        expect(eng).toMatch(/confirmedOrder\.goalCity = goalCityOf\(session, userId\)/);
    });

    it('🔴 하차지 좌표로 목표값을 고르는 함수가 없다', () => {
        expect(SRC('state/filterManager.ts')).not.toMatch(/function goalOfCall/);
        expect(SRC('services/dispatchEngine.ts')).not.toMatch(/goalOfCall\(/);
    });

    it('목표값은 DB 에도 남는다 — 재기동해도 마지막 KEEP 콜의 목표값을 안 잃는다', () => {
        expect(SRC('db.ts')).toMatch(/ensureColumns\('orders', \{ goalCity: 'TEXT' \}\)/);
    });
});

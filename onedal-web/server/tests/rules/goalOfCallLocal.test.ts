import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { goalCityOf, goalCitiesOf, keepGoalCityOf } from '../../src/state/filterGoals';
import { initGeoService } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

/**
 * 🎯 **콜의 목표값 — 관내 콜(하차의 행정 시가 오늘 목적지 시)은 그 시 · 그 밖은 잡던 순간의 «필터값»** (기사님 확정 + 38 F41 · 71 결정).
 *
 * 목적지는 «복귀 켬 · 복귀콜을 잡았나»(shared activeGoals)가 정하고, «복귀콜인가»는 콜의 목표값이 집인가다.
 * 그 계산이 맞으려면 콜에 적히는 목표값이 **틀림없어야** 한다.
 *
 * 무엇을 막나
 * - **좌표 · 마름모 조각으로 되짚는 것** — 하차지가 어느 목적지 권역에 드는지로 가르면, 집 방향 마름모의
 *   꼭짓점이 차 바로 옆이라 **관내 하차지가 집 목표로 찍히고**, 그 한 건으로 관내콜이 막힌다.
 *   그래서 권역이 아니라 하차의 **행정 시**(시 이름 · 동 이름)로 가른다 — 이천 동은 마름모와 상관없이 늘 이천이다(`keepGoalCityOf`)
 * - **복귀 켬 뒤의 관내 콜을 필터값(집)으로 적는 것** — 첫 관내 KEEP 에서 «복귀콜»로 세어 관내 필터가 사라졌다(기사님 «복귀콜이 나오기 전까지 관내콜을 진행»)
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

describe('🔒 좌표 · 마름모로 되짚는 계산이 없다', () => {
    it('🔴 KEEP 할 때 keepGoalCityOf 하나로 적는다 — 관내가 아니면 필터값', () => {
        const eng = SRC('services/dispatchEngine.ts');
        expect(eng).toMatch(/keepGoalCityOf\(\{[^}]*fallback: goalCityOf\(session, userId\)/);
        expect(eng).toMatch(/confirmedOrder\.goalCity = goal\.city/);
    });

    it('🔴 옛 실패 장면 — 복귀 켬 · 차 옆 이천 동(집 마름모에만 걸침)으로 가는 콜도 이천으로 적힌다', () => {
        expect(keepGoalCityOf({ dropoff: '경기 이천시 신둔면 수광리 12', destCities: ['이천시'], fallback: '광주시' }).city).toBe('이천시');
    });

    it('🔴 하차지 좌표로 목표값을 고르는 함수가 없다', () => {
        for (const f of ['state/filterManager.ts', 'state/filterGoals.ts']) expect(SRC(f)).not.toMatch(/function goalOfCall/);
        expect(SRC('services/dispatchEngine.ts')).not.toMatch(/goalOfCall\(/);
    });

    it('목표값은 DB 에도 남는다 — 재기동해도 마지막 KEEP 콜의 목표값을 안 잃는다', () => {
        expect(SRC('db.ts')).toMatch(/ensureColumns\('orders', \{ goalCity: 'TEXT' \}\)/);
    });
});

/**
 * 🎯 **둘째 목적지는 «진행 중인 확정 콜» 가운데 마지막 콜의 목표값이다** (기사님 확정 — 취소한 콜은 마지막 콜일 수 없다 · 하차가 끝난 콜은 뺀다 · 잡을 때의 목표값으로 본다).
 *    취소 · 방출 · 하차 끝 · 판정 중(KEEP 전) 콜이 목록 끝에 있어도 마지막 콜이 아니다.
 */
describe('🎯 목적지 둘은 진행 중인 확정 콜이 정한다', () => {
    const call = (status: string, goalCity?: string) => ({ id: `${status}-${goalCity ?? '없음'}`, status, goalCity }) as any;
    const goals = (orders: any[]) => {
        const s = session('DEST');
        s.myOrders = orders;
        return goalCitiesOf(s, USER);
    };

    it('🔴 내려놓은 콜만 남으면 목적지는 필터값 하나', () => {
        expect(goals([call('ORDER_RELEASED_BY_ME', '서울')])).toEqual(['이천시']);
    });
    it('🔴 하차가 끝난 콜만 남으면 목적지는 필터값 하나', () => {
        expect(goals([call('ORDER_DELIVERED', '서울')])).toEqual(['이천시']);
    });
    it('진행 중인 확정 콜의 목표값이 다르면 둘', () => {
        expect(goals([call('ORDER_CONFIRMED', '서울')])).toEqual(['이천시', '서울']);
    });
    it('🔴 끝에 안전취소한 콜이 있어도 진행 중인 콜의 목표값을 본다', () => {
        expect(goals([call('ORDER_CONFIRMED', '서울'), call('SAFE_CANCEL', '여주시')])).toEqual(['이천시', '서울']);
    });
    it('🔴 끝에 판정 중인 콜(KEEP 전)이 있어도 진행 중인 확정 콜의 목표값을 본다', () => {
        expect(goals([call('ORDER_PICKED_UP', '서울'), call('ORDER_AWAITING_DECISION')])).toEqual(['이천시', '서울']);
    });
});

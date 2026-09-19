import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { goalZonesOf, pickupPartsOf, dropoffPartsOf, nearGoalCitiesOf, isNearGoal, goalStateLabel } from './filterArea';

/**
 * 🧱 **조각은 사실을 직접 본다 — 뭉친 이름을 거치지 않는다**
 *    (`docs/기획/필터_파이프라인_설계.md` ⑥)
 *
 * 무엇을 막나
 * - **「내가 달리나」를 목적지 목록으로 묻는 것** — 목적지가 하나 늘면 답이 뒤집힌다.
 *   복귀를 켜자 목적지가 둘이 되고 하나가 «콜 없음»이라 상차 라인이 통째로 꺼졌다 (실측 118곳 → 419곳)
 * - 목적지마다 다른 것(그 목적지 콜)과 전체가 하나인 것(출발했나)을 **한 칸에 담는 것**
 * - 조건 하나가 **재료 여럿을 끄는 것** — 거리를 넓히는 일과 방향을 버리는 일은 다른 일이다
 */

const SRC = readFileSync(join(__dirname, 'filterArea.ts'), 'utf8');
const codeOnly = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧱 상차 조각 — 목적지 개수에 흔들리지 않는다', () => {
    const seoul = { city: '서울', isHome: false, hasCalls: true, nearGoal: false };
    const home = { city: '광주시', isHome: true, hasCalls: false, nearGoal: false };

    it('🔴 복귀를 켜도 라인이 살아 있다 — 목적지가 둘이 되어도 「내가 달리나」는 그대로다', () => {
        const facts = { departed: true, hasLine: true };
        expect(pickupPartsOf({ ...facts, nearGoalCities: nearGoalCitiesOf([seoul]) }).line).toBe(true);
        expect(pickupPartsOf({ ...facts, nearGoalCities: nearGoalCitiesOf([seoul, home]) }).line).toBe(true);
    });

    it('출발 전에는 라인이 없다 — 아직 안 떠났으면 어느 길로든 갈 수 있다', () => {
        expect(pickupPartsOf({ departed: false, hasLine: true, nearGoalCities: [] }).line).toBe(false);
    });

    it('🔷 경로를 모르면(동선) 라인이 없다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(pickupPartsOf({ departed: true, hasLine: false, nearGoalCities: [] }).line).toBe(false);
    });

    it('🔴 가까이 온 목적지가 둘이면 원 둘을 다 준다 — 부르는 쪽이 더한다(∪)', () => {
        const bothNear = [{ ...seoul, nearGoal: true }, { ...home, nearGoal: true }];
        expect(pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: nearGoalCitiesOf(bothNear) }).goalCities)
            .toEqual(['서울', '광주시']);
    });

    it('🔴 「가까이 옴」이 라인을 끄지 않는다 — 목적지 원을 더할 뿐이다', () => {
        const r = pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: ['서울'] });
        expect(r).toEqual({ line: true, goalCities: ['서울'] });
    });
});

describe('🧱 하차 조각 — 묻는 것이 하나다', () => {
    it('그 목적지까지 자른 라인이 있으면 라인 ∪ 마름모(마지막 하차지)', () => {
        expect(dropoffPartsOf(true)).toEqual({ line: true, quadFrom: 'lastDrop' });
    });
    it('없으면 마름모를 현위치에서 잰다 — 라인을 지어내지 않는다 (규칙 ④)', () => {
        expect(dropoffPartsOf(false)).toEqual({ line: false, quadFrom: 'me' });
    });
    it('🔴 현위치 원은 하차 조각에 없다 — 넣었다 빼면 가는 방향 동까지 지워진다', () => {
        expect(Object.keys(dropoffPartsOf(true))).toEqual(['line', 'quadFrom']);
    });
});

describe('🎯 가까이 옴 — 목적지 반경 하나로 잰다', () => {
    const me = { x: 127.0, y: 37.5 };
    const goal = { lng: 127.0, lat: 37.5 };
    it('목적지 영역 안이면 참', () => {
        expect(isNearGoal({ me, goal, destinationRadiusKm: 10 })).toBe(true);
    });
    it('🔴 현위치 반경은 아예 인자에 없다 — 두 반경을 합쳐 보면 한참 멀리서 켜진다', () => {
        const sig = SRC.slice(SRC.indexOf('export function isNearGoal'));
        expect(sig.slice(0, sig.indexOf(')'))).not.toContain('srcDiam');
        expect(sig.slice(0, sig.indexOf(')'))).not.toContain('params');
    });
});

describe('🧱 목적지는 «사실»만 담는다', () => {
    it('그 목적지로 갈 콜이 있나만 담는다 — 출발 여부는 안 담는다', () => {
        const z = goalZonesOf({ filterCity: '광주시', lastKeptGoalCity: '서울', homeCity: '광주시',
            activeCalls: [{ goalCity: '서울' }] });
        expect(z).toEqual([
            { city: '광주시', isHome: true, hasCalls: false },
            { city: '서울', isHome: false, hasCalls: true },
        ]);
    });
    it('🔴 «출발했나»를 인자로 받지 않는다 — 목적지가 사는 조건과 무관하다', () => {
        const sig = SRC.slice(SRC.indexOf('export function goalZonesOf'));
        expect(sig.slice(0, sig.indexOf('}):'))).not.toContain('departed');
    });
    it('표시용 이름은 따로 만든다 — 계산에 쓰지 않는다', () => {
        expect(goalStateLabel(false, true)).toBe('콜 없음');
        expect(goalStateLabel(true, false)).toBe('경로 생김');
        expect(goalStateLabel(true, true)).toBe('운행 뒤');
    });
});

describe('🔒 구조를 잠근다 — 표가 다시 생기지 못하게', () => {
    it('🔴 목적지 «상태»라는 뭉친 이름이 없다', () => {
        expect(codeOnly).not.toMatch(/\bGoalState\b/);
        expect(codeOnly).not.toMatch(/\.state\b/);
    });

    /**
     * 🔴 조각이 목적지 목록을 훑어 하나로 줄이면, 줄이는 규칙(`every`·`some`)을 재료마다 새로 발명하게 된다.
     *    그 규칙에는 근거가 없고 목적지가 하나 늘 때마다 답이 바뀐다. 「나」에 딸린 사실은 그냥 받는다.
     */
    it('🔴 조각 계산이 목적지 목록을 훑어 하나로 줄이지 않는다', () => {
        const body = codeOnly.slice(codeOnly.indexOf('export function pickupPartsOf'));
        const head = body.slice(0, body.indexOf('\n}'));
        expect(head).not.toMatch(/\.every\(|\.some\(/);
    });

    it('🔴 조각 함수가 목적지 묶음을 인자로 받지 않는다 — 사실만 받는다', () => {
        for (const fn of ['pickupPartsOf', 'dropoffPartsOf']) {
            const at = codeOnly.indexOf(`export function ${fn}`);
            expect(at).toBeGreaterThan(0);
            expect(codeOnly.slice(at, codeOnly.indexOf('{', codeOnly.indexOf('):', at)))).not.toContain('GoalZone');
        }
    });
});

/**
 * 🎯 **목적지는 둘을 합친 것 — 최대 둘이다** (기사님 확정)
 *
 * ```
 * 목적지 = { 필터값 } ∪ { 마지막으로 KEEP 한 콜의 목표값 }
 * ```
 *
 * 첫 콜을 잡을 때는 그 콜의 목표값이 곧 그때의 필터값이라 둘이 같다 — 하나다.
 * 필터값을 바꾸면 마지막 콜의 목표값은 그대로라 **둘**이 된다. 둘 다 올려 미리 잡게 한다.
 * 새 목적지로 가는 콜을 잡으면 마지막 콜의 목표값이 그것이 되어 **저절로 하나**가 된다.
 *
 * 무엇을 막나
 * - **목적지가 셋 이상이 되는 것** — 값이 둘뿐이니 구조적으로 못 된다
 * - **«죽이는» 코드가 생기는 것** — 마지막 콜이 바뀌면 저절로 합쳐진다. 지우는 규칙을 따로 두지 않는다
 * - **집을 특별 취급하는 것** — 복귀는 필터값을 집으로 바꾸는 일일 뿐이다
 */
describe('🎯 목적지 = 필터값 ∪ 마지막 KEEP 콜의 목표값', () => {
    const z = (o: Parameters<typeof goalZonesOf>[0]) => goalZonesOf(o).map(g => g.city);

    it('🔴 첫 콜을 잡을 때는 둘이 같아 하나다', () => {
        expect(z({ filterCity: '파주', lastKeptGoalCity: '파주', homeCity: null, activeCalls: [{ goalCity: '파주' }] }))
            .toEqual(['파주']);
    });

    it('🔴 필터값을 바꾸면 둘이 된다 — 둘 다 올려 미리 잡는다', () => {
        expect(z({ filterCity: '안양', lastKeptGoalCity: '파주', homeCity: null, activeCalls: [{ goalCity: '파주' }] }))
            .toEqual(['안양', '파주']);
    });

    it('🔴 새 목적지로 가는 콜을 잡으면 저절로 하나가 된다 — 지우는 코드가 없다', () => {
        expect(z({ filterCity: '안양', lastKeptGoalCity: '안양', homeCity: null, activeCalls: [{ goalCity: '파주' }, { goalCity: '안양' }] }))
            .toEqual(['안양']);
    });

    it('🔴 셋이 될 수 없다 — 값이 둘뿐이다', () => {
        const r = goalZonesOf({ filterCity: '안양', lastKeptGoalCity: '파주', homeCity: '광주시',
            activeCalls: [{ goalCity: '파주' }, { goalCity: '서울' }, { goalCity: '이천시' }] });
        expect(r.length).toBeLessThanOrEqual(2);
    });

    it('잡은 콜이 없으면 필터값 하나다', () => {
        expect(z({ filterCity: '파주', lastKeptGoalCity: null, homeCity: null, activeCalls: [] }))
            .toEqual(['파주']);
    });

    it('필터값을 모르면 목적지가 없다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(z({ filterCity: null, lastKeptGoalCity: null, homeCity: null, activeCalls: [] })).toEqual([]);
    });

    it('콜이 있나는 **목표값**으로 센다 — 좌표로 가르지 않는다', () => {
        const r = goalZonesOf({ filterCity: '안양', lastKeptGoalCity: '파주', homeCity: null,
            activeCalls: [{ goalCity: '파주' }] });
        expect(r.map(g => [g.city, g.hasCalls])).toEqual([['안양', false], ['파주', true]]);
    });

    it('복귀는 필터값을 집으로 바꾸는 일일 뿐이다 — 집도 그냥 한 곳이다', () => {
        const r = goalZonesOf({ filterCity: '광주시', lastKeptGoalCity: '서울', homeCity: '광주시',
            activeCalls: [{ goalCity: '서울' }] });
        expect(r.map(g => [g.city, g.isHome])).toEqual([['광주시', true], ['서울', false]]);
    });
});

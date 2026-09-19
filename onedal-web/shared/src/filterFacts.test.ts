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
    const callTo = (goalCity: string) => ({ goalCity });
    it('그 목적지로 갈 콜이 있나만 담는다 — 출발 여부는 안 담는다', () => {
        const z = goalZonesOf({ destinationCity: '서울', homeCity: '광주시', homeOn: true, homeCaught: false, activeCalls: [callTo('서울')] });
        expect(z).toEqual([
            { city: '서울', isHome: false, hasCalls: true },
            { city: '광주시', isHome: true, hasCalls: false },
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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickupPartsOf, nearGoalCitiesOf } from './filterArea';

const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (rel: string) => codeOnly(readFileSync(join(__dirname, '../..', rel), 'utf8'));

/**
 * 🎯 **「목적지에 가까이 옴」은 더하기만 한다 — 배선 검사**
 *
 * 기사님: *"근거리 배송의 의미는 그 지역에 있는 콜을 모두 받겠다는 건데, 「목적지에 가까이 옴」이라 했다면
 * 모든 점이 상차지이고 하차지일 수 있어야 한다."*
 * 상차를 목적지 원과 **겹친 곳**으로 두면 «상차만»인 점이 사라진다 — 상차 목록 ⊆ 하차 목록.
 * 「20분 안에 상차」(현위치 원)도 지켜진다.
 *
 * 무엇을 막나
 * - 가까이 왔다고 **현위치 원 전체**를 여는 것 — 권역 밖 뒤쪽 동이 통과한다 (실측: 26.5km 뒤 도척면)
 * - 가까이 왔다고 **라인을 끄는 것** — 콜을 쥐고 달리는 중이면 그 길을 따라가야 한다.
 *   목적지에 닿아 콜을 다 내리면 경로가 없어져 라인이 저절로 사라진다
 * - 서버와 지도가 **각자 다르게 겹치는 것** — 둘이 같은 조각을 써야 갈라지지 않는다
 */
describe('🎯 가까이 옴은 목적지 원을 «더할» 뿐이다', () => {
    const zone = (nearGoal: boolean) => ({ city: '서울', isHome: false, hasCalls: true, nearGoal });

    it('🔴 가까이 와도 라인이 살아 있다 — 목적지 원이 하나 늘 뿐', () => {
        const facts = { departed: true, hasLine: true };
        expect(pickupPartsOf({ ...facts, nearGoalCities: nearGoalCitiesOf([zone(false)]) }))
            .toEqual({ line: true, goalCities: [] });
        expect(pickupPartsOf({ ...facts, nearGoalCities: nearGoalCitiesOf([zone(true)]) }))
            .toEqual({ line: true, goalCities: ['서울'] });
    });

    it('아직 안 떠났으면 라인이 없다 — 가까이 왔든 아니든', () => {
        expect(pickupPartsOf({ departed: false, hasLine: true, nearGoalCities: ['서울'] }).line).toBe(false);
    });

    it('🔴 목적지가 둘일 때 — 가까이 온 것만 원을 준다', () => {
        const zones = [zone(true), { city: '광주시', isHome: true, hasCalls: false, nearGoal: false }];
        expect(nearGoalCitiesOf(zones)).toEqual(['서울']);
    });
});

describe('🔌 배선 — 서버와 지도가 같은 조각을 겹친다', () => {
    it('🔴 서버 상차 목록이 켜진 조각을 전부 겹친다(∩)', () => {
        const geo = read('server/src/services/geoService.ts');
        // 현위치 원은 늘 · 띠와 목적지 원은 켜졌을 때만 — 하나라도 빠지면 영역이 넓어진다
        expect(geo).toMatch(/inMe\(p\)\s*&&\s*\(!useBand \|\| inBand\(p\)\)\s*&&\s*\(goalPts\.length === 0 \|\| inGoal\(p\)\)/);
        // 목적지 원 여럿은 더한다(∪)
        expect(geo).toMatch(/goalPts\.some\(/);
    });

    it('🔴 서버가 조각을 스스로 다시 고르지 않는다 — 부르는 쪽이 정한 것을 받는다', () => {
        const geo = read('server/src/services/geoService.ts');
        expect(geo).toContain('parts: { line: boolean; goalCities: readonly string[] }');
        expect(geo).not.toMatch(/pickupShapeOf|pickupPartsOf\(/);
    });

    it('🔴 지도가 목적지 원 여럿을 겹쳐 그린다', () => {
        const canvas = read('client-app/src/components/dashboard/PinnedRouteCanvas.tsx');
        expect(canvas).toMatch(/goals: Array<\{ at: \{ x: number; y: number \}; km: number \} *>/);
        // 목적지 원이 있어도 라인 띠를 그린다 — 「가까이 옴」이 라인을 끄지 않는다
        expect(canvas).toMatch(/if \(area\.goals\.length\) \{[\s\S]*?c2d\.clip\(\);[\s\S]*?\}\s*\n\s*if \(band\)/);
    });

    it('🔴 관제웹도 서버와 같은 `pickupPartsOf` 를 쓴다 — 두 벌로 계산하지 않는다', () => {
        const stage = read('client-app/src/components/stage/StageView.tsx');
        expect(stage).toContain('pickupPartsOf({');
        expect(stage).toContain('nearGoalCitiesOf(nearZones)');
    });
});

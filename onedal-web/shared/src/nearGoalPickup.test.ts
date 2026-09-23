import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickupPartsOf, nearGoalCitiesOf } from './filterArea';

const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (rel: string) => codeOnly(readFileSync(join(__dirname, '../..', rel), 'utf8'));

/**
 * 🎯 **「목적지에 가까이 옴」이면 상차 조각을 걷는다 — 현위치 원 하나만 남긴다**
 *
 * 기사님: *"근거리 배송의 의미는 그 지역에 있는 콜을 모두 받겠다는 건데, 「목적지에 가까이 옴」이라 했다면
 * 모든 점이 상차지이고 하차지일 수 있어야 한다."*
 * 그리고: *"원의 점들이 모두 보라색이어야 상차도 되고 하차도 되는 지역이 되는 거다."*
 * 지도의 보라색 점은 **상차 목록과 하차 목록에 둘 다 든 동**이다 (`PinnedRouteCanvas` 의 `dongDots.both`).
 *
 * 무엇을 막나
 * - 가까이 왔는데 **조각을 더하는 것** — 조각은 전부 교집합이라 더할수록 좁아진다.
 *   실주행에서 목적지 앞 40초 만에 상차 목록이 **13곳 → 3곳**으로 조여 화면의 콜이 전부 막혔다
 * - 가까이 왔는데 **라인을 그대로 두는 것** — 목적지에 다가갈수록 남은 길이 짧아 띠가 사라진다
 * - 서버와 지도가 **각자 다르게 겹치는 것** — 둘이 같은 조각을 써야 갈라지지 않는다
 *
 * 🔴 「20분 안에 상차」(현위치 원)는 그대로다 — 걷는 것은 라인과 목적지 원뿐이다.
 */
describe('🎯 가까이 옴이면 현위치 원만 본다', () => {
    const zone = (nearGoal: boolean) => ({ city: '서울', isHome: false, hasCalls: true, nearGoal });

    /** 🔴 이 검사가 생긴 까닭 — 실주행에서 상차 목록이 3곳으로 조여 콜이 전부 막혔다 */
    it('🔴 가까이 오면 라인도 목적지 원도 안 건다', () => {
        expect(pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: nearGoalCitiesOf([zone(true)]) }))
            .toEqual({ line: false, goalCities: [] });
    });

    it('🔴 멀면 지금까지처럼 라인을 건다 — 달리는 길 위에서만 싣는다', () => {
        expect(pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: nearGoalCitiesOf([zone(false)]) }))
            .toEqual({ line: true, goalCities: [] });
    });

    it('아직 안 떠났으면 라인이 없다 — 가까이 왔든 아니든', () => {
        expect(pickupPartsOf({ departed: false, hasLine: true, nearGoalCities: ['서울'] }).line).toBe(false);
        expect(pickupPartsOf({ departed: false, hasLine: true, nearGoalCities: [] }).line).toBe(false);
    });

    it('🔴 목적지가 둘이어도 하나만 가까우면 조각을 걷는다', () => {
        const zones = [zone(true), { city: '광주시', isHome: true, hasCalls: false, nearGoal: false }];
        expect(nearGoalCitiesOf(zones)).toEqual(['서울']);
        expect(pickupPartsOf({ departed: true, hasLine: true, nearGoalCities: nearGoalCitiesOf(zones) }))
            .toEqual({ line: false, goalCities: [] });
    });
});

describe('🔌 배선 — 서버와 지도가 같은 조각을 겹친다', () => {
    it('🔴 서버 상차 목록이 켜진 조각을 전부 겹친다(∩)', () => {
        const geo = read('server/src/services/geoService.ts');
        expect(geo).toMatch(/inMe\(p\)\s*&&\s*\(!useBand \|\| inBand\(p\)\)\s*&&\s*\(goalPts\.length === 0 \|\| inGoal\(p\)\)/);
    });

    it('🔴 서버가 조각을 스스로 다시 고르지 않는다 — 부르는 쪽이 정한 것을 받는다', () => {
        const geo = read('server/src/services/geoService.ts');
        expect(geo).toContain('parts: { line: boolean; goalCities: readonly string[] }');
        expect(geo).not.toMatch(/pickupShapeOf|pickupPartsOf\(/);
    });

    it('🔴 관제웹도 서버와 같은 `pickupPartsOf` 를 쓴다 — 두 벌로 계산하지 않는다', () => {
        const stage = read('client-app/src/components/stage/StageView.tsx');
        expect(stage).toContain('pickupPartsOf({');
        expect(stage).toContain('nearGoalCitiesOf(nearZones)');
    });
});

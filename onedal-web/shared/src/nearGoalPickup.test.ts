import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickupShapeOf } from './filterArea';

const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (rel: string) => codeOnly(readFileSync(join(__dirname, '../..', rel), 'utf8'));

/**
 * 🎯 **목적지에 가까이 왔으면 상차 영역은 «현위치 원 ∩ 목적지 원»이다** (기사님 확정 · 「나」안)
 *
 * 기사님: *"근거리 배송의 의미는 그 지역에 있는 콜을 모두 받겠다는 건데, 「목적지에 가까이 옴」이라 했다면
 * 모든 점이 상차지이고 하차지일 수 있어야 한다."*
 *
 * 그런데 상차는 **현위치 원**, 하차는 **목적지 원**이라 중심이 달라 두 목록이 절대 같아지지 않았다.
 * 상차를 두 원의 **겹친 곳**으로 두면 «상차만»인 점이 사라진다 — 상차 목록 ⊆ 하차 목록.
 * 「20분 안에 상차」(현위치 원)도 지켜진다.
 *
 * 무엇을 막나
 * - 목적지에 가까이 왔다고 **현위치 원 전체**를 상차로 여는 것 — 권역 밖 뒤쪽 동이 통과한다.
 *   2026-09-20: 복정에서 서울로 가는 중에 26.5km 뒤 도척면이 상차 목록에 들어왔다 (잡으면 왕복 53km)
 * - 가까이 왔는데 **라인으로 자르는 것** — 권역 안에서는 방향을 안 따진다 (기사님 확정)
 */
describe('🎯 목적지에 가까이 왔을 때의 상차 영역', () => {
    const zone = (o: Partial<{ state: 'idle' | 'routed' | 'driving'; nearGoal: boolean }>) =>
        ({ city: '서울', isHome: false, state: 'idle' as const, ...o });

    it('🔴 가까이 왔으면 «현위치 원 ∩ 목적지 원» — 현위치 원 전체가 아니다', () => {
        expect(pickupShapeOf([zone({ state: 'driving', nearGoal: true })])).toBe('meGoal');
        expect(pickupShapeOf([zone({ state: 'idle', nearGoal: true })])).toBe('meGoal');
        expect(pickupShapeOf([zone({ state: 'routed', nearGoal: true })])).toBe('meGoal');
    });

    it('🔴 가까이 안 왔고 운행 뒤면 «현위치 원 ∩ 라인» — 뒤쪽을 자른다', () => {
        expect(pickupShapeOf([zone({ state: 'driving', nearGoal: false })])).toBe('meLine');
    });

    it('가까이 안 왔고 아직 안 떠났으면 현위치 원 전체', () => {
        expect(pickupShapeOf([zone({ state: 'idle', nearGoal: false })])).toBe('me');
        expect(pickupShapeOf([zone({ state: 'routed', nearGoal: false })])).toBe('me');
    });

    it('🔴 목적지가 둘일 때 — 하나라도 가까이 왔으면 그 목적지 권역이 열린다', () => {
        expect(pickupShapeOf([
            zone({ state: 'driving', nearGoal: false }),
            zone({ state: 'driving', nearGoal: true }),
        ])).toBe('meGoal');
    });

    it('목적지가 없으면 모양도 없다 — 빈 목록은 «고장»으로 막힌다', () => {
        expect(pickupShapeOf([])).toBeNull();
    });
});

/**
 * 🔴 **모양을 냈는데 아무도 안 쓰면 아무 일도 안 일어난다** — 서버 목록과 지도가 같은 모양을 봐야 한다 (규칙 ③).
 */
describe('🎯 서버 목록과 지도가 같은 모양을 쓴다 (배선)', () => {
    it('🔴 서버 상차 목록이 목적지 원과 겹친다', () => {
        const geo = read('server/src/services/geoService.ts');
        expect(geo).toMatch(/'meGoal'/);
        expect(geo).toMatch(/destinationRadiusKm/);
    });

    it('🔴 지도도 목적지 원으로 겹쳐 그린다', () => {
        expect(read('client-app/src/components/stage/StageView.tsx')).toMatch(/pickupShape === 'meGoal'/);
        expect(read('client-app/src/components/dashboard/PinnedRouteCanvas.tsx')).toMatch(/area\.goal/);
    });
});

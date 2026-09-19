import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickupPartsOf } from './filterArea';

/**
 * 🟢 **상차 영역 — 재료마다 스위치를 따로 둔다** (`docs/기획/필터_재료_스위치_표.md`)
 *
 * 무엇을 막나
 * - **모양 하나를 통째로 고르는 것** — 그러면 조건 하나가 재료 여럿의 스위치를 동시에 누른다.
 *   「목적지에 가까이 옴」이 라인까지 끄면, 서울로 가는 중에 서남쪽 상차가 통과한다.
 *   거리를 넓히는 일(반경)과 방향을 버리는 일(라인 끄기)은 다른 일이다
 * - **켜진 재료를 합치는 것(∪)** — 상차는 전부 겹쳐야(∩) 좁아진다
 *
 * 🔴 **「목적지에 가까이 옴」은 라인을 끄지 않는다** (기사님 확정 · ①).
 *    목적지에 닿아 콜을 다 내리면 상태가 «콜 없음»이 되어 **라인이 저절로 없어진다.**
 *    콜을 쥐고 달리는 중이면 가까이 왔든 아니든 그 길을 따라가야 한다.
 */
describe('🟢 상차 영역의 재료 스위치', () => {
    const z = (state: 'idle' | 'routed' | 'driving', nearGoal = false) =>
        ({ city: '서울', isHome: false, state, nearGoal });

    it('콜 없음 · 경로 생김 — 현위치 원만', () => {
        expect(pickupPartsOf([z('idle')])).toEqual({ me: true, line: false, goal: false });
        expect(pickupPartsOf([z('routed')])).toEqual({ me: true, line: false, goal: false });
    });

    it('운행 뒤 — 현위치 원 ∩ 라인 (뒤쪽을 자른다)', () => {
        expect(pickupPartsOf([z('driving')])).toEqual({ me: true, line: true, goal: false });
    });

    it('🔴 가까이 옴 — 목적지 원을 더한다', () => {
        expect(pickupPartsOf([z('idle', true)])).toEqual({ me: true, line: false, goal: true });
    });

    it('🔴 가까이 옴 + 운행 뒤 — 라인이 **그대로 켜져 있다** (①)', () => {
        expect(pickupPartsOf([z('driving', true)])).toEqual({ me: true, line: true, goal: true });
    });

    it('🔴 목적지 둘 — 하나라도 가까우면 목적지 원을 더하고, 전부 운행 뒤일 때만 라인을 켠다', () => {
        expect(pickupPartsOf([z('driving', false), z('driving', true)]))
            .toEqual({ me: true, line: true, goal: true });
        // 하나가 아직 안 떠났으면 라인이 없는 목적지가 있다 — 자를 수 없다
        expect(pickupPartsOf([z('idle', false), z('driving', true)]))
            .toEqual({ me: true, line: false, goal: true });
    });

    it('목적지가 없으면 재료도 없다 — 빈 목록은 «고장»으로 막힌다', () => {
        expect(pickupPartsOf([])).toBeNull();
    });

    it('🔴 현위치 원은 늘 켜져 있다 — 20분 안에 못 가면 못 싣는다', () => {
        for (const s of ['idle', 'routed', 'driving'] as const)
            for (const n of [false, true])
                expect(pickupPartsOf([z(s, n)])!.me).toBe(true);
    });
});

/**
 * 🔴 **재료를 냈는데 아무도 안 쓰면 아무 일도 안 일어난다** — 서버 목록과 지도가 같은 답을 봐야 한다 (규칙 ③).
 */
describe('🟢 서버 목록과 지도가 같은 재료를 쓴다 (배선)', () => {
    const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const read = (rel: string) => codeOnly(readFileSync(join(__dirname, '../..', rel), 'utf8'));

    it('🔴 서버 상차 목록이 켜진 재료를 전부 겹친다', () => {
        const geo = read('server/src/services/geoService.ts');
        expect(geo).toMatch(/pickupPartsOf\(/);
        expect(geo).toMatch(/inMe\(p\) && \(!useLine \|\| inLine\(p\)\) && \(!useGoal \|\| inGoal\(p\)\)/);
    });

    it('🔴 지도도 같은 함수를 본다', () => {
        const stage = read('client-app/src/components/stage/StageView.tsx');
        expect(stage).toMatch(/pickupPartsOf\(nearZones\)/);
        expect(stage).toMatch(/pickupParts\?\.line/);
        expect(stage).toMatch(/pickupParts\.goal/);
    });

    it('🔴 옛 «모양 하나» 함수는 사라졌다 — 되살아나면 조건 하나가 재료 여럿을 다시 끈다', () => {
        for (const f of ['shared/src/filterArea.ts', 'server/src/services/geoService.ts',
                         'client-app/src/components/stage/StageView.tsx'])
            expect(read(f)).not.toMatch(/pickupShapeOf/);
    });
});

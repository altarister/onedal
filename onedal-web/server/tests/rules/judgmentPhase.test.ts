import { judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot, PHASE_LABEL, resolvePhaseKey } from '@onedal/shared';
import { mergeFacts } from '../../src/core/engine/judgeFacts';
import fs from 'fs';
import path from 'path';

/**
 * 🏗️ **판정이 국면을 안다** (Step 5.6 · 기반 공사)
 *
 * ── 왜 ──
 *
 * 🔴 **정차 중 합짐과 주행 중 합짐이 판정에서 완전히 같다.** 콜 필터는 둘을 다르게 보는데
 *    (모을 땐 상차 반경 · 뛸 땐 라인) 판정은 같은 잣대를 쓴다.
 *    국면이 판정까지 오지 않으면 Step 6·7 의 잣대를 넣을 자리가 없다.
 *
 * ── 어떻게 ──
 *
 * 국면은 이미 있다 — `resolvePhaseKey(callTarget, dispatchPhase)` 가 네 갈래를 내고
 * `PHASE_LABEL` 이 이름을 안다. 판정은 **받아서 딱지로 말한다**.
 *
 * 🔴 **이 판은 색을 안 바꾼다.** 기반만 깐다 — 잣대가 갈라지는 것은 Step 6·7 이다.
 *    그래서 «잰 쪽이 어떻게 쟀는지 말한다»만 지금 지킨다.
 */

const cfg = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

const 합짐 = (over: Record<string, unknown> = {}) => mergeFacts({
    fare: 50_000, extraMinutes: 30, bufferAfterMin: 20, freePct: 40,
    conflicts: [], excludedHits: [], lateStops: [], tags: [], phase: 'merge', ...over,
});

describe('🏗️ 판정이 국면을 안다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 둘이 구별되지 않았다 */
    it('🔴 정차 중과 주행 중이 다른 딱지를 단다', () => {
        const 모을때 = toSnapshot(judge(CRITERIA, 합짐({ phase: 'merge' }), cfg));
        const 뛸때 = toSnapshot(judge(CRITERIA, 합짐({ phase: 'drive' }), cfg));
        expect(모을때.tags).not.toEqual(뛸때.tags);
    });

    it('딱지 이름을 지어내지 않는다 — `PHASE_LABEL` 이 원천이다', () => {
        for (const key of ['merge', 'drive'] as const) {
            const v = toSnapshot(judge(CRITERIA, 합짐({ phase: key }), cfg));
            expect(v.tags).toContain(PHASE_LABEL[key]);
        }
    });

    it('원래 딱지를 밀어내지 않는다 — 덧붙인다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐({ tags: ['정차 미확인(일반값)'] }), cfg));
        expect(v.tags).toContain('정차 미확인(일반값)');
        expect(v.tags).toContain(PHASE_LABEL.merge);
    });

    /** 🔴 기반 공사다 — 색이 바뀌면 이 판이 아니다 */
    it('🔴 국면이 색을 바꾸지 않는다 — 잣대는 Step 6·7 이 가른다', () => {
        const a = toSnapshot(judge(CRITERIA, 합짐({ phase: 'merge' }), cfg));
        const b = toSnapshot(judge(CRITERIA, 합짐({ phase: 'drive' }), cfg));
        expect(a.color).toBe(b.color);
        expect(a.score).toBe(b.score);
    });

    /** 네 갈래를 가르는 곳은 한 곳이다 (규칙 ③) */
    it('국면 파생은 `resolvePhaseKey` 하나가 한다', () => {
        expect(resolvePhaseKey('DEST', 'GATHERING')).toBe('merge');
        expect(resolvePhaseKey('DEST', 'DELIVERING')).toBe('drive');
        expect(resolvePhaseKey('HOME', 'DELIVERING')).toBe('drive');
    });

    /** 🔗 사슬 — 서버가 구해서 넘기지 않으면 위 검사는 다 초록인데 화면은 그대로다 */
    it('🔴 합짐을 부르는 자리가 국면을 구해서 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        expect(src).toMatch(/resolvePhaseKey\(/);
        const spots = [...src.matchAll(/mergeFacts\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            const call = src.slice(i, src.indexOf('}), judgmentCfg', i));
            /** 🔴 «가르는 함수를 쓰는가» 를 본다 — 값을 박아 넣으면 빨간불 */
            expect(call).toMatch(/phase:\s*resolvePhaseKey\(/);
        }
    });
});

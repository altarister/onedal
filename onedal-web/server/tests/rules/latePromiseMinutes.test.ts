import { judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot } from '@onedal/shared';
import { mergeFacts, lateStopsOf } from '../../src/core/engine/judgeFacts';
import fs from 'fs';
import path from 'path';

/**
 * ⏰ **몇 분 늦는지를 화면이 말한다** (Step 5.5-2)
 *
 * ── 왜 ──
 *
 * 🔴 **색은 이미 옳다 — 건드리지 않는다.** `lateStops` 에 들어오는 약속은
 *    통화로 굳힌 것뿐이라(`hardFailIsConfirmed.test.ts`) 깨지면 사고가 맞다 (기사님 확정).
 *
 * 모자란 것은 **말**이다. 서버는 «12분 깨집니다»를 이미 알고 있는데
 * (`deriveRouteTimeline` 의 `lateMinutes`), 판정에는 `null` 로 넘겨
 * 기사님이 화면에서 1분인지 60분인지 못 보셨다.
 *
 * ── 어떻게 ──
 *
 * 이미 잰 분을 그대로 싣는다. 문장도 한 곳에서 만들어 조건(`gates`)과 판정이 같은 말을 한다 (규칙 ③).
 */

const cfg = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

const 합짐 = (over: Record<string, unknown> = {}) => mergeFacts({
    fare: 50_000, extraMinutes: 30, bufferAfterMin: 20, freePct: 40,
    conflicts: [], excludedHits: [], tags: [], lateStops: [], phase: 'merge' as const, ...over,
});

const 늦음 = (label: string, lateMinutes: number) => ({ label, lateMinutes });

describe('⏰ 약속 지연 — 몇 분인지 화면이 말한다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 분을 알면서 null 로 넘겼다 */
    it('🔴 잰 분이 그대로 실린다 — 1분과 60분이 달라 보여야 한다', () => {
        const f = 합짐({ lateStops: [늦음('합짐1콜 하차 약속', 12)] });
        expect(f.promise!.lateStops).toEqual([{ label: '합짐1콜 하차 약속', lateMinutes: 12 }]);
    });

    it('여러 정거장이 늦으면 각각 남는다 — 하나로 뭉치지 않는다', () => {
        const f = 합짐({ lateStops: [늦음('합짐1콜 상차 약속', 5), 늦음('합짐2콜 하차 약속', 40)] });
        expect(f.promise!.lateStops.map(s => s.lateMinutes)).toEqual([5, 40]);
    });

    it('🔴 화면 이유에 분이 보인다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐({ lateStops: [늦음('합짐1콜 하차 약속', 12)] }), cfg));
        expect(JSON.stringify(v)).toMatch(/12분/);
    });

    /** 🔴 색은 그대로다 — 이 판은 «말»만 고친다 (기사님 확정) */
    it('🔴 깨진 약속은 여전히 사고다 — 분이 작아도 봐주지 않는다', () => {
        for (const mins of [1, 12, 60]) {
            const v = toSnapshot(judge(CRITERIA, 합짐({ lateStops: [늦음('합짐1콜 하차 약속', mins)] }), cfg));
            expect(v.color).toBe('사고');
        }
    });

    it('늦는 약속이 없으면 그대로 점수다 — 이 판이 멀쩡한 콜을 안 건드린다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐(), cfg));
        expect(v.color).not.toBe('사고');
    });

    /** 🔴 분을 지어내지 않는다 (규칙 ④) — 못 쟀으면 문장만 남는다 */
    it('🔴 분을 모르면 null 그대로다 — 0 을 넣지 않는다', () => {
        const f = 합짐({ lateStops: [{ label: '어떤 약속', lateMinutes: null }] });
        expect(f.promise!.lateStops[0].lateMinutes).toBeNull();
    });

    /**
     * 🔗 **재는 곳을 직접 문다** — 문자열 검사는 «넘긴다»만 보지 «제대로 재서 넘기나»를 못 본다.
     *    (변이 검수에서 드러났다: 분을 `null` 로 바꿔도, 빈 목록을 넘겨도 전부 초록이었다.)
     */
    it('🔴 잰 분을 그대로 옮긴다 — 자리표시자로 바꾸지 않는다', () => {
        const out = lateStopsOf(
            [{ orderId: 'a1', stopType: 'dropoff', lateMinutes: 12 }],
            () => '합짐1콜',
        );
        expect(out).toEqual([{ label: '합짐1콜 하차 약속', lateMinutes: 12 }]);
    });

    it('상차·하차를 가려 적는다 — 어디가 깨지는지 보셔야 한다', () => {
        const out = lateStopsOf(
            [{ orderId: 'a1', stopType: 'pickup', lateMinutes: 5 },
             { orderId: 'b2', stopType: 'dropoff', lateMinutes: 40 }],
            id => (id === 'a1' ? '합짐1콜' : '합짐2콜'),
        );
        expect(out.map(s => s.label)).toEqual(['합짐1콜 상차 약속', '합짐2콜 하차 약속']);
        expect(out.map(s => s.lateMinutes)).toEqual([5, 40]);
    });

    it('늦는 정거장이 없으면 빈손이다', () => {
        expect(lateStopsOf([], () => '합짐1콜')).toEqual([]);
    });

    /** 🔴 조건 문장과 판정이 같은 말을 해야 한다 — 두 곳에서 지으면 갈라진다 (규칙 ③) */
    it('🔴 늦음 문장을 두 곳에서 짓지 않는다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        expect((src.match(/약속이 \$\{/g) ?? []).length).toBeLessThanOrEqual(1);
        expect(codeOnly('judgeFacts.ts')).not.toMatch(/routePromiseGuard/);
    });

    /** 🔗 사슬 — 서버가 재서 넘기지 않으면 위 검사는 다 초록인데 화면은 그대로다 */
    it('🔴 합짐을 부르는 자리가 늦음 목록을 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        const spots = [...src.matchAll(/mergeFacts\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            const call = src.slice(i, src.indexOf('}), judgmentCfg', i));
            expect(call).toMatch(/lateStops/);
            expect(call).not.toMatch(/lateStops:\s*\[\s*\]/);   // 빈손을 박지 않는다
        }
        expect(src).toMatch(/lateStopsOf\(/);                       // 재는 곳을 쓴다
    });
});

import { judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot } from '@onedal/shared';
import { firstLoadFacts, mergeFacts } from '../../src/core/engine/judgeFacts';
import fs from 'fs';
import path from 'path';

/**
 * 🧪 **서버가 찾아 놓은 제외어를 색이 말하게 한다** (규칙 ⑤-3)
 *
 * ── 왜 ──
 *
 * 「성질」 기준은 다 만들어져 있다 — `criteria.ts` 의 `NATURE` 는 `excludedHits` 가 차 있으면
 * 무조건 빨간불을 낸다. 그런데 **재료를 한 번도 안 채웠다** (`judgeFacts.ts` 가 `[]` 하드코딩).
 *
 * 🔴 서버는 이미 제외어를 찾고 있다 — `OrderEvaluator.runStage1ShapeFilter` 가
 *    적요(`detailMemo`)와 원문(`rawText`)까지 합쳐 훑고 «제외키워드(…) 감지»를 남긴다.
 *    다만 그 목록이 **판정으로 안 건너간다.** 무방비가 아니라 **말을 안 하는 것**이라,
 *    기사님이 색만 보시면 놓친다.
 *
 * 🔴 **앱 필터를 안 거치는 콜이 있다** — 카카오픽커(OCR)와 손으로 잡은 콜.
 *    지금 기사님이 쓰시는 게 픽커다.
 *
 * ── 어떻게 ──
 *
 * 찾은 목록을 **옮겨 담기만** 한다. 여기서 다시 훑으면 같은 계산이 두 곳에 산다 (규칙 ③) —
 * `judgeFacts.ts` 머리가 적어 둔 대로 «이 파일에 산술이 생기면 잘못 만든 것»이다.
 */

const cfg = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')       // 블록 주석
        .replace(/(^|[^:])\/\/.*$/gm, '$1');    // 줄 주석 (URL 의 // 는 남긴다)

const 합짐 = (over: Record<string, unknown> = {}) => mergeFacts({
    fare: 50_000, extraMinutes: 30, bufferAfterMin: 20, freePct: 40,
    gates: [], conflicts: [], tags: [], excludedHits: [], ...over,
});

const 첫짐 = (over: Record<string, unknown> = {}) => firstLoadFacts({
    fare: 50_000, totalMinutes: 60, tags: [], excludedHits: [], ...over,
});

describe('🧪 제외어 — 서버가 찾은 것이 색에 실린다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 재료가 빈 채로 돌고 있었다 */
    it('🔴 합짐: 찾은 제외어가 판정 재료에 그대로 실린다', () => {
        expect(합짐({ excludedHits: ['착불'] }).nature!.excludedHits).toEqual(['착불']);
    });

    it('🔴 첫짐: 빈 차라도 이 콜 자체의 성질은 본다', () => {
        expect(첫짐({ excludedHits: ['까대기'] }).nature!.excludedHits).toEqual(['까대기']);
    });

    /** 🔴 색이 말해야 한다 — 기사님은 색만 보고 1~2초에 누르신다 (규칙 ⑤-3) */
    it('🔴 제외어가 있으면 합짐 색이 사고다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐({ excludedHits: ['착불'] }), cfg));
        expect(v.color).toBe('사고');
    });

    it('🔴 제외어가 있으면 첫짐 색도 사고다 — 빈 차라고 봐주지 않는다', () => {
        const v = toSnapshot(judge(CRITERIA, 첫짐({ excludedHits: ['수거'] }), cfg));
        expect(v.color).toBe('사고');
    });

    it('왜 떨어졌는지 이유에 그 낱말이 남는다 — 화면이 말해 준다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐({ excludedHits: ['착불', '까대기'] }), cfg));
        expect(JSON.stringify(v)).toMatch(/착불/);
    });

    it('제외어가 없으면 이 판은 아무것도 안 바꾼다', () => {
        const v = toSnapshot(judge(CRITERIA, 합짐(), cfg));
        expect(v.color).not.toBe('사고');
    });

    /** 🔴 다시 그 모양이 생기지 않게 잠근다 — 빈 배열을 박으면 재료가 영영 안 온다 */
    it('🔴 `excludedHits: []` 를 코드에 박지 않는다 — 받은 것을 넘긴다', () => {
        expect(codeOnly('judgeFacts.ts')).not.toMatch(/excludedHits:\s*\[\s*\]/);
    });

    /**
     * 🔴 **판정을 부르는 자리마다 넘겨야 한다** — 한 곳만 빠지면 그 갈래에서만 조용히 눈감는다.
     *    단위 검사는 `judgeFacts` 안만 보므로 «안 넘기는 것»을 못 잡는다. 그래서 자리를 센다.
     */
    it('🔴 판정을 부르는 자리 모두 제외어를 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        const spots = [...src.matchAll(/(firstLoadFacts|mergeFacts)\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            const call = src.slice(i, src.indexOf('}), judgmentCfg', i));
            expect(call).toMatch(/excludedHits/);
        }
    });

    /** 🔴 같은 계산을 두 곳에 두지 않는다 (규칙 ③) — 훑는 곳은 형상 필터 하나다 */
    it('🔴 제외어를 훑는 곳은 한 곳뿐이다 — 판정이 다시 훑지 않는다', () => {
        expect(codeOnly('judgeFacts.ts')).not.toMatch(/excludedKeywords/);
        const hits = codeOnly('OrderEvaluator.ts').match(/for\s*\(\s*const\s+\w+\s+of\s+filter\.excludedKeywords/g) ?? [];
        expect(hits.length).toBe(1);
    });
});

/**
 * 🔗 **사슬의 첫 고리** — 「찾는다 → 판정 재료로 넘어간다」 중 앞쪽.
 *    위 검사들은 `judgeFacts` 안만 보므로, **형상 필터가 아예 안 모으는 것**을 못 잡는다
 *    (변이 검수에서 드러났다: `excludedHits.push` 를 지워도 초록이었다).
 */
describe('🔗 형상 필터가 적요에서 제외어를 찾는다', () => {
    const { OrderEvaluator } = require('../../src/core/engine/OrderEvaluator');

    const 훑기 = (order: Record<string, unknown>, excludedKeywords: string[]) => {
        const ev: any = new OrderEvaluator('insung');
        const session = { activeFilter: { excludedKeywords, isSharedMode: false } };
        return ev.runStage1ShapeFilter(
            { pickup: '', dropoff: '', detailMemo: '', ...order }, session, [], [],
        ).excludedHits as string[];
    };

    it('🔴 적요에 든 제외어를 찾는다 — 픽커·수동 콜이 여기로 들어온다', () => {
        expect(훑기({ detailMemo: '착불 · 3층까지' }, ['착불'])).toEqual(['착불']);
    });

    it('🔴 앱이 안 나눠 준 원문(rawText)도 훑는다 — OCR 콜은 칸이 덜 채워진다', () => {
        expect(훑기({ rawText: '까대기 있음' }, ['까대기'])).toEqual(['까대기']);
    });

    it('주소에 든 것도 찾는다', () => {
        expect(훑기({ dropoff: '수거 전용 창고' }, ['수거'])).toEqual(['수거']);
    });

    it('없으면 빈손이다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(훑기({ detailMemo: '멀쩡한 콜' }, ['착불'])).toEqual([]);
    });

    it('설정이 비어 있으면 훑을 것이 없다', () => {
        expect(훑기({ detailMemo: '착불' }, [])).toEqual([]);
    });
});

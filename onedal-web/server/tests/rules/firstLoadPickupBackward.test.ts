import { judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot, isPickupBackward } from '@onedal/shared';
import { firstLoadFacts, mergeFacts, pickupBackwardOf } from '../../src/core/engine/judgeFacts';
import fs from 'fs';
import path from 'path';

/**
 * 🔙 **등 뒤 상차는 첫짐에서 사고다** (Step 5.5-3)
 *
 * ── 왜 ──
 *
 * 합짐은 등 뒤 상차의 나쁨을 「돈」이 이미 센다 — 한계 우회 분이 늘어나 값이 깎인다.
 * 🔴 **첫짐은 이전 경로가 없어 한계 우회가 0 이다.** 되돌아가는 15km 를 아무도 안 센다.
 *
 * 볼트 7번(대전 · 목적지까지 «상차 152 : 하차 26 : 현위치 137»)이 그 모양이고,
 * 그 콜만 취소로 끝났다 (`callNet.ts` 검산 주석 · 노하우_추출 표 «남은 거리»).
 *
 * ── 어떻게 ──
 *
 * 그물이 쓰는 식(`isPickupBackward`)을 **그대로** 쓴다 — 판정이 자기 식을 새로 만들면
 * 두 곳이 언젠가 갈라진다 (규칙 ③). 새 설정값도 만들지 않는다: 목적지·현위치·상차 반경은
 * 이미 있는 값이다 (규칙 ⑤-4 를 안 열어도 되는 까닭).
 *
 * 🔴 **못 쟀으면 깎지 않는다** (규칙 ⑤-2) — 목적지를 안 정하셨으면 잴 수가 없다.
 */

const cfg = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 볼트 7번 모양 — 대전에서 김포(목적지)로 가는데 상차지가 등 뒤였다 */
const 대전 = { x: 127.38, y: 36.35 };
const 등뒤상차 = { x: 127.45, y: 36.22 };   // 대전보다 목적지에서 더 멀다
const 앞쪽상차 = { x: 127.30, y: 36.50 };   // 목적지 쪽
const 잰다 = (me: typeof 대전 | null, pickup: { x?: number | null; y?: number | null }, goalCity = '김포시') =>
    pickupBackwardOf({ me, pickup, goalCity, pickupRadiusKm: 5 });

const 첫짐 = (over: Record<string, unknown> = {}) => firstLoadFacts({
    fare: 50_000, totalMinutes: 60, tags: [], excludedHits: [],
    pickupBackward: null, ...over,
});

describe('🔙 등 뒤 상차 — 첫짐에서만 잰다', () => {

    it('🔴 그물이 쓰는 식 그대로다 — 여유는 상차 반경이다', () => {
        expect(isPickupBackward(152, 137, 10)).toBe(true);    // 볼트 7번
        expect(isPickupBackward(152, 137, 20)).toBe(false);   // 반경이 넓으면 살린다
    });

    it('좌표로 재면 등 뒤를 잡는다', () => {
        expect(잰다(대전, 등뒤상차)).toBe(true);
    });

    it('앞쪽 상차는 등 뒤가 아니다 — 이 판이 멀쩡한 콜을 안 건드린다', () => {
        expect(잰다(대전, 앞쪽상차)).toBe(false);
    });

    /** 🔴 없는 것을 0 으로 채우지 않는다 (규칙 ④) */
    it('🔴 목적지를 안 정하셨으면 «못 쟀다» 다 — false 가 아니다', () => {
        expect(잰다(대전, 등뒤상차, '')).toBeNull();           // 목적지 미설정
        expect(잰다(null, 등뒤상차)).toBeNull();                 // 내 위치 모름
        expect(잰다(대전, { x: null, y: null })).toBeNull();     // 상차지 좌표 없음
    });

    /** 🔴 이 검사가 생긴 까닭 — 첫짐에는 한계 우회가 없다 */
    it('🔴 첫짐이 등 뒤 상차면 사고다', () => {
        const v = toSnapshot(judge(CRITERIA, 첫짐({ pickupBackward: true }), cfg));
        expect(v.color).toBe('사고');
    });

    it('왜 막혔는지 화면이 말한다', () => {
        const v = toSnapshot(judge(CRITERIA, 첫짐({ pickupBackward: true }), cfg));
        expect(JSON.stringify(v)).toMatch(/등 뒤|역주행/);
    });

    it('앞쪽 상차면 색을 안 건드린다', () => {
        const v = toSnapshot(judge(CRITERIA, 첫짐({ pickupBackward: false }), cfg));
        expect(v.color).not.toBe('사고');
    });

    /** 🔴 모르는 값은 불리하게 가정하지 않는다 (규칙 ⑤-2) */
    it('🔴 못 쟀으면 깎지 않는다', () => {
        const v = toSnapshot(judge(CRITERIA, 첫짐({ pickupBackward: null }), cfg));
        expect(v.color).not.toBe('사고');
    });

    /** 🔴 합짐은 「돈」이 이미 센다 — 두 번 깎으면 가는 길 좋은 콜을 놓친다 (규칙 ③) */
    it('🔴 합짐은 이 판을 안 본다 — 한계 우회가 이미 셌다', () => {
        const v = toSnapshot(judge(CRITERIA, mergeFacts({
            fare: 50_000, extraMinutes: 30, bufferAfterMin: 20, freePct: 40,
            gates: [], conflicts: [], excludedHits: [], tags: [],
        }), cfg));
        expect(v.color).not.toBe('사고');
    });

    /**
     * 🔗 **사슬의 끝 고리** — 단위 검사는 `judgeFacts` 안만 본다.
     *    서버가 **재서 넘기지 않으면** 재료가 늘 `null` 인데 위 검사들은 다 초록이다.
     */
    it('🔴 첫짐을 부르는 자리 모두 등 뒤 상차를 재서 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        const spots = [...src.matchAll(/firstLoadFacts\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            expect(src.slice(i, src.indexOf('}), judgmentCfg', i))).toMatch(/pickupBackwardOf\(/);
        }
    });

    /** 🔴 식은 한 곳에만 산다 — 판정이 자기 식을 만들면 그물과 갈라진다 */
    it('🔴 판정이 자기 역주행 식을 만들지 않는다', () => {
        expect(codeOnly('judgeFacts.ts')).toMatch(/isPickupBackward/);
        expect(codeOnly('judgeFacts.ts')).not.toMatch(/distMeKm\s*\+/);
    });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { planMergedStops } from '../../src/services/routeComposer';

/**
 * 🧮 **우회는 «같은 시각·같은 기점»의 두 경로를 빼야 한다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"상차지를 지났는데 왜 파랑이었는지."*
 *
 * 실측 로그 — 되돌아가는 콜인데 우회가 **음수**로 나왔다:
 *
 *     09:17:37  현위치 127.4072,37.3000  (인삼농협 근처 — 동원대를 이미 지남)
 *     09:17:42  127.4061,37.3031  ↑ 북쪽으로 되돌아감
 *     09:17:47  127.4022,37.3290  동원대 도착 — 실제로 되돌아갔다
 *     09:17:41  🎨 [판정] 🔵 70점 — 딱지: **우회 -9분 · -4.6km**
 *
 * ── 왜 음수가 나왔나 ──
 * 두 값이 **각각 다른 이유로** 틀렸다:
 *
 *   `timeDiffMin`(카카오)  기점 ✅ 현위치 · 기준 ❌ **첫짐 단독**  → 부풀림
 *   `prevTotal`(저장값)    기점 ❌ **낡음**    · 기준 ✅ 직전 전체 → 축소
 *
 * 2026-08-21 에 «부풀림»을 잡으려 `prevTotal` 로 갈아탔는데, 그게 «축소»를 새로
 * 들여왔다. 저장값은 **KEEP 하던 시각·그때의 기점**에서 잰 것이라, 기사님이 달린
 * 만큼 짧아진 게 *"우회가 줄었다"* 로 읽힌다 — **달릴수록 심해진다.**
 *
 *     이전 999764  totalDistanceKm 24.9km   09:17:11 · 집 근처에서
 *     새 병합                     ~20.3km   09:17:40 · 인삼농협 근처에서
 *     marginalKm = 20.3 − 24.9 = **−4.6km**   ← 로그와 정확히 일치
 *
 * ── 고칠 곳 ──
 * 카카오는 **이미 두 번** 불린다(`base` 와 `merged`). 그런데 `base` 가
 * *"첫짐 콜 단독"* 이라 기준이 틀렸을 뿐이다. `base` 를 **기존 활성 콜 전부**로
 * 만들면 `timeDiffMin` 이 **정확한 한계 비용**이 된다 — 호출 수는 그대로 2번이고,
 * 근사도 아니다. 지나온 거리로 보정하는 방법은 근사인 데다 필요도 없다.
 *
 * ⚠️ 첫 합짐(기존 1콜)일 때는 base 가 그 콜의 단독 경로라 **예전과 같은 값**이 된다 —
 *    2026-08-21 주석이 *"그때는 둘이 같은 값"* 이라고 적어 둔 그대로다.
 */
describe('base 경로 — 기존 활성 콜 «전부» 를 현위치 기준으로 잰다', () => {
    const at = (x: number, y: number) => ({ x, y });
    const call = (id: string, px: number, py: number, dx: number, dy: number, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED',
        pickupX: px, pickupY: py, dropoffX: dx, dropoffY: dy, ...over,
    }) as any;

    const here = at(127.40, 37.30);
    const A = call('A', 127.29, 37.37, 127.40, 37.24);   // 첫짐
    const B = call('B', 127.30, 37.35, 127.38, 37.29);   // 합짐
    const cand = call('C', 127.40, 37.33, 127.38, 37.29); // 후보

    it('🔴 후보를 뺀 계획이 만들어진다 — 기존 콜이 둘이면 둘 다 들어간다', () => {
        const base = planMergedStops([A, B], null, here);
        expect(base).not.toBeNull();
        const xs = base!.waypoints.map(w => `${w.x},${w.y}`);
        // B 의 상차·하차가 base 경유지에 있어야 «기존 전부» 다
        expect(xs).toContain('127.3,37.35');
        expect(base!.waypoints.length).toBeGreaterThanOrEqual(2);
    });

    it('후보를 넣은 계획은 후보의 정거장이 더 들어간다', () => {
        const base = planMergedStops([A, B], null, here)!;
        const merged = planMergedStops([A, B], cand, here)!;
        expect(merged.waypoints.length).toBeGreaterThan(base.waypoints.length);
    });

    it('기존이 한 콜뿐이면 base 는 그 콜의 단독 경로 — 예전과 같은 값이다', () => {
        const base = planMergedStops([A], null, here);
        expect(base).not.toBeNull();
        // 상차·하차 둘뿐 (현위치는 origin 이라 경유지가 아니다)
        expect(base!.waypoints.length).toBeLessThanOrEqual(2);
    });
});

describe('우회 계산 — 낡은 저장값을 기준으로 쓰지 않는다', () => {
    const code = (rel: string) => readFileSync(join(__dirname, '../..', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('🔴 판정이 activeCalls 의 totalDistanceKm·totalDurationMin 을 기준으로 삼지 않는다', () => {
        const src = code('src/core/engine/OrderEvaluator.ts');
        // 저장값은 KEEP 하던 시각·그때의 기점에서 잰 것이라 지금과 뺄 수 없다
        expect(src).not.toMatch(/reverse\(\)[\s\S]{0,80}totalDurationMin/);
        expect(src).not.toMatch(/reverse\(\)[\s\S]{0,80}totalDistanceKm/);
    });

    it('🔴 base 를 기존 콜 전부로 만들어 카카오에 넘긴다', () => {
        expect(code('src/services/routeComposer.ts')).toMatch(/planMergedStops\(\s*calls,\s*null/);
    });
});

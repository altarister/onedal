import { readFileSync } from 'fs';
import { join } from 'path';
import { planMergedStops } from '../../src/services/routeComposer';

/**
 * 🧮 **우회는 «같은 시각·같은 기점»의 두 경로를 빼야 한다** (기사님 실측)
 *
 * 우회 = «기존 콜 전부 + 후보»(`merged`) − «기존 콜 전부»(`base`). 둘 다 **지금 현위치에서, 같은 시각에** 잰다.
 *
 * ── 기준이 어긋나면 ──
 *
 *   `timeDiffMin`(카카오)  기점 ✅ 현위치 · 기준이 **첫짐 단독**이면  → 부풀림
 *   `prevTotal`(저장값)    기점이 **낡음**     · 기준 ✅ 직전 전체     → 축소
 *
 * 저장값은 **KEEP 하던 시각·그때의 기점**에서 잰 것이라, 기사님이 달린
 * 만큼 짧아진 게 *"우회가 줄었다"* 로 읽힌다 — **달릴수록 심해진다.** 되돌아가는 콜인데
 * 우회가 **음수**로 나와 좋은 색(🔵)으로 칠해진다 (실측):
 *
 *     이전 저장값  totalDistanceKm 24.9km   집 근처에서 잰 것
 *     새 병합                     ~20.3km   상차지를 지난 자리에서 잰 것
 *     marginalKm = 20.3 − 24.9 = **−4.6km**   ← 딱지: 우회 -9분 · -4.6km
 *
 * ── 그래서 ──
 * 카카오는 두 번 불린다(`base` 와 `merged`). `base` 를 **기존 활성 콜 전부**로
 * 만들면 `timeDiffMin` 이 **정확한 한계 비용**이 된다 — 호출 수는 그대로 2번이고,
 * 근사도 아니다. 지나온 거리로 보정하는 방법은 근사인 데다 필요도 없다.
 *
 * ⚠️ 첫 합짐(기존 1콜)일 때는 base 가 그 콜의 단독 경로라 첫짐 단독 기준과 같은 값이 된다.
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

    /**
     * 🔴 **base 캐시의 «같은 자리인가»는 위도·경도 순서로 잰다** (코드리뷰 09-17 C-6).
     *
     * `geoService.haversineKm(lat1, lng1, lat2, lng2)` 인데 이 자리만 `(x, y, …)` — x 는 경도다 —
     * 로 넘겨 위도 자리에 경도가 들어갔다. 실측: 북쪽 200m 가 121m 로, 동쪽 4.4km 가 5.6km 로 읽혀
     * «200m 안이면 되쓴다»가 남북으로는 330m 밖 base 를 되쓰고 동서로는 160m 만 벗어나도 못 되썼다.
     * 같은 파일의 다른 자리(경로 순서 · 지나온 구간)는 전부 `(y, x)` 로 맞게 부른다.
     */
    it('🔴 base 캐시 거리는 (y, x) — 위도 자리에 경도를 넣지 않는다', () => {
        const src = code('src/services/routeComposer.ts');
        expect(src).toMatch(/haversineKm\(origin\.y, origin\.x, e\.origin\.y, e\.origin\.x\)/);
        expect(src).toMatch(/haversineKm\(origin\.y, origin\.x, hit\.origin\.y, hit\.origin\.x\)/);
        expect(src).not.toMatch(/haversineKm\(origin\.x, origin\.y/);
    });
});

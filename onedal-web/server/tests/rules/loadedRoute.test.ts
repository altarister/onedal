import { readFileSync } from "fs";
import { join } from "path";
import { buildSoloRouteUrl } from "../../src/services/kakaoService";
import { isAlreadyLoaded, planMergedStops } from "../../src/services/routeComposer";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const q = (url: string, key: string) => new URL(url).searchParams.get(key);

/**
 * 🔴 **이미 상차한 콜의 상차지를 다시 경유하던 문제** (2026-08-14 실측)
 *
 * 기사님: *"콜이 2개이고 중간에 합짐을 내리고 하차 완료 눌렀더니 경로를 다시 설정해서 꼬였어."*
 *
 * 서버 로그가 그대로 말해 준다:
 *      22:52:38  📦 상차 완료 567d5a1e  (짐을 실었다 — 광주 경안동)
 *      22:53:00  📦 하차 완료 ab3ebed1  (합짐 하나를 내렸다 → 콜 1건 → **단독 분기**)
 *                [Kakao Nav API (Solo)]
 *                   origin      = 127.1135,37.6162   현위치 ✅
 *                   destination = 126.9455,37.9388   파주 하차지 ✅
 *                   waypoints   = 127.2582,37.4103   🔴 광주 — 이미 다녀온 상차지
 *                🗺️ 현위치 접근: 44530m / 총 이동: 137125m
 *                🗺️ 폴리라인 2294개  (원래 1730개보다 **길어졌다**)
 *
 * 합짐 경로(`composeMergedRoute`)는 2026-08-13 에 **정확히 같은 이유로 이미 고쳤다.**
 * 주석까지 달려 있었다. 그런데 **단독 경로에는 그 판단이 없었다** —
 * 콜이 2건 → 1건이 되는 순간 그 분기로 넘어가면서 되살아났다.
 *
 * 이 레포의 반복 실패 그대로다: **같은 판단이 두 곳에.**
 */
describe('이미 상차한 콜 — 다녀온 상차지를 다시 경유하지 않는다', () => {

    const HERE = { x: 127.1135, y: 37.6162 };   // 현위치 (실측값)
    const PICKUP = { x: 127.2582, y: 37.4103 }; // 광주 — 이미 다녀옴
    const DROP = { x: 126.9455, y: 37.9388 };   // 파주

    it('🔴 짐을 실었으면 상차지가 경유지에서 빠진다', () => {
        const url = buildSoloRouteUrl(PICKUP.x, PICKUP.y, DROP.x, DROP.y, HERE, 'RECOMMEND', 1, true);
        expect(q(url, 'waypoints')).toBeNull();
        expect(q(url, 'origin')).toBe(`${HERE.x},${HERE.y}`);
        expect(q(url, 'destination')).toBe(`${DROP.x},${DROP.y}`);
    });

    it('아직 안 실었으면 상차지를 들른다 (여기까지 바꾸면 상차를 건너뛴다)', () => {
        const url = buildSoloRouteUrl(PICKUP.x, PICKUP.y, DROP.x, DROP.y, HERE, 'RECOMMEND', 1, false);
        expect(q(url, 'waypoints')).toBe(`${PICKUP.x},${PICKUP.y}`);
    });

    it('현위치를 모르면 상차지에서 출발한다 (skipPickup 이어도 경유지는 없다)', () => {
        for (const skip of [true, false]) {
            const url = buildSoloRouteUrl(PICKUP.x, PICKUP.y, DROP.x, DROP.y, null, 'RECOMMEND', 1, skip);
            expect(q(url, 'origin')).toBe(`${PICKUP.x},${PICKUP.y}`);
            expect(q(url, 'waypoints')).toBeNull();
        }
    });

    it('🔴 판단은 한 곳에만 있다 — 상태 문자열을 직접 비교하지 않는다', () => {
        expect(isAlreadyLoaded({ status: 'ORDER_PICKED_UP' })).toBe(true);
        expect(isAlreadyLoaded({ status: 'ORDER_CONFIRMED' })).toBe(false);   // KEEP 은 예약이지 적재가 아니다
        expect(isAlreadyLoaded({ status: null })).toBe(false);
        expect(isAlreadyLoaded({})).toBe(false);

        /**
         * 🔄 **경유지 선별의 기준이 넓어졌다** (2026-08-19) — `isAlreadyLoaded`(실었는가)
         *    에서 `hasVisitedStop`(다녀왔는가)으로. 상차 완료를 안 눌러도 GPS 로 다녀왔으면
         *    경유지에서 뺀다 (기사님: *"지나온 것은 무시할 것 같은데"*).
         *    `isAlreadyLoaded` 는 여전히 **적재 판단**으로 살아 있다 — 질문이 다르다.
         *    자세한 근거는 tests/rules/visitedStop.test.ts.
         */
        const rc = codeOnly(read('services/routeComposer.ts'));
        const fn = rc.slice(rc.indexOf('export async function composeMergedRoute'));
        expect(fn).toMatch(/hasVisitedStop\(c, 'pickup'\)/);
        expect(fn).not.toMatch(/=== 'ORDER_PICKED_UP'/);
    });

    /**
     * 🔴 **단독 경로를 부르는 곳이 셋이다.** 하나만 고치면 나머지가 다시 되돌아간다.
     *    특히 세션 복구(`복구`)는 상차하고 달리다 **새로고침만 해도** 터지던 자리다.
     *
     * ⚠️ 넘기는 판단은 **`hasVisitedStop`** 이다 (2026-08-19 개정). 이 검사는 그때
     *    안 따라와서, 2026-08-25 까지 옛 `isAlreadyLoaded` 를 **강제하고 있었다** —
     *    합짐이 다 하차되어 콜이 1건 남는 순간 단독 경로로 떨어지므로 **사이클 끝마다**
     *    여주에서 성남 상차지로 50km 되돌아갔다. 근거는 tests/rules/visitedStop.test.ts.
     */
    it('🔴 dispatchEngine 의 단독 경로 호출 세 곳이 모두 판단을 넘긴다', () => {
        const eng = codeOnly(read('services/dispatchEngine.ts'));
        const calls = [...eng.matchAll(/calculateSoloRoute\(([\s\S]*?)\);/g)];
        expect(calls.length).toBe(3);
        for (const c of calls) expect(c[1]).toMatch(/hasVisitedStop\(\w+, 'pickup'\)/);
    });
});

/**
 * 🔴 **합짐 판정 경로에도 같은 버그가 있었다** (2026-08-14 확인 훑기에서 발견)
 *
 * `OrderEvaluator` 가 경유지를 **손으로 조립**하고 `calculateDetourRoute` 를 직접 불렀다.
 * 그래서 **이미 상차한 콜의 상차지까지 경유지에 넣었다** — 다녀온 곳을 다시 가는 경로다.
 * 거리·시간이 부풀고, 그 값으로 우회 예산을 재니 **합짐 판정이 통째로 틀어진다.**
 *
 * 이게 새 콜을 평가하는 **주 경로**다. 상차를 마친 뒤 뜨는 합짐 후보마다 틀린 값으로 쟀다.
 *
 * 같은 파일이 같은 이유로 **두 번째**였다 — 파일 안에 이미
 * *"EE 리팩터링에서 composeMergedRoute 를 쓰는 곳만 통일하고 여기를 놓쳤다"* 고 적혀 있었다.
 */
describe('합짐 판정 — 경유지 조립은 한 곳에서만', () => {

    const P = (n: number) => ({ x: 127 + n / 100, y: 37 + n / 100 });
    const call = (id: string, status: string, p: number, d: number) => ({
        id, status, pickupX: P(p).x, pickupY: P(p).y, dropoffX: P(d).x, dropoffY: P(d).y,
    }) as any;

    it('🔴 실은 콜의 상차지는 경유지에 없고, 후보 콜의 상차지는 있다', () => {
        const loaded = call('A', 'ORDER_PICKED_UP', 1, 2);     // 짐을 실었다 — 상차지는 다녀왔다
        const cand = call('B', 'ORDER_AWAITING_DECISION', 3, 4); // 후보 — 아직 안 실었다

        const plan = planMergedStops([loaded], cand, { x: 127.5, y: 37.5 })!;
        expect(plan).not.toBeNull();
        expect(plan.skippedPickups).toBe(1);

        const has = (c: { x: number; y: number }) =>
            plan.waypoints.some(w => w.x === c.x && w.y === c.y)
            || (plan.mergedDest.x === c.x && plan.mergedDest.y === c.y);

        expect(has(P(1))).toBe(false);   // 🔴 실은 콜의 상차지 — 없어야 한다
        expect(has(P(3))).toBe(true);    //    후보의 상차지 — 있어야 한다
        expect(has(P(2))).toBe(true);    //    실은 콜의 하차지 — 내려야 하니 있어야 한다
        expect(has(P(4))).toBe(true);    //    후보의 하차지
    });

    it('아직 안 실은 콜은 상차지를 들른다 (여기까지 빼면 상차를 건너뛴다)', () => {
        const confirmed = call('A', 'ORDER_CONFIRMED', 1, 2);   // KEEP 은 예약이지 적재가 아니다
        const plan = planMergedStops([confirmed], call('B', 'ORDER_AWAITING_DECISION', 3, 4), null)!;
        expect(plan.skippedPickups).toBe(0);
        expect(plan.waypoints.some(w => w.x === P(1).x)).toBe(true);
    });

    it('전부 실었으면 하차지만 남는다 (상차지가 하나도 없어도 안 터진다)', () => {
        const plan = planMergedStops(
            [call('A', 'ORDER_PICKED_UP', 1, 2), call('B', 'ORDER_PICKED_UP', 3, 4)], null, null)!;
        expect(plan.skippedPickups).toBe(2);
        expect(plan.waypoints.some(w => w.x === P(1).x || w.x === P(3).x)).toBe(false);
    });

    it('좌표가 하나도 없으면 null — 지어내지 않는다', () => {
        expect(planMergedStops([], null, null)).toBeNull();
    });

    it('🔴 경유지를 조립하는 곳은 routeComposer 하나뿐이다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).not.toMatch(/calculateDetourRoute\(/);
        expect(ev).not.toMatch(/allPickups/);
        expect(ev).not.toMatch(/optimizeWaypoints\(/);
        expect(ev).toMatch(/composeMergedRoute\(\{/);
    });
});

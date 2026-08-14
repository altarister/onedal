import { readFileSync } from "fs";
import { join } from "path";
import { buildSoloRouteUrl } from "../../src/services/kakaoService";
import { isAlreadyLoaded } from "../../src/services/routeComposer";

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

        // composeMergedRoute 도 자기가 비교하지 않고 이 함수를 쓴다
        const rc = codeOnly(read('services/routeComposer.ts'));
        const fn = rc.slice(rc.indexOf('export async function composeMergedRoute'));
        expect(fn).toMatch(/isAlreadyLoaded\(c\)/);
        expect(fn).not.toMatch(/=== 'ORDER_PICKED_UP'/);
    });

    /**
     * 🔴 **단독 경로를 부르는 곳이 셋이다.** 하나만 고치면 나머지가 다시 되돌아간다.
     *    특히 세션 복구(`복구`)는 상차하고 달리다 **새로고침만 해도** 터지던 자리다.
     */
    it('🔴 dispatchEngine 의 단독 경로 호출 세 곳이 모두 판단을 넘긴다', () => {
        const eng = codeOnly(read('services/dispatchEngine.ts'));
        const calls = [...eng.matchAll(/calculateSoloRoute\(([\s\S]*?)\);/g)];
        expect(calls.length).toBe(3);
        for (const c of calls) expect(c[1]).toMatch(/isAlreadyLoaded\(/);
    });
});

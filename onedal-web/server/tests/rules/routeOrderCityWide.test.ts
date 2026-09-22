import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const APP = join(__dirname, "../../../../onedal-app/app/src/main/java/com/onedal/app");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🧭 **구 단위 상차지는 합짐에서 막는다 — 이건 버그가 아니라 결정이다**
 *    (기사님 확정).
 *
 * 🔴 **왜 이 검사가 있나** — 「왜 합짐이 안 붙나」를 쫓다가 **고치려 드는 것**을 막으려고.
 *
 * 2026-09-12 실측: 초월읍 → 분당서울대병원(구미동) 20만을 잡은 직후, 같은 목적지로
 * 가는 20만짜리 콜 셋이 연달아 막혔다 — 광주시·중원구·**분당구** → 구미동.
 * 앱 필터 **다섯 축은 전부 ✅** 였고 여섯째 `routeOrder` 가 막았다:
 *
 * ```
 * 🧭 [경로 순서] 차단 — 경로 밖 — 상차지(분당구)가 경유 목록에 없음
 * ```
 *
 * 경유 목록에는 **분당구 안의 동들이 들어 있다**(`분당동 24.8km`·`궁내동 24.4km`).
 * 막힌 것은 «분당구»라는 **표기**가 동 이름과 안 맞아서다.
 *
 * 🔴 **비대칭이고, 그것도 결정이다** (규칙 ⑤-4 ⑤ — 둘이 답하는 질문이 다르다):
 *
 * | | 묻는 것 | 구 단위로 답할 수 있나 |
 * |---|---|---|
 * | `region`     | «하차지가 **내 그물 안인가**»        | ✅ 구 전체가 그물 안이면 답이 하나다 |
 * | `routeOrder` | «상차지가 **경로의 몇 km 지점인가**» | ❌ 분당구 안에 6.8km 도 24.8km 도 있다 |
 *
 * 기사님: *"**구 단위 상차지는 어디서 태울지 모르니 안 잡는 것이 안전하다**"* ·
 * *"**인성이나 24시도 그렇게 작동하니까**"* — 배차망 화면이 원래 구·시 단위로 적는다.
 * 그러니 이 차단은 «못 읽어서»가 아니라 **«정말로 모르니까»** 다.
 *
 * ⚠️ **대가를 알고 고른 것이다** — 도시 안에서의 합짐은 사실상 안 붙는다.
 *    막으려던 실사고가 그 모양이었다: 파주 도착 직전에 `초월읍 → 금촌동` 콜이 통과해
 *    **78km 뒤로 돌아가야 했다**. 잡았다 취소하면 배차망 취소 횟수를 쓴다.
 */
describe('구 단위 상차지는 합짐에서 막는다 (기사님 확정 2026-09-12)', () => {

    it('🔴 `orderKm` 의 키에 구·시 별칭을 섞지 않는다', () => {
        /**
         * 서버가 경유 목록을 만드는 자리다. 여기에 `customCityFilters`(구 별칭)를
         * 함께 실으면 **앱이 「분당구」를 24.8km 지점으로 읽어** 이 결정이 조용히 뒤집힌다.
         */
        const fm = codeOnly(read('state/filterManager.ts'));
        const i = fm.indexOf('orderKm');
        expect(i).toBeGreaterThan(-1);
        const around = fm.slice(Math.max(0, i - 1200), i + 1200);
        expect(around).not.toMatch(/customCityFilters/);
    });

    it('🔴 앱은 «키에 없으면 경로 밖»으로 막는다 — 통과시키지 않는다', () => {
        const f = codeOnly(readApp('plugins/RouteOrderFilter.kt'));
        const i = f.indexOf('pickupHits.isEmpty()');
        expect(i).toBeGreaterThan(-1);
        const body = f.slice(i, i + 240);
        /* 막는 쪽이어야 한다 — `Result(true, …)` 로 뒤집히면 78km 사고가 돌아온다 */
        expect(body).toMatch(/Result\(false/);
        expect(body).not.toMatch(/Result\(true/);
    });

    it('🔴 상차지는 «가장 뒤»로 잰다 — 느슨하게 재면 역주행이 샌다', () => {
        const f = codeOnly(readApp('plugins/RouteOrderFilter.kt'));
        expect(f).toMatch(/pickupHits\.values\.filterNotNull\(\)\.maxOrNull\(\)/);
        expect(f).toMatch(/dropoffHits\.values\.filterNotNull\(\)\.minOrNull\(\)/);
    });

    it('🔴 이 결정이 막는 코드 옆에 «왜»와 함께 남아 있다', () => {
        /* 코드만 있고 이유가 없으면 다음 사람이 «버그네» 하고 고친다 — 주석까지 든 원문을 본다 */
        const raw = readApp('plugins/RouteOrderFilter.kt');
        const why = raw.slice(0, raw.indexOf('pickupHits.isEmpty()'));
        expect(why).toMatch(/\*\*구 단위 상차지는 막는다/);
        expect(why).toMatch(/인성이나 24시도 그렇게 작동하니까/);
    });
});

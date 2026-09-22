import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔬 **실측은 기사님 계정을 만지지 않는다** — 실측 전용 계정으로 로그인한다.
 *
 * 🔴 CDP 화면 실측 스크립트가 `/api/auth/bypass` 로 로그인하면 그 라우트는
 *    **«DB 의 첫 번째 유저»** 를 준다 — 곧 **기사님 계정**이다. 그러면 스크립트가 누른
 *    「↩︎ 되돌리기」와 「도 고르기」가 **기사님이 맞춰 두신 필터를 실제로 날린다.**
 *
 * 🔴 **화면을 실제로 눌러 보는 것은 계속한다** — 코드 읽기로 못 찾는 버그를 그 실측이
 *    찾는다. 그러니 **도구(로그인 계정)를 고친다.**
 *
 * ⚠️ 위험이 늘지 않는다: `bypass` 는 원래 개발 전용이고 **라이브에서는 404** 다.
 *    여기서 더하는 것은 «누구로 로그인하나» 하나뿐이다.
 */
describe('실측 전용 계정 — 기사님 것을 안 만진다', () => {
    const auth = read('routes/auth.ts');
    const code = codeOnly(auth);

    it('🔴 bypass 가 «실측용» 을 따로 낼 수 있다', () => {
        expect(code).toMatch(/PROBE_EMAIL/);
        /* 이름이 한눈에 «이건 사람이 아니다» 여야 한다 — 기사님 계정 옆에 섞이므로.
           ⚠️ 주소 자체는 `config/env.ts` 한 곳에 산다 (규칙 ③) — 거기서 본다 */
        expect(read('config/env.ts')).toMatch(/probe@onedal\.local/);
    });

    it('🔴 부탁했을 때만 낸다 — 기본은 지금 그대로 «첫 번째 유저»다', () => {
        const i = code.indexOf('router.post("/bypass"');
        expect(i).toBeGreaterThan(-1);
        const body = code.slice(i, code.indexOf('\n});', i));
        /* 요청이 `probe` 를 달고 와야 갈린다 */
        expect(body).toMatch(/req\.body[^\n]*probe/);
        /* 안 달고 오면 «첫 번째 유저» 길 그대로 — 시나리오·e2e 가 이 길로 돈다 */
        expect(body).toMatch(/SELECT \* FROM users LIMIT 1/);
    });

    it('🔴 실측 계정에도 설정·필터 행이 함께 생긴다 — 빈 그릇은 «고장»이다', () => {
        /* ⚠️ `PROBE_EMAIL` 첫 등장은 **import 줄**이다 — 거기서 자르면 엉뚱한 데를 본다.
              갈라지는 자리(`req.body?.probe`)부터 잘라야 «그 블록»이 된다 */
        const i = code.indexOf('req.body?.probe');
        expect(i).toBeGreaterThan(-1);
        const body = code.slice(i, i + 1600);
        expect(body).toMatch(/INSERT INTO user_settings/);
        expect(body).toMatch(/INSERT INTO user_filters/);
    });

    /**
     * 🔴 **실측 계정이 시뮬레이터를 막으면 안 된다**.
     *
     * `/driver-location` 과 `/preflight` 는 «로컬 서버에는 기사님 한 분이다 — 세션이 여럿이면
     * **고르지 않는다**» 로 지켜져 있다. 실측 계정을 그 셈에 넣으면 세션이 **둘**이 되어
     * 시뮬레이터가 **«세션이 여럿입니다»만 받는다** — 남의 영역이 내 도구 때문에 멈춘다.
     *
     * 🔴 그 규칙의 뜻은 «둘이면 위험»이 아니라 **«누구 것인지 모르면 안 준다»** 다.
     *    실측 계정은 **사람이 아니므로** 그 셈에서 뺀다 — 규칙을 약하게 만드는 것이 아니다.
     */
    const sim = codeOnly(read('routes/sim.ts'));

    it('🔴 실측 세션은 «사람 세션» 으로 안 센다 — 시뮬이 막히면 안 된다', () => {
        expect(sim).toMatch(/humanUserIds/);
        /* 두 문 다 그 셈을 쓴다 */
        const uses = sim.match(/humanUserIds\(\)/g) ?? [];
        expect(uses.length).toBeGreaterThanOrEqual(2);
        expect(sim).not.toMatch(/const userIds = getAllActiveUserIds\(\)/);
    });

    it('🔴 실측 계정의 주소는 한 곳에서만 온다 (규칙 ③)', () => {
        const env = read('config/env.ts');
        expect(env).toMatch(/PROBE_EMAIL/);
        /* auth 도 sim 도 제 손으로 문자열을 또 적지 않는다 */
        expect(codeOnly(read('routes/auth.ts'))).not.toMatch(/"probe@onedal\.local"/);
        expect(sim).not.toMatch(/probe@onedal\.local/);
    });

    it('🔴 라이브에서는 여전히 없는 길이다', () => {
        const i = code.indexOf('router.post("/bypass"');
        const body = code.slice(i, code.indexOf('\n});', i));
        expect(body).toMatch(/isLiveServer\(\)/);
        expect(body).toMatch(/404/);
    });
});

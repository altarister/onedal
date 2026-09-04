import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧭 **내비 화면은 위치를 «쓰되 보내지 않는다»** (기사님 지적 2026-09-03)
 *
 * 기사님: *"관제가 2개 열리면 안된다고 한것 같은데."* — 맞다.
 * 개인 폰(아이폰)에서 이 웹을 열었을 때 좌표를 **서버로 보내면**, 서버는 관제폰과 개인 폰의
 * 위치를 **한 차량으로** 본다. 두 점을 오가는 것으로 보여 「위치 점프」가 찍히고
 * 도착·지나침 판정이 통째로 흔들린다.
 *
 * 🟢 그런데 **위치 자체는 필요하다** — «지금 여기서 출발»하는 링크를 만들어야 하니까.
 *    개인 폰도 차 안에 있어 좌표는 같다. 그래서 **읽기는 켜고 보내기만 끈다.**
 *
 * 🔴 이 구분이 사라지면 **조용히** 섞인다 — 화면에는 아무 표시도 안 난다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧭 내비 화면은 좌표를 서버로 보내지 않는다', () => {
    const app = () => codeOnly(read('App.tsx'));

    it('보내는 훅(useGpsTelemetry)은 내비 화면에서 꺼진다', () => {
        expect(app()).toMatch(/useGpsTelemetry\(\s*!naviOnly\s*&&\s*!naviDevice\s*\)/);
    });

    it('«내비 화면인가»는 주소로 정한다 — 다른 화면은 영향이 없다', () => {
        // 2026-09-04: 화면은 지웠지만 **주소 판정은 남긴다** — 새 화면을 만들 때 여기 이어 붙인다
        expect(app()).toMatch(/naviOnly\s*=\s*location\.pathname\.startsWith\(['"]\/navi['"]\)/);
    });

    it('🟢 읽는 훅(useNativeLocation)은 끄지 않는다 — 출발지가 있어야 링크가 선다', () => {
        expect(app()).toMatch(/useNativeLocation\(\s*\)/);
    });

    /** 🔴 읽는 훅이 서버로 새면 위 구분이 무의미해진다 */
    it('읽는 훅은 서버로 보내지 않는다 (publishLocation 을 안 부른다)', () => {
        expect(codeOnly(read('hooks/useNativeLocation.ts'))).not.toMatch(/publishLocation/);
    });

    /**
     * 🔴 **아래 둘은 `/go` 문턱을 만들 때 되살린다** (2026-09-04).
     *
     * 기사님이 옛 내비 화면을 지우라고 하셨다 — *"그거 있으면 너가 또 딴소리해."*
     * 어제 급하게 만든 임시방편이라 그 위에 계획을 올리는 것을 막으려는 것이다.
     * **그런데 그 화면이 지키던 규칙 둘은 여전히 참이다:**
     *   ① 받는 화면은 **관제 부품(모의주행·마스터 GPS·결재)을 끌어오지 않는다**
     *   ② 받는 화면은 **`useOrderEngine` 을 안 쓴다** — 소켓 구독이 두 벌이 된다
     *
     * 🔴 **지우지 않고 `todo` 로 남긴다.** 이 레포는 「사라진 검사」로 여러 번 당했다
     *    (CLAUDE.md: *"있는 검사가 안 불리면 없는 것이다"*). 파일이 없어 지금은 못 돌지만,
     *    **새 내비 화면을 만드는 사람이 여기서 걸려야 한다.**
     */
    it.todo('🔜 [새 내비 화면] 받는 화면은 모의주행·마스터 GPS·결재를 안 쓴다');
    it.todo('🔜 [새 내비 화면] 받는 화면은 useOrderEngine 을 안 쓴다 — 소켓 구독이 두 벌이 된다');
});

/**
 * 🔴 **주소만으로 끄면 홈에 닿는 순간 켜진다** (기사님 지적 2026-09-03:
 *    *"우리 페이지가 로그인 하면 리다이렉트 해서 홈으로 가. 그거서는 허용하면 안되잖아."*)
 *
 * 홈에 닿는 길은 여럿이다 — 로그인 리다이렉트 · 뒤로 가기 · 잘못 누른 링크.
 * 그중 **로그인 한 번**으로 「관제가 2개」가 생기던 것이 실제로 있었다.
 * 그래서 막는 자리를 **둘로 겹친다** (규칙 ② 안전장치는 겹쳐 둔다).
 */
describe('🧭 내비 폰은 홈에 닿아도 좌표를 안 보낸다', () => {
    const app = () => codeOnly(read('App.tsx'));
    const login = () => codeOnly(read('pages/Login.tsx'));

    it('① 로그인은 «가려던 곳»을 들고 간다 — 무조건 홈이 아니다', () => {
        expect(app()).toMatch(/state=\{\{\s*from:/);
        expect(login()).not.toMatch(/navigate\(['"]\/['"]\)/);
        expect(login()).toMatch(/navigate\(from\)/);
    });

    it('① 밖에서 온 주소로는 튀지 않는다 — 우리 안의 경로만 받는다', () => {
        expect(login()).toMatch(/startsWith\(['"]\/['"]\)/);
        expect(login()).toMatch(/raw\[1\]\s*!==/);   // «//evil.com» 은 다른 사이트다
    });

    it('② 한 번 내비로 쓴 브라우저는 기기에 표시가 남는다', () => {
        expect(app()).toMatch(/markNaviDevice\(\)/);
        expect(codeOnly(read('lib/naviDevice.ts'))).toMatch(/localStorage\.setItem/);
    });

    it('🔴 그 표시를 «조용히» 두지 않는다 — 화면이 말하고, 되돌릴 수 있다', () => {
        expect(app()).toMatch(/clearNaviDevice\(\)/);
        expect(read('App.tsx')).toMatch(/내비 폰/);
    });
});

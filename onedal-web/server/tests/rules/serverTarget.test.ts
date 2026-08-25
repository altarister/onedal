import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🎯 **어느 서버를 보는가 — 판단은 한 곳뿐이다** (기사님 확정 2026-08-25)
 *
 * 기사님: *"볼륨 버튼을 클릭해서 라이브인지 로컬인지 바꿀 수 있으면 더 좋을 것 같은데."*
 *
 * ── 왜 ──
 * 관제앱(APK)은 `https://localhost` 에서 자기 번들을 띄운다. 상대 경로 `/api` 는
 * **자기 자신**에게 간다 — 서버가 아니라. 2026-08-25 실측 로그캣:
 *
 *     SocialLogin.login → accessToken 수신 → `서버에게 id_token 전달` → **조용히 되돌아옴**
 *
 * 토큰을 받고도 보낼 곳이 없었다. 브라우저에서는 Vite 프록시가 받아 주니 안 드러나고
 * **앱에서만** 난다. 2026-08-23 에 *"앱으로 로그인이 안 돼 크롬으로 갔다"* 도 같은 뿌리다.
 *
 * ── 지켜야 하는 것 ──
 *   ① 주소를 정하는 곳은 **하나** — 예전엔 `apiClient` 와 `socket` 이 각자 읽었다.
 *      바꾸는 길이 생기면 **HTTP 는 새 서버, 소켓은 옛 서버**로 갈라진다 (규칙 ③).
 *   ② 바꾸면 **새로고침** — 소켓은 붙을 때 주소가 정해진다. 반씩 맞는 화면이 제일 나쁘다.
 *   ③ **지금 어디를 보는지 화면에 적는다** (규칙 ⑤-4 ④) — 오늘 그걸 몰라 여러 번 헤맸다.
 *   ④ **볼륨 다운은 안 뺏는다** — 주행 중에 소리를 못 줄이면 그게 더 큰 사고다.
 */
const CLIENT = join(__dirname, '../../../client-app');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
/**
 * 🔴 **줄 주석을 지울 때 `https://` 를 자르지 않는다.**
 *    `//` 앞에 `:` 가 있으면 URL 이다 — 2026-08-25 에 이 검사가 스스로 여기 걸렸다.
 */
const code = (src: string) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('서버 주소 — 한 곳에서 정한다', () => {
    it('🔴 apiClient 와 socket 이 같은 곳에서 읽는다 (각자 env 를 읽지 않는다)', () => {
        const api = code(read('src/api/apiClient.ts'));
        const sock = code(read('src/lib/socket.ts'));
        expect(api).toMatch(/apiBase\(\)/);
        expect(sock).toMatch(/socketBase\(\)/);
        // 각자 읽으면 바꿀 때 갈라진다
        expect(api).not.toMatch(/import\.meta\.env\.VITE_API_URL/);
        expect(sock).not.toMatch(/import\.meta\.env\.VITE_API_URL/);
    });

    it('🔴 관제웹 로그도 같은 주소로 간다 (앱에서 안 가면 로그가 무용지물)', () => {
        expect(code(read('src/lib/roadmapLogger.ts'))).toMatch(/\$\{apiBase\(\)\}\/logs/);
    });

    it('🔴 앱은 절대 주소를 쓴다 — 상대 경로는 자기 번들에게 간다', () => {
        const t = code(read('src/lib/serverTarget.ts'));
        expect(t).toMatch(/isNativeApp\(\) \? TARGETS\.live\.api : ['"]\/api['"]/);
        expect(t).toMatch(/https:\/\/1dal\.altari\.com\/api/);
    });

    it('🔴 서버를 바꾸면 새로고침한다 — 소켓이 옛 주소에 남으면 화면이 반씩 맞는다', () => {
        const t = code(read('src/lib/serverTarget.ts'));
        const fn = t.slice(t.indexOf('export function switchTarget'));
        expect(fn).toMatch(/location\.reload\(\)/);
    });

    it('🔴 지금 어디를 보는지 화면에 적는다 (규칙 ⑤-4 ④)', () => {
        expect(code(read('src/components/ServerSwitch.tsx'))).toMatch(/currentTargetName\(\)/);
    });

    it('🔴 볼륨 다운은 가로채지 않는다 — 주행 중 소리를 못 줄이면 안 된다', () => {
        const m = code(read('android/app/src/main/java/kr/co/onedal/dashboard/MainActivity.java'));
        expect(m).toMatch(/KEYCODE_VOLUME_UP/);
        expect(m).not.toMatch(/KEYCODE_VOLUME_DOWN/);
        expect(m).toMatch(/onedal:volume-up/);
    });

    it('팝업이 화면에 붙어 있다', () => {
        expect(code(read('src/App.tsx'))).toMatch(/<ServerSwitch\s*\/>/);
    });
});

/**
 * 🔴 **한 화면이 두 서버를 보고 있었다** (기사님 실측 2026-08-26)
 *
 * 위 검사들은 `apiClient`·`socket`·`roadmapLogger` **세 파일만** 확인했다. 그래서
 * 네 번째가 조용히 남아 있었다 — `useOrderEngine` 이 `fetch("/api/orders")` 로
 * **주소를 손으로 적고** 있었다.
 *
 * 브라우저에서 서버를 안 바꾸면 상대 경로가 곧 정답이라 **아무 증상이 없다.**
 * 어제 볼륨 업 스위치가 생기고 나서야 드러났다:
 *
 *     로그인·소켓·기기목록  → apiBase() = 라이브   (기기 이름 `v2`, filter-init 라이브)
 *     이력(orders) 한 줄만  → 상대경로  = 로컬     → 라이브 토큰이라 401
 *
 * 화면 하나가 두 서버에 걸쳐 있었고, **로컬 서버 로그에는 그 한 줄만 찍혔다.**
 * 그래서 *"관제탑이 접속을 안 했다"* 와 *"관제웹은 잘 붙어 있다"* 가 동시에 참이었다.
 *
 * 🔴 **관제앱(APK)에서는 더 나쁘다.** 거기서 상대 경로는 `https://localhost` —
 * 자기 번들이다. 이력이 **영영 안 온다**(취소·완료 탭이 조용히 빈다).
 *
 * → 세 파일을 지목하는 대신 **전부 훑는다.** 지목하는 검사는 네 번째를 못 잡는다.
 */
describe('관제웹 전체 — 서버 주소를 손으로 적은 곳이 없다', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

    it('🔴 `/api` 로 시작하는 주소를 직접 쓰지 않는다 — apiBase() 를 거친다', () => {
        const offenders = walk(join(CLIENT, 'src'))
            // 주소를 «정하는» 곳은 여기 하나다 — 유일하게 리터럴을 가질 자격이 있다
            .filter(f => !f.endsWith('serverTarget.ts'))
            .filter(f => /(^|[^.\w])['"`]\/api(\/|['"`])/.test(code(readFileSync(f, 'utf8'))))
            .map(f => f.split('/client-app/')[1]);
        expect(offenders).toEqual([]);
    });
});

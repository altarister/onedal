import { isAppOrigin } from '../../../client-app/src/lib/appOrigin';

/**
 * 🪟 **개발 브라우저를 관제앱으로 오인하지 않는다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"집에서 브라우저로 http://localhost:3000/ 으로 접속했는데 v2 로 보여."*
 * 그리고 로컬 스토리지를 지운 뒤에도 그대로였다.
 *
 * 뿌리는 이 한 무늬였다:
 *
 *     /^https?:\/\/localhost(:\d+)?$/     ← `(:\d+)?` 가 `:3000` 을 통과시킨다
 *
 * Capacitor 가 `https://localhost`(포트 없음)에서 번들을 띄우는 걸 잡으려던 건데,
 * 개발 브라우저까지 «앱»으로 읽혔다. 그러면 `apiBase()` 가 **라이브**를 돌려준다:
 *
 *   · 로그인이 라이브로 가 라이브 토큰이 저장되고
 *   · 기기 이름이 `v2`(라이브 DB · 로컬은 `1234`)로 보이고
 *   · **로컬 서버 로그에는 아무것도 안 남는데** 화면은 멀쩡히 돈다
 *
 * 🔴 **로컬을 고치면서 라이브를 보고 있었다.** 이 레포에서 가장 비싼 종류의 착각이다
 *    (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」).
 * 🔴 `localStorage` 를 지워도 안 고쳐진다 — 저장값이 없으면 **이 판단으로 떨어진다.**
 */
describe('앱 origin — 포트가 붙으면 브라우저다', () => {
    it('🔴 개발 브라우저는 앱이 아니다 (여기서 틀려 라이브를 보고 있었다)', () => {
        expect(isAppOrigin('http://localhost:3000')).toBe(false);   // 관제웹 dev
        expect(isAppOrigin('http://localhost:5173')).toBe(false);   // 시뮬레이터
        expect(isAppOrigin('http://localhost:4173')).toBe(false);   // vite preview
    });

    it('관제앱(Capacitor)은 포트 없이 뜬다 — 그건 앱이 맞다', () => {
        expect(isAppOrigin('https://localhost')).toBe(true);
        expect(isAppOrigin('http://localhost')).toBe(true);          // androidScheme 를 http 로 두는 경우
    });

    it('남의 주소를 앱으로 읽지 않는다', () => {
        expect(isAppOrigin('https://1dal.altari.com')).toBe(false);
        expect(isAppOrigin('http://localhost.evil.com')).toBe(false);
        expect(isAppOrigin('http://172.30.1.58:3000')).toBe(false);
    });
});

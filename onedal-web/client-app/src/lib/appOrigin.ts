/**
 * 🔴 **앱인가 브라우저인가 — 판단은 여기 하나다**
 *
 * Capacitor 는 번들을 `https://localhost`(**포트 없음**)에서 띄운다. 그래서 **포트 없는 localhost 만** 앱으로 본다.
 * 포트까지 허용하면(`(:\d+)?`) **개발 브라우저의 `http://localhost:3000` 도 맞아** 관제앱으로
 * 오인되고, `apiBase()` 가 **라이브**를 돌려준다 —
 *
 *   · 로그인이 라이브로 가서 라이브 토큰이 저장되고
 *   · 기기 이름이 `v2`(라이브 DB)로 보이고
 *   · 로컬 서버 로그에는 아무것도 안 남는데 화면은 멀쩡히 돈다
 *
 * 로컬을 고치며 라이브를 보게 된다. `localStorage` 를 지워도 안 고쳐진다 —
 * 저장값이 없으면 **바로 이 판단**으로 떨어지기 때문이다.
 *
 * ⚠️ 포트가 유일한 구분점이다. Capacitor 는 포트를 안 붙이고, 개발 서버는 늘 붙는다
 *    (`:3000` 관제웹 · `:5173` 시뮬레이터 · `:4173` preview).
 */
export function isAppOrigin(origin: string): boolean {
    return /^https?:\/\/localhost$/.test(origin);
}

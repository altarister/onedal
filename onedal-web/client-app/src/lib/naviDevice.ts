/**
 * 🧭 **«이 브라우저는 내비 폰인가»** (기사님 지적 2026-09-03)
 *
 * 기사님: *"근데.. 우리 페이지가 로그인 하면 리다이렉트 해서 홈으로 가.
 * 그거서는 허용하면 안되잖아."* — 맞다. 주소만으로 끄면 **홈에 닿는 순간 켜진다.**
 * 로그인 리다이렉트·뒤로 가기·잘못 누른 링크 — 홈에 닿는 길은 여럿이다.
 *
 * 그래서 **주소가 아니라 기기에 표시를 남긴다.** 한 번 `/navi` 를 연 브라우저는
 * 그 뒤 어느 화면에서도 좌표를 서버로 보내지 않는다 (규칙 ② 안전장치는 겹쳐 둔다).
 *
 * 🔴 **조용히 하지 않는다.** 관제 화면 위에 «이 브라우저는 위치를 안 보냅니다」를 띄우고
 *    거기서 되돌릴 수 있게 한다 — 안 그러면 나중에 이 브라우저를 관제로 쓸 때
 *    **화면이 조용히 거짓말한다** (관제웹 규칙).
 *
 * ⚠️ 브라우저마다·기기마다 따로다. 관제폰(S23)의 표시는 개인 폰과 무관하다.
 */
const KEY = 'naviDevice';

/** 이 브라우저가 내비 폰으로 표시돼 있는가 */
export function isNaviDevice(): boolean {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** 내비 화면을 열었다 — 이 기기를 내비 폰으로 표시한다 */
export function markNaviDevice(): void {
    try { localStorage.setItem(KEY, '1'); } catch { /* 사생활 보호 모드 등 — 주소 게이트가 남는다 */ }
}

/** 이 브라우저를 다시 관제폰으로 쓴다 */
export function clearNaviDevice(): void {
    try { localStorage.removeItem(KEY); } catch { /* 위와 같다 */ }
}

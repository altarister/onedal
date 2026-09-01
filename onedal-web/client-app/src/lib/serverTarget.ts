/**
 * 🎯 **어느 서버를 보는가 — 판단은 여기 하나뿐이다** (기사님 확정 2026-08-25)
 *
 * 기사님: *"볼륨 버튼을 클릭해서 라이브인지 로컬인지 바꿀 수 있으면 더 좋을 것 같은데."*
 *
 * ── 왜 필요했나 ──
 * 관제앱(APK)은 `https://localhost` 에서 자기 번들을 띄운다. 그래서 상대 경로 `/api` 는
 * **자기 자신**에게 간다 — 서버가 아니라. 2026-08-25 실측:
 *
 *     구글 인증 성공 → accessToken 수신 → `서버에게 id_token 전달` → **조용히 되돌아옴**
 *
 * 토큰을 받고도 **보낼 곳이 없었다.** 브라우저에서는 Vite 프록시가 받아 주니 안 드러나고,
 * 앱에서만 난다. 2026-08-23 에 *"앱으로 로그인이 안 돼 크롬으로 갔다"* 도 같은 뿌리다.
 *
 * ── 왜 한 곳인가 ──
 * 예전에는 `apiClient.ts` 와 `socket.ts` 가 **각자** `VITE_API_URL` 을 읽었다.
 * 주소를 바꾸는 길이 생기면 두 곳이 갈라진다 — 이 레포가 반복해 당한 형태다 (규칙 ③).
 * 여기서 정하고 둘 다 여기서 읽는다.
 *
 * ── 왜 새로고침하나 ──
 * 소켓은 붙을 때 주소가 정해진다. 주소만 바꾸고 두면 **HTTP 는 새 서버, 소켓은 옛 서버**로
 * 갈라진다. 그 상태가 제일 나쁘다 — 화면이 반씩 맞는 말을 한다.
 */

import { isAppOrigin } from './appOrigin';

export type ServerTarget = 'live' | 'local';

/** 🔴 값의 원천. 로컬 IP 가 바뀌면 여기만 고친다 */
export const TARGETS: Record<ServerTarget, { label: string; api: string }> = {
    live:  { label: '라이브', api: 'https://1dal.altari.com/api' },
    local: { label: '로컬',   api: 'http://172.30.1.72:4000/api' },
};

const KEY = 'apiBase';
const KEY_NAME = 'apiTarget';

/**
 * 브라우저에서는 **상대 경로**가 정답이다 — Vite 프록시(개발)와 Express 정적 서빙(실서버)이
 * 같은 출처로 받아 준다. 앱에서만 절대 주소가 필요하다.
 * 🔴 `localhost` 로 뜨는 것이 **앱의 표식**이다 (Capacitor 가 그 주소로 번들을 띄운다).
 */
export function isNativeApp(): boolean {
    if (typeof window === 'undefined') return false;
    // 🔴 판단은 `appOrigin` 하나다 — 여기서 무늬를 또 적으면 두 벌이 된다 (규칙 ③)
    return (window as any).Capacitor?.isNativePlatform?.() === true
        || isAppOrigin(window.location.origin);
}

/** 지금 보고 있는 서버 이름 — 화면이 «어디를 보는지» 말할 수 있어야 한다 (규칙 ⑤-4 ④) */
export function currentTargetName(): string {
    if (!isNativeApp()) return '이 서버';
    try {
        const t = localStorage.getItem(KEY_NAME) as ServerTarget | null;
        return t && TARGETS[t] ? TARGETS[t].label : TARGETS.live.label;
    } catch {
        return TARGETS.live.label;
    }
}

/**
 * API 주소 — `apiClient` 와 `socket` 이 **둘 다 여기서** 읽는다.
 *
 * 우선순위: 저장된 값 → 빌드 값(`VITE_API_URL`) → 앱이면 라이브 → 브라우저면 상대경로
 */
export function apiBase(): string {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved) return saved;
    } catch { /* 사생활 보호 모드 등 — 기본값으로 간다 */ }

    const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
    if (fromEnv) return fromEnv;

    // 🔴 앱은 상대 경로를 쓰면 자기 번들에게 물어본다 — 반드시 절대 주소여야 한다
    return isNativeApp() ? TARGETS.live.api : '/api';
}

/** 소켓 주소 — API 주소에서 `/api` 만 뗀다. 상대 경로면 `undefined`(같은 출처) */
export function socketBase(): string | undefined {
    const base = apiBase();
    if (base.startsWith('/')) return undefined;
    return base.replace(/\/api\/?$/, '');
}

/**
 * 서버를 바꾼다 — **저장하고 새로고침한다.**
 * 소켓이 옛 주소에 붙은 채로 두면 화면이 반씩 맞는 말을 한다.
 */
export function switchTarget(t: ServerTarget): void {
    try {
        localStorage.setItem(KEY, TARGETS[t].api);
        localStorage.setItem(KEY_NAME, t);
    } catch { /* 저장이 안 되면 이번 세션만 바뀐다 */ }
    window.location.reload();
}

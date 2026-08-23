import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * 🔐 **앱에서는 구글 웹 로그인이 안 된다 — 안드로이드 계정 선택창을 쓴다** (2026-08-23).
 *
 * 기사님: *"관제앱으로 할 거야. **사진도 찍어야 하고 하드웨어를 사용할 거라서.**"*
 *
 * v2 배포 후 앱에서 로그아웃했더니 **다시 로그인할 길이 없었다.** 구글은
 * **임베디드 웹뷰 안에서의 로그인을 정책으로 차단**하기 때문이다(`disallowed_useragent`).
 * `https://localhost` 를 승인된 자바스크립트 원본에 넣어 봤지만 소용없었다 —
 * 막는 이유가 **주소가 아니라 환경**이라서다.
 *
 * 🔴 **오류조차 안 남는다.** 콘솔에 아무것도 안 찍히고 버튼만 조용히 안 뜬다.
 *    그래서 *"구글이 느린가"* 로 오래 헤매게 된다. 이 주석이 그 시간을 아끼려고 있다.
 *
 * 그래서 **네이티브 플러그인**으로 간다. 안드로이드 계정 선택창은 **OS 가 띄우는 것**이라
 * 웹뷰 정책과 무관하다 — 다른 앱에서 *"구글 계정으로 계속"* 을 누르면 뜨는 그 화면이다.
 *
 * 🔴 **`webClientId` 에 웹 클라이언트 ID 를 넣는 것이 핵심이다.**
 *    그래야 받은 `idToken` 의 대상(`aud`)이 **웹 클라이언트 ID** 가 되어,
 *    서버의 기존 검증(`/api/auth/google`)을 **한 줄도 안 고치고** 그대로 쓴다.
 *    안드로이드용 클라이언트 ID 는 어디에도 안 넣는다 — 그건 구글이
 *    *"이 패키지 + 이 서명의 앱이 정품이다"* 를 알아보게 하는 **등록**일 뿐이다
 *    (패키지 `kr.co.onedal.dashboard` + 디버그 키 SHA-1).
 *
 * ⚠️ **릴리스 키로 서명하면 SHA-1 이 달라진다.** 그때 구글 콘솔에 지문을 하나 더 등록해야
 *    하고, 안 하면 **앱에서만 로그인이 조용히 실패한다.**
 */
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/** 네이티브(앱)인가 — 브라우저에서는 기존 `<GoogleLogin>` 이 그대로 돈다 */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

let initialized = false;

async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (!WEB_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID 가 빌드에 안 박혔습니다');
    await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
    initialized = true;
}

/**
 * 안드로이드 계정 선택창을 띄우고 **구글 idToken** 을 받아 온다.
 *
 * 🔴 받은 토큰은 웹 로그인의 `credential` 과 **같은 물건**이다 —
 *    그래서 호출부는 `loginWithGoogle(idToken)` 을 그대로 부르면 된다.
 */
export async function nativeGoogleIdToken(): Promise<string> {
    await ensureInitialized();

    const res = await SocialLogin.login({ provider: 'google', options: {} });
    const idToken = (res as any)?.result?.idToken as string | null | undefined;

    if (!idToken) {
        // 없는 것을 있는 척 넘기지 않는다 — 서버가 이해 못 하는 값으로 헤매는 것보다 낫다
        throw new Error('구글이 idToken 을 주지 않았습니다 (계정 선택을 취소했거나 SHA-1 미등록)');
    }
    return idToken;
}

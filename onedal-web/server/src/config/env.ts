/**
 * 필수 환경 변수 검증 (Phase 1 / 이슈 B)
 *
 * 이전에는 곳곳에서 `process.env.JWT_SECRET || "fallback_secret"` 형태로 읽고 있었다.
 * .env 로드가 한 번이라도 실패하면 **에러 없이 조용히** 공개 문자열로 토큰을 서명하게 되어,
 * 누구나 관제탑 토큰을 위조할 수 있는 상태로 운영되면서도 아무도 알아채지 못한다.
 * 조용한 실패가 가장 위험하므로, 없으면 아예 부팅하지 않는다.
 *
 * ⚠️ validateEnv() 는 index.ts 의 dotenv.config() **이후에** 호출해야 한다.
 *    (CommonJS 에서 import 는 dotenv.config() 보다 먼저 실행되므로
 *     모듈 로드 시점에 process.env 를 읽으면 항상 undefined 다)
 */

/** 없으면 부팅을 거부할 환경 변수 */
const REQUIRED_ENV = ["JWT_SECRET", "JWT_REFRESH_SECRET"] as const;

/** 없으면 기능이 제한되지만 부팅은 허용할 환경 변수 */
const RECOMMENDED_ENV = ["KAKAO_REST_API_KEY", "GOOGLE_CLIENT_ID"] as const;

export function validateEnv(): void {
    const missing = REQUIRED_ENV.filter(k => !process.env[k]?.trim());

    if (missing.length > 0) {
        console.error("\n🚨 ═══════════════════════════════════════════════════");
        console.error("   필수 환경 변수가 없어 서버를 시작할 수 없습니다.");
        console.error(`   누락: ${missing.join(", ")}`);
        console.error("");
        console.error("   server/.env 파일을 확인하세요.");
        console.error("   (이 값이 없으면 예전에는 'fallback_secret' 이라는 공개 문자열로");
        console.error("    토큰을 서명해, 누구나 관제탑 토큰을 위조할 수 있었습니다)");
        console.error("═══════════════════════════════════════════════════\n");
        process.exit(1);
    }

    const weak = RECOMMENDED_ENV.filter(k => !process.env[k]?.trim());
    if (weak.length > 0) {
        console.warn(`⚠️ [환경변수] ${weak.join(", ")} 미설정 — 관련 기능이 동작하지 않습니다.`);
    }

    console.log(`🔐 [환경변수] 필수 ${REQUIRED_ENV.length}개 확인 완료`);
}

/**
 * JWT 서명 키. validateEnv() 가 부팅 시 존재를 보장하므로 폴백이 없다.
 * 런타임에 읽으므로 dotenv 로드 순서에 영향을 받지 않는다.
 */
export function jwtSecret(): string {
    return process.env.JWT_SECRET as string;
}

export function jwtRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET as string;
}

/**
 * 🔒 **여기가 라이브인가.**
 *
 * 2026-08-23 v2 배포 준비 중, 개발용 우회 로그인(`/api/auth/bypass`)이 **라이브에서
 * 열려 있는 것**을 발견했다. 아무나 POST 하면 기사님 계정의 30일짜리 관리자 토큰이 나왔다.
 * 그때까지는 시험 데이터뿐이라 넘어갔지만, v2 부터는 **집 주소와 실제 운행 기록**이 들어간다.
 *
 * 이 파일의 첫 문단과 같은 이야기다 — **조용한 실패가 가장 위험하다.**
 *
 * 🔴 **신호를 둘 본다.** `NODE_ENV` 는 PM2 가 넣고(`ecosystem.config.cjs`),
 *    `DB_FILE` 은 실 DB(`data.db`)를 가리킨다. **하나라도** 라이브를 가리키면 라이브로 본다 —
 *    보안 판단은 **애매하면 닫는다.** 한쪽만 보면 그 설정이 빠진 날 조용히 열린다.
 *
 * ⚠️ **"막을까 말까"에만 쓴다.** 동작을 갈라 쓰면(로컬은 이렇게, 라이브는 저렇게)
 *    로컬에서 통과한 것이 라이브에서 다르게 도는 길이 생긴다 — 이 레포가 반복해 당한 형태다.
 */
export function isLiveServer(): boolean {
    return process.env.NODE_ENV === "production" || process.env.DB_FILE === "data.db";
}

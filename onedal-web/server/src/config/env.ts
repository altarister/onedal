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

/**
 * 🔐 **기기 비밀 토큰 규격 글자 — 한 곳** (운영센터 1단계 · reviews/29 · onedal-ab 서버 · onedal-04 원달앱).
 * 원달앱은 짝(`POST /api/devices/pair`) 성공 본문의 [PAIR_TOKEN_FIELD] 로 토큰을 한 번 받아, 짝 요청 밖의 모든 요청에
 * [DEVICE_TOKEN_HEADER] 로 싣는다. 서버는 거절 까닭을 [DEVICE_LINK_ERRORS] 글자로 `{ error }` 에 싣는다.
 * 원달앱(코틀린)은 `core/DeviceLink.kt` 에 같은 글자를 둔다 — `server/tests/rules/deviceLinkNames.test.ts` 가 맞대어 본다.
 * express 는 헤더를 소문자로 읽는다(`req.header()` 는 대소문자를 가리지 않는다).
 */
export const DEVICE_TOKEN_HEADER = 'X-Device-Token';

/** 짝 성공 본문의 토큰 칸 — 한 번만 준다(서버는 hash 만 둔다) */
export const PAIR_TOKEN_FIELD = 'deviceToken';

/**
 * 거절 까닭 — 401 토큰 틀림(강제 뒤에는 없음도) · 401 연결 안 된 폰 · 401 PIN 틀림(짝 화면 오류) · 403 승인 전·정지·탈퇴.
 * 원달앱은 앞 둘에 «폰 연결이 끊겼습니다 — 다시 연결», 넷째에 «이용이 멈췄습니다» 띠를 띄운다.
 */
export const DEVICE_LINK_ERRORS = {
    TOKEN_INVALID: 'DEVICE_TOKEN_INVALID',
    NOT_PAIRED: 'DEVICE_NOT_PAIRED',
    PIN_INVALID: 'PIN_INVALID',
    ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
} as const;

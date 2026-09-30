/**
 * 📵 **휴대폰 번호 가림** — 010 계열(010 · 011 · 016 · 017 · 018 · 019)만 가운데 넉 자리를 가린다(010-****-5678).
 *    유선 · 대표번호(02 · 031 · 1588)는 사업체 번호라 그대로 둔다. 앞뒤가 숫자·점이면 번호가 아니다(금액 · 좌표 · 주문 번호).
 *    서버 로그 · 운영센터 · 관제웹이 같은 함수를 쓴다 (reviews/29 1단계 I · 가림 규칙).
 */
const MOBILE = /(?<![\d.])(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?![\d.])/g;

export function maskPhone(text: string): string {
    return text.replace(MOBILE, (_m, head: string, _mid: string, tail: string) => `${head}-****-${tail}`);
}

/** 🔑 **폰 연결 번호(PIN) 가림** — 뒤 두 자리만(****18). 로그를 읽는 사람이 3분 안에 그 번호로 남의 계정에 폰을 붙이지 못하게 */
export function maskPin(pin: string): string {
    return pin ? `${'*'.repeat(Math.max(0, pin.length - 2))}${pin.slice(-2)}` : '';
}

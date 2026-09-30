/**
 * 📄 **배차망 페이지 정의의 공통 이름** (reviews/24 · 기사님 «가»).
 *
 * 세 배차망이 **같은 이름**을 쓴다 — 배차망마다 다른 것은 «화면 어디서 · 어떤 글자로»뿐이다(원달앱 `…Pages.kt`).
 * 원달앱 짝은 `core/PageField.kt` — `PageFieldPairTest` 가 낱말과 차례가 같은지 문다 (로그 태그 `logTags.ts` 와 같은 모양).
 */

/** 페이지 넷 — 목록 · 상세(확정 전) · 확정(계약 직후) · 내 오더/배차내역 */
export const SCREEN_PAGES = ['list', 'detail', 'confirm', 'myorders'] as const;
export type ScreenPage = typeof SCREEN_PAGES[number];

/**
 * 모은 글자의 갈래 — 잡음 낱말로 뺀 글자(noise) · 정의에 없어 못 알아본 글자(unknown) · 칸이 다 차서 남는 토막(extra).
 * 서버 `screen_words` 표의 kind 칸이 이 셋이다.
 */
export const WORD_KINDS = ['noise', 'unknown', 'extra'] as const;
export type WordKind = typeof WORD_KINDS[number];

/**
 * 📰 원달앱이 보고 본문 한 칸 `screenWords` 로 싣는 모양 — 한 보고는 한 화면이라 page 는 한 번, 예 한 줄은 낱말마다.
 * 서버 `services/screenWords.ts` 가 받아 `screen_words` 표에 센다.
 */
export interface ScreenWordsReport {
    page: ScreenPage;
    words: Array<{ word: string; kind: WordKind; sample?: string | null }>;
}

/** 칸 이름 — 세 배차망 공통. 새 칸은 여기와 원달앱 짝에 같이 더한다 */
export const PAGE_FIELDS = [
    'pickup',            // 상차지
    'dropoff',           // 하차지
    'fare',              // 요금
    'vehicleType',       // 차종 · 톤수
    'pickupDistance',    // 상차지거리
    'deliveryDistance',  // 배송거리
    'tags',              // 꼬리표·배지 (급송·독차·반나절…)
    'reservation',       // 예약 (낼·당상·픽업예약)
    'clock',             // 시각 (등록·하차 시각 등)
    'remaining',         // 남은 시간 (준비 N분·배송 N분 남음)
    'itemSize',          // 물품 크기·수량
    'memo',              // 적요·유의사항·화물 글
    'contact',           // 연락처·고객·담당
    'orderNo',           // 오더번호·화물번호
    'payment',           // 결제 방법 (신용·카드·착불)
    'commission',        // 수수료
    'stage',             // 운행 단계 (픽업 이동·배송 중)
] as const;
export type PageField = typeof PAGE_FIELDS[number];

/**
 * 기준 페이지 사전
 * 누가: 서버 · 운영센터 · gen-pages · 사전표 뽑기 · 원달앱 짝 검사
 * 언제: 배차망마다 다른 화면을 우리 기준 페이지 이름으로 부를 때
 * 어디서: 배차망 화면 정의 표가 가리키는 이름표
 * 무엇을: 기준 페이지 · 글자 종류 · 칸 이름 목록
 * 어떻게: JSON 표시 사이에 적어 TS 를 못 부르는 스크립트도 글자로 읽는다
 * 왜: 배차망마다 이름이 달라도 같은 기준으로 말하기 위해서다
 */
import type { StandardScreen } from './networkPages';

/**
 * 📄 **기준 페이지 사전** — 모든 배차망이 같은 이름을 쓴다. 배차망마다 다른 것은 «화면 어디서 · 어떤 글자로»뿐이다(원달앱 `…Pages.kt`).
 *
 * 🔴 원천이다 — 여기를 고친다. 기준 페이지 이름에 배차망 말을 쓰지 않는다 — 배차망이 부르는 이름은 정의 표 화면 줄 `name` 에만 둔다.
 * 이름은 콜의 두 사실(주인이 없음/나 × 목록/한 건)으로만 짓는다. 이름 · 한글은 `설계/기준페이지_이름표.md` 0장, 뜻(`does`)은 `설계/기준페이지_분류.md` 2장의 요약이다.
 * 읽는 곳: TS(아래 파생) · 생성 스크립트 `gen-pages.mjs` · 원달앱 `PageFieldPairTest` · `NetworkPagesPairTest` — 뒤의 셋은 TS 를 못 부르므로 아래 JSON 글자를 같은 정규식으로 읽는다.
 * 그래서 이 파일에는 JSON 표시 한 쌍만 둔다(주석에 그 표시 글자를 쓰면 정규식이 주석을 먼저 잡는다).
 *
 * - `pages`: 기준 페이지(차례가 곧 기준 페이지 차례) · `owner` 콜의 주인(none 주인 없음 · me 나) · `shape` 목록(list)인가 한 건(one)인가
 * - `baseOf`: 화면 종류 → 기준 페이지(null 이면 기준 밖: 넘어가는 틀 · 배차망 메뉴 · 다른 앱)
 * - `callOverlays`: 콜 한 건 화면 위의 부속 팝업 — 열쇠는 정의 표의 부속 자리 `slot`
 * - `runStages`: 내 콜 화면 안의 운행 단계(열쇠는 화면 종류 이름)
 */
export const BASE_PAGE_BOOK = /*JSON*/{
    "pages": {
        "home":    {"label": "홈",          "owner": null,   "shape": null,   "does": "배차망 앱을 켜는 첫 화면 · 원달앱은 아무것도 안 한다"},
        "newList": {"label": "새 콜 목록",  "owner": "none", "shape": "list", "does": "주인 없는 콜들 · 원달앱이 줄을 읽어 거르고 맞는 줄을 누른다"},
        "newCall": {"label": "새 콜 화면",  "owner": "none", "shape": "one",  "does": "주인 없는 콜 한 건 · 칸을 읽어 판정 · 자동이면 계약 단추"},
        "myList":  {"label": "내 콜 목록",  "owner": "me",   "shape": "list", "does": "내 콜들 · 여러 콜 · 여러 상태"},
        "myCall":  {"label": "내 콜 화면",  "owner": "me",   "shape": "one",  "does": "내 콜 한 건 · 결재 단추 · 운행 단계"}
    },
    "baseOf": {"HOME": "home", "LIST": "newList", "DETAIL_PRE_CONFIRM": "newCall", "MY_ORDERS": "myList", "DETAIL_CONFIRMED": "myCall", "RUN_TO_PICKUP": "myCall", "RUN_AT_PICKUP": "myCall", "RUN_TO_DROPOFF": "myCall", "RUN_AT_DROPOFF": "myCall", "RUN_DONE": "myCall", "TRANSITION": null, "NETWORK_MENU": null, "OTHER_APP": null},
    "callOverlays": {"pickup": "콜 상차지 팝업", "dropoff": "콜 하차지 팝업", "memo": "콜 적요 팝업"},
    "runStages": {"RUN_TO_PICKUP": "상차지로 가는 중", "RUN_AT_PICKUP": "상차지에서", "RUN_TO_DROPOFF": "하차지로 가는 중", "RUN_AT_DROPOFF": "하차지에서", "RUN_DONE": "완료"}
}/*JSON*/ as const;

/** 기준 페이지 — 홈 포함. 타입은 `pages` 에서만 뽑는다(같은 식 안에서 자기 타입을 쓰면 순환이다) */
export type BasePage = keyof typeof BASE_PAGE_BOOK.pages;
/** 칸을 적는 페이지 — 홈은 콜 자료가 없어 칸을 적지 않는다 */
export type ScreenPage = Exclude<BasePage, 'home'>;
export const BASE_PAGES = Object.keys(BASE_PAGE_BOOK.pages) as readonly BasePage[];
export const SCREEN_PAGES = BASE_PAGES.filter((p) => p !== 'home') as readonly ScreenPage[];
/** 사람이 읽는 이름 — 서버 로그와 운영센터 화면 낱말 표가 같은 말을 쓴다 */
export const SCREEN_PAGE_LABEL: Record<ScreenPage, string> = Object.fromEntries(
    SCREEN_PAGES.map((p) => [p, BASE_PAGE_BOOK.pages[p].label]),
) as Record<ScreenPage, string>;
/** 화면 종류 → 기준 페이지(기준 밖은 null) — 타입을 따로 단 줄이라 화면 종류가 빠져도, 사전 밖 글자여도 컴파일이 문다 */
export const BASE_PAGE_OF: Readonly<Record<StandardScreen, BasePage | null>> = BASE_PAGE_BOOK.baseOf;
export const basePageOf = (standard: StandardScreen | null): BasePage | null => (standard === null ? null : BASE_PAGE_OF[standard]);
/** 콜 한 건 화면 위 부속 팝업의 공통 이름(부속 자리 `slot` → 이름) */
export const CALL_OVERLAY_LABEL: Readonly<Record<keyof typeof BASE_PAGE_BOOK.callOverlays, string>> = BASE_PAGE_BOOK.callOverlays;

/** 📍 자리 — 배차망마다 «이 자리에 어떤 화면이 있나»를 적는 단위: 기준 페이지(홈 포함) · 내 콜 화면 안의 운행 단계 · 콜 한 건 화면 위의 부속 팝업. 사전에서 파생한다(손으로 나열하지 않는다) */
export type BaseSlot = BasePage | keyof typeof BASE_PAGE_BOOK.runStages | keyof typeof BASE_PAGE_BOOK.callOverlays;

/**
 * 모은 글자의 갈래 — 잡음 낱말로 뺀 글자(noise) · 정의에 없어 못 알아본 글자(unknown) · 칸이 다 차서 남는 토막(extra).
 * 서버 `screen_words` 표의 kind 칸이 이 셋이다.
 */
export const WORD_KINDS = ['noise', 'unknown', 'extra'] as const;
export type WordKind = typeof WORD_KINDS[number];
/** 사람이 읽는 이름 — 서버 로그와 관제웹 현황판이 같은 말을 쓴다 */
export const WORD_KIND_LABEL: Record<WordKind, string> = { noise: '잡음으로 뺌', unknown: '정의에 없음', extra: '남는 토막' };

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
    'toll',              // 탁송료 · 경유비
    'billing',           // 계산서 · 영수증
] as const;
export type PageField = typeof PAGE_FIELDS[number];

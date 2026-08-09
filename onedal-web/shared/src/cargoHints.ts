// ⚠️ **타입만** 가져온다. 값(CARGO_SIZES 등)을 import 하면 순환 참조가 된다 —
//    index.ts 가 이 파일을 re-export 하므로, 모듈 초기화 시점에
//    `ReferenceError: Cannot access 'CARGO_SIZES' before initialization` 로 **서버가 부팅조차 못 한다.**
//    타입 import 는 컴파일 후 사라지므로 안전하다.
//    (2026-08-10: tsc·jest 는 통과했는데 tsx 런타임에서만 터졌다. 스모크가 잡았다)
import type { HandlingMethod } from './index';
import type { CargoUnit } from './cargoUnits';
import type { CargoTag } from './cargoTags';

/**
 * [Phase 8.4] 적요·물품 텍스트에서 통화 시트를 **미리 채울 힌트**를 뽑는다.
 *
 * 실제 적요는 이렇게 생겼다 (local.db 16건 전수 확인):
 *   itemDescription: `"마대 1개"` `"박스 1개"` `"쇼핑백 2개"` `"서류봉투"` `"소형 가전"`
 *   detailMemo:      `"*카고 입니다. 세금계산서필 12:42상차. 마스크 카톤마대 1개명세서폐기.
 *                      현위치 ➔ 상차지 0.2KM. 상차지 ➔ 하차지 59.3KM"`
 * 기사님이 보여준 다른 예: `"1시상차 6박스 카트가지고 고객님앞 갖다주세요"`
 *
 * ⚠️ **추측하지 않는다.** 텍스트에 실제로 적힌 것만 돌려준다.
 *    "박스"라고만 쓰여 있으면 크기는 모르는 것이다 — 소·중·대 중 무엇인지 알 수 없다.
 *    잘못 채워두면 기사님이 확인 없이 저장할 때 적재 판정이 틀어진다.
 *    힌트는 **한 번의 탭으로 적용**되며, 적용 전에는 아무것도 저장되지 않는다.
 */

export interface CargoHints {
    /** 적요에 적힌 단위 그대로 (마대·박스·서류봉투 …) */
    unit?: CargoUnit;
    quantity?: number;
    handling?: HandlingMethod;
    /** 상차 약속 시각 `HH:MM` */
    promisedAt?: string;
    /** 적요에서 읽어낸 화물 성질 */
    tags?: CargoTag[];
    /** 화면에 그대로 보여줄 근거 문구 (예: "1개 · 12:42 상차") */
    summary: string;
}

/**
 * 적요의 낱말 → 적재 단위.
 *
 * 단위를 **기사님이 쓰는 말** 그대로 두니 매핑이 자연스러워졌다.
 * 예전에는 "마대"를 소·중·대 중 무엇으로 볼지 알 수 없어 포기했는데,
 * 이제는 `마대`가 곧 단위다 — 추측할 것이 없다.
 * 순서가 중요하다: `서류봉투`가 `봉투`보다 먼저, `라면박스`가 `박스`보다 먼저.
 */
const UNIT_WORDS: Array<[RegExp, CargoUnit]> = [
    [/톤\s*백|톤마대|톤\s*마대/, '톤백'],
    [/파렛트|팔레트|파레트|파렛|팔렛/, '파레트'],
    [/서류\s*봉투|봉투|서류/, '서류봉투'],
    [/쇼핑백/, '쇼핑백'],
    [/마대/, '마대'],
    [/박스|카톤|BOX|box/, '라면박스'],
];

/**
 * 성질은 낱말이 명시적으로 있을 때만 붙인다.
 * `가전` 은 단위가 아니라 성질이다 — 냉장고와 전기면도기가 같은 부피일 리 없다.
 */
const TAG_WORDS: Array<[RegExp, CargoTag]> = [
    [/가전|냉장고|세탁기|에어컨|TV|티비|모니터/, '가전'],
    [/농산물|야채|채소|과일|농산/, '농산물'],
    [/수산물|생선|활어|해산물|수산/, '수산물'],
    [/살아\s*있|생물/, '생물'],
    [/파손|깨지|유리|취급\s*주의|조심/, '파손주의'],
    [/위험물|인화|가스|화학/, '위험물'],
    [/귀중품|고가|귀금속/, '귀중품'],
    [/중량물|무거|중량/, '중량물'],
];

const HANDLING_WORDS: Array<[RegExp, HandlingMethod]> = [
    [/지게차|호크리프트|포크리프트/, '지게차'],
    [/호이스트|크레인|카고크레인/, '호이스트'],
    [/카트|수레|대차|손수레|하이바|직접\s*운반/, '수작업'],
];

export function parseCargoHints(...texts: (string | undefined | null)[]): CargoHints {
    const text = texts.filter(Boolean).join(' ');
    const hints: CargoHints = { summary: '' };
    if (!text) return hints;

    // 개수 — "1개", "6박스", "2쇼핑백"
    const qty = text.match(/(\d+)\s*(개|박스|파렛트|팔레트|마대|쇼핑백|톤백|짝|롤|통|EA|ea)/);
    if (qty) {
        const n = parseInt(qty[1], 10);
        if (n > 0 && n <= 999) hints.quantity = n;
    }

    for (const [re, u] of UNIT_WORDS) {
        if (re.test(text)) { hints.unit = u; break; }
    }
    for (const [re, method] of HANDLING_WORDS) {
        if (re.test(text)) { hints.handling = method; break; }
    }

    const tags = TAG_WORDS.filter(([re]) => re.test(text)).map(([, t]) => t);
    if (tags.length) hints.tags = tags;

    // 상차 약속 시각. 인성 적요는 `12:42상차` 형태가 매우 일관적이다.
    // `1시상차` 같은 축약형도 함께 받는다.
    const hhmm = text.match(/(\d{1,2})\s*:\s*(\d{2})\s*상차/);
    const hOnly = text.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?\s*상차/);
    if (hhmm) {
        hints.promisedAt = `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
    } else if (hOnly) {
        hints.promisedAt = `${hOnly[1].padStart(2, '0')}:${(hOnly[2] || '0').padStart(2, '0')}`;
    }

    hints.summary = [
        hints.tags?.join('·'),
        hints.unit,
        hints.quantity != null ? `${hints.quantity}개` : null,
        hints.handling,
        hints.promisedAt ? `${hints.promisedAt} 상차` : null,
    ].filter(Boolean).join(' · ');

    return hints;
}

/** 힌트에 쓸 만한 값이 하나라도 있는가 */
export function hasCargoHints(h: CargoHints): boolean {
    return !!(h.unit || h.quantity != null || h.handling || h.promisedAt || h.tags?.length);
}

import { CARGO_SIZES, HANDLING_METHODS } from './index';
import type { CargoSize, HandlingMethod } from './index';

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
    sizeClass?: CargoSize;
    quantity?: number;
    handling?: HandlingMethod;
    /** 상차 약속 시각 `HH:MM` */
    promisedAt?: string;
    /** 화면에 그대로 보여줄 근거 문구 (예: "1개 · 12:42 상차") */
    summary: string;
}

/** 크기를 **확실히 알 수 있는** 낱말만 매핑한다. "박스"는 크기를 알려주지 않는다 */
const SIZE_WORDS: Array<[RegExp, CargoSize]> = [
    [/서류\s*봉투|봉투|서류/, '소'],
    [/파렛트|팔레트|파레트|파렛|팔렛/, '대'],
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
    const qty = text.match(/(\d+)\s*(개|박스|파렛트|팔레트|마대|쇼핑백|짝|롤|통|EA|ea)/);
    if (qty) {
        const n = parseInt(qty[1], 10);
        if (n > 0 && n <= 999) hints.quantity = n;
    }

    for (const [re, size] of SIZE_WORDS) {
        if (re.test(text)) { hints.sizeClass = size; break; }
    }
    for (const [re, method] of HANDLING_WORDS) {
        if (re.test(text)) { hints.handling = method; break; }
    }

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
        hints.sizeClass,
        hints.quantity != null ? `${hints.quantity}개` : null,
        hints.handling,
        hints.promisedAt ? `${hints.promisedAt} 상차` : null,
    ].filter(Boolean).join(' · ');

    return hints;
}

/** 힌트에 쓸 만한 값이 하나라도 있는가 */
export function hasCargoHints(h: CargoHints): boolean {
    return !!(h.sizeClass || h.quantity != null || h.handling || h.promisedAt);
}

// 사용하지 않는 import 로 보이지 않게 (규격 상수와 같은 축임을 명시)
void CARGO_SIZES; void HANDLING_METHODS;

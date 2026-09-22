import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔗 **픽커 낱말 사전은 서버와 앱이 «짝» 이다**.
 *
 * 앱은 서버 사전(`keywords_picker.json`)을 받아 쓰되, **못 받으면 앱에 박힌 기본값**으로 돈다
 * (`KakaoPickerParser.wordsFrom(key, fallback)`). 그래서 낱말을 **한쪽에만** 넣으면:
 *   · 폰은 사전을 받아 멀쩡히 돌고
 *   · 서버가 죽거나 첫 실행(사전 받기 전)에는 **그 낱말이 통째로 지역 이름으로 샌다**
 *
 * 예: «경유» 를 서버 사전에만 넣으면 폰에서는 듣고 검사에서는 안 듣는다 —
 * 사전을 못 받은 폰에서는 경유 콜의 주소가 «경유 9/18(금) → …» 로 저장된다.
 *
 * 🔴 **이 검사는 «서버에 있는 낱말이 앱 기본값에도 있나» 만 본다.**
 *    반대(앱에만 있는 것)는 막지 않는다 — 앱 기본값은 «서버가 죽었을 때의 최소한» 이라
 *    서버 사전이 더 넓은 것은 정상이다 (`fromServer + fallback` 으로 합쳐 쓴다).
 */

const DICT = join(__dirname, '../../config/keywords_picker.json');
const PARSER = join(
    __dirname,
    '../../../../onedal-app/app/src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerParser.kt',
);

/** 앱 기본값이 담긴 Kotlin 상수 — 서버 사전의 칸 이름과 짝 */
const PAIRS: Array<[serverKey: string, appConst: string]> = [
    ['tagWords', 'TAG_WORDS'],
    ['itemSizes', 'ITEM_SIZES'],
    ['bottomTabWords', 'BOTTOM_TAB_WORDS'],
    ['detailOnlyWords', 'DETAIL_ONLY_WORDS'],
];

/** `private val NAME = setOf("가", "나", …)` 에서 낱말만 뽑는다 (주석 줄은 건너뛴다) */
function appWords(source: string, constName: string): string[] {
    const start = source.indexOf(`val ${constName} = setOf(`);
    if (start < 0) throw new Error(`앱에 ${constName} 가 없다 — 이름이 바뀌었으면 이 검사도 고친다`);
    const open = source.indexOf('(', start);
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    const body = source.slice(open + 1, end);
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('픽커 낱말 사전 — 서버와 앱 기본값은 짝이다', () => {
    const dict = JSON.parse(readFileSync(DICT, 'utf8')) as Record<string, unknown>;
    const parser = readFileSync(PARSER, 'utf8');

    it.each(PAIRS)('🔗 서버 «%s» 의 낱말은 앱 «%s» 에도 있다', (serverKey, appConst) => {
        const server = dict[serverKey];
        expect(Array.isArray(server)).toBe(true);
        const app = new Set(appWords(parser, appConst));
        const missing = (server as string[]).filter((w) => !app.has(w));
        expect(missing).toEqual([]);
    });

    /**
     * 🔴 «Ad» 는 앱이 스스로 아는 광고 표시다 — 서버 사전의 제목 문구는 **덧붙임**이라 짝을 안 본다.
     * 대신 앱이 그 표시를 잃지 않았는지만 확인한다 (문구로 막으면 바뀔 때 뚫린다 · 기사님 지시).
     */
    it('🔴 앱은 광고 표시 «Ad» 를 스스로 안다 — 제목 문구에 기대지 않는다', () => {
        expect(appWords(parser, 'AD_START_WORDS')).toContain('Ad');
    });
});

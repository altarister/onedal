import { regionKeywordHit } from '@onedal/shared';

/**
 * 🗺️ **지역 키워드 매칭 — 부분 문자열 오탐을 사전으로 막는다**
 *
 * 복귀행(집=광주) 필터의 키워드 "남동"(광주 인근 동)이 "인천 **남동**구" 에
 * contains 로 걸리면 인천행 콜이 통과한다 — 앱 1차·2차가 같은 낱말에 같이 뚫린다.
 *
 * 규칙 (기사님 확정 ④ — 사전 확장 매칭):
 *   키워드가 텍스트에 있어도, 이어지는 글자를 붙인 것이 **사전에 있는 다른
 *   지명(트랩)** 이면 그 자리는 다른 곳이다. 사전에 없어도 행정 단위 글자
 *   (구·시·군)가 바로 이어지면 마찬가지다 — 더 큰 지명의 일부였던 것.
 *   같은 텍스트에 다른 자리로 또 나오면 그 자리는 따로 다시 본다.
 *
 * 🔴 미탐이 오탐보다 아프다 (규칙 ⑤ — 앱은 놓치지 않는 것이 목적).
 *    番地·공백·조사가 이어지는 정상 표기는 전부 통과해야 한다.
 */
describe('regionKeywordHit — 사전 확장 매칭', () => {
    it('🔴 "인천 남동구" 는 키워드 "남동" 과 불일치 — 트랩(남동구)', () => {
        expect(regionKeywordHit('인천 남동구 인하로 484', '남동', ['남동구'])).toBe(false);
    });

    it('🔴 트랩 사전이 없어도 구·시·군이 바로 이어지면 불일치', () => {
        expect(regionKeywordHit('인천 남동구 인하로 484', '남동', [])).toBe(false);
        expect(regionKeywordHit('부천 중동구간요금소', '중동', [])).toBe(false);
    });

    it('진짜 그 동은 통과 — 공백·번지·끝', () => {
        expect(regionKeywordHit('경기 광주시 남동 32-1', '남동', ['남동구'])).toBe(true);
        expect(regionKeywordHit('경기 광주시 경안동 167-1', '경안동', [])).toBe(true);
        expect(regionKeywordHit('도착지 초월읍', '초월읍', [])).toBe(true);
    });

    it('같은 텍스트에 트랩 자리와 진짜 자리가 같이 있으면 통과 — 자리마다 따로 본다', () => {
        expect(regionKeywordHit('남동구청에서 남동 방면', '남동', ['남동구'])).toBe(true);
    });

    it('키워드가 아예 없으면 불일치', () => {
        expect(regionKeywordHit('서울 마포구 상암동', '남동', ['남동구'])).toBe(false);
    });
});

describe('배선 — 서버·앱이 같은 규칙을 쓴다', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

    it('🔴 서버 Stage1 경유 검사가 anyRegionHit 를 쓴다 (includes 로 되돌리지 않는다)', () => {
        const ev = read('../../src/core/engine/OrderEvaluator.ts');
        expect(ev).toMatch(/anyRegionHit\(dropoffText, keywords, filter\.keywordTraps\)/);
    });

    it('🔴 keywordTraps 는 키워드에서 매번 파생된다 — 한 함수(`refreshKeywordTraps`) · 상차 ∪ 하차 목록 (2026-09-15)', () => {
        const fm = read('../../src/state/filterManager.ts');
        expect(fm.match(/keywordTraps = /g)?.length).toBe(1);
        expect(fm).toMatch(/f\.keywordTraps = trapsForKeywords\(\[\.\.\.new Set\(\[\.\.\.\(f\.destinationKeywords \?\? \[\]\), \.\.\.\(f\.pickupKeywords \?\? \[\]\)\]\)\]\)/);
        const upd = fm.slice(fm.indexOf('export function updateActiveFilter('));
        expect(upd.slice(0, upd.indexOf('\n}'))).toMatch(/refreshKeywordTraps\(session\)/);
    });

    /**
     * 🔴 **앞에 붙은 것이 사전에 있는 더 긴 지명이면 다른 곳이다** (기사님 실측)
     *
     * 「빼는 곳」에 서울 전체를 넣어 두었는데 **문정동 → 신도림동** 콜이 올라왔다.
     * 하차 목록에 서울은 한 곳도 없었고, 대신 **「도림동」**이 들어 있었다 —
     * 「신도림동」 안에 그 글자가 그대로 있어 통과한 것이다.
     *
     * 🔴 **가르는 것은 사전이지 글자 종류가 아니다.** 「앞이 한글이면 막는다」로 재면
     *    칸 사이 공백이 사라진 채 올라온 정상 주소가 전부 막힌다 —
     *    「인천남동구논현동」의 「논현동」(앞이 '구')처럼. 이 함수는 «좋은 콜을 통과시키는»
     *    자리(상차 목록 · 하차 경유)가 쓰므로 막히면 콜을 놓친다 (규칙 ⑤).
     */
    it('🔴 앞에 붙은 것이 사전에 있는 지명이면 다른 곳이다 — 신도림동은 도림동이 아니다', () => {
        expect(regionKeywordHit('서울 구로구 신도림동', '도림동', ['신도림동'])).toBe(false);
        expect(regionKeywordHit('서울 영등포구 도림동', '도림동', ['신도림동'])).toBe(true);
    });

    /**
     * 🔴 **칸 사이 공백이 사라진 주소도 통과한다** (`onedal-app/CLAUDE.md` 「웹뷰 화면」).
     *    화면엔 `6.8` `경기 광명시` 로 보여도 접근성 트리에는 `6.8경기 광명시` 로 온다.
     */
    it('🔴 붙어서 올라온 주소도 통과한다 — 앞 글자가 한글이라고 막지 않는다', () => {
        expect(regionKeywordHit('인천남동구논현동 638-1', '논현동', [])).toBe(true);
        expect(regionKeywordHit('충북청주시흥덕구오송읍정중리', '오송읍', [])).toBe(true);
        expect(regionKeywordHit('서울시강남구역삼동', '역삼동', [])).toBe(true);
        expect(regionKeywordHit('경기성남시수정구시흥동326', '시흥동', [])).toBe(true);
    });

    /**
     * 🔴 **앞 글자가 행정 단위여도 사전이 먼저다** — 「앞이 시·군·구·읍·면이면 통과」로 재면
     *    여기 둘이 다시 샌다. 그래서 글자가 아니라 사전으로 가른다.
     */
    it('🔴 앞이 행정 단위 글자라도 사전에 있으면 막는다 — 면목동의 목동 · 읍내동의 내동', () => {
        expect(regionKeywordHit('서울 중랑구 면목동', '목동', ['면목동'])).toBe(false);
        expect(regionKeywordHit('대전 대덕구 읍내동', '내동', ['읍내동'])).toBe(false);
        expect(regionKeywordHit('서울 양천구 목동', '목동', ['면목동'])).toBe(true);
    });

    it('앞이 공백·번지·괄호면 그대로 통과한다 (규칙 ⑤ — 미탐이 오탐보다 아프다)', () => {
        expect(regionKeywordHit('도림동 123-4', '도림동', ['신도림동'])).toBe(true);
        expect(regionKeywordHit('(도림동)', '도림동', ['신도림동'])).toBe(true);
        /* 숫자가 뒤에 붙는 법정동은 제 이름이다 — 성수동2가에서 「성수동」은 맞다 */
        expect(regionKeywordHit('서울 성동구 성수동2가', '성수동', [])).toBe(true);
    });

    /**
     * 🔴 **앞 트랩은 서버가 같은 사전에서 함께 만든다** — 한 곳(`trapsForKeywords`)이다.
     *    안 만들면 앱은 앞을 못 봐 「신도림동」이 다시 샌다.
     */
    it('🔴 트랩 사전에 «키워드로 끝나는 지명»도 담는다', () => {
        const gs = read('../../src/services/geoService.ts');
        expect(gs).toMatch(/n\.startsWith\(k\) \|\| n\.endsWith\(k\)/);
    });

    /**
     * 🔴 **빈 사전을 굳히지 않는다** (규칙 ④) — 앞 규칙은 사전이 있어야 돈다.
     *    지도가 아직 안 올라온 사이에 빈 Set 을 캐시하면 그 서버가 사는 내내 트랩이 비어,
     *    앱이 앞을 못 보고 「신도림동」이 「도림동」으로 통과한다.
     */
    it('🔴 지명 사전이 비면 캐시하지 않는다 — 지도가 늦게 올라와도 채워진다', () => {
        const gs = read('../../src/services/geoService.ts');
        expect(gs).toMatch(/if \(s\.size\) adminNameSet = s;/);
        expect(gs).not.toMatch(/\n    adminNameSet = s;/);
    });

    it('🔴 앱 미러(RegionMatch.kt)가 있고 두 파서가 그것으로 매칭한다', () => {
        const base = '../../../../onedal-app/app/src/main/java/com/onedal/app/plugins';
        expect(read(`${base}/RegionMatch.kt`)).toMatch(/regionMatch\.ts 의 \*\*미러\*\*/);
        expect(read(`${base}/insung/InsungParser.kt`).match(/RegionMatch\.anyHit\(/g)!.length).toBeGreaterThanOrEqual(2);
        expect(read(`${base}/hwamul24/Hwamul24Parser.kt`)).toMatch(/RegionMatch\.anyHit\(/);
    });
});

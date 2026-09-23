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
     * 🔴 **앞에 글자가 붙어도 다른 곳이다** (기사님 실측)
     *
     * 「빼는 곳」에 서울 전체를 넣어 두었는데 **문정동 → 신도림동** 콜이 올라왔다.
     * 하차 목록에 서울은 한 곳도 없었고, 대신 **「도림동」**이 들어 있었다 —
     * 「신도림동」 안에 그 글자가 그대로 있어 통과한 것이다.
     *
     * 지금 규칙은 **키워드 뒤**만 본다(「남동」+「구」). 앞은 안 봐서 한 글자 붙은 동 이름이
     * 전부 샌다 — 신도림동/도림동 · 신대방동/대방동 · 상도동/도동 …
     */
    it('🔴 앞에 한글이 붙으면 다른 곳이다 — 신도림동은 도림동이 아니다', () => {
        expect(regionKeywordHit('서울 구로구 신도림동', '도림동')).toBe(false);
        expect(regionKeywordHit('서울 영등포구 도림동', '도림동')).toBe(true);
        /* 🔴 앞이 공백·번지·도로명이면 그대로 통과한다 — 미탐이 오탐보다 아프다 (규칙 ⑤) */
        expect(regionKeywordHit('도림동 123-4', '도림동')).toBe(true);
        expect(regionKeywordHit('(도림동)', '도림동')).toBe(true);
        /* 숫자가 붙은 법정동은 제 이름이다 — 성수동2가에서 「성수동」은 맞다 */
        expect(regionKeywordHit('서울 성동구 성수동2가', '성수동')).toBe(true);
    });

    it('🔴 앱 미러(RegionMatch.kt)가 있고 두 파서가 그것으로 매칭한다', () => {
        const base = '../../../../onedal-app/app/src/main/java/com/onedal/app/plugins';
        expect(read(`${base}/RegionMatch.kt`)).toMatch(/regionMatch\.ts 의 \*\*미러\*\*/);
        expect(read(`${base}/insung/InsungParser.kt`).match(/RegionMatch\.anyHit\(/g)!.length).toBeGreaterThanOrEqual(2);
        expect(read(`${base}/hwamul24/Hwamul24Parser.kt`)).toMatch(/RegionMatch\.anyHit\(/);
    });
});

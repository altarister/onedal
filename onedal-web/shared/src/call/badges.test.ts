import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isExpressForm, BADGE_PLACES, BADGE_MEANINGS, TRIP_TYPES, ORDER_FORMS, type BadgePlace } from './badges';
import { badgeOf, badgeValueAmong } from '../network/pageRead';
import { NETWORK_PAGES } from '../network/networkPages';
import type { TargetAppType } from '../index';

/**
 * 🏷️ **급송은 형태 값 «급송» 하나로 가른다**.
 * «보통» · «모름» · 빈칸(null · undefined)은 급송이 아니다 — 서버 isExpress 와 관제웹 «급송» 표시가 같은 답을 본다.
 */
describe('isExpressForm', () => {
    it('형태 «급송» 은 급송이다', () => {
        expect(isExpressForm('급송')).toBe(true);
    });

    it.each([['보통'], ['모름'], [null], [undefined]] as const)('형태 %s 는 급송이 아니다', (orderForm) => {
        expect(isExpressForm(orderForm)).toBe(false);
    });
});

/**
 * 🏷️ **표시 글자 «글자 → 자리 · 뜻»은 정의 표 `badgeWords` 한 곳** — 공통 문제지 `pageReadCases.json` `badgeCases` 를 shared `badgeOf` 로 푼다.
 * meaning null 줄은 표시 글자가 아니다(플렉스 꼬리표에 섞인 차종 · 주소 조각) — 정의 표에 줄이 없어야 한다.
 */
describe('표시 글자 문제지 (badgeCases)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, '../network/pageReadCases.json'), 'utf8')) as
        { badgeCases: Array<{ network: TargetAppType; at: BadgePlace; text: string; meaning: string | null; value?: string; why: string }> };

    it.each(sheet.badgeCases.map(c => [`${c.network} ${c.at} «${c.text}» — ${c.why}`, c] as const))('%s', (_, c) => {
        const found = badgeOf(c.network, c.at, c.text);
        expect(found?.meaning ?? null).toBe(c.meaning);
        expect(found?.value).toBe(c.value);
    });

    it('정의 표 줄 — 자리 · 뜻 갈래는 목록 낱말 · 값은 구분 · 형태 갈래만 그 목록 값 · 한 배차망에 (자리, 글자)는 하나 · 표가 있으면 까닭 한 줄', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            const words = spec.badgeWords ?? [];
            for (const w of words) {
                const at = `${net} ${w.at} «${w.text}»`;
                expect(BADGE_PLACES, at).toContain(w.at);
                expect(BADGE_MEANINGS, at).toContain(w.meaning);
                if (w.meaning === 'tripType') expect(TRIP_TYPES, at).toContain(w.value);
                else if (w.meaning === 'orderForm') expect(ORDER_FORMS, at).toContain(w.value);
                else expect(w.value, at).toBeUndefined();
            }
            const keys = words.map(w => `${w.at}|${w.text}`);
            expect(keys.filter((k, i) => keys.indexOf(k) !== i), net).toEqual([]);
            if (words.length) expect(spec.badgeWordsWhy, net).toBeTruthy();
        }
    });
});

/**
 * 🏷️ **목록 꼬리표 줄 · 칸 앞 토막의 구분 · 형태 값** — 공통 문제지 `badgeValueCases` 를 shared `badgeValueAmong` 으로 푼다(원달앱 짝 `BadgeCasesTest` 가 같은 답).
 * 값 낱말이 있으면 그 값 · 없으면 빈칸 — 구분 · 형태 자리가 따로 없는 글이라 «모름»을 내지 않는다(표시 계획 정해진 것 4).
 */
describe('구분 · 형태 값 문제지 (badgeValueCases)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, '../network/pageReadCases.json'), 'utf8')) as
        { badgeValueCases: Array<{ network: TargetAppType; meaning: 'tripType' | 'orderForm'; words: Array<{ at: BadgePlace; text: string }>; expect: string | null; why: string }> };

    it.each(sheet.badgeValueCases.map(c => [`${c.network} ${c.meaning} ${c.words.map(w => w.text).join(' ')} — ${c.why}`, c] as const))('%s', (_, c) => {
        expect(badgeValueAmong(c.network, c.meaning, c.words)).toBe(c.expect);
    });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NETWORK_PAGES } from './networkPages';
import { PAGE_FIELDS, SCREEN_PAGES } from './pageFields';
import { TARGET_APPS } from './index';

/**
 * 📄 **배차망 화면 정의 표 — 서버가 믿고 읽을 수 있나** (reviews/34 2단계 · onedal-46 3단계 조건).
 * 낱말은 pageFields 의 것만 · read 정규식은 JS 와 코틀린이 같은 뜻으로 읽는 문법만(플래그 · \p{} · 이름 묶음 · 소유 수량자 금지) · 공통 문제지가 JS 로도 같은 답.
 */
describe('배차망 화면 정의 표', () => {
    it('배차망은 TARGET_APPS 셋 · 화면은 SCREEN_PAGES · 칸은 PAGE_FIELDS 낱말만', () => {
        expect(Object.keys(NETWORK_PAGES).sort()).toEqual([...TARGET_APPS].sort());
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) {
            for (const [page, rows] of Object.entries(spec.pages)) {
                expect(SCREEN_PAGES, `${net} 화면 ${page}`).toContain(page);
                for (const r of rows) expect(PAGE_FIELDS, `${net} ${page} 칸 ${r.field}`).toContain(r.field);
            }
        }
    });

    it('read 는 JS 에서 깨지지 않고 공통 문법만 쓴다 · 1번 묶음이 있다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) for (const [page, rows] of Object.entries(spec.pages)) for (const r of rows) {
            if (r.read === undefined) continue;
            const at = `${net} ${page} ${r.field}`;
            expect(() => new RegExp(r.read!), at).not.toThrow();
            expect(r.read, `${at} — \\p{} · 이름 묶음 · 소유 수량자 · 안쪽 플래그 금지`).not.toMatch(/\\p\{|\(\?<[A-Za-z]|\+\+|\*\+|\?\+|\(\?[imsx]/);
            expect(new RegExp(`${r.read}|`).exec('')!.length, `${at} — 1번 묶음`).toBeGreaterThanOrEqual(2);
        }
    });

    it('공통 문제지 — JS 로 읽어도 원달앱과 같은 답(같은 표 · 노드를 한 칸 띄어 이음)', () => {
        const sheet = JSON.parse(readFileSync(join(__dirname, 'pageReadCases.json'), 'utf8')) as { cases: Array<{ network: string; page: string; field: string; texts: string[]; expect: string | null; why: string }> };
        for (const c of sheet.cases) {
            const rows = (NETWORK_PAGES as Record<string, { pages: Record<string, Array<{ field: string; handling: string; read?: string }>> }>)[c.network].pages[c.page] ?? [];
            const spec = rows.find(r => r.field === c.field && r.handling === 'READ' && r.read !== undefined);
            const got = spec ? (new RegExp(spec.read!).exec(c.texts.join(' '))?.[1]?.trim() || null) : null;
            expect(got, `${c.network} ${c.page} ${c.field} — ${c.why}`).toBe(c.expect);
        }
    });
});

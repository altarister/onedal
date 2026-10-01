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
            /* \b · \w · \W · \B 금지 — JS(u 없음)는 한글을 낱말 글자로 안 보고 코틀린은 본다 · 같은 정규식이 둘에서 다른 답(옛 서버 짐작이 «60분»을 60 으로 잡은 까닭 · onedal-46) */
            expect(r.read, `${at} — \\b · \\w · \\W · \\B 금지(한글 낱말 경계가 JS 와 코틀린에서 갈린다)`).not.toMatch(/\\[bBwW]/);
            expect(new RegExp(`${r.read}|`).exec('')!.length, `${at} — 1번 묶음`).toBeGreaterThanOrEqual(2);
        }
    });

    it('한 배차망 · 한 화면 · 한 칸에 읽는 법이 있는 줄은 하나 — 둘이면 서버와 원달앱이 다른 줄을 고를 수 있다', () => {
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) for (const [page, rows] of Object.entries(spec.pages)) {
            const readable = rows.filter(r => r.handling === 'READ' && r.read !== undefined).map(r => r.field);
            expect(readable.filter((f, i) => readable.indexOf(f) !== i), `${net} ${page}`).toEqual([]);
        }
    });

    it('공통 문제지 — JS 로 읽어도 원달앱과 같은 답(같은 표 · 노드를 한 칸 띄어 이음)', () => {
        const sheet = JSON.parse(readFileSync(join(__dirname, 'pageReadCases.json'), 'utf8')) as { cases: Array<{ network: string; page: string; field: string; texts: string[]; expect: string | null; fare?: number | null; why: string }> };
        for (const c of sheet.cases) {
            const rows = (NETWORK_PAGES as Record<string, { pages: Record<string, Array<{ field: string; handling: string; read?: string }>> }>)[c.network].pages[c.page] ?? [];
            const spec = rows.find(r => r.field === c.field && r.handling === 'READ' && r.read !== undefined);
            const got = spec ? (new RegExp(spec.read!).exec(c.texts.join(' '))?.[1]?.trim() || null) : null;
            expect(got, `${c.network} ${c.page} ${c.field} — ${c.why}`).toBe(c.expect);
            /* 💰 숫자로 바꾼 값 — 원달앱 PageFieldRead.fareOf 와 같은 규칙(쉼표 떼고 정수 · 0 이하 못 읽음) */
            if (c.fare !== undefined) {
                const n = got === null ? null : Number.parseInt(got.replace(/,/g, ''), 10);
                expect(n !== null && Number.isFinite(n) && n > 0 ? n : null, `${c.network} ${c.page} 요금 숫자 — ${c.why}`).toBe(c.fare);
            }
        }
    });
});

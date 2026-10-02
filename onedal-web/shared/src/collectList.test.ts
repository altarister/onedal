import { describe, it, expect } from 'vitest';
import { NETWORK_PAGES, type NetworkPageSpec } from './networkPages';
import { collectListOf, collectCountOf } from './collectList';
import type { TargetAppType } from './index';

/**
 * 📸 **모을 것 목록은 배차망 정의 표에서 빠짐없이 뽑힌다** (reviews/35 1-2단계).
 * 근거가 비었거나 toCollect 가 적힌 페이지 · 그 위에 뜨는 것은 다 들고, 아닌 것은 안 든다 · 차례는 표 차례 · 어디서 여나가 비지 않는다.
 */
const key = (network: string, page: string, overlay?: string) => `${network}|${page}|${overlay ?? ''}`;

/** 표를 직접 훑어 «모을 것»의 열쇠를 표 차례대로 — 함수와 따로 센다 */
function expectedKeys(pages: Record<TargetAppType, NetworkPageSpec>): string[] {
    const out: string[] = [];
    for (const [network, spec] of Object.entries(pages)) {
        for (const s of spec.screens) {
            if (s.evidence.length === 0 || s.toCollect) out.push(key(network, s.name));
            for (const o of s.overlays) if (o.evidence.length === 0 || o.toCollect) out.push(key(network, s.name, o.name));
        }
    }
    return out;
}

const clone = (): Record<TargetAppType, NetworkPageSpec> => JSON.parse(JSON.stringify(NETWORK_PAGES));

describe('📸 모을 것 목록', () => {
    const rows = collectListOf();

    it('표의 «모을 것»이 표 차례대로 빠짐없이 · 그 밖은 없다', () => {
        expect(rows.map(r => key(r.network, r.page, r.overlay))).toEqual(expectedKeys(NETWORK_PAGES));
    });

    it('무엇을 모으나 · 어디서 여나가 비지 않는다', () => {
        for (const r of rows) {
            expect(r.what.trim()).not.toBe('');
            expect(r.openAt.trim()).not.toBe('');
        }
    });

    it('위에 뜨는 것은 그 페이지에서 연다 · 페이지는 toCollect 괄호 글 또는 자리 모름', () => {
        for (const r of rows.filter(r => r.overlay)) expect(r.openAt).toBe(`«${r.page}»에서`);
        const t = clone();
        t.insung.screens = [{ ...t.insung.screens[0], evidence: [], toCollect: '캡처 · 알아보는 글자 (확정 뒤 상세 «카드 승인» 버튼 뒤)', overlays: [] },
            { ...t.insung.screens[0], name: '괄호 없음', evidence: [], toCollect: undefined, overlays: [] }];
        const page = collectListOf(t).filter(r => r.network === 'insung');
        expect(page.map(r => r.openAt)).toEqual(['확정 뒤 상세 «카드 승인» 버튼 뒤', '배차망 메뉴에서(자리 모름)']);
        expect(page[1].what).toBe('캡처');
    });

    it('근거가 생기고 모을 것이 지워지면 목록에서 빠진다 · 근거를 지우면 든다', () => {
        const t = clone();
        const s = t.insung.screens.find(x => x.evidence.length > 0 && !x.toCollect)!;
        s.evidence = [];
        expect(collectListOf(t).some(r => r.network === 'insung' && r.page === s.name && !r.overlay)).toBe(true);
        s.evidence = ['캡처'];
        s.toCollect = undefined;
        expect(collectListOf(t).some(r => r.network === 'insung' && r.page === s.name && !r.overlay)).toBe(false);
    });

    it('배차망마다 남은 수는 목록에서 센다 — 세 배차망 다 칸이 있다', () => {
        const counts = collectCountOf(rows);
        expect(Object.keys(counts).sort()).toEqual(Object.keys(NETWORK_PAGES).sort());
        for (const n of Object.keys(counts) as TargetAppType[]) expect(counts[n]).toBe(rows.filter(r => r.network === n).length);
    });
});

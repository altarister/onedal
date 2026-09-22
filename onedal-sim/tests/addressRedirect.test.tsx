// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from '../src/App';

/**
 * 🔀 **옛 주소는 새 이름으로 넘어가고, 쿼리는 하나도 안 빠진다** (2026-09-14 · 카카오픽커_시뮬레이터.md §3-5 · 0단계 0-4)
 *
 * 배차망 이름을 서버·원달앱과 같은 `insung` 으로 맞추면 폰 북마크와 기록 문서
 *가 옛 주소로 남는다. 조용히 죽으면
 * «왜 안 뜨지»로 반나절이 간다 — 그래서 넘기고, 넘길 때 문제지·간격을 잃지 않는지 본다.
 * 🔴 `/inseong/dispatch` 는 **한 번에** 새 주소로 간다 (옛 이름을 거쳐 두 번 넘지 않는다).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** 거쳐 간 주소를 차례로 적는다 */
function LocationProbe({ seen }: { seen: string[] }) {
    const { pathname, search } = useLocation();
    useEffect(() => {
        const here = pathname + search;
        if (seen[seen.length - 1] !== here) seen.push(here);
    }, [pathname, search, seen]);
    return null;
}

const visit = (url: string) => {
    const seen: string[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
        root!.render(<MemoryRouter initialEntries={[url]}><AppRoutes /><LocationProbe seen={seen} /></MemoryRouter>);
    });
    return seen;
};

/** 주소 → 비교할 모양 (쿼리 순서는 안 본다) */
const shape = (url: string) => {
    const [pathname, query = ''] = url.split('?');
    return { pathname, query: Object.fromEntries([...new URLSearchParams(query)].sort()) };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
    vi.useRealTimers();
});

describe('옛 주소 넘김', () => {
    it('?net=inseong → ?net=insung · 나머지 쿼리 그대로', () => {
        const seen = visit('/dispatch?net=inseong&preset=seven&interval=20000');
        expect(shape(seen[seen.length - 1])).toEqual(shape('/dispatch?net=insung&preset=seven&interval=20000'));
    });

    it('/inseong/dispatch → 한 번에 /dispatch?net=insung (옛 이름을 거치지 않는다)', () => {
        const seen = visit('/inseong/dispatch?preset=seven');
        expect(seen.map(shape)).toEqual(['/inseong/dispatch?preset=seven', '/dispatch?net=insung&preset=seven'].map(shape));
    });

    it('/hwamul24/dispatch → /dispatch?net=hwamul24 (그대로)', () => {
        const seen = visit('/hwamul24/dispatch?preset=seven&fillers=3');
        expect(shape(seen[seen.length - 1])).toEqual(shape('/dispatch?net=hwamul24&preset=seven&fillers=3'));
    });

    it('새 이름은 넘기지 않는다', () => {
        const seen = visit('/dispatch?net=insung&preset=seven');
        expect(seen).toEqual(['/dispatch?net=insung&preset=seven']);
    });
});

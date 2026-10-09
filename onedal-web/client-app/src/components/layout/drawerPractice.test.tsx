// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * 🐥 **끝난 연습 콜은 서랍 «취소» 탭에서 «🐥 연습 끝»으로 보인다** (38 F10 · 기사님 «가»).
 *
 * 연습 콜은 KEEP 이든 거절이든 `SAFE_CANCEL` 로 닫혀 덱(`deckOfCycle` — 진행 중 + 오늘 하차)에는 안 들어간다 —
 * 끝난 연습 콜을 그리는 곳은 서랍 하나다. 그 줄이 «안전취소»로만 나오면 기사님은 취소 횟수에 드는
 * 진짜 안전취소와 연습을 가를 수 없다. 결재석의 노란 «🐥 연습»과 같은 함수(`practiceBadgeOf`) · 같은 말 · 같은 색.
 *
 * 🔴 소스를 안 읽는다 — 서랍을 실제로 그리고 «취소» 탭을 눌러 줄 글을 본다.
 */
vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});

const BASE = { type: 'AUTO', fare: 30000, capturedAt: '2026-10-09T05:00:00.000Z', timestamp: '2026-10-09T05:00:00.000Z', terminatedAt: '2026-10-09T05:01:00.000Z' };
const PRACTICE = { ...BASE, id: 'p1', status: 'SAFE_CANCEL', isSimulated: true, pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 대월면' };
const REAL = { ...BASE, id: 'r1', status: 'SAFE_CANCEL', pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 갈산동' };

describe('서랍 «취소» 탭 — 연습 콜과 진짜 안전취소를 가른다', () => {
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    beforeEach(() => {
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

    it('🔴 연습 콜 줄은 «🐥 연습 끝» · 진짜 콜 줄은 «안전취소»', async () => {
        const { ThemeProvider } = await import('@onedal/ui/theme');
        const { default: Drawer } = await import('./Drawer');
        act(() => root.render(
            <ThemeProvider><Drawer open onClose={() => {}} activeRoute={[PRACTICE, REAL] as never} /></ThemeProvider>,
        ));
        const tab = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('취소'));
        expect(tab).toBeTruthy();
        act(() => { tab!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

        const rowOf = (place: string) => [...host.querySelectorAll('div')].filter(d => d.className.includes('border-b') && d.textContent?.includes(place)).at(-1)?.textContent ?? '';
        const practice = rowOf('대월면'), real = rowOf('갈산동');
        expect(practice).toContain('🐥 연습 끝');
        expect(practice).not.toContain('안전취소');
        expect(real).toContain('안전취소');
        expect(real).not.toContain('연습');
    });
});

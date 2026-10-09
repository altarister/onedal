// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { DispatchPage } from '../src/pages/DispatchPage';

/**
 * 🔀 **배차망을 바꿔도 앞 배차망의 화면이 남는다 — 실물처럼 «다른 앱을 봤다 돌아옴»** (38 F36 · 71 «가»)
 *
 * 실물은 배차망마다 다른 앱이라, 인성에서 콜을 잡고 상세를 열어 둔 채 픽커를 봐도 인성으로 돌아오면 그 상세가 그대로다.
 * 원달앱은 «인성 계약 결재를 기다리는 중 다른 배차망을 봄 → 인성으로 돌아가 ‹취소›를 누름»을 해야 한다.
 * 시뮬은 껍데기 앱이 받은 신호(`--es net`)를 `window.__onedalSimSwitch(net)` 로 넘긴다 — 화면에 탭을 얹지 않는다(README).
 *
 * 🔴 숨은 배차망이 뒤에서 상세를 닫아도(인성 상세 10초 귀환) **보이는 배차망의 방문 기록을 건드리지 않는다** — 원달앱 «뒤로»가 엉뚱한 곳으로 간다.
 * 못 잡는 것: 숨은 칸이 폰 접근성 트리에서 정말 빠지는가(jsdom 은 접근성 트리가 없다 — A24 의 원달앱 «두 배차망 글자» 로그로 본다) · 껍데기 앱이 신호를 넘기는가.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let navigateRef: NavigateFunction | null = null;
let here = '';

function Probe() {
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => { navigateRef = navigate; }, [navigate]);
    here = location.pathname + location.search;
    return null;
}

const mount = (url: string) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
        root!.render(<MemoryRouter initialEntries={['/', url]} initialIndex={1}><DispatchPage /><Probe /></MemoryRouter>);
    });
};
const param = (k: string) => new URLSearchParams(here.split('?')[1]).get(k);
const buttonByText = (text: string) => [...host!.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === text);
/** 보이는 글자만 — 숨은 배차망 칸(hidden)의 글자는 뺀다 (폰 접근성 트리도 감춘 화면을 안 올린다) */
const shown = () => {
    const clone = host!.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[hidden]').forEach(n => n.remove());
    return clone.textContent ?? '';
};
const switchTo = (net: string) => act(() => { (window as unknown as { __onedalSimSwitch?: (n: string) => void }).__onedalSimSwitch!(net); });
const openInsungDetail = () => {
    mount('/dispatch?net=insung&calls=individual&lon=127.29444&lat=37.37669');
    act(() => { buttonByText('실행')!.click(); });
    act(() => { vi.advanceTimersByTime(3000); });
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in test'))));
});
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null; navigateRef = null; here = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('배차망 바꾸기 — 앞 배차망 화면이 남는다', () => {
    it('🔴 인성 목록 → 픽커 → 인성으로 돌아오면 인성 목록 그대로 · 처음 본 픽커는 홈', () => {
        openInsungDetail();
        expect(shown()).toContain('빠른설정');
        switchTo('kakaopicker');
        expect(param('net')).toBe('kakaopicker');
        expect(shown()).toContain('시작하기');
        expect(shown()).not.toContain('빠른설정');
        switchTo('insung');
        expect(param('net')).toBe('insung');
        expect(param('view')).toBe('list');
        expect(shown()).toContain('빠른설정');
        expect(shown()).not.toContain('시작하기');
    });

    it('🔴 인성 상세를 연 채 픽커를 봤다 돌아오면 같은 상세 · «뒤로» 한 번 = 인성 목록 · 한 번 더 = 인성 홈', () => {
        mount('/dispatch?net=insung&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('실행')!.click(); });
        act(() => { vi.advanceTimersByTime(3000); });
        const cell = [...host!.querySelectorAll<HTMLElement>('div,span')].find(s => s.children.length === 0 && /^\d+\.\d$/.test((s.textContent ?? '').trim()));
        act(() => { cell!.click(); });
        const detail = param('detail');
        expect(detail).toBeTruthy();
        expect(shown()).toContain('적요상세');
        switchTo('kakaopicker');
        expect(shown()).not.toContain('적요상세');
        switchTo('insung');
        expect(param('detail')).toBe(detail);
        expect(shown()).toContain('적요상세');
        act(() => { navigateRef!(-1); });
        expect(param('net')).toBe('insung');
        expect(param('detail')).toBeNull();
        expect(shown()).toContain('빠른설정');
        act(() => { navigateRef!(-1); });
        expect(param('view')).toBeNull();
        expect(shown()).toContain('인성퀵화면분할');
    });

    it('🔴 숨은 인성이 뒤에서 상세를 닫아도 보이는 픽커의 방문 기록은 그대로', () => {
        mount('/dispatch?net=insung&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('실행')!.click(); });
        act(() => { vi.advanceTimersByTime(3000); });
        const cell = [...host!.querySelectorAll<HTMLElement>('div,span')].find(s => s.children.length === 0 && /^\d+\.\d$/.test((s.textContent ?? '').trim()));
        act(() => { cell!.click(); });
        switchTo('kakaopicker');
        act(() => { buttonByText('시작하기')!.click(); });
        const pickerHere = here;
        for (let i = 0; i < 12; i++) act(() => { vi.advanceTimersByTime(1000); });   // 인성 상세 10초 카운트다운이 뒤에서 끝나 스스로 닫힐 시간(1초씩 — 초마다 다시 그린다)
        expect(here).toBe(pickerHere);
        expect(shown()).toContain('리스트 설정');
        switchTo('insung');
        expect(param('detail')).toBeNull();
        expect(shown()).toContain('빠른설정');
    });

    it('모르는 배차망 이름이면 바꾸지 않는다', () => {
        openInsungDetail();
        const before = here;
        switchTo('없는망');
        expect(here).toBe(before);
        expect(shown()).toContain('빠른설정');
    });
});

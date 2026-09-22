// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { DispatchPage } from '../src/pages/DispatchPage';

/**
 * 🔙 **픽커 상세는 방문 기록에 한 칸 남는다 — 뒤로 가기가 상세만 닫는다** (카카오픽커_시뮬레이터.md §7-3 · 2단계 2-2)
 *
 * 원달앱은 알람으로 상세에 들어간 뒤 30초 무응답이면 «뒤로 가기»를 누른다(`HijackService` · GLOBAL_ACTION_BACK).
 * 시뮬레이터 앱은 그 뒤로 가기를 웹뷰 방문 기록으로 넘긴다(`webView.goBack()`). 상세가 React 상태뿐이면
 * 방문 기록에 없어서 **설정 화면까지 나가 버린다.**
 * 인성·화물24시는 예전 동작 그대로 둔다 (방문 기록에 안 남긴다) — 그쪽 흐름은 이번에 흔들지 않는다.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let navigateRef: NavigateFunction | null = null;
let here = '';

/** 지금 주소와 이동 함수를 밖으로 꺼낸다 */
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
    return host;
};
const buttonByText = (text: string) => [...host!.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === text);
/** 요금 글자(쉼표 든 숫자) 하나를 누른다 — 원달앱도 요금 글자를 찍는다 */
const pressFirstFare = () => {
    const fare = [...host!.querySelectorAll('div')].find(s => s.children.length === 0 && /^\d{1,3}(,\d{3})+$/.test((s.textContent ?? '').trim()));
    if (!fare) throw new Error('요금 글자가 없다');
    act(() => { fare.click(); });
};

beforeEach(() => {
    vi.useFakeTimers();
    // 판 점검·위치 조회가 서버를 부를 수 있다 — 검사에서는 늘 실패로 답한다
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in test'))));
});
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null; navigateRef = null; here = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('픽커', () => {
    it('홈 → 시작하기 → 요금을 누르면 상세 · 주소에 detail 이 붙는다', () => {
        /* 📍 위치를 주소에 넣고 연다 — 위치를 모르면 시뮬이 첫 콜을 5초 기다린다 (firstCallWaitsLocation · 2026-09-14) */
        mount('/dispatch?net=kakaopicker&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('시작하기')!.click(); });
        expect(host!.textContent).toContain('리스트 설정');
        pressFirstFare();
        expect(host!.textContent).toContain('수락하기');
        expect(new URLSearchParams(here.split('?')[1]).get('detail')).toBeTruthy();
    });

    it('🔴 뒤로 가기 한 번이면 상세만 닫히고 리스트로 — 설정 화면으로 안 나간다', () => {
        /* 📍 위치를 주소에 넣고 연다 — 위치를 모르면 시뮬이 첫 콜을 5초 기다린다 (firstCallWaitsLocation · 2026-09-14) */
        mount('/dispatch?net=kakaopicker&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('시작하기')!.click(); });
        pressFirstFare();
        act(() => { navigateRef!(-1); });
        expect(here.startsWith('/dispatch')).toBe(true);
        expect(new URLSearchParams(here.split('?')[1]).get('detail')).toBeNull();
        expect(host!.textContent).toContain('리스트 설정');
        expect(host!.textContent).not.toContain('수락하기');
    });

    it('🔴 «수락하기» 를 누르면 곧바로 «내 오더» 탭 — 방금 수락한 콜 카드가 있고, 누르면 픽업 이동', () => {
        /* 📍 위치를 주소에 넣고 연다 — 위치를 모르면 시뮬이 첫 콜을 5초 기다린다 */
        mount('/dispatch?net=kakaopicker&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('시작하기')!.click(); });
        pressFirstFare();
        act(() => { buttonByText('수락하기')!.click(); });
        expect(new URLSearchParams(here.split('?')[1]).get('detail')).toBeNull();   // 상세 칸도 되돌렸다
        expect(host!.textContent).not.toContain('수락하기');
        expect(host!.textContent).not.toContain('오더 정보');                         // 오더 전체(실물 23)가 끼지 않는다
        expect(host!.textContent).not.toContain('리스트 설정');                       // 신규 리스트가 아니라 내 오더 탭
        const card = host!.querySelector<HTMLElement>('[data-my-order]');
        expect(card, '내 오더에 방금 수락한 콜 카드가 없다').toBeTruthy();
        act(() => { card!.click(); });
        // «퀵 배송» 탭의 콜이라 퀵 — 흰 «픽업 출발» 페이지 (실물 17-1)
        expect(host!.textContent).toContain('지금 바로 출발해 주세요');
    });

    it('상세의 «넘기기» 도 방문 기록을 한 칸 되돌린다 — 뒤로 가기를 한 번 더 누르면 그때 설정 화면', () => {
        /* 📍 위치를 주소에 넣고 연다 — 위치를 모르면 시뮬이 첫 콜을 5초 기다린다 (firstCallWaitsLocation · 2026-09-14) */
        mount('/dispatch?net=kakaopicker&lon=127.29444&lat=37.37669');
        act(() => { buttonByText('시작하기')!.click(); });
        pressFirstFare();
        act(() => { buttonByText('넘기기')!.click(); });
        expect(new URLSearchParams(here.split('?')[1]).get('detail')).toBeNull();
        expect(host!.textContent).toContain('리스트 설정');
        act(() => { navigateRef!(-1); });
        expect(here).toBe('/');
    });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { InsungSimScreen } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { callA, callB } from './fixtures';

/**
 * 🔒 **인성 목록 위에 뜨는 알림이 실물대로 뜨나** (인성설명서 영상 1328 · 1611 · 0544)
 * 오더 선택 잠금을 켠 채 콜을 누르면 상세가 안 열리고 «알림 / 오더 선택 잠금 상태 입니다» · 잡은 콜이 없을 때 «완료» 를 누르면 완료 탭으로 안 넘어가고
 * «오더 상세 / 자료가 존재하지 않습니다» · 메뉴 층은 «엘비스 Ver. 1.4.5» 머리와 일곱 항목. 원달앱이 이 글자를 덧칸으로 알아보는지는 원달앱 `ScreenTableDetectTest` 가 문다.
 * 못 잡는 것: 실물 접근성 글자(영상 글자는 눈으로 읽은 글자) · 알림이 목록 글과 한 글로 오는지.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const mount = (el: ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(el); });
    return host;
};
const click = (el: Element | undefined) => { expect(el).toBeTruthy(); act(() => { (el as HTMLElement).click(); }); };
const byText = (text: string, tag = '*') => [...host!.querySelectorAll(tag)].find(e => e.children.length === 0 && (e.textContent ?? '') === text);
const shown = () => host!.textContent ?? '';

const noop = () => {};
const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
    streamingCalls: [callA, callB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
    selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
    acceptCall: noop, cancelCall: noop, finishCall: noop,
    isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
    ...over,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
    vi.useRealTimers();
});

const rowOf = (id: string) => host!.querySelector(`#call-row-${id}`) ?? undefined;

describe('🔒 인성 목록 위 알림', () => {
    it('잠금을 켠 채 콜을 누르면 상세가 안 열리고 잠금 알림이 뜬다 — «확인» 으로 닫는다 · 단추는 «잠금» → «해제»', () => {
        const openCall = vi.fn();
        mount(<InsungSimScreen {...props({ openCall })} />);
        click(byText('잠금', 'button'));
        expect(byText('해제', 'button')).toBeTruthy();
        click(rowOf(callA.id));
        expect(openCall).not.toHaveBeenCalled();
        expect(shown()).toContain('알림');
        expect(shown()).toContain('오더 선택 잠금 상태 입니다');
        click(byText('확인', 'button'));
        expect(shown()).not.toContain('오더 선택 잠금 상태 입니다');
    });

    it('잠금을 끄면(«해제» 를 다시 누름) 콜이 열린다', () => {
        const openCall = vi.fn();
        mount(<InsungSimScreen {...props({ openCall })} />);
        click(byText('잠금', 'button'));
        click(byText('해제', 'button'));
        expect(byText('잠금', 'button')).toBeTruthy();
        click(rowOf(callA.id));
        expect(openCall).toHaveBeenCalledWith(callA);
    });

    it('잡은 콜이 없을 때 «완료» 를 누르면 탭이 안 바뀌고 자료 없음 알림이 뜬다', () => {
        const setActiveTab = vi.fn();
        mount(<InsungSimScreen {...props({ setActiveTab })} />);
        click(byText('완료(0)'));
        expect(setActiveTab).not.toHaveBeenCalled();
        expect(shown()).toContain('오더 상세');
        expect(shown()).toContain('자료가 존재하지 않습니다');
        click(byText('확인', 'button'));
        expect(shown()).not.toContain('자료가 존재하지 않습니다');
    });

    it('잡은 콜이 있으면 «완료» 로 완료 탭에 간다 — 알림 없음', () => {
        const setActiveTab = vi.fn();
        mount(<InsungSimScreen {...props({ setActiveTab, confirmedCalls: [callA] })} />);
        click(byText('완료(1)'));
        expect(setActiveTab).toHaveBeenCalledWith('CONFIRMED');
        expect(shown()).not.toContain('자료가 존재하지 않습니다');
    });

    it('메뉴 층은 «엘비스 Ver. 1.4.5» 머리와 영상 순서의 일곱 항목이다(고객검색 · 업데이트안내는 영상 메뉴에 없다)', () => {
        mount(<InsungSimScreen {...props()} />);
        click(byText('메뉴'));
        const text = shown();
        expect(text).toContain('엘비스 Ver. 1.4.5');
        const order = ['당일정산', '업무종료', '환경설정', '업데이트공지', '기사정보', '프로그램종료', '메뉴닫기'].map(w => text.indexOf(w));
        expect(order.every(n => n >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(text).not.toContain('고객검색');
        expect(text).not.toContain('업데이트안내');
    });

    it('시뮬 전용 «정지/재개» 단추는 접근성 글에서 빠지고(aria-hidden) 누르면 타이머가 토글된다', () => {
        const toggleTimer = vi.fn();
        mount(<InsungSimScreen {...props({ toggleTimer })} />);
        const stop = byText('정지', 'button');
        expect(stop?.getAttribute('aria-hidden')).toBe('true');
        click(stop);
        expect(toggleTimer).toHaveBeenCalledTimes(1);
    });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { IsflexSimScreen, isflexAcceptBlocked, isflexShownCalls } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { isflexA, isflexB, isflexC, isflexD } from './fixtures';

/**
 * 🛵 **인성플렉스 배차 화면이 상태마다 맞는 화면을 그리나** (기획서 61 부록 A 1-2 · 3-1)
 * 수락 차례 · 착불 + 적립금 0 팝업 · 목록 정렬 · 칩 · 거리 · 시트 · 진행중 · 내 오더 콜 단계.
 * 못 잡는 것: 폰 웹뷰가 칸마다 노드를 따로 주는가(폰 uiautomator 덤프로만 보인다).
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
const leafTexts = () => [...host!.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent).map(e => e.textContent!);

const noop = () => {};
const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
    streamingCalls: [isflexC, isflexA, isflexB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
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

describe('🛵 인성플렉스 배차 화면', () => {
    it('목록 줄은 «출발지까지» 가까운 순 [실물 07]', () => {
        mount(<IsflexSimScreen {...props()} />);
        const pickups = leafTexts().filter(t => t.startsWith('@'));
        expect(pickups).toEqual(['@낼08:20/수원이의동', '@역삼동', '@동패동']);
    });

    it('칩 «승용/소형»을 누르면 그 차종 콜만', () => {
        mount(<IsflexSimScreen {...props({ streamingCalls: [isflexA, isflexD] })} />);
        expect(leafTexts().filter(t => /^\d+,\d{3}$/.test(t))).toEqual(['12,000', '8,500']);
        click(byText('승용/소형', 'div'));
        expect(leafTexts().filter(t => /^\d+,\d{3}$/.test(t))).toEqual(['12,000']);
    });

    it('거리 설정 «5km 이내» — 5km 넘는 줄 없음', () => {
        expect(isflexShownCalls([isflexA, isflexB, isflexC, isflexD], '전체', 5).map(c => c.id)).toEqual(['isflex_d']);
        expect(isflexShownCalls([isflexA, isflexB, isflexC, isflexD], '오토바이', null).map(c => c.id)).toEqual(['isflex_b', 'isflex_a', 'isflex_c']);
    });

    it('🔴 수행하기 — 잡은 콜로 옮기고 → 진행중 탭 → 상세 닫기 (픽커와 같은 차례)', () => {
        const order: string[] = [];
        mount(<IsflexSimScreen {...props({
            selectedCall: isflexB, selectedCallId: isflexB.id,
            acceptCall: () => order.push('accept'), closeDetail: () => order.push('close'), setActiveTab: t => order.push(`tab:${t}`),
        })} />);
        click(byText('21,252원 \n수행하기', 'button'));
        expect(order).toEqual(['accept', 'tab:CONFIRMED', 'close']);
    });

    it('🔴 착불 + 적립금 0 — 수락 안 됨 · «적립금이 부족합니다» 팝업 · 뒤 상세는 가려짐 · «확인»이면 상세 그대로', () => {
        expect(isflexAcceptBlocked(isflexA)).toBe('POINT_SHORT');
        expect(isflexAcceptBlocked(isflexA, 5000)).toBeNull();
        expect(isflexAcceptBlocked(isflexB)).toBeNull();
        const order: string[] = [];
        mount(<IsflexSimScreen {...props({ selectedCall: isflexA, selectedCallId: isflexA.id, acceptCall: () => order.push('accept') })} />);
        click(byText('8,500원 \n수행하기', 'button'));
        expect(order).toEqual([]);
        expect(byText('적립금이 부족합니다')).toBeTruthy();
        expect(byText('총 수입')!.closest('[aria-hidden="true"]')).toBeTruthy();
        click(byText('확인', 'button'));
        expect(byText('적립금이 부족합니다')).toBeUndefined();
        expect(byText('총 수입')!.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('시트가 뜨면 뒤 목록은 가려진다 · 저장하면 닫힌다', () => {
        mount(<IsflexSimScreen {...props()} />);
        const icons = [...host!.querySelectorAll('button')].filter(b => !b.textContent);
        // 머리 편지 · 사람 · 깔때기 · 넓히기 차례
        click(icons[2]);
        expect(byText('오더 목록 거리 설정')).toBeTruthy();
        expect(byText('@역삼동')!.closest('[aria-hidden="true"]')).toBeTruthy();
        click(byText('저장', 'button'));
        expect(byText('오더 목록 거리 설정')).toBeUndefined();
        expect(byText('@역삼동')!.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('진행중 탭 — 빈 상태 · 한 건 (칸 머리 · «완료» 없음)', () => {
        mount(<IsflexSimScreen {...props({ activeTab: 'CONFIRMED' })} />);
        expect(byText('진행중인 오더가 없습니다')).toBeTruthy();
        act(() => { root!.render(<IsflexSimScreen {...props({ activeTab: 'CONFIRMED', confirmedCalls: [isflexB] })} />); });
        const text = host!.textContent ?? '';
        expect(text).toContain('@낼08:20/수원이의동');
        expect(text).not.toContain('출발지까지');
        expect(text).not.toContain('완료');
    });

    it('내 오더 콜 — 픽업완료 → 배송완료 → 서명받기 → 완료(finishCall)', () => {
        const finished: string[] = [];
        mount(<IsflexSimScreen {...props({ confirmedCalls: [isflexB], selectedCall: isflexB, selectedCallId: isflexB.id, finishCall: c => finished.push(c.id) })} />);
        click(byText('픽업완료', 'button'));
        click(byText('배송완료', 'button'));
        click(byText('서명받기', 'button'));
        expect(byText('서명')).toBeTruthy();
        click(byText('완료', 'button'));
        expect(finished).toEqual(['isflex_b']);
    });

    it('지도 보기 — 탭 · 칩 · 칸 머리가 없다 [실물 03]', () => {
        mount(<IsflexSimScreen {...props()} />);
        click(byText('지도', 'div'));
        const text = host!.textContent ?? '';
        expect(text).not.toContain('신규');
        expect(text).not.toContain('수입');
        expect(host!.querySelector('[aria-label="Google 지도"]')).toBeTruthy();
    });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PickerSimScreen, pickerTakenAfterMs, PICKER_TOAST_MS } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { pickerA, pickerB } from './fixtures';

/**
 * 🚫 **남이 가져간 콜 — «이미 배정이 완료된 오더입니다» 토스트** (2026-09-14 · 카카오픽커_시뮬레이터.md §8-1 · 3단계 3-3)
 *
 * 실물(캡처 03): 리스트에서 누른 콜을 다른 기사가 이미 가져갔으면 상세가 안 열리고 리스트 아래에 토스트가 뜬다.
 * 🔴 09-02 실주행에서 원달앱이 이 토스트 글자를 **카드의 출발지로 읽어** 가짜 콜 3건을 서버에 올렸다
 *    (`log/1dal-주행로그-20260902/표/버려진콜_intel.json`). 시뮬레이터가 실물 글자 그대로 띄워야 원달앱을 시험할 수 있다.
 *
 * 규칙(시뮬레이터 값): 콜마다 **남이 가져가는 시각이 다르다** — 그 시각이 지난 카드를 누르면 토스트 · 카드가 빠진다 · 상세는 안 열린다.
 * 🔴 **원달앱의 시간(알람 상세 대기 · 안전취소)과 무관하다** — 진짜 픽커는 원달앱이 몇 초 뒤 돌아오는지 모른다
 *    (기사님 2026-09-14: *"시뮬레이터는 진짜 픽커 처럼 작동해야 하는거고"* · `docs/지금/배차망별_대기_시간.md`).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REAL_TOAST = '이미 배정이 완료된\n오더입니다.';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const mount = (el: ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(el); });
    return host;
};
const rerender = (el: ReactElement) => act(() => { root!.render(el); });
const buttonByText = (text: string) => [...host!.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === text);
const fareDiv = (fare: string) => [...host!.querySelectorAll('div')].find(d => d.children.length === 0 && (d.textContent ?? '').trim() === fare);

const noop = () => {};
const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
    streamingCalls: [pickerA, pickerB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
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

describe('픽커 — 가져간 콜 토스트', () => {
    it('🔴 가져가는 시각은 콜마다 다르다 — 원달앱의 30초에 맞춘 한 값이 아니다', () => {
        const ids = Array.from({ length: 12 }, (_, i) => `picker-${i}`);
        const times = ids.map(pickerTakenAfterMs);
        expect(new Set(times).size).toBeGreaterThan(1);
        for (const t of times) {
            expect(t).toBeGreaterThanOrEqual(20_000);
            expect(t).toBeLessThanOrEqual(180_000);
        }
        // 같은 콜은 늘 같은 시각 — 검사가 흔들리지 않는다
        expect(pickerTakenAfterMs('picker-3')).toBe(pickerTakenAfterMs('picker-3'));
        expect(PICKER_TOAST_MS).toBeGreaterThanOrEqual(2_000);
        expect(PICKER_TOAST_MS).toBeLessThanOrEqual(4_000);
    });

    it('새 카드는 평소대로 — 누르면 상세를 연다', () => {
        const openCall = vi.fn();
        mount(<PickerSimScreen {...props({ openCall })} />);
        act(() => { buttonByText('시작하기')!.click(); });
        act(() => { fareDiv('16,870')!.click(); });
        expect(openCall).toHaveBeenCalledWith(pickerA);
        expect(host!.textContent).not.toContain('이미 배정이 완료된');
    });

    it('🔴 가져간 시각이 지난 카드를 누르면 — 상세를 안 열고 실물 글자 토스트 · 카드가 빠진다', () => {
        const openCall = vi.fn();
        mount(<PickerSimScreen {...props({ openCall })} />);
        act(() => { buttonByText('시작하기')!.click(); });
        act(() => { vi.advanceTimersByTime(pickerTakenAfterMs(pickerA.id) + 1_000); });
        act(() => { fareDiv('16,870')!.click(); });
        expect(openCall).not.toHaveBeenCalled();
        // 실물처럼 줄바꿈이 든 한 덩어리 글자 — 원달앱이 09-02 에 읽은 그 모양
        const toast = [...host!.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent === REAL_TOAST);
        expect(toast, '실물 글자 그대로의 토스트가 요소 하나로 없다').toBeTruthy();
        expect(fareDiv('16,870')).toBeUndefined();
        expect(fareDiv('14,168')).toBeTruthy();
    });

    it('토스트는 잠깐 뒤 사라진다 — 가져간 카드는 돌아오지 않는다', () => {
        mount(<PickerSimScreen {...props()} />);
        act(() => { buttonByText('시작하기')!.click(); });
        act(() => { vi.advanceTimersByTime(pickerTakenAfterMs(pickerA.id) + 1_000); });
        act(() => { fareDiv('16,870')!.click(); });
        act(() => { vi.advanceTimersByTime(PICKER_TOAST_MS + 100); });
        expect(host!.textContent).not.toContain('이미 배정이 완료된');
        rerender(<PickerSimScreen {...props()} />);
        expect(fareDiv('16,870')).toBeUndefined();
    });

    it('나중에 들어온 카드는 그때부터 잰다', () => {
        const openCall = vi.fn();
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerA], openCall })} />);
        act(() => { buttonByText('시작하기')!.click(); });
        act(() => { vi.advanceTimersByTime(pickerTakenAfterMs(pickerA.id) + 1_000); });
        rerender(<PickerSimScreen {...props({ streamingCalls: [pickerB, pickerA], openCall })} />);
        act(() => { fareDiv('14,168')!.click(); });
        expect(openCall).toHaveBeenCalledWith(pickerB);
    });
});

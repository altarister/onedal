import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import {
    Hwamul24CallDetailScreen,
    Hwamul24DispatchBoard,
    Hwamul24PreConfirmScreen,
    Hwamul24SimScreen,
    InsungCallDetailScreen,
    InsungDispatchBoard,
    InsungOngoingDetailScreen,
    InsungSimScreen,
    SIM_NETS,
    SIM_NET_LIST,
    renamedNetKey,
    simNetOf,
    toHwamul24Call,
    toInsungCall,
    toPickerCall,
    PICKER_PRESET_BOOK,
} from '@altari/ui-simulators';
import { SHARED_PRESET_BOOK } from '@altari/core-simulator';
import type { NetScreenProps } from '@altari/ui-simulators';
import { callA, callB } from './fixtures';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🧩 **배차망 화면이 리스트·상세·수락 뒤마다 맞는 부품을 그리나**
 *
 * 배차망 화면(InsungSimScreen · Hwamul24SimScreen)은 콜 상태를 보고 리스트·상세·수락 뒤 부품 가운데 하나를 고른다.
 * 그 부품을 **직접** 그린 것과, 배차망 화면이 그린 것이 **글자 하나까지 같은지** 대조한다 —
 * 다르면 배차망 화면이 다른 부품을 골랐거나 부품에 값을 빠뜨린 것이다.
 * (배차 화면 전체의 그림은 `dispatchPage.test.tsx` 의 스냅숏이 따로 문다)
 */
const noop = () => {};
/** 같은 난수로 그린다 — 화물24시 화면은 잔액·ID 에 Math.random 을 쓴다 */
const markup = (el: ReactElement) => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(33));
    try { return renderToStaticMarkup(el); } finally { spy.mockRestore(); }
};
const base: NetScreenProps = {
    streamingCalls: [callA, callB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
    selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
    acceptCall: noop, cancelCall: noop, finishCall: noop,
    isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
};

describe('배차망 화면 = 예전 DispatchPage 갈래가 고르던 부품', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('인성 리스트', () => {
        expect(markup(<InsungSimScreen {...base} />)).toBe(markup(
            <div className="relative w-full h-full">
                <InsungDispatchBoard streamingCalls={[callA, callB]} confirmedCalls={[]} activeTab="ALL" onTabSelect={noop} onCallClick={noop}
                    onStartClick={noop} onSettingsClick={noop} onMenuClick={noop} isTimerPaused={false} onToggleTimer={noop}
                    isFetchingOrder={false} selectedCallId={null} maxPickupKm={15} />
            </div>,
        ));
    });

    it('인성 상세 — 안 잡은 콜은 수락 전 상세', () => {
        expect(markup(<InsungSimScreen {...base} selectedCall={callA} />))
            .toBe(markup(<InsungCallDetailScreen call={callA} feedback={null} isConfirmed={false} onClose={noop} onAccept={noop} />));
    });

    it('인성 상세 — 잡은 콜은 진행 중 상세', () => {
        expect(markup(<InsungSimScreen {...base} confirmedCalls={[callA]} selectedCall={callA} />))
            .toBe(markup(<InsungOngoingDetailScreen call={callA} onClose={noop} onCancel={noop} />));
    });

    it('화물24시 리스트', () => {
        expect(markup(<Hwamul24SimScreen {...base} />)).toBe(markup(
            <div className="relative w-full h-full">
                <Hwamul24DispatchBoard streamingCalls={[callA, callB]} confirmedCalls={[]} activeTab="ALL" onTabSelect={noop} onCallClick={noop}
                    onSettingsClick={noop} isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} />
            </div>,
        ));
    });

    it('화물24시 상세 — 안 잡은 콜은 화물상세정보(실물 18)', () => {
        expect(markup(<Hwamul24SimScreen {...base} selectedCall={callB} />))
            .toBe(markup(<Hwamul24PreConfirmScreen call={callB} onClose={noop} onAccept={noop} />));
    });

    it('화물24시 상세 — 잡은 콜은 배차내역 상세', () => {
        expect(markup(<Hwamul24SimScreen {...base} confirmedCalls={[callB]} selectedCall={callB} />))
            .toBe(markup(<Hwamul24CallDetailScreen call={callB} onClose={noop} onAccept={noop} />));
    });

    it('🔴 화물24시 수락 뒤 — 잡은 콜에 넣고 → 상세를 닫고 → «배차내역» 탭 (배차신청 · 배차내역 상세 «하차완료» 둘 다)', () => {
        for (const confirmedCalls of [[], [callA]]) {
            const order: string[] = [];
            const el = Hwamul24SimScreen({
                ...base, confirmedCalls, selectedCall: callA,
                acceptCall: () => order.push('accept'),
                closeDetail: () => order.push('close'),
                setActiveTab: (t) => order.push(`tab:${t}`),
            }) as ReactElement<{ onAccept: (c: typeof callA) => void }>;
            el.props.onAccept(callA);
            expect(order).toEqual(['accept', 'close', 'tab:CONFIRMED']);
        }
    });
});

describe('배차망 목록 — 한 곳에서만', () => {
    it('입히기 함수는 각 배차망 폴더의 것', () => {
        expect(SIM_NETS.insung.toCall).toBe(toInsungCall);
        expect(SIM_NETS.hwamul24.toCall).toBe(toHwamul24Call);
        expect(SIM_NETS.kakaopicker.toCall).toBe(toPickerCall);
    });

    it('설정 화면 색 — 예전에 설정 화면이 직접 고르던 클래스 그대로 (0-3 에서 옮겼다)', () => {
        expect(SIM_NETS.insung.setupColors).toEqual({ toggle: 'bg-blue-600 text-white', start: 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/40' });
        expect(SIM_NETS.hwamul24.setupColors).toEqual({ toggle: 'bg-[#c62828] text-white', start: 'bg-gradient-to-r from-[#c62828] to-[#8e1b1b] shadow-red-900/40' });
    });

    it('설정 화면 순서와 이름 — 인성콜 · 화물24시 (예전 목록 그대로) · 픽커 (2단계 2-2 에서 붙였다)', () => {
        expect(SIM_NET_LIST.map(n => [n.key, n.label])).toEqual([['insung', '인성콜'], ['hwamul24', '화물24시'], ['kakaopicker', '픽커']]);
    });

    it('🔙 방문 기록 — 세 배차망 모두 상세를 남긴다(원달앱 «뒤로»가 준비 화면으로 안 튕기게 · reviews/46)', () => {
        expect(SIM_NET_LIST.map(n => [n.key, n.detailInHistory])).toEqual([
            ['insung', true], ['hwamul24', true], ['kakaopicker', true],
        ]);
    });

    it('🏠 첫 화면 — 인성 · 화물24시는 배차망 설정에 홈이 있고, 픽커는 제 화면 안에 홈이 있어 비운다', () => {
        expect(SIM_NET_LIST.map(n => [n.key, !!n.Home])).toEqual([['insung', true], ['hwamul24', true], ['kakaopicker', false]]);
    });

    it('🎯 문제지 책 — 인성·화물24시는 지금 문제지(원 단위)를 함께 쓰고, 픽커는 제 문제지(P 단위)를 쓴다 (3단계 3-2)', () => {
        expect(SIM_NETS.insung.presetBook).toBe(SHARED_PRESET_BOOK);
        expect(SIM_NETS.hwamul24.presetBook).toBe(SHARED_PRESET_BOOK);
        expect(SIM_NETS.kakaopicker.presetBook).toBe(PICKER_PRESET_BOOK);
    });

    it('🔴 ?net= 해석 — 모르는 값·없는 값·옛 이름은 null (부르는 쪽이 멈추거나 넘긴다 · 0-4)', () => {
        expect(simNetOf('hwamul24')?.key).toBe('hwamul24');
        expect(simNetOf('insung')?.key).toBe('insung');
        expect(simNetOf(null)).toBeNull();
        expect(simNetOf('')).toBeNull();
        expect(simNetOf('abc')).toBeNull();
        expect(simNetOf('inseong')).toBeNull();
    });

    it('🔀 옛 이름 → 새 이름 — inseong 만 insung 으로', () => {
        expect(renamedNetKey('inseong')).toBe('insung');
        expect(renamedNetKey('insung')).toBeNull();
        expect(renamedNetKey('hwamul24')).toBeNull();
        expect(renamedNetKey('toString')).toBeNull();
        expect(renamedNetKey(null)).toBeNull();
    });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PickerCallDetailScreen, PickerOngoingScreen, PickerSimScreen } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { pickerA, pickerB } from './fixtures';

/**
 * 🚚 **픽커 수락 뒤 단계** (2026-09-14 · 카카오픽커_시뮬레이터.md §8-2 · 4단계)
 *
 * 실물 15~31 (기사님 완주 기록 · 레포에는 글만 있다 — `ex_images/카카오픽커/README.md`):
 *   수락 → «내 오더» 탭 → 픽업 이동 → 픽업지(«밀어서 픽업 완료») → 배송 이동 → 배송지(«밀어서 사진 촬영»)
 *   → 사진·문자(한 장으로 줄인다) → «물품이 안전하게 전달» → 리스트
 *
 * 원달앱은 이 글자로 운행 단계를 안다 (`KakaoPickerKeywords.STAGE_WORDS`) — `🚚 [운행 단계] … → …` 로그.
 * 🔴 **한 화면에 다른 단계 글자가 섞이면 원달앱이 단계를 잘못 읽는다.** 픽업 이동 화면에도 «배송 33분 남음»이 있는데
 *    «배송 시간»이 섞이면 배송 중으로 읽는다 (계획서 §8-2 «「배송」이라는 글자를 아무 데나 쓰지 않는다»).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 🔴 원달앱 `KakaoPickerKeywords.STAGE_WORDS` 와 **같은 글자** — 일부러 옮겨 적었다.
 * 시뮬레이터는 원달앱(Kotlin)을 가져다 쓸 수 없다. 원달앱 쪽 낱말이 바뀌면 이 표도 바꾼다 (계획서 §8-2 표가 원천).
 */
const STAGE_WORDS: Record<string, string[]> = {
    HOME: ['시작하기'],
    DONE: ['물품이 안전하게 전달'],
    AT_PICKUP: ['밀어서 픽업 완료'],
    AT_DROPOFF: ['밀어서 사진 촬영'],
    TO_DROPOFF: ['배송 시간', '물품 파손'],
    TO_PICKUP: ['픽업 준비', '픽업지 근처에'],
};
/** 원달앱 `stageOf` 와 같은 순서로 — 먼저 걸리는 단계가 답 · «수락하기»가 보이면 수락 전 */
const stageOf = (text: string): string | null => {
    if (text.includes('수락하기')) return null;
    for (const [stage, words] of Object.entries(STAGE_WORDS)) if (words.some(w => text.includes(w))) return stage;
    return null;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const mount = (el: ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(el); });
};
const rerender = (el: ReactElement) => act(() => { root!.render(el); });
const text = () => (host!.textContent ?? '');
const buttonByText = (t: string) => [...host!.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === t);
const click = (t: string) => {
    const b = buttonByText(t);
    expect(b, `«${t}» 버튼이 없다`).toBeTruthy();
    act(() => { b!.click(); });
};
const chunk = (t: string) => [...host!.querySelectorAll('div')].some(d => d.children.length === 0 && (d.textContent ?? '').trim() === t);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });   // 09:00 · pickerA 픽업 09:30 · 배송 11:00
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
    vi.useRealTimers();
});

describe('상세 «수락하기»', () => {
    it('🔴 누르면 수락한다 — 3단계에서 비워 둔 버튼을 잇는다', () => {
        const onAccept = vi.fn();
        mount(<PickerCallDetailScreen call={pickerA} onClose={() => {}} onAccept={onAccept} />);
        click('수락하기');
        expect(onAccept).toHaveBeenCalledTimes(1);
    });
});

describe('수락 뒤 단계 — 버튼으로 한 단계씩', () => {
    it('🔴 픽업 이동 → 픽업지 → 배송 이동 → 배송지 → 사진·문자 → 완료 · 화면마다 원달앱이 읽는 단계가 하나다', () => {
        const onFinish = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={onFinish} />);

        // 픽업 이동 (실물 16)
        expect(stageOf(text())).toBe('TO_PICKUP');
        expect(chunk('픽업 준비 30분 남음')).toBe(true);
        expect(chunk('배송 120분 남음')).toBe(true);
        expect(text()).not.toContain('배송 시간');

        // 픽업지 — 아래 창 (실물 17)
        click('오더 확인');
        expect(stageOf(text())).toBe('AT_PICKUP');
        expect(chunk(`오더 확인 ${pickerA.orderNo}`)).toBe(true);

        // 배송 이동 (실물 21)
        click('밀어서 픽업 완료');
        expect(stageOf(text())).toBe('TO_DROPOFF');
        expect(chunk('배송 시간 120분 남음')).toBe(true);
        expect(chunk('물품 파손/분실을 주의해 이동해주세요')).toBe(true);
        expect(text()).not.toContain('픽업 준비');

        // 배송지 — 아래 창 (실물 22)
        click('오더 확인');
        expect(stageOf(text())).toBe('AT_DROPOFF');

        // 사진·문자 — 한 장으로 줄인다 (실물 24~30) · 원달앱이 아는 단계 글자가 없다
        click('밀어서 사진 촬영');
        expect(stageOf(text())).toBeNull();
        expect(buttonByText('배송 완료')).toBeTruthy();

        // 완료 (실물 31)
        click('배송 완료');
        expect(stageOf(text())).toBe('DONE');
        expect(chunk('16,870P')).toBe(true);

        click('확인');
        expect(onFinish).toHaveBeenCalledWith(pickerA);
    });

    it('🔴 «밀어서 …» 는 밀어도 넘어간다 (실물은 밀기 · 시뮬레이터는 누르기와 밀기 둘 다)', () => {
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={() => {}} />);
        click('오더 확인');
        const slide = buttonByText('밀어서 픽업 완료')!;
        act(() => {
            slide.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10 }));
            slide.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 250 }));
        });
        // 밀기는 한 박자 뒤에 넘긴다 — 손을 뗄 때 따라오는 «누르기»가 새 화면의 버튼을 누르지 않게
        act(() => { vi.runAllTimers(); });
        expect(stageOf(text())).toBe('TO_DROPOFF');
    });

    it('픽업 마감이 지났으면 «픽업 준비 완료» (실물 18)', () => {
        vi.setSystemTime(new Date('2026-09-14T09:40:00+09:00'));
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={() => {}} />);
        expect(chunk('픽업 준비 완료')).toBe(true);
        expect(stageOf(text())).toBe('TO_PICKUP');
    });

    it('🔴 «배정 취소» — 「배정 취소 불가」 팝업 (실물 19 · 픽커는 수락이 곧 계약)', () => {
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={() => {}} />);
        click('배정 취소');
        expect(chunk('배정 취소 불가')).toBe(true);
        click('확인');
        expect(chunk('배정 취소 불가')).toBe(false);
        expect(stageOf(text())).toBe('TO_PICKUP');
    });
});

describe('픽커 배차 화면 — 수락 뒤', () => {
    const noop = () => {};
    const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
        streamingCalls: [pickerA, pickerB], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
        selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
        acceptCall: noop, cancelCall: noop, finishCall: noop,
        isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
        ...over,
    });

    it('🔴 상세에서 수락하면 잡은 콜로 옮기고 «내 오더» 탭으로', () => {
        const acceptCall = vi.fn();
        const setActiveTab = vi.fn();
        mount(<PickerSimScreen {...props({ selectedCall: pickerA, selectedCallId: pickerA.id, acceptCall, setActiveTab })} />);
        click('수락하기');
        expect(acceptCall).toHaveBeenCalledWith(pickerA);
        expect(setActiveTab).toHaveBeenCalledWith('CONFIRMED');
    });

    it('🔴 잡은 콜을 고르면 수락 전 상세가 아니라 운행 화면이다', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id })} />);
        expect(text()).not.toContain('수락하기');
        expect(stageOf(text())).toBe('TO_PICKUP');
    });

    it('완료하면 잡은 콜에서 뺀다', () => {
        const finishCall = vi.fn();
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id, finishCall })} />);
        click('오더 확인'); click('밀어서 픽업 완료'); click('오더 확인'); click('밀어서 사진 촬영'); click('배송 완료'); click('확인');
        expect(finishCall).toHaveBeenCalledWith(pickerA);
    });

    it('🔴 «내 오더» 탭 — 잡은 콜이 보이고 «리스트 설정»·요금 숫자 모양은 없다 (원달앱이 잡은 콜을 새 콜로 다시 읽지 않게)', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], activeTab: 'CONFIRMED' })} />);
        click('시작하기');
        expect(text()).toContain('내 오더 1');
        expect(text()).not.toContain('리스트 설정');
        expect(text()).toContain(pickerA.orderNo);
        // 원달앱 요금 닻은 «쉼표 든 숫자»만의 글자 덩어리다 — 내 오더 목록에는 그런 덩어리가 없다
        const fareLike = [...host!.querySelectorAll('div')].filter(d => d.children.length === 0 && /^\d{1,3}(,\d{3})+$/.test((d.textContent ?? '').trim()));
        expect(fareLike).toEqual([]);
        rerender(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], activeTab: 'ALL' })} />);
        expect(text()).toContain('리스트 설정');
    });
});

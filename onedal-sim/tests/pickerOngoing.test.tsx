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
 * 실물 순서 (`ex_images/카카오픽커/실물_2026/` 15 · 16~17 · 21~22 · 25 · 26 · 30 · 31):
 *   수락 → «내 오더» 탭(15) → 픽업 이동(16) → 아래 창을 끌어 올리면 «밀어서 픽업 완료»(17) → 배송 중(21)
 *   → 창을 끌어 올리면 «밀어서 사진 촬영»(22) → 인증사진 촬영(25) → 촬영 확인 · 문자 전송(26)
 *   → «문자 전송 후 배송 완료버튼을 눌러주세요» · 배송 완료(30) → 배송 완료 · 오더 목록 보기(31)
 * 모양은 달라도 **단계와 버튼 순서는 실물과 같다** (기사님: «이미지와 같지는 않아도 단계는 같아야»).
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
const clickLabel = (label: string) => {
    const b = host!.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
    expect(b, `«${label}» 버튼이 없다`).toBeTruthy();
    act(() => { b!.click(); });
};

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

describe('수락 뒤 단계 — 실물 순서', () => {
    it('🔴 픽업 이동 → 창 올리기 · 밀어서 픽업 완료 → 배송 중 → 창 올리기 · 밀어서 사진 촬영 → 인증사진 촬영 → 촬영 확인 · 문자 전송 → 배송 완료 → 오더 목록 보기', () => {
        const onFinish = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={onFinish} />);

        // 픽업 이동 (실물 16) — «오더 확인»을 누르는 단계는 없다 · «밀어서 픽업 완료»는 창을 올려야 나온다
        expect(stageOf(text())).toBe('TO_PICKUP');
        expect(chunk('픽업 준비 30분 남음')).toBe(true);
        expect(chunk('배송 120분 남음')).toBe(true);
        expect(chunk('픽업지 근처에 가시면 오더 정보를 확인하세요')).toBe(true);
        expect(text()).not.toContain('배송 시간');
        expect(text()).not.toContain('밀어서 픽업 완료');
        expect(buttonByText('오더 확인')).toBeFalsy();

        // 창을 끌어 올린다 (실물 17)
        clickLabel('아래 창 올리기');
        expect(stageOf(text())).toBe('AT_PICKUP');
        expect(chunk(pickerA.orderNo)).toBe(true);

        // 배송 중 (실물 21)
        click('밀어서 픽업 완료');
        expect(stageOf(text())).toBe('TO_DROPOFF');
        expect(chunk('배송 시간 120분 남음')).toBe(true);
        expect(chunk('물품 파손/분실을 주의해 이동해주세요')).toBe(true);
        expect(text()).not.toContain('픽업 준비');
        expect(text()).not.toContain('밀어서 사진 촬영');

        // 창을 끌어 올린다 (실물 22)
        clickLabel('아래 창 올리기');
        expect(stageOf(text())).toBe('AT_DROPOFF');

        // 인증사진 촬영 (실물 25) — 원달앱이 아는 단계 글자가 없다
        click('밀어서 사진 촬영');
        expect(stageOf(text())).toBeNull();
        expect(chunk('물품과 장소가 함께 보이도록 촬영해주세요')).toBe(true);
        click('인증사진 촬영');

        // 촬영 확인 · 문자 전송 (실물 26)
        expect(chunk('촬영 확인')).toBe(true);
        expect(chunk('고객에게 문자로 사진 전송')).toBe(true);
        expect(stageOf(text())).toBeNull();
        click('문자 전송');

        // 문자 전송 후 배송 완료 (실물 30)
        expect(chunk('배송 완료버튼을 눌러주세요.')).toBe(true);
        expect(stageOf(text())).toBeNull();
        click('배송 완료');

        // 배송 완료 (실물 31)
        expect(stageOf(text())).toBe('DONE');
        expect(chunk('16,870P')).toBe(true);
        click('오더 목록 보기');
        expect(onFinish).toHaveBeenCalledWith(pickerA);
    });

    it('🔴 창은 손으로 끌어 올려도(스크롤) 올라온다 — 실물은 시트를 끌어 올린다', () => {
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={() => {}} />);
        const sheet = host!.querySelector('[data-sheet-scroll]') as HTMLDivElement;
        expect(sheet).toBeTruthy();
        act(() => { sheet.scrollTop = 60; sheet.dispatchEvent(new Event('scroll')); });
        expect(stageOf(text())).toBe('AT_PICKUP');
    });

    it('🔴 수락 직후 «오더 전체»(실물 23) — 픽업지 · 배송지 · 오더 확인 · 최종 수익 · ✕ 를 누르면 내 오더로 (다음에 열면 픽업 이동)', () => {
        const onBack = vi.fn();
        const onStepChange = vi.fn();
        mount(<PickerOngoingScreen call={pickerA} initialStep="OVERVIEW" onStepChange={onStepChange} onBack={onBack} onFinish={() => {}} />);
        expect(chunk('오더 정보')).toBe(true);
        expect(chunk('최종 수익')).toBe(true);
        expect(chunk(pickerA.orderNo)).toBe(true);
        expect(chunk('16,870')).toBe(true);
        expect(stageOf(text())).toBeNull();   // 원달앱이 아는 단계 글자가 없다 — 실물도 내 오더 · 픽업 이동에서 수락을 안다
        clickLabel('닫기');
        expect(onStepChange).toHaveBeenCalledWith('TO_PICKUP');
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('촬영 확인에서 «재촬영»은 인증사진 촬영으로 돌아간다', () => {
        mount(<PickerOngoingScreen call={pickerA} initialStep="PHOTO_CHECK" onBack={() => {}} onFinish={() => {}} />);
        click('재촬영');
        expect(chunk('물품과 장소가 함께 보이도록 촬영해주세요')).toBe(true);
    });

    it('🔴 «밀어서 …» 는 밀어도 넘어간다 (실물은 밀기 · 시뮬레이터는 누르기와 밀기 둘 다)', () => {
        mount(<PickerOngoingScreen call={pickerA} onBack={() => {}} onFinish={() => {}} />);
        clickLabel('아래 창 올리기');
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

    it('🔴 잡은 콜을 처음 열면 수락 전 상세가 아니라 «오더 전체»(실물 23)다', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id })} />);
        expect(text()).not.toContain('수락하기');
        expect(chunk('최종 수익')).toBe(true);
    });

    it('완료하면 잡은 콜에서 뺀다', () => {
        const finishCall = vi.fn();
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id, finishCall })} />);
        clickLabel('닫기');
        clickLabel('아래 창 올리기'); click('밀어서 픽업 완료');
        clickLabel('아래 창 올리기'); click('밀어서 사진 촬영');
        click('인증사진 촬영'); click('문자 전송'); click('배송 완료'); click('오더 목록 보기');
        expect(finishCall).toHaveBeenCalledWith(pickerA);
    });

    it('🔴 «내 오더» 탭 — 실물 15 카드(«픽업 준비 N분 남음» · 픽업 · 배송지) · «리스트 설정»·요금 숫자 모양은 없다 (원달앱이 잡은 콜을 새 콜로 다시 읽지 않게)', () => {
        mount(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], activeTab: 'CONFIRMED' })} />);
        click('시작하기');
        expect(chunk('내 오더')).toBe(true);
        expect(chunk('1')).toBe(true);                       // 파란 동그라미 숫자
        expect(text()).not.toContain('리스트 설정');
        // 실물 15 — 머리 «목록 | 지도» · 배송 종류 탭 · 서포트 모드 · 오더카드가 없다 · 카드 아래 «한차배송 신청내역 보기» · 떠 있는 메뉴는 «카드설정» 하나
        expect(chunk('목록')).toBe(true);
        expect(chunk('지도')).toBe(true);
        expect(text()).not.toContain('도보배송');
        expect(text()).not.toContain('서포트 모드');
        expect(text()).not.toContain('오더카드 대기 중');
        expect(chunk('한차배송 신청내역 보기')).toBe(true);
        expect(chunk('카드설정')).toBe(true);
        expect(text()).not.toContain('수요지도');
        expect(chunk(pickerA.pickerTags[0])).toBe(true);    // 카드 오른쪽 위 배송 종류 딱지 (실물 «도보»)
        expect(chunk('픽업 준비 30분 남음')).toBe(true);
        expect(text()).toContain('배송지: ');
        // 원달앱 요금 닻은 «쉼표 든 숫자»만의 글자 덩어리다 — 내 오더 목록에는 그런 덩어리가 없다
        const fareLike = [...host!.querySelectorAll('div')].filter(d => d.children.length === 0 && /^\d{1,3}(,\d{3})+$/.test((d.textContent ?? '').trim()));
        expect(fareLike).toEqual([]);
        rerender(<PickerSimScreen {...props({ streamingCalls: [pickerB], confirmedCalls: [pickerA], activeTab: 'ALL' })} />);
        expect(text()).toContain('리스트 설정');
    });
});

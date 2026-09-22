// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PickerCallDetailScreen } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { pickerA, pickerB, pickerC } from './fixtures';

/**
 * 📄 **픽커 상세 (수락 전)** — 실물 캡처 05 · 06 · 07 · 실물 덤프 11 · 12 (카카오픽커_시뮬레이터.md §8-1 · 3단계 3-1)
 *
 * 원달앱은 «넘기기 + 수락하기» 둘이 다 보이면 수락 전 상세로 알아보고(`KakaoPickerKeywords.PICKER.detailKeywords`),
 * 상세 글자 원문을 미리보기 콜로 서버에 올린다(`sendPickerPreview`). 계약(수락하기)은 **기사님 손가락**이다.
 * 「수락하기」는 4단계에서 이었다 — 누르면 잡은 콜로 옮기고 수락 뒤 단계로 간다 (`tests/pickerOngoing.test.tsx`).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const markupOf = (el: ReactElement) => renderToStaticMarkup(el);
const textOf = (el: ReactElement) => markupOf(el).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const chunkOf = (html: string, text: string) => new RegExp(`>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`).test(html);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });   // 09:00
afterEach(() => { vi.useRealTimers(); });

describe('픽커 상세 — 글자', () => {
    it('🔴 «넘기기» · «수락하기» 가 따로 있다 — 원달앱이 수락 전 상세로 알아보는 글자', () => {
        const html = markupOf(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        expect(chunkOf(html, '넘기기')).toBe(true);
        expect(chunkOf(html, '수락하기')).toBe(true);
    });

    it('글자 덩어리가 따로다 — 주소 · 거리 · 마감 · 오더번호 · 물품 · 최종 수익 분해 (실물 05·06·07)', () => {
        const html = markupOf(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        [
            '퀵', '배송 120분 남음',
            '경기 광주시 신현동', '픽업 12.1km', '09:30까지 픽업',
            '경기 과천시 중앙동', '배송 21.7km', '11:00까지 배송',
            '픽업 장소', '매장 직원에게 문의', '오더번호 260914090000001',
            '물품 정보', '소형', '세 변의 합 100cm ∙ 5kg 이하',
            '최종 수익', '16,870', '배송비', '15,870P', '프로모션', '1,000P',
        ].forEach(t => expect(chunkOf(html, t), `«${t}» 가 요소 하나로 없다`).toBe(true));
    });

    it('준비 시간이 있으면 «준비 N분 포함» · 단거리 태그 (실물 06)', () => {
        const html = markupOf(<PickerCallDetailScreen call={pickerC} onClose={noop} />);
        expect(chunkOf(html, '준비 2분 포함')).toBe(true);
        expect(chunkOf(html, '단거리')).toBe(true);
        expect(chunkOf(html, '경기 성남시 분당구 서현1동')).toBe(true);
    });

    it('모르는 칸은 안 그린다 — 프로모션 0 · 유의사항 없음 · 크기 규격을 모르는 물품', () => {
        const text = textOf(<PickerCallDetailScreen call={{ ...pickerB, itemSize: '중형' }} onClose={noop} />);
        expect(text).not.toContain('프로모션');
        expect(text).not.toContain('유의사항');
        expect(text).not.toContain('세 변의 합');
    });

    it('🔴 수락 뒤·홈·리스트 글자가 없다 — 상세가 다른 화면으로 읽히지 않게', () => {
        const text = textOf(<PickerCallDetailScreen call={pickerC} onClose={noop} />);
        ['픽업 준비', '픽업지 근처에', '배송 시간', '물품 파손', '밀어서', '물품이 안전하게 전달', '시작하기', '리스트 설정']
            .forEach(w => expect(text, `«${w}»`).not.toContain(w));
    });

    it('예약콜은 «오늘 HH:MM 픽업예약» 상자 — «배송 N분 남음» 대신 (실물 10-1 · 33 · 서버 글자인식이 «픽업예약»으로 예약을 안다)', () => {
        const later = textOf(<PickerCallDetailScreen call={{ ...pickerA, reservedAt: '17:30' }} onClose={noop} />);
        expect(later).toContain('오늘 17:30 픽업예약');
        expect(later).not.toContain('남음');
        expect(later).not.toMatch(/예약 17:30/);   // 태그 줄에 시각을 따로 안 붙인다
        const earlier = textOf(<PickerCallDetailScreen call={{ ...pickerA, reservedAt: '08:00' }} onClose={noop} />);
        expect(earlier).toContain('내일 08:00 픽업예약');
    });

    it('글자 스냅숏', () => {
        expect(textOf(<PickerCallDetailScreen call={pickerA} onClose={noop} />)).toMatchSnapshot();
    });
});

describe('픽커 상세 — 버튼', () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;
    const mount = (el: ReactElement) => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => { root!.render(el); });
        return host;
    };
    afterEach(() => { act(() => { root?.unmount(); }); host?.remove(); root = null; host = null; });
    const byText = (h: HTMLElement, text: string) => [...h.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === text)!;

    it('「넘기기」 — 리스트로 (이 콜을 안 받는다)', () => {
        const onClose = vi.fn();
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={onClose} />);
        act(() => { byText(h, '넘기기').click(); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('뒤로가기(←) — 리스트로', () => {
        const onClose = vi.fn();
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={onClose} />);
        act(() => { h.querySelector<HTMLButtonElement>('button[aria-label="뒤로가기"]')!.click(); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    const sheetOf = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-sheet]')!;
    const dragOf = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-sheet-drag]')!;
    /** 끌기 — 원달앱 검사처럼 누름 → 뗌 사이의 세로 거리로 */
    const drag = (el: HTMLElement, dy: number) => act(() => {
        el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300 }));
        el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientY: 300 + dy }));
    });

    it('처음엔 시트 «중» — 지도 위에 둥근 뒤로가기 하나 (실물 05 · 10-2 · 33)', () => {
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        expect(sheetOf(h).dataset.sheet).toBe('MID');
        expect(h.querySelectorAll('button[aria-label="뒤로가기"]').length).toBe(1);
        expect(h.querySelector('[data-map] button[aria-label="뒤로가기"]')).not.toBeNull();
    });

    it('손잡이를 누르면 한 칸씩 올라간다 — 하 → 중 → 상 · 상에서는 머리줄 뒤로가기 (실물 10-1 · 06)', () => {
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        drag(dragOf(h), 100);
        expect(sheetOf(h).dataset.sheet).toBe('LOW');
        act(() => { vi.advanceTimersByTime(1); });   // 끌기와 따로 한 누르기 — 끈 뒤 따라오는 누르기가 아니다
        act(() => { h.querySelector<HTMLButtonElement>('button[aria-label="아래 창 올리기"]')!.click(); });
        expect(sheetOf(h).dataset.sheet).toBe('MID');
        act(() => { h.querySelector<HTMLButtonElement>('button[aria-label="아래 창 올리기"]')!.click(); });
        expect(sheetOf(h).dataset.sheet).toBe('HIGH');
        expect(h.querySelectorAll('button[aria-label="뒤로가기"]').length).toBe(1);
        expect(h.querySelector('[data-map] button[aria-label="뒤로가기"]')).toBeNull();
    });

    it('끌기 — 위로 끌면 올라가고 아래로 끌면 내려간다 · 끈 뒤 따라오는 누르기는 한 칸 더 안 올린다', () => {
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        drag(dragOf(h), 100);
        expect(sheetOf(h).dataset.sheet).toBe('LOW');
        drag(dragOf(h), -100);
        act(() => { dragOf(h).click(); });
        expect(sheetOf(h).dataset.sheet).toBe('MID');
        drag(dragOf(h), -100);
        expect(sheetOf(h).dataset.sheet).toBe('HIGH');
        drag(dragOf(h), 100);
        expect(sheetOf(h).dataset.sheet).toBe('MID');
    });

    it('«중»에서 시트 내용을 끌어 올리면(스크롤) «상»', () => {
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        const scroller = h.querySelector<HTMLElement>('[data-sheet-scroll]')!;
        act(() => { scroller.scrollTop = 60; scroller.dispatchEvent(new Event('scroll')); });
        expect(sheetOf(h).dataset.sheet).toBe('HIGH');
    });

    it('🔴 «넘기기» · «수락하기» 는 시트 밖 맨 위층 — 시트가 어느 높이든 보인다', () => {
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={noop} />);
        for (const dy of [100, -100, -100]) {   // 하 · 중 · 상
            drag(dragOf(h), dy);
            ['넘기기', '수락하기'].forEach(t => {
                const b = byText(h, t);
                expect(b, `${sheetOf(h).dataset.sheet} 에서 «${t}»`).toBeTruthy();
                expect(sheetOf(h).contains(b)).toBe(false);
            });
        }
    });

    it('「수락하기」 — onAccept 가 없으면 아무 일도 안 한다', () => {
        const onClose = vi.fn();
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={onClose} />);
        act(() => { byText(h, '수락하기').click(); });
        expect(onClose).not.toHaveBeenCalled();
        expect(h.textContent).toContain('수락하기');
    });
});

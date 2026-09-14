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
 * 📄 **픽커 상세 (수락 전)** — 실물 캡처 05 · 06 · 07 · 실물 덤프 11 · 12 (2026-09-14 · 카카오픽커_시뮬레이터.md §8-1 · 3단계 3-1)
 *
 * 원달앱은 «넘기기 + 수락하기» 둘이 다 보이면 수락 전 상세로 알아보고(`KakaoPickerKeywords.PICKER.detailKeywords`),
 * 상세 글자 원문을 미리보기 콜로 서버에 올린다(`sendPickerPreview`). 계약(수락하기)은 **기사님 손가락**이다.
 * 🔴 수락하기는 3단계에서 **아무 일도 안 한다** — 수락 뒤 화면은 4단계에서 만든다 (인성 «탁송»처럼 지어내지 않는다).
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

    it('🔴 「수락하기」 — 3단계에서는 아무 일도 안 한다 (수락 뒤 화면은 4단계)', () => {
        const onClose = vi.fn();
        const h = mount(<PickerCallDetailScreen call={pickerA} onClose={onClose} />);
        act(() => { byText(h, '수락하기').click(); });
        expect(onClose).not.toHaveBeenCalled();
        expect(h.textContent).toContain('수락하기');
    });
});

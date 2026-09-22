import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { PickerDispatchBoard, PickerHomeScreen, PickerSimScreen, formatPickerDistance, visibleCardRange } from '@altari/ui-simulators';
import type { NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { pickerA, pickerB, pickerC } from './fixtures';

/**
 * 📋 **픽커 홈 · 리스트 글자**
 *
 * 원달앱이 알아보는 글자(`KakaoPickerKeywords` · `KakaoPickerParser`)가 화면에 **있는가**, 글자 덩어리가 **따로** 있는가를 본다.
 * 위치(폰 픽셀)는 여기서 못 본다 — `onedal-sim/scripts/pickerDumpCheck.mjs` 가 폰에서 본다.
 */
const noop = () => {};
const markupOf = (el: ReactElement) => renderToStaticMarkup(el);
const textOf = (el: ReactElement) => markupOf(el).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** 요소 하나의 글자 전부가 이것인가 — 웹뷰가 요소 단위로 글자를 넘기므로 «따로 있다»의 기준이다 */
const chunkOf = (html: string, text: string) => new RegExp(`>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`).test(html);

const board = (calls = [pickerB, pickerA, pickerC]) => (
    <PickerDispatchBoard calls={calls} activeTab="ALL" onTabSelect={noop} myOrderCount={0} onCallClick={noop} onMenuClick={noop} />
);

describe('픽커 홈', () => {
    it('🔴 「시작하기」가 있다 — 원달앱이 홈을 알아보는 글자', () => {
        expect(chunkOf(markupOf(<PickerHomeScreen onStart={noop} onMenuClick={noop} />), '시작하기')).toBe(true);
    });

    it('상세·리스트·수락 뒤 글자가 없다 — 홈이 다른 화면으로 읽히지 않게', () => {
        const text = textOf(<PickerHomeScreen onStart={noop} onMenuClick={noop} />);
        ['리스트 설정', '넘기기', '수락하기', '밀어서', '픽업 준비', '배송 시간', '물품이 안전하게 전달'].forEach(w => expect(text).not.toContain(w));
    });

    it('글자 스냅숏', () => {
        expect(textOf(<PickerHomeScreen onStart={noop} onMenuClick={noop} />)).toMatchSnapshot();
    });
});

describe('픽커 리스트', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); });

    it('🔴 「리스트 설정」이 있고 상세 글자(넘기기·수락하기)는 없다', () => {
        const html = markupOf(board());
        expect(chunkOf(html, '리스트 설정')).toBe(true);
        expect(html).not.toContain('수락하기');
        expect(html).not.toContain('넘기기');
    });

    it('«높은 가격순» — 요금이 큰 콜부터', () => {
        const fares = [...markupOf(board()).matchAll(/>(\d{1,3}(?:,\d{3})+)</g)].map(m => m[1]);
        expect(fares).toEqual(['16,870', '14,168', '2,579']);
    });

    it('🔴 글자 덩어리가 따로다 — 요금 · 거리 · 시 · 동 · 태그 · 예약 시각', () => {
        const html = markupOf(board());
        ['16,870', '12.1km', '광주', '신현', '과천', '중앙', '퀵', '준비 완료', '소형',
         '14,168', '15.2km', '중원', '성남', '수지', '동천', '예약', '17:00',
         '2,579', '580m', '분당', '서현1', '삼평', '단거리', '준비 2분'].forEach(t => {
            expect(chunkOf(html, t), `«${t}» 가 요소 하나로 없다`).toBe(true);
        });
    });

    it('예약 콜은 준비 시간을 안 적는다 (실물 02 «퀵 소형 예약 17:00»)', () => {
        expect(textOf(board([pickerB]))).not.toContain('준비');
    });

    it('글자 스냅숏', () => {
        expect(textOf(board())).toMatchSnapshot();
    });
});

describe('픽업거리 표기', () => {
    it.each([[0.58, '580m'], [0.999, '999m'], [1, '1.0km'], [15.24, '15.2km'], [undefined, '']])('%s → «%s»', (km, text) => {
        expect(formatPickerDistance(km)).toBe(text);
    });
});

describe('픽커 배차 화면 — 홈 → 리스트 → 상세 자리', () => {
    const base: NetScreenProps = {
        streamingCalls: [pickerA], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
        selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
        acceptCall: noop, cancelCall: noop, finishCall: noop,
        isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
    };

    it('처음엔 홈', () => {
        const text = textOf(<PickerSimScreen {...base} />);
        expect(text).toContain('시작하기');
        expect(text).not.toContain('리스트 설정');
    });

    it('고른 콜이 있으면 상세 — 원달앱이 수락 전 상세로 알아볼 «넘기기» · «수락하기» (3단계 3-1 에서 자리를 바꿨다)', () => {
        const text = textOf(<PickerSimScreen {...base} selectedCall={pickerA} selectedCallId={pickerA.id} />);
        expect(text).toContain('넘기기');
        expect(text).toContain('수락하기');
    });
});

/**
 * 🪟 **보이는 카드만 그린다** — 화면 밖 카드를 그리면 웹뷰가 높이 0 글자로 원달앱에 넘기고, 원달앱은 그것을 카드 한 장으로 묶는다.
 * 폰 시험 증거는 `pickerDumpCheck.mjs` ⑦⑧ 이 본다. 여기서는 범위 계산만 문다.
 */
describe('visibleCardRange — 스크롤 칸 안에 온전히 보이는 카드', () => {
    it.each([
        // [scrollTop, 칸 높이, 카드 수] → [first, last)
        [0, 400, 23, [0, 6]],        // 400 / 58 = 6.9 → 온전한 6장
        [58, 400, 23, [1, 7]],       // 한 장 내렸다
        [30, 400, 23, [1, 7]],       // 첫 장이 반쯤 가렸다 → 안 그린다
        [0, 400, 3, [0, 3]],         // 카드가 칸보다 적다
        [1000, 400, 3, [3, 3]],      // 칸 아래로 다 지나갔다
        [0, 0, 23, [0, 23]],         // 칸 높이를 모른다(서버 렌더·검사) → 전부
    ])('scrollTop %s · 칸 %s · 카드 %s → %j', (top, height, count, range) => {
        expect(visibleCardRange(top as number, height as number, count as number)).toEqual(range);
    });
});

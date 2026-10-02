import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { Hwamul24SimScreen } from '@altari/ui-simulators';
import type { Hwamul24Call, NetScreenProps } from '@altari/ui-simulators';
import { callA } from './fixtures';
import { FIXED_NOW, seededRandom } from './seededRandom';
import tableSource from '../../onedal-web/shared/src/networkPages.ts?raw';

/**
 * 🧭 **시뮬레이터 화물24시 상세가 배차망 정의 표의 그 페이지로 읽히나** (reviews/35 · 실물 18 «화물상세정보»).
 * 잡기 전 상세는 «화물상세정보» 줄에만 맞고, 잡은 콜 상세는 «배차내역 상세 · 화물정보 탭» 줄에 맞아야 한다 —
 * 잡기 전 화면을 배차내역 모양으로 그리면 원달앱이 잡지 않은 콜을 «확정 뒤 상세»로 읽는다.
 * 표는 onedal-web/shared/src/networkPages.ts 의 JSON 표시 사이를 글(?raw)로 읽는다(시뮬레이터는 shared 를 의존하지 않는다) — 표의 화물24시 줄이 바뀌어 여기가 빨개지면 시뮬레이터와 표가 갈라진 것이다.
 */
type Match = { all?: string[]; any?: string[]; none?: string[]; shape?: { read: string; min?: number; max?: number } };
type Screen = { name: string; match: Match[] };
type FieldRow = { field: string; read?: string; part?: string };

const table = (() => {
    const body = tableSource.match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)?.[1];
    if (!body) throw new Error('networkPages.ts 에서 JSON 표시 사이를 못 찾았다');
    return JSON.parse(body).hwamul24 as { screens: Screen[]; pages: { detail: FieldRow[] } };
})();

const fits = (text: string, m: Match) =>
    (m.all ?? []).every(w => text.includes(w)) &&
    (!m.any?.length || m.any.some(w => text.includes(w))) &&
    !(m.none ?? []).some(w => text.includes(w)) &&
    (!m.shape || ((n) => n >= (m.shape!.min ?? 0) && n <= (m.shape!.max ?? Infinity))((text.match(new RegExp(m.shape.read, 'g')) ?? []).length));
/** 표 차례대로 대어 처음 맞는 페이지 — 알아보는 글자가 빈 줄(아직 모름)은 안 맞는다 */
const pagesOf = (text: string) => table.screens.filter(s => s.match.some(m => fits(text, m))).map(s => s.name);
const readField = (text: string, field: string) => {
    const row = table.pages.detail.find(r => r.field === field && r.read && !r.part);
    return row ? text.match(new RegExp(row.read!))?.[1] : undefined;
};

const noop = () => {};
const base: NetScreenProps = {
    streamingCalls: [callA], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
    selectedCall: callA, selectedCallId: callA.id, openCall: noop, closeDetail: noop,
    acceptCall: noop, cancelCall: noop, finishCall: noop,
    isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
};
/** 원달앱이 읽는 글자 — 태그를 걷고 공백을 하나로 */
const textOf = (el: ReactElement) => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(33));
    try { return renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); } finally { spy.mockRestore(); }
};

describe('🧭 화물24시 상세 ↔ 배차망 정의 표', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('🔴 잡기 전 상세는 «화물상세정보» 줄에만 맞는다', () => {
        expect(pagesOf(textOf(<Hwamul24SimScreen {...base} />))).toEqual(['화물상세정보']);
    });

    it('잡은 콜 상세는 처음 맞는 줄이 «배차내역 상세 · 화물정보 탭»이다', () => {
        expect(pagesOf(textOf(<Hwamul24SimScreen {...base} confirmedCalls={[callA]} />))[0]).toBe('배차내역 상세 · 화물정보 탭');
    });

    it('잡기 전 상세를 표의 상세 칸 읽는 법으로 읽으면 운송료 · 결제방법 · 화물정보가 콜 값이다', () => {
        const text = textOf(<Hwamul24SimScreen {...base} />);
        const call = callA as Hwamul24Call;
        expect(readField(text, 'fare')).toBe(call.fare.toLocaleString());
        expect(readField(text, 'payment')).toBe(call.paymentType);
        expect(readField(text, 'memo')).toContain(call.itemDescription);
        expect(readField(text, 'memo')).not.toContain('운송료');
    });
});

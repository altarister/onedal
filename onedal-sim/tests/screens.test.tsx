import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import {
    Hwamul24CallDetailScreen,
    Hwamul24DispatchBoard,
    InsungCallDetailScreen,
    InsungDispatchBoard,
    InsungDropdownMenu,
    InsungLocationDetailScreen,
    InsungMemoDetailScreen,
    InsungOngoingDetailScreen,
} from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';
import { callA, callB } from './fixtures';

/**
 * 🔒 **인성·화물24시 화면 글자를 그대로 잠근다** (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-1 ③)
 *
 * 원달앱은 **화면에 적힌 글자**를 읽는다. 0단계에서 공통 코드의 배차망별 코드를 배차망 폴더로
 * 옮기는데, 옮기기만 하므로 **화면 글자가 한 글자도 바뀌면 안 된다.** 옮기기 전에 여기 적어 둔다.
 *
 * 콜은 손으로 채운 고정 콜이고, 화면이 쓰는 `Math.random`·지금 시각도 고정한다 — 매번 같은 글자가 나온다.
 * 글자만 본다(태그를 걷는다) — 원달앱이 읽는 것이 글자이기 때문이다.
 */
const noop = () => {};

/** 태그를 걷고 공백을 하나로 — 원달앱이 읽는 «글자»만 남긴다 */
const textOf = (el: ReactElement) =>
    renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

describe('화면 글자 — 고정 콜 · 고정 난수 · 고정 시각', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(914));
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('인성 리스트 — 신규 탭', () => {
        expect(textOf(
            <InsungDispatchBoard streamingCalls={[callA, callB]} confirmedCalls={[]} activeTab="ALL"
                onTabSelect={noop} onCallClick={noop} onStartClick={noop} onSettingsClick={noop} onMenuClick={noop}
                isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} selectedCallId={null} maxPickupKm={15} />,
        )).toMatchSnapshot();
    });

    it('인성 리스트 — 완료 탭', () => {
        expect(textOf(
            <InsungDispatchBoard streamingCalls={[]} confirmedCalls={[callA]} activeTab="CONFIRMED"
                onTabSelect={noop} onCallClick={noop} onStartClick={noop} onSettingsClick={noop} onMenuClick={noop}
                isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} selectedCallId={null} maxPickupKm={15} />,
        )).toMatchSnapshot();
    });

    it('인성 상세 · 확정 뒤 상세 · 출발지 팝업 · 적요 팝업 · 메뉴', () => {
        expect(textOf(<InsungCallDetailScreen call={callA} feedback={null} isConfirmed={false} onClose={noop} onAccept={noop} />)).toMatchSnapshot();
        expect(textOf(<InsungOngoingDetailScreen call={callA} onClose={noop} onCancel={noop} />)).toMatchSnapshot();
        expect(textOf(<InsungLocationDetailScreen type="PICKUP" detail={callA.pickupDetails![0]} onClose={noop} />)).toMatchSnapshot();
        expect(textOf(<InsungMemoDetailScreen call={callA} distPickup="2.4" distDelivery="21.7" onClose={noop} />)).toMatchSnapshot();
        expect(textOf(<InsungDropdownMenu onClose={noop} />)).toMatchSnapshot();
    });

    it('화물24시 리스트 — 화물정보 탭 · 배차내역 탭', () => {
        expect(textOf(
            <Hwamul24DispatchBoard streamingCalls={[callA, callB]} confirmedCalls={[]} activeTab="ALL"
                onTabSelect={noop} onCallClick={noop} onSettingsClick={noop} isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} />,
        )).toMatchSnapshot();
        expect(textOf(
            <Hwamul24DispatchBoard streamingCalls={[]} confirmedCalls={[callB]} activeTab="CONFIRMED"
                onTabSelect={noop} onCallClick={noop} onSettingsClick={noop} isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} />,
        )).toMatchSnapshot();
    });

    it('화물24시 상세', () => {
        expect(textOf(<Hwamul24CallDetailScreen call={callA} onClose={noop} onAccept={noop} />)).toMatchSnapshot();
        expect(textOf(<Hwamul24CallDetailScreen call={callB} onClose={noop} onAccept={noop} />)).toMatchSnapshot();
    });
});

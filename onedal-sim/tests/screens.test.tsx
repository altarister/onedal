import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { SimCall } from '@altari/ui-simulators';
import {
    Hwamul24CallDetailScreen,
    Hwamul24DispatchBoard,
    InseongCallDetailScreen,
    InseongDispatchBoard,
    InseongDropdownMenu,
    InseongLocationDetailScreen,
    InseongMemoDetailScreen,
    InseongOngoingDetailScreen,
} from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';

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

const callA: SimCall = {
    id: 'fixed_a',
    pickups: [{ code: '', name: '초월읍', fullName: '경기 / 광주시 / 초월읍', centroid: [127.294, 37.3772] }],
    dropoffs: [{ code: '', name: '정자동', fullName: '경기 / 성남시 / 정자동', centroid: [127.1113, 37.3595] }],
    pickupDetails: [{ customerName: '초월 물류창고', contactName: '김반장', phone1: '010-0000-0001', region: '초월읍', addressDetail: '경기 광주시 초월읍 도평리 1' }],
    dropoffDetails: [{ customerName: '정자 사무실', contactName: '이과장', phone1: '010-0000-0002', region: '정자동', addressDetail: '경기 성남시 분당구 정자동 2' }],
    pickupDistanceKm: 2.4,
    distanceKm: 21.7,
    status: '신규',
    isShared: false,
    isExpress: true,
    paymentType: '신용',
    billingType: '계산서',
    vehicleType: '다마스',
    itemDescription: '박스 1개',
    callCategory: '급송',
    companyName: '하나로유통',
    pickupTime: '09:30',
    deliveryTime: '11:00',
    fare: 45000,
    isMatchingRoute: true,
};
const callB: SimCall = {
    ...callA,
    id: 'fixed_b',
    pickups: [{ code: '', name: '경안동', fullName: '경기 / 광주시 / 경안동', centroid: [127.2553, 37.4095] }],
    dropoffs: [{ code: '', name: '관고동', fullName: '경기 / 이천시 / 관고동', centroid: [127.435, 37.272] }],
    pickupDetails: undefined,
    dropoffDetails: undefined,
    isExpress: false,
    callCategory: '예약',
    vehicleType: '1t',
    paymentType: '착불',
    pickupTime: '14:30',
    fare: 70000,
};

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
            <InseongDispatchBoard streamingCalls={[callA, callB]} confirmedCalls={[]} activeTab="ALL"
                onTabSelect={noop} onCallClick={noop} onStartClick={noop} onSettingsClick={noop} onMenuClick={noop}
                isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} selectedCallId={null} maxPickupKm={15} />,
        )).toMatchSnapshot();
    });

    it('인성 리스트 — 완료 탭', () => {
        expect(textOf(
            <InseongDispatchBoard streamingCalls={[]} confirmedCalls={[callA]} activeTab="CONFIRMED"
                onTabSelect={noop} onCallClick={noop} onStartClick={noop} onSettingsClick={noop} onMenuClick={noop}
                isTimerPaused={false} onToggleTimer={noop} isFetchingOrder={false} selectedCallId={null} maxPickupKm={15} />,
        )).toMatchSnapshot();
    });

    it('인성 상세 · 확정 뒤 상세 · 출발지 팝업 · 적요 팝업 · 메뉴', () => {
        expect(textOf(<InseongCallDetailScreen call={callA} feedback={null} isConfirmed={false} onClose={noop} onAccept={noop} />)).toMatchSnapshot();
        expect(textOf(<InseongOngoingDetailScreen call={callA} onClose={noop} onConfirm={noop} onCancel={noop} />)).toMatchSnapshot();
        expect(textOf(<InseongLocationDetailScreen type="PICKUP" detail={callA.pickupDetails![0]} onClose={noop} />)).toMatchSnapshot();
        expect(textOf(<InseongMemoDetailScreen call={callA} distPickup="2.4" distDelivery="21.7" onClose={noop} />)).toMatchSnapshot();
        expect(textOf(<InseongDropdownMenu onClose={noop} />)).toMatchSnapshot();
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

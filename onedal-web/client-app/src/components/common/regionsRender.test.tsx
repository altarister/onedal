import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * 🖼️ **결재 카드 밖의 큰 칸을 실제로 그려 본다** — 그리는 중에 예외가 나면 관제앱이 하얗게 꺼진다.
 * 순수 함수 검사는 화면을 그리지 않아 이 부류를 못 잡는다(client-app/CLAUDE.md «단위 테스트는 대개 화면을 그리지 않는다»).
 * 빈 자료 · 값이 빠지거나 뒤틀린 자료(기기 · 콜) 두 벌로 그린다. 새 칸이 생기면 `REGIONS` 에 더한다.
 * 못 잡는 것: 효과(useEffect) 안의 예외 · 소켓으로 들어온 뒤의 갱신 · 오류 경계가 실제로 받는지(경계는 errorBoundary.test).
 * ⚠️ 아침 칸(자료를 효과 안 API 로 받음) · 짐 불일치 띠(경고가 소켓으로만 참)는 노드에서 늘 빈 칸이라 안쪽을 그리지 않는다 —
 *    여기서는 «빈 자료로 터지지 않는다»만 본다. 현황판은 콜을 받지 않아 기기 자료만 닿는다.
 * 노드에서 그리므로 브라우저 전용 객체(localStorage · Audio)와 소켓은 빈 대역이다.
 */
vi.hoisted(() => {
    const g = globalThis as any;
    const mem = new Map<string, string>();
    g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() };
    g.Audio ??= class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };
});

vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});

import { ThemeProvider } from '@onedal/ui/theme';
import { AuthProvider } from '../../contexts/AuthContext';
import { useDeviceStore } from '../../stores/deviceStore';
import Header from '../layout/Header';
import Drawer from '../layout/Drawer';
import DeviceControlPanel from '../dashboard/DeviceControlPanel';
import OrderFilterStatus from '../dashboard/OrderFilterStatus';
import CargoMismatchBanner from '../dashboard/CargoMismatchBanner';
import MorningCard from '../dashboard/MorningCard';
import StatusBoard from '../../statusboard/StatusBoard';
import OrderFilterModal from '../dashboard/OrderFilterModal';

const noop = () => {};

/** 값이 빠지거나 뒤틀린 콜 — 시각 · 요금 · 거리가 숫자가 아니고 주소가 비었다 */
const ODD_ORDERS = [
    { id: 'odd-1', status: 'ORDER_CONFIRMED', type: 'AUTO', pickup: '', dropoff: '', fare: NaN, timestamp: '시각아님', capturedAt: '시각아님', totalDistanceKm: NaN, totalDurationMin: Infinity },
    { id: 'odd-2', status: '모르는상태', pickup: undefined, dropoff: null, fare: undefined, timestamp: undefined },
    /* 서랍의 기본 탭(완료됨)이 실제로 줄을 그리게 — 지난날 끝난 콜(오늘 한 일은 시트 쪽이라 서랍에 안 든다) · 요금 · 하차지가 뒤틀렸다 (완료 시각이 깨지면 «오늘 끝남»으로 봐 시트 쪽에 든다 · deckOfCycle) */
    { id: 'odd-3', status: 'ORDER_DELIVERED', type: 'AUTO', pickup: '경기 광주시 경안동', dropoff: '', fare: NaN, timestamp: '2020-01-01T00:00:00Z', capturedAt: '2020-01-01T00:00:00Z', completedAt: '2020-01-01T01:00:00Z' },
] as any[];

/** 값이 빠지거나 뒤틀린 기기 — 모르는 화면 값 · 모르는 상태 · 숫자 아님 */
const ODD_DEVICES = [
    { deviceId: 'odd-a', status: 'ONLINE', screenContext: 'XYZ', targetApp: '모르는앱', mode: '모르는모드', lastSeen: '시각아님', battery: NaN },
    { deviceId: 'odd-b', status: undefined, screenContext: null, targetApp: null, screenPage: '', isScreenOn: undefined },
] as any[];

const REGIONS: [string, (orders: any[]) => ReactElement][] = [
    ['머리줄', (o) => <Header isConnected={false} liveCalls={o} reservedCount={o.length ? NaN : 0} onMenu={noop} />],
    ['서랍', (o) => <Drawer open activeRoute={o} reserved={o} onClose={noop} onDecision={noop as any} />],
    ['폰 상태 줄', () => <DeviceControlPanel />],
    ['필터 상태 줄', () => <OrderFilterStatus onOpenFilter={noop} />],
    ['필터', () => <OrderFilterModal isOpen onClose={noop} routeMode={false} setRouteMode={noop} />],
    ['짐 불일치 띠', (o) => <CargoMismatchBanner orders={o} />],
    ['아침 칸', () => <MorningCard />],
    ['현황판', (o) => <StatusBoard activeRoute={o} />],
];

const draw = (el: ReactElement) => renderToStaticMarkup(<ThemeProvider><AuthProvider>{el}</AuthProvider></ThemeProvider>);

describe('결재 카드 밖의 큰 칸 — 그리는 중에 예외가 나지 않는다', () => {
    it('서랍은 끝난 콜 줄을 실제로 그린다 — 빈 껍데기만 그려 통과하지 않는다', () => {
        expect(draw(<Drawer open activeRoute={ODD_ORDERS} reserved={[]} onClose={noop} onDecision={noop as any} />)).toContain('경안');
    });

    beforeEach(() => useDeviceStore.getState().setDevices([]));

    for (const [name, el] of REGIONS) {
        it(`${name} — 빈 자료`, () => { expect(() => draw(el([]))).not.toThrow(); });
        it(`${name} — 값이 빠지거나 뒤틀린 자료`, () => {
            useDeviceStore.getState().setDevices(ODD_DEVICES);
            expect(() => draw(el(ODD_ORDERS))).not.toThrow();
        });
    }
});

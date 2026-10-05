import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * 🖼️ **결재 카드 밖의 큰 칸을 실제로 그려 본다** — 그리는 중에 예외가 나면 관제앱이 하얗게 꺼진다.
 * 순수 함수 검사는 화면을 그리지 않아 이 부류를 못 잡는다(client-app/CLAUDE.md «단위 테스트는 대개 화면을 그리지 않는다»).
 * 빈 자료 · 값이 빠지거나 뒤틀린 자료(기기 · 콜) 두 벌로 그린다. 새 칸이 생기면 `REGIONS` 에 더한다.
 * 못 잡는 것: 효과(useEffect) 안의 예외 · 소켓으로 들어온 뒤의 갱신 · 오류 경계가 실제로 받는지(경계는 errorBoundary.test).
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

const noop = () => {};

/** 값이 빠지거나 뒤틀린 콜 — 시각 · 요금 · 거리가 숫자가 아니고 주소가 비었다 */
const ODD_ORDERS = [
    { id: 'odd-1', status: 'ORDER_CONFIRMED', type: 'AUTO', pickup: '', dropoff: '', fare: NaN, timestamp: '시각아님', capturedAt: '시각아님', totalDistanceKm: NaN, totalDurationMin: Infinity },
    { id: 'odd-2', status: '모르는상태', pickup: undefined, dropoff: null, fare: undefined, timestamp: undefined },
] as any[];

/** 값이 빠지거나 뒤틀린 기기 — 모르는 화면 값 · 모르는 상태 · 숫자 아님 */
const ODD_DEVICES = [
    { deviceId: 'odd-a', status: 'ONLINE', screenContext: 'XYZ', targetApp: '모르는앱', mode: '모르는모드', lastSeen: '시각아님', battery: NaN },
    { deviceId: 'odd-b', status: undefined, screenContext: null, targetApp: null, screenPage: '', isScreenOn: undefined },
] as any[];

const REGIONS: [string, (orders: any[]) => JSX.Element][] = [
    ['머리줄', (o) => <Header isConnected={false} liveCalls={o.length ? NaN : 0} reservedCount={o.length} onMenu={noop} />],
    ['서랍', (o) => <Drawer open activeRoute={o} reserved={o} onClose={noop} onDecision={noop as any} />],
    ['폰 상태 줄', () => <DeviceControlPanel />],
    ['필터 상태 줄', () => <OrderFilterStatus onOpenFilter={noop} />],
    ['짐 불일치 띠', (o) => <CargoMismatchBanner orders={o} />],
    ['아침 칸', () => <MorningCard />],
    ['현황판', (o) => <StatusBoard activeRoute={o} />],
];

const draw = (el: JSX.Element) => renderToStaticMarkup(<ThemeProvider><AuthProvider>{el}</AuthProvider></ThemeProvider>);

describe('결재 카드 밖의 큰 칸 — 그리는 중에 예외가 나지 않는다', () => {
    beforeEach(() => useDeviceStore.getState().setDevices([]));

    for (const [name, el] of REGIONS) {
        it(`${name} — 빈 자료`, () => { expect(() => draw(el([]))).not.toThrow(); });
        it(`${name} — 값이 빠지거나 뒤틀린 자료`, () => {
            useDeviceStore.getState().setDevices(ODD_DEVICES);
            expect(() => draw(el(ODD_ORDERS))).not.toThrow();
        });
    }
});

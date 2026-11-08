import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_FILTER_VALUES, quadShapeFrom, VEHICLE_PICKS } from '@onedal/shared';
import type { AutoDispatchFilter } from '@onedal/shared';

/**
 * 💰 **필터창 «💰 콜할인율» 칸의 단가 표** — 오늘 설정(수수료 23% · 12차종 기본 단가)이면 숫자가 그대로다.
 * 필터창을 노드에서 그려 콜할인율 고르기 칸의 아래 칸(단가 표)을 글자로 읽는다.
 * 못 잡는 것: 창이 열린 뒤 `/settings/pricing` 을 읽어 숫자가 바뀌는 순간(노드 그리기는 열릴 때 효과를 안 돌린다 —
 * 그래서 이 검사는 못 읽었을 때의 기본값 = 오늘 설정값으로 본다) · 남은 짐 칸으로 흐려지는 줄.
 */
vi.hoisted(() => {
    const g = globalThis as any;
    const mem = new Map<string, string>();
    g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() };
});

const box = vi.hoisted(() => ({ picks: [] as any[] }));

/* 노드 그리기는 저장소의 «처음 값»(서버용 값)을 읽는다 — 이 검사에서는 저장소의 지금 값을 읽게 한다 */
vi.mock('zustand', async () => {
    const React = await import('react');
    const { createStore } = await import('zustand/vanilla');
    const create = (init: any) => {
        const api = createStore(init);
        const use = (sel: (s: any) => any = (x) => x) => React.useSyncExternalStore(api.subscribe, () => sel(api.getState()), () => sel(api.getState()));
        return Object.assign(use, api);
    };
    return { create };
});
vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});
vi.mock('../ui/KnobGrid', () => ({ KnobGrid: () => null }));
vi.mock('../ui/PickLayer', () => ({ PickLayer: (p: any) => { box.picks.push(p); return null; } }));
vi.mock('./FilterRow', () => ({ FilterRow: (p: any) => <div>{p.summary}{p.children}</div> }));
vi.mock('@onedal/ui/input', () => ({ Input: () => null }));
vi.mock('@onedal/ui/button', () => ({ Button: (p: any) => <button type="button">{p.children}</button> }));

import { useFilterStore } from '../../stores/filterStore';
import OrderFilterModal from './OrderFilterModal';

const served = (callDiscountPct: number) => ({
    ...DEFAULT_FILTER_VALUES, ...quadShapeFrom(null),
    destinationCity: '이천시', goalCity: '이천시', goalCities: ['이천시'],
    pickupRadiusKm: 1, minFare: 30000, isActive: true, slotsUsed: 0, callDiscountPct,
    callTarget: 'DEST', dispatchPhase: 'STANDBY', driverAction: 'WAITING',
    excludedRegions: [], excludedKeywords: [], acceptedVehicleTypes: [], destinationKeywords: [],
}) as unknown as AutoDispatchFilter;

/** 콜할인율을 놓고 필터창을 열어 단가 표 줄을 [차종, 시세, 하한 글자] 로 읽는다 */
const rateRows = (callDiscountPct: number): Array<[string, number, string]> => {
    const f = served(callDiscountPct);
    useFilterStore.setState({ filter: f, baseFilter: f, draft: null } as any);
    box.picks = [];
    renderToStaticMarkup(<OrderFilterModal isOpen onClose={() => {}} routeMode setRouteMode={() => {}} />);
    const dial = box.picks.find(p => p.label === '💰 콜할인율');
    const html = renderToStaticMarkup(<>{dial.foot}</>);
    return [...html.matchAll(/font-bold">([^<]+)<span[^>]*>시세 (\d+)원\/km[\s\S]*?whitespace-nowrap">(전부|≥ [\d,]+원\/km)/g)]
        .map(m => [m[1], Number(m[2]), m[3]]);
};

/** 오늘 숫자 — 실수령 시세(총액 × 0.77 반올림)에 콜할인율을 곱해 다시 반올림한 값 */
const TODAY: Record<number, Record<string, number>> = {
    0:  { '오토바이': 539, '승용차': 693, '다마스': 616, '라보': 693, '1t': 770 },
    10: { '오토바이': 485, '승용차': 624, '다마스': 554, '라보': 624, '1t': 693 },
    20: { '오토바이': 431, '승용차': 554, '다마스': 493, '라보': 554, '1t': 616 },
    30: { '오토바이': 377, '승용차': 485, '다마스': 431, '라보': 485, '1t': 539 },
};
const NET_TODAY = TODAY[0];

beforeEach(() => { box.picks = []; });

describe('💰 필터창 단가 표 — 오늘 설정이면 숫자 그대로', () => {
    it('차례가 받을 짐 표(VEHICLE_PICKS)와 같다 — 오토바이 · 승용차 · 다마스 · 라보 · 1t', () => {
        expect(rateRows(10).map(r => r[0])).toEqual([...VEHICLE_PICKS]);
    });

    for (const pct of [0, 10, 20, 30]) {
        it(`콜할인율 ${pct}% — 다섯 차종 시세 · 하한이 오늘 숫자와 같다`, () => {
            const rows = rateRows(pct);
            expect(rows).toHaveLength(5);
            for (const [v, net, floor] of rows) {
                expect(net).toBe(NET_TODAY[v]);
                expect(floor).toBe(`≥ ${TODAY[pct][v].toLocaleString('ko-KR')}원/km`);
            }
        });
    }

    it('콜할인율 «전부»(100) — 다섯 차종 모두 «전부»', () => {
        const rows = rateRows(100);
        expect(rows).toHaveLength(5);
        expect(rows.every(r => r[2] === '전부')).toBe(true);
    });
});

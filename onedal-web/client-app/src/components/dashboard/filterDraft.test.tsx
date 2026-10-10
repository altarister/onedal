import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_FILTER_VALUES, quadShapeFrom } from '@onedal/shared';
import type { AutoDispatchFilter } from '@onedal/shared';

/**
 * 🔍 **필터창은 적어 두기만 — «적용» 한 번에 원달앱으로** (기사님 «가»).
 * 필터창을 노드에서 그려 손잡이(`KnobGrid`) · 고르기 칸(`PickLayer`) · 버튼이 받은 손을 잡아 직접 누른다.
 * 창을 «닫고 다시 여는 것»은 새로 그리는 것이다 — 관제웹은 닫힌 필터창을 버리고 열 때 새로 만든다.
 * 못 잡는 것: 그냥 `<button>` 으로 그린 칸(기준/수동 · 예약콜 · 노선/동선 · 제외 지역 💾)의 누름 — 그 손은 노드 그리기로 못 잡는다 ·
 * 바깥 터치로 창이 닫히는 순간(관제웹 `Dashboard` 몫) · 지도 캔버스가 칠하는 모양.
 */
vi.hoisted(() => {
    const g = globalThis as any;
    const mem = new Map<string, string>();
    g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() };
});

const box = vi.hoisted(() => ({ emits: [] as Array<[string, any]>, knobs: [] as any[], picks: [] as any[], buttons: [] as any[], inputs: [] as any[] }));

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
    const socket = { on: noop, off: noop, emit: (ev: string, p: unknown) => { box.emits.push([ev, p]); }, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});
vi.mock('../ui/KnobGrid', () => ({ KnobGrid: (p: any) => { box.knobs.push(...p.knobs); return null; } }));
vi.mock('../ui/PickLayer', () => ({ PickLayer: (p: any) => { box.picks.push(p); return <div>{p.foot}</div>; } }));
/* 행은 모두 닫힌 채 시작한다 — 노드 그리기로는 머리를 못 누르니 늘 펼친 행으로 그린다 */
vi.mock('./FilterRow', () => ({ FilterRow: (p: any) => <div>{p.summary}{p.children}</div> }));
vi.mock('@onedal/ui/input', () => ({ Input: (p: any) => { box.inputs.push(p); return null; } }));
vi.mock('@onedal/ui/button', () => ({ Button: (p: any) => { box.buttons.push(p); return <button type="button" title={p.title}>{p.children}</button>; } }));

import { useFilterStore } from '../../stores/filterStore';
import OrderFilterModal from './OrderFilterModal';
import OrderFilterStatus from './OrderFilterStatus';

const SERVED = {
    ...DEFAULT_FILTER_VALUES, ...quadShapeFrom(null),
    destinationCity: '이천시', goalCity: '이천시', goalCities: ['이천시'],
    pickupRadiusKm: 1, minFare: 30000, isActive: true,
    callTarget: 'DEST', dispatchPhase: 'STANDBY', driverAction: 'WAITING',
    excludedRegions: [], excludedKeywords: [], acceptedVehicleTypes: [], destinationKeywords: [],
} as unknown as AutoDispatchFilter;

/** 필터창을 연다 — 닫힌 창은 버려지니 열 때마다 새로 그린다 */
const openWindow = () => {
    box.knobs = []; box.picks = []; box.buttons = []; box.inputs = [];
    return renderToStaticMarkup(<OrderFilterModal isOpen onClose={() => {}} routeMode setRouteMode={() => {}} />);
};
const statusLine = () => renderToStaticMarkup(<OrderFilterStatus onOpenFilter={() => {}} />);
const updates = () => box.emits.filter(([ev]) => ev === 'update-filter');
const knob = (key: string) => box.knobs.find(k => k.key === key);
const button = (titlePart: string) => box.buttons.find(b => String(b.title ?? '').includes(titlePart));
/** 손잡이의 ± 한 번 — `KnobGrid` 의 ± 가 부르는 그대로(set → onCommit) */
const plusOne = (key: string) => { const k = knob(key); const v = k.value + (k.step ?? 1); k.set(v); k.onCommit?.(v); };

/** 도시를 고르고 상차 반경 ± 를 9번 — 창을 열 때마다 새로 그린다 */
const editInWindow = () => {
    openWindow();
    box.picks.find(p => p.label === '시·군·구').onPick('서울 용산구');
    for (let i = 0; i < 9; i++) { openWindow(); plusOne('pickupRadiusKm'); }
};

beforeEach(() => {
    box.emits = [];
    useFilterStore.setState({ filter: SERVED, baseFilter: SERVED, draft: null } as any);
});

describe('🔍 필터창 — 고치는 동안은 보내지 않는다', () => {
    it('도시를 고르고 ± 를 9번 눌러도 원달앱으로 가는 필터 변경(update-filter)은 0번이다', () => {
        editInWindow();
        openWindow(); knob('minFare').onCommit(5);   // 최소 금액 끌기를 뗌
        expect(updates()).toHaveLength(0);
    });

    it('창을 닫았다 다시 열어도 고치던 값이 남아 있다', () => {
        editInWindow();
        const html = openWindow();
        expect(knob('pickupRadiusKm').value).toBe(10);
        expect(html).toContain('서울 용산구');
    });

    it('«적용» 한 번에 바뀐 값이 다 담겨 한 번 간다 — 평소 설정은 안 바꾼다', () => {
        editInWindow();
        openWindow();
        button('원달앱').onClick();
        expect(updates()).toHaveLength(1);
        const [, sent] = updates()[0];
        expect(sent.destinationCity).toBe('서울 용산구');
        expect(sent.pickupRadiusKm).toBe(10);
        expect(sent.saveAsDefault).toBeUndefined();
    });

    it('«서버 저장»은 고치던 값까지 평소 설정으로 보낸다 — 창을 닫았다 연 뒤에도', () => {
        editInWindow();
        openWindow(); plusOne('srcAngleDeg');   // 마름모 각도 — 창을 다시 열면 «고친 때만» 깃발이 내려가 있다
        openWindow();
        button('DB에 저장').onClick();
        const sent = updates();
        expect(sent.length).toBeGreaterThan(0);
        expect(sent.every(([, p]) => p.saveAsDefault === true)).toBe(true);
        const merged = Object.assign({}, ...sent.map(([, p]) => p));
        expect(merged.destinationCity).toBe('서울 용산구');
        expect(merged.pickupRadiusKm).toBe(10);
        expect(merged.srcAngleDeg).toBe((SERVED as any).srcAngleDeg + knob('srcAngleDeg').step);
    });
});

describe('💾 «서버 저장» — 지금 보이는 값 전부를 평소 설정으로', () => {
    it('앞서 적용한 제외 지역 · 제외 단어 · 마름모는 이번에 안 고쳤어도 평소 설정으로 간다', () => {
        const applied = { ...SERVED, excludedRegions: ['D|이천시|창전동'], excludedKeywords: ['착불'], srcAngleDeg: (SERVED as any).srcAngleDeg + 10 };
        useFilterStore.setState({ filter: applied, baseFilter: SERVED, draft: null } as any);
        openWindow(); plusOne('pickupRadiusKm');   // 다른 칸만 고친다
        openWindow();
        button('DB에 저장').onClick();
        const merged = Object.assign({}, ...updates().filter(([, p]) => p.saveAsDefault).map(([, p]) => p));
        expect(merged.excludedRegions).toEqual(['D|이천시|창전동']);
        expect(merged.excludedKeywords).toEqual(['착불']);
        expect(merged.srcAngleDeg).toBe(applied.srcAngleDeg);
        expect(merged.pickupRadiusKm).toBe(2);
    });
});

describe('🔍 «적용 안 함» 표시 — 초안이 서버 값과 다를 때만', () => {
    it('고치고 적용하지 않았으면 필터 줄과 필터창에 «적용 안 함»이 보인다', () => {
        editInWindow();
        expect(statusLine()).toContain('적용 안 함');
        expect(openWindow()).toContain('적용 안 함');
    });

    it('«적용»하면 표시가 사라진다', () => {
        editInWindow();
        openWindow();
        button('원달앱').onClick();
        expect(statusLine()).not.toContain('적용 안 함');
        expect(openWindow()).not.toContain('적용 안 함');
    });

    it('고친 값이 서버 값과 같으면 표시하지 않는다 — 깃발이 아니라 견줘서 정한다', () => {
        openWindow();
        const k = knob('pickupRadiusKm');
        k.set(k.value + 1); k.onCommit(k.value + 1);
        openWindow();
        const back = knob('pickupRadiusKm');
        back.set(1); back.onCommit(1);
        expect(statusLine()).not.toContain('적용 안 함');
    });

    it('제외 단어 칸에서 고치지 않고 손만 떼면 표시하지 않는다', () => {
        useFilterStore.setState({ filter: { ...SERVED, excludedKeywords: ['착불'] }, baseFilter: SERVED } as any);
        openWindow();
        box.inputs.find(p => p.placeholder === '착불, 수거').onBlur();
        expect(statusLine()).not.toContain('적용 안 함');
    });

    it('초안은 고친 칸만 담는다 — 서버가 다른 칸을 바꾸면 그 값이 보이고, 고친 칸만 «적용 안 함»', () => {
        /* 끌다가(onPreview) 손을 뗀다(onCommit) — 둘 다 고친 칸만 적는다 */
        openWindow(); const k = knob('pickupRadiusKm'); k.onPreview(2); k.set(2); k.onCommit(2);
        expect(Object.keys(useFilterStore.getState().draft ?? {})).toEqual(['pickupRadiusKm']);
        /* ⚙️ 설정 · 날 바뀜처럼 서버가 다른 칸을 바꿔 보낸다 */
        useFilterStore.setState({ filter: { ...SERVED, destinationRadiusKm: 33 } } as any);
        openWindow();
        expect(knob('destinationRadiusKm').value).toBe(33);
        expect(knob('pickupRadiusKm').value).toBe(2);
    });

    it('마름모를 끌면 그 칸만 초안에 담긴다', () => {
        openWindow(); plusOne('srcAngleDeg');
        expect(Object.keys(useFilterStore.getState().draft ?? {})).toEqual(['srcAngleDeg']);
    });

    it('«되돌리기» 뒤 초안에는 서버 값과 다른 칸만 남는다', () => {
        /* 오늘 최소 금액만 평소와 다르다 · 반경을 고치던 중 */
        useFilterStore.setState({ filter: { ...SERVED, minFare: 7000 }, baseFilter: SERVED } as any);
        openWindow(); plusOne('pickupRadiusKm');
        openWindow();
        button('서버에 저장된 값으로').onClick();
        expect(useFilterStore.getState().draft).toEqual({ minFare: 30000 });
    });

    it('아무것도 안 고쳤으면 표시하지 않는다', () => {
        expect(statusLine()).not.toContain('적용 안 함');
        expect(openWindow()).not.toContain('적용 안 함');
    });
});

/* 📏 저장 줄은 한 줄 — 가운데 안내 글 칸이 없고 «서버와 다른가»는 💾 버튼 안 작은 글이 말한다(기사님 «가»). 못 잡는 것: 360 폭에서 실제로 한 줄인가(사진) */
describe('📏 저장 줄 — 버튼만', () => {
    const saveButton = () => box.buttons.find(b => String(b.title ?? '').includes('DB에 저장'));
    const text = (node: any): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
    it('서버와 같으면 💾 에 «저장 전»이 없고 · 줄에 «서버와 같음» 글이 없다', () => {
        const html = openWindow();
        expect(html).not.toContain('서버와 같음');
        expect(text(saveButton().children)).not.toContain('저장 전');
    });
    it('서버와 다르면 💾 버튼 안에 «저장 전» · 줄에 «서버와 다름» 글은 없다', () => {
        useFilterStore.setState({ filter: { ...SERVED, minFare: 7000 }, baseFilter: SERVED } as any);
        const html = openWindow();
        expect(html).not.toContain('서버와 다름');
        expect(text(saveButton().children)).toContain('저장 전');
    });
});

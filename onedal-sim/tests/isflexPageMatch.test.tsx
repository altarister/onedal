// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
    IsflexHomeScreen, IsflexMenuScreens, IsflexSimScreen, InsungSimScreen, Hwamul24SimScreen, PickerSimScreen,
    InsungCallDetailScreen, Hwamul24PreConfirmScreen, PickerHomeScreen, isflexRowTexts,
} from '@altari/ui-simulators';
import type { IsflexMenu, NetScreenProps } from '@altari/ui-simulators';
import { FIXED_NOW } from './seededRandom';
import { callA, callB, isflexA, isflexB, isflexC, pickerA } from './fixtures';
import isflexSource from '../../onedal-web/shared/src/networkPages.isflex.ts?raw';
import insungSource from '../../onedal-web/shared/src/networkPages.insung.ts?raw';
import hwamul24Source from '../../onedal-web/shared/src/networkPages.hwamul24.ts?raw';
import pickerSource from '../../onedal-web/shared/src/networkPages.kakaopicker.ts?raw';
import xml01 from '../../ex_images/인성플렉스/01_홈.xml?raw';
import xml02 from '../../ex_images/인성플렉스/02_목록.xml?raw';
import xml03 from '../../ex_images/인성플렉스/03_목록_지도.xml?raw';
import xml04 from '../../ex_images/인성플렉스/04_진행중.xml?raw';
import xml05 from '../../ex_images/인성플렉스/05_필터.xml?raw';
import xml06 from '../../ex_images/인성플렉스/06_넓히기.xml?raw';
import xml08 from '../../ex_images/인성플렉스/08_상세.xml?raw';
import xml15 from '../../ex_images/인성플렉스/15_적립금.xml?raw';

/**
 * 🧭 **시뮬 인성플렉스 화면이 배차망 정의 표의 그 페이지로 읽히나** (기획서 61 부록 A 3-1 · 4단계 끝 조건)
 *
 * 표는 shared `networkPages.isflex.ts` 의 JSON 표시 사이를 글(?raw)로 읽는다(시뮬레이터는 shared 를 의존하지 않는다).
 * 원달앱이 받는 글자에 가깝게 — DOM 을 걸으며 `aria-hidden` 가지를 버리고 노드마다 글자 · 설명(`aria-label`)을 모은다.
 * 묶음 넷: ① 화면 ↔ 표 줄 · 상세 칸 읽기 ② 덧칸이 뒤를 가린다 ③ 실물 xml 고정 글자 대조 ④ 표식 섞임.
 * 못 잡는 것: 폰 웹뷰가 이 노드를 그대로 넘기는가(줄바꿈 · `role="img"` 설명 · 노드 나눔) — A24 uiautomator 덤프로 본다.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Match = { all?: string[]; any?: string[]; none?: string[] };
type Screen = { name: string; match: Match[]; overlays?: Array<{ name: string; match: Match[] }> };
type FieldRow = { field: string; read?: string; part?: string };
type Table = { screens: Screen[]; networkMarkers: string[][]; pages: { detail: FieldRow[] } };
const tableOf = (src: string, name: string): Table => {
    const body = src.match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)?.[1];
    if (!body) throw new Error(`${name} 에서 JSON 표시 사이를 못 찾았다`);
    return JSON.parse(body) as Table;
};
const table = tableOf(isflexSource, 'networkPages.isflex.ts');
const OTHER_MARKERS: Record<string, string[][]> = {
    insung: tableOf(insungSource, 'insung').networkMarkers,
    hwamul24: tableOf(hwamul24Source, 'hwamul24').networkMarkers,
    kakaopicker: tableOf(pickerSource, 'kakaopicker').networkMarkers,
};

const fits = (text: string, m: Match) =>
    (m.all ?? []).every(w => text.includes(w)) &&
    (!m.any?.length || m.any.some(w => text.includes(w))) &&
    !(m.none ?? []).some(w => text.includes(w));
const pagesOf = (text: string) => table.screens.filter(s => s.match.some(m => fits(text, m))).map(s => s.name);
const overlaysOf = (text: string) => table.screens.flatMap(s => s.overlays ?? []).filter(o => o.match.some(m => fits(text, m))).map(o => o.name);
const markerHits = (text: string, markers: string[][]) => markers.filter(g => g.every(w => text.includes(w)));
const readField = (text: string, field: string) => {
    const row = table.pages.detail.find(r => r.field === field && r.read && !r.part);
    return row ? text.match(new RegExp(row.read!))?.[1] : undefined;
};

/** 원달앱이 받는 노드 글자 — aria-hidden 가지는 버린다 */
function nodesOf(el: ReactElement): string[] {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(el); });
    const out: string[] = [];
    const walk = (n: Element) => {
        if (n.getAttribute('aria-hidden') === 'true') return;
        const label = n.getAttribute('aria-label');
        if (label) out.push(label);
        const own = [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent ?? '').join('');
        if (own.trim()) out.push(own);
        [...n.children].forEach(walk);
    };
    walk(host);
    act(() => { root.unmount(); });
    host.remove();
    return out;
}
/** 노드를 한 칸 띄어 잇고 공백을 하나로 — 서버 rawText 꼴 */
const joined = (nodes: string[]) => nodes.join(' ').replace(/\s+/g, ' ').trim();
const textOf = (el: ReactElement) => joined(nodesOf(el));

/** 실물 xml 의 글자 · 설명 */
const xmlTexts = (xml: string): string[] =>
    [...xml.matchAll(/ text="([^"]*)"[^>]*? content-desc="([^"]*)"/g)].flatMap(m => [m[1], m[2]]).filter(Boolean)
        .map(t => t.replace(/&#10;/g, '\n').replace(/&#13;/g, '\r').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

const noop = () => {};
const props = (over: Partial<NetScreenProps> = {}): NetScreenProps => ({
    streamingCalls: [isflexA, isflexB, isflexC], confirmedCalls: [], activeTab: 'ALL', setActiveTab: noop,
    selectedCall: null, selectedCallId: null, openCall: noop, closeDetail: noop,
    acceptCall: noop, cancelCall: noop, finishCall: noop,
    isTimerPaused: false, toggleTimer: noop, isFetchingOrder: false, maxPickupKm: 15, goSetup: noop,
    ...over,
});

/** 화면 안 상태(지도 · 시트 · 메뉴 · 단계)는 눌러서 연다 */
function nodesAfter(el: ReactElement, press: (host: HTMLElement) => void): string[] {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(el); });
    act(() => { press(host); });
    const nodes: string[] = [];
    const walk = (n: Element) => {
        if (n.getAttribute('aria-hidden') === 'true') return;
        const label = n.getAttribute('aria-label');
        if (label) nodes.push(label);
        const own = [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent ?? '').join('');
        if (own.trim()) nodes.push(own);
        [...n.children].forEach(walk);
    };
    walk(host);
    act(() => { root.unmount(); });
    host.remove();
    return nodes;
}
const leaf = (host: HTMLElement, text: string) => [...host.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent === text) as HTMLElement;
const iconButtons = (host: HTMLElement) => [...host.querySelectorAll('button')].filter(b => !b.textContent);

const home = () => nodesOf(<IsflexHomeScreen onEnter={noop} goSetup={noop} />);
const list = () => nodesOf(<IsflexSimScreen {...props()} />);
const detail = (c = isflexA) => nodesOf(<IsflexSimScreen {...props({ selectedCall: c, selectedCallId: c.id })} />);
const emptyMine = () => nodesOf(<IsflexSimScreen {...props({ activeTab: 'CONFIRMED' })} />);
const oneMine = () => nodesOf(<IsflexSimScreen {...props({ activeTab: 'CONFIRMED', confirmedCalls: [isflexB] })} />);
const ongoing = () => nodesOf(<IsflexSimScreen {...props({ confirmedCalls: [isflexB], selectedCall: isflexB, selectedCallId: isflexB.id })} />);
const map = () => nodesAfter(<IsflexSimScreen {...props()} />, h => leaf(h, '지도').click());
const distanceSheet = () => nodesAfter(<IsflexSimScreen {...props()} />, h => iconButtons(h)[2].click());
const sizeSheet = () => nodesAfter(<IsflexSimScreen {...props()} />, h => iconButtons(h)[3].click());
const menu = (m: IsflexMenu) => nodesOf(<IsflexMenuScreens menu={m} now={FIXED_NOW} onBack={noop} onOpen={noop} />);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('① 시뮬 화면 ↔ 정의 표 줄', () => {
    it('홈 → «홈» 줄만', () => expect(pagesOf(joined(home()))).toEqual(['홈']));
    it('🔴 목록 → «목록(신규)» 줄만(상세 줄 아님)', () => expect(pagesOf(joined(list()))).toEqual(['목록(신규)']));
    it('🔴 상세 → «상세(확정 전)» 줄만 — 목록 줄에 안 걸린다', () => {
        for (const c of [isflexA, isflexB, isflexC]) expect(pagesOf(joined(detail(c)))).toEqual(['상세(확정 전)']);
    });
    it('진행중 빈 → «진행중(빈)»', () => expect(pagesOf(joined(emptyMine()))).toEqual(['진행중(빈)']));
    it('🔴 진행중 한 건 → «진행중(한 건)»(수락 뒤 오는 화면) · 목록 줄에 안 걸린다', () => expect(pagesOf(joined(oneMine()))).toEqual(['진행중(한 건)']));
    it('내 오더 콜 → «내 오더 콜»', () => expect(pagesOf(joined(ongoing()))).toEqual(['내 오더 콜']));
    it('지도 보기 → «지도 보기»(목록 0건으로 안 읽힘)', () => expect(pagesOf(joined(map()))).toEqual(['지도 보기']));
    it.each<[IsflexMenu, string]>([
        ['MESSAGE', '메세지함'], ['MY', '마이플렉스'], ['POINT', '적립금 내역'], ['HISTORY', '수행내역'], ['NOTICES', '공지사항'], ['NOTICE', '공지사항'],
    ])('메뉴 %s → «%s»', (m, name) => expect(pagesOf(joined(menu(m)))).toEqual([name]));

    it('상세를 표의 칸 읽는 법으로 읽으면 콜 값이다 — 실물 10 꼴(두 줄 주소 · 과적 · 결제 없음)', () => {
        const t = joined(detail(isflexB));
        expect(readField(t, 'fare')).toBe('21,252');
        expect(readField(t, 'pickupDistance')).toBe('24.4');
        expect(readField(t, 'vehicleType')).toBe('오토');
        expect(readField(t, 'tags')).toBe('과적');
        expect(readField(t, 'pickup')).toBe('@경기 수원시영통구 @낼08:20/수원이의동');
        expect(readField(t, 'deliveryDistance')).toBe('31.0');
        expect(readField(t, 'dropoff')).toBe('서울 중구 10:20전/쌍림동');
        expect(readField(t, 'memo')).toBe(isflexB.memo);
        expect(readField(t, 'payment')).toBeUndefined();
    });

    it('실물 08 꼴(한 줄 주소 · 착불) · 12 꼴(적요 «없음»)', () => {
        const a = joined(detail(isflexA));
        expect([readField(a, 'pickup'), readField(a, 'memo'), readField(a, 'payment'), readField(a, 'fare')])
            .toEqual(['@서울 강남구 @역삼동', '1박스 3층 계단물건 있음', '착불', '8,500']);
        expect(readField(joined(detail(isflexC)), 'memo')).toBeUndefined();
    });
});

describe('② 덧칸이 뒤를 가린다 [실물 05 · 06]', () => {
    it('거리 설정 시트 — 덧칸 이름이 맞고 뒤 목록 글자(«@…» · 수입)가 없다', () => {
        const nodes = distanceSheet();
        expect(overlaysOf(joined(nodes))).toEqual(['오더 목록 거리 설정 시트']);
        expect(nodes.some(n => n.startsWith('@'))).toBe(false);
        expect(nodes).not.toContain('21,252');
    });
    it('사이즈 설정 시트 — 견본 줄은 있고 뒤 목록 글자는 없다', () => {
        const nodes = sizeSheet();
        expect(overlaysOf(joined(nodes))).toEqual(['오더 사이즈 설정 시트']);
        expect(nodes).toEqual(expect.arrayContaining(['출발지 위치 미리보기', '30,000']));
        expect(nodes.some(n => n.startsWith('@'))).toBe(false);
    });
});

describe('③ 실물 xml 고정 글자 대조', () => {
    /** 콜 값이 아닌 것만 — 실물 줄 값(거리 · 동 · 요금 등)은 뺀다 */
    const fixedOf = (xml: string, drop: (t: string) => boolean = () => false) => xmlTexts(xml).filter(t => !drop(t));
    const isRowValue = (t: string) => /^\d+\.\d$/.test(t) || t === '오토' || t.startsWith('@') || /^약 /.test(t) || /^[\d,]+$/.test(t) || /동|가|읍|전\//.test(t) && !/설정|이동/.test(t) || t === '선불' || t === '착불';

    it('홈 — 실물 글자가 다 있고, 시뮬에만 있는 글자가 없다', () => {
        const real = fixedOf(xml01);
        expect(home()).toEqual(expect.arrayContaining(real));
        expect(home().filter(n => !real.includes(n))).toEqual([]);
    });

    it('목록 — 실물 고정 글자가 다 있고, 콜 줄 밖에 시뮬에만 있는 글자가 없다', () => {
        const real = fixedOf(xml02, isRowValue);
        const nodes = list();
        expect(nodes).toEqual(expect.arrayContaining(real));
        const rowValues = new Set([isflexA, isflexB, isflexC].flatMap(c => Object.values(isflexRowTexts(c))));
        expect(nodes.filter(n => !real.includes(n) && !rowValues.has(n))).toEqual([]);
    });

    it('지도 · 진행중 빈 · 시트 둘 — 실물 글자 그대로', () => {
        expect(map()).toEqual(expect.arrayContaining(fixedOf(xml03)));
        expect(emptyMine()).toEqual(fixedOf(xml04));
        expect(distanceSheet()).toEqual(fixedOf(xml05));
        expect(sizeSheet()).toEqual(fixedOf(xml06));
    });

    it('상세 — 실물 제목 글자 · 단추가 다 있다', () => {
        const titles = ['출발지까지 ', '출발', '도착', '적요상세', '총 수입', '닫기', 'Google 지도', '지도 마커'];
        expect(fixedOf(xml08)).toEqual(expect.arrayContaining(titles));
        expect(detail()).toEqual(expect.arrayContaining(titles));
    });

    it('적립금 내역 — 달만 지금 달(실물 10월 · 검사 9월)', () => {
        const real = fixedOf(xml15).map(t => t.replace('10월', '9월'));
        expect(menu('POINT')).toEqual(expect.arrayContaining(real));
    });
});

describe('④ 표식 섞임 — 원달앱이 배차망을 화면 글자로 가른다', () => {
    const isflexScreens: Array<[string, () => string[]]> = [
        ['홈', home], ['목록', list], ['상세 A', () => detail(isflexA)], ['상세 B', () => detail(isflexB)], ['진행중 빈', emptyMine],
        ['진행중 한 건', oneMine], ['내 오더 콜', ongoing], ['지도', map], ['거리 시트', distanceSheet], ['사이즈 시트', sizeSheet],
        ...(['MESSAGE', 'MY', 'POINT', 'HISTORY', 'NOTICES', 'NOTICE'] as IsflexMenu[]).map(m => [m, () => menu(m)] as [string, () => string[]]),
    ];

    it.each(isflexScreens)('🔴 시뮬 인성플렉스 %s 은 인성 · 화물24시 · 픽커 표식에 안 걸린다', (_name, nodesFn) => {
        const t = joined(nodesFn());
        for (const [net, markers] of Object.entries(OTHER_MARKERS)) expect([net, markerHits(t, markers)]).toEqual([net, []]);
    });

    it('표식 넷이 시뮬 홈 · 목록 · 상세 · 진행중 빈 화면에서 걸린다', () => {
        expect(markerHits(joined(home()), table.networkMarkers)).toEqual([['현재 선택된 배송 수단']]);
        expect(markerHits(joined(list()), table.networkMarkers)).toEqual([['출발지까지', '수입']]);
        expect(markerHits(joined(detail()), table.networkMarkers)).toEqual([['출발지까지', '수입'], ['총 수입', '수행하기']]);
        expect(markerHits(joined(emptyMine()), table.networkMarkers)).toEqual([['진행중인 오더가 없습니다']]);
    });

    it('🔴 다른 배차망 시뮬 화면은 인성플렉스 표식에 안 걸린다', () => {
        const others = [
            textOf(<InsungSimScreen {...props({ streamingCalls: [callA, callB] })} />),
            textOf(<InsungCallDetailScreen call={callA} feedback={null} isConfirmed={false} onClose={noop} onAccept={noop} />),
            textOf(<Hwamul24SimScreen {...props({ streamingCalls: [callA, callB] })} />),
            textOf(<Hwamul24PreConfirmScreen call={callB} onClose={noop} onAccept={noop} />),
            textOf(<PickerHomeScreen onStart={noop} onMenuClick={noop} />),
            textOf(<PickerSimScreen {...props({ streamingCalls: [pickerA], selectedCall: pickerA, selectedCallId: pickerA.id })} />),
        ];
        for (const t of others) expect(markerHits(t, table.networkMarkers)).toEqual([]);
    });
});

import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hhmmText } from '@onedal/shared';

/**
 * 🧾 **펼친 콜 카드를 실제로 그려 본다** — 상 · 하차 줄(구간 분 · 밀린 분 · 장부 폴백)과 배송 주행 · 판정 근거 서랍.
 * 카드를 노드에서 그린다(효과는 안 돈다 — 단계 행이 아직 안 와 6단계 트랙은 이 검사 밖이다).
 * 브라우저 전용 객체(localStorage)와 소켓은 빈 대역이다.
 * 못 잡는 것: 6단계 트랙(단계 행은 소켓으로 온다) · 결재 단추를 누른 뒤 · 텔레메트리 막대(심사 중 소켓).
 */
vi.hoisted(() => {
    const g = globalThis as any;
    const mem = new Map<string, string>();
    g.localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k), clear: () => mem.clear() };
});
vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});

import { ThemeProvider } from '@onedal/ui/theme';
import PinnedRouteCard from './PinnedRouteCard';

const EMPTY = { reports: [], milestones: [], dwell: { pickup: { planned: null, actual: null }, dropoff: { planned: null, actual: null } } } as any;
const ROUTE = {
    id: 'c1', status: 'ORDER_CONFIRMED', type: 'AUTO', pickup: '경기 광주시 초월읍 지월리', dropoff: '경기 이천시 신둔면 수광리',
    fare: 50000, paymentType: '신용', capturedAt: '2026-10-07T00:00:00.000Z', timestamp: '2026-10-07T00:00:00.000Z',
    detailMemo: '카톤 두 개', itemDescription: '박스', kakaoSoloDistanceKm: 14.7, kakaoSoloDurationMin: 22,
} as any;
const tl = (stopType: 'pickup' | 'dropoff', o: Record<string, unknown> = {}) => ({
    orderId: 'c1', stopType, etaMs: null, dwellMinutes: 10, driveMinutes: 20, leadMinutes: 0, promisedUntil: null,
    promiseConfirmed: false, dwellShiftMinutes: 0, segmentDriveMinutes: null, lateMinutes: 0, arrived: false, ...o,
});

function draw(o: { route?: any; timeline?: any[]; records?: any; etaMap?: Map<string, any> } = {}) {
    const el: ReactElement = (
        <ThemeProvider>
            <PinnedRouteCard route={o.route ?? ROUTE} isExpanded processingId={null} setProcessingId={() => {}}
                etaMap={o.etaMap ?? new Map()} visitOrderMap={new Map([['c1', { pickupIdx: 1, dropoffIdx: 3 }]])}
                indexNum={1} records={o.records ?? EMPTY} timeline={o.timeline} />
        </ThemeProvider>
    );
    return renderToStaticMarkup(el).replace(/<!-- -->/g, '');
}
/** 글자만 — 태그를 걷는다 */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('🧭 펼친 카드의 상 · 하차 줄 — 타이틀이 못 하는 말만', () => {
    it('🔴 구간 분은 타임라인의 «앞 정거장 → 여기» — 정거장마다', () => {
        const t = text(draw({ timeline: [tl('pickup', { segmentDriveMinutes: 21 }), tl('dropoff', { segmentDriveMinutes: 37 })] }));
        expect(t).toMatch(/1 상차 · \S+ [\d.-]+km ?·21분/);
        expect(t).toMatch(/3 하차 · \S+ [\d.-]+km ?·37분/);
    });
    it('🔴 앞 정거장이 민 분을 적는다 — 밀림 · 당겨짐 · 0 이면 안 적는다', () => {
        const t = text(draw({ timeline: [tl('pickup', { dwellShiftMinutes: 5 }), tl('dropoff', { dwellShiftMinutes: -3 })] }));
        expect(t).toContain('+5분 밀림');
        expect(t).toContain('-3분 당겨짐');
        const none = text(draw({ timeline: [tl('pickup'), tl('dropoff')] }));
        expect(none).not.toMatch(/밀림|당겨짐|앞 정거장이 예측과 달라/);
    });
    it('🔴 경로에 없는 콜은 장부(통화로 합의한 약속)에서 시각을 읽는다', () => {
        const at = '2026-10-07T05:40:00.000Z';
        const records = { ...EMPTY, reports: [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: at }] };
        expect(text(draw({ records }))).toContain(`→ ${hhmmText(Date.parse(at))}`);
        /* 경로의 예정이 있으면 그것이 이긴다 */
        const etaMap = new Map([['c1', { pickupEta: '09:09' }]]);
        expect(text(draw({ records, etaMap }))).toContain('→ 09:09');
    });
    it('늦으면 ⚠️N분 · 지난 곳은 «통과»', () => {
        const t = text(draw({ timeline: [tl('pickup', { lateMinutes: 7, etaMs: Date.parse('2026-10-07T03:00:00Z') }), tl('dropoff')],
            records: { ...EMPTY, milestones: [{ milestone: 'ARRIVED_DROPOFF', occurredAt: '2026-10-07T04:00:00Z' }] } }));
        expect(t).toContain('⚠️7분');
        expect(t).toContain('통과');
    });
});

describe('🚚 배송 주행 · 판정 근거 서랍', () => {
    /** html 안에서 그 글자가 나오는 자리 **전부**가 <details> … </details> 안인가(true) · 전부 밖인가(false) · 섞였나(null) */
    const insideDetails = (html: string, s: string) => {
        const at: boolean[] = [];
        for (let i = html.indexOf(s); i >= 0; i = html.indexOf(s, i + 1)) {
            at.push(html.lastIndexOf('<details', i) > html.lastIndexOf('</details>', i));
        }
        if (!at.length) return undefined;
        return at.every(Boolean) ? true : at.some(Boolean) ? null : false;
    };
    it('🔴 배송 주행 · 실측/추정 · 하차 마감은 서랍 밖 — 펼치지 않아도 보인다', () => {
        const html = draw();
        expect(html).toContain('🚚 배송 주행');
        expect(insideDetails(html, '🚚 배송 주행')).toBe(false);
        expect(text(html)).toMatch(/22분 · 14\.7km \((실측|추정)\)/);
        expect(insideDetails(html, '하차 마감')).toBe(false);
        expect(text(html)).toMatch(/하차 마감 \d\d:\d\d/);
    });
    it('판정 근거 · 원본 데이터는 서랍 안 — 단독 경로 · 원본 칸', () => {
        const html = draw();
        expect(insideDetails(html, '판정 근거 · 원본 데이터')).toBe(true);
        expect(insideDetails(html, 'route.detailMemo :')).toBe(true);
        expect(text(html)).toContain('단독 14.7km / 22분');
    });
});

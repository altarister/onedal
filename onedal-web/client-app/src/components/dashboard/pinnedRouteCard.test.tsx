import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hhmmText } from '@onedal/shared';

/**
 * 🧾 **펼친 콜 카드를 실제로 그려 본다** — 머리 경로 · 상 · 하차 덩어리(전화 · 장부 폴백 · 마감) · 심사 중 카드.
 * 카드를 노드에서 그린다(효과는 안 돈다 — 단계 행이 아직 안 와 6단계 트랙은 이 검사 밖이다).
 * 브라우저 전용 객체(localStorage)와 소켓은 빈 대역이다.
 * 못 잡는 것: 6단계 트랙(단계 행은 소켓으로 온다) · 결재 단추를 누른 뒤 · 텔레메트리 막대(심사 중 소켓) · «▸ 더보기»를 연 뒤(누르기가 없다).
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

describe('📍 잡은 뒤 카드 — 머리 경로 · 상 · 하차 덩어리', () => {
    it('🔴 머리 줄은 «몇 번째. 동 → 동» — 잡은 시각 · 차종은 머리에 없다(더보기)', () => {
        const route = { ...ROUTE, vehicleType: '1t' };
        const t = text(draw({ route }));
        expect(t).toContain('1. 초월읍 → 신둔면');
        expect(t).not.toContain('잡은 시각');   // 더보기를 안 열었다
        expect(draw({ route })).not.toMatch(/>1t</);
    });
    it('🔴 번호가 있는 덩어리는 그곳에 거는 링크 · 없으면 «번호 없음»', () => {
        const route = { ...ROUTE, pickupDetails: [{ phone1: '010-1234-5678', customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }] };
        const html = draw({ route });
        expect(html).toMatch(/<a[^>]*href="tel:01012345678"[^>]*aria-label="상차 모다아울렛 전화"/);
        expect(text(html)).toContain('경기 광주시 초월읍 경충대로 907');
        expect(html).not.toMatch(/aria-label="하차 [^"]* 전화"/);
        expect(text(html)).toMatch(/하차 · 신둔면 .*번호 없음/);
    });
    it('🔴 경로에 없는 콜은 장부(통화로 합의한 약속)에서 예상을 읽는다 · 경로의 예정이 있으면 그것이 이긴다', () => {
        const at = '2026-10-07T05:40:00.000Z';
        const records = { ...EMPTY, reports: [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: at }] };
        expect(text(draw({ records }))).toContain(`예상 ${hhmmText(Date.parse(at))}`);
        const etaMap = new Map([['c1', { pickupEta: '09:09' }]]);
        expect(text(draw({ records, etaMap }))).toContain('예상 09:09');
    });
    it('늦으면 ⚠️N분 늦음 · 지난 곳은 «통과» · 구간 km · 밀린 분은 덩어리에 없다', () => {
        const t = text(draw({ timeline: [tl('pickup', { lateMinutes: 7, dwellShiftMinutes: 5, segmentDriveMinutes: 21, etaMs: Date.parse('2026-10-07T03:00:00Z') }), tl('dropoff')],
            records: { ...EMPTY, milestones: [{ milestone: 'ARRIVED_DROPOFF', occurredAt: '2026-10-07T04:00:00Z' }] } }));
        expect(t).toContain('⚠️7분 늦음');
        expect(t).toContain('통과');
        expect(t).not.toMatch(/밀림|·21분/);
    });
    it('🔴 하차 덩어리에 마감 시각 — 배송 주행 근거 · 판정 근거 서랍은 더보기 안(처음엔 안 그린다)', () => {
        const html = draw();
        expect(text(html)).toMatch(/하차 · 신둔면 .*마감 \d\d:\d\d/);
        expect(html).not.toContain('🚚 배송 주행');
        expect(html).not.toContain('판정 근거 · 원본 데이터');
        expect(text(html)).toContain('▸ 더보기');
    });
    it('심사 중 카드는 그대로 — 머리에 잡은 시각 · 차종 · 덩어리 없음', () => {
        const route = { ...ROUTE, status: 'ORDER_SECURED_EVALUATING', vehicleType: '1t' };
        const html = draw({ route });
        expect(html).toMatch(/>1t</);
        expect(text(html)).not.toContain('초월읍 → 신둔면');
        expect(text(html)).not.toContain('▸ 더보기');
    });
});

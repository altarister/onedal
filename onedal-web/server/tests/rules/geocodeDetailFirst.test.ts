// @ts-nocheck
import db from '../../src/db';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';

/**
 * 📍 **판정은 콜의 가장 정확한 주소로 지오코딩한다 — 상세 주소가 오면 다시 찍는다** (90판 · 24 발견 · 71 «가»).
 * 손 확정 콜이 목록 글 «초월읍»으로 찍혀 상차지가 실제 자리에서 3km 어긋나 도착이 안 섰다.
 * 못 잡는 것: 실제 카카오 좌표 · 원달앱이 상세 주소를 싣나 — 폰.
 */
const MARK = `${[...String(Date.now() % 100000)].map(d => 'ABCDEFGHIJ'[+d]).join('')}`;
const SHORT = `초월읍${MARK}`;
const DETAIL = `경기 광주시 초월읍 경충대로 907 모다아울렛${MARK}`;
const realFetch = global.fetch;
const asked: string[] = [];
const reply = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const kakao = ((url: string) => {
    const q = decodeURIComponent(url.split('query=')[1] ?? '').split('&')[0];
    asked.push(q);
    if (q === DETAIL) return reply({ documents: [{ x: '127.312588', y: '37.363300', address_name: DETAIL, road_address: null }] });
    if (q === SHORT) return reply({ documents: [{ x: '127.287960', y: '37.385248', address_name: SHORT, road_address: null }] });
    return reply({ documents: [] });
}) as any;
const stage = (order: any) => (OrderEvaluator.prototype as any).geocodeStage.call(new OrderEvaluator('insung'), order, () => {});

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
beforeEach(() => { global.fetch = kakao; asked.length = 0; });
afterAll(() => { global.fetch = realFetch; db.prepare(`DELETE FROM geocode_cache WHERE query LIKE ?`).run(`%${MARK}%`); });

describe('📍 상세 주소 먼저', () => {
    it('🔴 보고의 상차지가 목록 글이어도 상세 팝업 주소로 찍는다', async () => {
        const order = { pickup: SHORT, dropoff: '', pickupDetails: [{ addressDetail: DETAIL }], dropoffX: 1, dropoffY: 1, dropoffGeoText: '' };
        await stage(order);
        expect(asked).toContain(DETAIL);
        expect([order.pickupX, order.pickupY]).toEqual([127.312588, 37.3633]);
    });
    it('🔴 짧은 글로 먼저 찍힘 → 상세 주소 도착 → 다시 찍힌다', async () => {
        const order: any = { pickup: SHORT, dropoff: '', dropoffX: 1, dropoffY: 1, dropoffGeoText: '' };
        await stage(order);
        expect([order.pickupX, order.pickupY]).toEqual([127.28796, 37.385248]);
        order.pickupDetails = [{ addressDetail: DETAIL }];
        await stage(order);
        expect([order.pickupX, order.pickupY]).toEqual([127.312588, 37.3633]);
    });
});

// @ts-nocheck
import { calculateDetourRoute } from '../../src/services/kakaoService';
import { composeMergedRoute } from '../../src/services/routeComposer';

/**
 * 🛣️ **합짐 경로의 카카오 호출** (서버 병목 8·9 · onedal-1f «가»).
 * ⑧ 비교 경로(base)와 합짐 경로(merged)를 차례로 부르던 것을 동시에 — 합짐 판정·KEEP 마다 카카오 한 번 길이가 준다.
 * ⑨ 후보 없이 부르면(KEEP · 복구 · 취소 뒤 재계산) base 와 merged 가 같은 길 — base 를 따로 안 잰다.
 */
const realFetch = global.fetch;
let calls = 0;
const route = { routes: [{ result_code: 0, summary: { duration: 3600, distance: 50000 }, sections: [] }] };
const fake = (ms: number) => (() => { calls++; return new Promise(r => setTimeout(() => r({ ok: true, status: 200, json: async () => route }), ms)); }) as any;
beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
beforeEach(() => { calls = 0; });
afterEach(() => { global.fetch = realFetch; });

describe('🛣️ ⑧ 비교 경로와 합짐 경로를 동시에', () => {
    it('🔴 둘 다 600ms 걸리면 합짐 경로는 약 600ms 대에 끝난다', async () => {
        global.fetch = fake(600);
        const t0 = Date.now();
        await calculateDetourRoute(127.3, 37.3, 127.1, 37.1, 127.4, 37.4, [{ x: 127.2, y: 37.2 }], { x: 127.0, y: 37.0 }, 'RECOMMEND', 1, null, null);
        expect(calls).toBe(2);
        expect(Date.now() - t0).toBeLessThan(1000);
    });
});

describe('🛣️ ⑨ 후보 없이 부르면 base 를 따로 안 잰다', () => {
    const at = (dx: number) => ({ x: 127 + dx * 0.01, y: 37 });
    const A = { id: 'A', status: 'ORDER_CONFIRMED', pickupX: at(15).x, pickupY: 37, dropoffX: at(30).x, dropoffY: 37 };
    const B = { id: 'B', status: 'ORDER_CONFIRMED', pickupX: at(10).x, pickupY: 37, dropoffX: at(50).x, dropoffY: 37 };

    it('🔴 KEEP · 복구 · 취소 뒤 재계산 — 카카오 1번 · 결과 모양(merged · base) 그대로', async () => {
        global.fetch = fake(5);
        const r = await composeMergedRoute({ calls: [A, B], origin: { x: 127.001, y: 37.001 }, priority: 'RECOMMEND', carType: 1 });
        expect(calls).toBe(1);
        expect(r?.merged?.duration).toBe(3600);
        expect(r?.base?.duration).toBe(3600);
    });

    it('후보가 있으면 지금처럼 둘 — 우회 비용은 base 와 merged 의 차이', async () => {
        global.fetch = fake(5);
        const C = { id: 'C', status: 'ORDER_SECURED_EVALUATING', pickupX: at(20).x, pickupY: 37, dropoffX: at(40).x, dropoffY: 37 };
        await composeMergedRoute({ calls: [A, B], extra: C, origin: { x: 127.08, y: 37.08 }, priority: 'RECOMMEND', carType: 1 });
        expect(calls).toBe(2);
    });
});

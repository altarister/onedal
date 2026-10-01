// @ts-nocheck
import db from '../../src/db';
import { geocodeAddress, hedgeBudget } from '../../src/services/kakaoService';

/**
 * 🗺️ **좌표는 1순위가 오면 바로** (서버 병목 묶음 3 (b) · onedal-1f «가»).
 *
 * 후보 질의 최대 6개를 동시에 쏘되, 앞 순위가 다 끝났고 받아들일 만한 답이 오면 곧바로 답한다 — 느린 키워드 검색을 기다리지 않는다.
 * 고르는 규칙(순위 · 지역 불일치 방어)은 그대로. 1순위 질의가 1.2초 안에 안 오면 같은 질의를 나란히 한 번 더(판정 칸 상한 안에서).
 */
/** 숫자 없는 표지 — 숫자가 있으면 서버가 표지까지를 «번지»로 잘라 1순위 질의가 달라진다 */
const MARK = `검사상호${[...String(Date.now() % 100000)].map(d => 'ABCDEFGHIJ'[+d]).join('')}`;
const realFetch = global.fetch;
const q = (n: number) => `경기 이천시 부발읍 경충대로 2091 ${MARK}${'가나다'[n - 1]}`;
const FIRST = '경기 이천시 부발읍 경충대로 2091';
const doc = (sido: string, x: number) => ({ documents: [{ x: String(x), y: '37.2', address_name: `${sido} 이천시 부발읍`, road_address: null }] });
const reply = (ms: number, body: any) => new Promise(r => setTimeout(() => r({ ok: true, status: 200, json: async () => body }), ms));
const never = (init: any) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
/** 1순위 = 번지까지 자른 주소 검색 */
const isFirst = (url: string) => url.includes('/address.json') && decodeURIComponent(url.split('query=')[1]) === FIRST;

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
afterEach(() => { global.fetch = realFetch; });
afterAll(() => { db.prepare(`DELETE FROM geocode_cache WHERE query LIKE ?`).run(`%${MARK}%`); });

/**
 * ⏱️ **가짜 시계로 잰다** — 실제 시계(«300ms 안에»)는 검사가 몰리면 흔들려 게이트를 못 믿게 한다.
 *    정한 만큼만 시계를 앞당겨 «그때 답이 나왔나»를 본다 — 느린 답이 올 시각 전에 끝났으면 그것을 안 기다린 것이다.
 */
const settledAfter = async <T>(p: Promise<T>, ms: number) => {
    let done = false;
    p.then(() => { done = true; }, () => { done = true; });
    await jest.advanceTimersByTimeAsync(ms);
    return done;
};

describe('🗺️ 좌표 — 1순위가 오면 바로', () => {
    afterEach(() => { jest.useRealTimers(); });

    it('🔴 1순위 50ms · 나머지 1초 → 나머지가 오기 전(60ms)에 1순위 좌표', async () => {
        jest.useFakeTimers();
        global.fetch = ((url: string) => isFirst(url) ? reply(50, doc('경기', 127.11)) : reply(1000, doc('경기', 127.99))) as any;
        const p = geocodeAddress(q(1));
        expect(await settledAfter(p, 60)).toBe(true);
        expect((await p)?.x).toBe(127.11);
    });

    it('🔴 1순위가 지역 불일치면 건너뛰고 2순위 — 2순위가 오는 대로', async () => {
        jest.useFakeTimers();
        global.fetch = ((url: string) => isFirst(url) ? reply(20, doc('전남', 126.9))
            : url.includes('/keyword.json') && decodeURIComponent(url.split('query=')[1]) === q(2) ? reply(100, doc('경기', 127.22))
            : reply(1000, doc('경기', 127.99))) as any;
        const p = geocodeAddress(q(2));
        expect(await settledAfter(p, 150)).toBe(true);   // 2순위(100ms)가 온 뒤 · 나머지(1초) 전
        expect((await p)?.x).toBe(127.22);
    });

    /* 실제 시계 — 가짜 시계가 부르는 타이머에는 판정 칸(hedgeBudget · 비동기 맥락)이 안 따라가 한 번 더를 못 본다.
       시간 기준 대신 나머지 질의를 영영 안 오게 둔다 — 둘째 답이 나오면 나머지를 안 기다린 것이다(기다리면 3초 마감에 다른 답이 된다) */
    it('🔴 1순위가 멈추면 1.2초 뒤 나란히 한 번 더 — 둘째가 오면 그것 · 다시 1', async () => {
        let firstCalls = 0;
        global.fetch = ((url: string, init: any) => {
            if (isFirst(url)) return ++firstCalls === 1 ? never(init) : reply(50, doc('경기', 127.33));
            return never(init);
        }) as any;
        const budget = { left: 2, used: 0 };
        const r = await hedgeBudget.run(budget, () => geocodeAddress(q(3)));
        expect(r?.x).toBe(127.33);
        expect(budget.used).toBe(1);
    });
});

describe('🗺️ 좌표 — 카카오 오류는 «주소 못 찾음»이 아니다 (서버 병목 11)', () => {
    it('🔴 모든 질의가 오류(429)로 끝나면 원인을 던진다 — 판정 사유가 «카카오 좌표 HTTP 429»', async () => {
        global.fetch = (() => Promise.resolve({ ok: false, status: 429, json: async () => ({}) })) as any;
        await expect(geocodeAddress(`경기 이천시 부발읍 경충대로 2091 ${MARK}라`)).rejects.toThrow('HTTP 429');
    });

    it('빈 결과가 하나라도 있으면 지금처럼 null — 정말 못 찾은 주소', async () => {
        let n = 0;
        global.fetch = (() => (++n === 1
            ? Promise.resolve({ ok: true, status: 200, json: async () => ({ documents: [] }) })
            : Promise.resolve({ ok: false, status: 429, json: async () => ({}) }))) as any;
        await expect(geocodeAddress(`경기 이천시 부발읍 경충대로 2091 ${MARK}마`)).resolves.toBeNull();
    });
});

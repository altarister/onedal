// @ts-nocheck
import db from '../../src/db';
import { geocodeAddress } from '../../src/services/kakaoService';

/**
 * 🗺️ **번지 없는 주소는 주소 검색(읍 · 동 중심)이 먼저** (29 X13 · 기사님 «가»).
 * 키워드 검색이 먼저면 «경기 광주시 초월읍»이 읍 안의 아무 장소(허난설헌묘 · 4.55km)로 찍혔다.
 * 대조: 장소 이름이 붙은 꼴(주소 검색 0건)은 키워드 · 번지 있는 꼴은 지금 순서(`geocodeFirstInOrder`).
 * 번지 없는 질의는 캐시 열쇠에 판 글자가 붙는다 — 이미 키워드 좌표로 굳은 옛 줄을 안 쓰고 한 번 다시 묻는다(옛 줄은 안 지움).
 * 못 잡는 것: 실제 카카오 답(이 검사는 fetch 를 흉내 낸다 · 실제 답은 e2e kakao).
 */
const MARK = `검사${[...String(Date.now() % 100000)].map(d => 'ABCDEFGHIJ'[+d]).join('')}`;
const realFetch = global.fetch;
const doc = (x: number) => ({ documents: [{ x: String(x), y: '37.38', address_name: '경기 광주시 초월읍', road_address: null }] });
const reply = (ms: number, body: any) => new Promise(r => setTimeout(() => r({ ok: true, status: 200, json: async () => body }), ms));
const isType = (url: string, t: string) => url.includes(`/${t}.json`);

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
afterEach(() => { global.fetch = realFetch; });
afterAll(() => { db.prepare(`DELETE FROM geocode_cache WHERE query LIKE ?`).run(`%${MARK}%`); });

describe('🗺️ 번지 없는 주소 — 주소 검색이 먼저', () => {
    it('🔴 읍 · 동만인 주소 — 키워드가 먼저 와도 주소 답(읍 중심)을 고른다', async () => {
        global.fetch = ((url: string) => isType(url, 'keyword') ? reply(10, doc(127.2962)) : reply(40, doc(127.2880))) as any;
        expect((await geocodeAddress(`경기 광주시 ${MARK}읍`))?.x).toBe(127.2880);
    });

    it('대조 — 장소 이름이 붙은 꼴은 주소 검색 0건이라 키워드(그 장소)', async () => {
        global.fetch = ((url: string) => isType(url, 'keyword') ? reply(10, doc(127.3486)) : reply(10, { documents: [] })) as any;
        expect((await geocodeAddress(`경기 광주시 곤지암읍 ${MARK}성당`))?.x).toBe(127.3486);
    });

    it('🔴 번지 없는 질의는 캐시 열쇠에 판 글자 — 옛 열쇠(글자 그대로)의 줄은 안 쓴다', async () => {
        const q = `경기 광주시 ${MARK}면`;
        db.prepare(`INSERT OR REPLACE INTO geocode_cache (query, x, y, hit_count, created_at, last_used) VALUES (?, 127.9999, 37.0, 1, datetime('now'), datetime('now'))`).run(q);
        global.fetch = ((url: string) => isType(url, 'address') ? reply(10, doc(127.2880)) : reply(10, { documents: [] })) as any;
        expect((await geocodeAddress(q))?.x).toBe(127.2880);
        expect(db.prepare(`SELECT x FROM geocode_cache WHERE query = ?`).get(q).x).toBe(127.9999);   // 옛 줄은 그대로(안 지움)
        expect(db.prepare(`SELECT COUNT(*) AS n FROM geocode_cache WHERE query LIKE ? AND query != ?`).get(`%${MARK}면`, q).n).toBe(1);   // 새 열쇠 한 줄
    });
});

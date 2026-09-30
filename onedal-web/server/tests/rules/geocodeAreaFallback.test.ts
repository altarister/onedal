// @ts-nocheck
import db from '../../src/db';
import { geocodeAddress, geocodeCallAddress, areaPrefixOf } from '../../src/services/kakaoService';
import { approxTagsOf } from '../../src/core/engine/OrderEvaluator';

/**
 * 📍 **콜 주소를 못 찾으면 읍·면·동 중심으로 물러선다 · «대략» 표시** (기사님 «가» · onedal-1f).
 * 카카오에 없는 회사 이름(«경기 이천시 마장면 강동케이앤드에스»)이면 판정이 🔴 잴 수 없음으로 끝났다.
 * 콜 판정만 물러선다 — 집 주소 좌표(`geocodeAddress`)는 물러서지 않는다(집이 «면 중심»으로 조용히 저장되지 않게).
 * 원래 주소 글자로는 캐시에 아무것도 안 남긴다 — 같은 회사가 나중에 카카오에 오르면 제 좌표를 받는다.
 */
const MARK = `${[...String(Date.now() % 100000)].map(d => 'ABCDEFGHIJ'[+d]).join('')}`;
const COMPANY = `경기 이천시 마장면 강동케이앤드에스${MARK}`;
const AREA = '경기 이천시 마장면';
const realFetch = global.fetch;
const reply = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });
/** 카카오 흉내 — 읍면동 글자의 주소 검색에만 면 중심을 준다 */
const kakao = ((url: string) => {
    const q = decodeURIComponent(url.split('query=')[1] ?? '');
    return url.includes('/address.json') && q === AREA
        ? reply({ documents: [{ x: '127.357967', y: '37.248929', address_name: AREA, road_address: null }] })
        : reply({ documents: [] });
}) as any;

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
beforeEach(() => { global.fetch = kakao; });
afterAll(() => {
    global.fetch = realFetch;
    db.prepare(`DELETE FROM geocode_cache WHERE query LIKE ? OR query = ?`).run(`%${MARK}%`, AREA);
});

describe('📍 읍면동 중심으로 물러서기', () => {
    it('🔴 읍·면·동·리·가로 끝나는 마지막 낱말까지 자른다', () => {
        expect(areaPrefixOf(COMPANY)).toBe(AREA);
        expect(areaPrefixOf('경기 성남시 분당구 운중동 22,099')).toBe('경기 성남시 분당구 운중동');
        expect(areaPrefixOf('강동케이앤드에스 물류센터')).toBeNull();
        expect(areaPrefixOf(AREA)).toBeNull();                  // 원래 글과 같으면 물러설 곳이 아니다
    });

    it('🔴 회사 이름을 못 찾으면 면 중심 좌표 + 대략 표시', async () => {
        const r = await geocodeCallAddress(COMPANY);
        expect(r).toMatchObject({ x: 127.357967, y: 37.248929, approxArea: AREA });
    });

    it('🔴 원래 주소 글자로는 캐시에 안 남는다', async () => {
        await geocodeCallAddress(COMPANY);
        expect(db.prepare(`SELECT COUNT(*) AS n FROM geocode_cache WHERE query LIKE ?`).get(`%${MARK}%`).n).toBe(0);
    });

    it('🔴 읍면동 낱말이 없는 글은 지금처럼 실패', async () => {
        expect(await geocodeCallAddress(`강동케이앤드에스${MARK} 물류센터`)).toBeNull();
    });

    it('🔴 집 주소 좌표(geocodeAddress)는 물러서지 않는다', async () => {
        expect(await geocodeAddress(COMPANY)).toBeNull();
    });
});

describe('📍 판정 딱지', () => {
    it('🔴 상차·하차 어느 쪽이 대략인지 기사님 말로', () => {
        expect(approxTagsOf({ pickupApprox: '마장면' })).toEqual(['주소 대략 — 상차 마장면 중심']);
        expect(approxTagsOf({ pickupApprox: '마장면', dropoffApprox: '운중동' }))
            .toEqual(['주소 대략 — 상차 마장면 중심', '주소 대략 — 하차 운중동 중심']);
        expect(approxTagsOf({})).toEqual([]);
    });
});

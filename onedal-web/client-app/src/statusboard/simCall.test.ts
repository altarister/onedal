import { describe, expect, it } from 'vitest';
import { fareOf, placeFromFound, regionOfAddress, sentNoteOf, simCallBody } from './simCall';

/**
 * 🚚 **개별콜 — 현황판이 내는 콜 모양** (`simCall.ts` 머리).
 * 동 이름은 시뮬레이터 목록에 찍히고 폰 원달앱이 그 글자로 거른다 — 틀리게 뽑으면 필터 시험이 헛것이 된다.
 */
describe('개별콜 — 주소에서 동·읍·면', () => {
    it.each([
        ['경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', '초월읍'],
        ['경기 이천시 신둔면 도자예술로 72', '신둔면'],
        ['경기 이천시 관고동 107-5 이천제일식자재마트', '관고동'],
        ['경기 성남시 분당구 서현1동 247', '서현1동'],
        ['서울 강남구 삼성2동 159', '삼성2동'],
        ['서울 중구 을지로3가 12', '을지로3가'],
    ])('%s → %s', (address, region) => {
        expect(regionOfAddress(address)).toBe(region);
    });

    it('🔴 동·읍·면이 없으면 null — 지어내지 않는다 (규칙 ④)', () => {
        expect(regionOfAddress('경기 광주시 경충대로 907')).toBeNull();
        expect(regionOfAddress('초월읍')).toBeNull();                       // 시·도, 시·군·구 없이 동만 — 어느 초월읍인지 모른다
        expect(regionOfAddress('경기 광주시 경충대로 907 101동')).toBeNull(); // 건물 동은 동 이름이 아니다
        expect(regionOfAddress('')).toBeNull();
    });

    it('동 이름이 없는 주소는 콜 자리가 못 된다 — 다시 적게 한다', () => {
        const r = placeFromFound({ address: '경기 광주시 경충대로 907', lon: 127.31, lat: 37.36 });
        expect(r.ok).toBe(false);
        const ok = placeFromFound({ address: ' 경기 광주시 초월읍 경충대로 907 ', lon: 127.31, lat: 37.36 });
        expect(ok).toEqual({ ok: true, place: { addressDetail: '경기 광주시 초월읍 경충대로 907', region: '초월읍', lon: 127.31, lat: 37.36 } });
    });
});

describe('개별콜 — 요금과 몸통', () => {
    it('요금은 쉼표·빈칸을 떼고 1 이상의 정수만', () => {
        expect(fareOf('50,000')).toBe(50000);
        expect(fareOf(' 9 900 ')).toBe(9900);
        expect(fareOf('0')).toBeNull();
        expect(fareOf('5만')).toBeNull();
        expect(fareOf('1.5')).toBeNull();
        expect(fareOf('')).toBeNull();
    });

    it('상차지·하차지·요금이 다 있어야 낸다', () => {
        const p = { addressDetail: '경기 광주시 초월읍 경충대로 907', region: '초월읍', lon: 127.31, lat: 37.36 };
        const d = { addressDetail: '경기 이천시 신둔면 도자예술로 72', region: '신둔면', lon: 127.4, lat: 37.3 };
        expect(simCallBody(null, d, '50000').ok).toBe(false);
        expect(simCallBody(p, null, '50000').ok).toBe(false);
        expect(simCallBody(p, d, '').ok).toBe(false);
        expect(simCallBody(p, d, '50,000')).toEqual({ ok: true, body: { pickup: p, dropoff: d, fare: 50000 } });
    });
});

describe('개별콜 — 낸 뒤 한 줄은 시뮬레이터가 켜져 있나를 말한다', () => {
    it('한 번도 안 물었으면 경고', () => {
        expect(sentNoteOf(3, null).ok).toBe(false);
    });
    it('오래 안 물었으면 경고 · 몇 초째인지', () => {
        const n = sentNoteOf(3, 25_000);
        expect(n.ok).toBe(false);
        expect(n.text).toMatch(/25초째/);
    });
    it('방금 물었으면 초록', () => {
        expect(sentNoteOf(3, 2_000)).toEqual({ ok: true, text: expect.stringMatching(/^✅ #3/) });
    });
});

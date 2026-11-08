import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { geocodeTargetOf, stopTextOf, stopQueryOf } from './pageRead';
import type { CallStop, TargetAppType } from '../index';

/**
 * 🏠 **이 정거장 글자 · 판정 글자** — `stopTextOf` 는 상세 주소가 먼저 · 없으면 목록 원문,
 * `stopQueryOf` 는 그 글자를 다듬은 판정 글자다. 지금 판정이 읽는 글자(`geocodeTargetOf` 에 원달앱이 다듬어 보낸 글자를 넣은 답)와 같아야 한다.
 * 못 잡는 것: 원달앱 짝 함수와 같은 답인지(공통 문제지는 원달앱 걸음 몫) · 실제 카카오 좌표.
 */
describe('🏠 stopTextOf', () => {
    it('상세만 · 목록만 · 둘 다 · 둘 다 없음', () => {
        expect(stopTextOf({ addressDetail: '  경기 광주시 초월읍 경충대로 907  ' })).toBe('경기 광주시 초월읍 경충대로 907');
        expect(stopTextOf({ listText: '초월읍' })).toBe('초월읍');
        expect(stopTextOf({ listText: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 907' })).toBe('경기 광주시 초월읍 경충대로 907');
        expect(stopTextOf({ listText: '초월읍', addressDetail: '  ' })).toBe('초월읍');
        expect(stopTextOf({})).toBe('');
        expect(stopTextOf(null)).toBe('');
    });
});

describe('📍 stopQueryOf — 지금 판정 글자와 같다', () => {
    it('인성 팝업 — 끝 괄호를 다듬는다', () => {
        const detail = '경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)';
        expect(stopQueryOf('insung', { listText: '안녕동', addressDetail: detail, customerName: '*레드캠프' }).text)
            .toBe(geocodeTargetOf('insung', { listText: '안녕동', addressDetail: detail }).text);
        expect(stopQueryOf('insung', { addressDetail: detail }).text).toBe('경기 화성시 안녕동 158-95');
        expect(stopQueryOf('insung', { addressDetail: '경기 화성시 안녕동 158-95(경기 화성시 안녕동)' }).text).toBe('경기 화성시 안녕동 158-95');
    });
    it('인성 목록만 — 약속 앞글자 · 뒷글자 · «@» 를 뗀다', () => {
        expect(stopQueryOf('insung', { listText: '@낼8:30/가산동' }).text).toBe('가산동');
        expect(stopQueryOf('insung', { listText: '10:20전/쌍림동' }).text).toBe('쌍림동');
        expect(stopQueryOf('insung', { listText: '내곡동/7시까지' }).text).toBe('내곡동');
        expect(stopQueryOf('insung', { listText: '가산동/오늘중' }).text).toBe('가산동');
    });
    it('픽커 목록 — 다듬을 것 없음', () => {
        expect(stopQueryOf('kakaopicker', { listText: '광주 송정' }).text)
            .toBe(geocodeTargetOf('kakaopicker', { listText: '광주 송정' }).text);
    });
    it('픽커 상세 — 번지 없는 주소에 상호를 잇는다(원달앱이 지금 이어 보내는 글자와 같다)', () => {
        expect(stopQueryOf('kakaopicker', { addressDetail: '경기 성남시 중원구 은행2동', customerName: '퓨전중화요리-궁' }).text)
            .toBe(geocodeTargetOf('kakaopicker', { addressDetail: '경기 성남시 중원구 은행2동 퓨전중화요리-궁' }).text);
    });
    it('플렉스 «@…/동» — 목록은 «수원 이의동» · 상세는 붙은 시 · 구를 띄우고 동만', () => {
        expect(stopQueryOf('isflex', { listText: '@낼08:20/수원이의동' }).text)
            .toBe(geocodeTargetOf('isflex', { listText: '수원 이의동' }).text);
        expect(stopQueryOf('isflex', { listText: '@낼08:20/수원이의동', addressDetail: '@경기 수원시영통구 @낼08:20/수원이의동' }).text)
            .toBe('경기 수원시 영통구 이의동');
        expect(stopQueryOf('isflex', { addressDetail: '서울 중구 10:20전/쌍림동' }).text).toBe('서울 중구 쌍림동');
    });
    it('번지 없는 주소 + 상호 → 잇기 · 번지가 있으면 · 상호가 이미 글자에 있으면 안 잇는다', () => {
        expect(stopQueryOf('insung', { addressDetail: '경기 용인시 처인구 백암면', customerName: '동아금속주름관' }).text)
            .toBe('경기 용인시 처인구 백암면 동아금속주름관');
        expect(stopQueryOf('insung', { addressDetail: '경기 광주시 초월읍 경충대로 907', customerName: '모다아울렛' }).text)
            .toBe('경기 광주시 초월읍 경충대로 907');
        expect(stopQueryOf('kakaopicker', { addressDetail: '경기 성남시 중원구 은행2동 퓨전중화요리-궁', customerName: '퓨전중화요리-궁' }).text)
            .toBe('경기 성남시 중원구 은행2동 퓨전중화요리-궁');
        expect(stopQueryOf('insung', { addressDetail: '경기 용인시 처인구 백암면' }).text).toBe('경기 용인시 처인구 백암면');
    });
    it('다시 찍을지 — geocodeTargetOf 와 같은 규칙(좌표가 없거나 찍은 글이 다르면)', () => {
        expect(stopQueryOf('insung', { listText: '초월읍' }).need).toBe(true);
        expect(stopQueryOf('insung', { listText: '초월읍', geo: { x: 127.2879, y: 37.3852 }, geoText: '초월읍' }).need).toBe(false);
        expect(stopQueryOf('insung', { listText: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 907', geo: { x: 127.2879, y: 37.3852 }, geoText: '초월읍' }).need).toBe(true);
    });
    it('promiseText 가 있으면 그 원문을 뗀다 — 글자 규칙이 못 가르는 붙은 약속도 · 원문이 글자에 없으면(픽커) 그대로', () => {
        expect(stopQueryOf('insung', { listText: '@낼8:30/가산동', promiseText: '@낼8:30' }).text).toBe('가산동');
        expect(stopQueryOf('insung', { listText: '내곡동/7시까지', promiseText: '7시까지' }).text).toBe('내곡동');
        expect(stopQueryOf('isflex', { addressDetail: '@경기 수원시영통구 @낼08:20/수원이의동', promiseText: '낼08:20' }).text).toBe('경기 수원시 영통구 이의동');
        expect(stopQueryOf('insung', { listText: '14시전쌍림동', promiseText: '14시전' }).text).toBe('쌍림동');
        expect(stopQueryOf('kakaopicker', { listText: '광주 송정', promiseText: '17:04까지 픽업' }).text).toBe('광주 송정');
    });
    it('promiseText 원문은 하나만 뗀다 — 붙은 글자가 있는 자리 먼저 · 상호 안의 같은 글자는 남긴다', () => {
        expect(stopQueryOf('insung', { listText: '예약/예약물류', promiseText: '예약' }).text).toBe('예약물류');
        expect(stopQueryOf('isflex', { addressDetail: '경기 광주시 예약물류센터 @예약/초월읍', promiseText: '예약' }).text).toBe('경기 광주시 예약물류센터 초월읍');
        expect(stopQueryOf('insung', { listText: '오포읍(14시전)', promiseText: '14시전' }).text).toBe('오포읍');
        expect(stopQueryOf('insung', { listText: '쌍림동14시전', promiseText: '14시전' }).text).toBe('쌍림동');
    });
    it('빈 정거장은 빈 글자', () => {
        expect(stopQueryOf('insung', null)).toEqual({ text: '', need: true });
    });
});

/**
 * 📍 **플렉스 판정 글자 문제지** — 공통 문제지 `pageReadCases.json` `stopQueryCases`(실물 수집 원문 · 상세 xml 칸)를 `stopQueryOf` 로 푼다.
 *    `expect` 는 맞는 답 · `appNow` 는 지금 원달앱 `IsflexAddress.clean` 답(견주기 기록) · `expect` 가 null 이면 원문이 잘려 모름이라 풀지 않는다.
 *    못 잡는 것: 원달앱 짝 함수가 같은 답인지(원달앱 걸음 몫) · 실제 카카오 좌표.
 */
describe('📍 stopQueryOf — 플렉스 판정 글자 문제지 (stopQueryCases)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, 'pageReadCases.json'), 'utf8')) as
        { stopQueryCases: Array<{ network: TargetAppType; side: 'pickup' | 'dropoff'; stop: CallStop; expect: string | null; appNow: string; rule: 'stopQueryOf' | 'promise' | 'addressCut'; why: string }> };
    const known = sheet.stopQueryCases.filter(c => c.expect !== null);
    it.each(known.map(c => [c.side, JSON.stringify(c.stop), c] as const))('%s %s', (_side, _stop, c) => {
        expect(stopQueryOf(c.network, c.stop).text).toBe(c.expect);
    });
});

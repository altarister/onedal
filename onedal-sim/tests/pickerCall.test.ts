import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateBaseCall } from '@altari/core-simulator';
import type { CallDraft } from '@altari/core-simulator';
import { formatPickerRegion, toPickerCall } from '@altari/ui-simulators';
import type { PickerCall } from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🧩 **픽커 콜 칸** (2026-09-14 · 카카오픽커_시뮬레이터.md §9 · 2단계 2-1)
 *
 * 픽커 화면이 읽을 칸을 공통 콜에 입힌다. 원달앱 픽커 파서가 기대는 글자꼴이 기준이다
 * (`KakaoPickerParser.kt` — 요금은 쉼표 든 숫자 · 물품 크기 · 태그 낱말 · 차종 축이 없다).
 */

describe('formatPickerRegion — 실물 02 에서 뽑은 줄임 규칙 (§9-2)', () => {
    it.each([
        ['경기 성남시 분당구 판교역로 235', '서현1동', '분당', '서현1'],
        ['경기 성남시 중원구 둔촌대로 83', '성남동', '중원', '성남'],
        ['경기 용인시 수지구 포은대로 536', '죽전3동', '수지', '죽전3'],
        ['경기 광주시 경안로 12', '신현동', '광주', '신현'],
        ['경기 과천시 중앙로 3', '중앙동', '과천', '중앙'],
        ['서울 강남구 테헤란로 521', '삼성2동', '강남', '삼성2'],
    ])('%s · %s → %s / %s', (addressDetail, region, city, dong) => {
        expect(formatPickerRegion(addressDetail, region)).toEqual({ city, dong });
    });

    it('동이 아닌 이름(도로명 등)은 그대로 둔다 — 지어내지 않는다', () => {
        expect(formatPickerRegion('경기 수원시 팔달구 덕영대로 924', '매산로')).toEqual({ city: '팔달', dong: '매산로' });
    });

    it('모르면 빈칸 — 0 이나 «미정»을 넣지 않는다', () => {
        expect(formatPickerRegion(undefined, undefined)).toEqual({ city: '', dong: '' });
    });
});

describe('toPickerCall — 공통 칸은 그대로, 픽커 칸만 더한다', () => {
    const config = { driverLon: 127.2553, driverLat: 37.4095, maxPickupKm: 15, minFare: 30000 };
    let drafts: CallDraft[] = [];
    let calls: PickerCall[] = [];
    // 시각을 고정한다 — 오더번호·상차 시각이 «지금»에서 나오므로 초가 넘어가면 같은 씨앗도 달라진다
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
        drafts = Array.from({ length: 40 }, (_, i) => generateBaseCall(config, undefined, seededRandom(1000 + i))!);
        calls = drafts.map((d, i) => toPickerCall(d, { minFare: config.minFare }, seededRandom(2000 + i)));
    });
    afterAll(() => { vi.useRealTimers(); });

    it('공통 칸(주소·좌표·거리·시각·id)을 한 칸도 안 바꾼다', () => {
        calls.forEach((c, i) => {
            const { net, itemSize, pickerTags, prepMinutes, reservedAt, deliveryFee, promotion, orderNo, fare, ...common } = c;
            void [net, itemSize, pickerTags, prepMinutes, reservedAt, deliveryFee, promotion, orderNo, fare];
            expect(common).toEqual(drafts[i]);
        });
    });

    it('최종 수익 = 배송비 + 프로모션 (실물 07)', () => {
        calls.forEach(c => expect(c.fare).toBe(c.deliveryFee + c.promotion));
    });

    it('🔴 요금은 1,000 이상 — 원달앱은 쉼표 든 숫자만 요금으로 본다 (`^\\d{1,3}(,\\d{3})+$`)', () => {
        calls.forEach(c => expect(c.fare.toLocaleString('ko-KR')).toMatch(/^\d{1,3}(,\d{3})+$/));
    });

    it('차종 칸이 없다 — 픽커는 물품 크기가 대신한다', () => {
        calls.forEach(c => expect('vehicleType' in c).toBe(false));
    });

    it('물품 크기와 태그는 원달앱이 아는 낱말만 쓴다', () => {
        const itemSizes = ['초소형', '소형', '중형', '대형', '특대형'];
        const tagWords = ['퀵', '도보', '한차', '급송', '단거리', '예약', '준비 완료', '반나절', '승', '내일', '오늘', '서포트모드', '착불'];
        calls.forEach(c => {
            expect(itemSizes).toContain(c.itemSize);
            expect(c.pickerTags[0]).toBe('퀵');
            c.pickerTags.forEach(t => expect(tagWords).toContain(t));
            expect(c.net).toBe('kakaopicker');
        });
    });

    it('준비 시간은 «준비 완료»(null) 이거나 1분 이상', () => {
        calls.forEach(c => { if (c.prepMinutes !== null) expect(c.prepMinutes).toBeGreaterThanOrEqual(1); });
        expect(calls.some(c => c.prepMinutes === null)).toBe(true);
        expect(calls.some(c => c.prepMinutes !== null)).toBe(true);
    });

    it('오더번호는 숫자 15자리 (실물 20 · 23)', () => {
        calls.forEach(c => expect(c.orderNo).toMatch(/^\d{15}$/));
    });

    it('같은 씨앗이면 같은 콜', () => {
        expect(toPickerCall(drafts[0], { minFare: 30000 }, seededRandom(2000))).toEqual(calls[0]);
    });
});

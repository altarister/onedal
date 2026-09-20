import { readFileSync } from 'fs';
import { join } from 'path';
import { computePickerAlarmMinFare, APP_FILTER_KEYS } from '@onedal/shared';

/**
 * 🔔 픽커 알람 요금 하한 — 단가표·콜할인율에서 파생
 *
 * 카카오픽커는 리스트에 배송거리가 없으나, 기사님의 콜할인율(0%·-10%·-20%·-30%·전부)에 따라
 * 알람 요금 하한이 연동되어 자동으로 조절되어야 한다.
 * 할인율이 100%("전부")면 금액 무관(0원)으로 모든 콜이 알람 통과해야 한다.
 */
describe('픽커 알람 요금 하한 — 콜할인율 연동 셈', () => {
    const BASE = 10000;

    it('시세 (0% 할인)이면 기본 하한 10,000원 그대로 유지된다', () => {
        expect(computePickerAlarmMinFare(BASE, 0)).toBe(10000);
    });

    it('-10% 할인이면 9,000원으로 내려간다', () => {
        expect(computePickerAlarmMinFare(BASE, 10)).toBe(9000);
    });

    it('-20% 할인이면 8,000원으로 내려간다', () => {
        expect(computePickerAlarmMinFare(BASE, 20)).toBe(8000);
    });

    it('-30% 할인이면 7,000원으로 내려간다', () => {
        expect(computePickerAlarmMinFare(BASE, 30)).toBe(7000);
    });

    it('전부 (100% 할인)이면 0원 (금액 무관 통과)이다', () => {
        expect(computePickerAlarmMinFare(BASE, 100)).toBe(0);
    });

    it('앱이 Int로 파싱하므로 결과는 항상 정수여야 한다', () => {
        const res = computePickerAlarmMinFare(9999, 15);
        expect(Number.isInteger(res)).toBe(true);
    });
});

describe('픽커 알람 요금 하한 — scrap.ts 계약', () => {
    it('pickerAlarmMinFare는 APP_FILTER_KEYS에 등록되어 앱으로 전송된다', () => {
        expect(APP_FILTER_KEYS).toContain('pickerAlarmMinFare');
    });

    it('scrap.ts는 computePickerAlarmMinFare를 통해 콜할인율을 반영하여 조립한다', () => {
        const scrapCode = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrapCode).toMatch(/computePickerAlarmMinFare/);
    });
});

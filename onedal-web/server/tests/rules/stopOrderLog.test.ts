// @ts-nocheck
import * as fileLogger from '../../src/utils/fileLogger';
import { planMergedStops } from '../../src/services/routeComposer';

/**
 * 🧭 **순서 판단 줄은 어느 계획 · 어느 콜인지 말한다** (onedal-69 «③ 가» · 10-02 09:40:03 경로 이상 되짚기).
 *    한 판정이 계획을 둘 짠다 — 후보를 넣은 «합짐»과 후보 없이 잡은 콜만의 «기준». 그날 두 줄이 한 판단처럼 읽혔고,
 *    이름이 콜 번호 앞 6글자라 «MANUAL»끼리 못 갈랐다. 이제 줄 머리에 계획 · 이름에 콜 번호 끝 6자리와 동 이름(가까운 법정동 · 시군구 함께)을 붙이고,
 *    «바뀔 때만 찍기» 기억을 계획마다 따로 둔다 — 한 기억을 같이 쓰면 두 계획이 번갈아 «바뀜»이 되어 매번 찍힌다.
 */
/** 그날 좌표 그대로 — ① 문정2동 → 반포1동(잡은 콜 · 카카오에 보낸 순번 있음) · ③ 광남1동 → 양재1동(후보) · 기점 집(경기 광주) */
const HOME = { x: 127.29444, y: 37.37669 };
const kept = {
    id: 'MANUAL-1790901422218', status: 'ORDER_CONFIRMED',
    pickupX: 127.110912, pickupY: 37.489895, dropoffX: 127.013377, dropoffY: 37.505091,
    sectionStops: [{ orderId: 'MANUAL-1790901422218', stopType: 'pickup' }, { orderId: 'MANUAL-1790901422218', stopType: 'dropoff' }],
} as any;
const extra = {
    id: 'MANUAL-1790901602138', status: 'ORDER_SECURED_EVALUATING',
    pickupX: 127.228933, pickupY: 37.394351, dropoffX: 127.026729, dropoffY: 37.471639,
} as any;
const orderLines = (spy: jest.SpyInstance) => spy.mock.calls.map(c => String(c[1])).filter(l => l.includes('🧭 [순서 판단'));

describe('🧭 순서 판단 줄', () => {
    it('🔴 합짐 → 기준 → 합짐 → 기준 — 같은 입력이면 계획마다 한 번씩만 찍는다(두 줄)', () => {
        const spy = jest.spyOn(fileLogger, 'slog').mockImplementation(() => {});
        for (let i = 0; i < 2; i++) { planMergedStops([kept], extra, HOME, null); planMergedStops([kept], null, HOME, null); }
        expect(orderLines(spy)).toHaveLength(2);
        spy.mockRestore();
    });
    it('🔴 줄이 계획(합짐/기준) · 콜 번호 끝 6자리 · 동 이름을 말한다', () => {
        const spy = jest.spyOn(fileLogger, 'slog').mockImplementation(() => {});
        planMergedStops([{ ...kept, id: 'MANUAL-X1' , sectionStops: [{ orderId: 'MANUAL-X1', stopType: 'pickup' }, { orderId: 'MANUAL-X1', stopType: 'dropoff' }] }], { ...extra, id: 'MANUAL-X2' }, HOME, null);
        const [line] = orderLines(spy);
        expect(line).toMatch(/\[순서 판단 · 합짐\]/);
        expect(line).toMatch(/-X2상차\(광주시 장지동\)/);   // 광남1동(행정동) 점이 든 법정동 — 시군구를 함께 적어 서울 송파 장지동과 갈린다
        expect(line).not.toMatch(/MANUAL상차/);
        spy.mockRestore();
    });
    it('판정 무변화 — 카카오에 보낼 순번은 그날과 같다(광남 상차 → 문정 상차 → 양재 하차 → 반포 하차)', () => {
        const plan = planMergedStops([kept], extra, HOME, null)!;
        expect(plan.orderedStops.map(s => `${s.orderId.slice(-6)}${s.stopType}`)).toEqual(['602138pickup', '422218pickup', '602138dropoff', '422218dropoff']);
        const base = planMergedStops([kept], null, HOME, null)!;
        expect(base.orderedStops.map(s => `${s.orderId.slice(-6)}${s.stopType}`)).toEqual(['422218pickup', '422218dropoff']);
    });
});

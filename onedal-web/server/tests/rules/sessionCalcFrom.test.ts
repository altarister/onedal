// @ts-nocheck
import { baseFilterFromDb, baseFilterFrom, busyCountsFrom } from '../../src/state/userSessionStore';
import { filterValuesFrom } from '@onedal/shared';
import { emergencyTargetFrom, emergencyAlertFrom } from '../../src/routes/emergency';
import { foldRemainMsFrom, phoneDecisionsFrom } from '../../src/state/decisions';
import { blindSignalFrom, leftDetailFrom, deadmanFrom, filteringDeviceFrom } from '../../src/state/deviceSessions';

/**
 * 🧮 **세션 · 기기 · 결재 · 비상 보고의 셈** — 평소 설정 한 줄 읽기를 동작으로, 나머지는 값만 받는 셈(세션 · DB · 지금 시각 없이)으로 문다.
 */
describe('🎛️ 평소 설정 — user_filters 한 줄을 읽는다', () => {
    it('🔴 오늘 판 칸 셋 · 노선/동선 · 예약 · 제외 지역을 줄에서 읽는다 — 재접속에 안 풀린다', () => {
        const f = baseFilterFromDb('u-base-filter', {
            min_fare: 30000.4, max_fare: 900000, excluded_keywords: '[]', is_active: 1,
            radius_auto: 1, radius_base_km: 7, accepted_vehicle_types: '["1t","다마스"]',
            route_mode: 0, reservation_mode: 'tomorrowToo', excluded_regions: '["R|x"]',
        });
        expect(f).toMatchObject({
            radiusAuto: true, radiusBaseKm: 7, acceptedVehicleTypes: ['1t', '다마스'],
            routeMode: false, reservationMode: 'tomorrowToo', minFare: 30000, isActive: true, excludedRegions: ['R|x'],
        });
    });

    it('🔴 옛 줄(NULL) — 반경 기준은 «모른다» · 노선이 기본 · 오늘 콜만', () => {
        const f = baseFilterFromDb('u-base-filter', {
            min_fare: 1, max_fare: 2, radius_auto: 0, radius_base_km: null, accepted_vehicle_types: null, route_mode: null, reservation_mode: null,
        });
        expect(f.radiusBaseKm).toBeUndefined();
        expect(f).toMatchObject({ radiusAuto: false, routeMode: true, reservationMode: 'today', acceptedVehicleTypes: [] });
    });

    it('🔴 줄이 없으면(신규) 서비스 권장 기본값', () => {
        expect(baseFilterFromDb('u-base-filter', null)).toMatchObject({ minFare: 30000, maxFare: 1000000, isActive: false });
    });
});

describe('🎛️ 평소 설정 · 바쁨 — 값만 받는 셈', () => {
    it('🔴 줄과 국면 표 조각만으로 평소 설정을 낸다 — 줄이 없으면 서비스 권장 기본값', () => {
        const patch = filterValuesFrom(null);
        const f = baseFilterFrom({ min_fare: 25000, max_fare: 500000, is_active: 0, route_mode: 1, agency_fee_percent: 23 }, patch);
        expect(f).toMatchObject({ minFare: 25000, maxFare: 500000, isActive: false, routeMode: true, callDiscountPct: patch.callDiscountPct });
        expect(f.ratePerKm).toBeTruthy();
        expect(baseFilterFrom(null, patch)).toMatchObject({ minFare: 30000, callDiscountPct: patch.callDiscountPct });
    });

    it('🔴 바쁨은 세션마다 진행 중 콜 · 심사 중 · 결재 · 기다림을 더한다 — 끝난 콜은 안 센다', () => {
        const s = (live: string[], ev: number, dec: number, w: number) => ({
            myOrders: live.map((status, i) => ({ id: `c${i}`, status })),
            pendingOrdersData: new Map(Array.from({ length: ev }, (_, i) => [`p${i}`, {}])),
            pendingDecisions: new Map(Array.from({ length: dec }, (_, i) => [`d${i}`, {}])),
            entries: new Map(Array.from({ length: w }, (_, i) => [`w${i}`, {}])),
        });
        expect(busyCountsFrom([s(['ORDER_CONFIRMED', 'ORDER_DELIVERED'], 1, 0, 2), s(['ORDER_PICKED_UP', 'SAFE_CANCEL'], 0, 1, 0)]))
            .toEqual({ live: 2, evaluating: 1, decisions: 1, waits: 2 });
        expect(busyCountsFrom([])).toEqual({ live: 0, evaluating: 0, decisions: 0, waits: 0 });
    });
});

describe('🚨 비상 보고 — 값만 받는 셈', () => {
    const pending = [['o1', { capturedDeviceId: 'devA' }], ['o2', { capturedDeviceId: 'devB' }]] as any;

    it('🔴 보고에 콜이 있으면 그 콜 · 비었거나 «unknown» 이면 그 폰이 잡은 심사 중 콜 · 못 찾으면 보고 그대로', () => {
        expect(emergencyTargetFrom('o9', pending, 'devB')).toBe('o9');
        expect(emergencyTargetFrom('unknown', pending, 'devB')).toBe('o2');
        expect(emergencyTargetFrom('', pending, 'devA')).toBe('o1');
        expect(emergencyTargetFrom('unknown', pending, 'devZ')).toBe('unknown');
    });

    it('🔴 알림은 가리킨 콜로 · 화면 글은 300자까지 · 보고 시각이 없으면 지금 시각', () => {
        const report = { deviceId: 'devA', orderId: 'unknown', reason: 'UNKNOWN_SCREEN', screenContext: 'LIST', screenText: 'x'.repeat(400), timestamp: '' } as any;
        const a = emergencyAlertFrom(report, 'o1', '2026-10-07T01:00:00.000Z');
        expect(a).toMatchObject({ deviceId: 'devA', orderId: 'o1', reason: 'UNKNOWN_SCREEN', screenContext: 'LIST', timestamp: '2026-10-07T01:00:00.000Z' });
        expect(a.screenText.length).toBe(300);
        expect(emergencyAlertFrom({ ...report, timestamp: 'T0' }, 'o1', 'T1').timestamp).toBe('T0');
    });
});

describe('⚖️ 결재 줄 · 빨리 접기 — 값만 받는 셈', () => {
    it('🔴 접기 초와 판정 끝이 다 있어야 남은 ms 를 낸다 · 지났으면 0 · 반올림', () => {
        expect(foldRemainMsFrom({ foldAfterSec: 3, judgeUntil: 10_000.4 }, 7_000)).toBe(3000);
        expect(foldRemainMsFrom({ foldAfterSec: 3, judgeUntil: 5_000 }, 7_000)).toBe(0);
        expect(foldRemainMsFrom({ foldAfterSec: null, judgeUntil: 10_000 }, 7_000)).toBeUndefined();
        expect(foldRemainMsFrom({ foldAfterSec: 3 }, 7_000)).toBeUndefined();
        expect(foldRemainMsFrom(undefined, 7_000)).toBeUndefined();
    });

    it('🔴 그 콜을 쥔 폰마다 한 줄 · 행동이 없으면 없다 · 접기 ms 가 없으면 칸도 없다', () => {
        const ev = new Map([['devA', 'o1'], ['devB', 'o2'], ['devC', 'o1']]);
        expect(phoneDecisionsFrom('o1', 'KEEP', 1200, ev)).toEqual([
            { deviceId: 'devA', orderId: 'o1', action: 'KEEP', foldMs: 1200 },
            { deviceId: 'devC', orderId: 'o1', action: 'KEEP', foldMs: 1200 },
        ]);
        expect(phoneDecisionsFrom('o2', 'CANCEL', undefined, ev)).toStrictEqual([{ deviceId: 'devB', orderId: 'o2', action: 'CANCEL' }]);
        expect(phoneDecisionsFrom('o1', null, 1200, ev)).toEqual([]);
    });
});

describe('📱 기기 — 값만 받는 셈', () => {
    it('🔴 화면 못 읽음 — 꺼진 화면은 고장이 아니다 · 노드를 모르면 그대로 · 노드가 오면 되찾음 · 0 이면 처음 한 번만 시작 시각', () => {
        expect(blindSignalFrom({ blindSince: 5 }, 0, false, 100)).toStrictEqual({ patch: { isScreenOn: false, blindSince: undefined }, event: null });
        expect(blindSignalFrom({ isScreenOn: false, blindSince: 5 }, 0, undefined, 100)).toStrictEqual({ patch: { blindSince: undefined }, event: null });
        expect(blindSignalFrom({ blindSince: 5 }, undefined, true, 100)).toStrictEqual({ patch: { isScreenOn: true }, event: null });
        expect(blindSignalFrom({ blindSince: 5 }, 12, undefined, 100)).toStrictEqual({ patch: { screenNodeCount: 12, blindSince: undefined }, event: 'recovered' });
        expect(blindSignalFrom({}, 12, undefined, 100)).toStrictEqual({ patch: { screenNodeCount: 12, blindSince: undefined }, event: null });
        expect(blindSignalFrom({}, 0, undefined, 100)).toStrictEqual({ patch: { screenNodeCount: 0, blindSince: 100 }, event: 'started' });
        expect(blindSignalFrom({ blindSince: 40 }, 0, true, 100)).toStrictEqual({ patch: { isScreenOn: true, screenNodeCount: 0 }, event: null });
    });

    it('🔴 상세를 떠났나 — 화면을 모르면 떠남 · 상세는 안 떠남 · 스치는 화면은 5초 이어져야 떠남 · 그 밖은 떠남', () => {
        expect(leftDetailFrom(undefined, undefined, 0)).toBe(true);
        expect(leftDetailFrom('DETAIL_PRE_CONFIRM', 1, 999_999)).toBe(false);
        expect(leftDetailFrom('UNKNOWN', 10_000, 14_999)).toBe(false);
        expect(leftDetailFrom('UNKNOWN', 10_000, 15_000)).toBe(true);
        expect(leftDetailFrom('TRANSITION', undefined, 99_999)).toBe(false);
        expect(leftDetailFrom('LIST', undefined, 0)).toBe(true);
    });

    it('🔴 끊김은 마지막 보고에서 150초를 넘었을 때', () => {
        expect(deadmanFrom(0, 150_000)).toBe(false);
        expect(deadmanFrom(0, 150_001)).toBe(true);
    });

    it('🔴 필터를 거는 폰 — 이 기사님 폰 가운데 자동 · 알람 · 시뮬레이션이 하나라도', () => {
        const d = (deviceId: string, mode: string) => ({ deviceId, mode });
        expect(filteringDeviceFrom([d('a', 'MANUAL'), d('b', 'ALARM')], ['a', 'b'])).toBe(true);
        expect(filteringDeviceFrom([d('a', 'MANUAL'), d('x', 'AUTO')], ['a'])).toBe(false);
        expect(filteringDeviceFrom([d('a', 'SIMULATION')], ['a'])).toBe(true);
        expect(filteringDeviceFrom([d('a', 'AUTO')], ['a'])).toBe(true);
        expect(filteringDeviceFrom([], ['a'])).toBe(false);
    });
});

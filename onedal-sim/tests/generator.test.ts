import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREIGHT_OPTIONS, findMockEntry, generateBaseCall } from '@altari/core-simulator';
import { toHwamul24Call, toInsungCall } from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🎲 **콜 생성기와 배차망별 입히기 함수**
 *
 * 생성기(`generateBaseCall`)는 공통 칸만 만들고, 인성·화물24시가 각자 요금·차종·결제를 입힌다.
 * 난수를 뽑는 **순서**가 배차망마다 갈리므로 «콜 다섯 개 통째» 스냅숏 하나로는 볼 수 없다 —
 * 그래서 검사를 셋으로 나눈다:
 *   ① 주소·좌표·거리는 씨앗마다 **똑같다** — `commonFields.test.ts`
 *   ② 요금·차종·결제는 **정해진 범위 안**이다 (하한 이상 · 천 원 단위 · 정해진 선택지) — 여기
 *   ③ 화면 글자는 **한 글자도 안 바뀐다** — `screens.test.tsx` (고정 콜이라 난수 순서와 무관)
 */
const config = { driverLon: 127.294, driverLat: 37.3772, maxPickupKm: 15, minFare: 30000 };
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

describe('생성기 — 공통 칸만', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('같은 씨앗이면 같은 콜 다섯 개 (가른 뒤 기준)', () => {
        const run = () => { const rng = seededRandom(20260914); return Array.from({ length: 5 }, () => generateBaseCall(config, undefined, rng)); };
        const a = run();
        expect(run()).toEqual(a);
        expect(a).toMatchSnapshot();
    });

    it('🔴 공통 칸에는 배차망 칸이 없다 — 요금도 아직 없다 (지어낸 0 을 넣지 않는다 · 규칙 4)', () => {
        const draft = generateBaseCall(config, undefined, seededRandom(1))!;
        for (const k of ['fare', 'vehicleType', 'paymentType', 'billingType', 'companyName', 'itemDescription', 'isShared', 'isExpress', 'callCategory', 'status']) {
            expect(draft).not.toHaveProperty(k);
        }
    });

    it('난수를 안 넘기면 Math.random 을 쓴다', () => {
        const spy = vi.spyOn(Math, 'random');
        generateBaseCall(config);
        expect(spy).toHaveBeenCalled();
    });
});

describe('배차망별 입히기 — 예전 생성기와 같은 범위', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    const inOld = (c: { paymentType?: string; billingType?: string; vehicleType?: string; itemDescription?: string; companyName?: string }) => {
        expect(FREIGHT_OPTIONS.payment).toContain(c.paymentType);
        expect(FREIGHT_OPTIONS.billing).toContain(c.billingType);
        expect(FREIGHT_OPTIONS.vehicle).toContain(c.vehicleType);
        expect(FREIGHT_OPTIONS.item).toContain(c.itemDescription);
        expect(FREIGHT_OPTIONS.company).toContain(c.companyName);
    };

    it('인성 — 요금은 하한 이상 · 천 원 단위 · 결제·차종 등은 예전 선택지 · 급송이면 분류도 급송', () => {
        for (const s of SEEDS) {
            const rng = seededRandom(s);
            const draft = generateBaseCall(config, undefined, rng)!;
            const call = toInsungCall(draft, { minFare: config.minFare }, rng);
            expect(call.fare).toBeGreaterThanOrEqual(config.minFare);
            expect(call.fare % 1000).toBe(0);
            inOld(call);
            expect(call.status).toBe('신규');
            if (call.isExpress) expect(call.callCategory).toBe('급송');
            else expect(['보통', '예약']).toContain(call.callCategory);
            expect(call.pickups).toEqual(draft.pickups);           // 공통 칸은 안 건드린다
            expect(call.distanceKm).toBe(draft.distanceKm);
        }
    });

    it('화물24시 — 요금은 하한 이상 · 천 원 단위 · 결제·차종 등은 예전 선택지', () => {
        for (const s of SEEDS) {
            const rng = seededRandom(s);
            const draft = generateBaseCall(config, undefined, rng)!;
            const call = toHwamul24Call(draft, { minFare: config.minFare }, rng);
            expect(call.fare).toBeGreaterThanOrEqual(config.minFare);
            expect(call.fare % 1000).toBe(0);
            inOld(call);
            expect(call.dropoffs).toEqual(draft.dropoffs);
        }
    });

    it('문제지 콜 — 정해진 요금·차종을 그대로 쓴다 (인성·화물24시 모두)', () => {
        const forced = { pickup: findMockEntry('초월')!, dropoff: findMockEntry('분당')!, fare: 45000, vehicleType: '승용차' };
        const draft = generateBaseCall(config, forced, seededRandom(7))!;
        for (const call of [toInsungCall(draft, { minFare: config.minFare, forced }, seededRandom(7)), toHwamul24Call(draft, { minFare: config.minFare, forced }, seededRandom(7))]) {
            expect(call.fare).toBe(45000);
            expect(call.vehicleType).toBe('승용차');
        }
    });
});

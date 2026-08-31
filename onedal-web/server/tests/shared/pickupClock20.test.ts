import { deriveRouteTimeline, DEFAULT_DEADLINE_RULES } from '@onedal/shared';

/**
 * ⏱️ **상차 약속은 «콜 잡은 시각 + 20분»이다** (기사님 확정 2026-08-31)
 *
 * 기사님: *"첫짐 상차 약속 = 콜 잡은 시간으로부터 20분 안에 상차지 도착."*
 * 합짐도 같다 — 자기가 잡힌 시각으로부터 20분. 다만 **여유를 잴 때 빼는 것**은
 * 콜마다 다르다: 첫짐은 «현위치 → 첫짐 상차지», 합짐은 «현위치 → 첫짐 상차지 →
 * 첫짐 상차 정차 → 합짐 상차지»(체인).
 *
 * ── 무엇이 틀려 있었나 ──
 * 코드가 실제로 돌리던 식은 **`max(상차지 도착 예상, 콜 잡은 시각 + 30분)`** 이었다.
 * 이 식은 상차지 도착 예상이 «잡은 시각 + 30분»보다 늦기만 하면 **약속을 도착 예상과
 * 같게** 만든다 — 그래서 **상차 여유가 구조적으로 항상 0**이었다.
 * 2026-08-31 판정 원장에 «약속 최소 +0분»이 반복해 찍힌 것이 이 식 때문이다.
 * 게다가 `max` 가 음수를 0으로 눌러 **늦는다는 사실 자체가 화면에서 사라졌다.**
 *
 * 30분·60분은 «20분 룰»을 알기 전에 만든 가정치라 폐기한다 (기사님).
 * 우선순위는 **통화 약속 > 적요 상차 시각 > 콜 잡은 시각 + 20분** (용어집).
 */
const T = (h: number, m: number) => Date.parse(`2026-08-31T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);

const order = (over: object = {}) => ({
    id: 'A', status: 'ORDER_CONFIRMED',
    pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
    pickupX: 127.31, pickupY: 37.36, dropoffX: 127.38, dropoffY: 37.29,
    capturedAt: new Date(T(9, 0)).toISOString(),
    deliveryDistance: 10,
    ...over,
}) as any;

/** 정거장 하나 — 그 상차지까지 몇 분 걸리는가(누적)를 넣는다 */
const stops = (driveMinutes: number | null) =>
    ([{ orderId: 'A', stopType: 'pickup', driveMinutes }] as any);

const noReports = () => [] as any;
const noMilestones = () => [] as any;

/** 그 정거장의 약속 시각(ms) — 타임라인이 낸 값 */
function promisedAtMs(driveMinutes: number, nowH = 9, nowM = 0) {
    const tl = deriveRouteTimeline(
        stops(driveMinutes), [order()], noReports, noMilestones,
        T(nowH, nowM), new Date(T(nowH, nowM)).toISOString(),
        DEFAULT_DEADLINE_RULES, { pickupDwellMin: 15, dropoffDwellMin: 10 } as any,
    );
    const e = tl.find(x => x.stopType === 'pickup')!;
    return { promised: e.promisedUntil ? Date.parse(e.promisedUntil) : null, eta: e.etaMs };
}

describe('상차 약속 = 콜 잡은 시각 + 20분', () => {
    it('🔴 값의 근거는 20분 하나다 — 30분·60분 가정치는 없다', () => {
        expect(DEFAULT_DEADLINE_RULES.pickupPromiseMinutes).toBe(20);
        // 20분 룰을 모를 때의 가정치들 — 되살아나면 빨간불 (기사님 지시로 폐기)
        expect((DEFAULT_DEADLINE_RULES as any).pickupOffsetMinutes).toBeUndefined();
        expect((DEFAULT_DEADLINE_RULES as any).arrivalMarginMinutes).toBeUndefined();
        expect((DEFAULT_DEADLINE_RULES as any).deadlinePickupMinutes).toBeUndefined();
    });

    it('상차지까지 12분이면 약속은 9:20, 상차 여유는 +8분', () => {
        const { promised, eta } = promisedAtMs(12);
        expect(promised).toBe(T(9, 20));
        expect(eta).toBe(T(9, 12));
        expect(Math.round((promised! - eta!) / 60_000)).toBe(8);
    });

    it('🔴 상차지까지 25분이면 여유가 **−5분** — 늦는다는 사실이 드러나야 한다', () => {
        /**
         * 옛 식 `max(도착 예상, 잡은 시각+30분)` 은 이걸 «0분»으로 눌러 감췄다.
         * 늦는 것을 알아야 기사님이 상차지에 전화를 거신다 — 그게 이 값의 쓸모다.
         */
        const { promised, eta } = promisedAtMs(25);
        expect(promised).toBe(T(9, 20));
        expect(Math.round((promised! - eta!) / 60_000)).toBe(-5);
    });

    it('🔴 약속이 도착 예상을 따라가지 않는다 — 여유가 늘 0이던 병', () => {
        // 40분이든 60분이든 약속은 9:20 그대로. 예전엔 약속이 도착 예상을 따라가 여유가 0이었다
        for (const drive of [40, 60, 90]) {
            const { promised } = promisedAtMs(drive);
            expect(promised).toBe(T(9, 20));
        }
    });

    it('적요에 상차 시각이 있으면 그것이 이긴다 (예약콜) — 20분 룰보다 앞', () => {
        const tl = deriveRouteTimeline(
            stops(30), [order({ detailMemo: '11:00 상차' })], noReports, noMilestones,
            T(9, 0), new Date(T(9, 0)).toISOString(),
            DEFAULT_DEADLINE_RULES, { pickupDwellMin: 15, dropoffDwellMin: 10 } as any,
        );
        const e = tl.find(x => x.stopType === 'pickup')!;
        expect(Date.parse(e.promisedUntil!)).toBe(T(11, 0));
    });
});

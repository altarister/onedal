import { minRouteBuffer } from '@onedal/shared';

/**
 * 🧮 **버퍼의 진실은 최소값이다** (시간체계 ⑯-1 · 기사님 실측 2026-08-20)
 *
 * 12번+2번 리허설: 콜별 버퍼는 +60분인데 다른 콜 약속이 +6분이라, "여유 있구나"
 * 하고 잡으면 그 약속을 깬다. 화면이 예산으로 내미는 숫자는 **아직 안 간 정거장
 * 전부의 최소값** 하나다. 판정 재설계의 `bufferCost` 축도 이 값을 먹는다.
 */

const T0 = Date.parse('2026-08-21T04:00:00Z');
const min = (m: number) => T0 + m * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const entry = (over: object) => ({
    orderId: 'A', stopType: 'pickup', etaMs: null, dwellMinutes: 0,
    driveMinutes: null, leadMinutes: 0, promisedUntil: null, promiseConfirmed: false,
    segmentDriveMinutes: null, departPrevMs: null, departByMs: null,
    lateMinutes: 0, arrived: false, ...over,
} as any);

describe('minRouteBuffer — 콜별 +60 이 아니라 +6 이 진실', () => {
    it('🔴 여러 정거장 중 가장 빡빡한 약속 하나를 고른다', () => {
        const b = minRouteBuffer([
            entry({ orderId: 'A', etaMs: min(10), promisedUntil: iso(min(70)) }),   // +60
            entry({ orderId: 'B', stopType: 'dropoff', etaMs: min(30), promisedUntil: iso(min(36)) }), // +6
        ]);
        expect(b).toEqual({ minutes: 6, firm: false, orderId: 'B', stopType: 'dropoff' });
    });

    it('지나간 정거장은 안 센다 — 그 약속은 이미 결판났다', () => {
        const b = minRouteBuffer([
            entry({ orderId: 'A', etaMs: min(10), promisedUntil: iso(min(12)), arrived: true }),  // +2 지만 지나감
            entry({ orderId: 'B', etaMs: min(30), promisedUntil: iso(min(70)) }),
        ]);
        expect(b!.orderId).toBe('B');
        expect(b!.minutes).toBe(40);
    });

    it('약속이나 예상을 모르는 정거장은 건너뛴다 — 지어내지 않는다 (규칙 ④)', () => {
        const b = minRouteBuffer([
            entry({ orderId: 'A', etaMs: null, promisedUntil: iso(min(5)) }),       // 예상 없음
            entry({ orderId: 'B', etaMs: min(30), promisedUntil: null }),           // 약속 없음 (합짐 하차)
        ]);
        expect(b).toBeNull();
    });

    it('음수도 그대로 — 못 지키는 약속은 숨기지 않는다', () => {
        const b = minRouteBuffer([entry({ etaMs: min(30), promisedUntil: iso(min(20)) })]);
        expect(b!.minutes).toBe(-10);
    });

    it('묶는 약속이 통화로 굳었으면 firm — 화면의 ~ 여부', () => {
        const b = minRouteBuffer([
            entry({ orderId: 'A', etaMs: min(10), promisedUntil: iso(min(20)), promiseConfirmed: true }),
            entry({ orderId: 'B', etaMs: min(10), promisedUntil: iso(min(60)) }),
        ]);
        expect(b!.firm).toBe(true);
        expect(b!.minutes).toBe(10);
    });
});

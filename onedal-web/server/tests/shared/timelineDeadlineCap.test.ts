import { deriveRouteTimeline } from '@onedal/shared';

/**
 * ⏱️ **타임라인도 두 시계다** (시간체계 ⑯ · 기사님 확정 2026-08-21)
 *
 * 시딩(d257f90)은 두 시계로 갔는데 타임라인이 옛 식(예상+여유30 · 잡은-기산 캡)이면
 * 카운트다운·덱이 새 시트와 **또 두 목소리**를 낸다. 추정을 만드는 규칙은 하나다:
 *
 *   상차 추정 약속 = max(도착 예상, 상차 시계)     상차 시계 = 적요 상차 시각 > 잡음+잠정 30
 *   하차 추정 약속 = 배달 데드라인                 데드라인 = 상차 완료(실제/예정) + 배송×150%
 *   배송 주행을 모르면(합짐) 하차 추정 없음 — 지어내지 않는다 (규칙 ④)
 *   🔴 통화로 굳힌 약속(DECLARED)은 어느 쪽도 안 깎는다 — 화주 합의가 면책
 */

const ANCHOR = '2026-08-21T05:55:00Z';          // KST 14:55
const NOW = Date.parse(ANCHOR);
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

// 리허설 12 의 모형 — 접근 11분 · 배송 25분 · 상차 정차(미확인) 15분
const stops = [
    { orderId: 'S', stopType: 'pickup', driveMinutes: 11 },
    { orderId: 'S', stopType: 'dropoff', driveMinutes: 36 },
] as any;
const order = (over: object = {}) => ([{
    id: 'S', capturedAt: ANCHOR,
    totalDurationMin: 36, kakaoSoloDurationMin: 25, ...over,
}] as any);

const run = (orders = order(), reportsOf: (id: string) => any = () => [],
             milestonesOf: (id: string) => any = () => []) =>
    deriveRouteTimeline(stops, orders, reportsOf, milestonesOf, NOW, ANCHOR);

describe('타임라인 두 시계 — 추정 약속의 규칙은 하나다', () => {
    it('🔴 상차 추정 약속 = max(도착 예상, 잡음+30) — 여유30 이 아니다', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        // 예상 15:06 · 시계 15:25 → 15:25 (옛 식이면 15:36 이었다)
        expect(kst(Date.parse(p.promisedUntil!))).toBe('15:25');
        expect(p.promiseConfirmed).toBe(false);
    });

    it('🔴 접근이 시계를 넘으면 약속 = 도착 예상 (불가능한 약속 금지 — 캡 바닥)', () => {
        const tl = deriveRouteTimeline(
            [{ orderId: 'S', stopType: 'pickup', driveMinutes: 75 },
             { orderId: 'S', stopType: 'dropoff', driveMinutes: 100 }] as any,
            order({ totalDurationMin: 100 }), () => [], () => [], NOW, ANCHOR);
        const p = tl.find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('16:10');   // 예상(+75) 그대로
    });

    it('🔴 적요의 상차 시각이 상차 시계를 대체한다 (소숙 콜③ 예약)', () => {
        const p = run(order({ detailMemo: '16:00상차 예약' })).find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('16:00');   // 잡음+30(15:25)이 아니라 적요
    });

    it('🔴 하차 추정 약속 = 배달 데드라인 (상차 완료 예정 + 배송×150%)', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        // 상차 약속 15:25 + 정차 15 = 완료 15:40 · + 25×1.5 = 16:17:30
        expect(kst(Date.parse(d.promisedUntil!))).toBe('16:17');
    });

    it('🔴 상차를 실제로 마쳤으면 데드라인은 실측 기산 (두 시계의 기산점)', () => {
        const ms = () => ([{ milestone: 'PICKED_UP', occurredAt: '2026-08-21T06:30:00Z' }] as any);
        const d = run(order(), () => [], ms).find(e => e.stopType === 'dropoff')!;
        // 데드라인 = 실은 15:30 + 37.5분 = 16:07:30. 그런데 경로상 물리 도착이 16:10 —
        // 바닥 규칙: 도착 전 시각을 약속으로 권하지 않는다 → 16:10 (지각은 버퍼 음수로 드러남)
        expect(kst(Date.parse(d.promisedUntil!))).toBe('16:10');
    });

    it('배송 주행을 모르면(합짐) 하차 추정 없음 — 지어내지 않는다', () => {
        const d = run(order({ totalDurationMin: null, kakaoSoloDurationMin: null }))
            .find(e => e.stopType === 'dropoff')!;
        expect(d.promisedUntil).toBeNull();
    });

    it('🔴 통화로 굳힌 약속은 그대로', () => {
        const reports = () => ([{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-21T12:00:00Z',    // 21:00
        }] as any);
        const p = run(order(), reports).find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('21:00');
        expect(p.promiseConfirmed).toBe(true);
    });
});

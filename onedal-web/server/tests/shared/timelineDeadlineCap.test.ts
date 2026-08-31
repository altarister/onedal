import { deriveRouteTimeline } from '@onedal/shared';

/**
 * ⏱️ **타임라인도 두 시계다** (시간체계 ⑯ · 기사님 확정 2026-08-21)
 *
 * 시딩(d257f90)은 두 시계로 갔는데 타임라인이 옛 식이면 카운트다운·덱이 새 시트와
 * **또 두 목소리**를 낸다. 추정을 만드는 규칙은 하나다:
 *
 * 🔄 **2026-08-31 기사님 확정으로 상차 쪽이 바뀌었다** — 상차 약속은 도착 예상을 따라가지
 *    않는다. «잡은 시각 + 20분»으로 못박고, 못 지키면 **여유가 음수**로 드러난다.
 *    (옛 식 `max(도착 예상, 잡음+30)` 은 늦는 것을 0으로 눌러 감췄다)
 *
 *   상차 추정 약속 = 통화 약속 > 적요 상차 시각 > 콜 잡은 시각 + 20분
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
    it('🔴 상차 추정 약속 = 콜 잡은 시각 + 20분 (0831 확정)', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        // 잡음 14:55 + 20 = 15:15. 도착 예상 15:06 이라 여유 +9분
        expect(kst(Date.parse(p.promisedUntil!))).toBe('15:15');
        expect(p.promiseConfirmed).toBe(false);
    });

    it('🔴 상차지가 멀어 20분을 못 지켜도 약속은 그대로 — 늦는 것이 음수로 드러난다', () => {
        /**
         * 🔄 옛 검사는 «약속 = 도착 예상»(캡 바닥)으로 늦음을 0으로 눌렀다.
         *    기사님 확정 2026-08-31: 약속은 «잡은 시각 + 20분»이고, 못 지키면 늦은 것이다 —
         *    그걸 알아야 그 상차지에 전화를 건다. 감추면 전화할 기회를 뺏는다.
         */
        const tl = deriveRouteTimeline(
            [{ orderId: 'S', stopType: 'pickup', driveMinutes: 75 },
             { orderId: 'S', stopType: 'dropoff', driveMinutes: 100 }] as any,
            order({ totalDurationMin: 100 }), () => [], () => [], NOW, ANCHOR);
        const p = tl.find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('15:15');           // 약속은 20분 그대로
        expect(kst(p.etaMs!)).toBe('16:10');                               // 도착 예상은 75분 뒤
        expect(Math.round((Date.parse(p.promisedUntil!) - p.etaMs!) / 60_000)).toBe(-55);
    });

    it('🔴 적요의 상차 시각이 상차 시계를 대체한다 (소숙 콜③ 예약)', () => {
        const p = run(order({ detailMemo: '16:00상차 예약' })).find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('16:00');   // 잡은시각+20(15:15)이 아니라 적요
    });

    it('🔴 하차 추정 약속 = 배달 데드라인 (상차 완료 예정 + 배송×150%)', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        /**
         * 🔴 하차 마감의 기산점은 «약속»이 아니라 **떠날 수 있는 가장 이른 시각**이다
         *    (도착 예상 15:06 과 약속 15:15 중 늦은 쪽) + 정차 15 = 완료 15:30 · +25×1.5 = 16:07:30.
         *    약속을 그대로 기산점으로 쓰면 20분 약속이 하차 마감까지 앞당겨 억울한 지각이 된다.
         */
        expect(kst(Date.parse(d.promisedUntil!))).toBe('16:07');
    });

    it('🔴 상차를 실제로 마쳤으면 데드라인은 실측 기산 · 못 지키면 음수로 드러난다', () => {
        /**
         * 🔄 옛 검사는 «도착 전 시각을 약속으로 권하지 않는다»(바닥 규칙)로 16:10 을 기대했다.
         *    기사님 확정 2026-08-31: *"상차하고는 150%를 꼭 지켜야 한다."* 그러니 못 지키는
         *    것이야말로 드러나야 한다 — 상차에서 없앤 눌림을 하차에서도 없앴다.
         */
        const ms = () => ([{ milestone: 'PICKED_UP', occurredAt: '2026-08-21T06:30:00Z' }] as any);
        const d = run(order(), () => [], ms).find(e => e.stopType === 'dropoff')!;
        // 데드라인 = 실은 15:30 + 25×1.5 = 16:07:30 — 경로상 도착(16:10)보다 이르다
        expect(kst(Date.parse(d.promisedUntil!))).toBe('16:07');
        expect(kst(d.etaMs!)).toBe('16:10');
        expect(Math.round((Date.parse(d.promisedUntil!) - d.etaMs!) / 60_000)).toBe(-2);   // 16:07:30 → 16:10, 반올림
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

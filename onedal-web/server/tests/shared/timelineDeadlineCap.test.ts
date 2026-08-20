import { deriveRouteTimeline } from '@onedal/shared';

/**
 * ⏱️ **타임라인의 추정 약속도 시한 안으로** (기사님 실측 2026-08-21 · 리허설 12)
 *
 * 시딩은 추정 약속을 시한(주행×150%+픽업 20분)으로 깎는데, 타임라인은 안 깎아서
 * **한 화면이 두 목소리**를 냈다:
 *
 *   새 시트:     약속 06:20  (깎인 추정)
 *   카운트다운:  "상차 06:36 약속 기준"  ← 예상+여유 30분, 안 깎임
 *   덱 헤더:     경안동 ~06:36
 *
 * 추정을 만드는 곳이 둘인데 규칙이 달랐다 — 캡을 타임라인에도 건다.
 * 🔴 통화로 굳힌 약속(DECLARED)은 여기서도 안 깎는다 — 화주 합의가 면책.
 */

const ANCHOR = '2026-08-21T05:55:00Z';
const NOW = Date.parse(ANCHOR);
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

// 리허설 12 의 모습 — 접근 11분 · 배송 25분 (짧은 콜)
const stops = [
    { orderId: 'S', stopType: 'pickup', driveMinutes: 11 },
    { orderId: 'S', stopType: 'dropoff', driveMinutes: 36 },
] as any;
const orders = [{
    id: 'S', capturedAt: ANCHOR,
    totalDurationMin: 36, kakaoSoloDurationMin: 25,
}] as any;

const run = (reportsOf: (id: string) => any = () => []) =>
    deriveRouteTimeline(stops, orders, reportsOf, () => [], NOW, ANCHOR);

describe('타임라인 추정 약속 — 시한 캡', () => {
    // 시한 = 잡음(KST 14:55) + 25×1.5 + 20 = 15:52:30
    it('🔴 하차 추정 약속이 시한을 넘지 않는다', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        // 안 깎으면 예상 + 30 = 16:16 — 시한 15:52:30 으로 깎여야 한다
        expect(kst(Date.parse(d.promisedUntil!))).toBe('15:52');
    });

    it('🔴 상차 추정 약속 ≤ 시한 − 배송 − 상차 정차 — 거기서 떠나야 시한에 닿는다', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        // 캡 = 15:52:30 − 25분 − 상차 15분(미확인 기본) = 15:12:30.
        // 안 깎으면 예상 + 30 = 15:36 이었다 — 카운트다운이 말하던 그 값
        expect(kst(Date.parse(p.promisedUntil!))).toBe('15:12');
    });

    it('🔴 통화로 굳힌 약속은 시한 위여도 그대로', () => {
        const reports = () => ([{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-21T12:00:00Z',    // 21:00 — 시한 훨씬 뒤
        }] as any);
        const p = run(reports).find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('21:00');
        expect(p.promiseConfirmed).toBe(true);
    });

    it('배송 주행을 모르면(합짐) 캡 없음 — 지어내지 않는다 (규칙 ④)', () => {
        const noSolo = [{ id: 'S', capturedAt: ANCHOR, kakaoSoloDurationMin: null }] as any;
        const tl = deriveRouteTimeline(stops, noSolo, () => [], () => [], NOW, ANCHOR);
        const p = tl.find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('15:36');   // 예상 + 여유 그대로
    });
});

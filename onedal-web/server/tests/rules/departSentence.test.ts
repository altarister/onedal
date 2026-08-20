import { deriveRouteTimeline } from '@onedal/shared';

/**
 * 🚚 **하차지 통화 문장의 출발 시각과 주행분** (기사님 실측 2026-08-20)
 *
 * 기사님이 여섯 시트와 저장값을 나란히 놓고 대조하다 나온 사고다.
 * 하차지 통화 시트가 이렇게 말했다:
 *
 *   *"홈플러스 광주점에서 8분 상차·대기하고 **16:19 출발**, **주행 129분**, 휴게 29분 = 18:56 도착"*
 *
 * 두 항이 틀렸고, **서로를 가려** 그럴듯한 값이 나왔다.
 *
 *   ① `16:19 출발` — 상차 약속은 16:55 이고 8분 실으면 **17:03** 이다. 44분 이르다.
 *      시트가 `Date.now() + leadMinutes` 로 **자기가 계산**했다 — 시트를 열 때마다 달라진다.
 *   ② `주행 129분` — 129 는 **접근 16 + 단독 113** 이다. 상차지에서 떠난 뒤의 주행은
 *      **113분**이어야 한다. 누적을 쓰면 접근 16분을 **두 번** 센다.
 *
 *   −44 + 16 = −28분  →  18:26 (참값 18:56). 하차 약속을 **30분 이르게** 잡는다.
 *
 * 🔴 뿌리는 하나다 — **시트가 시각을 계산했다.** 규칙 ③ 위반이고,
 *    `timing.ts` 508~514 줄이 *"한쪽만 고치면 카운트다운과 통화 화면이 다른 시각을
 *    말한다 (BB·DD·II·JJ·PP·WW)"* 라고 경고한 바로 그 모양이다.
 *
 * 그래서 **값은 타임라인이 만들고 시트는 그리기만 한다.**
 */

const ANCHOR = '2026-08-20T07:09:00Z';          // 16:09 KST — 콜 잡은 시각 = 경로 계산 시각
const NOW = Date.parse(ANCHOR);
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

// 실측 콜: totalDurationMin 129 · kakaoSoloDurationMin 113 → 접근 16분
const stops = [
    { orderId: 'X', stopType: 'pickup',  driveMinutes: 16 },
    { orderId: 'X', stopType: 'dropoff', driveMinutes: 129 },   // 🔴 누적이다
] as any;

const orders = [{
    id: 'X', capturedAt: ANCHOR,
    totalDistanceKm: 87, totalDurationMin: 129,
    kakaoSoloDistanceKm: 81.1, kakaoSoloDurationMin: 113,
    approachDurationMin: 16,
}] as any;

// 파레트 2개 · 지게차 → 상차 8분 (지게차 4 + 결박 4)
const reportsOf = (_id: string) => ([{
    stopType: 'pickup', kind: 'DECLARED',
    unit: '파레트', quantity: 2, handling: '지게차', protections: ['결박'],
}] as any);

const run = () => deriveRouteTimeline(stops, orders, reportsOf, () => [] as any, NOW, ANCHOR);

describe('하차지 문장 — 앞 정거장을 떠나는 시각은 타임라인이 만든다', () => {
    it('🔴 상차 도착 예상은 16:25 — 콜 잡은 시각 + 접근 16분', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        expect(kst(p.etaMs!)).toBe('16:25');
    });

    it('🔴 상차 약속은 16:55 — 도착 예상 + 여유 30분', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        expect(kst(Date.parse(p.promisedUntil!))).toBe('16:55');
    });

    /**
     * 🔴 **이 값이 없어서 시트가 자기 계산을 했다.**
     *    출발 = 앞 정거장 약속 + 그 정거장 정차. 16:55 + 8분 = 17:03.
     *    상차지 시트도 같은 말을 한다 — 두 시트가 갈라질 수 없어야 한다.
     */
    it('🔴 하차지 문장의 출발 시각은 17:03 — 상차 약속(16:55) + 상차 8분', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        expect(d.departPrevMs).not.toBeNull();
        expect(kst(d.departPrevMs!)).toBe('17:03');
    });

    /**
     * 🔴 `driveMinutes` 는 **닻부터의 누적**이라 문장에 쓰면 접근을 두 번 센다.
     *    문장이 필요한 것은 **앞 정거장에서 여기까지**다.
     */
    it('🔴 하차지 문장의 주행은 113분 — 누적 129 가 아니라 구간', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        expect(d.segmentDriveMinutes).toBe(113);
        expect(d.driveMinutes).toBe(129);      // 누적은 누적대로 남는다 (출발 마감이 쓴다)
    });

    it('첫 정거장의 구간 주행은 누적과 같다 — 앞에 아무도 없다', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        expect(p.segmentDriveMinutes).toBe(16);
        expect(p.departPrevMs).toBeNull();     // 떠나 온 정거장이 없다 (규칙 ④ — 0 이 아니다)
    });

    /**
     * 🔴 **문장이 검산된다** — 출발 + 구간 주행 + 휴게 = 도착.
     *    17:03 + 113분 = 18:56 이 물리적 도착이고, 시트가 말하던 18:26 은 30분 이르다.
     */
    it('🔴 출발 + 구간 주행 = 18:56 — 시트가 말하던 18:26 이 아니다', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        const arriveMs = d.departPrevMs! + d.segmentDriveMinutes! * 60_000;
        expect(kst(arriveMs)).toBe('18:56');
    });
});

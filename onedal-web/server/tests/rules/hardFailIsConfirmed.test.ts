import { judge, CRITERIA, DEFAULT_JUDGMENT, deriveRouteTimeline } from '@onedal/shared';
import type { JudgeFacts } from '@onedal/shared';

/**
 * 🚫 **무조건 빨간불은 «확정값»만 본다** (기사님 확정)
 *
 * 색을 덮는 것은 세 가지뿐이고, 셋 다 **추정이 아니라 확정된 사실**이어야 한다 —
 * 통화로 굳힌 약속 · 이 콜 자체의 성질 · 신고·실측(DECLARED·CONFIRMED)으로 모자란 적재.
 *
 * 무엇을 막나
 * - **임시 약속**(콜 잡은 시각 + 20분 · 배송 150%)이 깨졌다고 색을 덮는 것 — 서버가 지레짐작한
 *   시간 때문에 좋은 콜이 🔴 가 되면 안 된다. 통화로 굳힌 약속만 «잡으면 사고»다
 * - **추정 적재**로 색을 덮는 것 — 차종 글자를 오독하면 멀쩡한 콜이 🔴 가 된다.
 *   추정 적재로 자리가 모자라면 «못 쟀다»로 두어 점수에서 빼고 색은 안 덮는다
 *   (`shared/src/criteria.ts` 의 `SPACE`)
 * - 성질이 **색을 안 덮게** 되는 것 — 위험물+식료품은 확정된 사실이라 덮어야 한다
 */
const cfg = DEFAULT_JUDGMENT;
const 합짐 = (over: Partial<JudgeFacts> = {}): JudgeFacts => ({
    money: { fare: 50_000, extraMinutes: 60, firstLoad: false },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
    space: { freePct: 80, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
    ...over,
});
const 덮은기준 = (f: JudgeFacts) => judge(CRITERIA, f, cfg).criteria
    .filter(c => c.outcome.kind === 'scored' && (c.outcome as { hardFail?: boolean }).hardFail)
    .map(c => c.key);

describe('🚫 색을 덮는 것은 약속·성질 둘이다 (공간은 아직 아니다)', () => {

    it('🔴 통화로 굳힌 약속이 깨지면 덮는다', () => {
        const f = 합짐({ promise: { hasExistingCalls: true, bufferAfterMin: 60,
            lateStops: [{ label: '노선콜 하차 약속', lateMinutes: 12 }] } });
        expect(덮은기준(f)).toEqual(['promise']);
        expect(judge(CRITERIA, f, cfg).color).toBe('사고');
    });

    it('🔴 같이 못 싣는 성질이면 덮는다', () => {
        const f = 합짐({ nature: { conflicts: [['위험물', '농산물']], excludedHits: [], hasLoad: true } });
        expect(덮은기준(f)).toEqual(['nature']);
    });

    it('🔴 제외 낱말(착불 등)도 덮는다 — 실린 짐이 없어도 이 콜 자체의 성질이다', () => {
        const f = 합짐({ nature: { conflicts: [], excludedHits: ['착불'], hasLoad: false } });
        expect(덮은기준(f)).toEqual(['nature']);
    });

    /**
     * 🔴 **추정 적재로는 자리가 모자라도 색은 안 덮는다** — 적재값이 차종 글자에서 넣은 **추정**이면
     *    오독일 수 있다. 신고·실측(DECLARED·CONFIRMED)으로 모자랄 때만 덮는다.
     *    아래 사실에는 확신도(`confidence`)가 없으니 추정이다.
     */
    it('🔴 자리가 모자라면 점수 0 이지만 색은 안 덮는다', () => {
        const f = 합짐({ space: { freePct: -20, hasLoad: true } });
        expect(덮은기준(f)).toEqual([]);
        const 공간 = judge(CRITERIA, f, cfg).criteria.find(c => c.key === 'space')!;
        /* 🔴 **점수를 안 낸다** (규칙 ⑤-2). 추정 오독 하나가 멀쩡한 콜의 **평균까지**
           끌어내리면 안 되므로 «못 쟀다»로 두어 가중평균에서 뺀다 — 색을 안 덮는다는
           규칙은 그대로다 */
        expect(공간.outcome.kind).toBe('unmeasurable');
    });

    it('🔴 빠듯한 여유(음수)도 색을 안 덮는다 — 그건 임시 계산이다', () => {
        const f = 합짐({ promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: -103 } });
        expect(덮은기준(f)).toEqual([]);
    });
});

/**
 * ⛓️ **임시 약속은 지각으로 세지 않는다** — 「약속」이 덮는 `lateStops` 의 뿌리를 여기서 잠근다.
 *    타임라인이 `kind: 'DECLARED'`(통화로 굳힘)가 아닌 약속을 지각으로 세면, 그 위의
 *    무조건 빨간불이 임시 계산 때문에 켜진다.
 */
describe('⛓️ 지각은 통화로 굳힌 약속에서만 나온다', () => {
    const NOW = Date.parse('2026-08-19T00:00:00Z');
    const ANCHOR = '2026-08-19T00:00:00Z';
    const stops = [
        { orderId: 'A', stopType: 'pickup', driveMinutes: 13 },
        { orderId: 'A', stopType: 'dropoff', driveMinutes: 110 },
    ] as any;
    const orders = [{ id: 'A', capturedAt: ANCHOR }] as any;
    const none = () => [] as any;
    /** 물리적으로 못 지키는 하차 약속 — 상차 01:12 + 정차 + 97분이면 02:5x 다 */
    const 못지킬약속 = (kind: string) => (id: string) => id === 'A' ? [
        { stopType: 'pickup', kind, promisedArrivalAt: '2026-08-19T01:12:00.000Z' },
        { stopType: 'dropoff', kind, promisedArrivalAt: '2026-08-19T01:51:00.000Z' },
    ] as any : [];

    it('🔴 통화로 굳힌 약속(DECLARED)이면 지각이 잡힌다', () => {
        const tl = deriveRouteTimeline(stops, orders, 못지킬약속('DECLARED'), none, NOW, ANCHOR);
        expect(tl[1].lateMinutes).toBeGreaterThan(0);
        expect(tl[1].promiseConfirmed).toBe(true);
    });

    it('🔴 미리 눌러 둔 약속(통화 전)은 같은 시각이어도 지각이 아니다', () => {
        const tl = deriveRouteTimeline(stops, orders, 못지킬약속('PREFILL'), none, NOW, ANCHOR);
        expect(tl[1].lateMinutes).toBe(0);
        expect(tl[1].promiseConfirmed).toBe(false);
    });

    /**
     * 🔴 **이 한 건이 무조건 빨간불을 막고 있다.** 상차 추정 약속은 «잡은 시각 + 20분»이라
     *    도착예상에서 파생되지 **않는다** — 상차지까지 20분보다 멀면 그냥 넘겨진다.
     *    통화를 안 했을 뿐인 멀쩡한 콜이고, 여기서 지각으로 세면 «약속»이 색을 🔴 로 덮어
     *    **상차지가 먼 콜이 전부 사고**가 된다. 통화로 굳힌 약속만 센다.
     */
    it('🔴 상차지가 20분보다 멀어도 지각이 아니다 — 통화 전이라서', () => {
        const 먼상차 = [{ orderId: 'A', stopType: 'pickup', driveMinutes: 60 }] as any;
        const tl = deriveRouteTimeline(먼상차, orders, none, none, NOW, ANCHOR);
        // 추정 약속은 00:20 인데 도착예상은 01:00 — 40분을 넘겼다
        expect(tl[0].promisedUntil).toBe('2026-08-19T00:20:00.000Z');
        expect(tl[0].etaMs).toBe(Date.parse('2026-08-19T01:00:00.000Z'));
        expect(tl[0].promiseConfirmed).toBe(false);
        expect(tl[0].lateMinutes).toBe(0);
    });
});

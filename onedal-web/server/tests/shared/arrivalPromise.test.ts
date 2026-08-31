import { deriveCallTiming, DEFAULT_DEADLINE_RULES } from '@onedal/shared';

/**
 * 🕒 **약속은 도착 시각이다 — 상차 소요와 분리한다** (기사님 확정 2026-08-18)
 *
 * 실측 사고: 통화로 "40박스 수작업"을 신고하자 상차 소요가 15→30분으로 늘며
 * 완료 기준 약속이 흔들려 **갑자기 지각**이 떴다. 전화로 화주와 잡는 것은
 * "몇 시까지 갈게요"(도착)다 — 짐 양에 따라 변하는 상차 소요를 약속에 섞으면
 * 신고할 때마다 약속이 움직인다.
 *
 *   도착 약속(promisedArrivalAt) = 저장    ← 통화에서 정한 것, 불변
 *   완료 시각(deadlineAt)        = 파생    ← 도착 약속 + 지금 추정 상차 소요
 */
describe('도착 약속 (promisedArrivalAt)', () => {
    const NOW = Date.parse('2026-08-18T05:00:00Z');
    const order = {
        capturedAt: '2026-08-18T05:00:00Z',
        kakaoSoloDistanceKm: 80, kakaoSoloDurationMin: 80,
        totalDistanceKm: 85, approachDurationMin: 14,
    } as any;
    const ARRIVE = '2026-08-18T05:30:00.000Z';   // 통화로 "14:30까지 갈게요"

    const report = (extra: object) => ([{
        stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: ARRIVE, ...extra,
    }] as any);

    it('완료 시각 = 도착 약속 + 상차 소요 (파생)', () => {
        // 수작업 20박스 = 7분 (박스당 20초 · 2026-08-18 새 축)
        const t = deriveCallTiming(order, report({ unit: '라면박스', quantity: 20, handling: '수작업' }), [], NOW);
        expect(t.pickupDeadlineAt).toBe('2026-08-18T05:37:00.000Z');
    });

    it('🔴 신고로 상차 소요가 바뀌어도 도착 약속은 흔들리지 않는다 — 완료 예상만 갱신', () => {
        // 40박스로 정정 → 소요 13분. 도착 약속(05:30Z)은 그대로, 완료만 뒤로 밀린다
        const t = deriveCallTiming(order, report({ unit: '라면박스', quantity: 40, handling: '수작업' }), [], NOW);
        expect(t.pickupPromisedArrivalAt).toBe(ARRIVE);
        expect(t.pickupDeadlineAt).toBe('2026-08-18T05:43:00.000Z');
    });

    it('통화 전 추정 — 상차 약속 = 콜 잡은 시각 + 20분 (기사님 확정 0831)', () => {
        const t = deriveCallTiming(order, [], [], NOW);
        // 잡음 05:00 + 20분 = 05:20. 도착 예상(05:14)을 따라가지 않는다 — max 폐기
        expect(t.pickupPromisedArrivalAt).toBe('2026-08-18T05:20:00.000Z');
        expect(t.deadlineEstimated).toBe(true);
    });

    it('상차지까지 몇 분인지 몰라도 약속은 «잡은 시각 + 20분» 그대로다', () => {
        // 30분·60분은 20분 룰을 모를 때의 가정치라 폐기 (기사님 확정 2026-08-31)
        const noApproach = { ...order, approachDurationMin: null, totalDistanceKm: null };
        const t = deriveCallTiming(noApproach, [], [], NOW);
        expect(t.pickupDeadlineAt).toBe('2026-08-18T05:20:00.000Z');
    });

    it('옛 행 호환 — promisedArrivalAt 없이 deadlineAt 만 있으면 그 값을 완료로 쓴다', () => {
        const legacy = [{ stopType: 'pickup', kind: 'DECLARED', deadlineAt: '2026-08-18T06:30:00.000Z' }] as any;
        const t = deriveCallTiming(order, legacy, [], NOW);
        expect(t.pickupDeadlineAt).toBe('2026-08-18T06:30:00.000Z');
    });
});

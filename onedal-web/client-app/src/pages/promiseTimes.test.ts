import { describe, it, expect } from 'vitest';
import { promiseTimes } from './labPortMap';

/**
 * ⏰ **약속은 «이 콜만 직행했을 때»로 잡는다** (기사님 확정 2026-09-09).
 *
 * 🔴 병합 경로 누적으로 잡으면 **빙 둘러 온 시간이 약속에 이미 들어간다.** 그러면
 *    「다른 콜로 영향받는 시간 = 예정 − 약속」이 거의 0 으로 나와 **진짜 영향이 숨는다.**
 *    기사님: *"이 콜의 어디를 경유해 왔을지 모르잖아. 빙 둘러 온 거면 그 값은 잘못된 값이야."*
 */
const T0 = Date.UTC(2026, 8, 9, 0, 0, 0);
const min = (t: number | null) => t == null ? null : Math.round((t - T0) / 60000);

describe('⏰ 약속 시각 — 직행 기준', () => {
    it('🔴 합짐: 병합 경로 누적(100분)이 아니라 ⑮ 직행(27분)에서 나온다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 100, dropoffMin: 160 },
            direct: { approachMin: 27, durMin: 63 } });
        expect(min(r.pickupAt)).toBe(27);        // 100 이 아니다
        expect(min(r.dropoffAt)).toBe(27 + 63);  // 160 이 아니다
    });

    it('첫짐: 직행과 병합이 같은 값이라 결과도 같다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 20, dropoffMin: 84 },
            direct: { approachMin: 20, durMin: 64 } });
        expect(min(r.pickupAt)).toBe(20);
        expect(min(r.dropoffAt)).toBe(84);
    });

    it('직행값이 아직 안 왔으면 약속은 «없다» — 병합 값으로 대신 채우지 않는다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 100, dropoffMin: 160 },
            direct: { approachMin: null, durMin: null } });
        expect(r.pickupAt).toBeNull();
        expect(r.dropoffAt).toBeNull();
    });

    it('상차는 쟀고 배송을 못 쟀으면 상차 약속만 선다 (지어내지 않는다)', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 100, dropoffMin: 160 },
            direct: { approachMin: 27, durMin: null } });
        expect(min(r.pickupAt)).toBe(27);
        expect(r.dropoffAt).toBeNull();
    });
});

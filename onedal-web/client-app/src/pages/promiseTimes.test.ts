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

    /**
     * 🧳 **하차 약속에는 «상차에 머무는 분»이 들어간다** (기사님 2026-09-09 *"정차를 넣어줘"*).
     * 하차는 «상차에 닿아서 → 짐을 싣고 → 달려서» 닿는 자리다. 이걸 빼면 하차 약속이
     * 늘 이르게 서고, 그 차이가 나중에 **«다른 콜 탓»으로 잘못 잡힌다.**
     */
    it('🧳 상차 정차 15분은 하차 약속에만 들어간다 — 상차 약속은 도착 시각이라 그대로다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: null, dropoffMin: null },
            direct: { approachMin: 20, durMin: 60 }, pickupDwellMin: 15 });
        expect(min(r.pickupAt)).toBe(20);            // 도착 — 짐 싣기 전이다
        expect(min(r.dropoffAt)).toBe(20 + 15 + 60); // 도착 + 싣기 + 주행
    });

    it('정차를 안 주면 예전과 같은 답이다 (되돌리는 길)', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: null, dropoffMin: null },
            direct: { approachMin: 20, durMin: 60 } });
        expect(min(r.dropoffAt)).toBe(80);
    });
});

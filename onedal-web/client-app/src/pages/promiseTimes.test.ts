import { describe, it, expect } from 'vitest';
import { promiseTimes } from './labPortMap';

/**
 * ⏰ **약속은 두 시계에서 온다** (기사님 확정).
 *
 *   상차 약속 = **콜 잡은 시각 + 20분**            — 배차망이 거는 시계
 *   하차 약속 = **상차 완료 + 배송 주행 × 150%**   — 고객이 안내받는 약속
 *
 * 🔴 **둘 다 «예상»이 아니라 «약속»이다.** 전에는 상차를 «잡은 시각 + 접근 실측»으로 세웠는데,
 *    그건 **약속을 예상에 맞추는 것**이라 ± 가 늘 0에 가깝고 «20분을 넘겼나»가 안 보였다
 *    (기사님: *"이걸로는 20분이 넘었는지 아닌지 모른다는 것이다"*).
 * 🔴 하차의 150% 는 **관행 상한이 아니라 고객과의 약속**이다 (기사님 정정 2026-09-10:
 *    *"지금 전달해 주시면 150% 안에 가져다 드릴게요 — 그러니 고객과의 약속이 맞아"*).
 * 🔴 병합 경로 누적으로 잡지 않는 이유는 그대로다 — **빙 둘러 온 시간이 약속에 들어가면**
 *    「예정 − 약속」이 0 이 되어 **진짜 영향이 숨는다** (기사님 2026-09-09).
 * 🔴 **못 잰 콜은 약속도 안 선다** — 접근을 못 쟀으면 그 콜은 아직 «잰 콜»이 아니다 (규칙 ④).
 */
const T0 = Date.UTC(2026, 8, 9, 0, 0, 0);
const min = (t: number | null) => t == null ? null : Math.round((t - T0) / 60000);

describe('⏰ 약속 시각 — 직행 기준', () => {
    it('🔴 상차 약속은 «잡은 시각 + 20분» — 접근 실측(27분)을 따라가지 않는다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 100, dropoffMin: 160 },
            direct: { approachMin: 27, durMin: 60 } });
        expect(min(r.pickupAt)).toBe(20);                 // 27 이 아니다 — 그러면 ± 가 «20분 초과»를 못 말한다
        expect(min(r.dropoffAt)).toBe(20 + 90);           // 하차 = 상차 + 60×150%
    });

    it('🔴 하차 약속은 배송 주행의 **150%** — 100% 로 세우면 여유 50%가 통째로 사라진다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: null, dropoffMin: null },
            direct: { approachMin: 5, durMin: 40 } });
        expect(min(r.dropoffAt)).toBe(20 + 60);           // 40 이 아니라 60
    });

    it('병합 경로 누적은 약속에 안 쓴다 — 빙 둘러 온 시간이 약속에 들어가면 영향이 숨는다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: 100, dropoffMin: 160 },
            direct: { approachMin: 20, durMin: 64 } });
        expect(min(r.pickupAt)).toBe(20);                 // 100 이 아니다
        expect(min(r.dropoffAt)).toBe(20 + 96);           // 160 이 아니다
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
        expect(min(r.pickupAt)).toBe(20);
        expect(r.dropoffAt).toBeNull();
    });

    /**
     * 🧳 **하차 약속에는 «상차에 머무는 분»이 들어간다** (기사님 2026-09-09 *"정차를 넣어줘"*).
     * 하차는 «상차에 닿아서 → 짐을 싣고 → 달려서» 닿는 자리다. 이걸 빼면 하차 약속이
     * 늘 이르게 서고, 그 차이가 나중에 **«다른 콜 탓»으로 잘못 잡힌다.**
     */
    it('🧳 상차 정차는 하차 약속에만 들어간다 — 상차 약속은 도착 시각이라 그대로다', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: null, dropoffMin: null },
            direct: { approachMin: 20, durMin: 60 }, pickupDwellMin: 15 });
        expect(min(r.pickupAt)).toBe(20);                 // 도착 — 짐 싣기 전이다
        expect(min(r.dropoffAt)).toBe(20 + 15 + 90);      // 도착 + 싣기 + 주행×150%
    });

    it('정차를 안 주면 «상차 + 주행×150%» 만 남는다 (되돌리는 길)', () => {
        const r = promiseTimes({ confirmedAt: T0, chainCum: { pickupMin: null, dropoffMin: null },
            direct: { approachMin: 20, durMin: 60 } });
        expect(min(r.dropoffAt)).toBe(20 + 90);
    });
});

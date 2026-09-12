import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 📡 **보내는 문이 실제로 무엇을 내보내는가** (기사님 실측 2026-09-12 · 셋째 판).
 *
 * 🔴 **이 검사는 소스를 안 읽는다 — 함수를 불러 «나갔는가»를 본다.**
 *    `mockDriveTelemetry.test.ts` 는 소스 문자열로 배선을 확인하는 검사라
 *    **«이어졌는가»는 봐도 «나가는가»는 못 본다.** 그래서 오늘 정차가 초록불인 채
 *    궤적에 0건이었다. 그 틈을 이 검사가 맡는다.
 *
 * 실측한 것 (`gps_tracks` 88점 · 5배속):
 *   18:32:45   88m   서행 끝 — 정거장에 닿음
 *   18:32:51  408m   🔴 **6초 공백**. 그 사이 정차했는데 점이 하나도 없다
 *   ⇒ 같은 자리 0m 점 **0건**. 정차는 궤적에서 «없던 일» 이 됐다
 *
 * 원인은 **두 숫자가 서로를 알아야 하는 관계** 였다 —
 *   `SAME_SPOT_RESEND_MS`(6초) ≤ 정차 길이  여야 정차가 한 점이라도 나간다.
 * 기사님이 정차 눈금을 6초 아래로 돌리면 **조용히 0건**이 된다.
 * 지난 판의 «재전송 주기 ↔ 서버 문턱»과 **같은 병**이다 (버그 대장 #110).
 *
 * 🟢 관계를 없앤다: **«서 있다»는 사실이면 억제를 안 본다.**
 */

const emit = vi.fn();
vi.mock('./socket', () => ({ socket: { emit: (...a: unknown[]) => emit(...a) } }));

/* 화면 알림은 이 검사의 관심이 아니다 — 받아만 주고 버린다 (브라우저 없이 돌게) */
(globalThis as { window?: unknown }).window = { dispatchEvent: () => true };

const { publishLocation } = await import('./gpsBridge');

/** 소켓으로 나간 좌표들만 — 화면 알림(`local-gps-update`)은 세지 않는다 */
const sentPoints = () => emit.mock.calls
    .filter(c => c[0] === 'dashboard-gps-update')
    .map(c => c[1] as { lat: number; lng: number; stopped?: boolean });

beforeEach(() => { emit.mockClear(); });

describe('gpsBridge — 같은 자리라도 «서 있다»는 나간다', () => {

    it('🔴 정차 중이면 매 틱 나간다 — 정차 길이가 재전송 주기보다 짧아도', () => {
        /* 정거장에 닿는다 (새 자리라 당연히 나간다) */
        publishLocation(37.1, 127.1, 'mock', { stopped: true });
        /* 🔴 같은 자리에 4초 더 서 있다 — 6초 억제에 걸리면 여기서 아무것도 안 나간다 */
        for (let i = 0; i < 4; i++) publishLocation(37.1, 127.1, 'mock', { stopped: true });

        const pts = sentPoints();
        expect(pts.length).toBe(5);                       // 닿은 한 점 + 서 있는 넷
        expect(pts.every(p => p.stopped === true)).toBe(true);
        expect(pts.every(p => p.lat === 37.1 && p.lng === 127.1)).toBe(true);
    });

    it('달리는 중 같은 자리는 여전히 아껴 보낸다 — 2026-08-14 중복 발신은 막은 채로', () => {
        publishLocation(37.2, 127.2, 'mock');
        publishLocation(37.2, 127.2, 'mock');
        publishLocation(37.2, 127.2, 'mock');
        expect(sentPoints().length).toBe(1);
    });

    it('자리가 바뀌면 당연히 나간다', () => {
        publishLocation(37.3, 127.3, 'mock');
        publishLocation(37.3001, 127.3, 'mock');
        expect(sentPoints().length).toBe(2);
    });

    /**
     * 🔴 **«서 있다»가 «달린다»로 바뀌는 순간도 사실이다.** 그 점을 안 보내면
     *    서버는 정차가 **언제 끝났는지**를 모른 채 다음 순항 점으로 건너뛴다.
     */
    it('정차가 끝나 같은 자리에서 떠나면 그 첫 점이 나간다', () => {
        publishLocation(37.4, 127.4, 'mock', { stopped: true });
        emit.mockClear();
        publishLocation(37.4001, 127.4, 'mock', { stopped: false });
        expect(sentPoints().length).toBe(1);
        expect(sentPoints()[0].stopped).toBe(false);
    });
});

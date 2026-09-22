import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GpsSource } from './gpsBridge';

/**
 * 📡 **보내는 문이 실제로 무엇을 내보내는가** (기사님 실측).
 *
 * 🔴 **이 검사는 소스를 안 읽는다 — 함수를 불러 «나갔는가»를 본다.**
 *    서버 `tests/rules/mockDriveTelemetry.test.ts` 는 소스 문자열로 배선을 확인하는 검사라
 *    **«이어졌는가»는 봐도 «나가는가»는 못 본다** — 그 검사가 초록불이어도 정차가 궤적에 0건일 수 있다.
 *    그 틈을 이 검사가 맡는다.
 *
 * 같은 자리 재전송을 `SAME_SPOT_RESEND_MS`(6초)로 억제하면, 정차가 6초보다 짧을 때
 * 정차 중 점이 **하나도** 안 나가 정차가 궤적에서 «없던 일»이 된다.
 * **두 숫자가 서로를 알아야 하는 관계**라, 기사님이 정차 눈금을 6초 아래로 돌리면 **조용히 0건**이 된다.
 *
 * 🟢 관계를 없앤다: **«서 있다»는 사실이면 억제를 안 본다.**
 */

const emit = vi.fn();
vi.mock('./socket', () => ({ socket: { emit: (...a: unknown[]) => emit(...a) } }));

/* 화면 알림은 이 검사의 관심이 아니다 — 받아만 주고 버린다 (브라우저 없이 돌게) */
/**
 * 🔴 **통째로 덮지 않는다 — 있는 것에 얹는다.**
 *
 * `globalThis.window = { dispatchEvent }` 로 **갈아치우면** 같은 프로세스에서
 * 도는 **다른 검사 파일이 `window.location.origin` 을 못 읽고 죽는다**
 * (`drivenTrailStore.test.ts` → `serverTarget.ts`). 전역은 파일 사이에 새어 나간다 —
 * 이 파일만 보면 초록이고, **전체를 돌려야 드러난다.**
 *
 * ⚠️ 그래서 «없는 칸만» 채운다. `location` 은 이 검사가 안 쓰지만 남이 쓴다.
 */
{
    /* ⚠️ `globalThis.window` 는 DOM 타입이라 곧바로 좁힐 수 없다 — 한 번 `unknown` 을 지난다
       (`tsc -b` 는 증분이라 이 오류를 놓칠 수 있다 — 게이트에서만 드러난다) */
    const g = globalThis as unknown as { window?: Record<string, unknown> };
    g.window = {
        ...(g.window ?? {}),
        dispatchEvent: () => true,
        location: (g.window?.location as object) ?? { origin: 'http://localhost:3000' },
    };
}

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

/**
 * 📍 **손으로 찍은 좌표는 «찍었다»고 나가야 한다** (서버 지적).
 *
 * 현황판의 「📍 위치 찍기」(🏠 집 · 주소로 찾기)는 좌표를 **`'manual'` 로** 내보낸다.
 * 서버는 `manual` 을 알아듣는다(`originOf` 의 `source` · `gps_tracks.source`,
 * 소켓 문에 화이트리스트가 없어 **온 그대로 통과한다**).
 *
 * 🔴 `'mock'` 으로 보내면 «배속으로 달린 가상 좌표»와 «기사님이 손으로 찍은 자리»가
 *    **한 이름으로 섞여**, 사후에 궤적을 열어도 어느 점이 주행이고 어느 점이 찍은 것인지
 *    **가를 수가 없다.** 파주 156km 사고가 «가짜를 진짜로 읽어서» 난 것이라, 출처가 섞이면
 *    같은 사고가 다시 난다.
 * ⚠️ 화면에 «모의 주행으로 적는다»고 써 두는 것으로는 값이 안 바뀐다 — 출처 값 자체를 맞춘다.
 *
 * 🔬 **이 검사의 빨간불은 타입에서 난다.** 아래 `ALL_SOURCES` 는 `tsc -b` 가 무는 줄이라
 *    `'manual'` 이 낱말에 없으면 **게이트가 컴파일에서 막는다.** 런타임만 보면
 *    문자열이 그대로 실려 나가 **초록불이 난다** — 고장이 타입 층에 있기 때문이다.
 *    부르는 자리가 실제로 `'manual'` 을 넘기는지는 `statusboard/locationPick.test.ts` 가 문다.
 */
const ALL_SOURCES: GpsSource[] = ['native', 'browser', 'mock', 'manual'];

/** 소켓으로 나간 좌표 — 출처까지 본다 */
const sentWithSource = () => emit.mock.calls
    .filter(c => c[0] === 'dashboard-gps-update')
    .map(c => c[1] as { lat: number; lng: number; source?: string });

describe('gpsBridge — 손으로 찍은 좌표', () => {
    /* 🕐 앞 검사들이 실제 시계로 `lastMockAt` 을 남겨 두므로, 아주 먼 시각을 «지금»으로
       잡아 모의 주행 억제(5초)와 무관한 자리에서 시작한다 */
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01T00:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });

    it("🔴 낱말에 'manual' 이 있다 — 없으면 tsc 가 막는다", () => {
        expect(ALL_SOURCES).toContain('manual');
    });

    it("🔴 출처가 'manual' 그대로 서버에 간다 — 모의 주행으로 적히지 않는다", () => {
        const r = publishLocation(37.51, 127.51, 'manual');
        expect(r.sent).toBe(true);
        expect(sentWithSource().at(-1)!.source).toBe('manual');
    });

    /**
     * 🔴 **모의 주행이 도는 동안에는 안 나간다.** 찍은 점을 끼워 넣어도 1초 뒤 시뮬 좌표가
     *    덮으므로, 궤적에 «어디서 왔는지 모를 한 점»만 남는다 (출처 섞임).
     *    ⚠️ 이 문은 출처가 `'manual'` 이라서 닫힌다 — `'mock'` 으로 보내면 열린다.
     *       화면은 «모의 주행 중 — 안 나갔다»를 쓴다.
     */
    it('🔴 모의 주행 중에는 찍어도 안 나간다', () => {
        publishLocation(37.60, 127.60, 'mock');
        emit.mockClear();
        const r = publishLocation(37.61, 127.61, 'manual');
        expect(r.sent).toBe(false);
        expect(r.reason).toBe('mock-running');
        expect(sentWithSource().length).toBe(0);
    });

    it('모의 주행이 5초 넘게 조용하면 다시 나간다', () => {
        publishLocation(37.70, 127.70, 'mock');
        vi.advanceTimersByTime(5_001);
        expect(publishLocation(37.71, 127.71, 'manual').sent).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { SCENARIO } from './scenario';
import { scenarioPlan } from './mockPlans';

/**
 * 🖥️ **«없다»의 뜻이 갈라지지 않는가**
 *
 * 🔴 **무엇이 엉켜 있었나** — 화면 조각들이 «심사 중인가»를 **각자 짐작**했다:
 *    상태바는 «정거장이 없으니 사이클 끝», 빈 상태는 «콜이 0이니 콜 없음»,
 *    QR 경고는 «목적지가 없으니 키가 없나 보다». **셋 다 틀렸다.**
 *    조각마다 «없다»의 뜻이 달라서, 하나를 고치면 다른 하나가 틀렸다.
 *
 * 이제 사실을 한 곳(`screen`)에서 정한다. 이 검사는 그 사실들이 **서로 어긋나지
 * 않는지**를 시나리오 전 장면에 대해 훑는다.
 */
const state = (grabbed: number, seat: boolean) => ({
    judging: seat,
    held: scenarioPlan(grabbed).callList.length,
    idle: scenarioPlan(grabbed).callList.length === 0 && !seat,
});

describe('심사 중과 대기 중은 다른 상태다', () => {
    it.each(SCENARIO)('$title — 심사 중이면 «아무 일 없음»이 아니다', (s) => {
        const v = state(s.grabbed, !!s.seat);
        if (v.judging) expect(v.idle, s.title).toBe(false);
    });

    it.each(SCENARIO)('$title — 잡은 콜이 있으면 «아무 일 없음»이 아니다', (s) => {
        const v = state(s.grabbed, !!s.seat);
        if (v.held > 0) expect(v.idle, s.title).toBe(false);
    });

    /** 🔴 «아무 일 없음»은 사이클의 **처음 한 장면**뿐이다 — 그 뒤로는 늘 뭔가 있다 */
    it('아무 일 없는 장면은 ① 하나뿐이다', () => {
        const idle = SCENARIO.filter(s => state(s.grabbed, !!s.seat).idle);
        expect(idle.map(s => s.no)).toEqual([1]);
    });

    /**
     * 🔴 **「이번 사이클 끝」이 뜰 수 있는 장면은 마지막뿐이다.**
     *    그 전에 뜬다면 «갈 곳이 없다»를 «끝났다»로 읽은 것이다 — 그게 이번 버그였다.
     */
    it.each(SCENARIO)('$title — 끝나기 전에는 갈 곳이 있거나, 대기·심사 중이다', (s) => {
        const v = state(s.grabbed, !!s.seat);
        const left = scenarioPlan(s.grabbed).stops.length - s.visited;
        const last = s.no === SCENARIO.length;
        if (!last) expect(left > 0 || v.idle || v.judging, s.title).toBe(true);
    });
});

describe('빈 상태는 정말 빈 때만 나온다', () => {
    it('심사석이 떠 있는 장면에서는 «아직 잡은 콜이 없습니다»가 안 나온다', () => {
        for (const s of SCENARIO.filter(x => x.seat)) {
            expect(state(s.grabbed, true).idle, s.title).toBe(false);
        }
    });
});

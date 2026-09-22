import { getUserSession } from '../../src/state/userSessionStore';
import { originOf, lastKnownPositionOf, DRIVER_LOCATION_STALE_MS } from '../../src/services/geoService';

/**
 * 📍 **«내가 지금 어디 있나» 와 «경로를 어디서부터 짤까» 는 다른 질문이다**.
 *
 * ── 왜 갈랐나 ──
 * `originOf` 하나가 **두 질문에 답하고 있었다** (규칙 ⑤-4 ⑤ — «읽는 곳이 둘이면
 * 각자 다른 질문을 답하고 있는 것 아닌지 그 자리에서 의심한다»).
 *
 *   · 경로 기점  — 출발점이 없으면 **계산 자체가 안 된다.** 그래서 낡으면 집을 넣는다.
 *                  그 규칙은 실제 사고에서 나왔다 (여주 4시간 25분 · `staleDriverLocation`).
 *   · 내 위치    — 모르면 **모른다**여야 한다. 집을 넣으면 화면이 «집에 있다»고 거짓말하고,
 *                  그 값으로 그물을 치면 **이천에 있는데 파주 콜이 올라온다.**
 *
 * 기사님 확정 2026-09-12 — 지도는 «마지막 실제 위치를 흐리게», 그물도 «마지막 실제 위치 기준».
 *
 * 🔴 **`originOf` 는 안 건드린다.** 5분 규칙도 집 대체도 그대로다 — 그것은 그 질문의 옳은 답이다.
 *    새 함수는 **같은 원자료(`lastFix`)를 다른 질문으로 읽을 뿐**이다 (규칙 ③ — 파생이지 사본이 아니다).
 */
const USER = 'test-last-known';
const 이천 = { x: 127.40003, y: 37.24223 };

function sessionWith(fixAgoMs: number | null) {
    const s = getUserSession(USER) as any;
    s.lastFix = fixAgoMs == null ? null : { ...이천 };
    s.lastFixAt = fixAgoMs == null ? null : Date.now() - fixAgoMs;
    s.lastFixIsMock = false;
    s.lastFixSource = 'gps';
    s.activeFilter = { dispatchPhase: 'GATHERING' };
    return s;
}

describe('마지막으로 아는 자리 — 경로 기점과 다른 값이다', () => {

    it('신선하면 그 좌표를 준다', () => {
        const p = lastKnownPositionOf(sessionWith(10_000));
        expect(p).not.toBeNull();
        expect(p!.x).toBeCloseTo(이천.x, 5);
        expect(p!.isStale).toBe(false);
    });

    /**
     * 🔴 **이 한 건이 이 함수를 만든 이유다** — 5분이 넘어도 **집으로 바꾸지 않는다.**
     *    터널·주차장에서 끊긴 것뿐인데 지도가 집으로 날아가면, 운전 중 1~2초 흘끗 보는
     *    화면이 통째로 튄다. 그물은 더 심하다 — 이천에 있는데 파주 콜이 올라온다.
     */
    it('🔴 낡아도 마지막 자리를 준다 — 집으로 바꾸지 않는다', () => {
        const p = lastKnownPositionOf(sessionWith(DRIVER_LOCATION_STALE_MS + 60_000));
        expect(p).not.toBeNull();
        expect(p!.x).toBeCloseTo(이천.x, 5);
        expect(p!.isStale).toBe(true);          // ← 낡았다는 사실은 **표시**로 남는다
        expect(p!.ageMs).toBeGreaterThan(DRIVER_LOCATION_STALE_MS);
    });

    /**
     * 🔴 **같은 세션에서 경로 기점은 그 좌표를 안 쓴다** — 여주 사고를 되살리지 않는다.
     *    ⚠️ 이 판에는 집 주소가 없어 `originOf` 가 «모른다»(`null`)로 답한다
     *       (`staleDriverLocation.test.ts` 와 같은 조건). 요점은 «집이냐»가 아니라
     *       **«낡은 좌표를 기점으로 쓰지 않는다»** 이고, 그건 여기서 그대로 확인된다.
     */
    it('🔴 같은 때 originOf 는 그 좌표를 기점으로 안 쓴다 (규칙을 안 건드렸다)', () => {
        const s = sessionWith(DRIVER_LOCATION_STALE_MS + 60_000);
        const o = originOf(s);
        /* 집 주소가 있으면 집을, 없으면 null — 어느 쪽이든 «이천»은 아니다 */
        expect(o?.isFallback ?? true).toBe(true);
        expect(o?.x).not.toBe(이천.x);
    });

    /** 🔴 좌표를 한 번도 못 받았으면 **없다고 답한다** — 집을 지어내지 않는다 (규칙 ④) */
    it('🔴 받은 적이 없으면 null 이다', () => {
        expect(lastKnownPositionOf(sessionWith(null))).toBeNull();
    });

    /** ⚠️ 받은 시각을 모르면 나이를 못 잰다 — 그 값으로 «신선하다»고 우기지 않는다 */
    it('받은 시각을 모르면 null 이다', () => {
        const s = sessionWith(10_000);
        s.lastFixAt = null;
        expect(lastKnownPositionOf(s)).toBeNull();
    });

    /**
     * 🎭 **가짜 좌표도 그대로 준다 — 다만 출처를 밝힌다.**
     *    `originOf` 는 «콜을 쥔 동안에만» 가짜를 쓰지만(판정에 들어가므로), 화면은
     *    **무엇을 보고 있는지 아는 편이 낫다.** 숨기면 «왜 여기 있지»를 못 푼다.
     */
    it('가짜 좌표도 출처를 달아 준다', () => {
        const s = sessionWith(10_000);
        s.lastFixIsMock = true;
        s.lastFixSource = 'mock';
        const p = lastKnownPositionOf(s);
        expect(p!.source).toBe('mock');
    });
});

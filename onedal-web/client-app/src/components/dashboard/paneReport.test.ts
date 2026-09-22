import { describe, it, expect } from 'vitest';
import { reportedPaneOf } from './paneReport';

/**
 * 🌱 **트랙이 «손으로 넘긴 것»만 알린다** (기사님 확정).
 *
 * ── 왜 가르나 ──
 * 도착이 «지금 할 단계»로 장을 열면, 트랙이 거기까지 넘어가는 **그 도중에** 스크롤
 * 이벤트가 지나가는 번호를 부모에게 알린다. 부모가 그 말을 믿고 장을 되돌리면 둘이 서로를
 * 밀며 엉뚱한 장에서 멈춘다 (같은 콜이 254ms 안에 네 번 오간 적이 있다):
 *
 *   4 ARRIVE_DROPOFF  →  5 DELIVERED
 *   5 DELIVERED       →  4 ARRIVE_DROPOFF   (+24ms)
 *   4 ARRIVE_DROPOFF  →  0 CALL_PICKUP      (+40ms)
 *   0 CALL_PICKUP     →  1 CALL_DROPOFF     (+190ms)
 *
 * 🔴 **스크롤 이벤트는 «누가 움직였나»를 말해 주지 않는다.** 그래서 원인이 아니라
 *    **자리**로 가른다 — 격자(장 경계)에 붙어 있으면 «멈춘 것»이고, 사이에 있으면
 *    «움직이는 중»이다. 움직이는 중에는 아무것도 알리지 않는다.
 *
 * 🟢 **트랙은 `behavior:'smooth'` 를 쓰지 않는다** (기사님 확정) — 부드러움은 `scroll-snap` 이 하고
 *    손이 멈추면 끝난다. 애니메이션이 없으면 중간 자리도 없으니 이 판단은 **겹쳐 둔 장치**다 (규칙 ②).
 *
 * ⚠️ 그래도 판단은 남긴다 — 창 폭이 바뀌면 같은 px 가 **다른 장**이 되고, 고무줄
 *    스크롤은 **없는 장**을 가리킨다. 그 둘은 애니메이션과 무관하게 남는다.
 */
describe('🌱 트랙이 알릴 장', () => {

    /** 손이 멈춰 장 경계에 붙었다 — 이때만 알린다 */
    it('격자에 붙어 있고 다른 장이면 알린다', () => {
        expect(reportedPaneOf(800, 400, 6, 0)).toBe(2);
    });

    /**
     * 🔴 **이 한 건이 이 파일을 만든 이유다** — 장과 장 사이는 «움직이는 중»이다.
     *    프로그램이 옮기든 손가락이 끌든, 그 자리에서 알리면 부모가 지나가는 번호로 되돌린다.
     */
    it('🔴 장과 장 사이면 알리지 않는다 (움직이는 중)', () => {
        expect(reportedPaneOf(30, 400, 6, 2)).toBeNull();    // 0→2 로 가는 첫 걸음
        expect(reportedPaneOf(520, 400, 6, 2)).toBeNull();   // 1과 2 사이
    });

    it('같은 장이면 알릴 것이 없다', () => {
        expect(reportedPaneOf(800, 400, 6, 2)).toBeNull();
    });

    /** 🔴 접힌 카드는 폭이 0 이다 — 나누면 안 된다 (Infinity·NaN 이 번호가 된다) */
    it('🔴 폭이 0 이면 알리지 않는다 (접힌 카드)', () => {
        expect(reportedPaneOf(0, 0, 6, 2)).toBeNull();
    });

    /** 스냅이 1~2px 어긋나게 멈추는 것은 «붙은 것»으로 본다 */
    it('몇 px 어긋난 것은 붙은 것으로 본다', () => {
        expect(reportedPaneOf(802, 400, 6, 0)).toBe(2);
        expect(reportedPaneOf(797, 400, 6, 0)).toBe(2);
    });

    /**
     * 🔴 **없는 장을 가리키지 않는다** — 고무줄 스크롤(overscroll)은 음수나 끝 너머로 간다.
     *    그 번호를 부모에게 주면 «6번째 장»처럼 없는 자리를 열려 한다 (규칙 ④).
     */
    it('🔴 고무줄 스크롤은 알리지 않는다', () => {
        expect(reportedPaneOf(-40, 400, 6, 2)).toBeNull();
        expect(reportedPaneOf(2400, 400, 6, 2)).toBeNull();   // 장은 0~5 뿐이다
    });
});

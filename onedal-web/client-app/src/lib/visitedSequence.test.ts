import { describe, it, expect } from 'vitest';
import { visitedSequenceOf } from './visitedSequence';

/**
 * 👣 **다녀온 순서 — 좌표를 몰라도 번호는 받는다** (기사님 실측).
 *
 * ── 무엇이 깨지나 ──
 * 좌표 없는 행을 빼면 화면 번호가 통째로 무너진다. 계측(`[번호]`·`[다녀옴]`)으로는 이렇게 보인다:
 *
 *   [다녀옴] c7cc48 PICKED_UP 상22:57 하23:40  →  c7cc48 PICKED_UP 상— 하—
 *   [번호]   ✓1초월읍상 … ✓6중리동하           →  1중리동하
 *
 * 여섯이 하나로 준다. 🔴 **콜의 도착 시각과 좌표가 사라진 행**이 빠지기 때문이다.
 *
 * ── 왜 사라지나 ──
 * 관제웹은 콜 목록을 세 갈래로 합친다 (`mergeOrderViews`) — 이력(REST) · 종료분 · 진행분(소켓).
 * **이력이 바탕으로 깔리고** 소켓이 그 위를 덮는다. 그런데 이력은 `GET /api/orders` 의
 * `SELECT * FROM orders` 이고, 그 표에는 **좌표도 도착 시각도 없다** (둘 다 다른 표에 산다 —
 * `orderStops`+`places`, `step_arrive_*`). 그래서 어떤 렌더에서 소켓이 그 콜을 안 실어 주면
 * **이력만 남아 «안 다녀온 콜»이 된다.**
 *
 * 🔴 **그렇다고 번호가 무너질 이유는 없다.** 번호를 세는 데 좌표는 필요 없다 —
 *    좌표가 필요한 것은 **지도 마커**다. 한 목록이 두 질문에 답하게 두지 않는다 (규칙 ⑤-4 ⑤):
 *      «몇 번째로 다녀왔나»  → 좌표가 필요 없다   ← 번호
 *      «지도에 어디 찍나»    → 좌표가 필요하다   ← 마커
 *    그래서 목록은 하나로 두고, **지도가 제 쪽에서 좌표 없는 것을 걸러 낸다**
 *    (`PinnedRouteCanvas` 가 `Number.isFinite` 로 거른다).
 *
 * ⚠️ 이력이 빈약한 것 자체는 **서버가 고칠 일**이다 (좌표·도착 시각을 함께 주면 원천이 하나가
 *    된다). 여기는 «이력만 남아도 번호가 안 무너지게» 하는 겹쳐 둔 장치다 (규칙 ②).
 */
const call = (o: Partial<Parameters<typeof visitedSequenceOf>[0][number]> & { id: string }) => ({
    pickup: `${o.id}상`, dropoff: `${o.id}하`,
    pickupX: 127.1, pickupY: 37.1, dropoffX: 127.2, dropoffY: 37.2,
    ...o,
} as Parameters<typeof visitedSequenceOf>[0][number]);

const seq = (deck: Parameters<typeof visitedSequenceOf>[0]) =>
    visitedSequenceOf(deck, (a) => a).map(v => `${v.name}`);

describe('👣 다녀온 순서', () => {

    /**
     * 🔴 **이 한 건이 이 파일을 만든 이유다** — 이력만 남아 좌표가 없는 행.
     *    여기서 빠지면 ✓ 여섯이 하나로 준다.
     */
    it('🔴 좌표를 몰라도 순서에 든다 (이력만 남은 행)', () => {
        const deck = [call({
            id: 'A', status: 'ORDER_PICKED_UP',
            pickupX: null, pickupY: null, dropoffX: null, dropoffY: null,
            arrivedPickupAt: '2026-09-12T23:22:57+09:00',
        })];
        expect(seq(deck)).toEqual(['A상']);
    });

    it('도착 시각 순이다', () => {
        const deck = [
            call({ id: 'A', status: 'ORDER_PICKED_UP', arrivedPickupAt: '2026-09-12T23:22:57+09:00' }),
            call({ id: 'B', status: 'ORDER_PICKED_UP', arrivedPickupAt: '2026-09-12T23:21:46+09:00' }),
        ];
        expect(seq(deck)).toEqual(['B상', 'A상']);
    });

    /**
     * 🔴 **시각을 모르면 뒤로 — 그리고 그 사이에서는 덱 순서를 지킨다.**
     *    `0` 을 넣으면 «아주 옛날»이라 ✓1 을 훔친다.
     *    ⚠️ 안정 정렬이라야 시각이 다 사라진 경우(이력만 남은 행)에도 번호가 흔들리지 않는다.
     */
    it('🔴 시각을 모르면 뒤로 가고, 그 사이에서는 덱 순서를 지킨다', () => {
        const deck = [
            call({ id: 'A', status: 'ORDER_PICKED_UP' }),                      // 시각 없음
            call({ id: 'B', status: 'ORDER_PICKED_UP' }),                      // 시각 없음
            call({ id: 'C', status: 'ORDER_PICKED_UP', arrivedPickupAt: '2026-09-12T23:21:46+09:00' }),
        ];
        expect(seq(deck)).toEqual(['C상', 'A상', 'B상']);
    });

    it('안 다녀온 정거장은 안 든다', () => {
        const deck = [call({ id: 'A', status: 'ORDER_CONFIRMED' })];
        expect(seq(deck)).toEqual([]);
    });

    it('하차 완료된 콜은 상·하차 둘 다 든다', () => {
        const deck = [call({ id: 'A', status: 'ORDER_DELIVERED' })];
        expect(seq(deck)).toEqual(['A상', 'A하']);
    });

    /**
     * 🔴 취소·방출은 **없던 일**이라 발자취에 안 남는다 (`deckOfCycle` 과 같은 기준).
     *    ⚠️ 여기 적는 상태값은 `TERMINAL_STATUSES` 에 있는 값만 쓴다 — 없는 상태값을 적으면
     *       검사가 헛돈다. **스키마를 먼저 본다.**
     */
    it('🔴 취소·방출은 안 든다 (SAFE_CANCEL · 사무실 방출)', () => {
        for (const status of ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE']) {
            const deck = [call({ id: 'A', status, arrivedPickupAt: '2026-09-12T23:21:46+09:00' })];
            expect(seq(deck)).toEqual([]);
        }
    });
});

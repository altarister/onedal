import { describe, it, expect } from 'vitest';
import { hiddenPastIds } from './pastCalls';

/**
 * 🙈 **지나간 콜 숨기기** (기사님 지시 2026-09-13: *"오른쪽 끝에 지나간 콜 숨기기가
 *    있으면 좋겠는데… 아코디언의 콜타이틀중 배송이 끝난콜을 숨겼다 보였다"*).
 *
 * ── 왜 필요한가 ──
 * 덱은 **하차를 마친 콜도 사이클이 끝날 때까지 함께 보여 준다**(`deckOfCycle`) — 6단계가
 * 채워진 모습을 볼 수 없다는 기사님 말씀으로 그렇게 정했다. 그런데 콜이 여섯이면 끝난
 * 줄이 목록을 눌러앉아 **지금 할 콜이 아래로 밀린다.**
 *
 * 🔴 **끝난 콜은 «지운다»가 아니라 «접는다»다.** 목록에서 빼면 `openIdx`(목록 자리)가
 *    다른 콜을 가리킨다 — 화면규칙 L3 가 경고한 그 자리다(*"콜은 번호로 찾는다 —
 *    뺄셈으로 찾지 않는다"*). 그래서 **배열은 그대로 두고 «숨길 id»만 넘긴다.**
 * 🔴 **언마운트하지 않는다** — 접힌 콜을 마운트한 채 숨기는 규칙이 이미 있다
 *    (버그 대장 #95: 언마운트하면 통화 중 적던 단위·수량이 날아간다). 여기도 같다.
 *
 * 🔴 **열어 둔 콜은 숨기지 않는다.** 기사님이 끝난 콜을 일부러 펼쳐 보는 중에 하차가
 *    찍히면, 숨김이 켜져 있다는 이유로 **보고 있던 것이 사라진다.** 손이 고른 것이
 *    자동 규칙보다 세다. 닫으면 그때 사라진다 — 스스로 맞아 들어간다.
 */
const call = (id: string, status: string) => ({ id, status });

describe('🙈 지나간 콜 숨기기', () => {

    it('숨김이 꺼져 있으면 아무것도 숨기지 않는다', () => {
        const got = hiddenPastIds([call('a', 'ORDER_DELIVERED'), call('b', 'ORDER_PICKED_UP')], false, null);
        expect([...got]).toEqual([]);
    });

    it('배송이 끝난 콜만 숨긴다', () => {
        const got = hiddenPastIds([
            call('a', 'ORDER_DELIVERED'),
            call('b', 'ORDER_PICKED_UP'),
            call('c', 'ORDER_COMPLETED'),
            call('d', 'ORDER_CONFIRMED'),
        ], true, null);
        expect([...got].sort()).toEqual(['a', 'c']);
    });

    /**
     * 🔴 **이 한 건이 손을 지킨다** — 끝난 콜을 펼쳐 보는 중에 숨김이 켜져 있어도
     *    보고 있던 것이 사라지지 않는다.
     */
    it('🔴 열어 둔 콜은 끝났어도 숨기지 않는다', () => {
        const got = hiddenPastIds([call('a', 'ORDER_DELIVERED'), call('c', 'ORDER_DELIVERED')], true, 'a');
        expect([...got]).toEqual(['c']);
    });

    /** ⚠️ 취소·방출은 애초에 덱에 없다 (`deckOfCycle`) — 여기서 다시 가르지 않는다 */
    it('빈 목록이면 빈 집합이다', () => {
        expect([...hiddenPastIds([], true, null)]).toEqual([]);
    });
});

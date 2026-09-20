import { describe, it, expect } from 'vitest';
import type { OrderStatus } from '@onedal/shared';
import { belongsToView, callsInView, countsByView, finishedCount, FINISHED_TABS } from './finishedCalls';

/**
 * 📋 **끝난 콜 갈래 — 서랍과 옛 화면이 같은 답을 내는가**
 *
 * 이 규칙이 두 벌이 되면 «취소 탭에는 있는데 서랍에는 없는» 콜이 생긴다.
 * 여기서 규칙을 고정하고, `finishedCallsSingleSource` 규칙 검사가
 * **두 화면이 정말 이 함수를 부르는지**를 따로 문다.
 */

const call = (id: string, status: OrderStatus, capturedAt?: string) => ({ id, status, capturedAt });
const NONE = new Set<string>();

describe('belongsToView — 갈래 판정', () => {
    it('하차 완료는 «완료됨» 이다', () => {
        expect(belongsToView(call('a', 'ORDER_DELIVERED'), 'COMPLETED', false)).toBe(true);
    });

    /** 🔴 이게 이 함수가 있는 이유 중 하나다 — 같은 콜이 두 탭에 동시에 보이면 안 된다 */
    it('🔴 사이클 덱에 아직 있으면 «완료됨» 에 넣지 않는다 — 진행 중에 이미 보인다', () => {
        expect(belongsToView(call('a', 'ORDER_DELIVERED'), 'COMPLETED', true)).toBe(false);
    });

    it('안전취소는 «취소» 다', () => {
        expect(belongsToView(call('b', 'SAFE_CANCEL'), 'CANCELED', false)).toBe(true);
        expect(belongsToView(call('b', 'SAFE_CANCEL'), 'RELEASED', false)).toBe(false);
    });

    it('방출은 내가 놓은 것과 사무실이 뺀 것 둘 다다', () => {
        expect(belongsToView(call('c', 'ORDER_RELEASED_BY_ME'), 'RELEASED', false)).toBe(true);
        expect(belongsToView(call('d', 'ORDER_RELEASED_BY_OFFICE'), 'RELEASED', false)).toBe(true);
    });

    it('진행 중은 덱이 담당한다 — 여기서는 아무것도 안 준다', () => {
        expect(belongsToView(call('e', 'ORDER_PICKED_UP'), 'ACTIVE', false)).toBe(false);
    });

    it('진행 중 콜은 끝난 갈래 어디에도 안 든다', () => {
        for (const t of FINISHED_TABS) {
            expect(belongsToView(call('e', 'ORDER_PICKED_UP'), t.key, false)).toBe(false);
        }
    });
});

describe('callsInView — 줄 세우기', () => {
    it('나중에 잡은 것이 위로 온다', () => {
        const list = [
            call('old', 'SAFE_CANCEL', '2026-09-21T01:00:00Z'),
            call('new', 'SAFE_CANCEL', '2026-09-21T05:00:00Z'),
        ];
        expect(callsInView(list, 'CANCELED', NONE).map(c => c.id)).toEqual(['new', 'old']);
    });

    it('잡은 시각이 없어도 떨어뜨리지 않는다 — 맨 아래로 간다 (규칙 ④)', () => {
        const list = [call('없음', 'SAFE_CANCEL'), call('있음', 'SAFE_CANCEL', '2026-09-21T05:00:00Z')];
        expect(callsInView(list, 'CANCELED', NONE).map(c => c.id)).toEqual(['있음', '없음']);
    });

    it('다른 갈래의 콜은 섞이지 않는다', () => {
        const list = [call('x', 'SAFE_CANCEL'), call('y', 'ORDER_RELEASED_BY_ME'), call('z', 'ORDER_DELIVERED')];
        expect(callsInView(list, 'CANCELED', NONE).map(c => c.id)).toEqual(['x']);
    });
});

describe('countsByView — 탭에 적는 숫자', () => {
    const list = [
        call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_DELIVERED'),
        call('3', 'SAFE_CANCEL'),
        call('4', 'ORDER_RELEASED_BY_ME'),
        call('5', 'ORDER_PICKED_UP'),          // 진행 중 — 어디에도 안 센다
    ];

    it('갈래마다 센다', () => {
        expect(countsByView(list, NONE)).toEqual({ COMPLETED: 2, CANCELED: 1, RELEASED: 1 });
    });

    it('🔴 숫자와 목록이 같은 규칙을 쓴다 — 탭에 «4» 라고 적고 세 줄만 보이면 안 된다', () => {
        const counts = countsByView(list, NONE);
        for (const t of FINISHED_TABS) {
            expect(callsInView(list, t.key, NONE)).toHaveLength(counts[t.key]);
        }
    });

    it('사이클 덱에 있는 하차 완료는 세지 않는다', () => {
        expect(countsByView(list, new Set(['1'])).COMPLETED).toBe(1);
    });

    it('끝난 콜 합계는 셋의 합이다', () => {
        expect(finishedCount(list, NONE)).toBe(4);
    });
});

import { describe, it, expect } from 'vitest';
import { sheetTransition } from './sheetTransition';

/**
 * 🧪 **«있을 수 없는 화면»을 만들지 않는다** (기사님 2026-09-05)
 *
 * 🔴 조작판의 「시트 높이」 버튼이 전이 규칙을 건너뛰고 높이만 바꿔서,
 *    **시트는 100% 인데 아코디언이 다 닫혀 아래가 텅 빈** 화면이 나왔다.
 *    «다»의 정의에 «하나 열린»이 들어 있으니, 그런 상태는 정의상 없어야 한다.
 */
describe('다(full) — 하나가 열려 있어야 한다', () => {
    it('열린 것이 없으면 다음 갈 콜을 연다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 3, preferIdx: 1 }))
            .toEqual({ snap: 'full', openIdx: 1 });
    });

    it('다음 갈 콜을 모르면 첫 콜을 연다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 3 }))
            .toEqual({ snap: 'full', openIdx: 0 });
    });

    it('이미 열린 것이 있으면 그대로 둔다 — 남의 선택을 뺏지 않는다', () => {
        expect(sheetTransition('full', { openIdx: 2, callCount: 3, preferIdx: 0 }))
            .toEqual({ snap: 'full', openIdx: 2 });
    });

    /** 🔴 콜이 없으면 «다»가 될 수 없다 — 빈 자리가 지도를 덮을 뿐이다 */
    it('콜이 하나도 없으면 다로 안 간다 — 나에 선다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 0 }))
            .toEqual({ snap: 'list', openIdx: -1 });
    });

    it('없는 자리를 가리키면 첫 콜로 떨어진다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 2, preferIdx: 7 }))
            .toEqual({ snap: 'full', openIdx: 0 });
    });
});

describe('가·나 — 열린 것이 없는 단이다', () => {
    it.each(['peek', 'list'] as const)('%s 로 내려오면 열린 것을 닫는다', (to) => {
        expect(sheetTransition(to, { openIdx: 1, callCount: 3 }))
            .toEqual({ snap: to, openIdx: -1 });
    });

    it.each(['peek', 'list'] as const)('%s 는 이미 닫혀 있으면 그대로다', (to) => {
        expect(sheetTransition(to, { openIdx: -1, callCount: 3 }))
            .toEqual({ snap: to, openIdx: -1 });
    });
});

describe('어느 길로 가도 «있을 수 없는 화면»이 안 나온다', () => {
    /** 🔴 전수로 훑는다 — 손으로 끌든 조작판에서 누르든 같은 함수를 지난다 */
    it('다인데 닫혀 있거나, 가·나인데 열려 있는 결과가 없다', () => {
        for (const to of ['peek', 'list', 'full'] as const) {
            for (const openIdx of [-1, 0, 1, 2]) {
                for (const callCount of [0, 1, 3]) {
                    const r = sheetTransition(to, { openIdx, callCount });
                    if (r.snap === 'full') expect(r.openIdx, `${to}/${openIdx}/${callCount}`).toBeGreaterThanOrEqual(0);
                    else expect(r.openIdx, `${to}/${openIdx}/${callCount}`).toBe(-1);
                }
            }
        }
    });
});

import { describe, it, expect } from 'vitest';
import { sheetTransition, snapOnJudging, snapAfterJudging } from './sheetTransition';

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

    /**
     * 🪜 **S13 — 사건이 가리킨 콜은 열린 것을 이긴다** (기사님 실측 2026-09-12).
     *
     * 기사님: *"1, 3, 5는 시트가 올라갔어 **근데 그 스텝이 열리지는 않았어**"*
     *
     * 🔴 `preferIdx`(약한 추천)와 `focusIdx`(강한 지시)는 **답하는 질문이 다르다**
     *    (규칙 ⑤-4 ⑤). 하나로 겸하다가 도착이 가리킨 콜이 «추천»으로 들어가
     *    **열려 있던 딴 콜에 밀렸다.** v23 Ⅲ-S6/S7 이 정한 것은 «그 콜의 그 단계»다.
     */
    it('🔴 도착·KEEP 이 가리킨 콜은 열린 것을 이긴다 (S13)', () => {
        expect(sheetTransition('full', { openIdx: 2, callCount: 3, focusIdx: 0 }))
            .toEqual({ snap: 'full', openIdx: 0 });
    });

    it('🔴 가리킨 것이 범위 밖이면 열린 것을 지킨다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(sheetTransition('full', { openIdx: 2, callCount: 3, focusIdx: 9 }))
            .toEqual({ snap: 'full', openIdx: 2 });
    });

    /**
     * 🔴 **콜이 없어도 올라간다** (기사님 확정 2026-09-05) — 빈 상태를 보여 준다.
     *    막아 두면 끌었는데 아무 일이 없어 **고장처럼 보인다.**
     *    관행(iOS·안드로이드 기본 시트)도 단은 내용과 무관하게 늘 있다.
     */
    it('콜이 하나도 없어도 다로 갈 수 있다 — 빈 채로 올라간다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 0 }))
            .toEqual({ snap: 'full', openIdx: -1 });
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
                    /* 🔴 «다»는 **콜이 있으면** 하나가 열려 있어야 한다.
                       콜이 없으면 빈 채로 서는 것이 맞다 (기사님 확정). */
                    if (r.snap === 'full' && callCount > 0) {
                        expect(r.openIdx, `${to}/${openIdx}/${callCount}`).toBeGreaterThanOrEqual(0);
                    } else {
                        expect(r.openIdx, `${to}/${openIdx}/${callCount}`).toBe(-1);
                    }
                }
            }
        }
    });
});

describe('✋ 끌 것이 없을 때 (2026-09-05)', () => {
    /**
     * 기사님: *"이때 시트가 위아래로 드래그 되지 않아."* — 「① 콜 대기」에서다.
     *
     * 🔴 **그게 맞는 동작이다** — 콜이 없으면 「다」의 정의(«하나 열린 상태»)를 채울 수
     *    없으니 갈 곳이 없다. 문제는 **화면이 그 말을 안 한 것**이다.
     *    할 수 없는 일은 **할 수 없게 보여야 한다** — 손잡이가 흐려진다.
     */
    it('콜이 없어도 세 단을 다 오간다 — 열린 것만 없을 뿐이다', () => {
        for (const to of ['peek', 'list', 'full'] as const) {
            const r = sheetTransition(to, { openIdx: -1, callCount: 0 });
            expect(r.snap).toBe(to);
            expect(r.openIdx).toBe(-1);
        }
    });

    it('콜이 하나라도 있으면 다로 갈 수 있다', () => {
        expect(sheetTransition('full', { openIdx: -1, callCount: 1 }).snap).toBe('full');
    });
});

describe('🪧 심사가 들어오면 시트가 올라온다 (2026-09-05)', () => {
    /**
     * 기사님: *"심사가 들어오면 시트가 2단계로 올라와야 한다. 이거 있어?"* — 없었다.
     *
     * 🔴 「가」는 상태바만 보이는 높이라 **판정이 들어갈 자리가 없다.** 주행 중에 합짐
     *    심사가 와도 화면에 아무것도 안 뜨고, 30초가 흘러 자동 취소된다.
     */
    it('가(주행 중)에 있으면 나로 올라온다', () => {
        expect(snapOnJudging('peek')).toBe('list');
    });

    it('이미 보이는 자리면 건드리지 않는다', () => {
        expect(snapOnJudging('list')).toBe('list');
        expect(snapOnJudging('full')).toBe('full');
    });

    /** 🔴 주행 중이었으면 다시 내려가야 한다 — 심사 하나로 남은 주행 내내 지도가 가리면 안 된다 */
    it('심사가 끝나면 올려 온 자리로 되돌아간다', () => {
        expect(snapAfterJudging('list', 'peek')).toBe('peek');
    });

    it('올린 적이 없으면 그대로 둔다 — 손으로 올려 두신 것을 뺏지 않는다', () => {
        expect(snapAfterJudging('list', null)).toBe('list');
        expect(snapAfterJudging('full', null)).toBe('full');
    });

    it('심사 중에 손으로 더 올리셨으면 그것도 안 뺏는다', () => {
        expect(snapAfterJudging('full', 'peek')).toBe('full');
    });
});

/**
 * 🔴 **자동 전환도 이 규칙을 거쳐야 한다** (기사님 실물 2026-09-06)
 *
 * 기사님: *"킵하고 나서 전화할 수 있게 시트를 최상단으로 올리고 아코디언에 이번에
 * 킵한 콜 정보를 담아서 열어야 하는데 열려 있지 않았어. 그렇다는 이야기는
 * «아코디언이 열리지 않으면 시트는 나 지점으로 간다»라는 기준도 못 지킨 거야."*
 *
 * 🔴 뿌리: `StageView` 의 `feed()` 가 **`setSnap` 만** 했다. 아코디언을 여닫는 계산은
 *    `sheetTransition` 안에 있는데 **손으로 끌 때만 그 길을 탔다** —
 *    KEEP·도착으로 자동으로 「다」에 올라가면 **빈 시트가 지도를 덮었다.**
 *    규칙은 있었고(S3·S4) 검사도 있었는데, **자동 경로가 그 규칙을 안 불렀다.**
 *    이 레포가 반복해 겪은 «규칙 파일을 목업·검사만 쓰고 실물이 안 부른다» 모양이다.
 *
 * ⚠️ 여기서 막을 수 있는 것은 **규칙 자체**뿐이다 — 「누가 부르는가」는 소스 검사로 본다.
 *    아래 둘은 그 규칙이 **자동 경로에서 요구되는 모양**을 못박는다.
 */
describe('자동 전환(KEEP·도착) — 높이와 아코디언이 함께 움직인다', () => {
    it('🔴 KEEP 으로 「다」에 올라가면 **그 콜**이 열린다', () => {
        // 방금 KEEP 한 콜이 덱의 두 번째(idx 1)일 때
        expect(sheetTransition('full', { openIdx: -1, callCount: 3, preferIdx: 1 }))
            .toEqual({ snap: 'full', openIdx: 1 });
    });

    it('🔴 KEEP 한 콜을 못 찾아도 「다」는 빈 채로 서지 않는다', () => {
        // preferIdx 를 못 구한 경우(덱에 아직 안 들어옴) — 첫 콜이라도 연다
        const mv = sheetTransition('full', { openIdx: -1, callCount: 2 });
        expect(mv.snap).toBe('full');
        expect(mv.openIdx).toBeGreaterThanOrEqual(0);
    });

    it('🟢 자동으로 「나」로 내려오면 열린 것을 닫는다 (S4)', () => {
        expect(sheetTransition('list', { openIdx: 2, callCount: 3 }))
            .toEqual({ snap: 'list', openIdx: -1 });
    });
});

import { describe, it, expect } from 'vitest';
import { isPriorityLocked, isPriorityLockedByGoals, ROUTE_PRIORITIES, PRIORITY_SAMPLE, PRIORITY_LABEL } from './routePriority';

/**
 * 🧪 **경로 방침 — 언제 잠기나**
 *
 * 규칙을 `routePriority` 한 곳에 두어 실물 화면(`StageView`)과 목업(`SheetMockup`)이 같은 함수를 부른다.
 * 두 벌로 적으면 실물이 바뀔 때 목업이 조용히 지난 규칙을 그린다 (규칙 ③). 그 한 곳을 여기서 잠근다.
 */
describe('🛣️ 고를 수 있는 셋', () => {
    it('추천 · 시간 · 거리', () => {
        expect(ROUTE_PRIORITIES.map(p => p.key)).toEqual(['RECOMMEND', 'TIME', 'DISTANCE']);
    });

    /**
     * 🔴 **추천과 시간이 같은 값이다** — 실수가 아니라 실측이다.
     *    우리 길찾기 API 에 「고속도로 우선」에 딱 맞는 값이 없어 `TIME` 으로 근사한다.
     *    여덟 구간을 재 보니 **일곱에서 추천과 같았다.**
     *    ⚠️ 이 검사가 깨지면 «누가 값을 그럴듯하게 지어냈나»를 먼저 의심한다.
     */
    it('이 구간에서는 추천과 시간이 같다 — 지어낸 차이를 넣지 않는다', () => {
        expect(PRIORITY_SAMPLE.TIME).toEqual(PRIORITY_SAMPLE.RECOMMEND);
    });

    it('거리는 짧고 느리다 — 09-03 실측 (경로.md §2-1)', () => {
        expect(PRIORITY_SAMPLE.DISTANCE.km).toBeLessThan(PRIORITY_SAMPLE.RECOMMEND.km);
        expect(PRIORITY_SAMPLE.DISTANCE.min).toBeGreaterThan(PRIORITY_SAMPLE.RECOMMEND.min);
    });

    it('통행료는 셋 다 같다 — 이 구간에서는 유료도로를 안 피한다', () => {
        for (const p of ROUTE_PRIORITIES) expect(PRIORITY_SAMPLE[p.key].toll).toBe(1900);
    });
});

describe('🏷️ 이름 — 기사님이 개인폰에서 보는 말과 같아야 한다', () => {
    /**
     * 기사님: *"이 아이콘을 내비에서 보던 것과 같은 text로 해야 할 것 같아."*
     *
     * 🔴 폰 둘을 오가며 쓰는 제품이다. 관제폰이 「시간」이라 하고 개인폰 카카오내비가
     *    「큰길 우선」이라 하면 **같은 것을 다르게 부르는 것**이라 그 자리에서 헷갈린다.
     */
    it('카카오내비 화면의 이름을 그대로 쓴다', () => {
        expect(ROUTE_PRIORITIES.map(p => p.naviLabel))
            .toEqual(['내비추천', '큰길 우선', '최단거리']);
    });

    /**
     * ⚠️ **이름만 맞추고 근사라는 사실은 안 감춘다** — 우리가 보내는 값은 여전히 `TIME`
     *    이고, 「큰길 우선」에 딱 맞는 값이 없어 근사한 것이다.
     */
    it('「큰길 우선」이 근사라는 것을 설명이 말한다', () => {
        expect(ROUTE_PRIORITIES.find(p => p.key === 'TIME')!.long).toMatch(/근사/);
    });

    it('짧은 이름 사전은 같은 목록에서 나온다 — 두 벌로 적지 않는다', () => {
        for (const p of ROUTE_PRIORITIES) expect(PRIORITY_LABEL[p.key]).toBe(p.label);
    });
});

describe('🔴 합짐이 화면에 오르는 순간부터 잠긴다 (기사님 2026-09-05 정정)', () => {
    /**
     * 기사님: *"합짐1 심사 때 경로를 바꿀 수 없다 — 이미 그 경로로 들어온 콜일 테니까."*
     *
     * 🔴 **이유가 결정적이다.** 합짐은 **첫짐 경로 위에서 산출된 콜**이다. 그 경로를
     *    바꾸면 «가는 길에 있다»는 산출 근거 자체가 사라진다. 심사 중이라고 열어 두면
     *    **자기를 불러온 경로를 자기가 지우는** 꼴이다.
     *
     * 그래서 세는 것은 «확정»이 아니라 **«화면에 올라 있는 콜»** 이다 — 심사 중인 것도 센다.
     *
     *   첫콜 심사   0 + 1 = 1  🔓 열림 — 붙일 콜이 하나뿐이니 경로를 골라 본다
     *   첫콜 확정   1 + 0 = 1  🔓 열림 — *"합짐 잡기 전까지 바꿀 수 있어야 해"*
     *   합짐1 심사  1 + 1 = 2  🔒 **잠김** ← 심사 중이어도 잠긴다
     *   합짐1 확정  2 + 0 = 2  🔒 잠김
     *
     * ⚠️ «심사 중에는 열어 둔다»는 **첫콜 심사**에만 맞는 말이다 — 심사 중이면 무조건 여는
     *    예외(`&& !anyEvaluating`)를 붙이면 합짐1 심사에서 잠금이 풀린다. 그래서 `liveRoute.length`
     *    (심사 포함) 하나만 센다.
     */
    it('첫콜 심사 — 열려 있다', () => {
        expect(isPriorityLocked(1)).toBe(false);
    });

    it('합짐1 심사 — 잠긴다 (확정 1 + 심사 1)', () => {
        expect(isPriorityLocked(2)).toBe(true);
    });

    it('주행 중 합짐2 심사 — 잠긴다 (확정 2 + 심사 1)', () => {
        expect(isPriorityLocked(3)).toBe(true);
    });

    it('콜이 없거나 하나뿐이면 열려 있다', () => {
        expect(isPriorityLocked(0)).toBe(false);
        expect(isPriorityLocked(1)).toBe(false);
    });
});

/**
 * 🆕 **R7 — 목적지가 다른 콜이 들어오면 다시 열린다** (기사님 확정).
 *
 * 기사님: *"**몇 개가 남아 있든 간에 목적지가 바뀐 콜이 있으면**이 맞아."*
 *
 * 잠그는 근거(R2)는 «합짐은 **첫짐 경로 위에서 산출된 콜**»인데, 새 목적지 콜은
 * **새 목적지를 보고 산출된 것**이라 지금 경로에 매일 이유가 없다. 목업이 그 화면을 이미 그린다:
 *
 *     ① 송정동 → ③ 내유동   🎯 파주시
 *     ② 장암동 → ④ 송정동   🎯 복귀(집)     ← 목적지가 다른 첫짐
 */
describe('🎯 R7 — 판이 섞이면 다시 열린다', () => {

    it('첫 콜 심사 — 판이 하나여도 열려 있다 (R3)', () => {
        expect(isPriorityLockedByGoals(['파주시'])).toBe(false);
        expect(isPriorityLockedByGoals([])).toBe(false);
    });

    it('같은 판 둘 — 잠긴다 (R2 그대로)', () => {
        expect(isPriorityLockedByGoals(['파주시', '파주시'])).toBe(true);
        expect(isPriorityLockedByGoals(['파주시', '파주시', '파주시'])).toBe(true);
    });

    /** 🔴 **이 한 건이 R7 이다** — 콜이 몇이든 목적지가 섞이면 열린다 */
    it('🔴 판이 둘 — 콜이 몇이든 열린다', () => {
        expect(isPriorityLockedByGoals(['파주시', '복귀(집)'])).toBe(false);
        expect(isPriorityLockedByGoals(['파주시', '파주시', '복귀(집)'])).toBe(false);
        expect(isPriorityLockedByGoals(['파주시', '파주시', '파주시', '복귀(집)'])).toBe(false);
    });

    /**
     * ⚠️ **모르는 목적지는 세지 않되, 하나도 모르면 잠근다** — 모른다고 열어 주면 R2 가
     *    통째로 풀린다. 목적지 칸이 빈 콜이 섞여도 안전한 쪽으로 기운다 (규칙 ④).
     */
    it('판을 모르는 콜 — 섞여 있으면 아는 것만 센다', () => {
        expect(isPriorityLockedByGoals(['파주시', null])).toBe(true);          // 아는 목적지가 하나뿐
        expect(isPriorityLockedByGoals(['파주시', null, '복귀(집)'])).toBe(false);
    });

    it('🔴 판을 하나도 모르면 잠근다 — 열어 주면 규칙이 통째로 풀린다', () => {
        expect(isPriorityLockedByGoals([null, undefined])).toBe(true);
        expect(isPriorityLockedByGoals([null, null, null])).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { SCENARIO } from './scenario';
import { scenarioPlan, SCENARIO_CALL_ORDER, reaskCost, reaskedPlan } from './mockPlans';

/**
 * 🧪 **기사님이 적어 주신 한 사이클이 스스로 어긋나지 않는가** (2026-09-05)
 *
 * 🔴 이 검사가 잡는 것은 «시나리오 글»과 «목업이 그리는 판»이 갈라지는 것이다.
 *    단계가 «3콜 잡았다»는데 판에 콜이 둘이면, 화면은 멀쩡해 보이고 **글만 거짓말을 한다.**
 */

describe('시나리오 — 차례가 뒤로 가지 않는다', () => {
    it('번호가 1부터 빠짐없이 이어진다', () => {
        expect(SCENARIO.map(s => s.no)).toEqual(SCENARIO.map((_, i) => i + 1));
    });

    it('잡은 콜 수는 줄어들지 않는다 — 콜은 붙기만 한다', () => {
        let last = 0;
        for (const s of SCENARIO) {
            expect(s.grabbed, s.title).toBeGreaterThanOrEqual(last);
            last = s.grabbed;
        }
    });

    it('다녀온 정거장 수도 줄어들지 않는다', () => {
        let last = 0;
        for (const s of SCENARIO) {
            expect(s.visited, s.title).toBeGreaterThanOrEqual(last);
            last = s.visited;
        }
    });

    /** 🔴 한 번 잠긴 방침은 다시 열리지 않는다 — 합짐이 붙으면 끝이다 (기사님 확정) */
    it('방침 버튼은 한 번 잠기면 다시 안 열린다', () => {
        const firstLocked = SCENARIO.findIndex(s => s.priorityLocked);
        expect(firstLocked).toBeGreaterThan(0);
        for (const s of SCENARIO.slice(firstLocked)) {
            expect(s.priorityLocked, s.title).toBe(true);
        }
    });

    /**
     * 🔴 **잠김은 «콜 2건»에서 온다** — 기사님이 2026-09-05 에 코드가 맞다고 확정하셨다:
     *    *"합짐 잡기 전까지 바꿀 수 있어야 해."* 첫콜 하나만 잡은 단계는 열려 있어야 한다.
     */
    it('콜이 하나뿐인 단계는 방침을 바꿀 수 있다', () => {
        for (const s of SCENARIO.filter(x => x.grabbed <= 1)) {
            expect(s.priorityLocked ?? false, s.title).toBe(false);
        }
    });
});

describe('시나리오 — 판과 갈라지지 않는다', () => {
    it.each(SCENARIO)('$title — 판이 그만큼의 콜을 갖는다', (s) => {
        expect(scenarioPlan(s.grabbed).calls).toBe(s.grabbed);
    });

    it.each(SCENARIO)('$title — 다녀온 수가 정거장 수를 넘지 않는다', (s) => {
        expect(s.visited).toBeLessThanOrEqual(scenarioPlan(s.grabbed).stops.length);
    });

    /** 🔴 QR 이 **그 단계에 없는 정거장**을 담으면 안 된다 */
    it.each(SCENARIO.filter(s => s.qr))('$title — QR 이 담은 곳이 판에 다 있다', (s) => {
        const names = scenarioPlan(s.grabbed).stops.map(st => st.name);
        for (const nm of s.qr!) expect(names, `${s.title} 의 ${nm}`).toContain(nm);
    });

    /** 🔴 카카오내비 경유지 한도는 3 — 도착지까지 넣어도 한 장에 4곳이다 */
    it.each(SCENARIO.filter(s => s.qr))('$title — QR 한 장은 4곳을 넘지 않는다', (s) => {
        expect(s.qr!.length).toBeGreaterThan(0);
        expect(s.qr!.length).toBeLessThanOrEqual(4);
    });

    /** 🔴 이미 다녀온 곳을 QR 이 다시 가리키면 안 된다 */
    it.each(SCENARIO.filter(s => s.qr))('$title — QR 이 다녀온 곳을 가리키지 않는다', (s) => {
        const stops = scenarioPlan(s.grabbed).stops;
        const visited = stops.slice(0, s.visited).map(st => st.name);
        for (const nm of s.qr!) expect(visited, `${s.title} 의 ${nm}`).not.toContain(nm);
    });

    /** 🔴 QR 이 담는 차례는 **경로 순서**를 따라야 한다 — 뒤엣것을 먼저 담지 않는다 */
    it.each(SCENARIO.filter(s => s.qr))('$title — QR 의 차례가 경로 순서와 같다', (s) => {
        const order = scenarioPlan(s.grabbed).stops.map(st => st.name);
        const idx = s.qr!.map(nm => order.indexOf(nm));
        expect(idx).toEqual([...idx].sort((a, b) => a - b));
    });
});

describe('시나리오 — 콜 차례는 09-03 실주행에서 온다', () => {
    it('첫콜 · 합짐1 · 합짐2 는 callNo [2, 3, 1] 이다', () => {
        expect([...SCENARIO_CALL_ORDER]).toEqual([2, 3, 1]);
    });

    /**
     * 🔴 **합짐2가 붙으면 앞에 끼어든다** — 기사님 말씀 그대로다:
     *    *"1 - 2 - 3 - 4 가 합1 을 수행하는 시간만큼 뒤로 밀려."*
     */
    it('합짐2가 붙으면 상차는 맨 앞, 하차는 맨 뒤 — 가운데가 한 칸씩 밀린다', () => {
        const two = scenarioPlan(2).stops.map(s => s.name);
        const three = scenarioPlan(3).stops.map(s => s.name);
        /* 🔴 처음엔 «앞에만 낀다»고 적었다가 검사가 잡았다 — 합짐2는 상차(초월읍)가 앞에,
           하차(방화동)가 뒤에 붙는다. 기사님이 적어 주신 «출발 - 합1 - 1 - 2 - 3 - 4 - 합2»
           가 정확히 그 모양이다. */
        expect(three).toEqual(['초월읍', ...two, '방화동']);
        // 여수동은 ①이었다가 ②가 된다
        expect(scenarioPlan(2).stops.find(s => s.name === '여수동')!.no).toBe(1);
        expect(scenarioPlan(3).stops.find(s => s.name === '여수동')!.no).toBe(2);
    });

    it('첫콜만 잡았을 때는 여수동 상차 · 가산동 하차 둘뿐이다', () => {
        expect(scenarioPlan(1).stops.map(s => `${s.name} ${s.type}`))
            .toEqual(['여수동 상차', '가산동 하차']);
    });

    it('콜을 하나도 안 잡았으면 정거장이 없다', () => {
        expect(scenarioPlan(0).stops).toHaveLength(0);
        expect(scenarioPlan(0).callList).toHaveLength(0);
    });
});

describe('시나리오 — 아직 없는 것을 있다고 말하지 않는다', () => {
    /**
     * 🔴 이 레포가 **네 번** 당한 사고가 «계획을 완료로 적는» 것이다.
     *    시나리오는 «되어야 할 모습»을 그리므로, 코드에 없는 자리는 `gap` 으로 밝혀야 한다.
     */
    it('gap 을 단 단계는 그 이유를 한 문장으로 적는다', () => {
        for (const s of SCENARIO.filter(x => x.gap)) {
            expect(s.gap!.length, s.title).toBeGreaterThan(15);
        }
    });

    it('적어도 한 단계는 «아직 없는 것»을 밝힌다', () => {
        expect(SCENARIO.filter(s => s.gap).length).toBeGreaterThan(0);
    });

    it('모든 단계가 무슨 일인지 말한다', () => {
        for (const s of SCENARIO) expect(s.what.length, s.title).toBeGreaterThan(20);
    });
});

describe('🔴 다시 물은 순서가 없는 판 — 터지지 않는다 (2026-09-05 버그)', () => {
    /**
     * 🔴 **무엇이 터졌나** — 시나리오 「① 콜 대기」를 누르면 흰 화면이 됐다:
     *    `Cannot read properties of undefined (reading 'totalKm')`.
     *
     * 🔴 **왜** — `reaskCost` 가 «판의 콜 수»를 열쇠로 «다시 물은 순서»를 찾는데,
     *    그 표는 **3·4·5콜만** 갖고 있다. 시나리오 판은 콜이 0·1·2 개일 수 있다.
     *    `plan.calls` 하나가 «몇 콜인가»와 «어느 재요청 결과를 쓰나» **두 질문을 답하고
     *    있었다** — CLAUDE.md ⑤-4 ⑤ 가 잡으라는 바로 그 모양이다.
     *
     * 🔴 고치는 방향은 «없으면 null» 이다 — 없는 값을 지어내지 않는다 (규칙 ④).
     */
    it.each([0, 1, 2] as const)('%i콜 판에서 reaskCost 가 터지지 않고 null 을 준다', (n) => {
        expect(() => reaskCost(scenarioPlan(n))).not.toThrow();
        expect(reaskCost(scenarioPlan(n))).toBeNull();
    });

    it.each([0, 1, 2] as const)('%i콜 판에서 reaskedPlan 은 판을 그대로 돌려준다', (n) => {
        const plan = scenarioPlan(n);
        expect(() => reaskedPlan(plan)).not.toThrow();
        expect(reaskedPlan(plan).stops.map(s => s.name)).toEqual(plan.stops.map(s => s.name));
    });

    it('3콜 판은 지금처럼 값을 준다 — 고치면서 되던 것을 죽이지 않는다', () => {
        expect(reaskCost(scenarioPlan(3))).not.toBeNull();
        expect(reaskCost(scenarioPlan(3))!.km).toBeGreaterThan(5);
    });

    /** 🔴 시나리오의 **모든** 단계가 터지지 않아야 한다 — ① 만 고치고 끝내지 않는다 */
    it.each(SCENARIO)('$title — 이 단계의 판으로 ⟳ 를 물어도 터지지 않는다', (s) => {
        expect(() => reaskCost(scenarioPlan(s.grabbed))).not.toThrow();
        expect(() => reaskedPlan(scenarioPlan(s.grabbed))).not.toThrow();
    });
});

describe('▶️ 저절로 흘러갈 때 — 콜이 하나씩 붙는 것이 보이는가', () => {
    /**
     * 기사님 2026-09-05: *"처음에 콜이 없다가 하나씩 생기면 좋겠는데."*
     * 그러려면 **시작이 빈 화면**이어야 하고, 붙는 자리가 **한 번에 하나씩**이어야 한다.
     */
    it('첫 장면은 콜이 하나도 없다', () => {
        expect(SCENARIO[0].grabbed).toBe(0);
        expect(scenarioPlan(SCENARIO[0].grabbed).stops).toHaveLength(0);
    });

    it('콜은 한 번에 하나씩만 붙는다 — 둘이 한꺼번에 생기지 않는다', () => {
        let last = 0;
        for (const s of SCENARIO) {
            expect(s.grabbed - last, `${s.title} 에서 ${s.grabbed - last}개가 한꺼번에`).toBeLessThanOrEqual(1);
            last = s.grabbed;
        }
    });

    it('마지막에는 세 콜이 다 붙어 있다', () => {
        expect(SCENARIO.at(-1)!.grabbed).toBe(3);
    });

    /** 🔴 붙는 순간이 **눈에 보이려면** 그 장면이 무슨 일인지 말해야 한다 */
    it('콜이 붙는 장면마다 무슨 콜인지 적혀 있다', () => {
        let last = 0;
        for (const s of SCENARIO) {
            if (s.grabbed > last) expect(s.what, s.title).toMatch(/콜|합짐/);
            last = s.grabbed;
        }
    });
});

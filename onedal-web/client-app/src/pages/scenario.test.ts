import { describe, it, expect } from 'vitest';
import { SCENARIO, SEAT_CALLS } from './scenario';
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

describe('🪧 심사석 — 눌러야 넘어가는 자리', () => {
    /**
     * 기사님 2026-09-05: *"첫심사에 심사 목업 ui가 있으면 좋겠고, 첫짐킵을 추가해주면
     * 좋겠어, 합짐킵도 있고 주행중 합짐킵도 만들어줘."*
     */
    /**
     * 🔴 **심사석은 «아직 안 잡은 콜»의 자리다** (기사님 2026-09-05 정정:
     *    *"첫콜 심사는 콜리스트에 값이 없고 지도도 그리면 안 된다"*).
     *    경로를 바꿔 보는 것은 **확정 뒤**라 심사석이 아니라 지도의 방침 버튼이 한다.
     */
    it('심사석이 뜨는 장면은 셋 — 첫콜 · 합짐1 · 주행 중 합짐2', () => {
        expect(SCENARIO.filter(s => s.seat).map(s => s.seat))
            .toEqual(['첫콜', '합짐1', '합짐2']);
    });

    it('심사 중인 콜은 아직 안 잡힌 것이다 — 다음 장면에서 딱 하나 는다', () => {
        for (const s of SCENARIO.filter(x => x.seat)) {
            const next = SCENARIO.find(x => x.no === s.no + 1)!;
            expect(next.grabbed - s.grabbed, `${s.title} 다음`).toBe(1);
        }
    });

    /**
     * 🔴 **«심사»는 국면이 아니다** (2026-09-05 정정). 한때 국면에 섞어 뒀더니
     *    「⑪ 주행 중 합짐2 심사」가 **정차로 읽혀** 상태바가 ⏸ 를 달았다 — 달리는 중인데.
     *    국면은 «몸이 무엇을 하나»(대기·주행·정차)이고, 심사 중인지는 `seat` 가 말한다.
     */
    it('심사 중에도 국면은 «몸이 무엇을 하나»를 말한다', () => {
        const 주행중심사 = SCENARIO.find(s => s.title.includes('주행 중 합짐2'))!;
        expect(주행중심사.seat).toBeTruthy();
        expect(주행중심사.phase).toBe('주행');
    });

    it('서서 심사하는 장면은 정차다', () => {
        for (const s of SCENARIO.filter(x => x.seat && !x.title.includes('주행'))) {
            expect(s.phase, s.title).toBe('정차');
        }
    });

    it('심사석 콜 셋이 다 있고, 색과 점수를 갖는다', () => {
        for (const k of ['첫콜', '합짐1', '합짐2'] as const) {
            const c = SEAT_CALLS[k];
            expect(c.judgment.color, k).toBeTruthy();
            expect(c.judgment.score, k).toBeGreaterThan(0);
            expect(c.fare, k).toBeGreaterThan(0);
        }
    });

    /** 🔴 심사석의 색은 그 장면이 말하는 색과 같아야 한다 — 갈라지면 화면이 거짓말을 한다 */
    it.each(SCENARIO.filter(s => s.seat))('$title — 장면의 색과 심사석의 색이 같다', (s) => {
        expect(SEAT_CALLS[s.seat!].judgment.color).toBe(s.color);
    });

    /** 🔴 심사석이 뜬 장면에는 **아직 지도·목록에 그 콜이 없다** */
    it.each(SCENARIO.filter(s => s.seat))('$title — 심사 중인 콜은 아직 판에 없다', (s) => {
        const names = scenarioPlan(s.grabbed).stops.map(st => st.name);
        expect(names).not.toContain(SEAT_CALLS[s.seat!].pickup.includes('여수동') ? '여수동'
            : SEAT_CALLS[s.seat!].pickup.includes('석수동') ? '석수동' : '초월읍');
    });

    /**
     * 🔴 **주행 중 합짐2는 노랑이다** — 뒤가 밀리는데도 데드라인 150% 안에 든다.
     *    기사님이 «감수하고 KEEP» 하시는 자리라, 걸리는 것이 적혀 있어야 한다.
     */
    it('합짐2는 노랑이고 걸리는 것이 적혀 있다', () => {
        expect(SEAT_CALLS.합짐2.judgment.color).toBe('똥');
        expect(SEAT_CALLS.합짐2.rejectionReasons.length).toBeGreaterThan(0);
    });

    /**
     * 🔴 **여기서 시나리오와 실측이 갈렸다** (2026-09-05).
     *    기사님 시나리오는 «고속도로 우선을 누르면 멀어지고 녹색이 된다»였는데,
     *    09-03 실측에서 **추천과 TIME 이 여덟 구간 중 일곱에서 같았다** (경로.md §2-2).
     *    그래서 ④ 는 색을 말하지 않고, **어긋난다는 사실을 gap 으로 밝힌다.**
     *    ⚠️ 색을 지어내 «녹색이 됐다»고 적으면 그게 «없는 것을 있다고 하는» 그 사고다.
     */
    it('④ 경로를 바꿔 본다 — 색을 지어내지 않고 어긋남을 밝힌다', () => {
        const after = SCENARIO.find(s => s.title.includes('경로를 바꿔'))!;
        expect(after.color).toBeUndefined();
        expect(after.gap).toBeTruthy();
        expect(after.gap).toMatch(/불변|다시 매/);
        expect(after.gap).toMatch(/실측|같습니다/);
    });

    /** 🔴 심사석 다음 장면은 **그 콜이 붙은 뒤**여야 한다 — KEEP 을 누르면 콜이 는다 */
    it.each(SCENARIO.filter(s => s.seat && s.no < 17))('$title — KEEP 하면 콜 수가 유지되거나 는다', (s) => {
        const next = SCENARIO.find(x => x.no === s.no + 1)!;
        expect(next.grabbed).toBeGreaterThanOrEqual(s.grabbed);
    });
});

describe('🧭 「출발하기」는 콜을 잡은 뒤라면 늘 있다 (2026-09-05)', () => {
    /**
     * 🔴 **무엇이 잘못됐었나** — 시나리오가 QR 을 정하게 만들면서 «덮개가 열린 장면»에만
     *    목적지가 잡히게 했더니, 「⑥ 출발 전 — 합짐 대기」에서 **버튼이 통째로 사라졌다.**
     *
     *    기사님: *"첫짐만 잡고 출발할 수 있으니까 qr은 첫짐 잡은 경로를 가리키는
     *    큐알 버튼이 있어야 해."* — 맞다. 합짐을 기다리는 것은 **기사님 선택**이지
     *    떠나지 못하는 상태가 아니다 (규칙 ① 콜의 주인은 기사님이다).
     */
    it('사이클이 끝나기 전까지는 갈 곳이 있다 — 덮개가 안 떠도 버튼이 가리킬 데가 있다', () => {
        /* 🔴 마지막 장면(⑰ 사이클 끝)은 다 돌았으니 남은 곳이 0 이 **맞다** —
           검사가 그것까지 잡길래 여기서 갈랐다. 갈 곳이 없으면 버튼도 없어야 한다. */
        for (const s of SCENARIO.filter(x => x.grabbed > 0 && x.no < SCENARIO.length)) {
            const left = scenarioPlan(s.grabbed).stops.length - s.visited;
            expect(left, `${s.title} 에 남은 정거장`).toBeGreaterThan(0);
        }
    });

    it('마지막 장면은 갈 곳이 없다 — 버튼도 없는 것이 맞다', () => {
        const last = SCENARIO.at(-1)!;
        expect(scenarioPlan(last.grabbed).stops.length - last.visited).toBe(0);
    });

    it('콜을 하나도 안 잡은 장면에서는 갈 곳이 없다 — 버튼도 없어야 맞다', () => {
        for (const s of SCENARIO.filter(x => x.grabbed === 0)) {
            expect(scenarioPlan(s.grabbed).stops).toHaveLength(0);
        }
    });

    /** 🔴 ⑥ 은 **아직 출발 전**이다 — 합짐을 하나 더 잡아 보려고 서 있는 것이다 */
    it('⑥ 은 주행이 아니라 정차다', () => {
        const six = SCENARIO.find(s => s.no === 6)!;
        expect(six.phase).toBe('정차');
        expect(six.title).toMatch(/출발 전/);
        expect(six.what).toMatch(/출발하지 않|출발 전|떠나셔도/);
    });

    /** 🔴 처음 «주행»이 나오는 것은 합짐2가 오는 ⑩ 부터다 — 그 전엔 서 있다 */
    it('주행 장면은 합짐2 뒤에만 있다', () => {
        const firstDriving = SCENARIO.find(s => s.phase === '주행');
        expect(firstDriving).toBeDefined();
        expect(firstDriving!.no).toBeGreaterThan(9);
    });
});

describe('⏱️ 밀림은 잡기 전에 보인다 (기사님 확정 2026-09-05 · «가» 안)', () => {
    /**
     * 🔴 **«감수하고 KEEP» 하시는 판단의 재료**라 잡기 전에 보여야 한다.
     *    시나리오 원문: *"이걸 고려해서 서버는 판정을 해."*
     */
    it('합짐2 심사에서 뒤가 34분 밀린다', () => {
        const s = SCENARIO.find(x => x.seat === '합짐2')!;
        expect(s.pushMinutes).toBe(34);
    });

    /** ⚠️ 합짐이 **앞에 낄 때만** 밀린다 — 뒤에만 붙으면 아무것도 안 밀린다 */
    it('첫콜·합짐1 심사에서는 밀림이 없다', () => {
        for (const k of ['첫콜', '합짐1'] as const) {
            const s = SCENARIO.find(x => x.seat === k)!;
            expect(s.pushMinutes, k).toBeUndefined();
        }
    });

    it('심사석이 없는 장면에는 밀림도 없다 — 잡을 콜이 없으면 밀 것도 없다', () => {
        for (const s of SCENARIO.filter(x => !x.seat)) {
            expect(s.pushMinutes, s.title).toBeUndefined();
        }
    });

    /**
     * 🔴 **밀림이 있으면 그 장면의 판정색이 좋을 수 없다.** 뒤가 34분 밀리는데
     *    🔵 꿀이면 화면이 거짓말을 한다 — 색이 곧 결정이다 (규칙 ⑤-3).
     */
    it('밀리는 장면은 색이 꿀이 아니다', () => {
        for (const s of SCENARIO.filter(x => x.pushMinutes)) {
            expect(s.color, s.title).not.toBe('꿀');
        }
    });

    /** 그 사실이 심사석 사유에도 적혀 있어야 한다 — 두 곳이 같은 말을 한다 */
    it('밀림이 심사석의 걸리는 것에도 적혀 있다', () => {
        const s = SCENARIO.find(x => x.pushMinutes)!;
        const seat = SEAT_CALLS[s.seat!];
        expect(seat.rejectionReasons.join(' ')).toMatch(/밀림|밀린/);
    });
});

import { describe, it, expect } from 'vitest';
import { MOCK_PLANS, splitStops, myLocationAt, routeHolderOf, HOME } from './mockPlans';

/**
 * 🧪 **목업의 판 셋이 스스로 어긋나지 않는가**
 *
 * 왜 있나: 목업이 **3콜/6정거장에 박혀 있던 것**을 판 셋으로 갈랐다
 * (전제 점검표 1부 ① — *"3콜은 상한이 아니다"*). 갈랐으니 **갈라진 것끼리
 * 어긋날 자리**가 새로 생겼다 — 정거장은 4콜인데 목록은 셋인 판 같은 것.
 */

const PLANS = [3, 4, 5] as const;

describe('판 셋 — 정거장과 콜 목록이 갈라지지 않는다', () => {
    it.each(PLANS)('%i콜 판의 정거장이 말하는 콜 수 = 목록의 콜 수', (n) => {
        const plan = MOCK_PLANS[n];
        const fromStops = new Set(plan.stops.map(s => s.callNo));
        expect(fromStops.size).toBe(n);
        expect(plan.callList).toHaveLength(n);
        expect(plan.calls).toBe(n);
    });

    /**
     * 🔴 **이 검사가 잡는 것** — 목록을 «정거장 순»으로 세우면 4콜 판이 [1,2,4,3] 이 되어
     *    `callList[callNo - 1]` 로 여는 자리(시트 상태바 버튼)가 **다른 콜을 연다.**
     */
    it.each(PLANS)('%i콜 판 — callList[callNo - 1] 이 그 콜을 연다', (n) => {
        const plan = MOCK_PLANS[n];
        for (const stop of plan.stops) {
            const opened = plan.callList[stop.callNo! - 1];
            expect(opened, `정거장 ${stop.no} ${stop.name}`).toBeDefined();
            expect(opened.nodes).toContain(stop.no);
        }
    });

    it.each(PLANS)('%i콜 판 — 모든 콜이 상차 하나·하차 하나를 갖는다', (n) => {
        const plan = MOCK_PLANS[n];
        for (const call of plan.callList) {
            const mine = plan.stops.filter(s => call.nodes.includes(s.no!));
            expect(mine.map(s => s.type).sort()).toEqual(['상차', '하차']);
        }
    });

    it.each(PLANS)('%i콜 판 — 정거장 번호가 1부터 빠짐없이 이어진다', (n) => {
        const plan = MOCK_PLANS[n];
        expect(plan.stops.map(s => s.no)).toEqual(
            Array.from({ length: plan.stops.length }, (_, i) => i + 1));
    });

    it.each(PLANS)('%i콜 판 — 구간 분이 정거장마다 하나씩 있다', (n) => {
        const plan = MOCK_PLANS[n];
        for (const s of plan.stops) expect(plan.legMinutes[s.no!]).toBeGreaterThan(0);
    });
});

describe('없는 것을 그리지 않는다 (규칙 ④)', () => {
    it('달린 적이 있는 판만 궤적을 갖는다 — 3콜만 실주행이다', () => {
        expect(MOCK_PLANS[3].drivenTrail.length).toBeGreaterThan(0);
        expect(MOCK_PLANS[4].drivenTrail).toHaveLength(0);
        expect(MOCK_PLANS[5].drivenTrail).toHaveLength(0);
    });

    /** 🔴 없는 번호를 지어내면 **남의 전화가 울린다** */
    it.each(PLANS)('%i콜 판 — 시늉 콜은 전화번호를 지어내지 않는다', (n) => {
        for (const call of MOCK_PLANS[n].callList) {
            if (!call.mock) continue;
            expect(call.site.p[2]).toBe('—');
            expect(call.site.d[2]).toBe('—');
        }
    });

    /** 🔴 실측이 아닌 값을 실은 콜은 **화면이 그렇다고 말해야 한다** (규칙 ⑤-2) */
    it('09-03 실측 3콜에는 시늉 표시가 없고, 얹은 콜에는 있다', () => {
        expect(MOCK_PLANS[3].callList.every(c => !c.mock)).toBe(true);
        const added = MOCK_PLANS[5].callList.filter(c => c.no >= 14);
        expect(added).toHaveLength(2);
        expect(added.every(c => (c.mock ?? '').length > 10)).toBe(true);
    });

    it.each(PLANS)('%i콜 판 — 어디서 온 값인지 스스로 말한다', (n) => {
        expect(MOCK_PLANS[n].source.length).toBeGreaterThan(10);
    });
});

describe('갈라 넘기기 — 다녀온 것과 남은 것', () => {
    it.each(PLANS)('%i콜 판 — 다녀온 수 + 남은 수 = 정거장 수', (n) => {
        const plan = MOCK_PLANS[n];
        for (let v = 0; v <= plan.stops.length; v++) {
            const { visited, remaining } = splitStops(plan, v);
            expect(visited.length + remaining.length).toBe(plan.stops.length);
        }
    });

    it('아직 아무 데도 안 갔으면 현위치는 집이다', () => {
        expect(myLocationAt(MOCK_PLANS[3], 0)).toEqual(HOME);
    });

    it.each(PLANS)('%i콜 판 — 현위치는 마지막으로 다녀온 정거장이다 (규칙 ③)', (n) => {
        const plan = MOCK_PLANS[n];
        const v = 2;
        expect(myLocationAt(plan, v)).toEqual({ x: plan.stops[v - 1].x, y: plan.stops[v - 1].y });
    });
});

describe('QR 을 몇 번 찍나 — 판에서 파생된다', () => {
    /**
     * 🔴 전에는 「6정거장이면 2번」이 **글로 박혀** 있었다 — 3콜 판에서만 참이다.
     *    이 검사는 «판이 바뀌면 숫자도 바뀐다»를 잠근다.
     */
    const trips = (left: number, span: number) => Math.max(1, Math.ceil(left / span));

    it('경유 3개+도착(4곳)씩 담으면 판마다 횟수가 다르다', () => {
        expect(trips(6, 4)).toBe(2);
        expect(trips(8, 4)).toBe(2);
        expect(trips(10, 4)).toBe(3);
    });

    it('한 곳씩이면 남은 정거장 수만큼 찍는다', () => {
        for (const n of PLANS) {
            const left = MOCK_PLANS[n].stops.length;
            expect(trips(left, 1)).toBe(left);
        }
    });

    it('남은 곳이 없어도 0번이라고 말하지 않는다', () => {
        expect(trips(0, 4)).toBe(1);
    });
});

describe('경로를 든 콜 — 판의 값을 그대로 싣는다', () => {
    it.each(PLANS)('%i콜 판', (n) => {
        const plan = MOCK_PLANS[n];
        const holder = routeHolderOf(plan);
        expect(holder.routePolyline).toBe(plan.polyline);
        expect(holder.totalDistanceKm).toBe(plan.totalKm);
        expect(holder.totalDurationMin).toBe(plan.totalMin);
        expect(plan.polyline.length).toBeGreaterThan(100);
    });
});

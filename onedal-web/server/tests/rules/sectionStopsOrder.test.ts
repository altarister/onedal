import { planArrivalStops, planMergedStops } from '../../src/services/routeComposer';

/**
 * 🔴 **구간의 주인은 «카카오에 보낸 순서»여야 한다** (2026-08-29 발견 · 버그 대장 #32 계보)
 *
 * `sectionDriveMin` 은 카카오 응답의 구간 배열이고, `sectionStops` 는 «그 구간이 어느
 * 정거장인가»의 이름표다. `helpers.ts` 가 **인덱스로 둘을 짝짓는다** —
 * ```
 * new Map(secStops.map((st, i) => [`${st.orderId}|${st.stopType}`, mins[i]]))
 * ```
 * 그러므로 두 배열의 **순서가 같아야만** 이름이 값을 바르게 가리킨다.
 *
 * 그런데 sectionStops 를 `planArrivalStops` 로 만들고 있었다. 두 계획은 2026-08-25 에
 * **갈라졌다** — `planArrivalStops` 는 «지나가는 길목부터»(최근접 탐욕)로 바뀌었는데
 * `planMergedStops`(실제 카카오 요청)는 여전히 «상차 전부 먼저»다.
 *
 * 🔴 **길이는 같아서 안전장치를 통과한다.** `applyRoute` 의
 * `sectionStops.length === sectionDriveMin.length` 검사는 순서를 못 본다 —
 * 정거장 수가 같으니 통과하고, **주행분이 엉뚱한 정거장에 붙는다.**
 * 그 값을 예산 줄·검산 문장·카운트다운·판정 버퍼가 먹는다 (규칙 ⑤-3 — 색이 곧 결정이다).
 *
 * 실측 재현(아래 첫 검사): 가까운 콜 A, 먼 콜 B 를 함께 실을 때
 * ```
 * 카카오 요청 :  A상차 → B상차 → B하차 → A하차
 * 옛 이름표   :  A상차 → A하차 → B상차 → B하차     ← 2·3·4번이 전부 남의 값
 * ```
 */
const here = { x: 127.30, y: 37.35 };
const near = { id: 'A', status: 'ORDER_CONFIRMED',
    pickupX: 127.31, pickupY: 37.35, dropoffX: 127.33, dropoffY: 37.36 } as any;
const far = { id: 'B', status: 'ORDER_CONFIRMED',
    pickupX: 127.60, pickupY: 37.30, dropoffX: 127.70, dropoffY: 37.28 } as any;

/** 카카오가 실제로 받는 정거장 순서 — 현위치를 알면 origin 은 현위치이고 정거장은 waypoints + dest */
const kakaoStopOrder = (calls: any[], driverLoc: any) => {
    const plan = planMergedStops(calls, null, driverLoc);
    return plan ? plan.orderedStops.map(s => `${s.orderId}:${s.stopType}`) : [];
};

describe('구간 주인 — 카카오에 보낸 순서와 같아야 값이 제 이름에 붙는다', () => {
    it('🔴 계획이 정거장 이름표를 함께 내놓는다 (좌표를 되짚어 맞추지 않는다)', () => {
        const plan = planMergedStops([near, far], null, here)!;
        // 이름표는 [경유지…, 최종 하차지] 와 **같은 길이·같은 순서**여야 한다
        expect(plan.orderedStops).toHaveLength(plan.waypoints.length + 1);
    });

    it('🔴 두 계획은 실제로 갈라져 있다 — 그래서 도착 계획을 이름표로 쓰면 안 된다', () => {
        const arrival = planArrivalStops([near, far], here).map(s => `${s.orderId}:${s.stopType}`);
        const kakao = kakaoStopOrder([near, far], here);

        expect(kakao).toHaveLength(arrival.length);   // 길이가 같아 안전장치가 못 막는다
        expect(kakao).not.toEqual(arrival);           // 그런데 순서가 다르다
    });

    it('상차를 아직 안 한 콜의 하차지는 그 상차지보다 뒤에 온다 (제 짐을 싣기 전에 못 내린다)', () => {
        const kakao = kakaoStopOrder([near, far], here);
        for (const id of ['A', 'B']) {
            const p = kakao.indexOf(`${id}:pickup`);
            const d = kakao.indexOf(`${id}:dropoff`);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(d).toBeGreaterThan(p);
        }
    });

    it('이미 상차한 콜은 상차지가 빠진다 — 다녀온 곳을 다시 가지 않는다', () => {
        const loaded = { ...near, status: 'ORDER_PICKED_UP' };
        const kakao = kakaoStopOrder([loaded, far], here);
        expect(kakao).not.toContain('A:pickup');
        expect(kakao).toContain('A:dropoff');
    });
});

import { planArrivalStops, planMergedStops } from '../../src/services/routeComposer';

/**
 * 🔴 **구간의 주인은 «카카오에 보낸 순서»여야 한다**
 *
 * `sectionDriveMin` 은 카카오 응답의 구간 배열이고, `sectionStops` 는 «그 구간이 어느
 * 정거장인가»의 이름표다. `helpers.ts` 가 **인덱스로 둘을 짝짓는다** —
 * ```
 * new Map(secStops.map((st, i) => [`${st.orderId}|${st.stopType}`, mins[i]]))
 * ```
 * 그러므로 두 배열의 **순서가 같아야만** 이름이 값을 바르게 가리킨다.
 *
 * 그래서 이름표는 실제 카카오 요청을 만드는 `planMergedStops` 가 함께 내놓고,
 * 도착 계획(`planArrivalStops`)도 그것을 되쓴다 — 두 계획이 따로 순서를 정하면 갈라진다.
 *
 * 🔴 **길이는 같아서 안전장치를 통과한다.** `applyRoute` 의
 * `sectionStops.length === sectionDriveMin.length` 검사는 순서를 못 본다 —
 * 정거장 수가 같으니 통과하고, 순서가 다르면 **주행분이 엉뚱한 정거장에 붙는다.**
 * 그 값을 예산 줄·검산 문장·카운트다운·판정 버퍼가 먹는다 (규칙 ⑤-3 — 색이 곧 결정이다).
 *
 * 예(아래 검사): 가까운 콜 A, 먼 콜 B 를 함께 실을 때 순서가 갈라지면
 * ```
 * 카카오 요청 :  A상차 → B상차 → B하차 → A하차
 * 다른 이름표 :  A상차 → A하차 → B상차 → B하차     ← 2·3·4번이 전부 남의 값
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

    /**
     * 🔴 두 계획이 갈라진 채로는 **길이가 같아 안전장치를 통과**하고 주행분이 남의 이름에 붙는다.
     *    `planArrivalStops` 가 `planMergedStops` 를 되쓰므로 **같아야 한다** — 다시 갈라지면 여기서 터진다.
     */
    it('🔴 이름표와 도착 계획이 같은 순서다 — 갈라지면 값이 남의 이름에 붙는다', () => {
        const arrival = planArrivalStops([near, far], here).map(s => `${s.orderId}:${s.stopType}`);
        expect(kakaoStopOrder([near, far], here)).toEqual(arrival);
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

/**
 * 🔴 **도착 감지는 «실제로 달리는 순서»를 봐야 한다** (기사님 확정)
 *
 * `nextStopOf` 는 *"아직 안 지난 첫 정거장"* **하나만** 감시한다. 그 순서가 실제 경로와
 * 다르면 —
 *   · 도착해도 안 찍힌다 (다른 정거장을 보고 있으므로)
 *   · 근접 예고(도착전 통화)가 **엉뚱한 곳에서** 울린다
 *   · 화면의 방문 순서(`routeStops`)가 내비게이션과 다른 말을 한다
 *
 * 그래서 도착 계획은 카카오 경로와 **한 계획**이다. **경로 순서를 바꿀지는 별개 문제**이고
 * (기사님 실측: *"4km 앞 하차지를 두고 30km 동쪽으로 갔다 되돌아온다"*), 바꿀 때는
 * 카카오 요청 순서를 바꾼다 — 도착 계획만 바꾸면 경로는 그대로이고 화면과 감시만 경로에서 떨어진다.
 * 한 계획이므로 도착 감지·화면이 자동으로 따라온다 (규칙 ③ — 파생값은 한 곳에서).
 */
describe('도착 감지 = 실제 경로 — 두 계획은 하나여야 한다', () => {
    it('🔴 도착 계획의 순서가 카카오 요청 순서와 같다', () => {
        const arrival = planArrivalStops([near, far], here).map(s => `${s.orderId}:${s.stopType}`);
        expect(arrival).toEqual(kakaoStopOrder([near, far], here));
    });

    it('이미 상차한 콜이 섞여도 같다', () => {
        const loaded = { ...near, status: 'ORDER_PICKED_UP' };
        const arrival = planArrivalStops([loaded, far], here).map(s => `${s.orderId}:${s.stopType}`);
        expect(arrival).toEqual(kakaoStopOrder([loaded, far], here));
    });
});

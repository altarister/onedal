import { arrivalCandidates, stopKeyOf } from '../../src/services/geoService';
import type { ArrivalStop } from '../../src/services/routeComposer';

/**
 * 🎯 **도착은 «거리»가 정하지 «순서»가 정하지 않는다** (밤 · 기사님 지시).
 *
 * ── 무엇이 문제였나 ──
 * `nextStopOf` 가 «순서상 첫 정거장» 하나만 내주고, 도착 감지·지나침 감시가 그것만 봤다.
 * 그런데 그 순서는 **직선거리 탐욕법**이라 굽은 길에서 뒤집힌다 — 기사님 실측
 * 2026-09-12: 한 정거장이 36초 사이에 ⑴ → ⑷ → ⑴ 로 오갔고, 그런 «누적이 거꾸로인 줄»이
 * 하루 260줄 중 **14줄**이었다.
 *
 * 🔴 **500m 안에 들어왔으면 목록에서 몇 번째든 도착이다.** 거리는 순서를 안 본다.
 *
 * 🔴 **이 결함은 모의 주행으로 못 본다.** `evaluateArrivalTick` 이 `source === 'mock'`
 *    이면 스톱워치 없이 발화해서(부터는 «서 있다»고 온 틱에), 30초 스톱워치 갈래가 **검사에서 한 번도 안 돈다.**
 *    실 GPS 에서만 드러난다 — 그래서 판을 나가기 전에 없앤다.
 *
 * ⚠️ **떼는 것은 «순서»뿐이다.** «제 짐을 싣기 전에는 못 내린다»는 물리 규칙이라 남긴다 —
 *    어드민 실측(오늘 궤적 1,294점): 아직 안 실은 콜의 하차지가 **500m 안이던 점 22개**,
 *    그중 셋은 **0m**(거기 정차). 지금 코드는 `orderByNearest` 가 그 하차지를 후보에서
 *    빼 주어 **덤으로** 지켜지고 있었다 — 순서를 떼면 그 보호가 함께 떨어진다.
 */

const stop = (orderId: string, stopType: 'pickup' | 'dropoff'): ArrivalStop =>
    ({ orderId, stopType, x: 127.4, y: 37.24 });

describe('도착 후보 — 순서가 아니라 거리가 정한다', () => {

    /**
     * 🔴 **이 한 건이 1단계의 이유다.** 예전에는 순서상 첫 정거장 하나만 후보였으므로,
     *    둘째가 500m 안에 들어와도 «다음»이 될 차례가 올 때까지 도착이 안 찍혔다.
     *    순서가 흔들리면 그 차례가 영영 안 올 수도 있다 (실패).
     */
    it('🔴 순서상 둘째·셋째도 후보다 — 첫째만 보지 않는다', () => {
        const stops = [stop('A', 'pickup'), stop('B', 'pickup'), stop('C', 'pickup')];
        const got = arrivalCandidates(stops, new Set());
        expect(got.map(s => s.orderId)).toEqual(['A', 'B', 'C']);
    });

    it('이미 찍은 정거장은 후보가 아니다 — 한 정거장당 한 번', () => {
        const stops = [stop('A', 'pickup'), stop('B', 'pickup')];
        const got = arrivalCandidates(stops, new Set([stopKeyOf(stop('A', 'pickup'))]));
        expect(got.map(s => s.orderId)).toEqual(['B']);
    });

    /**
     * 🔒 **물리 규칙 — 짐을 안 실었으면 그 하차지는 도착이 아니다.**
     *    실측 22점(그중 0m 셋)이 이 자리다. 막지 않으면 스쳐 지난 것이 도착으로 찍히고,
     *    지나침이 이어서 **완료까지** 찍는다 — 짐은 아직 상차지에 있는데 콜이 끝난다.
     */
    it('🔒 제 짐을 안 실은 콜의 하차지는 후보가 아니다', () => {
        const stops = [stop('A', 'pickup'), stop('A', 'dropoff')];
        const got = arrivalCandidates(stops, new Set());
        expect(got.map(s => `${s.orderId}:${s.stopType}`)).toEqual(['A:pickup']);
    });

    /**
     * 🟢 상차지가 목록에서 빠졌다 = 다녀왔다 (`planArrivalStops` 가 다녀온 곳을 뺀다).
     *    그러면 그 콜의 하차지는 후보가 된다 — 따로 «실었나»를 세지 않는다 (규칙 ③).
     */
    it('상차를 마친 콜의 하차지는 후보다', () => {
        const stops = [stop('A', 'dropoff'), stop('B', 'pickup')];
        const got = arrivalCandidates(stops, new Set());
        expect(got.map(s => `${s.orderId}:${s.stopType}`)).toEqual(['A:dropoff', 'B:pickup']);
    });

    /**
     * 🔴 **콜이 여럿 섞여도 콜마다 따로 본다.** A 는 실었고 B 는 아직이면,
     *    A 하차는 후보이고 B 하차는 아니다 — 합짐이 이 제품의 기본 상황이다.
     */
    it('합짐 — 실은 콜의 하차만 후보가 된다', () => {
        const stops = [stop('A', 'dropoff'), stop('B', 'pickup'), stop('B', 'dropoff')];
        const got = arrivalCandidates(stops, new Set());
        expect(got.map(s => `${s.orderId}:${s.stopType}`)).toEqual(['A:dropoff', 'B:pickup']);
    });

    it('빈 목록이면 후보도 없다 — 지어내지 않는다', () => {
        expect(arrivalCandidates([], new Set())).toEqual([]);
    });
});

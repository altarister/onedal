import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { hasVisitedStop, isAlreadyLoaded } from '@onedal/shared';
import { planArrivalStops, planMergedStops } from '../../src/services/routeComposer';

/**
 * 🚏 **"다녀왔다"의 정의는 하나다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"현실에서는 내가 지나온 것은 무시할 것 같은데."*
 *
 * 그동안 판단이 두 벌이었다:
 *   경로 조립 — `status === 'ORDER_PICKED_UP'` (기사님이 상차 완료를 눌러야)
 *   시각 계산 — 마일스톤 `ARRIVED_*` (GPS 자동)
 *
 * 그래서 **상차 완료를 안 누르면 이미 지나온 상차지로 되돌아가는 경로**가 나왔다.
 * 실측(2026-08-19): 같은 다산역 콜이 상차 완료 전엔 경유지 5개·+20.0km·🟢56점,
 * 누른 뒤엔 경유지 3개·+0.7km·🔵80점 — **없는 우회 비용 20km를 물고 있었다.**
 *
 * 클래스: "같은 사실을 두 식으로 판단". 인스턴스를 세 번 고쳤으니 이제 클래스를 없앤다
 * (버그 대장 #24 의 연장 — 그때는 타임라인만 고쳤다).
 *
 * → `hasVisitedStop(order, stopType)` 하나로 판단한다.
 *   **GPS 도착이면 다녀온 것**이다 — 500m 안에 들어와야 찍히므로 "거기 갔다"는 뜻이고,
 *   **가는 길**은 더 필요 없다. 상차 완료 여부는 별개로 남는다 (단계는 여전히 대기).
 */
const order = (over: object = {}) => ({
    id: 'A', status: 'ORDER_CONFIRMED',
    pickup: '상차', dropoff: '하차',
    pickupX: 127.2, pickupY: 37.4, dropoffX: 126.8, dropoffY: 37.7,
    ...over,
}) as any;

describe('hasVisitedStop — 다녀왔는가', () => {
    it('아무 기록도 없으면 안 갔다', () => {
        expect(hasVisitedStop(order(), 'pickup')).toBe(false);
        expect(hasVisitedStop(order(), 'dropoff')).toBe(false);
    });

    it('🔴 GPS 도착만 있어도 다녀온 것이다 (상차 완료를 안 눌러도)', () => {
        const o = order({ arrivedPickupAt: '2026-08-19T01:37:00.000Z' });
        expect(hasVisitedStop(o, 'pickup')).toBe(true);
        expect(isAlreadyLoaded(o)).toBe(false);      // 실은 것은 아니다 — 별개다
    });

    it('상차 완료했으면 당연히 다녀온 것이다 (도착 기록이 없어도)', () => {
        expect(hasVisitedStop(order({ status: 'ORDER_PICKED_UP' }), 'pickup')).toBe(true);
    });

    it('하차도 같다 — 도착 기록 또는 하차 완료', () => {
        expect(hasVisitedStop(order({ arrivedDropoffAt: '2026-08-19T02:00:00.000Z' }), 'dropoff')).toBe(true);
        expect(hasVisitedStop(order({ status: 'ORDER_DELIVERED' }), 'dropoff')).toBe(true);
    });

    it('상차지 방문이 하차지 방문을 뜻하지는 않는다', () => {
        expect(hasVisitedStop(order({ arrivedPickupAt: '2026-08-19T01:37:00.000Z' }), 'dropoff')).toBe(false);
    });
});

describe('경로 조립 — 다녀온 정거장을 다시 가지 않는다', () => {
    it('🔴 GPS 도착만 찍힌 상차지가 정거장 목록에서 빠진다', () => {
        const o = order({ arrivedPickupAt: '2026-08-19T01:37:00.000Z' });
        const stops = planArrivalStops([o], null);
        expect(stops.map(s => s.stopType)).toEqual(['dropoff']);
    });

    it('🔴 GPS 도착만 찍힌 상차지가 경유지에서도 빠진다', () => {
        const visited = planMergedStops([order({ arrivedPickupAt: '2026-08-19T01:37:00.000Z' })], null, null);
        const fresh = planMergedStops([order()], null, null);
        expect(visited!.skippedPickups).toBe(1);
        expect(fresh!.skippedPickups).toBe(0);
    });

    it('다녀온 하차지도 정거장에서 빠진다', () => {
        const o = order({
            arrivedPickupAt: '2026-08-19T01:37:00.000Z',
            arrivedDropoffAt: '2026-08-19T02:00:00.000Z',
        });
        expect(planArrivalStops([o], null)).toEqual([]);
    });
});

/** 판단이 다시 갈라지지 않게 — 경로 조립은 status 를 직접 보지 않는다 */
describe('정의가 두 벌로 갈라지지 않는다', () => {
    const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
    const code = (rel: string) => src(rel).split('\n')
        .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 routeComposer 가 정거장을 고를 때 hasVisitedStop 만 쓴다', () => {
        const c = code('../../src/services/routeComposer.ts');
        expect(c).toMatch(/hasVisitedStop/);
        // 경유지·정거장 선별에서 isAlreadyLoaded 직접 호출이 남아 있으면 두 벌이 된다
        expect(c).not.toMatch(/if \(!isAlreadyLoaded\(c\)\) pickups\.push/);
    });
});

/** 도착 시각이 콜 객체에 실려야 경로 조립이 DB 조회 없이 판단할 수 있다 */
describe('도착 시각은 콜 객체에 실린다', () => {
    it('🔴 마일스톤을 기록할 때 세션 콜에도 도착 시각을 남긴다', () => {
        const engine = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8');
        expect(engine).toMatch(/arrivedPickupAt|arrivedDropoffAt/);
    });

    it('🔴 복구 경로도 도착 시각을 되살린다 — 재시작하면 경로가 되돌아가면 안 된다', () => {
        const engine = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8');
        expect(engine).toMatch(/hydrateVisitedStops|arrivedPickupAt[\s\S]{0,400}getMilestones|getMilestones[\s\S]{0,400}arrivedPickupAt/);
    });
});

/**
 * ⚖️ **비교 기준(base)도 다녀온 곳을 뺀다** (기사님 실측 2026-08-19, ① 직후)
 *
 * ①을 넣자 합짐 경로(merged)는 다녀온 상차지를 제대로 뺐는데, **비교 대상인 base 는
 * 안 뺐다.** base 는 `현위치 → 첫짐 상차지 → 첫짐 하차지` 로 고정 조립되기 때문이다.
 *
 * 실측 로그:
 *   `🔵 총점 80 — 추가 주행 +-13분(100) · 우회 거리 +-23.4km(100)`
 *
 * **우회 비용이 음수**로 나왔다 — 합짐을 붙였는데 거리가 23km 줄었다는 뜻이다.
 * 정거장이 늘었는데 그럴 리 없다. base 가 이미 다녀온 경안동을 다시 들르는 경로라
 * **부풀어 있었고**, 그 부푼 값과 비교하니 모든 합짐이 과대평가된다.
 * 색이 곧 결정인데(규칙 ⑤-3) 비교 기준이 틀리면 색도 틀린다.
 *
 * → base 의 출발 기준도 `hasVisitedStop` 을 따른다: 첫짐 상차지를 이미 다녀왔으면
 *   base 는 **현위치 → 첫짐 하차지** 다 (거기가 지금 남은 일이므로).
 */
describe('우회 비용의 비교 기준', () => {
    const P = (n: number) => ({ x: 127 + n / 100, y: 37 + n / 100 });
    const call = (id: string, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED',
        pickupX: P(1).x, pickupY: P(1).y, dropoffX: P(2).x, dropoffY: P(2).y, ...over,
    }) as any;

    it('🔴 첫짐 상차지를 다녀왔으면 base 출발에 그 상차지를 넣지 않는다', () => {
        const visited = planMergedStops(
            [call('A', { arrivedPickupAt: '2026-08-19T05:01:00.000Z' })], null, { x: 127.5, y: 37.5 })!;
        // origin.pickup 이 base 의 경유지가 된다 — 다녀왔으면 하차지와 같아야 한다(= 들르지 않음)
        expect(visited.origin.pickup).toEqual(visited.origin.dropoff);
    });

    it('아직 안 갔으면 base 가 상차지를 들른다', () => {
        const fresh = planMergedStops([call('A')], null, { x: 127.5, y: 37.5 })!;
        expect(fresh.origin.pickup).toEqual(P(1));
        expect(fresh.origin.dropoff).toEqual(P(2));
    });
});

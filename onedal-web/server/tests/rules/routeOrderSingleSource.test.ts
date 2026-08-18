import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { buildOrderSync } from '../../src/core/helpers';
import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🧭 **경로 순서의 원천은 서버 하나다** (기사님 동의 2026-08-19)
 *
 * 그동안 방문 순서가 **두 벌**이었다:
 *   서버 — `optimizeWaypoints` 로 병합 경로의 경유 순서를 만들고
 *   관제웹 — 자기 TSP(`optimizeRouteOrder`)를 **따로** 돌려 인덱스로 끼워 맞춤
 *
 * 두 순서가 어긋나면 ETA 가 엉뚱한 정거장에 붙는다 — "파생값 두 벌" 사고 클래스
 * (경유 4벌 · 상태목록 3벌 · 시별칭과 같은 뿌리). 그래서:
 *
 *   ① 서버가 `sync-active-orders` 에 `routeStops` [콜ID·정거장·누적주행분] 를 싣는다
 *   ② 관제웹 TSP 는 걷어낸다 — 이 테스트가 재발을 막는다
 */
describe('routeStops — 서버가 순서를 명시해 내려준다', () => {
    const order = (id: string, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED', pickup: `${id}-상차`, dropoff: `${id}-하차`,
        pickupX: 127.2, pickupY: 37.4, dropoffX: 126.8, dropoffY: 37.7,
        fare: 50000, ...over,
    }) as any;

    it('🔴 sync 페이로드에 routeStops 가 있고, 순서가 planArrivalStops 와 같다', () => {
        const calls = [order('A'), order('B')];
        const session = { myOrders: calls, pendingOrdersData: new Map(), driverLocation: null } as any;
        const sync = buildOrderSync(session);

        const expected = planArrivalStops(calls, null)
            .map(s => `${s.orderId}:${s.stopType}`);
        expect((sync as any).routeStops?.map((s: any) => `${s.orderId}:${s.stopType}`))
            .toEqual(expected);
    });

    it('주행분은 경로 연산 결과(sectionDriveMin)에서만 온다 — 없으면 null, 지어내지 않는다', () => {
        const calls = [order('A')];
        const session = { myOrders: calls, pendingOrdersData: new Map(), driverLocation: null } as any;
        const sync = buildOrderSync(session) as any;
        expect(sync.routeStops).toHaveLength(2);            // 상차 + 하차
        for (const s of sync.routeStops) expect(s.driveMinutes).toBeNull();
    });

    it('연산 결과 길이가 정거장 수와 어긋나면 전부 null — 낡은 값을 정거장에 붙이지 않는다', () => {
        // 평가 중 후보까지 넣고 계산한 경로(정거장 4개분)가 홀더에 남은 상태에서
        // 확정 콜은 1건(정거장 2개)뿐인 경우
        const a = order('A', { sectionDriveMin: [10, 20, 35, 50] });
        const session = { myOrders: [a], pendingOrdersData: new Map(), driverLocation: null } as any;
        const sync = buildOrderSync(session) as any;
        for (const s of sync.routeStops) expect(s.driveMinutes).toBeNull();
    });

    it('길이가 맞으면 누적 주행분이 정거장 순서대로 붙는다', () => {
        const a = order('A', { sectionDriveMin: [12, 77] });
        const session = { myOrders: [a], pendingOrdersData: new Map(), driverLocation: null } as any;
        const sync = buildOrderSync(session) as any;
        expect(sync.routeStops.map((s: any) => s.driveMinutes)).toEqual([12, 77]);
    });

    it('이미 상차한 콜은 하차 정거장만 남는다 (다녀온 곳을 경로에 남기지 않는다)', () => {
        const a = order('A', { status: 'ORDER_PICKED_UP' });
        const session = { myOrders: [a], pendingOrdersData: new Map(), driverLocation: null } as any;
        const sync = buildOrderSync(session) as any;
        expect(sync.routeStops).toEqual([
            { orderId: 'A', stopType: 'dropoff', driveMinutes: null },
        ]);
    });
});

/** 관제웹에서 클라 TSP 가 완전히 사라졌는지 — 소스를 읽어 강제한다 */
describe('관제웹 — 자기 TSP 를 돌리지 않는다', () => {
    const CLIENT_SRC = join(__dirname, '../../../client-app/src');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

    it('🔴 optimizeRouteOrder(클라 TSP)를 아무도 부르지 않는다', () => {
        // 주석은 검사하지 않는다 — "왜 걷어냈는가"를 적어 둔 곳까지 잡으면 역사를 지우게 된다
        const code = (f: string) => readFileSync(f, 'utf8').split('\n')
            .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
        const offenders = walk(CLIENT_SRC)
            .filter(f => !f.endsWith('.test.ts'))
            .filter(f => code(f).includes('optimizeRouteOrder'));
        expect(offenders.map(f => f.split('/client-app/')[1])).toEqual([]);
    });
});

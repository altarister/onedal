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

/**
 * 🧭 **계측 로그는 «바뀔 때만» 한 줄이다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"1초에 한번씩 이런 로그가 싸이고 있는건데 의도 된거지?"*
 *
 * 아니었다. `logRouteStops` 는 2026-08-19 에 넣은 계측이고, 스스로 이렇게 적어 뒀다 —
 * *"값이 바뀔 때만 한 줄 남긴다(`sync` 는 매초 나가므로 무조건 찍으면 로그가 묻힌다)."*
 * 그런데 오늘 로그는 **324줄인데 내용은 3종류**뿐이었다. 중복 방지가 죽어 있었다.
 *
 * ── 왜 죽었나 ──
 * 지문이 **모듈 전역 변수 하나**였고, 저장이 빈 목록 검사보다 **앞**에 있었다:
 *
 *     lastRouteStopsSig = sig;          // ← 지문을 먼저 덮어쓰고
 *     if (!routeStops.length) return;   // ← 그 다음에 빠져나간다
 *
 * 1초 인터벌은 `sessions` 의 **모든 유저**를 돈다. 남의 서버 토큰으로 생긴 유령 세션
 * (콜 0건)이 끼어 있으면, 그 세션이 매초 지문만 갈아치우고 조용히 나간다. 다음 초에
 * 기사님 세션은 "바뀐 것"이 되어 또 찍힌다 — 영원히.
 *
 * 유령 자체는 `foreignToken.test.ts` 가 문에서 막는다. 여기서는 **계측이 그것과
 * 무관하게 스스로 옳도록** 강제한다 (규칙 ② — 안전장치는 겹쳐 둔다).
 */
describe('계측 로그 — 값이 안 바뀌면 다시 안 찍는다', () => {
    const call = (id: string, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED', pickup: `${id}-상차`, dropoff: `${id}-하차`,
        pickupX: 127.2, pickupY: 37.4, dropoffX: 126.8, dropoffY: 37.7, fare: 50000, ...over,
    }) as any;
    const sessionOf = (userId: string, calls: any[]) =>
        ({ userId, myOrders: calls, pendingOrdersData: new Map(), driverLocation: null }) as any;

    /** 찍힌 `🧭 [경로 순서]` 줄만 모은다 */
    const linesWhile = (fn: () => void): string[] => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            fn();
            return spy.mock.calls.map(c => String(c[0])).filter(l => l.includes('[경로 순서]'));
        } finally {
            spy.mockRestore();
        }
    };

    it('같은 세션을 다시 sync 해도 값이 그대로면 한 줄도 안 찍는다', () => {
        const me = sessionOf('나', [call('A', { sectionDriveMin: [12, 77] })]);
        buildOrderSync(me);                                   // 기준선 — 여기서 한 번 찍힌다
        expect(linesWhile(() => { buildOrderSync(me); buildOrderSync(me); })).toEqual([]);
    });

    it('🔴 콜 없는 다른 세션이 끼어들어도 지문이 풀리지 않는다 (유령 세션)', () => {
        const me = sessionOf('나', [call('B', { sectionDriveMin: [9, 41] })]);
        const ghost = sessionOf('유령', []);                   // 남의 서버 토큰으로 생긴 세션
        buildOrderSync(me);                                   // 기준선
        expect(linesWhile(() => {
            for (let i = 0; i < 3; i++) { buildOrderSync(ghost); buildOrderSync(me); }
        })).toEqual([]);
    });

    it('값이 진짜 바뀌면 (콜이 늘면) 그때는 찍는다 — 계측을 죽이는 것이 아니다', () => {
        const me = sessionOf('나', [call('C', { sectionDriveMin: [5, 30] })]);
        buildOrderSync(me);
        me.myOrders = [call('C', { sectionDriveMin: [5, 30] }), call('D')];
        expect(linesWhile(() => buildOrderSync(me))).toHaveLength(1);
    });

    it('세션마다 따로 기억한다 — 두 기사가 서로의 지문을 지우지 않는다', () => {
        const a = sessionOf('기사A', [call('E', { sectionDriveMin: [1, 2] })]);
        const b = sessionOf('기사B', [call('F', { sectionDriveMin: [3, 4] })]);
        buildOrderSync(a); buildOrderSync(b);                 // 각자 기준선
        expect(linesWhile(() => { buildOrderSync(a); buildOrderSync(b); })).toEqual([]);
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

/**
 * 📦 **리허설은 서버가 실제로 보내는 필드를 읽어야 한다** (2026-08-19 실측 사고)
 *
 * 서버 응답은 `decision` 인데 리허설이 `piggybackDecision` 을 읽고 있었다.
 * 그래서 판결을 한 번도 못 받았고 → ACK 를 못 보냈고 → 서버는 규칙 ②(ACK 까지
 * 판결을 지우지 않는다)대로 **55분 동안 5초마다** 같은 KEEP 을 태워 보냈다.
 * 게다가 holdingOrderId 가 안 풀려 화면이 DETAIL_CONFIRMED 로 영구 고착됐다.
 *
 * 응답 조립처(scrap.ts)와 리허설이 같은 이름을 쓰는지 소스로 대조한다.
 */
describe('리허설 ↔ 서버 — 판결 필드 계약', () => {
    it('🔴 scrap 응답의 판결 필드 이름을 리허설이 그대로 읽는다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        const rehearsal = readFileSync(join(__dirname, '../../../scripts/rehearsal.mjs'), 'utf8');
        const m = scrap.match(/(\w+):\s*piggybackDecision/);
        expect(m).not.toBeNull();                       // 응답에 판결이 실린다
        expect(rehearsal).toContain(`j.${m![1]}`);      // 리허설이 그 이름을 읽는다
    });
});

/**
 * 🔴 **경로를 기록한 콜과 읽는 콜이 어긋났다** (기사님 실측 2026-08-19)
 *
 * 실측: 콜 2건을 잡았는데 `routeComputedAt`·`sectionDriveMin` 이 **콜1 에만** 있었다.
 *   기록: 콜2 KEEP 처리 중 `pickRouteHolder(activeCalls, …)` — 이때 activeCalls 는
 *         아직 [콜1] 이라 **콜1** 에 실린다
 *   읽기: KEEP 이 끝난 뒤 activeCalls 는 [콜1, 콜2] — "마지막"인 **콜2** 를 본다 → 빈다
 *
 * 그 결과 routeStops 의 주행분이 전부 null 이 되어 **타임라인이 통째로 폴백으로 돌았다.**
 * 합짐 시각·카운트다운·지각 검산이 전부 콜별 파생("혼자 간다")으로 계산된 것이다.
 *
 * 관제웹은 이미 `[...liveRoute].reverse().find(r => r.totalDistanceKm != null)` 로
 * **뒤에서부터 값이 있는 콜**을 찾는다. 서버도 같은 방식이어야 한다.
 */
describe('경로 홀더 — 값이 있는 콜을 찾는다', () => {
    const withRoute = (id: string, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED', pickup: `${id}-상차`, dropoff: `${id}-하차`,
        pickupX: 127.2, pickupY: 37.4, dropoffX: 126.8, dropoffY: 37.7, fare: 50000, ...over,
    }) as any;

    it('🔴 마지막 콜이 비어 있어도 앞 콜의 경로를 읽는다', () => {
        const calls = [
            withRoute('A', { sectionDriveMin: [10, 20, 30, 40], routeComputedAt: '2026-08-19T01:00:00Z' }),
            withRoute('B'),   // 나중에 확정돼 경로가 안 실린 콜
        ];
        const sync = buildOrderSync({ myOrders: calls, pendingOrdersData: new Map(), driverLocation: null } as any) as any;
        expect(sync.routeComputedAt).toBe('2026-08-19T01:00:00Z');
        expect(sync.routeStops.map((s: any) => s.driveMinutes)).toEqual([10, 20, 30, 40]);
    });
});

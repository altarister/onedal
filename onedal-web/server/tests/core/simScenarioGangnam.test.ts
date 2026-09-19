import { startScenario, stepScenario } from '../../src/core/simScenario';
import type { ScenarioState, ScenarioWorld, WorldOrder } from '../../src/core/simScenario';
import { GANGNAM_FIVE_OK } from '../../src/core/simScenarioGangnam';

/**
 * 🎬 **강남 진입과 광주 복귀 5콜 검증**
 * (새 판정 헌법의 첫짐 전진율, 합짐 2점 꺾은선, 적재량 초기화, 광주 초월읍 지오코딩 검증)
 */

const T0 = 1_000_000;
const def = GANGNAM_FIVE_OK;
const idx = (id: string) => def.findIndex(r => r.id === id);
const callOf = (id: string) => def[idx(id)].call!;

const baseWorld = (now: number, over: Partial<ScenarioWorld> = {}): ScenarioWorld => ({
    now, orders: [], intel: [],
    filter: { dispatchPhase: 'STANDBY', goalCities: ['강남구'], callTarget: 'DEST', destinationKeywords: [] },
    ...over,
});

const orderFor = (id: string, oid: string, status: string, extra: Partial<WorldOrder> = {}): WorldOrder => {
    const c = callOf(id);
    return { id: oid, status, pickupX: c.pickup.lon, pickupY: c.pickup.lat, dropoffX: c.dropoff.lon, dropoffY: c.dropoff.lat, ...extra };
};
const run = (st: ScenarioState, w: ScenarioWorld) => stepScenario(def, st, w);

describe('🎬 강남 진입과 광주 복귀 5콜 — 줄 데이터 검증', () => {

    it('총 8줄 · 콜 5건 · 할 일 3건', () => {
        expect(def).toHaveLength(8);
        expect(def.filter(r => r.call)).toHaveLength(5);
        expect(def.filter(r => r.kind === 'act')).toHaveLength(3);
    });

    it('모든 콜의 상하차 동 이름이 올바른 행정단위(동/읍/면)로 끝난다', () => {
        for (const r of def.filter(r => r.call)) {
            expect(r.call!.pickup.region).toMatch(/(동|읍|면)$/);
            expect(r.call!.dropoff.region).toMatch(/(동|읍|면)$/);
        }
    });

    it('🔴 한 회차 안에 폰 지문(상차 동 + 하차 동 + 요금)이 겹치는 콜이 없다', () => {
        const prints = def.filter(r => r.call).map(r => `${r.call!.pickup.region}|${r.call!.dropoff.region}|${r.call!.fare}`);
        expect(prints.filter((p, i) => prints.indexOf(p) !== i)).toEqual([]);
    });

    it('«○○에 서면» 도착 조건은 항상 앞선 줄만 가리킨다', () => {
        def.forEach((r, i) => {
            if ('arrive' in r.when) {
                expect(idx(r.when.arrive)).toBeLessThan(i);
            }
        });
    });

    it('G1 첫짐이 T0에 즉시 발송된다', () => {
        const st = startScenario(def, T0);
        const r = run(st, baseWorld(T0));
        expect(r.send).not.toBeNull();
        expect(r.send?.fare).toBe(12000);
        expect(r.send?.pickup.region).toBe('복정동');
        expect(r.send?.dropoff.region).toBe('대치동');
    });

    it('G1 확정 후 상차지 도착 및 주행 시 G2(송파→양재 합짐)가 발행된다', () => {
        let st = startScenario(def, T0);
        st = { ...st, index: idx('M1'), rows: st.rows.map((x, i) => i === idx('G1') ? { ...x, mark: 'ok', orderId: 'ord-g1' } : x) };

        const driving = { dispatchPhase: 'DELIVERING', goalCities: ['강남구'], callTarget: 'DEST', destinationKeywords: [] };
        // M1 주행 감지 완료
        let r = run(st, baseWorld(T0 + 1000, { filter: driving, orders: [orderFor('G1', 'ord-g1', 'ORDER_CONFIRMED')] }));
        expect(r.state.rows[idx('M1')].mark).toBe('ok');

        // M1 끝난 뒤 쿨다운 지나 G2 로 인덱스 이동
        r = run(r.state, baseWorld(T0 + 5000, { filter: driving, orders: [orderFor('G1', 'ord-g1', 'ORDER_CONFIRMED')] }));
        expect(r.state.index).toBe(idx('G2'));
        expect(r.send).toBeNull(); // 아직 상차지에 도착 안 함

        // G1 상차지 도착
        r = run(r.state, baseWorld(T0 + 6000, {
            filter: driving,
            orders: [orderFor('G1', 'ord-g1', 'ORDER_CONFIRMED', { arrivedPickupAt: new Date(T0 + 6000).toISOString() })],
        }));

        expect(r.send).not.toBeNull();
        expect(r.send?.pickup.region).toBe('문정동');
        expect(r.send?.dropoff.region).toBe('양재동');
        expect(r.send?.fare).toBe(25000);
    });

    it('G5(분당→초월 복귀 피날레)는 G4의 상차지(장지가든파이브) 도착 시 발행된다', () => {
        const r4 = def[idx('G4')];
        const r5 = def[idx('G5')];
        expect(r5.when).toEqual({ arrive: 'G4', stop: 'pickup' });
        expect(r4.call?.pickup.region).toBe('장지동');
        expect(r5.call?.pickup.region).toBe('이매동');
    });
});



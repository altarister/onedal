import { startScenario, stepScenario, skipScenarioRow } from '../../src/core/simScenario';
import type { ScenarioState, ScenarioWorld, WorldOrder } from '../../src/core/simScenario';
import { ICHEON_ROUND_TRIP } from '../../src/core/simScenarioIcheon';

/**
 * 🎬 **이천 왕복 — 서버가 사건순으로 콜을 낸다** (기사님 지시 2026-09-15 · 설계서 `docs/기획/문제지_이천왕복.md` §7).
 *
 * 기사님: *"시뮬레이터에 내기 버튼을 클릭하면 서버가 그냥 콜리스트를 … 순서대로 뿌리면 되는거 아냐?"*
 * → 시계순은 안 된다 (모의 주행 속도·정차가 매번 다르고 KEEP 마다 순서가 바뀐다). **사건순**이다.
 * 판단은 순수 함수(`stepScenario`)에 두고 여기서 16줄을 사건 순서대로 흘린다 — 화면 안에 두면 돌려 봐야만 안다.
 */

const T0 = 1_000_000;
const def = ICHEON_ROUND_TRIP;
const idx = (id: string) => def.findIndex(r => r.id === id);
const callOf = (id: string) => def[idx(id)].call!;

const baseWorld = (now: number, over: Partial<ScenarioWorld> = {}): ScenarioWorld => ({
    now, orders: [], intel: [],
    filter: { dispatchPhase: 'STANDBY', goalCities: ['이천시'], callTarget: 'DEST', destinationKeywords: [] },
    ...over,
});
/** 그 줄의 콜 좌표로 서버 콜 하나 */
const orderFor = (id: string, oid: string, status: string, extra: Partial<WorldOrder> = {}): WorldOrder => {
    const c = callOf(id);
    return { id: oid, status, pickupX: c.pickup.lon, pickupY: c.pickup.lat, dropoffX: c.dropoff.lon, dropoffY: c.dropoff.lat, ...extra };
};
const intelFor = (id: string, rowId: number, verdict: string | null) => {
    const c = callOf(id);
    return { id: rowId, pickupX: c.pickup.lon, pickupY: c.pickup.lat, dropoffX: c.dropoff.lon, dropoffY: c.dropoff.lat, verdict };
};
const run = (st: ScenarioState, w: ScenarioWorld) => stepScenario(def, st, w);

describe('🎬 이천 왕복 — 줄 데이터', () => {
    it('16줄 · 콜 13 · 할 일 3 · 막힘 줄은 막을 축이 있다', () => {
        expect(def).toHaveLength(16);
        expect(def.filter(r => r.call)).toHaveLength(13);
        expect(def.filter(r => r.kind === 'act')).toHaveLength(3);
        for (const r of def.filter(r => r.kind === 'block')) expect(r.blockBy).toBeTruthy();
        /* 폰이 보는 동 이름은 region 칸 — 비면 시뮬레이터 목록이 이상한 동을 적는다 */
        for (const r of def.filter(r => r.call)) {
            expect(r.call!.pickup.region).toMatch(/(동|읍|면)$/);
            expect(r.call!.dropoff.region).toMatch(/(동|읍|면)$/);
        }
    });
    it('«○○에 서면» 줄은 앞에 있는 줄만 가리킨다', () => {
        def.forEach((r, i) => { if ('arrive' in r.when) expect(idx(r.when.arrive)).toBeLessThan(i); });
    });
});

describe('🎬 이천 왕복 — 사건순', () => {
    it('🔴 시작하면 A1 콜을 내고, 폰이 상차거리로 막으면 ✅ 막힘', () => {
        let st = startScenario(def, T0);
        let r = run(st, baseWorld(T0));
        expect(r.send?.pickup.region).toBe(callOf('A1').pickup.region);
        st = r.state;
        expect(st.rows[0].mark).toBe('sent');
        r = run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'pickup')] }));
        expect(r.state.rows[0].mark).toBe('ok');
        expect(r.send).toBeNull();
    });

    /**
     * 🔴 **폰이 올린 기록(`intel`)에는 좌표가 없다** (2026-09-15 01:32 첫 시험 — A1 을 폰이 `pickup` 으로 옳게 막았는데
     *    카드는 «❔ 30초 동안 폰이 못 봤다»였다). 폰은 목록 화면의 동 이름·요금·차종만 읽는다 (`intel` 9112·9113 좌표 칸 빈칸).
     *    → 좌표가 비면 **상차·하차 동 이름 + 요금**으로 짝짓는다. 보낸 뒤 새로 생긴 줄만 보니 같은 동·요금의 옛 줄은 안 섞인다.
     */
    it('🔴 좌표 없는 폰 기록도 동 이름·요금으로 짝짓는다', () => {
        let st = run(startScenario(def, T0), baseWorld(T0, { intel: [{ id: 9111, pickup: '중리동', dropoff: '신둔면', fare: 30000, verdict: 'vehicle' }] })).state;
        const r = run(st, baseWorld(T0 + 4000, { intel: [
            { id: 9111, pickup: '중리동', dropoff: '신둔면', fare: 30000, verdict: 'vehicle' },   // 보내기 전 옛 줄 — 안 섞인다
            { id: 9112, pickup: '중리동', dropoff: '신둔면', fare: 30000, verdict: 'pickup' },
        ] }));
        expect(r.state.rows[0].mark).toBe('ok');
        expect(r.state.rows[0].verdict).toBe('pickup');
    });

    it('🔴 막힘 줄이 다른 축에서 막히면 🟠 · 통과면 🔴 뚫림', () => {
        let st = run(startScenario(def, T0), baseWorld(T0)).state;
        expect(run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'fare')] })).state.rows[0].mark).toBe('warn');
        st = run(startScenario(def, T0), baseWorld(T0)).state;
        st = run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'pass')] })).state;
        st = run(st, baseWorld(T0 + 25_000, { intel: [intelFor('A1', 11, 'pass')] })).state;
        expect(st.rows[0].mark).toBe('bad');
    });

    it('🔴 KEEP 줄 — 콜이 오면 «KEEP 하세요», KEEP 되면 ✅ · 3초 뒤 목록 채점 · 다음 줄 콜', () => {
        let st = run(startScenario(def, T0), baseWorld(T0)).state;
        st = run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'pickup')] })).state;
        let r = run(st, baseWorld(T0 + 8000));                  // A1 끝난 뒤 3초 — A2 로 넘어가 콜을 낸다
        expect(r.state.index).toBe(idx('A2'));
        expect(r.send?.dropoff.region).toBe('신둔면');
        st = r.state;
        st = run(st, baseWorld(T0 + 12_000, { orders: [orderFor('A2', 'o-a2', 'ORDER_SECURED_EVALUATING')] })).state;
        expect(st.rows[idx('A2')].note).toMatch(/KEEP/);
        const kept = { orders: [orderFor('A2', 'o-a2', 'ORDER_CONFIRMED')],
            filter: { dispatchPhase: 'GATHERING', goalCities: ['이천시'], callTarget: 'DEST', destinationKeywords: ['매산동', '쌍령동', '양벌동'] } };
        st = run(st, baseWorld(T0 + 14_000, kept)).state;
        expect(st.rows[idx('A2')].mark).toBe('ok');
        expect(st.rows[idx('A2')].orderId).toBe('o-a2');
        r = run(st, baseWorld(T0 + 17_500, kept));
        expect(r.state.rows[idx('A2')].checks?.every(c => c.ok)).toBe(true);
        expect(r.state.index).toBe(idx('A3'));
    });

    it('🔴 «모의 주행 시작»은 운행 중이 되어야 넘어가고 · B1 은 A2 상차지 도착 전에는 콜을 안 낸다', () => {
        let st = startScenario(def, T0);
        st = { ...st, index: idx('M1'), rows: st.rows.map((x, i) => i === idx('A2') ? { ...x, mark: 'ok', orderId: 'o-a2' } : i < idx('M1') ? { ...x, mark: 'ok' } : x) };
        let r = run(st, baseWorld(T0));
        expect(r.send).toBeNull();
        expect(r.state.index).toBe(idx('M1'));
        const driving = { dispatchPhase: 'DELIVERING', goalCities: ['이천시'], callTarget: 'DEST', destinationKeywords: [] };
        r = run(r.state, baseWorld(T0 + 1000, { filter: driving, orders: [orderFor('A2', 'o-a2', 'ORDER_CONFIRMED')] }));
        expect(r.state.rows[idx('M1')].mark).toBe('ok');
        r = run(r.state, baseWorld(T0 + 5000, { filter: driving, orders: [orderFor('A2', 'o-a2', 'ORDER_CONFIRMED')] }));
        expect(r.state.index).toBe(idx('B1'));
        expect(r.send).toBeNull();                                 // 아직 모다아울렛에 안 섰다
        r = run(r.state, baseWorld(T0 + 6000, { filter: driving,
            orders: [orderFor('A2', 'o-a2', 'ORDER_CONFIRMED', { arrivedPickupAt: new Date(T0 + 6000).toISOString() })] }));
        expect(r.send?.pickup.region).toBe('곤지암읍');
    });

    it('🔴 좌표가 같은 콜(C2 ↔ D1)은 보낸 뒤 새로 생긴 콜과 짝짓는다', () => {
        let st = startScenario(def, T0);
        const d1 = idx('D1');
        /* D1 은 «B3 하차지에 서면» 나간다 — B3 콜과 그 하차 도착을 세상에 둔다 */
        st = { ...st, index: d1, rows: st.rows.map((x, i) => i === idx('B3') ? { ...x, mark: 'ok', orderId: 'o-b3' } : i < d1 ? { ...x, mark: 'ok' } : x) };
        const old = orderFor('C2', 'o-c2', 'SAFE_CANCEL');       // C2 로 왔다 취소한 콜 — 좌표가 D1 과 같다
        const b3 = orderFor('B3', 'o-b3', 'ORDER_DELIVERED', { arrivedDropoffAt: new Date(T0).toISOString() });
        st = run(st, baseWorld(T0, { orders: [old, b3] })).state;
        expect(st.rows[d1].mark).toBe('sent');
        const r = run(st, baseWorld(T0 + 4000, { orders: [old, b3, orderFor('D1', 'o-d1', 'ORDER_SECURED_EVALUATING')] }));
        expect(r.state.rows[d1].orderId).toBe('o-d1');
        expect(r.state.rows[d1].note).toMatch(/뚫림/);
    });

    it('45초 동안 안 올라오면 🔴 로 알리고 기다린다 · 건너뛰면 다음 줄', () => {
        let st = startScenario(def, T0);
        const a2 = idx('A2');
        st = { ...st, index: a2, rows: st.rows.map((x, i) => i < a2 ? { ...x, mark: 'ok' } : x) };
        st = run(st, baseWorld(T0)).state;
        st = run(st, baseWorld(T0 + 46_000)).state;
        expect(st.rows[a2].mark).toBe('bad');
        expect(st.index).toBe(a2);
        st = skipScenarioRow(def, st, T0 + 47_000);
        expect(st.rows[a2].mark).toBe('skip');
        expect(st.index).toBe(a2 + 1);
    });
});

import { startScenario, stepScenario, skipScenarioRow, NO_SHOW_MS, seqsToWithdraw } from '../../src/core/simScenario';
import type { ScenarioState, ScenarioWorld, WorldOrder } from '../../src/core/simScenario';
import { ICHEON_ROUND_TRIP } from '../../src/core/simScenarioIcheon';

/**
 * 🎬 **이천 왕복 — 서버가 사건순으로 콜을 낸다** (기사님 지시).
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
    /**
     * 🔴 **폰은 한 번 본 콜을 다시 판정하지 않는다** — 지문이 «상차 동 + 하차 동 + 요금»이다
     *    (`onedal-app/.../HijackService.kt` · `CallMemory` · 차종은 지문에 없다). 2026-09-15 01:39 두 번째 시작에서
     *    폰이 A1 을 `⏭️ [이미 본 콜]` 로 넘겨 판정 기록이 안 생겼다. 한 회차 안에 지문이 겹치면 뒤 줄은 채점할 수 없다.
     */
    it('🔴 한 회차 안에 폰 지문(상차 동 + 하차 동 + 요금)이 겹치는 콜이 없다', () => {
        const prints = def.filter(r => r.call).map(r => `${r.call!.pickup.region}|${r.call!.dropoff.region}|${r.call!.fare}`);
        expect(prints.filter((p, i) => prints.indexOf(p) !== i)).toEqual([]);
    });

    it('«○○에 서면» 줄은 앞에 있는 줄만 가리킨다', () => {
        def.forEach((r, i) => { if ('arrive' in r.when) expect(idx(r.when.arrive)).toBeLessThan(i); });
    });
});

describe('🎬 이천 왕복 — 사건순', () => {
    it('🔴 시작하면 A1 콜을 내고, 폰이 상차 목록으로 막으면 ✅ 막힘', () => {
        let st = startScenario(def, T0);
        let r = run(st, baseWorld(T0));
        expect(r.send?.pickup.region).toBe(callOf('A1').pickup.region);
        st = r.state;
        expect(st.rows[0].mark).toBe('sent');
        r = run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'pickupList')] }));
        expect(r.state.rows[0].mark).toBe('ok');
        expect(r.send).toBeNull();
    });

    /**
     * 🔴 **폰이 올린 기록(`intel`)에는 좌표가 없다** (2026-09-15 01:32 첫 시험 — A1 을 폰이 `pickup` 으로 옳게 막았는데
     *    카드는 «❔ 30초 동안 폰이 못 봤다»였다). 폰은 목록 화면의 동 이름·요금·차종만 읽는다 (`intel` 9112·9113 좌표 칸 빈칸).
     *    → 좌표가 비면 **상차·하차 동 이름 + 요금**으로 짝짓는다. 보낸 뒤 새로 생긴 줄만 보니 같은 동·요금의 옛 줄은 안 섞인다.
     */
    it('🔴 좌표 없는 폰 기록도 동 이름·요금으로 짝짓는다', () => {
        let st = run(startScenario(def, T0), baseWorld(T0, { intel: [{ id: 9111, pickup: '경안동', dropoff: '신둔면', fare: 30000, verdict: 'vehicle' }] })).state;
        const r = run(st, baseWorld(T0 + 4000, { intel: [
            { id: 9111, pickup: '경안동', dropoff: '신둔면', fare: 30000, verdict: 'vehicle' },   // 보내기 전 옛 줄 — 안 섞인다
            { id: 9112, pickup: '경안동', dropoff: '신둔면', fare: 30000, verdict: 'pickupList' },
        ] }));
        expect(r.state.rows[0].mark).toBe('ok');
        expect(r.state.rows[0].verdict).toBe('pickupList');
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
        st = run(st, baseWorld(T0 + 4000, { intel: [intelFor('A1', 11, 'pickupList')] })).state;
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
        /* 🔄 #134 — D1 은 «막힘»이 아니라 «올라오면 취소»다 (필터는 방향을 안 본다). 짝짓기는 그대로 — 옛 C2 콜이 아니라 새 콜에 붙는다 */
        expect(r.state.rows[d1].note).toMatch(/취소/);
    });

    /**
     * 🔴 **KEEP 줄이 폰에 막히면 곧바로 🔴 가 아니다 — 재판정을 기다린다** (다섯 번째 바퀴 · onedal-49 합의).
     *    폰은 새 콜을 직전 필터로 먼저 판정하고, 원달앱 #135 가 다음 필터 버전에 막았던 콜을 다시 판정한다.
     *    첫 판정으로 3초 만에 끝내면 그 재판정을 채점이 못 본다. NO_SHOW_MS 까지 기다리고, 끝내 막히면 «재판정 없음 / 재판정도 막힘»을 갈라 적는다.
     */
    it('🔴 KEEP 줄이 폰에 막히면 기다린다 — 재판정이 통과해 올라오면 ✅ · 끝까지 막히면 재판정 여부를 적는다', () => {
        const c3 = idx('C3');
        const at = (st: ScenarioState) => ({ ...st, index: c3, rows: st.rows.map((x, i) => i === idx('B3') ? { ...x, mark: 'ok' as const, orderId: 'o-b3' } : i < c3 ? { ...x, mark: 'ok' as const } : x) });
        /* C3 는 B3 하차에 선 뒤에 나간다 (여섯 번째 바퀴 개정) — 세계에 B3 하차 도착을 둔다 */
        const b3 = orderFor('B3', 'o-b3', 'ORDER_DELIVERED', { arrivedDropoffAt: new Date(T0).toISOString() });
        const sent = () => run(at(startScenario(def, T0)), baseWorld(T0, { orders: [b3] })).state;

        let st = run(sent(), baseWorld(T0 + 3000, { intel: [intelFor('C3', 11, 'pickupList')] })).state;
        expect(st.rows[c3].mark).toBe('sent');
        expect(st.rows[c3].note).toMatch(/다시 판정/);
        st = run(st, baseWorld(T0 + 20_000, { intel: [intelFor('C3', 11, 'pickupList'), intelFor('C3', 12, 'pass')],
            orders: [orderFor('C3', 'o-c3', 'ORDER_CONFIRMED')] })).state;
        expect(st.rows[c3].mark).toBe('ok');

        const once = run(sent(), baseWorld(T0 + NO_SHOW_MS + 5_000, { intel: [intelFor('C3', 11, 'pickupList')] })).state;
        expect(once.rows[c3].mark).toBe('bad');
        expect(once.rows[c3].note).toMatch(/재판정 없음/);
        const twice = run(sent(), baseWorld(T0 + NO_SHOW_MS + 5_000, { intel: [intelFor('C3', 11, 'pickupList'), intelFor('C3', 12, 'pickupList')] })).state;
        expect(twice.rows[c3].note).toMatch(/재판정도 막힘/);
    });

    it('NO_SHOW_MS(75초) 동안 안 올라오면 🔴 로 알리고 기다린다 · 건너뛰면 다음 줄', () => {
        let st = startScenario(def, T0);
        const a2 = idx('A2');
        st = { ...st, index: a2, rows: st.rows.map((x, i) => i < a2 ? { ...x, mark: 'ok' } : x) };
        st = run(st, baseWorld(T0)).state;
        st = run(st, baseWorld(T0 + 63_000)).state;
        expect(st.rows[a2].mark).not.toBe('bad');   // 🔴 하트비트(60초)를 넘겨 올라오는 콜은 🔴 가 아니다 (여섯 번째 바퀴 B3 63초)
        st = run(st, baseWorld(T0 + NO_SHOW_MS + 1_000)).state;
        expect(st.rows[a2].mark).toBe('bad');
        expect(st.index).toBe(a2);
        st = skipScenarioRow(def, st, T0 + NO_SHOW_MS + 2_000);
        expect(st.rows[a2].mark).toBe('skip');
        expect(st.index).toBe(a2 + 1);
    });

    /**
     * 🫳 **끝난 줄의 콜을 거둔다** (일곱 번째 바퀴 · onedal-49 합의).
     *    막힘으로 채점된 B2 콜이 남아 복귀 켬 뒤 잡혔고, 적재가 차 C3 가 막혔다. 끝난 줄(doneAt)만 거둔다 —
     *    «🔴 인데 기다리는 중»(doneAt 없음)은 재판정을 기다려야 하니 남긴다.
     */
    it('🔴 끝난 줄(ok·skip·끝낸 bad)의 콜 번호만 거둔다 · 기다리는 줄과 이미 거둔 번호는 안 거둔다', () => {
        const st = startScenario(def, T0);
        const rows = st.rows.map((x, i) =>
            i === 0 ? { ...x, mark: 'ok' as const, doneAt: T0, seq: 1 }
            : i === 1 ? { ...x, mark: 'skip' as const, doneAt: T0, seq: 2 }
            : i === 2 ? { ...x, mark: 'bad' as const, seq: 3 }              // 🔴 인데 기다리는 중
            : i === 3 ? { ...x, mark: 'bad' as const, doneAt: T0, seq: 4 }
            : i === 4 ? { ...x, mark: 'ok' as const, doneAt: T0 }            // 콜 없는 줄 (act)
            : x);
        expect(seqsToWithdraw(rows, [2])).toEqual([1, 4]);
    });

    /** 🔄 D1 — 복귀콜(C3)을 쥐면 하차 목록이 집이다 → 관고동은 막힌다 (일곱 번째 바퀴 intel region · 필터.md «복귀 켬 · 복귀콜 잡음 = 집») */
    it('🔴 D1 은 «막힘 · 하차지 목록 밖»이다 — 추정이 아니다', () => {
        const d1 = def[idx('D1')];
        expect([d1.kind, (d1 as any).blockBy, (d1 as any).guess ?? false]).toEqual(['block', 'region', false]);
    });
});


/**
 * 🎬 **이천 성공하는 5콜 — 빨리 도는 문제** (기사님 지시).
 *
 * 기사님: *"빠른시간에 잘되는 콜들로 빨리 빨리 테스트 하고 싶어 — 주소 목록에서 경로를 추출해서 성공하는 콜들로 이루어진
 * 5개 짜리 문제 · 2개는 갈때 1개는 복귀클릭하고 복귀콜이 잡히기전에 나머지는 복귀 콜로"* · *"이천 왕복하루 아래에"*.
 * 콜은 이천 왕복 하루에서 **실제로 KEEP 까지 간 경로**(A2 · B1 · B3 · C3 · D3 — 13:04 바퀴)만 쓴다.
 */
describe('🎬 이천 성공하는 5콜 — 줄 데이터', () => {
    const { ICHEON_FIVE_OK } = require('../../src/core/simScenarioIcheon');
    const five = ICHEON_FIVE_OK as typeof def;
    const at = (id: string) => five.findIndex(r => r.id === id);

    it('🔴 콜 다섯이 전부 KEEP 이다 — 막힘·취소 줄이 없다 · 할 일 셋(모의 주행 · 복귀 켬 · 하차 완료)', () => {
        expect(five.filter(r => r.call)).toHaveLength(5);
        expect(five.filter(r => r.call).every(r => r.kind === 'keep')).toBe(true);
        expect(five.some(r => r.kind === 'block' || r.kind === 'cancel')).toBe(false);
        expect(five.filter(r => r.kind === 'act')).toHaveLength(3);
    });

    it('🔴 가는 길 둘 → 복귀 켬 → 복귀콜 전 이천 안 콜 하나 → 복귀콜 둘', () => {
        const keeps = five.filter(r => r.kind === 'keep').map(r => r.id);
        const home = five.findIndex(r => r.kind === 'act' && r.done?.kind === 'target' && r.done.value === 'HOME');
        expect(home).toBeGreaterThan(-1);
        expect(keeps.filter(id => at(id) < home)).toHaveLength(2);
        expect(keeps.filter(id => at(id) > home)).toHaveLength(3);
        /* 복귀 켠 뒤 첫 콜은 이천 안 — 하차가 이천이다 · 나머지 둘은 집(광주) 방향 */
        const after = five.filter(r => r.kind === 'keep' && at(r.id) > home);
        expect(after[0].call!.dropoff.addressDetail).toMatch(/이천시/);
        expect(after.slice(1).every(r => /광주시/.test(r.call!.dropoff.addressDetail))).toBe(true);
    });

    it('«○○에 서면» 줄은 앞에 있는 줄만 가리킨다 · 폰 지문이 겹치지 않는다', () => {
        five.forEach((r, i) => { if ('arrive' in r.when) expect(at(r.when.arrive)).toBeLessThan(i); });
        const prints = five.filter(r => r.call).map(r => `${r.call!.pickup.region}|${r.call!.dropoff.region}|${r.call!.fare}`);
        expect(new Set(prints).size).toBe(prints.length);
    });

    /**
     * 🔴 **콜이 나가는 자리에서 상차지까지 4km 안** — 폰은 내 위치 반경(자동이면 줄어든다) 밖 상차지를 막는다.
     *    나가는 자리 = «○○에 서면»의 그 정거장 · «앞 줄 다음»이면 앞 줄이 나간 자리. 모르는 첫 줄은 뺀다.
     */
    it('🔴 콜이 나가는 자리에서 상차지까지 4km 안이다', () => {
        const rad = Math.PI / 180;
        const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
            const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2
                + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
            return 2 * 6371 * Math.asin(Math.sqrt(x));
        };
        const sentAt = (i: number): { lon: number; lat: number } | null => {
            const r = five[i];
            if ('arrive' in r.when) { const c = five[at(r.when.arrive)].call!; return r.when.stop === 'pickup' ? c.pickup : c.dropoff; }
            return i > 0 ? sentAt(i - 1) : null;
        };
        const far = five.flatMap((r, i) => {
            const from = r.call ? sentAt(i) : null;
            return from && km(from, r.call!.pickup) > 4 ? [`${r.id} ${km(from, r.call!.pickup).toFixed(1)}km`] : [];
        });
        expect(far).toEqual([]);
    });
});

describe('🎬 할 일 줄은 «○○에 서면»이 먼저다', () => {
    /** 🔴 도착 전에 할 일이 이미 되어 있어도(복귀를 미리 켬) 넘어가지 않는다 — 넘어가면 다음 콜이 엉뚱한 자리에서 나가 폰이 막는다 */
    const place = { name: '가', region: '관고동', addressDetail: '경기 이천시 관고동', lon: 127.43, lat: 37.285 };
    const mini = [
        { id: 'K', stage: 'A', when: { after: 'prev' }, kind: 'keep', call: { pickup: place, dropoff: place, fare: 50000 }, say: '', why: '' },
        { id: 'C', stage: 'A', when: { arrive: 'K', stop: 'dropoff' }, kind: 'act', say: '복귀 켬', why: '', done: { kind: 'target', value: 'HOME' } },
        { id: 'N', stage: 'A', when: { after: 'prev' }, kind: 'keep', call: { pickup: place, dropoff: place, fare: 30000 }, say: '', why: '' },
    ] as unknown as typeof def;
    const home = { dispatchPhase: 'DELIVERING', goalCities: ['이천시'], callTarget: 'HOME', destinationKeywords: [] };
    const ready = (): ScenarioState => {
        const st = startScenario(mini, T0);
        st.rows[0] = { ...st.rows[0], mark: 'ok', orderId: 'o1', doneAt: T0 - 10_000 };
        return { ...st, index: 0 };
    };

    it('🔴 복귀가 먼저 켜져 있어도 하차지에 서기 전에는 기다린다', () => {
        let st = stepScenario(mini, ready(), baseWorld(T0, { filter: home, orders: [{ id: 'o1', status: 'IN_TRANSIT' }] })).state;
        st = stepScenario(mini, st, baseWorld(T0 + 1000, { filter: home, orders: [{ id: 'o1', status: 'IN_TRANSIT' }] })).state;
        expect(st.index).toBe(1);
        expect(st.rows[1].mark).toBe('wait');
    });

    it('🔴 하차지에 서면 그때 ✅ 로 넘어간다', () => {
        const arrived = [{ id: 'o1', status: 'IN_TRANSIT', arrivedDropoffAt: '2026-09-15T11:17:00Z' }];
        const st = stepScenario(mini, ready(), baseWorld(T0, { filter: home, orders: arrived })).state;
        expect(st.rows[1].mark).toBe('ok');
    });
});

describe('🎬 짝짓기 — 좌표가 어긋나도 동 이름·요금이 맞으면 그 줄의 콜이다', () => {
    /**
     * 🔴 픽커 목록은 가게 이름만 보여 서버가 찾은 좌표가 문제지 지점과 어긋난다 (22:03 바퀴 — 하차 2.4km).
     *    좌표로만 보면 KEEP 한 콜을 못 알아봐 75초 🔴 → 건너뜀 → 콜 없이 «모의 주행 시작»이 나온다.
     *    한 문제지 안에서 동 이름·요금 조합은 겹치지 않는다(«폰 지문이 겹치지 않는다» 검사).
     */
    const { ICHEON_FIVE_OK } = require('../../src/core/simScenarioIcheon');
    const five = ICHEON_FIVE_OK as typeof def;

    it('🔴 픽커 MANUAL 콜 — 하차 좌표가 2.4km 어긋나도 초월읍 → 신둔면 · 50000 이면 S1 ✅', () => {
        const r = stepScenario(five, startScenario(five, T0), baseWorld(T0));
        expect(r.send?.dropoff.region).toBe('신둔면');
        const picked = {
            id: 'MANUAL-1789477411421', status: 'ORDER_CONFIRMED', fare: 50000,
            pickup: '경기 광주시 초월읍 모다아울렛', dropoff: '경기 이천시 신둔면 신둔농협 예스파크',
            pickupX: 127.31258709426947, pickupY: 37.36329808668746, dropoffX: 127.383808316419, dropoffY: 37.2928984230697,
        };
        const st = stepScenario(five, r.state, baseWorld(T0 + 4000, { orders: [picked] })).state;
        expect(st.rows[0].orderId).toBe('MANUAL-1789477411421');
        expect(st.rows[0].mark).toBe('ok');
    });
});

describe('🎬 문제 목록 — 서버가 둘을 들고 현황판이 이천 왕복 하루 아래에 5콜을 그린다', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const sim = readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8');
    const board = readFileSync(join(__dirname, '../../../client-app/src/statusboard/StatusBoard.tsx'), 'utf8');

    it('🔴 서버가 문제를 이름표로 고른다', () => {
        expect(sim).toMatch(/icheonRound:\s*\{ name: '이천 왕복 하루', rows: ICHEON_ROUND_TRIP \}/);
        expect(sim).toMatch(/icheonFive:\s*\{ name: '이천 성공하는 5콜', rows: ICHEON_FIVE_OK \}/);
    });

    it('🔴 현황판은 이천 왕복 하루 카드 아래에 5콜 카드를 그린다', () => {
        const a = board.indexOf('<ScenarioCard scenarioKey="icheonRound"');
        const b = board.indexOf('<ScenarioCard scenarioKey="icheonFive"');
        expect(a).toBeGreaterThan(-1);
        expect(b).toBeGreaterThan(a);
    });
});

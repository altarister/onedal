// @ts-nocheck
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import statsRouter from '../../src/routes/stats';
import { rollupDay, OPS_STATS_MAX_DAYS } from '../../src/services/callFlowStats';

/**
 * 📊 **운영센터 통계 — 실제로 있는 자료만** (reviews/33 4단계 · onedal-69 «가» Q7 «가»).
 *    노선은 «목록에 뜬 실물 콜»(intel source='real' → stats_flows · 옛 /flows/admin 과 같은 줄 · 같은 합) — 시뮬은 안 센다.
 *    앱이 버린 콜도 실물 목록 줄에서 · 같은 콜은 한 번(groupSameCalls) · 잠김(locked) · 판정 없음은 «버린 것»이 아니다.
 *    어느 배차망 자료인지 함께 준다(sources) — 화면 머리가 «지금은 카카오 픽커만»처럼 사실로 적게.
 *    기사별 벌이는 없다 — 잡은 콜에 시뮬/실콜을 가를 칸이 없다.
 */
const U = 'test-ops-stats', A = 'test-ops-stats-admin';
const DAY = '2020-03-04';
const iso = (h: number, m = 0) => new Date(Date.parse(`${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)).toISOString();
const ins = db.prepare(`INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp, vehicleType, deliveryDistanceKm, verdict, reserved, reservedDay, source)
    VALUES (?, 'd', 'INTEL_BULK', ?, ?, ?, ?, ?, '다마스', ?, ?, 0, 0, ?)`);
const get = async (router: any, path: string, query: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app: { get: () => undefined }, params: {}, query, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};

beforeAll(() => {
    for (const id of [U, A]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    ins.run(U, '경기 광주시 경안동', '서울 용산구 한남동', 30000, iso(9, 0), 'kakaopicker', 20, 'pass', 'real');
    ins.run(U, '경기 광주시 경안동', '서울 용산구 한남동', 31000, iso(9, 1), 'kakaopicker', 20, 'pass', 'real');    // 같은 콜 다시 뜸
    ins.run(U, '경기 이천시 부발읍', '서울 강남구 역삼동', 90000, iso(10, 0), 'kakaopicker', 60, 'region', 'real');  // 버림(지역)
    ins.run(U, '경기 이천시 부발읍', '서울 강남구 역삼동', 95000, iso(10, 5), 'kakaopicker', 60, 'region', 'real');  // 같은 콜 — 한 번
    ins.run(U, '경기 이천시 부발읍', '경기 광주시 경안동', 40000, iso(11, 0), 'kakaopicker', 15, 'locked', 'real');  // 잠김 — 버린 것 아님
    ins.run(U, '경기 이천시 부발읍', '경기 성남시 분당구', 20000, iso(12, 0), 'kakaopicker', 25, null, 'real');      // 판정 없음
    ins.run(U, '경기 이천시 부발읍', '서울 강남구 역삼동', 500000, iso(13, 0), 'insung', 60, 'fare', 'sim');        // 시뮬 — 어디에도 없다
    ins.run(U, '경기 여주시 가남읍', '서울 송파구 잠실동', 70000, iso(14, 0), 'kakaopicker', 50, 'vehicle', 'real'); // 버림(차종) …
    ins.run(U, '경기 여주시 가남읍', '서울 송파구 잠실동', 70000, iso(14, 2), 'kakaopicker', 50, 'locked', 'real');  // … 그 뒤 잠김 — 버린 까닭은 차종 그대로
    rollupDay(DAY);
});
afterAll(() => {
    db.prepare(`DELETE FROM intel WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM stats_flows WHERE day = ?`).run(DAY);
    db.prepare(`DELETE FROM stats_rollup_days WHERE day = ?`).run(DAY);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [U, A]) db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
});

describe('📊 운영센터 통계', () => {
    it('🔴 노선 줄 = 옛 /flows/admin 같은 기간 그 노선의 합 · 평균 거리도', async () => {
        const out = await get(opsRouter, '/stats', { from: DAY, to: DAY });
        const admin = await get(statsRouter, '/flows/admin', { from: DAY, to: DAY, groupBy: 'day' });
        const sumCalls = (from: string, to: string) => admin.cells.filter((c: any) => c.from === from && c.to === to).reduce((n: number, c: any) => n + c.calls, 0);
        expect(out.routes.length).toBeGreaterThan(0);
        for (const r of out.routes) expect(r.calls).toBe(sumCalls(r.from, r.to));
        expect(out.routes.every((r: any) => 'kmAvg' in r)).toBe(true);
    });
    it('🔴 어느 배차망 자료인가 — 실물만(시뮬 인성은 0 · 줄 없음)', async () => {
        const out = await get(opsRouter, '/stats', { from: DAY, to: DAY });
        expect(out.sources.find((s: any) => s.targetApp === 'kakaopicker').calls).toBeGreaterThan(0);
        expect(out.sources.find((s: any) => s.targetApp === 'insung')?.calls ?? 0).toBe(0);
    });
    it('🔴 버린 콜 — 같은 콜 한 번 · 잠김 · 판정 없음은 따로 · 시뮬 없음 · 요금 높은 순', async () => {
        const { dropped } = await get(opsRouter, '/stats', { from: DAY, to: DAY });
        expect(dropped.byAxis).toEqual([{ axis: 'region', calls: 1 }, { axis: 'vehicle', calls: 1 }]);
        expect(dropped.locked).toBe(1);
        expect(dropped.unjudged).toBe(1);
        expect(dropped.topFares).toHaveLength(2);
        expect(dropped.topFares[0]).toMatchObject({ targetApp: 'kakaopicker', fare: 95000, axis: 'region' });
        expect(dropped.topFares[1]).toMatchObject({ fare: 70000, axis: 'vehicle' });   // 잠김(locked)이 앞의 버린 까닭을 덮지 않는다 (f5 리뷰)
        expect(dropped.topFares.some((t: any) => t.fare === 500000)).toBe(false);
    });

    /* 원문을 한 번에 읽어 묶는 문이라 기간을 자른다 — 동기 DB 라 긴 읽기 동안 폰 보고가 멈춘다 (f5 리뷰) */
    it('🔴 기간은 OPS_STATS_MAX_DAYS 일까지 — 더 길면 끝(to)에서 거꾸로 자른다', async () => {
        const out = await get(opsRouter, '/stats', { from: '2000-01-01', to: DAY });
        const days = (Date.parse(`${out.to}T00:00:00Z`) - Date.parse(`${out.from}T00:00:00Z`)) / 86_400_000 + 1;
        expect(out.to).toBe(DAY);
        expect(days).toBe(OPS_STATS_MAX_DAYS);
    });
});

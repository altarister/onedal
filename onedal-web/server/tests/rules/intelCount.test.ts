// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📚 **원문(intel) 개수는 처음 한 번만 센다 · 통계 묶기는 인덱스로 읽는다** (서버 병목 14 · onedal-1f «가»).
 * 데이터가 있는 앱 보고마다 캐시를 비워 다음 보고에서 표 전체를 셌다(원문은 지우는 곳이 없어 늘기만 한다).
 * 통계 묶기의 하루치 질문과 매시간 MIN 질문은 type · source · timestamp 로 표를 훑었다.
 */
const U = 'test-intel-count';
const DEV = 'dev-intel-count-1';
const app = { get: () => ({ to: () => ({ emit: () => {} }) }) };
const handler = (() => {
    const layer = scrapRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const report = async (n: number) => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    const data = Array.from({ length: n }, (_, i) => ({ pickup: `상${i}`, dropoff: `하${i}`, fare: 10000 }));
    await handler({ body: { data, deviceId: DEV }, app }, res);
    return out?.apiStatus?.totalItems;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'intel@test', '원문개수검사');
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(async () => {
    await new Promise(r => setTimeout(r, 200));
    db.prepare(`DELETE FROM intel WHERE device_id = ?`).run(DEV);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📚 원문 개수', () => {
    it('🔴 처음 한 번만 센다 — 그 뒤엔 넣는 줄 수만큼 더한다', async () => {
        const first = await report(2);
        const prep = jest.spyOn(db, 'prepare');
        const second = await report(3);
        const third = await report(0);
        const counted = prep.mock.calls.filter(c => String(c[0]).includes('COUNT(*)') && String(c[0]).includes('FROM intel')).length;
        prep.mockRestore();
        expect(counted).toBe(0);
        expect(second - first).toBe(3);
        expect(third).toBe(second);
    });
});

describe('📚 통계 묶기의 인덱스', () => {
    const plan = (sql: string, ...args: any[]) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as any[]).map(r => r.detail).join(' | ');
    it('🔴 하루치 질문과 MIN 질문이 idx_intel_bulk_real_ts 를 쓴다(표 훑기 아님)', () => {
        expect(plan(`SELECT user_id FROM intel WHERE type = 'INTEL_BULK' AND source = 'real' AND timestamp >= ? AND timestamp < ?`, 'a', 'b')).toContain('idx_intel_bulk_real_ts');
        expect(plan(`SELECT MIN(timestamp) AS t FROM intel WHERE type = 'INTEL_BULK' AND source = 'real'`)).toContain('idx_intel_bulk_real_ts');
    });
});

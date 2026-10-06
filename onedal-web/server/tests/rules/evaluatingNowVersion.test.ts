// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { phoneSupplyOf } from '../../src/state/phoneSupply';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🧬 **필터 판 글자는 설정의 지문이다 — «지금 심사 중인가»는 넣지 않는다** (onedal-1f «가» · 04 앱 68f75f6e 먼저).
 * 넣었더니 상세(심사 중 true) ↔ 목록(false)마다 판이 num45a ↔ kxy685 로 갈려, 앱이 막아 둔 통과 콜을 30초마다 다시 열었다.
 * 심사 중인가는 관제앱 공급의 폰마다 몫(PHONE)으로 간다 — 필터 본문 · 판에는 안 든다.
 */
const U = 'test-evaluating-now-version';
const DEV = 'dev-evalnow-1';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handler = (() => {
    const layer = scrapRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const report = async (filterVersion: string) => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await handler({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, body: { data: [], deviceId: DEV, filterVersion, supplyLinked: true } }, res);
    return out;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'evalnow@test', '판글자검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🧬 필터 판과 심사 중 — 관제앱 공급(reviews/50 ①-5 · 보고 응답엔 필터가 없다)', () => {
    it('🔴 같은 설정이면 심사 중이든 아니든 판이 같다 · 그 폰 몫의 evaluatingNow 가 참/거짓', async () => {
        await report('');   // 살아 있는 폰이 되게(공급 폰 줄은 살아 있는 폰만)
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(DEV, 'some-preview');
        const judging = phoneSupplyOf(U);
        s.deviceEvaluatingMap.delete(DEV);
        const listing = phoneSupplyOf(U);
        expect(judging.filterVersion).toBeTruthy();
        expect(listing.filterVersion).toBe(judging.filterVersion);
        expect(judging.phones[DEV].evaluatingNow).toBe(true);
        expect(listing.phones[DEV].evaluatingNow).toBe(false);
        expect(judging.filter).not.toHaveProperty('evaluatingNow');   // 필터 본문엔 없다 — 폰마다 따로
    });

    it('🔴 보고 응답에는 필터 · 판 · 심사 중 칸이 없다', async () => {
        const r = await report('');
        for (const k of ['dispatchEngineArgs', 'filterVersion', 'evaluatingNow', 'decision', 'foldAfter']) expect(r).not.toHaveProperty(k);
        expect(r.deviceControl).not.toHaveProperty('mode');
    });
});

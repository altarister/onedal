// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🛰️ **이중 발신 경고는 폰의 실제 IP 로 가른다** (onedal-1f «가»).
 * 실서버는 클라우드플레어를 거쳐 req.ip 가 중계 에지 IP 다 — 에지가 바뀌면(.88 ↔ .89) 폰 한 대로도 «두 곳» 경고가 났다.
 * 클라우드플레어가 붙이는 cf-connecting-ip 가 있으면 그것, 없으면(로컬 직접 연결) req.ip.
 */
const U = 'test-dual-sender';
const DEV = 'dev-dual-1';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handler = (() => {
    const layer = scrapRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const send = async (ip: string, cf?: string) => {
    const res = { status: () => res, json: () => res };
    const headers: Record<string, string> = cf ? { 'cf-connecting-ip': cf } : {};
    await handler({ app, ip, body: { data: [], deviceId: DEV }, headers, get: (h: string) => headers[h.toLowerCase()] }, res);
};
const warnings = (spy: jest.SpyInstance) => spy.mock.calls.filter(c => String(c[0]).includes('[이중 발신]')).length;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'dual@test', '이중발신검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🛰️ 이중 발신 경고', () => {
    it('🔴 에지 IP 만 바뀌고 폰 IP(cf-connecting-ip)가 같으면 경고 없음', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await send('162.159.106.88', '211.1.1.1');
        await send('162.159.106.89', '211.1.1.1');
        expect(warnings(spy)).toBe(0);
        spy.mockRestore();
    });

    it('🔴 폰 IP 가 둘이면 경고 한 번', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await send('162.159.106.88', '211.2.2.2');
        await send('162.159.106.88', '211.3.3.3');
        expect(warnings(spy)).toBe(1);
        spy.mockRestore();
    });
});

// @ts-nocheck
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import db from '../../src/db';
import devicesRouter from '../../src/routes/devices';
import scrapRouter from '../../src/routes/scrap';
import { generatePin } from '../../src/state/pairingStore';
import { authDevice } from '../../src/core/deviceAuth';
import { noteOrigin } from '../../src/utils/originLog';
import { DEVICE_TOKEN_HEADER, PAIR_TOKEN_FIELD, DEVICE_LINK_ERRORS } from '@onedal/shared';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🔑 **폰은 비밀 토큰으로 자기를 밝힌다 · 연결 안 된 폰은 거절** (reviews/29 1단계 D·E · onedal-1f «가» · 04 와 이름 확정).
 * 폰 이름(앱폰-기종-3자리)만으로 자기를 밝히면 남이 대입해 다른 기사의 콜을 건드릴 수 있었다.
 * 이번 단계: 연결 때 토큰을 주고 받으면 대조 · 틀리면 401 · 없으면 통과(옛 앱 · 기사님 폰 재연결 뒤 강제).
 */
const U = 'test-devauth';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handle = (router: any, method: string, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (h: any, body: any, headers: any = {}) => {
    let status = 200, out: any = null;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await h({ app, body, headers, ip: '9.9.9.9', get: (k: string) => headers[k.toLowerCase()] }, res);
    return { status, out };
};
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🔑 연결 — 토큰을 준다', () => {
    it('🔴 PIN 으로 연결하면 응답에 deviceToken · DB 에는 sha256 만', async () => {
        const { pin } = generatePin(U);
        const { status, out } = await call(handle(devicesRouter, 'post', '/pair'), { pin, deviceId: 'd-auth-1', deviceName: 'SM-TEST' });
        expect(status).toBe(200);
        const token = out[PAIR_TOKEN_FIELD];
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThanOrEqual(32);
        const row = db.prepare(`SELECT token_hash FROM user_devices WHERE device_id = 'd-auth-1'`).get() as any;
        expect(row.token_hash).toBe(sha(token));
        expect(JSON.stringify(row)).not.toContain(token);
    });
    it('🔴 PIN 이 틀리면 401 PIN_INVALID', async () => {
        const { status, out } = await call(handle(devicesRouter, 'post', '/pair'), { pin: '000000', deviceId: 'd-auth-x' });
        expect(status).toBe(401);
        expect(out.error).toBe(DEVICE_LINK_ERRORS.PIN_INVALID);
    });
});

describe('🔑 폰 보고 — 토큰 대조', () => {
    let token = '';
    beforeAll(async () => {
        const { pin } = generatePin(U);
        token = (await call(handle(devicesRouter, 'post', '/pair'), { pin, deviceId: 'd-auth-2' })).out[PAIR_TOKEN_FIELD];
    });
    it('🔴 authDevice — 맞는 토큰 · 없는 토큰(이번 단계 통과) · 틀린 토큰 401 · 연결 안 된 폰 401', () => {
        expect(authDevice('d-auth-2', token)).toMatchObject({ ok: true, userId: U });
        expect(authDevice('d-auth-2', undefined)).toMatchObject({ ok: true, userId: U });
        expect(authDevice('d-auth-2', 'nope')).toMatchObject({ ok: false, status: 401, error: DEVICE_LINK_ERRORS.TOKEN_INVALID });
        expect(authDevice('d-auth-none', token)).toMatchObject({ ok: false, status: 401, error: DEVICE_LINK_ERRORS.NOT_PAIRED });
        expect(authDevice(undefined, token)).toMatchObject({ ok: false, status: 401, error: DEVICE_LINK_ERRORS.NOT_PAIRED });
    });
    it('🔴 /api/scrap — 틀린 토큰 401 DEVICE_TOKEN_INVALID · 연결 안 된 폰 401 DEVICE_NOT_PAIRED', async () => {
        const h = handle(scrapRouter, 'post', '/');
        const bad = await call(h, { data: [], deviceId: 'd-auth-2' }, { [DEVICE_TOKEN_HEADER.toLowerCase()]: 'nope' });
        expect(bad.status).toBe(401);
        expect(bad.out.error).toBe(DEVICE_LINK_ERRORS.TOKEN_INVALID);
        const none = await call(h, { data: [], deviceId: 'd-auth-none' });
        expect(none.status).toBe(401);
        expect(none.out.error).toBe(DEVICE_LINK_ERRORS.NOT_PAIRED);
    });
});

describe('🔑 폰 문은 한 함수로', () => {
    const SRC = join(__dirname, '../../src');
    it('🔴 폰이 부르는 문은 authDevice 를 부른다 — 폰 이름만으로 사용자를 찾지 않는다', () => {
        for (const f of ['routes/scrap.ts', 'routes/detail.ts', 'routes/orders.ts', 'routes/emergency.ts', 'routes/telemetry.ts', 'routes/logs.ts', 'routes/devices.ts']) {
            expect([f, /authDevice\(/.test(readFileSync(join(SRC, f), 'utf8'))]).toEqual([f, true]);
        }
        for (const f of ['routes/scrap.ts', 'routes/detail.ts', 'routes/orders.ts', 'routes/emergency.ts']) {
            expect([f, /SELECT user_id FROM user_devices WHERE device_id/.test(readFileSync(join(SRC, f), 'utf8'))]).toEqual([f, false]);
        }
    });
    it('🔴 가짜 기사 ADMIN_USER 가 서버 코드에 없다 — 연결 안 된 폰은 거절', () => {
        const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []);
        const hits = walk(SRC).filter(f => /["']ADMIN_USER["']/.test(readFileSync(f, 'utf8'))).map(f => f.slice(SRC.length + 1));
        expect(hits).toEqual([]);
    });
});

describe('🌐 처음 보는 Origin', () => {
    it('🔴 Origin 마다 한 번만 한 줄 — 좁히기(CORS) 전에 실제 목록을 모은다', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        noteOrigin('https://example-origin.test', 'HTTP GET /x');
        noteOrigin('https://example-origin.test', '소켓');
        noteOrigin(undefined, 'HTTP GET /y');
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('처음 보는 Origin'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('https://example-origin.test');
        log.mockRestore();
    });
    it('🔴 HTTP 미들웨어와 소켓 접속 두 곳이 부른다', () => {
        const SRC = join(__dirname, '../../src');
        expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toMatch(/noteOrigin\(req\.headers\.origin/);
        expect(readFileSync(join(SRC, 'socket/socketHandlers.ts'), 'utf8')).toMatch(/noteOrigin\(socket\.handshake\.headers\.origin/);
    });
});

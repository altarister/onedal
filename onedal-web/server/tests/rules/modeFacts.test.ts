import db from '../../src/db';
import devicesRouter from '../../src/routes/devices';
import ordersRouter from '../../src/routes/orders';
import opsRouter from '../../src/routes/ops';
import { touchDeviceSession, getActiveDevicesSnapshot } from '../../src/state/deviceSessions';
import { getDeviceMode } from '../../src/state/deviceRegistry';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { DEVICE_MODES, DEVICE_MODE_LABEL, otherContractingAuto } from '@onedal/shared';

/**
 * 🎛️ **모드마다 서버가 하는 일 — 네 모드의 지금 답** (28 모드 정의 0단계).
 *    모드 이름으로 가르던 자리가 표의 사실을 보게 바꿀 때, 네 모드 × 자리의 답이 그대로인지 문다.
 *    실제 라우트 · 함수를 부른다 — 소스 글자는 안 읽는다.
 * 못 잡는 것: 상세 보고(/detail)의 체험 표시(판정 · 카카오까지 이어져 여기서 안 부름) · 관제웹 · 운영센터 화면(그쪽 검사 · 화면 찍기).
 */
const U = 'test-mode-facts', ADMIN = 'test-mode-facts-admin';
const quiet = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? quiet : undefined) };
const handlerOf = (router: any, path: string, method: 'get' | 'post') => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (router: any, path: string, method: 'get' | 'post', req: any) => {
    let out: any, code = 200;
    const res: any = { status: (c: number) => { code = c; return res; }, json: (b: any) => { out = b; return res; } };
    await handlerOf(router, path, method)({ app, params: {}, query: {}, body: {}, headers: {}, ...req }, res);
    return { code, out };
};
const register = (dev: string, mode: string) =>
    db.prepare(`INSERT OR REPLACE INTO user_devices (user_id, device_id, device_name, mode) VALUES (?, ?, ?, ?)`).run(U, dev, dev, mode);
const modeInDb = (dev: string) => (db.prepare(`SELECT mode FROM user_devices WHERE device_id = ?`).get(dev) as any)?.mode;
const setMode = (dev: string, mode: string) => call(devicesRouter, '/:deviceId/mode', 'post', { params: { deviceId: dev }, body: { mode }, user: { id: U } });

beforeAll(() => {
    for (const id of [U, ADMIN]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), auto_allowed_at = datetime('now') WHERE id = ?`).run(U);   // 자동 잡기 허락 있음 — 허락 없는 답은 «계약 안 함» describe 에서
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(ADMIN);
});
afterAll(() => {
    clearUserSession(U);   // 확정 보고가 건 서버 안전취소 타이머도 끈다
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    for (const id of [U, ADMIN]) {
        try { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); } catch { /* 감사 기록 등이 붙잡으면 다음 돌림이 INSERT OR IGNORE 로 이어 쓴다 */ }
    }
});

describe('🎛️ 모드 바꾸기 — 네 모드', () => {
    it('자동을 누르면 다른 자동 폰은 알람으로 옮겨지고 · 나머지 셋은 다른 폰을 안 건드린다', async () => {
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            register('dev-mf-other', 'AUTO');
            register('dev-mf-me', 'MANUAL');
            await setMode('dev-mf-other', 'AUTO');
            got[m] = [(await setMode('dev-mf-me', m)).code, modeInDb('dev-mf-other')];
        }
        expect(got).toEqual({ AUTO: [200, 'ALARM'], ALARM: [200, 'AUTO'], MANUAL: [200, 'AUTO'], SIMULATION: [200, 'AUTO'] });
    });

    it('직접이면 필터가 꺼지고 · 자동 · 알람 · 체험이면 켜진다', async () => {
        register('dev-mf-other', 'MANUAL');
        await setMode('dev-mf-other', 'MANUAL');
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            register('dev-mf-me', m);
            await setMode('dev-mf-me', m);
            got[m] = getUserSession(U).filterEnabledByMode;
        }
        expect(got).toEqual({ AUTO: true, ALARM: true, MANUAL: false, SIMULATION: true });
    });
});

describe('🎛️ 자동 + 계약 안 함 — 저장은 모드 셋 + 칸 · 명령은 SIMULATION 그대로 (32 P1)', () => {
    const noContractInDb = (dev: string) => (db.prepare(`SELECT no_contract FROM user_devices WHERE device_id = ?`).get(dev) as any)?.no_contract;
    const post = (dev: string, body: any) => call(devicesRouter, '/:deviceId/mode', 'post', { params: { deviceId: dev }, body, user: { id: U } });
    beforeEach(() => { register('dev-mf-nc', 'MANUAL'); db.prepare(`UPDATE user_devices SET no_contract = 0 WHERE device_id = ?`).run('dev-mf-nc'); });

    it('🔴 옛 관제앱이 SIMULATION 을 보내면 DB 는 자동 + 계약 안 함 · 명령은 SIMULATION', async () => {
        const r = await post('dev-mf-nc', { mode: 'SIMULATION' });
        expect([r.code, r.out.mode, modeInDb('dev-mf-nc'), noContractInDb('dev-mf-nc')]).toEqual([200, 'SIMULATION', 'AUTO', 1]);
        expect(getDeviceMode('dev-mf-nc', U)).toBe('SIMULATION');
    });

    it('🔴 계약 안 함 켬 · 끔 — 자동 단추 옆 스위치', async () => {
        expect((await post('dev-mf-nc', { mode: 'AUTO', noContract: true })).out.mode).toBe('SIMULATION');
        expect((await post('dev-mf-nc', { mode: 'AUTO', noContract: false })).out.mode).toBe('AUTO');
        expect(noContractInDb('dev-mf-nc')).toBe(0);
    });

    it('🔴 알람으로 바꿨다가 자동을 다시 눌러도 계약 안 함이 남는다(기사님 «가»)', async () => {
        await post('dev-mf-nc', { mode: 'AUTO', noContract: true });
        expect((await post('dev-mf-nc', { mode: 'ALARM' })).out.mode).toBe('ALARM');
        expect(noContractInDb('dev-mf-nc')).toBe(1);
        expect((await post('dev-mf-nc', { mode: 'AUTO' })).out.mode).toBe('SIMULATION');
    });

    it('🔴 DB 에 SIMULATION 값이 남지 않는다', async () => {
        await post('dev-mf-nc', { mode: 'SIMULATION' });
        expect((db.prepare(`SELECT COUNT(*) n FROM user_devices WHERE mode = 'SIMULATION'`).get() as any).n).toBe(0);
    });

    it('옛 저장값 SIMULATION 행도 명령은 SIMULATION 으로 읽는다', async () => {
        db.prepare(`UPDATE user_devices SET mode = 'SIMULATION' WHERE device_id = ?`).run('dev-mf-nc');
        expect(getDeviceMode('dev-mf-nc', U)).toBe('SIMULATION');
        db.prepare(`UPDATE user_devices SET mode = 'MANUAL' WHERE device_id = ?`).run('dev-mf-nc');
    });

    it('🔴 자동 잡기 허락이 안 산 기사님의 «자동»은 계약 안 함으로 받는다 — 끄라고 보내도(27 21 «가» · 관제웹을 거치지 않는 요청도)', async () => {
        db.prepare(`UPDATE users SET auto_allowed_at = NULL WHERE id = ?`).run(U);
        try {
            expect((await post('dev-mf-nc', { mode: 'AUTO' })).out.mode).toBe('SIMULATION');
            expect((await post('dev-mf-nc', { mode: 'AUTO', noContract: false })).out.mode).toBe('SIMULATION');
            expect((await post('dev-mf-nc', { mode: 'ALARM' })).out.mode).toBe('ALARM');
        } finally {
            db.prepare(`UPDATE users SET auto_allowed_at = datetime('now') WHERE id = ?`).run(U);
        }
        expect((await post('dev-mf-nc', { mode: 'AUTO', noContract: false })).out.mode).toBe('AUTO');   // 대조 — 허락이 살면 진짜 자동
    });

    it('계약 안 함 칸이 참 · 거짓이 아니면 400', async () => {
        expect((await post('dev-mf-nc', { mode: 'AUTO', noContract: 'yes' })).code).toBe(400);
    });
});

describe('🏢 운영센터 회원 폰 모드 — 네 모드', () => {
    it('자동 · 알람 · 직접은 그대로 · 체험은 알람으로 보인다', async () => {
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            register('dev-mf-ops', m);
            await setMode('dev-mf-ops', m);
            const { out } = await call(opsRouter, '/members/:id', 'get', { params: { id: U }, user: { id: ADMIN } });
            got[m] = out.member.phones.find((p: any) => p.deviceId === 'dev-mf-ops')?.mode;
        }
        expect(got).toEqual({ AUTO: 'AUTO', ALARM: 'ALARM', MANUAL: 'MANUAL', SIMULATION: 'ALARM' });
    });
});

describe('🐥 확정 보고의 체험 표시 — 폰 모드로', () => {
    it('체험 폰이 올린 콜만 체험 콜이다', async () => {
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            register('dev-mf-confirm', m);
            await setMode('dev-mf-confirm', m);
            const id = `mf-confirm-${m}`;
            const order = { id, type: 'NEW_ORDER', pickup: '경기 광주시 경안동', dropoff: '경기 이천시 신둔면', fare: 45000, timestamp: new Date().toISOString() };
            await call(ordersRouter, '/confirm', 'post', { body: { step: 'BASIC', deviceId: 'dev-mf-confirm', order, capturedAt: new Date().toISOString(), matchType: 'AUTO' } });
            got[m] = (getUserSession(U).pendingOrdersData.get(id) as any)?.isSimulated;
        }
        expect(got).toEqual({ AUTO: false, ALARM: false, MANUAL: false, SIMULATION: true });
    });
});

describe('🔔 관제웹 «필터 통과» 삑 — 도는 모드', () => {
    it('알람으로 돌 때만', () => {
        register('dev-mf-beep', 'MANUAL');
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            const sent: any[] = [];
            const io = { to: () => ({ emit: (ev: string, p: any) => { if (ev === 'filter-pass-alarm') sent.push(p); } }) };
            touchDeviceSession('dev-mf-beep', U, 0, 'LIST', io, false, undefined, undefined, undefined, true,
                { seen: 3, passed: 1, passedNew: 1 } as any, 'insung', { effectiveMode: m });
            got[m] = sent.length;
        }
        expect(got).toEqual({ AUTO: 0, ALARM: 1, MANUAL: 0, SIMULATION: 0 });
        expect(getActiveDevicesSnapshot().some(d => d.deviceId === 'dev-mf-beep')).toBe(true);
    });
});

describe('🏷️ 이름 · 자동 폰 셈 — 네 모드', () => {
    it('단추 이름', () => {
        expect(DEVICE_MODE_LABEL).toEqual({ AUTO: '자동', ALARM: '알람', MANUAL: '직접', SIMULATION: '자동(계약 안 함)' });   // 32 P1 — 체험은 자동의 «계약 안 함»
    });
    it('«지금 확정을 누를 수 있는 다른 폰» — 명령이나 받은 모드가 자동인 폰만 센다', () => {
        const now = 1_000_000;
        const got: Record<string, unknown> = {};
        for (const m of DEVICE_MODES) {
            const other = { deviceId: 'O', mode: m, lastSeen: now, targetApp: 'insung' };
            got[m] = [otherContractingAuto('ME', [other], now, 150_000), otherContractingAuto('ME', [{ ...other, mode: 'MANUAL', appliedMode: m }], now, 150_000)];
        }
        expect(got).toEqual({ AUTO: [true, true], ALARM: [false, false], MANUAL: [false, false], SIMULATION: [false, false] });
    });
});

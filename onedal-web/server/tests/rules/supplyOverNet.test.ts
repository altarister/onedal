// @ts-nocheck
import { createHash } from 'crypto';
import { DEVICE_TOKEN_HEADER } from '@onedal/shared';
import * as fileLogger from '../../src/utils/fileLogger';
import devicesRouter from '../../src/routes/devices';
import { phoneSupplyOf } from '../../src/state/phoneSupply';
import { decide } from '../../src/state/decisions';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { activeDevices } from '../../src/state/deviceRegistry';
import { sentFilterVersionOf } from '../../src/core/phoneCheck';
import db from '../../src/db';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🌐 **인터넷 길 — 블루투스가 끊겨도 원달앱이 같은 값을 받는다** (A1 S1 · 기사님 «블루투스가 기본 길 · 끊기면 인터넷이 받침»).
 * 두 문: `GET /api/devices/:deviceId/supply`(이 폰 몫 필터 · 모드 · 심사 중 · 결재 · 빨리 접기) · `POST /api/devices/:deviceId/decision-ack`.
 * 값은 공급 소켓과 같은 원천(`phoneSupplyOf` · 결재 큐) — 길만 둘이다. 짝 서명(pairSig)은 블루투스 증명용이라 싣지 않는다.
 */
const U = 'test-supply-net';
const D1 = 'dev-net-1', D2 = 'dev-net-2';

const handlerOf = (method: string, path: string) => {
    const layer: any = (devicesRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
};
const call = (method: string, path: string, deviceId: string, body: any = {}, token?: string) => {
    let out: any = null;
    const res: any = {
        json: (v: any) => { out = { code: 200, v }; },
        status: (code: number) => ({ json: (v: any) => { out = { code, v }; } }),
    };
    const req: any = { params: { deviceId }, body, headers: token ? { [DEVICE_TOKEN_HEADER.toLowerCase()]: token } : {}, app: { get: () => null } };
    handlerOf(method, path)(req, res);
    return out;
};

beforeEach(() => {
    clearUserSession(U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'AUTO')`).run(U, D1);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'ALARM')`).run(U, D2);
    db.prepare(`UPDATE user_devices SET token_hash = NULL WHERE device_id IN (?, ?)`).run(D1, D2);
    /* 📡 보고하는 폰 — 원달앱은 블루투스가 끊겨도 인터넷으로 보고하니 공급에 «살아 있는 폰»으로 실린다 */
    activeDevices.set(D1, { deviceId: D1, userId: U, lastSeen: Date.now(), status: 'ONLINE' } as any);
    activeDevices.set(D2, { deviceId: D2, userId: U, lastSeen: Date.now(), status: 'ONLINE' } as any);
});
afterAll(() => {
    activeDevices.delete(D1); activeDevices.delete(D2);
    db.prepare(`DELETE FROM user_devices WHERE device_id IN (?, ?)`).run(D1, D2);
    clearUserSession(U);
});

describe('🌐 인터넷 길 — 이 폰 몫 한 벌', () => {
    it('🔴 필터 · 판 · 모드 · 심사 중은 공급 소켓과 같은 원천에서 — 이 폰 몫만', () => {
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(D1, 'o1');
        const out = call('get', '/:deviceId/supply', D1);
        expect(out.code).toBe(200);
        const sock = phoneSupplyOf(U);
        expect(out.v.filterVersion).toBe(sock.filterVersion);
        expect(out.v.filter).toEqual(sock.filter);
        expect(out.v.phone).toEqual({ mode: sock.phones[D1].mode, evaluatingNow: true });
    });

    it('🔴 보고가 끊긴 폰은 모드를 모른다(null) — 지어내지 않는다 · 필터는 그대로 준다', () => {
        activeDevices.delete(D1);
        const out = call('get', '/:deviceId/supply', D1);
        expect(out.code).toBe(200);
        expect(out.v.phone).toBeNull();
        expect(out.v.filterVersion).toBe(phoneSupplyOf(U).filterVersion);
    });

    it('🔴 인터넷으로 준 필터 판도 «이 폰에 보낸 판»으로 기억한다 — 기기 목록 «필터 옛 판»이 같은 사실로', () => {
        const out = call('get', '/:deviceId/supply', D2);
        expect(sentFilterVersionOf(D2)?.version).toBe(out.v.filterVersion);
    });

    it('🔴 짝 서명 · 다른 폰 몫은 싣지 않는다', () => {
        const out = call('get', '/:deviceId/supply', D1);
        const json = JSON.stringify(out.v);
        expect(json).not.toContain('pairSig');
        expect(json).not.toContain(D2);
        expect(out.v.phones).toBeUndefined();
    });

    it('🔴 결재 큐의 이 폰 몫 결재가 실린다 — 다른 폰은 빈 목록', () => {
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(D1, 'o1');
        decide(null, s, U, 'o1', 'KEEP');
        const mine = call('get', '/:deviceId/supply', D1).v;
        expect(mine.decisions.map((d: any) => [d.deviceId, d.orderId, d.action])).toEqual([[D1, 'o1', 'KEEP']]);
        expect(call('get', '/:deviceId/supply', D2).v.decisions).toEqual([]);
    });

    it('🔴 두 폰이 같은 콜을 쥐어도 각자 제 몫 결재만 받는다', () => {
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(D1, 'o4'); s.deviceEvaluatingMap.set(D2, 'o4');
        decide(null, s, U, 'o4', 'CANCEL');
        expect(call('get', '/:deviceId/supply', D1).v.decisions.map((d: any) => d.deviceId)).toEqual([D1]);
        expect(call('get', '/:deviceId/supply', D2).v.decisions.map((d: any) => d.deviceId)).toEqual([D2]);
    });

    it('🔴 결재가 아직 없으면 빈 목록 · 심사 중이 아니면 빈 목록', () => {
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(D1, 'o2');
        expect(call('get', '/:deviceId/supply', D1).v.decisions).toEqual([]);
        expect(call('get', '/:deviceId/supply', D2).v.decisions).toEqual([]);
        expect(call('get', '/:deviceId/supply', D2).v.folds).toEqual([]);
    });

    it('🔴 연결 안 된 폰 · 틀린 토큰은 거절', () => {
        expect(call('get', '/:deviceId/supply', 'dev-net-unknown').code).toBe(401);
        db.prepare(`UPDATE user_devices SET token_hash = ? WHERE device_id = ?`).run(createHash('sha256').update('right').digest('hex'), D1);
        expect(call('get', '/:deviceId/supply', D1, {}, 'wrong').code).toBe(401);
        expect(call('get', '/:deviceId/supply', D1, {}, 'right').code).toBe(200);
        expect(call('post', '/:deviceId/decision-ack', D1, { orderId: 'o1' }, 'wrong').code).toBe(401);
    });
});

describe('🌐 인터넷 길 — «받았음»', () => {
    it('🔴 받았음이면 결재 큐를 지우고 폰 잡기를 다시 연다 — 두 번 와도 큐는 한 번', () => {
        const s = getUserSession(U);
        s.deviceEvaluatingMap.set(D1, 'o3');
        decide(null, s, U, 'o3', 'KEEP');
        const spy = jest.spyOn(fileLogger, 'slog');
        const first = call('post', '/:deviceId/decision-ack', D1, { orderId: 'o3' });
        expect(first.code).toBe(200); expect(first.v.done).toBe(true);
        expect(s.pendingDecisions.has('o3')).toBe(false);
        expect(s.deviceEvaluatingMap.has(D1)).toBe(false);
        expect(spy.mock.calls.some(c => String(c[1]).includes('받았음 · 인터넷'))).toBe(true);
        const second = call('post', '/:deviceId/decision-ack', D1, { orderId: 'o3' });
        expect(second.code).toBe(200); expect(second.v.done).toBe(false);
        spy.mockRestore();
    });

    it('🔴 콜 번호가 없으면 400', () => {
        expect(call('post', '/:deviceId/decision-ack', D1, {}).code).toBe(400);
    });
});

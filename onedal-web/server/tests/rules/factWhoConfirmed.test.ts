// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import emergencyRouter from '../../src/routes/emergency';
import * as devices from '../../src/state/deviceRegistry';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';
import { whoConfirmed } from '@onedal/shared';

/**
 * ✋ **사실 ③ «확정을 누가 눌렀나» — 서버의 지금 답** (31 P0 · S1~S3).
 *    `/detail` 의 matchType 이 MANUAL(기사님 손 확정)이면 서버가 바로 KEEP 하고 30초 기다림을 걸지 않는다.
 *    AUTO(원달앱 확정)면 결재를 기다리며 경고 · 해제 기다림을 걸고, 결재 없이 해제 시한이 지나도 서버는 세지 않고 원달앱 보고를 기다린다(38 F36).
 *    실제 라우트를 부른다 — 소스 글자는 안 읽는다. 판정은 카카오 키를 지워 곧바로 끝나게 한다(deviceRelease 와 같은 방법).
 * 못 잡는 것: 원달앱이 matchType 을 무엇으로 보내나(원달앱 `SessionManager.clickOrigin` · ClickOriginTest) · 관제웹 경고 화면.
 */
const U = 'test-fact-who-confirmed';
const DEV = 'dev-fact-who';
const emitted: string[] = [];
const io = { to: () => ({ emit: (ev: string) => { emitted.push(ev); } }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const detail = async (id: string, matchType: 'AUTO' | 'MANUAL', isPreview = false) => {
    let out: any = null, code = 200;
    const res: any = { status: (c: number) => { code = c; return res; }, json: (b: any) => { out = b; return res; } };
    await handlerOf(detailRouter)({ app, body: {
        step: 'DETAILED', deviceId: DEV, targetApp: 'insung', matchType, isPreview,
        order: { id, pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 신둔면', fare: 38500, vehicleType: '다마스', rawText: '' },
    } }, res);
    return { code, out };
};
let savedKey: string | undefined;

beforeAll(() => {
    savedKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'AUTO')`).run(U, DEV);
});
beforeEach(() => { clearUserSession(U); emitted.length = 0; });
afterAll(() => {
    if (savedKey !== undefined) process.env.KAKAO_REST_API_KEY = savedKey;
    jest.useRealTimers();
    clearUserSession(U);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 다음 돌림이 이어 쓴다 */ }
});

describe('✋ 기사님이 손으로 확정한 콜 — 서버가 바로 KEEP', () => {
    it('🔴 결재 큐에 KEEP · 응답 ACK · 안전취소 경고 · 해제 기다림 없음', async () => {
        const r = await detail('who-hand', 'MANUAL');
        const s = getUserSession(U);
        expect(r.out).toEqual({ deviceId: 'server', action: 'ACK' });
        expect(s.pendingDecisions.get('who-hand')?.action).toBe('KEEP');
        expect(s.entries.has('warn_who-hand')).toBe(false);
        expect(s.entries.has('timeout_who-hand')).toBe(false);
    });
});

describe('🤖 원달앱이 확정한 콜 — 결재를 기다린다', () => {
    it('🔴 202 · 결재 큐는 비어 있고 · 경고 · 해제 기다림이 걸린다', async () => {
        const r = await detail('who-app', 'AUTO');
        const s = getUserSession(U);
        expect(r.code).toBe(202);
        expect(s.pendingDecisions.get('who-app')?.action ?? null).toBeNull();
        expect(s.entries.has('warn_who-app')).toBe(true);
        expect(s.entries.has('timeout_who-app')).toBe(true);
    });

    /* 📲 원달앱이 계약한 콜은 원달앱이 끝까지 책임진다(38 F36) — 서버 시계로 세지 않고 «눌렀음» 보고를 기다린다 · 끝내 없으면 경보만 */
    it('🔴 결재 없이 해제 시한이 지나도 서버는 세지 않고 결재석에 둔다 · 시한 + 60초에 «원달앱 보고 없음» 경보만(셈 0)', async () => {
        const spy = jest.spyOn(devices, 'incrementDeviceStats').mockImplementation(() => {});
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        try {
            await detail('who-timeout', 'AUTO');
            const s = getUserSession(U);
            emitted.length = 0;
            jest.advanceTimersByTime(60_000);
            expect(s.pendingDecisions.has('who-timeout')).toBe(true);
            expect(emitted).not.toContain('emergency-alert');
            jest.advanceTimersByTime(60_000);
            expect(emitted).toContain('emergency-alert');
            expect(s.pendingDecisions.has('who-timeout')).toBe(true);
            expect(spy.mock.calls.filter(c => c[0] === DEV && c[1] === 'canceled')).toHaveLength(0);
        } finally {
            jest.useRealTimers();
            spy.mockRestore();
        }
    });

    /* 📮 원달앱 보고가 오면(눌렀음이든 못 눌렀음이든) 보고 기다림은 끝난다 — 보고가 왔는데 «보고 없음»을 또 띄우지 않는다(38 F36 · 24 리뷰) */
    it('🔴 «못 눌렀음» 보고가 온 뒤에는 시한 + 60초에도 «원달앱 보고 없음» 경보가 안 간다', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        try {
            await detail('who-reported', 'AUTO');
            jest.advanceTimersByTime(31_000);
            const res: any = { status() { return res; }, json() { return res; } };
            await handlerOf(emergencyRouter)({ app, headers: {}, body: { deviceId: DEV, orderId: 'who-reported', reason: 'BUTTON_NOT_FOUND', cancelPressed: false, screenContext: 'LIST', screenText: '', timestamp: new Date().toISOString(), targetApp: 'insung' } }, res);
            expect(emitted.filter(e => e === 'emergency-alert')).toHaveLength(1);   // «⚠️ 취소 못 누름» 하나
            jest.advanceTimersByTime(90_000);
            expect(emitted.filter(e => e === 'emergency-alert')).toHaveLength(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('대조 — KEEP 이 내려진 콜은 해제 시한이 지나도 취소하지 않는다', async () => {
        const spy = jest.spyOn(devices, 'incrementDeviceStats').mockImplementation(() => {});
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        try {
            await detail('who-kept', 'AUTO');
            getUserSession(U).pendingDecisions.get('who-kept').action = 'KEEP';
            jest.advanceTimersByTime(60_000);
            expect(spy.mock.calls.filter(c => c[1] === 'canceled')).toHaveLength(0);
        } finally {
            jest.useRealTimers();
            spy.mockRestore();
        }
    });
});

describe('✋ 확정 누른 주체 — 사실 하나(29 P2 · shared whoConfirmed)', () => {
    it('🔴 미리보기는 안 눌림 · MANUAL 은 기사님 · 그 밖은 원달앱', () => {
        expect(whoConfirmed({ isPreview: true, matchType: 'AUTO' })).toBe('NONE');
        expect(whoConfirmed({ isPreview: true, matchType: 'MANUAL' })).toBe('NONE');
        expect(whoConfirmed({ isPreview: false, matchType: 'MANUAL' })).toBe('DRIVER');
        expect(whoConfirmed({ matchType: 'AUTO' })).toBe('APP');
        expect(whoConfirmed({})).toBe('APP');
        expect(whoConfirmed({ matchType: 'AUTO', type: 'MANUAL_CLICK' })).toBe('DRIVER');   // 갈래만 MANUAL 인 옛 보고도 기사님(ef 리뷰 ③)
        expect(whoConfirmed({ isPreview: true, type: 'MANUAL_CLICK' })).toBe('NONE');
    });

    it('🔴 계약 안 함 폰에서 기사님이 손으로 확정한 콜도 서버가 바로 KEEP · 30초 기다림 없음(27 15 · 16 «가»)', async () => {
        db.prepare(`UPDATE user_devices SET no_contract = 1 WHERE device_id = ?`).run(DEV);
        try {
            const r = await detail('who-hand-nc', 'MANUAL');
            const s = getUserSession(U);
            expect(r.out).toEqual({ deviceId: 'server', action: 'ACK' });
            expect(s.pendingDecisions.get('who-hand-nc')?.action).toBe('KEEP');
            expect(s.entries.has('timeout_who-hand-nc')).toBe(false);
            expect((s.pendingOrdersData.get('who-hand-nc') as any)?.isSimulated).toBe(false);
        } finally {
            db.prepare(`UPDATE user_devices SET no_contract = 0 WHERE device_id = ?`).run(DEV);
        }
    });
});

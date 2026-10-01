// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import scrapRouter from '../../src/routes/scrap';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { armWait } from '../../src/state/waits';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📱 **폰의 «심사 중» 표시는 풀려야 한다 · /confirm 이 빠져도 KEEP 이 폰에 실린다** (서버 병목 4·5 · onedal-1f «가»).
 *
 * 폰은 서버가 «이 기기는 심사 중»(deviceEvaluatingMap)이라 하면 다음 콜을 누르지 않는다.
 * ④ KEEP 뒤 폰 확인(ACK)이 안 오거나 늦게 오면 그 표시가 남아 자동 잡기가 멈췄다.
 * ⑤ /confirm 이 빠지고 /detail 만 오면 표시가 안 생겨 KEEP 이 폰에 안 실렸다.
 */
const U = 'test-device-release';
const DEV = 'dev-release-1';
const emitted: string[] = [];
const payloads: Array<{ ev: string; body: any }> = [];
const io = { to: () => ({ emit: (ev: string, body?: any) => { emitted.push(ev); payloads.push({ ev, body }); } }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (router: any, body: any) => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await handlerOf(router)({ body, app }, res);
    return out;
};
const detail = (id: string) => call(detailRouter, {
    step: 'DETAILED', deviceId: DEV, targetApp: 'insung',
    order: { id, pickup: '경기 이천시 부발읍', dropoff: '경기 여주시 가남읍', fare: 30000, vehicleType: '다마스', rawText: '' },
});
let savedKey: string | undefined;

beforeAll(() => {
    savedKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;      // 판정이 카카오를 부르지 않게 — 키 없음 갈래로 곧바로 끝난다
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'release@test', '기기풀기검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    if (savedKey !== undefined) process.env.KAKAO_REST_API_KEY = savedKey;
    jest.useRealTimers();
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📱 ④ KEEP 뒤 폰 확인이 안 와도 심사 중 표시가 풀린다', () => {
    it('🔴 KEEP 이 내려진 뒤 ACK 없이 시한이 지나면 그 기기의 심사 중 표시가 없다', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        const session = getUserSession(U);
        session.deviceEvaluatingMap.set(DEV, 'rel-a');          // /confirm 이 채운 것처럼
        await detail('rel-a');
        session.pendingDecisions.get('rel-a').action = 'KEEP';
        jest.advanceTimersByTime(60_000);
        expect(session.deviceEvaluatingMap.has(DEV)).toBe(false);
        jest.useRealTimers();
    });

    it('🔴 큐에서 이미 지워진 뒤 온 늦은 ACK 도 기기 표시를 푼다', async () => {
        const session = getUserSession(U);
        session.deviceEvaluatingMap.set(DEV, 'rel-b');
        session.pendingDecisions.delete('rel-b');
        await call(scrapRouter, { data: [], deviceId: DEV, ackDecisionId: 'rel-b' });
        expect(session.deviceEvaluatingMap.has(DEV)).toBe(false);
    });
});

describe('📱 ⑤ /confirm 없이 /detail 만 와도', () => {
    it('🔴 비어 있던 기기 칸이 그 콜로 채워지고, KEEP 이 폰 응답에 실린다', async () => {
        const session = getUserSession(U);
        session.deviceEvaluatingMap.delete(DEV);
        await detail('rel-c');
        expect(session.deviceEvaluatingMap.get(DEV)).toBe('rel-c');
        session.pendingDecisions.get('rel-c').action = 'KEEP';
        const r = await call(scrapRouter, { data: [], deviceId: DEV });
        expect(r?.decision).toMatchObject({ orderId: 'rel-c', action: 'KEEP' });
    });

    it('다른 콜로 차 있으면 건드리지 않는다 — 앞 콜 정리는 /confirm 몫', async () => {
        const session = getUserSession(U);
        session.deviceEvaluatingMap.set(DEV, 'rel-other');
        await detail('rel-d');
        expect(session.deviceEvaluatingMap.get(DEV)).toBe('rel-other');
    });
});

describe('🔁 ⑰ /detail 재시도 — 같은 판정을 기다린다', () => {
    it('🔴 같은 /detail 이 두 번 오면 판정은 한 번 · 두 번째도 202', async () => {
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder');
        getUserSession(U).deviceEvaluatingMap.set(DEV, 'rel-e');
        const first = await detail('rel-e');
        const second = await detail('rel-e');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
        spy.mockRestore();
    });

    it('🔴 같은 콜의 타이머를 다시 넣으면 앞 핸들을 끈다 — 안전취소 경고는 한 번', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        const session = getUserSession(U);
        session.deviceEvaluatingMap.set(DEV, 'rel-f');
        await detail('rel-f');
        session.pendingOrdersData.get('rel-f').isPreview = true;     // 재시도 조건을 비켜 다시 타이머를 넣는 다른 길
        await detail('rel-f');
        emitted.length = 0;
        jest.advanceTimersByTime(31_000);
        expect(emitted.filter(e => e === 'safecancel-warning').length).toBe(1);
        jest.useRealTimers();
    });
});

describe('⚠️ 안전취소 경고 문구의 초는 그 배차망의 DB 값이다', () => {
    const U2 = 'test-safecancel-sec';
    const DEV2 = 'dev-safecancel-sec';
    beforeAll(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U2, `g-${U2}`, 'safecancel@test', '안전취소초검사');
        approvedUser(U2);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U2, DEV2);
        db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U2);
        db.prepare(`UPDATE user_settings SET safe_cancel_sec_insung = 45 WHERE user_id = ?`).run(U2);
    });
    afterAll(() => {
        db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U2);
        db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U2);
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U2);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(U2);
        clearUserSession(U2);
    });

    it('🔴 인성 안전취소를 45초로 두면 경고는 45초에 오고 문구도 «45초»다', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        getUserSession(U2).deviceEvaluatingMap.set(DEV2, 'sc-a');
        await call(detailRouter, {
            step: 'DETAILED', deviceId: DEV2, targetApp: 'insung',
            order: { id: 'sc-a', pickup: '경기 이천시 부발읍', dropoff: '경기 여주시 가남읍', fare: 30000, vehicleType: '다마스', rawText: '' },
        });
        payloads.length = 0;
        jest.advanceTimersByTime(46_000);
        const warn = payloads.find(p => p.ev === 'safecancel-warning');
        expect(warn?.body?.message).toContain('45초');
        expect(warn?.body?.message).not.toContain('30초');
        expect(warn?.body?.message).not.toContain('⚠️');   // 그림은 관제웹 경고 줄이 붙인다 — 두 번 찍히지 않게

        jest.useRealTimers();
    });
});

describe('⏲️ 세션을 지우면 그 세션의 콜 타이머도 꺼진다', () => {
    it('🔴 clearUserSession 뒤 그 세션이 건 타이머가 울리지 않는다 — 새 세션에 옛 콜 취소가 걸리지 않게', () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        const fired = jest.fn();
        const s = getUserSession('test-timer-clear');
        armWait(s, 'timeout_x', { label: '시험', armedBy: '검사', ms: 1000, orderId: 'x', tag: '결재' }, fired);
        clearUserSession('test-timer-clear');
        jest.advanceTimersByTime(2000);
        expect(fired).not.toHaveBeenCalled();
        jest.useRealTimers();
    });
});

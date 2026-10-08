// @ts-nocheck
import * as devices from '../../src/state/deviceRegistry';
import ordersRouter from '../../src/routes/orders';
import { appFilterOf } from '../../src/state/appFilter';
import { forceCancelEvaluatingOrder, handleDecision } from '../../src/services/dispatchEngine';
import { countCancel } from '../../src/core/cancelCount';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import db from '../../src/db';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🧪 **운행 규칙을 동작으로 문다**.
 * 규칙마다 «그 일이 일어나면 안 되는 경우»와 «일어나야 하는 경우(대조)»를 함께 둔다 — 대조가 없으면 늘 참인 검사가 된다.
 * 못 잡는 것: 실제 폰 · 블루투스 구간 · 여러 요청이 겹치는 순서.
 */
const U = 'test-core-rules';
const DEV = 'dev-core-rules-1';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ adapter: { rooms: new Map() }, to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const post = async (router: any, path: string, body: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    let status = 200, out: any = null;
    const res = { status: (c: number) => { status = c; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, body }, res);
    return { status, out };
};

beforeAll(() => {
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE device_id = ?`).run(DEV);
    clearUserSession(U);
});

/** 잡기를 시킬 수 있는 세션 — 관제웹이 붙어 하루가 시작됐고 · 목적지 · 차종이 있다 */
function readySession() {
    clearUserSession(U);
    const s = getUserSession(U);
    s.isRestored = true;
    s.isBootstrapping = false;
    s.activeFilter = { ...s.activeFilter, isActive: true, isSharedMode: false, destinationCity: '경기 이천시', destinationKeywords: ['이천시'], pickupKeywords: undefined, allowedVehicleTypes: ['1t'] };
    return s;
}

describe('🔒 잡기를 멈추는 셋 — 판정 함수가 아니라 폰에 가는 필터(isActive)를 본다 (R3 · R4 · R5)', () => {
    it('대조 — 다 갖추면 잡기를 시킨다', () => {
        expect(appFilterOf(readySession(), U, DEV, null).filter.isActive).toBe(true);
    });
    it('🔴 R3 목적지가 없으면 잡기 보류', () => {
        const s = readySession();
        s.activeFilter = { ...s.activeFilter, destinationCity: '', destinationKeywords: [] };
        expect(appFilterOf(s, U, DEV, null).filter.isActive).toBe(false);
    });
    it('🔴 R4 적재 만석(실을 수 있는 차종 없음)이면 잡기 보류', () => {
        const s = readySession();
        s.activeFilter = { ...s.activeFilter, allowedVehicleTypes: [] };
        expect(appFilterOf(s, U, DEV, null).filter.isActive).toBe(false);
    });
    it('🔴 R5 관제웹이 한 번도 안 붙었으면 잡기 대기', () => {
        const s = readySession();
        s.isRestored = false;
        expect(appFilterOf(s, U, DEV, null).filter.isActive).toBe(false);
    });
});

describe('📅 R14 빈 내일 상차 목록은 싣지 않는다 — 원달앱이 빈 목록을 다르게 읽는 날에도 안전하게', () => {
    it('🔴 빈 목록 → 칸 없음', () => {
        const { filter } = appFilterOf(readySession(), U, DEV, { keywords: [], groups: {} });
        expect(filter).not.toHaveProperty('reservedPickupKeywords');
    });
    it('대조 — 동이 있으면 싣는다', () => {
        const { filter } = appFilterOf(readySession(), U, DEV, { keywords: ['신둔면'], groups: { 이천시: ['신둔면'] } });
        expect(filter.reservedPickupKeywords).toEqual(['신둔면']);
    });
});

describe('🛡️ R1 잡은 콜(KEEP)은 서버 강제 정리가 건드리지 않는다 (README 규칙 ①)', () => {
    it('🔴 확정된 콜에 강제 정리를 불러도 그대로', () => {
        const s = readySession();
        s.pendingOrdersData.set('o-keep', { id: 'o-keep', status: 'ORDER_CONFIRMED', capturedDeviceId: DEV, fare: 30000 });
        s.deviceEvaluatingMap.set(DEV, 'o-keep');
        forceCancelEvaluatingOrder(U, 'o-keep', io);
        expect(s.pendingOrdersData.get('o-keep')?.status).toBe('ORDER_CONFIRMED');
    });
    it('대조 — 심사 중인 콜은 정리된다', () => {
        const s = readySession();
        s.pendingOrdersData.set('o-eval', { id: 'o-eval', status: 'ORDER_PRE_SECURED', capturedDeviceId: DEV, fare: 30000 });
        s.deviceEvaluatingMap.set(DEV, 'o-eval');
        forceCancelEvaluatingOrder(U, 'o-eval', io);
        expect(s.pendingOrdersData.get('o-eval')?.status).not.toBe('ORDER_PRE_SECURED');
    });
});

describe('🚪 R11 끝난 콜에는 KEEP 을 싣지 않는다 — 앱은 이미 취소했는데 서버만 «잡음»이 되지 않게', () => {
    it('🔴 안전취소로 끝난 콜에 확정 결재 → 결재 큐에 KEEP 없음', async () => {
        const s = readySession();
        s.pendingOrdersData.set('o-dead', { id: 'o-dead', status: 'SAFE_CANCEL', capturedDeviceId: DEV, fare: 30000 });
        s.pendingDecisions.set('o-dead', { action: null, evaluatedAt: Date.now() });
        const r = await handleDecision(U, 'o-dead', 'ORDER_CONFIRMED', io);
        expect(r?.success).toBe(false);
        expect(s.pendingDecisions.get('o-dead')?.action).toBeNull();
    });
    it('대조 — 심사 중인 콜에 확정 결재 → KEEP', async () => {
        const s = readySession();
        s.pendingOrdersData.set('o-live', { id: 'o-live', status: 'ORDER_PRE_SECURED', capturedDeviceId: DEV, fare: 30000 });
        s.pendingDecisions.set('o-live', { action: null, evaluatedAt: Date.now() });
        await handleDecision(U, 'o-live', 'ORDER_CONFIRMED', io);
        expect(s.pendingDecisions.get('o-live')?.action).toBe('KEEP');
    });
});

describe('👀 R12 미리보기에는 안전취소 기다림을 걸지 않는다 — 안 잡은 콜은 무를 것이 없다', () => {
    const confirm = (id: string, isPreview: boolean) => post(ordersRouter, '/confirm', {
        step: 'BASIC', deviceId: DEV, targetApp: 'insung', isPreview,
        order: { id, pickup: '이천시 신둔면', dropoff: '서울 강남구', fare: 30000, rawText: '' },
    });
    it('🔴 미리보기 선점 → 장부에 안전취소 없음', async () => {
        readySession();
        const r = await confirm('o-preview', true);
        expect(r.status).toBe(200);
        expect(getUserSession(U).entries.has('presecured_o-preview')).toBe(false);
    });
    it('대조 — 보통 선점 → 장부에 안전취소', async () => {
        readySession();
        const r = await confirm('o-normal', false);
        expect(r.status).toBe(200);
        expect(getUserSession(U).entries.has('presecured_o-normal')).toBe(true);
    });
    /* ✋ 사실 ③ 지금 답(29 N4 «지금» 칸 — 손 확정 콜에도 30초 타이머) · 31 P0 S4. P2 에서 이 기댓값이 바뀐다 */
    it('지금 답 — 손으로 확정한 선점(matchType MANUAL)에도 장부에 안전취소', async () => {
        readySession();
        const r = await post(ordersRouter, '/confirm', {
            step: 'BASIC', deviceId: DEV, targetApp: 'insung', matchType: 'MANUAL',
            order: { id: 'o-hand', pickup: '이천시 신둔면', dropoff: '서울 강남구', fare: 30000, rawText: '' },
        });
        expect(r.status).toBe(200);
        expect(getUserSession(U).entries.has('presecured_o-hand')).toBe(true);
    });
});

describe('📈 R13 미리보기 · 체험 콜 취소는 취소 횟수에 안 든다 — 배차망에서 취소한 일이 없다', () => {
    let spy: jest.SpyInstance;
    beforeEach(() => { spy = jest.spyOn(devices, 'incrementDeviceStats').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());
    const session = (order: any) => ({ userId: U, pendingOrdersData: new Map([[order.id, order]]), myOrders: [], countedOnce: new Set<string>() });

    it('🔴 미리보기 콜 → 안 셈', () => {
        countCancel(session({ id: 'c-prev', isPreview: true }), DEV, 'c-prev', 'DECISION_CANCEL');
        expect(spy).not.toHaveBeenCalled();
    });
    it('🔴 체험 콜 → 안 셈', () => {
        countCancel(session({ id: 'c-sim', isSimulated: true }), DEV, 'c-sim', 'DECISION_CANCEL');
        expect(spy).not.toHaveBeenCalled();
    });
    it('대조 — 보통 콜 → 한 번 셈', () => {
        countCancel(session({ id: 'c-real' }), DEV, 'c-real', 'DECISION_CANCEL');
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

// @ts-nocheck
import db from '../../src/db';
import { handleDecision, recalculateActiveKakaoRoute, recalculateKakaoRoute } from '../../src/services/dispatchEngine';
import { restoreAndRecalculateSession, bootstrapUserSession } from '../../src/state/sessionRestore';
import { reportMilestone, undoMilestone, setCallTarget } from '../../src/services/milestones';
import * as filterManager from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import * as cancelCount from '../../src/core/cancelCount';
import * as kakao from '../../src/services/kakaoService';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { armWait } from '../../src/state/waits';
import { bridgeMilestone, birthFirstStep } from '../../src/services/stepSeeder';
import { initGeoService } from '../../src/services/geoService';

/**
 * ⚖️ **결재 · 복구 · 마일스톤 · 복귀 켬을 동작으로 문다** — handleDecision · restoreAndRecalculateSession · bootstrapUserSession ·
 * reportMilestone · undoMilestone · setCallTarget 을 세션 · 장부(검사용 DB)와 함께 불러 결과를 본다.
 * 잡은 콜을 지키는 자리라 규칙마다 «안 일어나야 함 + 일어나야 함»을 나란히 둔다. 카카오는 가짜(필요할 때만).
 */
const U = 'test-engine-flow';
const DEV = 'dev-engine-flow';
let emitted: Array<[string, any]> = [];
const io = { to: () => ({ emit: (ev: string, p: any) => { emitted.push([ev, p]); } }) } as any;
const LINE = [{ x: 127.31, y: 37.36 }, { x: 127.44, y: 37.28 }];
const soloRoute = { distance: 18000, duration: 1800, polyline: LINE, approachDistance: 2500, approachDuration: 420, tollKrw: 0, roadEvent: null };

beforeAll(() => {
    initGeoService();
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@t`, '흐름검사');
    db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U);
});
beforeEach(() => {
    emitted = [];
    delete process.env.KAKAO_REST_API_KEY;
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM gps_tracks WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM call_target_events WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM order_judgments WHERE userId = ?`).run(U);
    db.prepare(`UPDATE user_settings SET home_address = NULL, home_x = NULL, home_y = NULL WHERE user_id = ?`).run(U);
    clearUserSession(U);
});
afterEach(() => jest.restoreAllMocks());

/** 심사를 마치고 결재를 기다리는 콜 하나 — 결재 큐에도 올라 있다 */
function seed(id: string, o: Record<string, unknown> = {}) {
    const s = getUserSession(U);
    s.activeFilter.destinationCity = '이천시';
    s.pendingOrdersData.set(id, { id, status: 'ORDER_AWAITING_DECISION', capturedDeviceId: DEV, isSimulated: false,
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 중리동', fare: 30000, vehicleType: '1t', timestamp: new Date().toISOString(),
        capturedAt: new Date().toISOString(), pickupX: 127.31, pickupY: 37.36, dropoffX: 127.44, dropoffY: 37.28, routePolyline: LINE, ...o } as any);
    s.pendingDecisions.set(id, { action: null, evaluatedAt: Date.now() });
    return s;
}
const ledgerRow = (id: string) => db.prepare(`SELECT id, status, isShared FROM orders WHERE id = ?`).get(id) as any;
const sent = (ev: string) => emitted.filter(e => e[0] === ev);

describe('✅ 결재 KEEP', () => {
    it('🔴 진짜 콜 — 수락 한 번 · 캐시를 확정본으로 덮음 · 목표값 · 필터 라인 얼림 · 되돌림 보관본 버림 · 모으는 중으로 · 감시 타이머 끔 · 장부(단독)', async () => {
        const keep = jest.spyOn(cancelCount, 'countKeep');
        const s = seed(`${U}-k1`);
        s.routeSnapshot = { orderId: 'old' } as any;
        armWait(s, `timeout_${U}-k1`, { label: '결재 시한', armedBy: '검사', orderId: `${U}-k1`, ms: 60_000 }, () => {});
        await handleDecision(U, `${U}-k1`, 'ORDER_CONFIRMED', io);
        expect(keep).toHaveBeenCalledTimes(1);
        expect(s.pendingOrdersData.get(`${U}-k1`).status).toBe('ORDER_CONFIRMED');
        expect(s.myOrders.map(c => c.id)).toEqual([`${U}-k1`]);
        expect(s.myOrders[0].goalCity).toBe('이천시');
        expect(s.filterLine).toEqual(LINE);
        expect(s.routeSnapshot).toBeNull();
        expect(s.activeFilter.dispatchPhase).toBe('GATHERING');
        expect([...s.entries.values()].filter(w => w.orderId === `${U}-k1`)).toEqual([]);
        expect(ledgerRow(`${U}-k1`)).toMatchObject({ status: 'ORDER_CONFIRMED', isShared: 0 });
        expect(sent('order-confirmed').map(e => e[1])).toEqual([`${U}-k1`]);
    });

    it('🔴 연습 콜 — 수락을 안 세고 장부에 안 적는다 · 운행에 안 올라가고 연습 끝(SAFE_CANCEL)', async () => {
        const keep = jest.spyOn(cancelCount, 'countKeep');
        const s = seed(`${U}-sim`, { isSimulated: true });
        await handleDecision(U, `${U}-sim`, 'ORDER_CONFIRMED', io);
        expect(keep).not.toHaveBeenCalled();
        expect(ledgerRow(`${U}-sim`)).toBeUndefined();
        expect(s.myOrders).toEqual([]);
        expect(s.pendingOrdersData.get(`${U}-sim`)).toMatchObject({ status: 'SAFE_CANCEL', isSimulated: true });
    });

    it('🔴 둘째 콜은 합짐으로 장부에 적는다', async () => {
        seed(`${U}-a`);
        await handleDecision(U, `${U}-a`, 'ORDER_CONFIRMED', io);
        seed(`${U}-b`);
        await handleDecision(U, `${U}-b`, 'ORDER_CONFIRMED', io);
        expect(ledgerRow(`${U}-a`).isShared).toBe(0);
        expect(ledgerRow(`${U}-b`).isShared).toBe(1);
    });
});

describe('🗑️ 결재 취소', () => {
    it('🔴 진짜 콜 — 상태를 바꾸고 · 취소를 세고 · 장부에 적고 · 관제웹에 알리고 · 빈 차로 되돌린다', async () => {
        const cancel = jest.spyOn(cancelCount, 'countCancel');
        const s = seed(`${U}-c1`);
        await handleDecision(U, `${U}-c1`, 'ORDER_CONFIRMED', io);
        await handleDecision(U, `${U}-c1`, 'SAFE_CANCEL', io);
        expect(s.myOrders.find(c => c.id === `${U}-c1`).status).toBe('SAFE_CANCEL');
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(ledgerRow(`${U}-c1`).status).toBe('SAFE_CANCEL');
        expect(sent('order-canceled').map(e => e[1])).toEqual([{ id: `${U}-c1`, status: 'SAFE_CANCEL', isManual: true }]);
        expect(s.activeFilter.dispatchPhase).toBe('STANDBY');
    });

    it('🔴 체험 콜 — 취소를 안 세고 장부에 안 적는다', async () => {
        const cancel = jest.spyOn(cancelCount, 'countCancel');
        seed(`${U}-cs`, { isSimulated: true });
        await handleDecision(U, `${U}-cs`, 'SAFE_CANCEL', io);
        expect(cancel).not.toHaveBeenCalled();
        expect(ledgerRow(`${U}-cs`)).toBeUndefined();
    });

    it('🔴 남은 콜이 있으면 정거장이 바뀐 만큼 경로를 다시 잰다', async () => {
        seed(`${U}-r1`); await handleDecision(U, `${U}-r1`, 'ORDER_CONFIRMED', io);
        seed(`${U}-r2`); await handleDecision(U, `${U}-r2`, 'ORDER_CONFIRMED', io);
        process.env.KAKAO_REST_API_KEY = 'test-key';
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        await handleDecision(U, `${U}-r2`, 'SAFE_CANCEL', io);
        expect(solo).toHaveBeenCalledTimes(1);
    });
});

/** 장부에 진행 중 콜 한 줄 — 되살리기가 읽는 꼴(places · orderStops) */
function ledgerCall(id: string, extra: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, routePolyline, paymentType, ackedAt)
                VALUES (?, 'NEW_ORDER', ?, ?, ?, ?, '상', '하', 20000, 'insung', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
        .run(id, extra.status ?? 'ORDER_CONFIRMED', U, now, now, extra.routePolyline === null ? null : JSON.stringify(LINE), extra.paymentType ?? null);
    const place = (x: number, y: number, tag: string) => {
        db.prepare(`INSERT OR IGNORE INTO places (address, x, y, addressDetail, customerName) VALUES (?, ?, ?, ?, ?)`).run(tag, x, y, tag, U);
        return (db.prepare(`SELECT id FROM places WHERE addressDetail = ? AND customerName = ?`).get(tag, U) as any).id;
    };
    db.prepare(`INSERT INTO orderStops (orderId, placeId, stopType) VALUES (?, ?, 'pickup')`).run(id, place(127.31, 37.36, `${id}-p`));
    db.prepare(`INSERT INTO orderStops (orderId, placeId, stopType) VALUES (?, ?, 'dropoff')`).run(id, place(127.44, 37.28, `${id}-d`));
}

describe('♻️ 복구', () => {
    it('🔴 한 번만 되살린다 — 두 번째는 아무 일 없음', async () => {
        ledgerCall(`${U}-rs`);
        await restoreAndRecalculateSession(U, io);
        await restoreAndRecalculateSession(U, io);
        expect(sent('sync-active-orders').length).toBe(1);
    });

    it('🔴 진행 중 콜이 있으면 모으는 중 · 합짐으로 세운다 · 다녀온 정거장(도착 시각)도 되살린다', async () => {
        ledgerCall(`${U}-rv`);
        birthFirstStep(U, `${U}-rv`);
        bridgeMilestone(U, `${U}-rv`, 'ARRIVED_PICKUP', 'MANUAL');
        await restoreAndRecalculateSession(U, io);
        const s = getUserSession(U);
        expect(s.activeFilter.dispatchPhase).toBe('GATHERING');
        expect(s.activeFilter.isSharedMode).toBe(true);
        expect(s.myOrders[0].arrivedPickupAt).toBeTruthy();
        expect(sent('session-restored').length).toBe(1);
    });

    it('🔴 부트스트랩이 오늘 궤적의 마지막 점으로 «내가 어디 있나»를 되살린다', async () => {
        const at = Date.now() - 60_000;
        db.prepare(`INSERT INTO gps_tracks (user_id, at_ms, x, y, source) VALUES (?, ?, ?, ?, ?)`).run(U, at, 127.33, 37.35, 'native');
        await bootstrapUserSession(U, io);
        const s = getUserSession(U);
        expect(s.lastFix).toEqual({ x: 127.33, y: 37.35 });
        expect(s.lastFixAt).toBe(at);
    });

    it('🔴 장부의 칸을 콜에 되살린다 — 판(목표 시) · 잡은 갈래 · 하차 시각 · 판정 · 궤적', async () => {
        ledgerCall(`${U}-rf`);
        db.prepare(`UPDATE orders SET goalCity = ?, capturedVia = ?, completedAt = ? WHERE id = ?`)
            .run('여주시', 'alarm', '2026-10-07T04:00:00.000Z', `${U}-rf`);
        OrderRepository.saveJudgment(`${U}-rf`, U, { color: '꿀', score: 82, axes: [], gates: [], tags: [] });
        await restoreAndRecalculateSession(U, io);
        const c = getUserSession(U).myOrders[0];
        expect(c).toMatchObject({ goalCity: '여주시', capturedVia: 'alarm', completedAt: '2026-10-07T04:00:00.000Z' });
        expect(c.judgment).toMatchObject({ color: '꿀', score: 82 });
        expect(c.routePolyline).toEqual(LINE);
    });

    it('🔴 장부에 궤적이 있으면 카카오를 다시 부르지 않는다 · 없으면 잰다 — 다녀온 상차지는 건너뛰고', async () => {
        process.env.KAKAO_REST_API_KEY = 'test-key';
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        ledgerCall(`${U}-rk`);
        await restoreAndRecalculateSession(U, io);
        expect(solo).not.toHaveBeenCalled();
        clearUserSession(U);
        db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
        db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
        ledgerCall(`${U}-rn`, { routePolyline: null });
        birthFirstStep(U, `${U}-rn`);
        bridgeMilestone(U, `${U}-rn`, 'ARRIVED_PICKUP', 'MANUAL');
        await restoreAndRecalculateSession(U, io);
        expect(solo).toHaveBeenCalledTimes(1);
        expect(solo.mock.calls[0][7]).toBe(true);
    });

    it('🔴 마지막 점이 모의 좌표면 출처와 «임자»를 그 점의 시각으로 함께 세운다 — 시각을 지어내지 않는다', async () => {
        const at = Date.now() - 30_000;
        db.prepare(`INSERT INTO gps_tracks (user_id, at_ms, x, y, source) VALUES (?, ?, ?, ?, ?)`).run(U, at, 127.33, 37.35, 'mock');
        await bootstrapUserSession(U, io);
        const s = getUserSession(U);
        expect(s.lastFixSource).toBe('mock');
        expect(s.lastFixIsMock).toBe(true);
        expect(s.mockGpsOwner).toMatchObject({ at });
    });
});

describe('🗺️ 경로 다시 재기 — 다녀온 상차지는 건너뛴다', () => {
    const one = (o: Record<string, unknown> = {}) => {
        const s = getUserSession(U);
        const c = { id: `${U}-w1`, status: 'ORDER_CONFIRMED', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.44, dropoffY: 37.28, ...o } as any;
        s.myOrders = [c];
        s.pendingOrdersData.set(c.id, c);
        return s;
    };

    it('🔴 남은 콜이 하나면 단독 경로로 — 도착한 상차지면 건너뛰고 · 아니면 들른다', async () => {
        process.env.KAKAO_REST_API_KEY = 'test-key';
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        one({ arrivedPickupAt: '2026-10-07T03:00:00.000Z' });
        await recalculateActiveKakaoRoute(U, io);
        one();
        await recalculateActiveKakaoRoute(U, io);
        expect(solo.mock.calls.map(c => c[7])).toEqual([true, false]);
    });

    it('🔴 관제웹이 경로를 다시 재라고 하면 — 도착한 상차지는 건너뛴다', async () => {
        process.env.KAKAO_REST_API_KEY = 'test-key';
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        one({ status: 'ORDER_PICKED_UP' });
        await recalculateKakaoRoute(U, `${U}-w1`, 'TIME', io);
        expect(solo).toHaveBeenCalledTimes(1);
        expect(solo.mock.calls[0][7]).toBe(true);
    });
});

describe('📦 마일스톤', () => {
    const confirmed = (id: string, o: Record<string, unknown> = {}) => {
        ledgerCall(id, o);
        birthFirstStep(U, id);
        const s = getUserSession(U);
        s.myOrders.push({ id, status: 'ORDER_CONFIRMED', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.44, dropoffY: 37.28, ...o } as any);
        return s;
    };

    it('🔴 도착은 시각만 · 상차는 상태를 바꾼다 · 하차는 완료 시각을 메모리에도', async () => {
        const s = confirmed(`${U}-m1`);
        await reportMilestone(U, `${U}-m1`, 'ARRIVED_PICKUP', 'MANUAL', io);
        expect(s.myOrders[0].arrivedPickupAt).toBeTruthy();
        expect(s.myOrders[0].status).toBe('ORDER_CONFIRMED');
        await reportMilestone(U, `${U}-m1`, 'PICKED_UP', 'MANUAL', io);
        expect(s.myOrders[0].status).toBe('ORDER_PICKED_UP');
        expect(ledgerRow(`${U}-m1`).status).toBe('ORDER_PICKED_UP');
        await reportMilestone(U, `${U}-m1`, 'DELIVERED', 'MANUAL', io, '2026-10-07T05:00:00.000Z');
        expect(s.myOrders[0]).toMatchObject({ status: 'ORDER_DELIVERED', completedAt: '2026-10-07T05:00:00.000Z' });
        expect((db.prepare(`SELECT completedAt FROM orders WHERE id = ?`).get(`${U}-m1`) as any).completedAt).toBe('2026-10-07T05:00:00.000Z');
    });

    it('🔴 도착 사유는 단계 장부(도착 행)에 함께 적힌다', () => {
        confirmed(`${U}-rsn`);
        bridgeMilestone(U, `${U}-rsn`, 'ARRIVED_PICKUP', 'MANUAL', '2026-10-07T03:00:00.000Z', ['화주 미준비']);
        const row = db.prepare(`SELECT reasons FROM step_arrive_pickup WHERE orderId = ?`).get(`${U}-rsn`) as any;
        expect(JSON.parse(row.reasons)).toEqual(['화주 미준비']);
    });

    it('🔴 역행 · 중복은 무시한다 — 상태를 안 바꾼다', async () => {
        const s = confirmed(`${U}-m2`, { status: 'ORDER_PICKED_UP' });
        const back = await reportMilestone(U, `${U}-m2`, 'ARRIVED_PICKUP', 'MANUAL', io);
        expect(back).toMatchObject({ duplicated: true, reason: 'OUT_OF_ORDER' });
        expect(s.myOrders[0].arrivedPickupAt).toBeUndefined();
        const t = confirmed(`${U}-m3`);
        bridgeMilestone(U, `${U}-m3`, 'PICKED_UP', 'MANUAL');
        const dup = await reportMilestone(U, `${U}-m3`, 'PICKED_UP', 'MANUAL', io);
        expect(dup).toMatchObject({ duplicated: true });
        expect(t.myOrders.find(c => c.id === `${U}-m3`).status).toBe('ORDER_CONFIRMED');
    });

    it('🔴 착불을 수령 표시 없이 하차하면 미수금으로 잡는다 · 착불이 아니면 안 잡는다', async () => {
        const cod = jest.spyOn(OrderRepository, 'setCodCollected');
        confirmed(`${U}-cod`, { paymentType: '착불' });
        await reportMilestone(U, `${U}-cod`, 'DELIVERED', 'MANUAL', io);
        expect(cod).toHaveBeenCalledWith(`${U}-cod`, U, false, 20000);
        cod.mockClear();
        confirmed(`${U}-pre`, { paymentType: '선불' });
        await reportMilestone(U, `${U}-pre`, 'DELIVERED', 'MANUAL', io);
        expect(cod).not.toHaveBeenCalled();
    });

    it('🔴 하차하면 남은 콜로 경로를 다시 잰다', async () => {
        confirmed(`${U}-d1`);
        confirmed(`${U}-d2`);
        process.env.KAKAO_REST_API_KEY = 'test-key';
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        await reportMilestone(U, `${U}-d2`, 'DELIVERED', 'MANUAL', io);
        expect(solo).toHaveBeenCalledTimes(1);
    });

    it('🔴 되돌리기 — 도착을 되돌리면 도착 시각을 지우고 · 하차를 되돌리면 남은 기록으로 상태를 다시 낸다(상차 완료)', async () => {
        const s = confirmed(`${U}-u1`);
        await reportMilestone(U, `${U}-u1`, 'ARRIVED_PICKUP', 'MANUAL', io);
        bridgeMilestone(U, `${U}-u1`, 'ARRIVED_PICKUP', 'MANUAL');
        await undoMilestone(U, `${U}-u1`, 'ARRIVED_PICKUP', io);
        expect(s.myOrders[0].arrivedPickupAt).toBeUndefined();
        const t = confirmed(`${U}-u2`);
        bridgeMilestone(U, `${U}-u2`, 'PICKED_UP', 'MANUAL');
        bridgeMilestone(U, `${U}-u2`, 'DELIVERED', 'MANUAL');
        t.myOrders.find(c => c.id === `${U}-u2`).status = 'ORDER_DELIVERED';
        const r = await undoMilestone(U, `${U}-u2`, 'DELIVERED', io);
        expect(r).toMatchObject({ success: true, status: 'ORDER_PICKED_UP' });
    });
});

describe('🧭 복귀 켬', () => {
    it('🔴 집 주소가 없으면 복귀를 못 켠다 · 목적지(노선)는 켠다', async () => {
        const s = getUserSession(U);
        s.activeFilter.destinationCity = '이천시';
        const r = await setCallTarget(U, 'HOME', io, 'driver');
        expect(r).toMatchObject({ success: false, message: '설정에 집 주소가 없습니다' });
        expect(s.activeFilter.callTarget ?? 'DEST').toBe('DEST');
        const d = await setCallTarget(U, 'DEST', io, 'driver');
        expect(d).toMatchObject({ success: true, phase: 'DEST', city: '이천시' });
    });

    it('🔴 복귀를 켜도 목적지 · 반경 · 콜은 그대로 — 바뀌는 것은 «어디로 가나»(callTarget) 하나 · 집 시는 좌표로', async () => {
        db.prepare(`UPDATE user_settings SET home_address = ?, home_x = ?, home_y = ? WHERE user_id = ?`)
            .run('경기도 광주 초월 동광뷰엘', 127.31, 37.36, U);
        ledgerCall(`${U}-t1`);
        const s = getUserSession(U);
        s.activeFilter.destinationCity = '이천시';
        s.myOrders = [{ id: `${U}-t1`, status: 'ORDER_CONFIRMED' } as any];
        const radius = s.activeFilter.destinationRadiusKm;
        const r = await setCallTarget(U, 'HOME', io, 'driver');
        expect(r).toMatchObject({ success: true, phase: 'HOME', city: '광주시' });
        expect(s.activeFilter).toMatchObject({ callTarget: 'HOME', destinationCity: '이천시', destinationRadiusKm: radius });
        expect(s.myOrders[0].status).toBe('ORDER_CONFIRMED');
        expect(ledgerRow(`${U}-t1`).status).toBe('ORDER_CONFIRMED');
        /* 파생값(키워드 · 시 묶음)은 필터 매니저가 callTarget 만 받아 만든 것과 같다 — 직접 채우지 않는다 */
        const derived = { kw: s.activeFilter.destinationKeywords, cf: s.activeFilter.customCityFilters };
        clearUserSession(U);
        const t = getUserSession(U);
        t.activeFilter.destinationCity = '이천시';
        filterManager.updateActiveFilter(U, { callTarget: 'HOME', isActive: true }, io);
        expect({ kw: t.activeFilter.destinationKeywords, cf: t.activeFilter.customCityFilters }).toEqual(derived);
    });

    it('🔴 바꾼 일을 누가 바꿨는지와 함께 적고 · 적은 뒤에 하차 · 상차 목록을 다시 만든다 · 같은 값이면 안 적는다', async () => {
        db.prepare(`UPDATE user_settings SET home_address = ?, home_x = ?, home_y = ? WHERE user_id = ?`)
            .run('경기도 광주 초월 동광뷰엘', 127.31, 37.36, U);
        getUserSession(U).activeFilter.destinationCity = '이천시';
        const events = () => db.prepare(`SELECT target, by FROM call_target_events WHERE user_id = ? ORDER BY rowid`).all(U) as any[];
        const seenAtRebuild: number[] = [];
        const orig = filterManager.rebuildNetFilter;
        jest.spyOn(filterManager, 'rebuildNetFilter').mockImplementation((...a: any[]) => { seenAtRebuild.push(events().length); return orig(...a); });
        await setCallTarget(U, 'HOME', io, 'driver');
        await setCallTarget(U, 'HOME', io, 'driver');
        await setCallTarget(U, 'DEST', io, 'auto');
        expect(events()).toEqual([{ target: 'HOME', by: 'driver' }, { target: 'DEST', by: 'auto' }]);
        expect(seenAtRebuild[0]).toBe(1);
        expect(seenAtRebuild[seenAtRebuild.length - 1]).toBe(2);
    });

    it('🔄 노선으로 돌아갈 때의 시는 오늘값이 먼저, 없으면 평소값', async () => {
        const s = getUserSession(U);
        s.activeFilter.destinationCity = '';
        s.baseFilter.destinationCity = '파주시';
        expect(await setCallTarget(U, 'DEST', io, 'driver')).toMatchObject({ success: true, city: '파주시' });
    });
});

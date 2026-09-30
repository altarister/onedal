// @ts-nocheck
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import * as kakaoService from '../../src/services/kakaoService';
import * as userSessionStore from '../../src/state/userSessionStore';

/**
 * 🪦 **판정 도중 끝난 콜의 판정은 버린다** (04 리뷰 뒤 서버 병목 조사 ① · onedal-1f «가»).
 *
 * 판정은 카카오를 기다리는 동안 안전취소(같은 객체의 status → SAFE_CANCEL)나 새 판정(map 이 다른 객체로)이 끼어들 수 있다.
 * 끝에서 «아직 이 객체 · 심사 중»이 아니면 저장도 알림도 안 한다 — 안 그러면 취소된 콜이 결재 대기로 되살아나 관제웹에 버튼과 함께 뜬다.
 */
jest.mock('../../src/repositories/SettingsRepository');
jest.mock('../../src/services/kakaoService');
jest.mock('../../src/state/userSessionStore');

describe('🪦 판정 끝 — 아직 이 객체 · 심사 중일 때만 저장·알림', () => {
    let session;
    let io;
    let pending = [];
    const release = () => { pending.splice(0).forEach(r => r({ x: 127.1, y: 37.1 })); };

    beforeEach(() => {
        jest.restoreAllMocks();
        io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
        session = {
            userId: 'guard-user', myOrders: [], pendingOrdersData: new Map(), reservedOrders: [],
            origin: { x: 127.0, y: 37.0 },
            baseFilter: {},
            activeFilter: { allowedVehicleTypes: ['1t'], minFare: 5000, maxFare: 100000, dispatchPhase: 'STANDBY', excludedKeywords: [], isSharedMode: false, destinationKeywords: [] },
        };
        userSessionStore.getUserSession.mockReturnValue(session);
        SettingsRepository.loadPricingConfig.mockReturnValue({ vehicleRates: { '1t': 1000 }, agencyFeePercent: 20, maxDiscountPercent: 10 });
        SettingsRepository.getKakaoRoutingOptions.mockReturnValue({ carType: 1, defaultPriority: 'RECOMMEND', vehicleType: '1t' });
        /* 좌표 찾기가 끝나기 전에 끼어들 틈을 연다 */
        pending = [];
        kakaoService.geocodeAddress.mockImplementation(() => new Promise(r => { pending.push(r); }));
        kakaoService.calculateSoloRoute.mockResolvedValue({ distance: 10000, duration: 1200, polyline: [], approachDistance: 1000, approachDuration: 120 });
        process.env.KAKAO_REST_API_KEY = 'test-key';
    });

    const order = (id) => ({ id, pickup: '서울 강남구 역삼동', dropoff: '경기 성남시 분당구', vehicleType: '1t', fare: 15000, rawText: '', status: 'ORDER_SECURED_EVALUATING' });
    const evaluatedEmits = () => io.emit.mock.calls.filter(c => c[0] === 'order-evaluated').length;

    test('🔴 판정 도중 안전취소된 콜 — 끝나도 SAFE_CANCEL 그대로 · 알림 0 · 저장 0', async () => {
        const save = jest.spyOn(OrderRepository, 'saveJudgment').mockImplementation(() => {});
        const o = order('guard-cancel');
        session.pendingOrdersData.set(o.id, o);
        const run = new OrderEvaluator('insung').evaluate('guard-user', o, io);
        await new Promise(r => setImmediate(r));
        o.status = 'SAFE_CANCEL';           // 안전취소 타이머가 같은 객체를 바꾼다 (helpers.setOrderStatus)
        release();
        await run;
        expect(o.status).toBe('SAFE_CANCEL');
        expect(evaluatedEmits()).toBe(0);
        expect(save).not.toHaveBeenCalled();
    });

    test('🔴 판정 도중 같은 id 가 새 객체로 바뀌면(미리보기 → 확정 다시 판정) 옛 판정은 버린다', async () => {
        const save = jest.spyOn(OrderRepository, 'saveJudgment').mockImplementation(() => {});
        const o = order('guard-replaced');
        session.pendingOrdersData.set(o.id, o);
        const run = new OrderEvaluator('insung').evaluate('guard-user', o, io);
        await new Promise(r => setImmediate(r));
        session.pendingOrdersData.set(o.id, { ...o });
        release();
        await run;
        expect(evaluatedEmits()).toBe(0);
        expect(save).not.toHaveBeenCalled();
    });

    test('살아 있는 콜은 지금처럼 결재 대기 · 알림 1 · 판정 시간 한 줄', async () => {
        jest.spyOn(OrderRepository, 'saveJudgment').mockImplementation(() => {});
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const o = order('guard-alive');
        session.pendingOrdersData.set(o.id, o);
        const run = new OrderEvaluator('insung').evaluate('guard-user', o, io);
        await new Promise(r => setImmediate(r));
        release();
        await run;
        expect(o.status).toBe('ORDER_AWAITING_DECISION');
        expect(evaluatedEmits()).toBe(1);
        expect(log.mock.calls.some(c => String(c.join(' ')).includes('⏱️ [판정 시간]'))).toBe(true);
    });
});

/**
 * 📸 **판정 재료는 시작 때 한 번 뜬다** (서버 병목 15 · onedal-1f «가») — 기점 · 잡은 콜 · 목적지 · 오늘 필터(얕은 사본).
 * 카카오를 기다리는 사이 GPS·필터·KEEP 이 끼어들어도 한 판정이 옛 값/새 값을 섞지 않는다.
 * 도중 잡은 콜 수가 바뀌면 판정 시간 줄에 표시만 한다(고치지 않음 — 16 «판정 낡음»과 같은 뿌리).
 */
describe('📸 판정 재료 한 번 뜨기', () => {
    let session;
    let io;
    let pending = [];
    const release = () => { pending.splice(0).forEach(r => r({ x: 127.1, y: 37.1 })); };

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
        session = {
            userId: 'snap-user', myOrders: [], pendingOrdersData: new Map(), reservedOrders: [],
            lastFix: { x: 127.01, y: 37.01 }, lastFixAt: Date.now(), lastFixSource: 'gps',
            baseFilter: {},
            activeFilter: { allowedVehicleTypes: ['1t'], minFare: 5000, maxFare: 100000, dispatchPhase: 'STANDBY', excludedKeywords: [], isSharedMode: false, destinationKeywords: [], pickupRadiusKm: 5 },
        };
        userSessionStore.getUserSession.mockReturnValue(session);
        SettingsRepository.loadPricingConfig.mockReturnValue({ vehicleRates: { '1t': 1000 }, agencyFeePercent: 20, maxDiscountPercent: 10 });
        SettingsRepository.getKakaoRoutingOptions.mockReturnValue({ carType: 1, defaultPriority: 'RECOMMEND', vehicleType: '1t' });
        pending = [];
        kakaoService.geocodeAddress.mockImplementation(() => new Promise(r => { pending.push(r); }));
        kakaoService.calculateSoloRoute.mockResolvedValue({ distance: 10000, duration: 1200, polyline: [], approachDistance: 1000, approachDuration: 120 });
        jest.spyOn(OrderRepository, 'saveJudgment').mockImplementation(() => {});
        process.env.KAKAO_REST_API_KEY = 'test-key';
    });
    const order = (id) => ({ id, pickup: '서울 강남구 역삼동', dropoff: '경기 성남시 분당구', vehicleType: '1t', fare: 15000, rawText: '', status: 'ORDER_SECURED_EVALUATING' });
    const run = async (id, meanwhile) => {
        const o = order(id);
        session.pendingOrdersData.set(o.id, o);
        const p = new OrderEvaluator('insung').evaluate('snap-user', o, io);
        await new Promise(r => setImmediate(r));
        meanwhile();
        release();
        await p;
        return o;
    };

    test('🔴 좌표를 기다리는 사이 현위치가 바뀌어도 길찾기 기점은 시작 때 자리', async () => {
        await run('snap-a', () => { session.lastFix = { x: 127.5, y: 37.5 }; session.lastFixAt = Date.now(); });
        expect(kakaoService.calculateSoloRoute).toHaveBeenCalledTimes(1);
        expect(kakaoService.calculateSoloRoute.mock.calls[0][4]).toMatchObject({ x: 127.01, y: 37.01 });
    });

    test('🔴 사이에 잡은 콜이 생겨도 단독 갈래 그대로 · 판정 시간 줄에 «판정 중 잡은 콜 수가 바뀜»', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await run('snap-b', () => { session.myOrders.push({ id: 'kept-meanwhile', status: 'ORDER_CONFIRMED', pickupX: 127.2, pickupY: 37.2, dropoffX: 127.3, dropoffY: 37.3 }); });
        expect(kakaoService.calculateSoloRoute).toHaveBeenCalledTimes(1);
        const line = log.mock.calls.map(c => c.join(' ')).find(l => l.includes('⏱️ [판정 시간]'));
        expect(line).toContain('판정 중 잡은 콜 수가 바뀜');
    });

    test('🔴 사이에 오늘 필터 칸을 그 자리에서 고쳐도 판정 근거의 반경은 시작 때 값', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await run('snap-c', () => { session.activeFilter.pickupRadiusKm = 99; });
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('도달 반경 dryRun'));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every(l => l.includes('설정 5km'))).toBe(true);
    });
});

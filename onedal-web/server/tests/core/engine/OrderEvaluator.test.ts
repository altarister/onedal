// @ts-nocheck
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { OrderEvaluator } from '../../../src/core/engine/OrderEvaluator';
import { SettingsRepository } from '../../../src/repositories/SettingsRepository';
import * as kakaoService from '../../../src/services/kakaoService';
import * as userSessionStore from '../../../src/state/userSessionStore';

// 외부 의존성 모킹 (DB, 네트워크 접근 차단)
jest.mock('../../../src/repositories/SettingsRepository');
jest.mock('../../../src/services/kakaoService');
jest.mock('../../../src/state/userSessionStore');

describe('OrderEvaluator', () => {
    let evaluator;
    let mockIo;

    beforeEach(() => {
        evaluator = new OrderEvaluator('insung');
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };

        // UserSession 상태 모킹
        userSessionStore.getUserSession.mockReturnValue({
            userId: 'test-user',
            myOrders: [],
            pendingOrdersData: new Map(),
            driverLocation: { x: 127.0, y: 37.0 },
            activeFilter: {
                allowedVehicleTypes: ['1t'],
                minFare: 5000,
                maxFare: 100000,
                dispatchPhase: 'STANDBY',
                excludedKeywords: ['착불'],
                isSharedMode: false,
                destinationKeywords: []
            }
        });

        // SettingsRepository 모킹
        SettingsRepository.loadPricingConfig.mockReturnValue({
            vehicleRates: { '1t': 1000 },
            agencyFeePercent: 20, // 20%
            maxDiscountPercent: 10 // 10%
        });
        SettingsRepository.getKakaoRoutingOptions.mockReturnValue({
            carType: 1, defaultPriority: 'RECOMMEND', vehicleType: '1t'
        });

        // KakaoService 모킹 (지오코딩 & 경로 연산 성공 가정)
        kakaoService.geocodeAddress.mockResolvedValue({ x: 127.1, y: 37.1 });
        kakaoService.calculateSoloRoute.mockResolvedValue({
            distance: 10000, // 10km
            duration: 1200,  // 20분
            polyline: [1,2,3],
            approachDistance: 1000,
            approachDuration: 120
        });
    });

    test('조건이 모두 충족되는 꿀콜은 패널티 없이 통과해야 한다', async () => {
        const order = {
            id: 'order-1',
            pickup: '서울 강남구 역삼동',
            dropoff: '경기 성남시 분당구',
            vehicleType: '1t',
            fare: 15000, // 10km 기준 적정가(8000원)보다 높으므로 꿀콜
            rawText: '안전하게 모십니다'
        };

        process.env.KAKAO_REST_API_KEY = "test-key"; // API Key 우회

        await evaluator.evaluate('test-user', order, mockIo);

        expect(order.isRejected).toBe(false);
        expect(order.rejectionReasons.length).toBe(0); // 똥콜 사유 없음
        expect(order.approvalReasons.length).toBeGreaterThan(0); // 꿀콜 장점 기록됨
        expect(order.status).toBe('ORDER_AWAITING_DECISION');
        expect(mockIo.emit).toHaveBeenCalledWith('order-evaluated', order);
    });

    test('하한가 미달 및 제외 키워드 포함 시 정확하게 똥콜로 걸러내야 한다', async () => {
        const order = {
            id: 'order-2',
            pickup: '출발지',
            dropoff: '도착지',
            vehicleType: '1t',
            fare: 3000, // 5000원 절대 하한가 미달 및 10km 하한선(7200원) 미달
            rawText: '이것은 착불 오더입니다' // 블랙리스트 키워드
        };

        process.env.KAKAO_REST_API_KEY = "test-key";

        await evaluator.evaluate('test-user', order, mockIo);

        expect(order.isRejected).toBe(true);
        // Stage 1 사유 확인
        expect(order.rejectionReasons.some(r => r.includes('첫짐 절대하한가 미달'))).toBe(true);
        expect(order.rejectionReasons.some(r => r.includes('제외키워드(착불)'))).toBe(true);
        // Stage 3 사유 확인
        expect(order.rejectionReasons.some(r => r.includes('요율 미달'))).toBe(true);
    });
});

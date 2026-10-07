// @ts-nocheck
import { stopPlaceFrom, normalizePlaceName } from '../../src/services/dispatchEngine';
import { arrivedFieldFrom } from '../../src/services/milestones';
import { visitedStopsFrom, restoredFixFrom, restoredOrderFrom } from '../../src/state/sessionRestore';

/**
 * 🧮 **결재 · 단계 보고 · 되살리기의 셈** — 값만 받는 함수를 세션 · DB · 지금 시각 없이 문다.
 */
describe('🏷️ 장부에 적을 정거장', () => {
    it('🔴 상세 첫 줄이 있으면 그 이름(정리) · 주소 · 지역 · 전화', () => {
        const p = stopPlaceFrom({ customerName: '주식회사 레드 캠프', addressDetail: '경기 이천시 중리동 1', region: '경기 이천시', phone1: '010-1' },
            '경기 이천시 중리동', 127.4, 37.2);
        expect(p).toEqual({ name: '레드캠프', address: '경기 이천시 중리동 1', region: '경기 이천시', x: 127.4, y: 37.2, phone: '010-1' });
    });

    it('🔴 상세가 없으면 콜 글자에서 — 지역은 앞 두 낱말 · 이름은 «배차값없음» · 좌표 0 은 없음', () => {
        expect(stopPlaceFrom(undefined, '경기 광주시 초월읍', 0, undefined))
            .toEqual({ name: '배차값없음', address: '경기 광주시 초월읍', region: '경기 광주시', x: null, y: null, phone: null });
        expect(stopPlaceFrom(undefined, '', undefined, undefined).region).toBe('배차값없음');
        expect(normalizePlaceName('(주) 한 빛')).toBe('한빛');
    });
});

describe('🚏 도착 칸', () => {
    it('🔴 도착 둘만 칸이 있다', () => {
        expect(arrivedFieldFrom('ARRIVED_PICKUP')).toBe('arrivedPickupAt');
        expect(arrivedFieldFrom('ARRIVED_DROPOFF')).toBe('arrivedDropoffAt');
        expect(arrivedFieldFrom('PICKED_UP')).toBeNull();
        expect(arrivedFieldFrom('DELIVERED')).toBeNull();
    });
});

describe('♻️ 되살리기', () => {
    it('🔴 다녀온 정거장 — 도착 마일스톤의 시각만 · 없으면 비어 있다', () => {
        expect(visitedStopsFrom([{ milestone: 'PICKED_UP', occurredAt: 'T2' }, { milestone: 'ARRIVED_PICKUP', occurredAt: 'T1' }]))
            .toEqual({ arrivedPickupAt: 'T1', arrivedDropoffAt: undefined });
        expect(visitedStopsFrom([{ milestone: 'ARRIVED_DROPOFF', occurredAt: 'T3' }])).toEqual({ arrivedPickupAt: undefined, arrivedDropoffAt: 'T3' });
        expect(visitedStopsFrom([])).toEqual({ arrivedPickupAt: undefined, arrivedDropoffAt: undefined });
    });

    it('🔴 마지막 점 — 좌표 · 그 점의 시각 · 출처 · 모의면 임자도 그 시각으로', () => {
        expect(restoredFixFrom({ x: 1, y: 2, atMs: 500, source: 'mock' })).toEqual({
            lastFix: { x: 1, y: 2 }, lastFixAt: 500, lastFixIsMock: true, lastFixSource: 'mock',
            mockGpsOwner: { socketId: '복구', at: 500, warned: false },
        });
        expect(restoredFixFrom({ x: 1, y: 2, atMs: 500, source: 'gps' }))
            .toEqual({ lastFix: { x: 1, y: 2 }, lastFixAt: 500, lastFixIsMock: false, lastFixSource: 'gps' });
        expect(restoredFixFrom({ x: 1, y: 2, atMs: 500, source: null }).lastFixSource).toBe('gps');
    });

    it('🔴 콜 한 줄 — 칸을 옮겨 담고 · 궤적은 펴고 · 깨진 궤적은 없음 · 다녀온 정거장 · 판정 · 연락처를 싣는다', () => {
        const row = {
            id: 'c1', type: 'NEW_ORDER', pickup: '상', dropoff: '하', fare: 20000, timestamp: 'T', status: 'ORDER_PICKED_UP', capturedAt: 'C',
            goalCity: '여주시', reserved: 1, reservedDay: null, capturedVia: 'alarm', completedAt: null, isShared: 1, isExpress: 0,
            routePolyline: '[{"x":1,"y":2}]', pickupX: 1, pickupY: 2, dropoffX: 3, dropoffY: 4, paymentType: '착불', dispatcherName: null,
        };
        const o = restoredOrderFrom(row, { visited: { arrivedPickupAt: 'T1' }, judgment: { color: '꿀', score: 80 }, contacts: { pickupPhone: '010' } });
        expect(o).toMatchObject({
            id: 'c1', status: 'ORDER_PICKED_UP', goalCity: '여주시', reserved: true, capturedVia: 'alarm', isShared: true, isExpress: false,
            routePolyline: [{ x: 1, y: 2 }], paymentType: '착불', arrivedPickupAt: 'T1', judgment: { color: '꿀', score: 80 }, pickupPhone: '010',
        });
        expect(o.reservedDay).toBeUndefined();
        expect(o.dispatcherName).toBeUndefined();
        const broken = restoredOrderFrom({ ...row, routePolyline: '깨짐', goalCity: null, reserved: null }, { visited: {}, judgment: null, contacts: {} });
        expect(broken.routePolyline).toBeUndefined();
        expect(broken.goalCity).toBeUndefined();
        expect(broken.reserved).toBeUndefined();
        expect(broken.judgment).toBeUndefined();
    });
});

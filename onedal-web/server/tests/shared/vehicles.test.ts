// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import {
    getEligibleVehicleTypes,
    getRemainingCapacityTypes,
    normalizeVehicleType,
    VEHICLE_CAPACITY,
} from '@onedal/shared';

/**
 * 적재 용량 모델 회귀 방어 (이슈 S)
 *
 * 기사님 실측 규칙: 1t 트럭 한 대에
 *   1t짐 ×1 = 라보 ×2 = 다마스 ×3 = 승용차 ×5
 *   오토바이 짐은 조수석 → 짐칸 미점유, 상한 없음
 */
describe('적재 용량 점수표', () => {
    test('기사님 실측 비율이 점수로 정확히 표현되는가', () => {
        const oneTon = VEHICLE_CAPACITY['1t'];
        expect(VEHICLE_CAPACITY['라보'] * 2).toBe(oneTon);
        expect(VEHICLE_CAPACITY['다마스'] * 3).toBe(oneTon);
        expect(VEHICLE_CAPACITY['승용차'] * 5).toBe(oneTon);
        expect(VEHICLE_CAPACITY['오토바이']).toBe(0);
    });

    test('승용차는 다마스보다 작다 (VEHICLE_OPTIONS 배열 순서와 무관해야 함)', () => {
        expect(VEHICLE_CAPACITY['승용차']).toBeLessThan(VEHICLE_CAPACITY['다마스']);
    });
});

describe('normalizeVehicleType — 앱 파서 축약 코드 보정', () => {
    test.each([
        ['오', '오토바이'],
        ['오토', '오토바이'],
        ['다', '다마스'],
        ['라', '라보'],
        ['1.4', '1.4t'],
        ['오토바이', '오토바이'],
        ['1t', '1t'],
    ])('%s → %s', (input, expected) => {
        expect(normalizeVehicleType(input)).toBe(expected);
    });

    test('알 수 없는 값은 null', () => {
        expect(normalizeVehicleType('덤프트럭')).toBeNull();
        expect(normalizeVehicleType('')).toBeNull();
        expect(normalizeVehicleType(null)).toBeNull();
    });
});

describe('getEligibleVehicleTypes — 빈차 기준 수행 가능 등급', () => {
    test('1t 기사는 1t 이하 전부 잡을 수 있다', () => {
        expect(getEligibleVehicleTypes('1t')).toEqual(
            expect.arrayContaining(['오토바이', '다마스', '라보', '승용차', '1t'])
        );
    });

    test('1t 기사는 자기 차보다 큰 등급을 잡을 수 없다', () => {
        const types = getEligibleVehicleTypes('1t');
        expect(types).not.toContain('1.4t');
        expect(types).not.toContain('2.5t');
    });

    test('라보 기사는 라보 이하만 (다마스·승용차·오토바이)', () => {
        const types = getEligibleVehicleTypes('라보');
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보']));
        expect(types).not.toContain('1t');
    });
});

describe('getRemainingCapacityTypes — 합짐 잔여 공간 기준', () => {
    test('🔴 이슈 S 재현 방어: 오토바이 짐을 실어도 콜 잡기 범위가 줄지 않는다', () => {
        // 수정 전에는 [오토바이] 하나만 반환되어 합짐 콜 잡기가 정지했다.
        const types = getRemainingCapacityTypes('1t', ['오토바이']);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보', '1t']));
    });

    test('오토바이 짐은 몇 건을 실어도 짐칸을 점유하지 않는다', () => {
        const types = getRemainingCapacityTypes('1t', ['오토바이', '오토바이', '오토바이', '오토바이']);
        expect(types).toContain('1t');
    });

    test('라보 1건 → 남은 15점 → 라보까지 가능, 1t는 불가', () => {
        const types = getRemainingCapacityTypes('1t', ['라보']);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보']));
        expect(types).not.toContain('1t');
    });

    test('라보 2건 → 만재 → 오토바이만', () => {
        expect(getRemainingCapacityTypes('1t', ['라보', '라보'])).toEqual(['오토바이']);
    });

    test('다마스 3건 → 만재 → 오토바이만', () => {
        expect(getRemainingCapacityTypes('1t', ['다마스', '다마스', '다마스'])).toEqual(['오토바이']);
    });

    test('승용차 5건 → 만재 → 오토바이만', () => {
        const five = ['승용차', '승용차', '승용차', '승용차', '승용차'];
        expect(getRemainingCapacityTypes('1t', five)).toEqual(['오토바이']);
    });

    test('1t 1건 → 만재 → 오토바이만', () => {
        expect(getRemainingCapacityTypes('1t', ['1t'])).toEqual(['오토바이']);
    });

    test('다마스 1건 → 남은 20점이지만 1t(30점)는 못 실는다', () => {
        const types = getRemainingCapacityTypes('1t', ['다마스']);
        expect(types).toContain('라보');
        expect(types).not.toContain('1t');
    });

    test('적재 초과 시에도 음수가 되지 않고 오토바이만 남는다', () => {
        expect(getRemainingCapacityTypes('1t', ['1t', '1t'])).toEqual(['오토바이']);
    });

    test('앱 축약 코드(오/다/라)로 넘어와도 동일하게 계산된다', () => {
        expect(getRemainingCapacityTypes('1t', ['오'])).toEqual(getRemainingCapacityTypes('1t', ['오토바이']));
        expect(getRemainingCapacityTypes('1t', ['라', '라'])).toEqual(['오토바이']);
    });

    test('알 수 없는 차종은 내 차를 가득 채운 것으로 보수적 처리', () => {
        expect(getRemainingCapacityTypes('1t', ['덤프트럭'])).toEqual(['오토바이']);
    });
});

// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import {
    getEligibleVehicleTypes,
    getRemainingCapacityTypes,
    normalizeVehicleType,
    VEHICLE_CAPACITY,
    TRUCK_CAPACITY_SLOTS,
} from '@onedal/shared';

/**
 * 적재 용량 모델 회귀 방어 (이슈 S)
 *
 * 기사님 실측 규칙: 1t 트럭 한 대에
 *   1t짐 ×1 = 라보 ×2 = 다마스 ×3 = 승용차 ×5
 *   오토바이 짐은 조수석 → 짐칸 미점유, 상한 없음
 */
describe('적재 용량 점수표', () => {
    /**
     * 🔴 라면박스 축 (기사님 확정 2026-08-17 · 용어집 §5·§7이 원천).
     *    옛 조합표(라보×2 = 다마스×3 = 승용차×5 = 1t짐)는 폐기 — 비율이 실측으로 바뀌었다.
     */
    test('용어집 §7 그대로 — 1t짐 80(파레트 2개) · 라보 40 · 다마스 30 · 승용차 5 · 오토바이 1', () => {
        expect(VEHICLE_CAPACITY['1t']).toBe(80);
        expect(VEHICLE_CAPACITY['라보']).toBe(40);
        expect(VEHICLE_CAPACITY['다마스']).toBe(30);
        expect(VEHICLE_CAPACITY['승용차']).toBe(5);
        expect(VEHICLE_CAPACITY['오토바이']).toBe(1);   // 옛 "조수석 0점" 폐기
        expect(VEHICLE_CAPACITY['라보'] * 2).toBe(VEHICLE_CAPACITY['1t']);   // 라보×2 = 1t짐
        expect(TRUCK_CAPACITY_SLOTS).toBe(100);          // 내 그릇 = 짐 80 + 자투리 20
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
    test('🔴 이슈 S 재현 방어: 오토바이 짐(1박스)을 실어도 콜 잡기 범위가 줄지 않는다', () => {
        // 수정 전에는 [오토바이] 하나만 반환되어 합짐 콜 잡기가 정지했다.
        const types = getRemainingCapacityTypes('1t', ['오토바이']);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보', '1t']));
    });

    test('🔴 오토바이 짐도 1박스씩 점유한다 (옛 "조수석 무점유" 폐기 — 기사님 2026-08-17)', () => {
        // 4건 = 4박스 → 남은 96박스라 1t짐(80)도 아직 실린다
        expect(getRemainingCapacityTypes('1t', Array(4).fill('오토바이'))).toContain('1t');
        // 96건 = 96박스 → 남은 4박스 — 오토바이(1)만 실린다
        expect(getRemainingCapacityTypes('1t', Array(96).fill('오토바이'))).toEqual(['오토바이']);
    });

    test('라보 1건 → 남은 60박스 → 라보까지 가능, 1t짐(80)은 불가', () => {
        const types = getRemainingCapacityTypes('1t', ['라보']);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보']));
        expect(types).not.toContain('1t');
    });

    test('라보 2건(80) → 남은 자투리 20박스 → 오토바이·승용차만 (낱짐은 실린다)', () => {
        expect(getRemainingCapacityTypes('1t', ['라보', '라보'])).toEqual(['오토바이', '승용차']);
    });

    test('다마스 3건(90) → 남은 10박스 → 오토바이·승용차만 — 옛 조합표(다마스×3=만재)는 폐기', () => {
        expect(getRemainingCapacityTypes('1t', ['다마스', '다마스', '다마스'])).toEqual(['오토바이', '승용차']);
    });

    test('승용차 5건(25) → 남은 75박스 → 라보(40)까지 실린다 — 옛 조합표(승용차×5=만재)는 폐기', () => {
        const five = Array(5).fill('승용차');
        expect(getRemainingCapacityTypes('1t', five)).toEqual(['오토바이', '다마스', '라보', '승용차']);
    });

    test('1t짐 1건(80) → 남은 자투리 20박스 → 오토바이·승용차만', () => {
        expect(getRemainingCapacityTypes('1t', ['1t'])).toEqual(['오토바이', '승용차']);
    });

    test('다마스 1건 → 남은 70박스 — 라보(40)는 되고 1t짐(80)은 안 된다', () => {
        const types = getRemainingCapacityTypes('1t', ['다마스']);
        expect(types).toContain('라보');
        expect(types).not.toContain('1t');
    });

    test('적재 초과 시에도 음수가 되지 않는다 (1t짐 2건 = 160 > 100)', () => {
        expect(getRemainingCapacityTypes('1t', ['1t', '1t'])).toEqual([]);
    });

    test('앱 축약 코드(오/다/라)로 넘어와도 동일하게 계산된다', () => {
        expect(getRemainingCapacityTypes('1t', ['오'])).toEqual(getRemainingCapacityTypes('1t', ['오토바이']));
        expect(getRemainingCapacityTypes('1t', ['라', '라'])).toEqual(['오토바이', '승용차']);
    });

    test('알 수 없는 차종은 1t짐(80박스)으로 보수적 처리 — 자투리 20박스는 남는다', () => {
        expect(getRemainingCapacityTypes('1t', ['덤프트럭'])).toEqual(['오토바이', '승용차']);
    });
});

// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { deriveDispatchPhase, getRemainingCapacityTypes } from '@onedal/shared';

/**
 * 서버 재시작 복구 시 배차 상태 파생 (이슈 W)
 *
 * 상태를 따로 저장했다가 되살리는 대신, DB에서 복구한 콜 목록으로부터
 * dispatchPhase / 합짐 여부 / 남은 적재 차종을 매번 파생시킨다.
 * 저장된 상태는 실제와 어긋날 수 있지만 파생값은 어긋날 수 없다.
 */
describe('deriveDispatchPhase — 진행 중 콜 수로부터 단계 파생', () => {
    test('진행 중 콜이 없으면 STANDBY (첫짐 탐색)', () => {
        expect(deriveDispatchPhase('WAITING', 0)).toBe('STANDBY');
        expect(deriveDispatchPhase('DRIVING', 0)).toBe('STANDBY');
    });

    test('콜이 있고 대기 중이면 GATHERING (합짐 수집)', () => {
        expect(deriveDispatchPhase('WAITING', 1)).toBe('GATHERING');
        expect(deriveDispatchPhase('WAITING', 3)).toBe('GATHERING');
    });

    test('콜이 있고 운전 중이면 DELIVERING', () => {
        expect(deriveDispatchPhase('DRIVING', 1)).toBe('DELIVERING');
    });
});

describe('🔴 이슈 W 재현 방어 — 재시작 후 진행 중 3건이 있는 상황', () => {
    // 2026-08-09 실제 상황: 서버 재시작 후 DB에 오토바이 3건이 진행 중인데
    // 필터는 STANDBY / isSharedMode=false 로 남아 회랑 검사가 꺼진 채 사냥이 돌았다.
    const loaded = ['오토바이', '오토바이', '오토바이'];

    test('복구 후 단계는 STANDBY가 아니라 GATHERING이어야 한다', () => {
        expect(deriveDispatchPhase('WAITING', loaded.length)).toBe('GATHERING');
        expect(deriveDispatchPhase('WAITING', loaded.length)).not.toBe('STANDBY');
    });

    test('오토바이 3건은 조수석 적재라 짐칸이 비어 있다 → 전 차종 허용', () => {
        const types = getRemainingCapacityTypes('1t', loaded);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보', '1t']));
    });

    test('같은 3건이라도 라보 2건이 섞이면 만재로 판정되어야 한다', () => {
        // 이번 상황은 우연히 오토바이라 차종 허용이 맞았을 뿐,
        // 라보 2건이었다면 만재인데도 1t 콜을 잡으러 갔을 것이다.
        const types = getRemainingCapacityTypes('1t', ['라보', '라보', '오토바이']);
        expect(types).toEqual(['오토바이']);
    });

    test('복구 대상이 0건이면 STANDBY 유지 (필터를 건드리지 않아야 함)', () => {
        expect(deriveDispatchPhase('WAITING', 0)).toBe('STANDBY');
    });
});

describe('🔴 완료 경로에서도 STANDBY 로 돌아와야 한다 (2026-08-10)', () => {
    // 기사님: "콜을 완료했는데 필터가 합짐 탐색중이야."
    // dispatchPhase 를 STANDBY 로 되돌리는 코드가 취소 경로에만 있고 완료 경로에는 없었다.
    // 이제 filterManager 가 활성 콜 수에서 매번 파생시키므로 경로와 무관하게 정합이 유지된다.
    it('활성 콜이 0이면 무조건 STANDBY — 어떤 경로로 0이 됐든', () => {
        expect(deriveDispatchPhase('WAITING', 0)).toBe('STANDBY');
        expect(deriveDispatchPhase('DRIVING', 0)).toBe('STANDBY');
    });

    it('한 건이라도 남아 있으면 합짐 상태를 유지한다', () => {
        expect(deriveDispatchPhase('WAITING', 1)).toBe('GATHERING');
        expect(deriveDispatchPhase('DRIVING', 1)).toBe('DELIVERING');
    });
});

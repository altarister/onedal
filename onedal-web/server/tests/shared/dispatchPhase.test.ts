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
/**
 * 🔴 **출발했으면 운행 중이다** — deriveDispatchPhase(콜수, 출발했는가).
 *
 * `driverAction` 은 정류장마다 바뀐다 — 그것으로 가르면 하차지에 도착해 `UNLOADING` 이 되는
 * 순간 운행 중이 풀리고, 짐이 2건이면 정류장이 4곳이라 **출발을 네 번 눌러야** 한다.
 * 0건이면 STANDBY · 남으면 GATHERING.
 */
describe('deriveDispatchPhase — 진행 중 콜 수로부터 단계 파생', () => {
    test('진행 중 콜이 없으면 STANDBY (첫짐 탐색)', () => {
        expect(deriveDispatchPhase(0, false)).toBe('STANDBY');
        expect(deriveDispatchPhase(0, true)).toBe('STANDBY');
    });

    test('콜이 있고 대기 중이면 GATHERING (합짐 수집)', () => {
        expect(deriveDispatchPhase(1, false)).toBe('GATHERING');
        expect(deriveDispatchPhase(3, false)).toBe('GATHERING');
    });

    test('콜이 있고 운전 중이면 DELIVERING', () => {
        expect(deriveDispatchPhase(1, true)).toBe('DELIVERING');
    });
});

describe('🔴 이슈 W 재현 방어 — 재시작 후 진행 중 3건이 있는 상황', () => {
    // 실제 상황: 서버 재시작 후 DB에 오토바이 3건이 진행 중인데 필터가
    // STANDBY / isSharedMode=false 로 남으면 경유 검사가 꺼진 채 콜 잡기가 돈다.
    const loaded = ['오토바이', '오토바이', '오토바이'];

    test('복구 후 단계는 STANDBY가 아니라 GATHERING이어야 한다', () => {
        expect(deriveDispatchPhase(loaded.length, false)).toBe('GATHERING');
        expect(deriveDispatchPhase(loaded.length, false)).not.toBe('STANDBY');
    });

    test('오토바이 3건은 조수석 적재라 짐칸이 비어 있다 → 전 차종 허용', () => {
        const types = getRemainingCapacityTypes('1t', loaded);
        expect(types).toEqual(expect.arrayContaining(['오토바이', '승용차', '다마스', '라보', '1t']));
    });

    test('같은 3건이라도 라보 2건이 섞이면(81박스) 큰 짐은 못 받는다', () => {
        // 남은 적재 차종도 파생한다 — 안 그러면
        // 라보 2건일 때 남은 19박스인데도 1t 콜을 잡으러 간다.
        const types = getRemainingCapacityTypes('1t', ['라보', '라보', '오토바이']);
        expect(types).toEqual(['오토바이', '승용차']);   // 남은 19 — 낱짐만
        expect(types).not.toContain('라보');
        expect(types).not.toContain('1t');
    });

    test('복구 대상이 0건이면 STANDBY 유지 (필터를 건드리지 않아야 함)', () => {
        expect(deriveDispatchPhase(0, false)).toBe('STANDBY');
    });
});

describe('🔴 완료 경로에서도 STANDBY 로 돌아와야 한다 (2026-08-10)', () => {
    // 기사님: "콜을 완료했는데 필터가 합짐 탐색중이야."
    // dispatchPhase 를 STANDBY 로 되돌리는 코드를 경로마다 두면 한 경로(완료)에서 빠진다.
    // filterManager 가 활성 콜 수에서 매번 파생시키므로 경로와 무관하게 정합이 유지된다.
    it('활성 콜이 0이면 무조건 STANDBY — 어떤 경로로 0이 됐든', () => {
        expect(deriveDispatchPhase(0, false)).toBe('STANDBY');
        expect(deriveDispatchPhase(0, true)).toBe('STANDBY');
    });

    it('한 건이라도 남아 있으면 합짐 상태를 유지한다', () => {
        expect(deriveDispatchPhase(1, false)).toBe('GATHERING');
        expect(deriveDispatchPhase(1, true)).toBe('DELIVERING');
    });
});

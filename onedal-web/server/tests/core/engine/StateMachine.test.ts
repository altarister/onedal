// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { StateMachine } from '../../../src/core/engine/StateMachine';

describe('StateMachine', () => {
    test('EMPTY 상태에서 KEEP 시 GATHERING으로 전이된다', () => {
        const session: any = {
            activeFilter: { dispatchPhase: 'STANDBY', isSharedMode: false }
        };

        const result = StateMachine.advanceOnKeep(session, ['1t']);

        expect(result.changed).toBe(true);
        expect(result.newFilter?.dispatchPhase).toBe('GATHERING');
        expect(result.newFilter?.isSharedMode).toBe(true);
        // 🔴 경유 한 벌(키워드·묶음·별칭)은 전이가 싣지 않는다 (#81 · 2026-08-30) —
        //    키워드만 실으면 별칭 재생성 가드가 방금 채운 별칭을 지운다.
        //    행동 검사는 keepKeepsAliases.test.ts 에 있다.
        expect('destinationKeywords' in (result.newFilter ?? {})).toBe(false);
        expect(result.newFilter?.allowedVehicleTypes).toEqual(['1t']);
    });

    test('모든 콜이 취소되면 STANDBY로 롤백된다', () => {
        const session: any = {
            activeFilter: { dispatchPhase: 'GATHERING', isSharedMode: true, isActive: true }
        };
        
        const result = StateMachine.rollbackOnCancel(session, 0);

        expect(result.changed).toBe(true);
        expect(result.newFilter?.dispatchPhase).toBe('STANDBY');
        expect(result.newFilter?.isSharedMode).toBe(false);
    });

    test('콜이 남아있으면 현재 상태를 유지한다', () => {
        const session: any = {
            activeFilter: { dispatchPhase: 'DRIVING', isSharedMode: true, isActive: true }
        };
        
        const result = StateMachine.rollbackOnCancel(session, 1);

        expect(result.changed).toBe(true);
        expect(result.newFilter?.dispatchPhase).toBeUndefined(); // 기존 상태 유지
        expect(result.newFilter?.isActive).toBe(true);
    });
});

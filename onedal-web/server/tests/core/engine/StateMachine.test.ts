// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { StateMachine } from '../../../src/core/engine/StateMachine';

describe('StateMachine', () => {
    test('EMPTY 상태에서 KEEP 시 GATHERING으로 전이된다', () => {
        const session: any = {
            activeFilter: { dispatchPhase: 'STANDBY', isSharedMode: false }
        };
        const order: any = {};
        
        const result = StateMachine.advanceOnKeep(session, order, ['판교'], ['1t']);

        expect(result.changed).toBe(true);
        expect(result.newFilter?.dispatchPhase).toBe('GATHERING');
        expect(result.newFilter?.isSharedMode).toBe(true);
        expect(result.newFilter?.destinationKeywords).toEqual(['판교']);
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

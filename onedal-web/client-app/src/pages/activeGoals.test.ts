import { describe, it, expect } from 'vitest';
import { activeGoals } from './callNet';

/**
 * 🏠 **복귀는 세 상태다** (기사님 확정 2026-09-09).
 *
 * *"파주를 목적으로 콜을 수행하던 중 복귀콜을 누르면, 그 의미는 **복귀콜을 잡기 전까지
 * 관내콜을 진행하다가 복귀콜을 잡으면 복귀를 진행한다** 이거야. **복귀가 진행되면
 * 목적지를 향한 콜이 뜨면 안 되는 거고.**"*
 */
const PAJU = { name: '파주 시내' }, HOME = { name: '복귀(집)' };

describe('🏠 복귀의 세 상태 — 목적지 마름모가 언제 접히나', () => {
    it('복귀를 안 켰으면 목적지 하나다', () => {
        expect(activeGoals(PAJU, HOME, { homeOn: false, homeCaught: false })).toEqual([PAJU]);
    });

    it('복귀를 켰지만 아직 복귀콜을 못 잡았으면 «둘 다» — 그동안 관내콜을 진행한다', () => {
        expect(activeGoals(PAJU, HOME, { homeOn: true, homeCaught: false })).toEqual([PAJU, HOME]);
    });

    it('🔴 복귀콜을 잡으면 목적지가 접힌다 — 목적지를 향한 콜이 뜨면 안 된다', () => {
        expect(activeGoals(PAJU, HOME, { homeOn: true, homeCaught: true })).toEqual([HOME]);
    });

    it('복귀를 안 켰으면 «잡았다»는 표시가 있어도 목적지 하나다 (켜기가 먼저다)', () => {
        expect(activeGoals(PAJU, HOME, { homeOn: false, homeCaught: true })).toEqual([PAJU]);
    });
});

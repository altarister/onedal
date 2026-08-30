import { describe, it, expect } from 'vitest';
import {
    isEvaluating,
    isTerminal,
    EVALUATING_STATUSES,
    TERMINAL_STATUSES,
    type OrderStatus
} from './index';

describe('isManualLineage — 직접 갈래 판별은 한 곳에서만', () => {
    it('확정 전(MANUAL_CLICK)·승격 후(MANUAL) 둘 다 직접 갈래다', async () => {
        const { isManualLineage } = await import('./index');
        expect(isManualLineage('MANUAL')).toBe(true);
        expect(isManualLineage('MANUAL_CLICK')).toBe(true);   // === 'MANUAL' 비교가 세 번 놓친 표기
        expect(isManualLineage('AUTO_CLICK')).toBe(false);
        expect(isManualLineage(undefined)).toBe(false);
    });
});

describe('OrderStatus Helpers', () => {
    describe('isEvaluating', () => {
        it('EVALUATING_STATUSES에 포함된 상태들은 true를 반환한다', () => {
            EVALUATING_STATUSES.forEach(status => {
                expect(isEvaluating(status)).toBe(true);
            });
        });

        it('그 외의 상태들은 false를 반환한다', () => {
            expect(isEvaluating('ORDER_CONFIRMED')).toBe(false);
            expect(isEvaluating('ORDER_PICKED_UP')).toBe(false);
            expect(isEvaluating('ORDER_COMPLETED')).toBe(false);
            expect(isEvaluating('SAFE_CANCEL')).toBe(false);
        });

        it('undefined나 유효하지 않은 문자열이 들어오면 false를 반환한다', () => {
            expect(isEvaluating(undefined)).toBe(false);
            expect(isEvaluating('INVALID_STATUS')).toBe(false);
            expect(isEvaluating('')).toBe(false);
        });
    });

    describe('isTerminal', () => {
        it('TERMINAL_STATUSES에 포함된 상태들은 true를 반환한다', () => {
            TERMINAL_STATUSES.forEach(status => {
                expect(isTerminal(status)).toBe(true);
            });
        });

        it('그 외의 진행 중/심사 중 상태들은 false를 반환한다', () => {
            expect(isTerminal('ORDER_PRE_SECURED')).toBe(false);
            expect(isTerminal('ORDER_AWAITING_DECISION')).toBe(false);
            expect(isTerminal('ORDER_CONFIRMED')).toBe(false);
            expect(isTerminal('ORDER_PICKED_UP')).toBe(false);
        });

        /**
         * 🔴 **하차 완료는 종결이다** (Phase 8.3 · `TERMINAL_STATUSES` 주석 참조).
         *
         * 이 검사는 예전에 `ORDER_DELIVERED` 를 «진행 중»으로 기대하고 있었다 —
         * 그 시절 값이 그대로 남은 것이다. 그런데 **틀린 채로 아무도 몰랐다**:
         * `shared/src/index.js`(2026-04-09 커밋된 8줄짜리 컴파일 산출물)가 `./index`
         * import 를 가로채 `isTerminal is not a function` 으로 죽어 있었고,
         * 애초에 이 검사를 **부르는 명령이 없었다**(package.json 에 test 스크립트 없음).
         *
         * 2026-08-29 에 산출물을 지우고 게이트에 넣으면서 되살아났다.
         * 하차한 콜을 «아직 실려 있다»고 세면 적재·경로·합짐 필터가 통째로 틀어진다 —
         * `TERMINAL_STATUSES` 주석이 기록한 그 사고다.
         */
        it('🔴 하차 완료(ORDER_DELIVERED)는 종결이다 — 적재에서 빠져야 한다', () => {
            expect(isTerminal('ORDER_DELIVERED')).toBe(true);
        });

        it('undefined나 유효하지 않은 문자열이 들어오면 false를 반환한다', () => {
            expect(isTerminal(undefined)).toBe(false);
            expect(isTerminal('UNKNOWN_STATUS')).toBe(false);
            expect(isTerminal('')).toBe(false);
        });
    });
});

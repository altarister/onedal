import { describe, expect, it } from 'vitest';
import { isExpressForm } from './badges';

/**
 * 🏷️ **급송은 형태 값 «급송» 하나로 가른다**.
 * «보통» · «모름» · 빈칸(null · undefined)은 급송이 아니다 — 서버 isExpress 와 관제웹 «급송» 표시가 같은 답을 본다.
 */
describe('isExpressForm', () => {
    it('형태 «급송» 은 급송이다', () => {
        expect(isExpressForm('급송')).toBe(true);
    });

    it.each([['보통'], ['모름'], [null], [undefined]] as const)('형태 %s 는 급송이 아니다', (orderForm) => {
        expect(isExpressForm(orderForm)).toBe(false);
    });
});

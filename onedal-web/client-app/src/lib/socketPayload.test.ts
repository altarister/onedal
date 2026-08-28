import { describe, it, expect } from 'vitest';
import { orderIdOf } from './socketPayload';

/**
 * 🔴 **같은 뜻인데 모양이 둘이라 한쪽을 흘렸다** (2026-08-29 주석 전수조사에서 발견)
 *
 * 서버는 «이 콜 끝났다»를 두 이벤트로 알리는데 **모양이 다르다** —
 * ```
 * order-confirmed  →  orderId          (문자열)   dispatchEngine:610 · :1498
 * order-canceled   →  { id, status }   (객체)     dispatchEngine:123 · :683 ·
 *                                                 detail:124 · :333 · emergency:135
 * ```
 * `useSystemAlerts` 는 둘을 **같은 핸들러**에 물리고 문자열로만 받았다. 그래서
 * 취소 쪽은 `w.orderId !== {객체}` 가 **언제나 참**이라 경고가 한 번도 안 지워졌다.
 *
 * 🔴 **안전취소 경고가 취소된 뒤에도 화면에 남는 것**이 그 증상이다. 운전 중에 색과
 *    배너만 보고 1~2초에 판단하는 화면에서(규칙 ⑤-3), 끝난 콜의 경고가 남아 있으면
 *    **지금 살아 있는 경고와 구분이 안 된다.**
 *
 * 여기서 모양을 **한 곳으로 모은다** (규칙 ③ — 파생값은 한 곳에서). 서버의 두 모양을
 * 각각 아는 핸들러를 늘리면 새 이벤트가 생길 때마다 같은 실수가 반복된다.
 */
describe('orderIdOf — 서버가 쏘는 두 모양을 한 곳에서 푼다', () => {
    it('문자열로 오면 그대로 (order-confirmed)', () => {
        expect(orderIdOf('ORD-A')).toBe('ORD-A');
    });

    it('🔴 객체로 오면 id 를 꺼낸다 (order-canceled) — 이게 안 돼서 경고가 안 지워졌다', () => {
        expect(orderIdOf({ id: 'ORD-A', status: 'SAFE_CANCEL' })).toBe('ORD-A');
        expect(orderIdOf({ id: 'ORD-B', status: 'ORDER_RELEASED_BY_OFFICE', isManual: true })).toBe('ORD-B');
    });

    it('모르는 모양이면 null — 지어내지 않는다 (규칙 ④)', () => {
        expect(orderIdOf(null)).toBeNull();
        expect(orderIdOf(undefined)).toBeNull();
        expect(orderIdOf({} as any)).toBeNull();
        expect(orderIdOf(42 as any)).toBeNull();
    });

    /**
     * 이 버그의 **증인**을 검사에 박아 둔다. 옛 로직을 그대로 재현해 두면
     * "왜 이 함수가 필요한가"가 코드에 남는다 — 지우면 같은 실수로 돌아간다.
     */
    it('증인 — 옛 로직(문자열만 받음)은 객체 페이로드를 못 걸렀다', () => {
        const warnings = [{ orderId: 'ORD-A' }];
        const oldHandler = (payload: any) => warnings.filter(w => w.orderId !== payload);
        expect(oldHandler('ORD-A')).toHaveLength(0);                          // 확정: 지워졌다
        expect(oldHandler({ id: 'ORD-A', status: 'SAFE_CANCEL' })).toHaveLength(1);  // 취소: 안 지워진다
    });
});

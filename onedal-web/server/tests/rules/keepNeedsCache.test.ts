import { handleDecision } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🧾 **KEEP 은 심사 캐시에 콜이 있을 때만 폰에 보낸다** — 결재 줄에는 있고 캐시에는 없는 순간이면, 폰은 KEEP 을 받는데
 *    서버는 승격을 못 해 둘이 갈라진다. 그 순간을 만드는 길은 지금 없지만(안전쪽 순서), 생기면 폰에 안 보낸다.
 */
const U = 'test-keep-needs-cache';
const io = { to: () => ({ emit: () => {} }) } as any;

describe('KEEP 순서', () => {
    afterEach(() => clearUserSession(U));

    it('캐시에 없으면 결재 줄의 값을 정하지 않는다(폰에 안 감)', async () => {
        const s = getUserSession(U);
        s.pendingDecisions.set('no-cache', { action: null, evaluatedAt: Date.now() });
        const r = await handleDecision(U, 'no-cache', 'ORDER_CONFIRMED', io);
        expect(r.success).toBe(false);
        expect(s.pendingDecisions.get('no-cache')?.action).toBeNull();
    });

    it('대조 — 취소는 캐시가 없어도 폰에 간다(앱이 계약했으면 풀어야 한다)', async () => {
        const s = getUserSession(U);
        s.pendingDecisions.set('no-cache-cancel', { action: null, evaluatedAt: Date.now() });
        await handleDecision(U, 'no-cache-cancel', 'SAFE_CANCEL', io);
        expect(s.pendingDecisions.get('no-cache-cancel')?.action).toBe('CANCEL');
    });
});

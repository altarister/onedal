import { describe, it, expect, vi, beforeEach } from 'vitest';

/* 🧪 소켓은 이벤트별 손잡이를 모으는 흉내 — 부품을 하나도 그리지 않는다(폰 칸이 접혀 빠진 것과 같다) */
const handlers = new Map<string, Array<(p: unknown) => void>>();
vi.mock('../lib/socket', () => ({
    socket: {
        on: (ev: string, h: (p: unknown) => void) => { handlers.set(ev, [...(handlers.get(ev) ?? []), h]); },
        off: () => {},
    },
}));
const sound = { playEmergencyAlarm: vi.fn() };
vi.mock('../lib/soundManager', () => ({ soundManager: sound }));
const fire = (ev: string, p: unknown) => (handlers.get(ev) ?? []).forEach(h => h(p));

/**
 * 🚨 **필터를 펼쳐 폰 칸이 접혀도 사이렌 · 경고가 난다** (D3 P6-01).
 * 듣기가 폰 칸 부품 안에 살면 접히는 동안 놓친다 — 저장소가 앱 전체에서 한 번 듣는다.
 */
describe('alertsStore — 부품 없이도 듣는다', () => {
    beforeEach(() => { sound.playEmergencyAlarm.mockClear(); });

    it('🔴 부품을 그리지 않아도 비상 → 사이렌 한 번 · 목록에 남음', async () => {
        const { ensureAlertsSocketSubscribed, useAlertsStore } = await import('./alertsStore');
        ensureAlertsSocketSubscribed();
        ensureAlertsSocketSubscribed();   // 두 번 불러도 구독은 한 번
        fire('emergency-alert', { timestamp: 't1', deviceId: 'd1' });
        expect(sound.playEmergencyAlarm).toHaveBeenCalledTimes(1);
        expect(useAlertsStore.getState().alerts).toHaveLength(1);
    });

    it('🔴 안전취소 경고는 쌓이고, 그 콜이 취소({id}) · 확정(문자열)되면 지워진다', async () => {
        const { useAlertsStore } = await import('./alertsStore');
        fire('safecancel-warning', { orderId: 'a', deviceId: 'd1' });
        fire('safecancel-warning', { orderId: 'b', deviceId: 'd1' });
        expect(useAlertsStore.getState().warnings.map(w => w.orderId)).toEqual(['b', 'a']);
        fire('order-canceled', { id: 'a', status: 'CANCELED' });
        fire('order-confirmed', 'b');
        expect(useAlertsStore.getState().warnings).toHaveLength(0);
    });
});

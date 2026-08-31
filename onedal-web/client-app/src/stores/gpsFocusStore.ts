import { create } from 'zustand';
import { socket } from '../lib/socket';

/**
 * 🖥️ **근접/도착 포커스 — 구독은 모듈에서 한 번** (화면개편 1단계 · ghostCard 규칙).
 * 훅 안에 socket.on 을 두면 훅을 쓰는 컴포넌트 수만큼 구독이 늘어난다 —
 * judgmentStore 와 같은 패턴으로 여기서 한 번만 건다.
 */
interface GpsFocus { orderId: string; tick: number }
export const useGpsFocusStore = create<{ gpsFocus: GpsFocus | null }>(() => ({ gpsFocus: null }));

let subscribed = false;
export function ensureGpsFocusSubscribed() {
    if (subscribed) return;
    subscribed = true;
    const focus = (d: { orderId?: string }) => {
        if (d?.orderId) useGpsFocusStore.setState({ gpsFocus: { orderId: d.orderId, tick: Date.now() } });
    };
    socket.on('next-stop-approaching', focus);
    socket.on('auto-arrived', focus);
}

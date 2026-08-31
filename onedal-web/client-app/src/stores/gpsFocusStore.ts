import { create } from 'zustand';
import { socket } from '../lib/socket';

/**
 * 🖥️ **근접/도착 포커스 — 구독은 모듈에서 한 번** (화면개편 1단계 · ghostCard 규칙).
 * 훅 안에 socket.on 을 두면 훅을 쓰는 컴포넌트 수만큼 구독이 늘어난다 —
 * judgmentStore 와 같은 패턴으로 여기서 한 번만 건다.
 */
/**
 * 🔴 **kind 는 «무엇이 일어났나»다 — «무엇을 하고 싶나»가 아니다** (0831 리뷰).
 *    KEEP·마커 탭이 덱만 옮기려고 `arrive` 를 빌려 쓰는 바람에, 도착 효과가 그걸
 *    진짜 도착으로 읽어 규칙을 두 번 먹이고 로그에 «도착»이라는 거짓 사유를 남겼다.
 *      approach — 근접 예고 (덱만 따라간다)
 *      arrive   — 정거장 도착 (시트가 마중 나간다 · S7)
 *      focus    — 사람이 골랐다 (덱만 옮긴다 · KEEP·탭)
 */
interface GpsFocus { orderId: string; tick: number; kind: 'approach' | 'arrive' | 'focus' }
export const useGpsFocusStore = create<{ gpsFocus: GpsFocus | null }>(() => ({ gpsFocus: null }));

let subscribed = false;
export function ensureGpsFocusSubscribed() {
    if (subscribed) return;
    subscribed = true;
    // 예고(2km)와 도착은 다른 일이다 — 예고는 카드만 따라가고, 도착(S7)은 시트가 마중 나간다
    const focus = (kind: 'approach' | 'arrive') => (d: { orderId?: string }) => {
        if (d?.orderId) useGpsFocusStore.setState({ gpsFocus: { orderId: d.orderId, tick: Date.now(), kind } });
    };
    socket.on('next-stop-approaching', focus('approach'));
    socket.on('auto-arrived', focus('arrive'));
}

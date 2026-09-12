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
/**
 * 🪜 **focus 는 «콜»이 아니라 «콜과 단계»다** (v23 Ⅳ · 화면규칙 S13·S15 · 2026-09-12).
 *
 * v23 원 명세: *"focus={그 콜, **그 단계**}"* · *"stage(시트높이) · **focus(콜·단계)** ·
 * 파생 제조소 **세 상태를 Dashboard 가 들고 모두가 바라봄**"*.
 *
 * 🔴 **«그 단계»가 여기 없어서 오늘 증상이 났다.** 서버는 `auto-arrived` 에 `stopType` 을
 *    싣는데 여기서 **버리고 있었다** — 그래서 도착해도 시트가 «어느 단계를 열지» 몰랐고,
 *    기사님이 할 일이 없어 손으로 내리셨다. 그 손이 30초 유예를 걸어 **다음 도착 마중까지
 *    먹었다** (기사님 실측: 도착 여섯 중 셋만 마중).
 */
interface GpsFocus {
    orderId: string;
    tick: number;
    kind: 'approach' | 'arrive' | 'focus';
    /** 🪜 그 콜의 **어느 쪽**인가 — 상차 단계인가 하차 단계인가 */
    stopType?: 'pickup' | 'dropoff';
}
export const useGpsFocusStore = create<{ gpsFocus: GpsFocus | null }>(() => ({ gpsFocus: null }));

let subscribed = false;
export function ensureGpsFocusSubscribed() {
    if (subscribed) return;
    subscribed = true;
    // 예고(2km)와 도착은 다른 일이다 — 예고는 카드만 따라가고, 도착(S7)은 시트가 마중 나간다
    const focus = (kind: 'approach' | 'arrive') => (d: { orderId?: string; stopType?: 'pickup' | 'dropoff' }) => {
        /* 🪜 서버가 실어 보낸 «그 단계»를 그대로 든다 — 여기서 지어내지 않는다 (규칙 ④) */
        if (d?.orderId) useGpsFocusStore.setState({
            gpsFocus: { orderId: d.orderId, tick: Date.now(), kind, stopType: d.stopType } });
    };
    socket.on('next-stop-approaching', focus('approach'));
    socket.on('auto-arrived', focus('arrive'));
}

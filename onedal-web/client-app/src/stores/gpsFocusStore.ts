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
/**
 * 🏁 **방금 도착한 정거장** — 시트가 마중 나갈 자리 (v23 Ⅲ-S7 · 화면규칙 S13).
 *
 * 🔴 **`gpsFocus` 와 답하는 질문이 다르다 — 한 칸에 넣지 않는다** (규칙 ⑤-4 ⑤).
 *      · `gpsFocus` «지금 보는 콜»   — 덱이 따라간다 (근접·탭·KEEP 이 바꾼다)
 *      · `arrival`  «방금 도착했다»  — 시트가 마중 나간다 (도착만 쓴다)
 *    2026-08-31 에 한 칸으로 겸했다가 **도착 여섯 중 시트가 둘만 올라갔다** —
 *    도착 직후 다음 정거장 근접(approach)이 같은 칸을 **덮어써** 시트가 읽기도 전에
 *    사라졌다. 그래서 그때는 «소켓을 따로 듣는» 것으로 갈랐는데, 그러면 **듣는 곳이
 *    둘**이 되어 이번엔 «도착이 가리킨 콜»과 «시트가 연 콜»이 갈라졌다 (2026-09-12).
 *    🟢 **칸을 가르되 듣는 곳은 하나** — 그것이 둘 다 푸는 자리다.
 */
export interface Arrival {
    orderId: string;
    stopType?: 'pickup' | 'dropoff';
    tick: number;
}

export const useGpsFocusStore = create<{
    gpsFocus: GpsFocus | null;
    arrival: Arrival | null;
}>(() => ({ gpsFocus: null, arrival: null }));

let subscribed = false;
/**
 * 📡 **서버가 내는 정거장 사건을 듣는 곳 — 여기 하나다** (기사님 지시 2026-09-12).
 *
 * 기사님: *"gps 관리하는 거 하나 만들고 경로 관리하는 거 만들고 gps 가 이동하면
 * 경로 관리하는 것이 이벤트 발생 … **지금 그걸 각자 하고 있어서 문제** 같은데"*
 *
 * 🔴 예전엔 `auto-arrived` 를 **세 곳**이 각자 들었다 (이 스토어 · `StageView` · `Dashboard`).
 *    한 사건에 세 판단이 나오니 «덱이 가리킨 콜»과 «시트가 연 콜»이 갈라졌다.
 *    지금은 여기서만 듣고 **화면들은 이 값을 본다** — 갈라질 자리가 없다.
 *
 * 🔴 **좌표가 실 GPS 인지 모의인지 여기서는 묻지 않는다** (기사님: *"그것도 모두 몰라도
 *    될 것 같은데"*). 그 판단은 **좌표를 고르는 곳**(`useMasterGps`·서버 `originOf`)에
 *    갇혀 있고, 여기부터 아래는 **사건만** 흐른다.
 */
export function ensureGpsFocusSubscribed() {
    if (subscribed) return;
    subscribed = true;
    // 예고(2km)와 도착은 다른 일이다 — 예고는 카드만 따라가고, 도착(S7)은 시트가 마중 나간다
    const focus = (kind: 'approach' | 'arrive') => (d: { orderId?: string; stopType?: 'pickup' | 'dropoff' }) => {
        if (!d?.orderId) return;
        /* 🪜 서버가 실어 보낸 «그 단계»를 그대로 든다 — 여기서 지어내지 않는다 (규칙 ④) */
        const now = Date.now();
        useGpsFocusStore.setState({
            gpsFocus: { orderId: d.orderId, tick: now, kind, stopType: d.stopType },
            /* 🏁 도착일 때만 «마중해야 할 것»을 따로 남긴다 — 근접이 덮지 못한다 */
            ...(kind === 'arrive' ? { arrival: { orderId: d.orderId, stopType: d.stopType, tick: now } } : {}),
        });
    };
    socket.on('next-stop-approaching', focus('approach'));
    socket.on('auto-arrived', focus('arrive'));
}

import { create } from 'zustand';
import { socket } from '../lib/socket';

/**
 * 📍 **서버가 아는 «내 자리» — 화면이 제 손으로 정하지 않는다**.
 *
 * ── 왜 생겼나 ──
 * 지도가 위치를 **혼자 정하고 있었다** — 클라 GPS 가 오면 그것, 없으면 `/settings` 의 집.
 * 서버의 `driverLocation` 은 **한 번도 안 봤다.** 그래서 PC 브라우저처럼 GPS 가 없는
 * 화면은 집을 그렸고, 서버가 아는 자리와 **17.6km 어긋난 채** 도는 판이 실제로 있었다
 * (실측: 서버 `home` 폴백 127.294/37.377 ↔ 마지막 궤적 127.400/37.242).
 *
 * 🔴 **두 값을 따로 든다 — 한 값이 두 질문에 답하지 않게** (규칙 ⑤-4 ⑤).
 *   · `myPosition`  «내가 지금 어디 있나» — 낡아도 **마지막 자리**, 모르면 `null`
 *   · `routeOrigin` «경로를 어디서부터 짰나» — 낡으면 **집**이다 (그래야 계산이 돈다)
 *   지도 마커·콜 그물은 **앞엣것**을 쓴다 (기사님 확정).
 *   뒤엣것은 «왜 경로가 거기서 시작하나»를 **설명하는** 값이다.
 *
 * 🔴 **둘은 오는 길이 다르다 — 시점이 다르기 때문이다** (규칙 ⑤-4 ③).
 *   · `myPosition`  — `driver-position` **가벼운 이벤트**로 1초마다. 여기서 듣는다
 *   · `routeOrigin` — `sync-active-orders` 봉투로, **정거장 순서와 한 벌**. `useOrderEngine` 이 넣어 준다
 *
 *   ⚠️ 처음엔 둘 다 봉투에 얹었다. **틀렸다** — 봉투는 «콜이 바뀔 때» 나가는데 위치는
 *      1초마다 바뀐다. 봉투가 올 때마다 **옛 좌표가 내 점을 뒤로 당겨** 모의 주행이
 *      멈춘 것처럼 보였다 (기사님 실측 2026-09-12).
 *   🔴 **봉투를 1초마다 보내는 길은 막혀 있다** — 초당 474KB 사고 자리다. 그래서 위치만
 *      나르는 길을 따로 냈다 (한 번에 100바이트도 안 된다).
 * 🔴 **구독은 여기 한 곳뿐이다** — `driver-position` 을 다른 데서 또 들으면
 *    «세 곳이 각자 듣던» 사고가 되살아난다 (`gpsFocusStore` 주석).
 */
export interface DriverPosition {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** 기점으로 쓰기엔 낡았나 (서버 문턱 5분) */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

export interface RouteOrigin {
    x: number; y: number;
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 «집 주소로 대신했다» — 화면이 그 사실을 말할 수 있게 */
    isFallback: boolean;
}

export const useDriverPositionStore = create<{
    myPosition: DriverPosition | null;
    routeOrigin: RouteOrigin | null;
}>(() => ({ myPosition: null, routeOrigin: null }));

/** 🧭 `sync-active-orders` 가 올 때 — **경로 기점만** (정거장 순서와 한 벌) */
export function setRouteOrigin(routeOrigin: RouteOrigin | null) {
    useDriverPositionStore.setState({ routeOrigin: routeOrigin ?? null });
}

let subscribed = false;
/** 📍 위치는 제 길로 온다 — 구독은 모듈에서 한 번 (`gpsFocusStore` 와 같은 패턴) */
export function ensureDriverPositionSubscribed() {
    if (subscribed) return;
    subscribed = true;
    socket.on('driver-position', (p: DriverPosition) => {
        if (p?.x == null || p?.y == null) return;
        useDriverPositionStore.setState({ myPosition: p });
    });
}

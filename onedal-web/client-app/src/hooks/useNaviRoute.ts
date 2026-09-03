import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';
import type { RouteStopInfo, SecuredOrder } from '@onedal/shared';

/**
 * 🧭 **내비 화면이 경로를 받는 자리 — 읽기만 한다** (2026-09-03 신설).
 *
 * 🔴 **`useOrderEngine` 을 쓰면 안 된다.** 그 훅은 소켓 구독을 **자기가** 들고 있어서,
 *    두 화면이 함께 쓰면 구독이 두 벌이 된다 (`ghostCard.test.ts` 의
 *    «여러 컴포넌트가 쓰는 훅은 socket.on 을 갖지 않는다» 가 잡는다).
 *    그래서 내비 화면 **하나만** 쓰는 얇은 훅을 따로 둔다.
 *
 * 🔴 **결재도, 필터도, 위치 전송도 하지 않는다.** 이 화면이 하는 일은
 *    «서버가 정한 순서를 받아 카카오맵 링크 하나를 그리는 것» 뿐이다.
 *    관제는 관제폰(S23)에 있고, 이 화면은 개인 폰(아이폰)에서 열린다.
 */
export function useNaviRoute() {
    const [routeStops, setRouteStops] = useState<RouteStopInfo[]>([]);
    const [calls, setCalls] = useState<SecuredOrder[]>([]);
    const [isConnected, setIsConnected] = useState(socket.connected);

    useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);
        /**
         * 서버가 «바뀌었을 때만» 보낸다 — 도착했다는 것 자체가 «바뀌었다»는 뜻이라
         * 여기서는 비교 없이 그냥 넣는다 (`useOrderEngine` 과 같은 이유).
         * ⚠️ 옛 서버는 배열로 보낸다 — 그때는 순서를 모르므로 **아무것도 안 그린다**
         *    (틀린 순서로 내비를 켜는 것보다 «없다»가 낫다 · 규칙 ④).
         */
        const onSync = (payload: any) => {
            if (Array.isArray(payload)) { setRouteStops([]); return; }
            setCalls(payload?.active ?? []);
            setRouteStops(payload?.routeStops ?? []);
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('sync-active-orders', onSync);
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('sync-active-orders', onSync);
        };
    }, []);

    return { routeStops, calls, isConnected };
}

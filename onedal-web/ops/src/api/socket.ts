import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { token } from './client';
import { createListeners } from './listeners';

/**
 * 🔔 **운영센터 소켓 — 서버 `/ops` 이름공간 · 신호만 듣는다** (reviews/29 5단계 · onedal-1f «KEEP 직후 바로 통화»).
 *    기사 관제웹 소켓 길(세션 충돌 · 기사 세션 부트스트랩)과 다른 길이다 — 서버는 허락(ops_allowed_at)이 있으면 admin_room 에만 넣는다.
 *    자료는 소켓으로 받지 않는다: `ops-calls-changed { memberId }` 가 오면 쪽이 GET 으로 다시 읽는다(요청마다 requireOps 가 허락을 본다).
 *    끊기면 socket.io 가 알아서 다시 잇고, 그동안 쪽은 30초마다 다시 읽는다(물러설 자리). 로그인 뒤(OpsGate)에 한 번 만들고 나갈 때 닫는다.
 *    ⚠️ 관제웹 `lib/socket.ts` 를 공통으로 못 꺼낸 까닭: 그쪽은 세션 id · 기기 정보 · 앱 주소 저장소에 얽혀 있고 공통은 io() 한 줄뿐이라 ui/ 가 socket.io-client 를 들고 갈 만큼이 못 된다.
 */
const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ?? '';

let socket: Socket | null = null;
const connectedChanged = createListeners();

export function connectSignal(): void {
    if (socket) return;
    socket = io(`${base}/ops`, { transports: ['websocket'], auth: cb => cb({ token: token() }) });
    socket.on('connect', () => connectedChanged.notify());
    socket.on('disconnect', () => connectedChanged.notify());
}

export function disconnectSignal(): void {
    socket?.close();
    socket = null;
    connectedChanged.notify();
}

export function signalConnected(): boolean { return !!socket?.connected; }

/** 연결 사실 하나 — 틀의 «● 신호 연결 / ○ 신호 끊김» · 쪽의 30초 물러서기가 읽는다 */
export function useSignalConnected(): boolean {
    const [on, setOn] = useState(signalConnected);
    useEffect(() => connectedChanged.add(() => setOn(signalConnected())), []);
    return on;
}

/** «콜이 바뀌었다» 신호를 듣는다(이벤트 이름은 글자 그대로 — audit:socket 이 글자로 센다) — 다시 이어졌을 때도 한 번 부른다(끊긴 사이 놓친 것을 다시 읽게) */
export function useCallsChanged(handler: (payload: { memberId: string }) => void): void {
    useEffect(() => {
        if (!socket) return;
        const s = socket;
        const onEvent = (p: { memberId: string }) => handler(p);
        const onReconnect = () => handler({ memberId: '' });
        socket.on('ops-calls-changed', onEvent);   // 변수 이름 socket 그대로 — audit:socket 이 `socket.on('…')` 글자로 센다
        socket.on('connect', onReconnect);
        return () => { s.off('ops-calls-changed', onEvent); s.off('connect', onReconnect); };
    }, [handler]);
}

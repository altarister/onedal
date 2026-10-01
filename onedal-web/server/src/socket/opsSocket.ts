import type { Server, Socket, Namespace } from "socket.io";
import { authSocket } from "./authSocket";
import { opsAllowed } from "../core/opsAccess";
import { slog } from "../utils/fileLogger";

/**
 * 🏢 **운영센터 소켓 — 이름공간 /ops** (reviews/29 5단계 · onedal-1f «가»).
 * socket.io 가 연결 처리를 관제웹과 따로 부른다 — 관제웹의 세션 충돌 · 화면 세션 · 기사 세션 부트스트랩이 이 소켓에 닿을 길이 없다
 * (기사님이 운행 중 관제웹을 띄운 채 운영센터를 열어도 관제웹이 안 끊긴다 · 와이프 계정에 기사 세션이 안 생긴다).
 * - 들어오는 판단: 같은 JWT 검사(authSocket) → 운영센터 허락(opsAllowed) — HTTP requireOps 와 같은 칸
 * - 연결되면 관리자 방(admin_room)에만 든다 · 이벤트를 받지 않는다 · 방으로 가는 것은 «ops-calls-changed { memberId }» 신호뿐(자료 없음)
 * - 허락을 거두는 문이 지금은 없다(기사님 손 · sqlite) — 그래서 30초마다 훑어 허락이 사라진 소켓을 끊는다
 */
export const OPS_SWEEP_MS = 30_000;

export function opsGate(socket: Socket, next: (err?: Error) => void): void {
    const id = socket.data?.user?.id as string | undefined;
    if (!opsAllowed(id)) {
        slog('경고', `🚫 [운영센터 소켓] 허락 없는 계정 — ${id ?? '?'} 거절`);
        return next(new Error('운영센터 허락이 없는 계정'));
    }
    next();
}

export function onOpsConnection(socket: Socket): void {
    socket.join("admin_room");
    slog('통신', `🏢 [운영센터 소켓] ${socket.data?.user?.name ?? socket.data?.user?.id} 연결 — 관리자 방`);
}

export function sweepOpsSockets(nsp: Pick<Namespace, 'sockets'>): void {
    for (const s of nsp.sockets.values()) {
        if (!opsAllowed(s.data?.user?.id)) {
            slog('통신', `🏢 [운영센터 소켓] ${s.data?.user?.id} 허락이 사라져 끊음`);
            s.disconnect(true);
        }
    }
}

export function registerOpsNamespace(io: Server): void {
    const nsp = io.of("/ops");
    nsp.use(authSocket);
    nsp.use(opsGate);
    nsp.on("connection", onOpsConnection);
    setInterval(() => sweepOpsSockets(nsp), OPS_SWEEP_MS).unref();
}

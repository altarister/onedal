import { Server as SocketIOServer } from "socket.io";

// 글로벌 Socket.io 인스턴스 (API Route에서 접근 가능)
declare global {
    // eslint-disable-next-line no-var
    var _io: SocketIOServer | undefined;
}

export function getIO(): SocketIOServer | undefined {
    return global._io;
}

export function setIO(io: SocketIOServer): void {
    global._io = io;
}

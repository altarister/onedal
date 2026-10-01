import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../config/env";
import { isKnownUser } from "../middlewares/authMiddleware";
import { slog } from "../utils/fileLogger";

/**
 * 🔑 **소켓 JWT 핸드셰이크 인증 — 한 곳** — 관제웹 소켓(io.use)과 운영센터 소켓(/ops 이름공간)이 같이 쓴다.
 */
export function authSocket(socket: Socket, next: (err?: Error) => void): void {

    const token = socket.handshake.auth?.token 
                || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
        slog('경고', "❌ [Socket] 인증 토큰 누락 접속 거부");
        return next(new Error('인증 토큰 없음'));
    }
    
    try {
        const decoded = jwt.verify(token, jwtSecret()) as any;

        /**
         * 🔴 **서명은 «어느 서버가 발급했나»를 구분하지 못한다** (기사님 실측).
         *
         * 로컬과 라이브가 같은 JWT 비밀을 쓰므로 라이브 토큰이 로컬 서명 검증을 통과한다.
         * 그대로 들이면 `getUserSession` 이 **DB 에 없는 유저의 메모리 세션**을 만들고,
         * 소켓이 끊겨도 그 세션은 남아 1초 인터벌이 영원히 그것까지 돈다.
         *
         * 판단은 `authMiddleware.isKnownUser` 하나뿐이다 — 여기서 따로 조회하지 않는다 (규칙 ③).
         */
        if (!isKnownUser(decoded?.id)) {
            slog('경고', `❌ [Socket] 이 서버에 없는 유저의 토큰 — ${decoded?.id} (${decoded?.email})`);
            return next(new Error('이 서버에 등록되지 않은 계정'));
        }

        socket.data.user = decoded; // { id, email, name, role }
        next();
    } catch (err) {
        slog('경고', "❌ [Socket] 토큰 검증 실패:", err);
        next(new Error('토큰 만료 또는 위조'));
    }
}

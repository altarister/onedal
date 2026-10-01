import type { Socket } from "socket.io";
import { DEVICE_LINK_ERRORS } from "@onedal/shared";
import { accountGateOf } from "../core/accountGate";
import { slog } from "../utils/fileLogger";

/**
 * 🚧 **막힌 계정은 관제웹 소켓에 붙지 못한다** (onedal-69 «가» · 다른 LLM 리뷰 ⑤) — authSocket(JWT) 다음, 관제웹 이름공간에만.
 *    판단은 폰 문 · 폰 연결과 같은 accountGateOf — 승인 전 · 탈퇴 · 즉시 정지는 거절 · «끝난 뒤» 정지는 진행 중 콜이 있는 그날까지 통과.
 *    🔴 관제웹은 로그인하면 계정 상태와 상관없이 소켓을 연다 — 승인 대기 · 멈춤 화면에서 관제 화면으로 넘어갈 때
 *       관제웹이 다시 연다(socket.io 는 미들웨어 거절을 스스로 다시 시도하지 않는다).
 *    운영센터 소켓(/ops)은 opsGate 가 따로 지킨다.
 */
export function webAccountGate(socket: Socket, next: (err?: Error) => void): void {
    const id = socket.data?.user?.id as string | undefined;
    if (!id || accountGateOf(id).blocked) {
        slog('통신', `🚫 [계정 막힘] ${id ?? '?'} — 관제웹 소켓 거절 (${DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED})`);
        return next(new Error(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED));
    }
    next();
}

import type { Server, Socket } from "socket.io";
import { SUPPLY_EVENTS, SUPPLY_NAMESPACE } from "@onedal/shared";
import type { PhoneDecisionAck, PhoneStatus } from "@onedal/shared";
import { applyPhoneStatus } from "../state/phoneStatus";
import { authSocket } from "./authSocket";
import { webAccountGate } from "./webAccountGate";
import { getUserSession } from "../state/userSessionStore";
import { flushSupply } from "../state/phoneSupply";
import { ackDecision, unackedPhoneDecisions } from "../state/decisions";
import { logContext, whoLabel } from "../utils/logContext";
import { slog } from "../utils/fileLogger";
import { deviceLabelOf } from "../core/deviceAuth";

/**
 * 📡 **관제앱 공급 소켓 — 이름공간 /supply** (reviews/50 ①-1 · 관제 리뷰).
 * 관제앱 네이티브 서비스가 붙는다 — 화면을 꺼도 끊기지 않는 연결로 «폰에 갈 값»을 받아 블루투스로 스캔폰에 넘긴다.
 * socket.io 가 연결 처리를 관제웹과 따로 부른다 — 세션 충돌 · 창 넘겨주기 · 기사 세션 부트스트랩이 이 소켓에 닿을 길이 없고,
 * «결재할 관제웹이 있다»(`activeWebSession`)도 이 소켓을 셈하지 않는다(reviews/50 ④ 나).
 * - 들어오는 판단: 같은 JWT 검사(authSocket) → 관제웹과 같은 계정 막힘(webAccountGate)
 * - 붙으면 기사님 방에 들고 공급 값을 한 번 + «받았음» 안 온 결재를 다시 보낸다(원달앱은 같은 콜 결재를 한 번만 실행)
 * - 받는 것은 `phone-decision-ack` 하나 — 그 기사님 세션만 치우므로 남의 콜 번호가 와도 할 일이 없다
 */
export function onSupplyConnection(io: Server, socket: Socket): void {
    const userId = socket.data.user.id as string;
    socket.join(userId);
    slog('통신', `📡 [공급 소켓] ${socket.data.user.name ?? userId} 관제앱 연결`);
    flushSupply(io, userId, true);
    for (const d of unackedPhoneDecisions(getUserSession(userId))) socket.emit(SUPPLY_EVENTS.decision, d);

    socket.on(SUPPLY_EVENTS.decisionAck, (ack: PhoneDecisionAck) => logContext.run({ who: whoLabel(socket.data.user?.name, userId), userId }, () => {
        if (typeof ack?.orderId !== 'string') return;
        ackDecision(io, getUserSession(userId), userId, ack.orderId, `공급 소켓 · ${deviceLabelOf(ack.deviceId)}`);
    }));
    /* 📶 블루투스로만 아는 폰 사실 — 그 기사님 등록 폰만 받는다 (state/phoneStatus) */
    socket.on(SUPPLY_EVENTS.status, (s: PhoneStatus) => logContext.run({ who: whoLabel(socket.data.user?.name, userId), userId }, () => { applyPhoneStatus(userId, s); }));
    socket.on("disconnect", (reason) => slog('통신', `📡 [공급 소켓] ${socket.data.user.name ?? userId} 관제앱 끊김 (${reason})`));
}

export function registerSupplyNamespace(io: Server): void {
    const nsp = io.of(SUPPLY_NAMESPACE);
    nsp.use(authSocket);
    nsp.use(webAccountGate);
    nsp.on("connection", (socket: Socket) => logContext.run({ who: whoLabel(socket.data.user?.name, socket.data.user?.id), userId: socket.data.user?.id }, () => onSupplyConnection(io, socket)));
}

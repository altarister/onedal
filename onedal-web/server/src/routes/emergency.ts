/**
 * POST /api/emergency
 * 
 * Safety Mode V3: 앱폰 비상 보고 엔드포인트
 * 
 * 앱폰이 아래 상황을 감지하면 이 엔드포인트를 호출합니다:
 *   - AUTO_CANCEL: 30초 타임아웃으로 앱이 스스로 취소함
 *   - CANCEL_EXPIRED: "시간이 지나 취소할 수 없습니다" 팝업 발생
 *   - UNKNOWN_SCREEN: 알 수 없는 화면에 빠짐
 *   - BUTTON_NOT_FOUND: 버튼(닫기/취소)을 찾을 수 없음
 *   - APP_CRASH: 앱 비정상 종료 후 재시작
 * 
 * 서버 처리:
 *   1. pendingDecisions 큐에서 해당 orderId 삭제 및 안전취소 기다림 해제(cancelOrderWaits)
 *   2. pendingOrdersData·deviceEvaluatingMap 에서 해당 orderId 정리
 *   3. 취소 카운트 증가 (countCancel — 세는 규칙은 그 한 곳에 있다)
 *   4. 잡아 둔 콜이면 ORDER_RELEASED_BY_OFFICE 로 (메모리+DB), 그 뒤
 *      · 남은 활성 콜이 없으면 → 필터를 첫짐(STANDBY·WAITING)으로 복원
 *      · 남아 있으면      → 경로 재계산 (recalculateActiveKakaoRoute)
 *   5. 관제탑에 emergency-alert · order-canceled emit
 *
 * ⚠️ 4번의 기준은 «남은 활성 콜이 있는가» 하나다.
 *
 * 바깥 일을 하는 함수: POST / (세션 · 장부(DB) · 소켓 · 기다림 · 셈 · 로그) (가리킨 콜 · 알림 셈 emergencyTargetFrom · emergencyAlertFrom 은 값만 받는다)
 */

import { Router } from "express";
import type { EmergencyReport } from "@onedal/shared";
import { isTerminal } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { cancelOrderWaits, cancelWait } from "../state/waits";
import { updateActiveFilter } from "../state/filterManager";
import { OrderRepository } from "../repositories/OrderRepository";
import { takeReserved } from "../services/reservedOrders";
import { countCancel } from "../core/cancelCount";
import { forceCancelEvaluatingOrder } from "../services/dispatchEngine";
import { slog } from "../utils/fileLogger";
import { authDevice, deviceTokenOf, deviceLabelOf } from "../core/deviceAuth";
import type { EmergencyAlert } from "@onedal/shared";

const router = Router();

/** 🔍 비상 보고가 가리키는 콜 — 값만 받는 셈 (보고의 콜 · 심사 중 콜들 · 보고한 폰). 콜이 비었거나 «unknown» 이면 그 폰이 잡은 심사 중 콜로 */
export function emergencyTargetFrom(orderId: string, pending: Iterable<[string, { capturedDeviceId?: string }]>, deviceId: string): string {
    if (orderId && orderId !== "unknown") return orderId;
    for (const [id, order] of pending) {
        if (order.capturedDeviceId === deviceId) return id;
    }
    return orderId;
}

/** 🚨 관제웹에 갈 비상 알림 — 값만 받는 셈 (보고 · 가리킨 콜 · 지금 시각) */
export function emergencyAlertFrom(report: EmergencyReport, orderId: string, nowIso: string, keepLost = false): EmergencyAlert {
    const alert: EmergencyAlert = {
        deviceId: report.deviceId,
        orderId,
        reason: report.reason,
        screenContext: report.screenContext,
        screenText: report.screenText?.substring(0, 300),
        timestamp: report.timestamp || nowIso,
        ...(keepLost ? { keepLost: true } : {}),
        ...(report.targetApp ? { targetApp: report.targetApp } : {}),
    };
    return alert;
}

router.post("/", async (req, res) => {
    try {
        const report = req.body as EmergencyReport;
        const { deviceId, orderId, reason, screenContext, screenText } = report;

        slog('경고', `\n🚨🚨🚨 [EMERGENCY] 비상 보고 수신 🚨🚨🚨`);
        slog('경고', `   기기: ${deviceLabelOf(deviceId)}`);
        slog('경고', `   오더: ${orderId}`);
        slog('경고', `   사유: ${reason}`);
        slog('경고', `   화면: ${screenContext}`);
        slog('경고', `   텍스트: ${screenText?.substring(0, 100)}...`);

        /* 🔑 연결 안 된 폰 · 틀린 토큰은 거절 — 가짜 기사로 받지 않는다 (core/deviceAuth) */
        const auth = authDevice(deviceId, deviceTokenOf(req));
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const userId = auth.userId;
        
        const session = getUserSession(userId);

        const targetOrderId = emergencyTargetFrom(orderId, session.pendingOrdersData.entries(), deviceId);
        if (targetOrderId !== orderId) slog('경고', `   🔍 잃어버린 orderId 역추적 성공: ${targetOrderId}`);
        /* 📮 원달앱 보고가 왔다(눌렀음이든 못 눌렀음이든) — «원달앱 보고 없음» 기다림은 여기 한 곳에서 끝난다 (detail.ts noreport_ · 38 F36) */
        cancelWait(session, `noreport_${targetOrderId}`, '원달앱 보고 옴');

        const io = req.app.get("io");

        /**
         * 🛑 **앱이 취소를 못 눌렀으면 계약이 남아 있다** — 세지 않고(배차망 취소가 아니다) 콜 · 결재 줄을 그대로 두고 관제웹에 알리기만 한다.
         *    가르는 것은 까닭 이름이 아니라 «눌렀나»(`cancelPressed`) 하나 · 칸이 없으면(옛 원달앱) 아래 옛 길 그대로.
         */
        /* ✅ 이 콜에 내려간 결재가 KEEP 인가 — 서버가 아는 사실 하나(결재 줄 · 운행 · 예약). KEEP 뒤에도 심사 캐시는 남으니 캐시로 가르지 않는다 (38 F36) */
        const kept = session.pendingDecisions.get(targetOrderId)?.action === 'KEEP'
            || [...session.myOrders, ...session.reservedOrders].some(c => c.id === targetOrderId && c.status === 'ORDER_CONFIRMED');

        if (report.cancelPressed === false) {
            /* ⚠️ «취소를 못 눌렀다»는 내려간 결재가 취소였을 때만 — KEEP 의 «닫기»를 못 누른 것은 계약이 남는 것이 맞다 */
            slog('경고', `   🛑 [${kept ? '닫기 못 누름' : '취소 못 누름'}] ${targetOrderId} — 계약이 남아 있다 · 세지 않고 콜을 그대로 둔다 (까닭: ${reason})`);
            if (io) io.to(userId).emit("emergency-alert", { ...emergencyAlertFrom(report, targetOrderId, new Date().toISOString()), ...(kept ? {} : { cancelPressed: false as const }) });
            return res.json({ success: true, message: "비상 보고 수신 — 계약이 남아 있어 콜을 그대로 둔다", clearedOrderId: null });
        }

        /**
         * ⏱️ **KEEP 한 콜을 폰이 결재를 못 받아 취소했나** — «서버가 이 콜을 KEEP 해 운행 · 예약에 올려 두었나» 사실 하나로 가른다(40 S2-1).
         *    결재 줄로 가르면 늦게 온 보고(원달앱 인터넷이 늦게 돌아옴)를 놓친다 — 시한 끝 KEEP 방어가 줄을 먼저 지운다.
         */
        const keptCall = session.myOrders.find(c => c.id === targetOrderId) ?? session.reservedOrders.find(c => c.id === targetOrderId);
        /**
         * 🔁 **이미 끝낸 콜에 다시 온 보고는 그대로 둔다** (40 S2-3) — 원달앱은 «못 보냈다»고 본 보고(닿고 응답만 잃음)를 다시 보낸다.
         *    다시 타면 첫 보고가 적은 안전취소를 «방출(사무실)»로 덮고 경보 · 취소 신호가 한 번 더 간다.
         */
        /* 📒 세션에 없으면 장부를 본다 — 서버가 다시 떠 세션 셈 · 운행 목록이 비어도 같은 사실(장부의 끝남)로 막는다(인성은 취소 10번마다 페널티) */
        const endedStatus = keptCall ? keptCall.status : (session.pendingOrdersData.has(targetOrderId) ? null : OrderRepository.statusOf(targetOrderId, userId));
        if (endedStatus && isTerminal(endedStatus)) {
            slog('경고', `   🔁 [다시 온 비상 보고] ${targetOrderId} — 이미 끝난 콜(${endedStatus}) · 상태 · 경보 그대로`);
            return res.json({ success: true, message: "이미 끝난 콜 — 다시 온 비상 보고", clearedOrderId: null });
        }
        const keepLost = report.reason === 'AUTO_CANCEL' && report.cancelPressed === true && keptCall?.status === 'ORDER_CONFIRMED';
        const endStatus = keepLost ? 'SAFE_CANCEL' : 'ORDER_RELEASED_BY_OFFICE';
        if (keepLost) slog('경고', `   ⏱️ [KEEP 못 감] ${targetOrderId} — KEEP 한 콜을 원달앱이 결재를 못 받아 취소함 · 안전취소로 적는다`);

        /**
         * 📲 **원달앱이 심사 중(KEEP 안 된) 콜의 «취소»를 실제로 눌렀다** (38 F36) — KEEP 된 콜의 자동 취소는 아래 «KEEP 못 감» 길 — 서버는 시한에 스스로 세지 않고 이 보고를 기다린다(`detail.ts` WAIT_APP_REPORT).
         *    장부 SAFE_CANCEL · 캐시 · 기기 짝 · order-canceled · 셈 한 번은 forceCancelEvaluatingOrder 한 곳이 한다 — 다시 온 보고는 위 «이미 끝난 콜»이 막는다.
         */
        if (report.cancelPressed === true && !kept && session.pendingOrdersData.has(targetOrderId)) {
            slog('경고', `   📲 [원달앱이 취소 누름] ${targetOrderId} — 안전취소로 적고 한 번 센다`);
            forceCancelEvaluatingOrder(userId, targetOrderId, io, 'APP_PRESSED');
            if (io) io.to(userId).emit("emergency-alert", emergencyAlertFrom(report, targetOrderId, new Date().toISOString()));   // 🔔 지금처럼 사이렌 · 빨간 줄은 루틴이라 안 뜸
            return res.json({ success: true, message: "원달앱이 취소를 눌렀다 — 안전취소로 적음", clearedOrderId: targetOrderId });
        }

        if (session.pendingDecisions.has(targetOrderId)) {
            session.pendingDecisions.delete(targetOrderId);
            slog('경고', `   ✅ 결재 큐(pendingDecisions) 삭제 완료`);
        }

        /* 👀🐥 미리보기 · 체험 딱지는 캐시를 지우기 전에 뽑는다 — 지운 뒤 세면 딱지를 못 봐 안 잡은 콜 · 체험 콜을 취소로 센다 (forceCancel 과 같은 규칙) */
        const wasPreview = !!(session.pendingOrdersData.get(targetOrderId) as any)?.isPreview;
        const wasSimulated = !!(session.pendingOrdersData.get(targetOrderId) as any)?.isSimulated;

        cancelOrderWaits(session, targetOrderId, '긴급 리셋');

        if (session.pendingOrdersData.has(targetOrderId)) {
            session.pendingOrdersData.delete(targetOrderId);
            slog('경고', `   ✅ 오더 캐시 삭제 완료`);
        } else {
            slog('경고', `   ⚠️ 오더 캐시에 삭제할 내용이 없음 (${targetOrderId})`);
        }

        // deviceEvaluatingMap 정리 (다음 콜 진입 시 기존 오더ID가 남아 꼬이는 것을 방지)
        Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
            if (v === targetOrderId) session.deviceEvaluatingMap.delete(k);
        });

        // 📈 취소(알림) 카운트 증가 처리 — 세는 규칙은 countCancel 한 곳에 있다
        countCancel(session, deviceId, targetOrderId, reason, wasPreview || wasSimulated, io);

        /* 📅 예약 보관의 콜이면 보관에서 꺼낸다 — 안 꺼내면 끝낸 콜이 다음 영업일에 진행 중 첫짐으로 올라온다(handleDecision 취소 갈래와 같은 규칙) */
        const takenReserved = takeReserved(session, targetOrderId);
        if (takenReserved) {
            takenReserved.status = endStatus;
            try { OrderRepository.updateOrderStatus(targetOrderId, userId, endStatus); } catch (e) { console.error("Emergency DB 업데이트 에러:", e); }
        }
        const existingOrder = session.myOrders.find(c => c.id === targetOrderId);
        if (existingOrder) {
            existingOrder.status = endStatus;
            try {
                /* 🧹 상태와 함께 취소 시각(terminatedAt)도 — 한 함수(전수표 #65) */
                const terminatedAt = OrderRepository.updateOrderStatus(targetOrderId, userId, endStatus);
                if (terminatedAt) (existingOrder as any).terminatedAt = terminatedAt;
            } catch (e) {
                console.error("Emergency DB 업데이트 에러:", e);
            }
            
            /**
             * 🔴 종결 상태는 손으로 적지 않고 `isTerminal()` 을 쓴다 — 손으로 적으면 `ORDER_DELIVERED` 를 빠뜨려
             *    하차를 마친 콜을 아직 실려 있다고 센다. 목록은 `shared` 한 곳에만 둔다.
             */
            const activeCalls = session.myOrders.filter(c => !isTerminal(c.status));
            if (activeCalls.length === 0) {
                updateActiveFilter(userId, { isSharedMode: false, isActive: true, driverAction: 'WAITING', dispatchPhase: 'STANDBY' }, io);
                slog('경고', `   ✅ 잡아 둔 콜 없음 → 필터 '첫짐' 복원 완료`);
            } else {
                const { recalculateActiveKakaoRoute } = await import("../services/dispatchEngine");
                await recalculateActiveKakaoRoute(userId, io);
                slog('경고', `   ✅ 남은 활성 콜 경로 재계산 완료`);
            }
        }

        if (io) {
            io.to(userId).emit("emergency-alert", emergencyAlertFrom(report, targetOrderId, new Date().toISOString(), keepLost));
            slog('경고', `   ✅ 관제탑 emergency-alert emit 완료`);
        }

        if (io) {
            slog('경고', `📤 [Socket 푸시] order-canceled (${targetOrderId})`);
            io.to(userId).emit("order-canceled", { id: targetOrderId, status: endStatus });
        }

        slog('경고', `🚨🚨🚨 [EMERGENCY] 처리 완료 🚨🚨🚨\n`);

        res.json({
            success: true,
            message: "비상 보고 수신 완료. 서버 상태 초기화됨.",
            clearedOrderId: orderId,
        });
    } catch (error) {
        console.error("Emergency POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;

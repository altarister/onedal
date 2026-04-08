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
 *   1. pendingDetailRequests에서 해당 orderId 삭제 (롱폴링 해제)
 *   2. pendingOrdersData에서 해당 orderId 삭제
 *   3. mainCallState가 해당 orderId면 null로 초기화 + 필터 '첫짐'으로 복원
 *   4. 관제탑에 emergency-alert emit
 *   5. 관제탑에 order-canceled emit
 */

import { Router } from "express";
import type { EmergencyReport } from "@onedal/shared";
import {
    getPendingDetailRequests,
    getPendingOrdersData,
    getMainCallState,
    resetMainCallState,
} from "./detail";
import { activeFilterConfig, updateActiveFilter } from "../state/filterStore";

const router = Router();

router.post("/", (req, res) => {
    try {
        const report = req.body as EmergencyReport;
        const { deviceId, orderId, reason, screenContext, screenText, timestamp } = report;

        console.log(`\n🚨🚨🚨 [EMERGENCY] 비상 보고 수신 🚨🚨🚨`);
        console.log(`   기기: ${deviceId}`);
        console.log(`   오더: ${orderId}`);
        console.log(`   사유: ${reason}`);
        console.log(`   화면: ${screenContext}`);
        console.log(`   텍스트: ${screenText?.substring(0, 100)}...`);

        let targetOrderId = orderId;

        const pendingOrdersData = getPendingOrdersData();

        // 앱폰이 orderId를 분실하여 'unknown'으로 보냈을 경우, 해당 기기에서 보류 중인 오더를 역추적
        if (!targetOrderId || targetOrderId === "unknown") {
            for (const [id, order] of pendingOrdersData.entries()) {
                if (order.capturedDeviceId === deviceId) {
                    targetOrderId = id;
                    console.log(`   🔍 잃어버린 orderId 역추적 성공: ${targetOrderId}`);
                    break;
                }
            }
        }

        const io = req.app.get("io");

        // 1. 롱폴링 해제: pendingDetailRequests에서 삭제
        const pendingDetailRequests = getPendingDetailRequests();
        if (pendingDetailRequests.has(targetOrderId)) {
            const heldRes = pendingDetailRequests.get(targetOrderId);
            pendingDetailRequests.delete(targetOrderId);
            // 아직 응답을 안 보냈다면 연결을 정리 (앱폰은 이미 자체 처리했으므로)
            // CANCEL 상태를 주면 앱폰이 물리적 클릭을 시도하므로, 에러 코드로 무음 종료 처리함
            if (heldRes && !heldRes.headersSent) {
                heldRes.status(408).json({ error: "Emergency Timeout Cleaned" });
            }
            console.log(`   ✅ 롱폴링 파이프 무음 해제 완료`);
        }

        // 2. 오더 데이터 삭제
        if (pendingOrdersData.has(targetOrderId)) {
            pendingOrdersData.delete(targetOrderId);
            console.log(`   ✅ 오더 캐시 삭제 완료`);
        } else {
            console.log(`   ⚠️ 오더 캐시에 삭제할 내용이 없음 (${targetOrderId})`);
        }

        // 3. mainCallState 초기화 (해당 오더가 본콜이었을 경우)
        const mainCall = getMainCallState();
        if (mainCall && mainCall.id === targetOrderId) {
            resetMainCallState();
            // 필터 속성을 '단독(첫짐)' 사냥으로 복원
            updateActiveFilter({ isSharedMode: false, isActive: true });
            if (io) io.emit("filter-updated", activeFilterConfig);
            console.log(`   ✅ 본콜 초기화 + 필터 '첫짐' 복원 완료`);
        }

        // 4. 관제탑에 비상 알림 emit
        if (io) {
            io.emit("emergency-alert", {
                deviceId,
                orderId: targetOrderId,
                reason,
                screenContext,
                screenText: screenText?.substring(0, 300), // 관제탑에는 축약본만
                timestamp: timestamp || new Date().toISOString(),
            });
            console.log(`   ✅ 관제탑 emergency-alert emit 완료`);
        }

        // 5. 관제탑에 오더 취소 알림
        if (io) {
            console.log(`📤 [Socket 푸시] order-canceled (${targetOrderId})`);
            io.emit("order-canceled", targetOrderId);
        }

        console.log(`🚨🚨🚨 [EMERGENCY] 처리 완료 🚨🚨🚨\n`);

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

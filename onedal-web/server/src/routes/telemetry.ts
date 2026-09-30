import { Router } from "express";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";
import { isDetailScreen, isListScreen } from "@onedal/shared";
import { userOfDevice, deviceScreenOf } from "./devices";
import { slog } from "../utils/fileLogger";

const router = Router();

export interface AnomalyPayload {
    timestamp?: string;
    deviceId: string;
    targetApp: string;
    screenName?: string;
    failureReason: string;
    listOrderInfo?: {
        fare?: number;
        pickup?: string;
        dropoff?: string;
        [key: string]: any;
    } | null;
    detailParsedText?: string | null;
    screenshotBase64?: string | null;
    ocrResult?: {
        extractedPickup?: string | null;
        extractedDropoff?: string | null;
        [key: string]: any;
    } | null;
}

/**
 * ⚪ **«판정 못 함»의 까닭 — 기사님 말로** (기사님 «가» · onedal-1f). 요건 미달(`REQUIREMENT_UNMET: …`)이 아니면 null.
 *    코드 글자는 화면에 내지 않는다.
 */
export function unreadableReasonOf(failureReason: string): string | null {
    const m = /^REQUIREMENT_UNMET:\s*(.*)$/.exec(failureReason);
    if (!m) return null;
    const fare = m[1].includes('요금'), addr = m[1].includes('주소');
    return fare && addr ? '요금·주소를 못 읽음' : fare ? '요금을 못 읽음' : addr ? '주소를 못 읽음' : '상세를 못 읽음';
}

/**
 * POST /api/telemetry/anomalies
 * 배차망 스냅샷 검증 실패 또는 UI 이상 징후 보고 수신
 */
router.post("/anomalies", (req, res) => {
    try {
        const payload = req.body as AnomalyPayload;
        const {
            deviceId,
            targetApp,
            screenName,
            failureReason,
            listOrderInfo,
            detailParsedText,
            ocrResult,
            timestamp
        } = payload;

        if (!deviceId || !targetApp || !failureReason) {
            return res.status(400).json({
                success: false,
                error: "필수 항목(deviceId, targetApp, failureReason)이 누락되었습니다."
            });
        }

        const anomalyTimestamp = timestamp || new Date().toISOString();
        const listOrderJson = listOrderInfo ? JSON.stringify(listOrderInfo) : null;
        const ocrResultJson = ocrResult ? JSON.stringify(ocrResult) : null;

        console.warn(`🚨 [이상 징후 수신] ${deviceId} · ${targetApp} (${screenName || "-"}) : ${failureReason}`);

        const stmt = db.prepare(`
            INSERT INTO telemetry_anomalies (
                timestamp, device_id, target_app, screen_name,
                failure_reason, list_order_info, detail_parsed_text,
                ocr_result, screenshot_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `);

        const result = stmt.run(
            anomalyTimestamp,
            deviceId,
            targetApp,
            screenName || null,
            failureReason,
            listOrderJson,
            detailParsedText || null,
            ocrResultJson
        );

        /**
         * ⚪ **상세 화면에서 온 요건 미달이면 평가 자리로** — 앱은 이 콜을 버렸다(판정이 안 온다).
         *    가르는 것은 개별 사실 둘: 보고가 상세 화면에서 왔나(`isDetailScreen`) · 요건 미달인가. 목록 스캔의 요건 미달은 안 띄운다.
         *    지우는 것은 폰이 상세에서 나갈 때(`devices.ts` 화면 바뀜) · 진짜 판정이 올 때(관제웹).
         *    🔴 폰이 이미 목록이면 안 띄운다 — 보고와 화면 바뀜은 다른 길이라, 늦게 닿은 보고가 지운 뒤의 목록 위에 ⚪ 를 남긴다.
         */
        const reason = unreadableReasonOf(failureReason);
        const io = req.app?.get("io");
        const screenNow = deviceScreenOf(deviceId);
        if (reason && isDetailScreen(screenName) && screenNow && isListScreen(screenNow)) {
            slog('화면', `⚪ [판정 못 함 안 띄움] ${reason} — 폰이 이미 목록이다(늦게 닿은 보고)`);
        } else if (reason && isDetailScreen(screenName) && io) {
            const userId = userOfDevice(deviceId);
            io.to(userId).emit("detail-unreadable", {
                reason, pickup: listOrderInfo?.pickup ?? null, fare: listOrderInfo?.fare ?? null, at: new Date().toISOString(),
            });
            slog('화면', `⚪ [판정 못 함] ${reason} · ${listOrderInfo?.pickup ?? '상차 모름'} — 평가 자리에 띄움`);
        }

        res.json({
            success: true,
            id: result.lastInsertRowid
        });
    } catch (err: any) {
        console.error("❌ [이상 징후 저장 실패]", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/telemetry/anomalies
 * 최근 수신된 이상 징후 목록 조회 (기본 50건, 관리자/사용자 인증 필요)
 */
router.get("/anomalies", requireAuth, (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        /* 👥 자기 폰 기록만 — 관리자는 운영센터 문으로 따로 본다 (reviews/29 기준 1) */
        const rows = db.prepare(`
            SELECT * FROM telemetry_anomalies
            WHERE device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?)
            ORDER BY id DESC
            LIMIT ?
        `).all(req.user!.id, limit);

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (err: any) {
        console.error("❌ [이상 징후 조회 실패]", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

import { Router } from "express";
import db from "../db";

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
 * 최근 수신된 이상 징후 목록 조회 (기본 50건)
 */
router.get("/anomalies", (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const rows = db.prepare(`
            SELECT * FROM telemetry_anomalies
            ORDER BY id DESC
            LIMIT ?
        `).all(limit);

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

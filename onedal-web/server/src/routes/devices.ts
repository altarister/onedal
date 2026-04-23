import { Router } from "express";
import { DeviceSession, DeviceStatusType, DeviceModeType, ScreenContextType } from "@onedal/shared";
import { forceCancelEvaluatingOrder } from "../services/dispatchEngine";
import { getUserSession } from "../state/userSessionStore";
import { generatePin, consumePin } from "../state/pairingStore";
import { requireAuth } from "../middlewares/authMiddleware";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";

const router = Router();

// 메모리 내부 세션 저장소 (앱폰 -> 서버 핑 유지용)
const activeDevices = new Map<string, DeviceSession>();

// 데드맨 스위치 감지 주기 (안드로이드 하트비트가 60초이므로, 여유를 두어 70초로 설정)
const DEADMAN_TIMEOUT_MS = 70000;

// ═══════════════════════════════════════
// 유틸: deviceId로 DB에서 deviceName 1회 조회 (캐싱 목적)
// ═══════════════════════════════════════
function lookupDeviceName(deviceId: string): string | undefined {
    try {
        const row = db.prepare("SELECT device_name FROM user_devices WHERE device_id = ?").get(deviceId) as any;
        return row?.device_name || undefined;
    } catch {
        return undefined;
    }
}

/**
 * App에서 화면이 변경되거나 주기적으로 스크랩 데이터를 전송할 때 세션 갱신
 * @returns 현재 기기의 관제 모드 (AUTO | MANUAL)
 */
export const touchDeviceSession = (deviceId: string, addedPollCount: number = 0, screenContext?: ScreenContextType, io?: any, isHolding?: boolean, lat?: number, lng?: number): DeviceModeType => {
    let session = activeDevices.get(deviceId);

    if (!session) {
        // 최초 세션 생성 시에만 DB에서 deviceName을 1회 조회 (이후 메모리 캐싱)
        const deviceName = lookupDeviceName(deviceId);
        session = {
            deviceId,
            deviceName,
            lastSeen: Date.now(),
            status: "ONLINE",
            mode: "AUTO", // 최초 접속 시 무조건 안전모드(수동) 진입
            screenContext: screenContext || 'UNKNOWN',
            isHolding: isHolding ?? false,
            lat,
            lng,
            stats: { polled: addedPollCount, grabbed: 0, canceled: 0 }
        };
    } else {
        session.lastSeen = Date.now();
        session.status = "ONLINE"; // 데이터가 왔으므로 다시 활성화
        session.stats.polled += addedPollCount;
        if (screenContext) {
            session.screenContext = screenContext;
        }
        if (isHolding !== undefined) {
            session.isHolding = isHolding;
        }
        if (lat !== undefined && lng !== undefined) {
            session.lat = lat;
            session.lng = lng;
        }
    }

    activeDevices.set(deviceId, session);

    // [Zero-Latency 동기화 핵심 로직] 
    // 기사님이 수동으로 닫기를 누르거나 오더가 사라져서 안드로이드 앱이 리스트 화면으로 이탈했다면, 
    // 서버가 쥐고 있는 대기 중(롱폴링)인 콜 결정을 즉시 강제 파괴하여 데드락을 방지합니다!
    if (screenContext === 'LIST') {
        let userId = "ADMIN_USER";
        if (deviceId) {
            const row = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as any;
            if (row) userId = row.user_id;
        }
        
        const userSession = getUserSession(userId);
        const stuckOrderId = userSession.deviceEvaluatingMap.get(deviceId);
        if (stuckOrderId) {
            const stuckOrder = userSession.pendingOrdersData.get(stuckOrderId);
            if (stuckOrder && !stuckOrder.type?.startsWith("MANUAL")) {
                console.log(`🚀 [화면 이탈 감지] 기기(${deviceId})가 리스트 화면으로 이탈함! 대기 중이던 AUTO 롱폴링 파이프 강제 파괴.`);
                forceCancelEvaluatingOrder(userId, stuckOrderId, io);
            }
        }
    }

    return session.mode;
};

/**
 * 특정 기기의 수락/취소 통계 카운트를 즉시 1 올립니다.
 */
export const incrementDeviceStats = (deviceId: string, type: "grabbed" | "canceled") => {
    const session = activeDevices.get(deviceId);
    if (session) {
        session.stats[type] += 1;
        activeDevices.set(deviceId, session);
    }
};

// ═══════════════════════════════════════
// [API] POST /api/devices/pin — 관제 웹에서 PIN 발급 요청
// ═══════════════════════════════════════
router.post("/pin", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const result = generatePin(userId);
        res.json(result);
    } catch (error) {
        console.error("PIN 발급 에러:", error);
        res.status(500).json({ error: "PIN 발급 중 오류가 발생했습니다." });
    }
});

// ═══════════════════════════════════════
// [API] POST /api/devices/pair — 안드로이드 앱에서 PIN+UUID로 페어링
// ⚠️ 인증 불필요: 앱은 아직 로그인 전이므로 PIN 자체가 1회용 인증 수단
// ═══════════════════════════════════════
router.post("/pair", (req, res) => {
    try {
        const { pin, deviceId, deviceName } = req.body as {
            pin: string;
            deviceId: string;
            deviceName?: string;
        };

        if (!pin || !deviceId) {
            return res.status(400).json({ error: "pin과 deviceId는 필수입니다." });
        }

        logRoadmapEvent("서버", "앱폰으로 부터 6자리 PIN 인증 요청 받음 및 deviceId 발급 연산");
        // 1. PIN 유효성 검증 및 소비
        const userId = consumePin(pin);
        if (!userId) {
            return res.status(401).json({ error: "PIN이 만료되었거나 유효하지 않습니다. 관제 웹에서 새 PIN을 발급받아주세요." });
        }

        // 2. 다른 사람 기기를 하이재킹하려는지 검증
        const existingRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as { user_id: string } | undefined;
        if (existingRow && existingRow.user_id !== userId) {
            return res.status(409).json({ 
                error: "이 기기는 이미 다른 계정에 등록되어 있습니다. 기존 계정에서 먼저 해제해주세요." 
            });
        }

        // 3. 기기 등록 또는 재등록(이름 갱신) 수행
        if (existingRow && existingRow.user_id === userId) {
            db.prepare("UPDATE user_devices SET device_name = ?, registered_at = datetime('now', 'localtime') WHERE device_id = ?").run(deviceName || null, deviceId);
        } else {
            db.prepare("INSERT INTO user_devices (user_id, device_id, device_name) VALUES (?, ?, ?)").run(userId, deviceId, deviceName || null);
        }
        
        logRoadmapEvent("서버", "승인된 디바이스 정보 DB 저장");

        console.log(`📱 [기기 페어링 완료] User: ${userId} ← Device: ${deviceId} (${deviceName || "이름없음"})`);

        // 4. 기존 메모리 세션이 있으면 deviceName을 즉시 갱신
        const existingSession = activeDevices.get(deviceId);
        if (existingSession) {
            existingSession.deviceName = deviceName || undefined;
        }

        // 5. 소켓으로 관제 웹에 즉시 알림 (핀 대기 팝업 자동 닫힘)
        const io = req.app.get("io");
        if (io) {
            io.to(userId).emit("device-paired", {
                deviceId,
                deviceName: deviceName || null,
            });
        }

        res.json({ success: true, message: "기기 페어링이 완료되었습니다." });
    } catch (error: any) {
        console.error("기기 페어링 에러:", error);
        res.status(500).json({ error: "기기 페어링 중 오류가 발생했습니다." });
    }
});

// ═══════════════════════════════════════
// [API] GET /api/devices/registered — 내 계정에 등록된 기기 목록 조회
// ═══════════════════════════════════════
router.get("/registered", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const devices = db.prepare(
            "SELECT device_id, device_name, registered_at FROM user_devices WHERE user_id = ? ORDER BY registered_at DESC"
        ).all(userId);
        res.json({ devices });
    } catch (error) {
        console.error("등록 기기 조회 에러:", error);
        res.status(500).json({ error: "기기 목록 조회 중 오류가 발생했습니다." });
    }
});

// ═══════════════════════════════════════
// [API] DELETE /api/devices/:deviceId — 기기 연동 해제 (분실/교체 시)
// ═══════════════════════════════════════
router.delete("/:deviceId", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const deviceId = req.params.deviceId as string;

        const result = db.prepare(
            "DELETE FROM user_devices WHERE user_id = ? AND device_id = ?"
        ).run(userId, deviceId);

        if (result.changes === 0) {
            return res.status(404).json({ error: "해당 기기를 찾을 수 없거나 권한이 없습니다." });
        }

        // 메모리에서도 제거
        activeDevices.delete(deviceId);

        console.log(`🗑️ [기기 해제] User: ${userId} → Device: ${deviceId} 연동 해제 완료`);
        res.json({ success: true });
    } catch (error) {
        console.error("기기 해제 에러:", error);
        res.status(500).json({ error: "기기 해제 중 오류가 발생했습니다." });
    }
});

// ═══════════════════════════════════════
// [API] PUT /api/devices/:deviceId/name — 기기 별명 변경
// ═══════════════════════════════════════
router.put("/:deviceId/name", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const deviceId = req.params.deviceId as string;
        const { deviceName } = req.body as { deviceName: string };

        const result = db.prepare(
            "UPDATE user_devices SET device_name = ? WHERE user_id = ? AND device_id = ?"
        ).run(deviceName || null, userId, deviceId);

        if (result.changes === 0) {
            return res.status(404).json({ error: "해당 기기를 찾을 수 없거나 권한이 없습니다." });
        }

        // 메모리 세션에도 즉시 반영
        const session = activeDevices.get(deviceId);
        if (session) {
            session.deviceName = deviceName || undefined;
        }

        res.json({ success: true });
    } catch (error) {
        console.error("기기 이름 변경 에러:", error);
        res.status(500).json({ error: "기기 이름 변경 중 오류가 발생했습니다." });
    }
});

/**
 * POST /api/devices/:deviceId/offline
 * [Option C] 기기에서 비동기로 화면 꺼짐/서비스 중단을 보고하여 70초 대기 없이 즉각 OFFLINE 마킹
 */
router.post("/:deviceId/offline", (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const session = activeDevices.get(deviceId);
        if (session) {
            // 메모리 세션을 즉시 OFFLINE 및 수동 모드로 변경
            session.status = "OFFLINE";
            session.mode = "MANUAL";
            session.lastSeen = 0; // 데드맨 스위치 완전 침묵 처리
            console.log(`📵 [즉각 오프라인 마킹] 기기(${deviceId})가 자체 보고를 통해 오프라인 전환 완료`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "오프라인 상태 처리 중 서버 에러" });
    }
});

/**
 * POST /api/devices/:deviceId/mode
 * 관제 웹에서 특정 기기의 모드(AUTO/MANUAL)를 변경할 때 사용
 */
router.post("/:deviceId/mode", requireAuth, (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const { mode } = req.body as { mode: DeviceModeType };

        if (mode !== "AUTO" && mode !== "MANUAL") {
            return res.status(400).json({ error: "올바르지 않은 모드입니다." });
        }

        let session = activeDevices.get(deviceId);

        if (!session) {
            // 서버 재시작 직후 하트비트가 아직 안 왔을 수도 있음.
            // DB에 등록된 기기인지 확인하고, 맞다면 선제적으로 세션을 생성합니다.
            const registered = db.prepare("SELECT device_name FROM user_devices WHERE device_id = ?").get(deviceId) as any;
            if (!registered) {
                return res.status(404).json({ error: "등록되지 않은 기기입니다." });
            }
            // 메모리에 선제 세션 생성 (앱폰 하트비트 올 때 touchDeviceSession이 덮어씀)
            session = {
                deviceId,
                deviceName: registered.device_name || undefined,
                lastSeen: 0, // 아직 하트비트 미수신 → 데드맨 스위치가 OFFLINE으로 표시
                status: "OFFLINE",
                mode: "MANUAL",
                screenContext: "UNKNOWN",
                stats: { polled: 0, grabbed: 0, canceled: 0 }
            };
            activeDevices.set(deviceId, session);
            console.log(`⚙️ [모드 선제 적용] 메모리 미등록 기기 세션 생성 후 모드 설정: ${deviceId} → ${mode}`);
        }

        session.mode = mode;
        activeDevices.set(deviceId, session);

        res.json({ success: true, mode });
    } catch (error) {
        res.status(500).json({ error: "서버 에러" });
    }
});

/**
 * GET /api/devices
 * 관제 대시보드에서 1초마다 현재 모든 기기의 상태를 조회
 */
export const getActiveDevicesSnapshot = (): DeviceSession[] => {
    const now = Date.now();
    const result: DeviceSession[] = [];

    activeDevices.forEach((session, key) => {
        // [퇴근 모드 처리] 더 이상 SHUTDOWN은 없으므로, 핑이 오랫동안 끊기면 완전히 메모리에서 치우기만 합니다
        if (now - session.lastSeen > DEADMAN_TIMEOUT_MS * 12) { // 약 5분
            activeDevices.delete(key);
            return;
        }

        // 데드맨 스위치: 25초 이상 핑이 없으면 통신 단절(OFFLINE) 표기 및 락
        if (now - session.lastSeen > DEADMAN_TIMEOUT_MS) {
            session.status = "OFFLINE";
            // 자동 오더 캡처를 막기 위해 관제 모드도 수동(락)으로 강제 변환
            session.mode = "MANUAL";
        }

        result.push(session);
    });

    return result;
};

/**
 * GET /api/devices (유저별)
 * DB에 등록된 유저의 기기 목록을 바탕으로, 활성 세션 상태(Memory)를 병합하여 반환합니다.
 */
export const getUserDevicesSnapshot = (userId: string): DeviceSession[] => {
    // 1. DB에서 해당 유저의 등록 기기 조회
    const registered = db.prepare("SELECT device_id, device_name FROM user_devices WHERE user_id = ?").all(userId) as any[];
    
    // 2. 전체 활성 기기 스냅샷 (데드맨 갱신됨)
    const allActive = getActiveDevicesSnapshot();
    
    const result: DeviceSession[] = [];
    
    for (const r of registered) {
        const activeItem = allActive.find(d => d.deviceId === r.device_id);
        
        if (activeItem) {
            // 메모리 객체에 최신 이름 덮어쓰기
            activeItem.deviceName = r.device_name || activeItem.deviceName;
            result.push(activeItem);
        } else {
            // 완전 비활성 상태인 등록 기기도 UI 표시용으로 내려줌
            result.push({
                deviceId: r.device_id,
                deviceName: r.device_name,
                lastSeen: 0,
                status: "OFFLINE",
                mode: "MANUAL",
                screenContext: "UNKNOWN",
                stats: { polled: 0, grabbed: 0, canceled: 0 }
            });
        }
    }
    
    return result;
};

/**
 * GET /api/devices
 * (예비용) 관제 대시보드 강제 폴링 시 현재 기기 상태 조회
 */
router.get("/", requireAuth, (req, res) => {
    res.json({ devices: getActiveDevicesSnapshot() });
});

/**
 * POST /api/devices/clear
 * 개발/테스트용: 모든 기기 세션 강제 초기화
 */
router.post("/clear", requireAuth, (req, res) => {
    activeDevices.clear();
    res.json({ success: true });
});

export default router;

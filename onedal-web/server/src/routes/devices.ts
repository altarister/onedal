import { Router } from "express";
import { DeviceSession, DeviceStatusType, DeviceModeType } from "@onedal/shared";

const router = Router();

// 메모리 내부 세션 저장소 (앱폰 -> 서버 핑 유지용)
const activeDevices = new Map<string, DeviceSession>();

// 데드맨 스위치 감지 주기 (안드로이드 하트비트가 20초이므로, 여유를 두어 25초로 설정)
const DEADMAN_TIMEOUT_MS = 25000;

/**
 * App에서 데이터를 전송할 때마다 세션 생명주기를 갱신하는 헬퍼 함수
 * @returns 현재 기기의 관제 모드 (AUTO | MANUAL)
 */
export const touchDeviceSession = (deviceId: string, addedPollCount: number = 0): DeviceModeType => {
    let session = activeDevices.get(deviceId);
    
    if (!session) {
        session = {
            deviceId,
            lastSeen: Date.now(),
            status: "ONLINE",
            mode: "MANUAL", // 최초 접속 시 무조건 안전모드(수동) 진입
            stats: { polled: addedPollCount, grabbed: 0, canceled: 0 }
        };
    } else {
        session.lastSeen = Date.now();
        session.status = "ONLINE"; // 데이터가 왔으므로 다시 활성화
        session.stats.polled += addedPollCount;
    }

    activeDevices.set(deviceId, session);
    return session.mode;
};

/**
 * 2. POST /api/devices/:deviceId/mode
 * 관제 웹에서 특정 기기의 모드(AUTO/MANUAL)를 변경할 때 사용
 */
router.post("/:deviceId/mode", (req, res) => {
    try {
        const { deviceId } = req.params;
        const { mode } = req.body as { mode: DeviceModeType };

        const session = activeDevices.get(deviceId);
        if (!session) {
            return res.status(404).json({ error: "기기를 찾을 수 없습니다." });
        }

        session.mode = mode;
        activeDevices.set(deviceId, session);

        res.json({ success: true, mode });
    } catch (error) {
        res.status(500).json({ error: "서버 에러" });
    }
});

/**
 * 3. GET /api/devices
 * 관제 대시보드에서 1초마다 현재 모든 기기의 상태를 조회
 */
export const getActiveDevicesSnapshot = (): DeviceSession[] => {
    const now = Date.now();
    const result: DeviceSession[] = [];

    activeDevices.forEach((session, key) => {
        // [퇴근 모드 처리] SHUTDOWN 명령이 들어간 기기는 UI에서 즉시 숨기고, 핑이 끊기면 완전히 메모리에서 제거
        if (session.mode === "SHUTDOWN") {
            if (now - session.lastSeen > DEADMAN_TIMEOUT_MS) {
                activeDevices.delete(key);
            }
            return;
        }

        // 데드맨 스위치: 정상 종료(OFFLINE_GRACEFUL)가 아닌데 5초 이상 핑이 없으면 통신 단절(DISCONNECTED) 표기
        if (session.status !== "OFFLINE_GRACEFUL") {
            if (now - session.lastSeen > DEADMAN_TIMEOUT_MS) {
                session.status = "DISCONNECTED";
                // 자동 오더 캡처를 막기 위해 관제 모드도 수동(락)으로 강제 변환
                session.mode = "MANUAL";
            }
        }

        result.push(session);
    });

    return result;
};

/**
 * 3. GET /api/devices
 * (예비용) 관제 대시보드 강제 폴링 시 현재 기기 상태 조회
 */
router.get("/", (req, res) => {
    res.json({ devices: getActiveDevicesSnapshot() });
});

/**
 * 4. POST /api/devices/clear
 * 개발/테스트용: 모든 기기 세션 강제 초기화
 */
router.post("/clear", (req, res) => {
    activeDevices.clear();
    res.json({ success: true });
});

export default router;

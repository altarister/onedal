import { Router } from "express";
import { DeviceModeType, isDeviceMode, isDeviceOfflineReason, DEVICE_OFFLINE_LABEL, modeActsOf } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { generatePin, tryConsumePin } from "../state/pairingStore";
import { requireAuth } from "../middlewares/authMiddleware";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { updateActiveFilter } from "../state/filterManager";
import { slog } from "../utils/fileLogger";
import { authDevice, deviceTokenOf, newDeviceToken, deviceLabelOf } from "../core/deviceAuth";
import { accountGateOf } from "../core/accountGate";
import { DEVICE_LINK_ERRORS, PAIR_TOKEN_FIELD } from "@onedal/shared";
import { clientIpOf } from "../utils/clientIp";
import { flushSupply, phoneSupplyFor } from "../state/phoneSupply";
import { ackDecision, phoneDecisionsForDevice } from "../state/decisions";
import { activeDevices, saveModePreference, storedCommandOf, demoteOtherAutoPhones, filteringDeviceFrom } from "../state/deviceRegistry";
import { cleanPreviewOfDevice, getUserDevicesSnapshot } from "../state/deviceSessions";

const router = Router();

// ═══════════════════════════════════════
// [API] POST /api/devices/pin — 관제 웹에서 PIN 발급 요청
// ═══════════════════════════════════════
router.post("/pin", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        /* 🚧 막힌 계정에는 번호를 주지 않는다 — 연결 문과 같은 판단(core/accountGate) */
        if (accountGateOf(userId).blocked) {
            return res.status(403).json({ error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED, message: "이 계정은 아직 쓸 수 없습니다. 관제웹에서 가입 상태를 확인해 주세요." });
        }
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

        logRoadmapEvent('통신', "서버", "앱폰으로 부터 6자리 PIN 인증 요청 받음 및 deviceId 발급 연산");
        // 1. PIN 유효성 검증 및 소비
        /* 🔢 시도 한도 안에서만 번호를 쓴다 — 잠겼으면 429 · 글자는 PIN_INVALID 그대로(앱은 짝 화면 오류 글) */
        /* 🚧 승인 전 · 탈퇴 · 정지 계정에는 폰을 잇지 않는다 — 폰 문과 같은 판단(core/accountGate).
              번호를 지우기 전에 본다 — 막혔으면 번호를 남겨 승인 뒤 같은 번호로 이을 수 있다 */
        const tried = tryConsumePin(pin, { ip: clientIpOf(req), deviceId }, id => accountGateOf(id).blocked);
        if (!tried.ok && tried.blockedOwner) {
            slog('통신', `🚫 [계정 막힘] ${tried.blockedOwner} — 폰 연결 거절 (${DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED})`);
            return res.status(403).json({ error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED, message: "이 계정은 아직 쓸 수 없습니다. 관제웹에서 가입 상태를 확인해 주세요." });
        }
        if (!tried.ok && tried.locked) {
            return res.status(429).json({ error: DEVICE_LINK_ERRORS.PIN_INVALID, retryInSec: tried.retryInSec, message: `번호를 여러 번 틀려 잠시 막혔습니다. ${Math.ceil((tried.retryInSec ?? 0) / 60)}분 뒤 다시 해 주세요.` });
        }
        if (!tried.ok) {
            return res.status(401).json({ error: DEVICE_LINK_ERRORS.PIN_INVALID, message: "PIN이 만료되었거나 유효하지 않습니다. 관제 웹에서 새 PIN을 발급받아주세요." });
        }
        const userId = tried.userId;

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
        
        /* 🔑 연결할 때마다 새 비밀 토큰 — DB 에는 sha256 만, 원문은 응답으로 한 번 */
        const { token, hash } = newDeviceToken();
        db.prepare("UPDATE user_devices SET token_hash = ? WHERE device_id = ?").run(hash, deviceId);
        logRoadmapEvent('통신', "서버", "승인된 디바이스 정보 DB 저장");

        slog('통신', `📱 [기기 페어링 완료] User: ${userId} ← Device: ${deviceLabelOf(deviceId)} (${deviceName || "이름없음"})`);

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

        res.json({ success: true, message: "기기 페어링이 완료되었습니다.", [PAIR_TOKEN_FIELD]: token });
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

        // 메모리에서도 제거 (모드는 지워진 행과 함께 사라진다 — 따로 지울 것이 없다)
        activeDevices.delete(deviceId);

        slog('통신', `🗑️ [기기 해제] User: ${userId} → Device: ${deviceLabelOf(deviceId)} 연동 해제 완료`);
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
        const auth = authDevice(deviceId, deviceTokenOf(req));
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const session = activeDevices.get(deviceId);
        if (session) {
            // 메모리 세션을 즉시 OFFLINE 처리.
            // mode는 건드리지 않습니다. 화면이 꺼졌다고 기사님의 AUTO 의도가
            // 사라진 것은 아니며, 복귀 시 touchDeviceSession이 다시 복원합니다.
            session.status = "OFFLINE";
            session.lastSeen = 0; // 데드맨 스위치 완전 침묵 처리
            /**
             * 📵 **왜 내려갔는지를 앱한테 그대로 받아 적는다** (기사님 지적).
             * 서버가 추측하지 않는다 — 앱만이 «접근성이 꺼졌다»를 사실로 안다.
             * 모르면 비워 둔다(«연결 끊김»으로 그려진다) — 지어내지 않는다 (규칙 ④).
             */
            const reason = (req.body as any)?.reason;
            session.offlineReason = isDeviceOfflineReason(reason) ? reason : undefined;
            const why = session.offlineReason ? DEVICE_OFFLINE_LABEL[session.offlineReason] : "까닭 모름";
            slog('통신', `📵 [즉각 오프라인 마킹] 기기(${deviceLabelOf(deviceId)})가 자체 보고를 통해 오프라인 전환 완료 — ${why}`);
            /* 🛟 끊긴 폰은 «목록으로 돌아왔다»를 못 보낸다 — 열어 둔 미리보기를 지금 치운다 (#155 · 보고 없이 끊기면 생존신고 감시가 치운다) */
            cleanPreviewOfDevice(auth.userId, deviceId, req.app.get("io"), "폰 끊김");
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "오프라인 상태 처리 중 서버 에러" });
    }
});

/**
 * 🌐 **인터넷 길 — 이 폰 몫 한 벌** (블루투스가 기본 길 · 끊기면 인터넷이 받침 · A1 S1).
 * 원달앱이 «블루투스 끊김» · «관제앱 서버 끊김» · «안전취소가 걸림» 사실 중 하나라도 참이면 1초마다 묻는다.
 * 값은 공급 소켓과 같은 원천(`phoneSupplyFor` · `phoneDecisionsForDevice`) — 폰 문은 보고와 같다(`authDevice`).
 */
router.get("/:deviceId/supply", (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const auth = authDevice(deviceId, deviceTokenOf(req));
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const { decisions, folds } = phoneDecisionsForDevice(getUserSession(auth.userId), deviceId);
        res.json({ ...phoneSupplyFor(auth.userId, deviceId), decisions, folds });
    } catch (error) {
        res.status(500).json({ error: "공급 처리 중 서버 에러" });
    }
});

/** 🌐 인터넷 길 «받았음» — 블루투스 길과 같은 `ackDecision`(두 길로 두 번 와도 큐는 한 번) */
router.post("/:deviceId/decision-ack", (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const auth = authDevice(deviceId, deviceTokenOf(req));
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const orderId = (req.body as { orderId?: unknown })?.orderId;
        if (typeof orderId !== "string" || !orderId) return res.status(400).json({ error: "콜 번호가 없다" });
        const done = ackDecision(req.app.get("io"), getUserSession(auth.userId), auth.userId, orderId, `인터넷 · ${deviceLabelOf(deviceId)}`);
        res.json({ success: true, done });
    } catch (error) {
        res.status(500).json({ error: "받았음 처리 중 서버 에러" });
    }
});

/**
 * POST /api/devices/:deviceId/mode
 * 관제 웹에서 특정 기기의 모드(자동 `AUTO` · 알람 `ALARM` · 대기 `MANUAL`)를 바꿀 때 쓴다.
 * 값 목록의 원천은 `shared` 의 `DEVICE_MODES` 하나다 — 여기서 나열하지 않는다.
 */
router.post("/:deviceId/mode", requireAuth, (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const { mode, noContract } = req.body as { mode: DeviceModeType; noContract?: unknown };

        /**
         * 🔴 **값을 손으로 나열하지 않는다** — `isDeviceMode` 한 곳이 목록의 원천이다.
         *    손으로 나열하면 모드가 늘 때 여기를 같이 안 고쳐 **새 모드가 400 으로 조용히 막힌다** (규칙 ③).
         */
        if (!isDeviceMode(mode)) {
            return res.status(400).json({ error: "올바르지 않은 모드입니다." });
        }
        /* 🎛️ 자동의 «계약 안 함» 스위치(32 P1) — 안 보내면 저장된 값 그대로 · 옛 관제앱의 SIMULATION 은 자동 + 계약 안 함으로 받는다(storedOf) */
        if (noContract !== undefined && typeof noContract !== 'boolean') {
            return res.status(400).json({ error: "계약 안 함 값이 올바르지 않습니다." });
        }

        const userId = req.user!.id;
        let session = activeDevices.get(deviceId);

        /**
         * 기사님의 명시적 선택을 DB 에 적는다. 통신 두절·오프라인 보고로 `session.mode` 가
         * 덮어써져도 복귀 시(그리고 서버가 다시 떠도) 이 값으로 되돌린다.
         *
         * 🔴 **0행이면 내 폰이 아니다.** 조용히 200 을 주면 관제웹은 «바꿨다»고 그리는데
         *    실제로는 아무것도 안 바뀐다 — 화면이 거짓말한다 (규칙 ⑤-4 ④).
         */
        const changes = saveModePreference(deviceId, userId, mode, noContract);
        if (changes === 0) {
            console.warn(`⛔ [모드 거절] 기기(${deviceLabelOf(deviceId)}) 는 유저(${userId}) 의 폰이 아닙니다`);
            return res.status(404).json({ error: "등록되지 않았거나 내 기기가 아닙니다." });
        }
        /* 🎛️ 저장한 뒤의 명령 — «자동»을 눌러도 계약 안 함이 남아 있으면 SIMULATION(기사님 «가») · 아래는 모두 이 값을 쓴다 */
        const command = storedCommandOf(deviceId) ?? mode;
        if (modeActsOf(command).onlyOnePhone) demoteOtherAutoPhones(deviceId, userId);

        if (!session) {
            // 서버 재시작 직후 하트비트가 아직 안 왔을 수도 있음.
            // 위에서 소유권까지 확인됐으므로 여기서는 이름만 읽어 선제 세션을 만든다.
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
            slog('통신', `⚙️ [모드 선제 적용] 메모리 미등록 기기 세션 생성 후 모드 설정: ${deviceLabelOf(deviceId)} → ${command}`);
        }

        session.mode = command;
        activeDevices.set(deviceId, session);

        /**
         * 🔴 **`isActive` 는 «누가 누르나»가 아니라 «필터가 도는가» 다** (모드 셋).
         *
         * 둘은 다른 말이다 — **알람은 필터가 돌아야 하는데 앱은 안 누른다.**
         *
         * 앱의 `decide()` 는 맨 앞에서 `if (!filter.isActive) return false` 로 끊는다
         * (`InsungParser`). 여기서 AUTO 만 세면 **알람 모드에서 필터가 아예 안 돌아
         * 아무것도 안 울린다.**
         *
         * 두 사실을 두 곳이 나눠 답한다 — 섞으면 한쪽이 다른 쪽을 조용히 덮는다 (규칙 ③):
         *   · 필터가 도는가  → `isActive` (자동 · 알람)
         *   · 앱이 누르는가  → 앱의 `currentMode == "AUTO"` (자동만)
         *
         * ⚠️ 안전장치는 그대로 겹쳐 있다 (규칙 ②). `scrap.ts` 가 부트스트랩 중·적재 만석·
         *    관제탑 미접속·필터 고장일 때 `isActive=false` 로 덮는데, **그 넷은 알람도
         *    울리면 안 되는 경우**라 그대로 맞다.
         *
         * [다중 폰 안전] 다른 유저의 기기가 간섭하지 않도록 userDeviceIds 로 거른다.
         */
        const io = req.app.get("io");

        const userDeviceIds = db.prepare("SELECT device_id FROM user_devices WHERE user_id = ?").all(userId).map((r: any) => r.device_id);
        const hasFilteringDevice = filteringDeviceFrom(activeDevices.values(), userDeviceIds);

        /**
         * 🔴 **의도를 세션에 먼저 적는다** (코드리뷰).
         *
         * `updateActiveFilter` 안의 불변식이 *"선점 중인 콜 0건이면 다시 켠다"* 로
         * `isActive` 를 되켠다. 이 칸이 없으면 「대기」로 바꿔도 **곧바로 도로 켜져**
         * «대기 = 필터 꺼짐» 이 거짓이 된다 — 그 거짓을 용어집에 적을 뻔했다.
         */
        getUserSession(userId).filterEnabledByMode = hasFilteringDevice;
        updateActiveFilter(userId, { isActive: hasFilteringDevice }, io);
        slog('통신', `⚙️ [모드 전환] 기기(${deviceLabelOf(deviceId)}) → ${command} | 유저(${userId}) 필터 도는 기기 존재: ${hasFilteringDevice} → filter.isActive → ${hasFilteringDevice}`);
        flushSupply(io, userId);   // 📡 기사님이 누른 모드는 1초 주기를 기다리지 않고 관제앱으로

        res.json({ success: true, mode: command });
    } catch (error) {
        res.status(500).json({ error: "서버 에러" });
    }
});

/**
 * GET /api/devices
 * (예비용) 관제 대시보드 강제 폴링 시 현재 기기 상태 조회
 * 👥 자기 폰만 — 남의 폰 상태·위치를 주지 않는다
 */
router.get("/", requireAuth, (req, res) => {
    res.json({ devices: getUserDevicesSnapshot(req.user!.id, req.app.get("io")) });
});

/**
 * POST /api/devices/clear
 * 개발/테스트용: 기기 세션 강제 초기화
 * 👥 자기 폰 기억만 지운다 — 남의 폰 연결 상태를 건드리지 않는다
 */
router.post("/clear", requireAuth, (req, res) => {
    const mine = db.prepare("SELECT device_id FROM user_devices WHERE user_id = ?").all(req.user!.id) as Array<{ device_id: string }>;
    for (const r of mine) activeDevices.delete(r.device_id);
    res.json({ success: true });
});

export default router;

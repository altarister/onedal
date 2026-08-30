import { Router } from "express";
import { FilterTally, DeviceSession, DeviceStatusType, DeviceModeType, isDeviceMode, ScreenContextType, isListScreen, BLIND_GRACE_MS, TargetAppType } from "@onedal/shared";
import { forceCancelEvaluatingOrder } from "../services/dispatchEngine";
import { getUserSession } from "../state/userSessionStore";
import { generatePin, consumePin } from "../state/pairingStore";
import { requireAuth } from "../middlewares/authMiddleware";
import db from "../db";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { updateActiveFilter } from "../state/filterManager";

const router = Router();

// 메모리 내부 세션 저장소 (앱폰 -> 서버 핑 유지용)
const activeDevices = new Map<string, DeviceSession>();

/**
 * 🎛️ **기사님이 고른 모드를 DB 에 적는다** (기사님 확정 2026-08-30 · `docs/지금/기기_모드.md` §6-①).
 *
 * `activeDevices` 의 `session.mode` 는 통신 두절·오프라인 보고로 덮어써지지만,
 * 이 칸은 **"기사님의 의도"** 만 담으며 그런 사건에 흔들리지 않는다.
 *
 * 🔴 **예전엔 메모리 맵이었다.** 값이 둘일 때는 서버가 다시 떠도 `activeFilter.isActive`
 *    로 되살릴 수 있었는데, 셋이 되면서 `isActive === false` 에서 **「대기」와 「알람」을
 *    못 가른다.** 그러면 알람이 말없이 대기로 떨어지고 **화면은 멀쩡한 채 알람만 안 울린다.**
 *
 * 🔴 **`user_id` 로 반드시 거른다** (2026-08-30 코드리뷰). `requireAuth` 는
 *    *"로그인했는가"* 만 답한다 — *"이 폰이 네 것인가"* 는 안 본다. 기기 해제(DELETE)는
 *    거르는데 여기만 안 걸렀다. 구멍은 전부터 있었지만 **메모리라 재시작에 사라졌고**,
 *    DB 로 내리면서 영구화될 뻔했다.
 *
 * @returns 갱신된 행 수. **0 이면 등록 안 됐거나 남의 폰이다**
 */
function saveModePreference(deviceId: string, userId: string, mode: DeviceModeType): number {
    return db.prepare("UPDATE user_devices SET mode = ? WHERE device_id = ? AND user_id = ?")
        .run(mode, deviceId, userId).changes;
}

/**
 * 기기의 기본 모드: **DB 에 적힌 기사님의 선택 > 필터 활성 여부 추론**.
 *
 * 🔴 추론은 «아직 한 번도 안 고른 기기»를 위한 폴백일 뿐이다. 값이 셋이라 추론으로는
 *    `ALARM` 이 절대 안 나온다 — 알람은 **기사님이 명시적으로 고를 때만** 켜진다.
 */
function resolveDefaultMode(deviceId: string, userId: string): DeviceModeType {
    const row = db.prepare("SELECT mode FROM user_devices WHERE device_id = ?").get(deviceId) as { mode?: string } | undefined;
    if (isDeviceMode(row?.mode)) return row.mode;
    return getUserSession(userId).activeFilter?.isActive ? "AUTO" : "MANUAL";
}

/**
 * 데드맨 스위치 감지 주기.
 *
 * [Phase 1.5] 70초 → 150초로 상향.
 * 앱 하트비트가 60초 주기(TelemetryManager.HEARTBEAT_INTERVAL_MS)인데 70초는 여유가 10초뿐이라,
 * 터널·기지국 전환 등으로 전송이 1회만 실패해도(다음 전송까지 120초) 데드맨이 오작동했습니다.
 * 하트비트 주기를 줄이면 /api/scrap 트래픽이 배로 늘어나므로, 대신 판정 여유를 늘렸습니다.
 */
const DEADMAN_TIMEOUT_MS = 150000;

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
 * 👁️ **화면을 못 읽는 중인지 기록한다** (기사님 확정 2026-08-22 · 크리티컬).
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * 접근성이 막혀 콜을 하나도 못 읽는 동안 관제웹은 파란불이었다 — `status` 는
 * *"데이터가 왔는가"* 만 보기 때문이다. **「연결됐다」와 「읽고 있다」는 다른 말이다.**
 *
 * 🔴 판단은 근거 있는 것만: `노드 0` = 접근성 트리가 안 온다(명백한 고장).
 *    *"노드는 있는데 콜이 0"* 은 빈 리스트일 수 있어 여기서 단정하지 않는다 (규칙 ⑤-4 ②).
 *    옛 APK 는 이 값을 안 보내므로(`undefined`) 아무 판단도 하지 않는다 — 호환.
 */
function applyBlindSignal(session: DeviceSession, screenNodeCount?: number, isScreenOn?: boolean): void {
    if (isScreenOn !== undefined) session.isScreenOn = isScreenOn;

    /**
     * 💤 **화면이 꺼져 있으면 노드가 0인 게 당연하다** (기사님 확정 2026-08-22).
     *
     * 그걸 "못 읽음"으로 부르면 기사님이 폰을 끌 때마다 거짓 경고가 뜬다 —
     * **당연한 것을 고장이라 하지 않는다.** 화면 꺼짐은 별도로 표시한다(💤).
     */
    if (session.isScreenOn === false) {
        session.blindSince = undefined;
        return;
    }

    if (screenNodeCount === undefined) return;          // 옛 APK — 모르는 것은 판단하지 않는다
    session.screenNodeCount = screenNodeCount;

    if (screenNodeCount > 0) {
        if (session.blindSince) {
            console.log(`👁️ [화면 복구] ${session.deviceId} — 다시 읽고 있습니다 (노드 ${screenNodeCount}개)`);
        }
        session.blindSince = undefined;
        return;
    }
    if (!session.blindSince) {
        session.blindSince = Date.now();
        console.warn(`👁️ [화면 못 읽음] ${session.deviceId} — 접근성 트리가 안 옵니다. ` +
            `${BLIND_GRACE_MS / 1000}초 더 이어지면 관제탑에 알립니다`);
    }
}

/**
 * App에서 화면이 변경되거나 주기적으로 스크랩 데이터를 전송할 때 세션 갱신
 * @returns 현재 기기의 관제 모드 (AUTO | MANUAL)
 */
export const touchDeviceSession = (deviceId: string, userId: string, addedPollCount: number = 0, screenContext?: ScreenContextType, io?: any, isHolding?: boolean, lat?: number, lng?: number, screenNodeCount?: number, isScreenOn?: boolean, filterTally?: FilterTally, targetApp?: TargetAppType): DeviceModeType => {
    let session = activeDevices.get(deviceId);

    if (!session) {
        // 최초 세션 생성 시에만 DB에서 deviceName을 1회 조회 (이후 메모리 캐싱)
        const deviceName = lookupDeviceName(deviceId);
        const defaultMode = resolveDefaultMode(deviceId, userId);

        session = {
            deviceId,
            deviceName,
            lastSeen: Date.now(),
            status: "ONLINE",
            mode: defaultMode,
            targetApp,
            screenContext: screenContext || 'UNKNOWN',
            isHolding: isHolding ?? false,
            lat,
            lng,
            stats: { polled: addedPollCount, grabbed: 0, canceled: 0 }
        };
    } else {
        // [Phase 1.5] OFFLINE → ONLINE 복귀 시 사용자가 지정했던 모드를 되살립니다.
        //
        // ⚖️ 설계 결정 (2026-08-09, 승욱님 확인):
        // PRD §3 의 "누적 페널티 킬스위치"는 데드맨이 mode 를 MANUAL 로 강제하는 것으로
        // 구현돼 있었으나, 통신이 끊긴 폰은 어차피 콜을 잡지 못하므로 실익이 없는 반면
        // 복귀 후에도 MANUAL 에 머물러 콜 잡기가 멈추는 부작용만 컸다.
        // → **자동 복원**을 택했다. 킬스위치는 관제탑의 명시적 MANUAL 지정으로만 작동한다.
        // 이 복원이 없으면, 통신이 70초(구 데드맨) 두절된 뒤 한 번 MANUAL로 떨어진 기기가
        // 통신 재개 후에도 계속 MANUAL에 머물러 "풀오토가 자꾸 풀리는" 현상이 발생했습니다.
        // (lastSeen이 계속 갱신되므로 세션 삭제 조건에도 영영 걸리지 않았습니다)
        if (session.status === "OFFLINE") {
            const restored = resolveDefaultMode(deviceId, userId);
            if (session.mode !== restored) {
                console.log(`🔄 [모드 복원] 기기(${deviceId}) 온라인 복귀 → ${session.mode} → ${restored}`);
            }
            session.mode = restored;
        }

        session.lastSeen = Date.now();
        session.status = "ONLINE"; // 데이터가 왔으므로 다시 활성화
        session.stats.polled += addedPollCount;
        if (screenContext) {
            session.screenContext = screenContext;
        }
        // 🌐 이 폰이 지금 어느 배차망을 보나 — scrap 마다 갱신되는 실시간 상태 (픽커_수집.md §6-전)
        if (targetApp) {
            session.targetApp = targetApp;
        }
        if (isHolding !== undefined) {
            session.isHolding = isHolding;
        }
        if (lat !== undefined && lng !== undefined) {
            session.lat = lat;
            session.lng = lng;
        }
    }

    // 새 세션이든 갱신이든 **한 곳에서** 본다 — 두 갈래에 나눠 적으면 한쪽만 고쳐진다
    applyBlindSignal(session, screenNodeCount, isScreenOn);
    /**
     * 👁️ **마지막 스캔의 필터 성적표를 그대로 얹는다** (기사님 확정 2026-08-23).
     *
     * 서버가 만드는 값이 아니라 **앱이 판정한 사실**이라 해석하지 않고 옮기기만 한다.
     * 안 온 스캔(하트비트·상세 화면)에서는 **직전 값을 지우지 않는다** — 리스트를 안 보는
     * 동안 화면이 빈칸이 되면 *"필터가 죽었나"* 로 읽힌다. 마지막으로 본 것이 답이다.
     */
    if (filterTally) {
        session.filterTally = filterTally;
        /**
         * 🕐 **받은 순간을 서버 시계로 찍는다** (기사님 지적 2026-08-23).
         *
         * 숫자만 있으면 *"지금 그런 것"* 과 *"아까 그러고 멈춘 것"* 이 똑같이 보인다.
         * 🔴 앱이 보낸 시각을 쓰지 않는다 — 폰 시계가 틀어지면 화면이 미래를 말한다.
         * 🔴 **여기 안에서만** 찍는다. 밖으로 빼면 하트비트가 시각만 밀어 올려
         *    옛 숫자가 새것처럼 보인다 (그게 고치려는 거짓말 그 자체다).
         * 🔴 **`lastSeen` 과 똑같은 값을 넣는다.** 따로 `Date.now()` 를 부르면 몇 ms 어긋나고,
         *    화면이 *"이 성적표가 마지막 보고에 함께 온 것인가"* 를 등호로 못 묻는다 —
         *    그 물음이 곧 *"지금 훑고 있는 것이 맞나"* 다.
         */
        session.filterTallyAt = session.lastSeen;

        /**
         * 🔔 **알람 모드 — 필터를 통과한 콜이 떴다** (기사님 확정 2026-08-30 · `docs/지금/기기_모드.md`).
         *
         * 앱은 이 모드에서 **누르지 않는다.** 기사님이 인성 리스트에서 직접 누르므로,
         * 서버가 할 일은 *"통과한 콜이 지금 리스트에 있다"* 를 관제웹에 알리는 것뿐이다.
         *
         * 🟢 **앱을 안 고쳐도 된다** — 성적표(`passed`)가 이미 이 자리로 온다.
         *    그리고 앱은 이미 본 콜을 지문(`processedOrderHashes`)으로 건너뛰므로
         *    `passed` 는 **이번에 새로 본** 통과 콜만 센다 → 같은 콜에 두 번 안 울린다.
         *
         * 🔴 **여기 안에서만 본다.** `filterTally` 가 함께 온 보고, 즉 «방금 리스트를 훑었다»
         *    일 때만 참이다. 밖으로 빼면 하트비트마다 옛 숫자로 다시 울린다.
         */
        if (session.mode === "ALARM" && filterTally.passed > 0 && io) {
            io.to(userId).emit("filter-pass-alarm", {
                deviceId,
                deviceName: session.deviceName,
                passed: filterTally.passed,
                seen: filterTally.seen,
                at: session.lastSeen,
            });
            console.log(`🔔 [알람] ${deviceId} — 본 ${filterTally.seen}건 중 통과 ${filterTally.passed}건. 기사님이 직접 누르십니다`);
        }
    }
    activeDevices.set(deviceId, session);

    // [Zero-Latency 동기화 핵심 로직] 
    // 기사님이 수동으로 닫기를 누르거나 오더가 사라져서 안드로이드 앱이 리스트 화면으로 이탈했다면, 
    // 서버가 쥐고 있는 대기 중(롱폴링)인 콜 결정을 즉시 강제 파괴하여 데드락을 방지합니다!
    /**
     * 🔴 "리스트 계열인가"는 `shared.isListScreen` 이 유일한 정의다.
     *    예전에는 여기서 `=== 'LIST'` 로 직접 판정해, 앱이 리스트로 치는 `LIST_COMPLETED`
     *    가 **새어 나갔다** (유령 카드 사고 2026-08-14).
     */
    if (isListScreen(screenContext)) {
        let userId = "ADMIN_USER";
        if (deviceId) {
            const row = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as any;
            if (row) userId = row.user_id;
        }
        
        const userSession = getUserSession(userId);
        const stuckOrderId = userSession.deviceEvaluatingMap.get(deviceId);
        if (stuckOrderId) {
            const stuckOrder = userSession.pendingOrdersData.get(stuckOrderId);
            /**
             * 🔄 **미리보기는 리스트로 돌아가면 즉시 정리한다** (기사님 실측 2026-08-22 · 용어집 §9).
             *
             * 직접콜(MANUAL)을 정리에서 빼는 것은 규칙 ① *"기사님이 잡은 콜을 서버가 버리지
             * 않는다"* 때문이다. 하지만 **미리보기는 아직 안 잡은 콜**이라 그 보호가 필요 없다.
             *
             * 기사님: *"인성앱은 자체 확정 카운터가 돌아가고 그 타이머가 끝나면 다시 리스트로
             * 돌아가. 근데 관제앱은 계속 평가중 타이머가 돌아서 싱크가 많이 차이나."*
             *
             * 리스트로 돌아갔다 = **이 콜을 안 잡겠다는 뜻**이다. 서버는 그걸 텔레메트리로
             * 이미 알고 있었으면서 30초를 더 기다리고 있었다.
             */
            const isPreviewStuck = !!(stuckOrder as any)?.isPreview;
            if (stuckOrder && (isPreviewStuck || !stuckOrder.type?.startsWith("MANUAL"))) {
                console.log(`🚀 [화면 이탈 감지] 기기(${deviceId})가 리스트 화면으로 이탈함!` +
                    (isPreviewStuck ? ' 👀 미리보기 콜을 즉시 정리합니다 (안 잡은 콜).' : ' 대기 중이던 AUTO 롱폴링 파이프 강제 파괴.'));
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

        // 메모리에서도 제거 (모드는 지워진 행과 함께 사라진다 — 따로 지울 것이 없다)
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
            // 메모리 세션을 즉시 OFFLINE 처리.
            // [Phase 1.5] mode는 건드리지 않습니다. 화면이 꺼졌다고 기사님의 AUTO 의도가
            // 사라진 것은 아니며, 복귀 시 touchDeviceSession이 다시 복원합니다.
            session.status = "OFFLINE";
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
 * 관제 웹에서 특정 기기의 모드(자동 `AUTO` · 알람 `ALARM` · 대기 `MANUAL`)를 바꿀 때 쓴다.
 * 값 목록의 원천은 `shared` 의 `DEVICE_MODES` 하나다 — 여기서 나열하지 않는다.
 */
router.post("/:deviceId/mode", requireAuth, (req, res) => {
    try {
        const deviceId = req.params.deviceId as string;
        const { mode } = req.body as { mode: DeviceModeType };

        /**
         * 🔴 **값을 손으로 나열하지 않는다** — `isDeviceMode` 한 곳이 목록의 원천이다.
         *    예전엔 `mode !== "AUTO" && mode !== "MANUAL"` 이라, 모드가 늘 때 여기를
         *    같이 안 고치면 **새 모드가 400 으로 조용히 막혔다** (규칙 ③).
         */
        if (!isDeviceMode(mode)) {
            return res.status(400).json({ error: "올바르지 않은 모드입니다." });
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
        const changes = saveModePreference(deviceId, userId, mode);
        if (changes === 0) {
            console.warn(`⛔ [모드 거절] 기기(${deviceId}) 는 유저(${userId}) 의 폰이 아닙니다`);
            return res.status(404).json({ error: "등록되지 않았거나 내 기기가 아닙니다." });
        }

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
            console.log(`⚙️ [모드 선제 적용] 메모리 미등록 기기 세션 생성 후 모드 설정: ${deviceId} → ${mode}`);
        }

        session.mode = mode;
        activeDevices.set(deviceId, session);

        /**
         * 🔴 **`isActive` 는 «누가 누르나»가 아니라 «필터가 도는가» 다** (2026-08-30 · 모드 셋).
         *
         * 값이 둘일 때는 그 둘이 같은 말이었다 — AUTO 면 필터가 돌고 앱이 누른다.
         * **알람이 생기면서 갈라진다**: 알람은 필터가 돌아야 하는데 앱은 안 누른다.
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
        const hasFilteringDevice = Array.from(activeDevices.values()).some(d =>
            userDeviceIds.includes(d.deviceId) && (d.mode === "AUTO" || d.mode === "ALARM")
        );

        /**
         * 🔴 **의도를 세션에 먼저 적는다** (2026-08-30 코드리뷰).
         *
         * `updateActiveFilter` 안의 불변식이 *"선점 중인 콜 0건이면 다시 켠다"* 로
         * `isActive` 를 되켠다. 이 칸이 없으면 「대기」로 바꿔도 **곧바로 도로 켜져**
         * «대기 = 필터 꺼짐» 이 거짓이 된다 — 그 거짓을 용어집에 적을 뻔했다.
         */
        getUserSession(userId).filterEnabledByMode = hasFilteringDevice;
        updateActiveFilter(userId, { isActive: hasFilteringDevice }, io);
        console.log(`⚙️ [모드 전환] 기기(${deviceId}) → ${mode} | 유저(${userId}) 필터 도는 기기 존재: ${hasFilteringDevice} → filter.isActive → ${hasFilteringDevice}`);

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

        // 데드맨 스위치: 일정 시간 핑이 없으면 통신 단절(OFFLINE) 표기
        // [Phase 1.5] mode를 MANUAL로 강제하던 로직 제거.
        // 통신이 끊긴 기기는 어차피 콜을 못 잡으므로 모드를 바꿀 실익이 없는 반면,
        // 한 번 MANUAL로 떨어지면 복귀 후에도 되돌아오지 않아 콜 잡기가 멈추는 부작용만 컸습니다.
        // 관제탑 UI에는 status(OFFLINE)가 별도로 표시되므로 식별에도 문제가 없습니다.
        if (now - session.lastSeen > DEADMAN_TIMEOUT_MS) {
            session.status = "OFFLINE";
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
                mode: resolveDefaultMode(r.device_id, userId),
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

/**
 * 📱 **기기 세션 — 폰마다 메모리에 든 상태와 그 셈** (모드 · 데드맨 · 상세 표시 · 기기 목록).
 * 라우터(`routes/devices.ts`)는 이 파일을 불러 쓰고, 다른 서비스도 기기 상태는 여기서 읽는다.
 */
import { otherContractingAuto, type PhoneForAuto } from "@onedal/shared";
import { FilterTally, DeviceSession, DeviceModeType, isDeviceMode, ScreenContextType, isListScreen, isDetailScreen, isBlipScreen, screenNowOf, UNKNOWN_LEAVE_SEC, BLIND_GRACE_MS, TargetAppType, screenLabelOf, runningModeOf } from "@onedal/shared";
import { forceCancelEvaluatingOrder } from "../services/dispatchEngine";
import { getUserSession, peekUserSession, baseFilterFromDb } from "./userSessionStore";
import { requireAuth } from "../middlewares/authMiddleware";
import db from "../db";
import { updateActiveFilter } from "./filterManager";
import { slog } from "../utils/fileLogger";
import { authDevice, deviceLabelOf } from "../core/deviceAuth";
import { allowanceOf } from "../core/allowance";
import { armWait } from "./waits";
import type { FilterPassAlarm } from "@onedal/shared";
import { sentModesOf } from "./phoneSupply";
import { phoneStatusOf } from "./phoneStatus";
import { phoneCheckOf, sentFilterVersionOf } from "../core/phoneCheck";

/**
 * ⏳ **목록으로 나갔을 때 잡은 콜을 죽이기 전에 기다리는 시간** (기사님 · 실주행 04:31).
 *
 * 한 상차지에서 콜을 잇따라 잡을 때 앱은 «상세 → 목록 → 다음 상세»로 오간다. 그 목록 화면을
 * «버렸다»로 읽으면 방금 잡은 콜이 죽고 취소 카운트까지 깎인다 — 오송읍 셋 중 하나가 그렇게 갔다.
 *
 * 🔴 **다음 콜을 잡는 데 걸리는 시간보다 길고, 안전취소(30초)보다는 훨씬 짧아야 한다.**
 *    실측에서 앱은 오송읍 셋을 **0.1초 안에** 잇따라 잡았다. 3초면 넉넉하고, 정말 버리신
 *    콜이 3초 늦게 정리되는 것은 안전취소 시간 안이라 손해가 없다.
 */
const LIST_EXIT_GRACE_MS = 3_000;

// 메모리 내부 세션 저장소 (앱폰 -> 서버 핑 유지용)
export const activeDevices = new Map<string, DeviceSession>();
/**
 * ⏳ **서버가 뜬 뒤 한 번이라도 보고를 들은 폰** — 서버 메모리는 다시 뜨면 비어 있다.
 *    그 사이의 침묵은 폰이 끊긴 것이 아니라 서버가 아직 못 들은 것이다 · 첫 보고(목록 15초 · 그 밖 60초)가 오면 풀린다.
 *    한 번 들은 뒤 메모리에서 치운 폰(오래 말 없음)은 진짜 끊김이다 — 둘을 이 사실 하나로 가른다.
 */
const heardSinceBoot = new Set<string>();

/**
 * 🎛️ **기사님이 고른 모드를 DB 에 적는다** (기사님 확정).
 *
 * `activeDevices` 의 `session.mode` 는 통신 두절·오프라인 보고로 덮어써지지만,
 * 이 칸은 **"기사님의 의도"** 만 담으며 그런 사건에 흔들리지 않는다.
 *
 * 🔴 **DB 에 둔다** — 메모리에만 두면 서버가 다시 뜰 때 `activeFilter.isActive` 로는 **「대기」와 「알람」을
 *    못 가른다.** 그러면 알람이 말없이 대기로 떨어지고 **화면은 멀쩡한 채 알람만 안 울린다.**
 *
 * 🔴 **`user_id` 로 반드시 거른다** (코드리뷰). `requireAuth` 는
 *    *"로그인했는가"* 만 답한다 — *"이 폰이 네 것인가"* 는 안 본다. 기기 해제(DELETE)는
 *    거르는데 여기만 안 걸렀다. 구멍은 전부터 있었지만 **메모리라 재시작에 사라졌고**,
 *    DB 로 내리면서 영구화될 뻔했다.
 *
 * @returns 갱신된 행 수. **0 이면 등록 안 됐거나 남의 폰이다**
 */
export function saveModePreference(deviceId: string, userId: string, mode: DeviceModeType): number {
    return db.prepare("UPDATE user_devices SET mode = ? WHERE device_id = ? AND user_id = ?")
        .run(mode, deviceId, userId).changes;
}

/** 📱 이 기사님의 등록 폰 번호 — 여럿을 셀 때 한 번 읽어 넘긴다(폰마다 다시 읽지 않게) */
export function registeredPhonesOf(userId: string): string[] {
    return (db.prepare("SELECT device_id FROM user_devices WHERE user_id = ?").all(userId) as { device_id: string }[]).map(r => r.device_id);
}

/** 📡 등록 폰 가운데 살아 있는 폰(메모리 세션 · 데드맨 시간 안) — 관제앱 공급의 폰 줄(서랍 속 · 꺼진 폰은 셈도 로그도 안 한다) */
export function livePhonesOf(ids: string[], now: number = Date.now()): string[] {
    return ids.filter(id => { const s = activeDevices.get(id); return !!s && now - s.lastSeen <= DEADMAN_TIMEOUT_MS; });
}

/**
 * 🔁 **자동은 한 폰만 — 같은 기사님의 다른 폰 가운데 지금 확정을 누를 수 있는 폰이 있나** (shared `otherContractingAuto`).
 *    저장하지 않고 그때그때 본다(규칙 ③) — 살아 있는 폰(메모리 세션 · 데드맨 시간 안)만 · 명령(`getDeviceMode` — 한 번도 안 고른 폰의 기본값 포함) 또는 받은 모드가 자동 · 지금 배차망이 자동 확정 가능.
 *    관제앱 공급(`state/phoneSupply` `modeSentToPhone`)이 이 사실로 자동을 알람으로 내려준다.
 */
export function otherAutoPhoneOf(deviceId: string, userId: string, ids: string[] = registeredPhonesOf(userId)): boolean {
    const phones: PhoneForAuto[] = [];
    for (const id of ids) {
        const s = activeDevices.get(id);
        if (s) phones.push({ deviceId: id, mode: getDeviceMode(id, userId), appliedMode: s.appliedMode, targetApp: s.targetApp, lastSeen: s.lastSeen });
    }
    return otherContractingAuto(deviceId, phones, Date.now(), DEADMAN_TIMEOUT_MS);
}

/**
 * 🔁 **자동을 누른 폰이 이긴다 — 같은 기사님의 다른 자동 폰은 명령을 알람으로 옮겨 저장한다** (기사님 «옮긴다»).
 *    «알람은 기사님이 명시적으로 고를 때만»(아래 기본값 주석)의 예외 — 기사님이 다른 폰에 자동을 고른 것이 곧 이 폰을 알람으로 고른 것이다.
 *    관제웹 폰 단추는 1초마다 가는 폰 목록(`telemetry-devices`)으로 알람을 그린다.
 */
export function demoteOtherAutoPhones(deviceId: string, userId: string): void {
    const others = db.prepare("SELECT device_id FROM user_devices WHERE user_id = ? AND device_id <> ?").all(userId, deviceId) as { device_id: string }[];
    for (const { device_id: other } of others) {
        if (getDeviceMode(other, userId) !== 'AUTO') continue;
        saveModePreference(other, userId, 'ALARM');
        const s = activeDevices.get(other);
        if (s) s.mode = 'ALARM';
        slog('통신', `🔁 [자동은 한 폰] ${deviceLabelOf(other)} 자동 → 알람 — ${deviceLabelOf(deviceId)} 에 자동을 골랐다`);
    }
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
 * 👀 **화면용 모드 판단 — 세션을 만들지 않는다** (운영센터 · 관제웹 폰 목록의 «등록됐지만 안 붙은 폰»).
 *    저장된 선택 › 필터 켜짐(있는 세션 것, 없으면 DB 평소 설정 — baseFilterFromDb · 세션을 안 만든다)이면 AUTO › MANUAL.
 *    폰 보고 길이 세션을 만들며 내는 답과 같다(onedal-04 교차 리뷰). resolveDefaultMode 는 getUserSession 이라 세션 없는 회원(와이프 · 승인 대기)의
 *    기사 세션을 만들고 user_settings 줄까지 썼다 — 읽기가 남의 세션을 깨우면 안 된다(`opsReadNoSession` 검사).
 *    🔴 폰 보고 길(getDeviceMode)은 그대로 resolveDefaultMode — 보고하는 회원은 운행 중이라 세션이 있다.
 */
function viewModeOf(deviceId: string, userId: string): DeviceModeType {
    const row = db.prepare("SELECT mode FROM user_devices WHERE device_id = ?").get(deviceId) as { mode?: string } | undefined;
    if (isDeviceMode(row?.mode)) return row.mode;
    return (peekUserSession(userId)?.activeFilter ?? baseFilterFromDb(userId)).isActive ? "AUTO" : "MANUAL";
}

/**
 * 기기의 현재 모드를 가져온다 (메모리 세션 > DB 저장값 > 폴백).
 */
export function getDeviceMode(deviceId: string, userId?: string): DeviceModeType {
    const session = activeDevices.get(deviceId);
    if (session?.mode) return session.mode;
    if (userId) {
        return resolveDefaultMode(deviceId, userId);
    }
    try {
        const row = db.prepare("SELECT mode FROM user_devices WHERE device_id = ?").get(deviceId) as { mode?: string } | undefined;
        if (isDeviceMode(row?.mode)) return row.mode;
    } catch {}
    return "MANUAL";
}


/**
 * 데드맨 스위치 감지 주기.
 *
 * 앱 하트비트는 목록 화면 15초 · 그 밖 60초(TelemetryManager.heartbeatIntervalMs) — 이 판정은 가장 긴 60초 기준이다.
 * 터널·기지국 전환 등으로 전송이 1회 실패해도(다음 전송까지 120초) 끊김으로 잘못 보지 않게 150초를 둔다.
 */
const DEADMAN_TIMEOUT_MS = 150000;

/**
 * 🧹 **끊긴 폰을 메모리에서 지우는 때** — 30분 동안 보고가 없으면 기기 목록에서 뺀다.
 *    그 전까지 관제웹은 그 폰을 «끊김»으로 보여 준다. 끊김 판정(`DEADMAN_TIMEOUT_MS`)과는 따로 정한다.
 */
const DEVICE_FORGET_MS = 30 * 60_000;

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
 * 👁️ **화면을 못 읽는 중인지 기록한다** (기사님 확정 · 크리티컬).
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * `status` 는 *"데이터가 왔는가"* 만 본다 — 접근성이 막혀 콜을 하나도 못 읽어도 파란불이다. **「연결됐다」와 「읽고 있다」는 다른 말이다.**
 *
 * 🔴 판단은 근거 있는 것만: `노드 0` = 접근성 트리가 안 온다(명백한 고장).
 *    *"노드는 있는데 콜이 0"* 은 빈 리스트일 수 있어 여기서 단정하지 않는다 (규칙 ⑤-4 ②).
 *    옛 APK 는 이 값을 안 보내므로(`undefined`) 아무 판단도 하지 않는다 — 호환.
 */
function applyBlindSignal(session: DeviceSession, screenNodeCount?: number, isScreenOn?: boolean): void {
    if (isScreenOn !== undefined) session.isScreenOn = isScreenOn;

    /**
     * 💤 **화면이 꺼져 있으면 노드가 0인 게 당연하다** (기사님 확정).
     *
     * 그걸 "못 읽음"으로 부르면 기사님이 폰을 끌 때마다 거짓 경고가 뜬다 —
     * **당연한 것을 고장이라 하지 않는다.** 화면 꺼짐은 별도로 표시한다(💤).
     */
    if (session.isScreenOn === false) {
        session.blindSince = undefined;
        return;
    }

    if (screenNodeCount === undefined) return;          // 원달앱이 처음 화면을 읽기 전 · drive 보고에서도 온다 — 모르는 것은 판단하지 않는다
    session.screenNodeCount = screenNodeCount;

    if (screenNodeCount > 0) {
        if (session.blindSince) {
            slog('화면', `👁️ [화면 복구] ${deviceLabelOf(session.deviceId)} — 다시 읽고 있습니다 (노드 ${screenNodeCount}개)`);
        }
        session.blindSince = undefined;
        return;
    }
    if (!session.blindSince) {
        session.blindSince = Date.now();
        console.warn(`👁️ [화면 못 읽음] ${deviceLabelOf(session.deviceId)} — 접근성 트리가 안 옵니다. ` +
            `${BLIND_GRACE_MS / 1000}초 더 이어지면 관제탑에 알립니다`);
    }
}

/**
 * App에서 화면이 변경되거나 주기적으로 스크랩 데이터를 전송할 때 세션 갱신
 * @returns 현재 기기의 관제 모드 (AUTO | MANUAL)
 */
/**
 * 📦🚦🎛️ **폰 상태 바가 쓰는 셋**.
 * 앱 안엔 있었는데 여태 안 올라오던 값들이다 — 서버는 **받아 적기만** 한다.
 * ⚠️ 구앱은 안 보낸다 → `undefined` 로 남고, 화면이 아무것도 안 그린다 (규칙 ④).
 */
export interface DeviceStatusExtras {
    appVersion?: string;
    /** 🚧 통과 콜이 있는데 앱이 안 연 까닭 열쇠 — 목록 보고에만 · 없으면 앱이 열었다 (원달앱 ScrapPayload.openBlocked · shared `OPEN_BLOCKED`) */
    openBlocked?: string;
    workStage?: string;
    workStageStep?: number;
    workStageSeconds?: number;
    appliedMode?: string;
    /** 📶 관제앱이 블루투스로 준 마지막 모드 · 공급 연결 · 근처 기기 허락 · 배터리 예외(원달앱 보고) */
    suppliedMode?: string;
    supplyLinked?: boolean;
    nearbyPermitted?: boolean;
    batteryExempt?: boolean;
    /** 🎛️ 이 배차망에서 실제로 도는 모드 — 원달앱이 플러그인 `availableModes` 로 계산한다 (`DeviceSession.effectiveMode`) */
    effectiveMode?: string;
    /**
     * 🧬 **폰이 «들고 온» 콜 필터의 지문** (현황판 담당 요청 ②).
     *    서버가 내려보낸 것이 아니라 **앱이 실어 보낸 것**이다 — 그래야
     *    «이 폰이 아직 옛 필터로 돌고 있다»가 드러난다 (`DeviceSession.filterVersion` 주석).
     */
    filterVersion?: string;
    /** 🧭 배차망 페이지 이름 · 덧칸 이름 — 새 원달앱만 싣는다 · 화면 값이 실린 보고에서만 받는다 */
    screenPage?: string | null;
    screenOverlay?: string | null;
}

export const touchDeviceSession = (deviceId: string, userId: string, addedPollCount: number = 0, screenContext?: ScreenContextType, io?: any, isHolding?: boolean, lat?: number, lng?: number, screenNodeCount?: number, isScreenOn?: boolean, filterTally?: FilterTally, targetApp?: TargetAppType, extras?: DeviceStatusExtras): DeviceModeType => {
    heardSinceBoot.add(deviceId);
    let session = activeDevices.get(deviceId);
    /** 🧹 직전 화면 — 아래에서 덮기 전에 챙긴다. «콜이 생길 때 이미 상세였나»(`markDetailSeen`)가 이 값을 본다 */
    const prevScreen = session?.screenContext;
    /** 🖥️ 이 보고로 화면 칸(값 · 페이지 이름 · 덧칸)이 바뀌었나 — 끝에서 관제웹에 한 번 바로 보낸다 */
    let screenChanged = false;

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
            /* 📍 위치가 실린 보고의 서버 시각 — 위치 없이 시작하면 칸이 없다(모른다) */
            ...(lat !== undefined && lng !== undefined ? { lastLocationAt: Date.now() } : {}),
            stats: { polled: addedPollCount, grabbed: 0, canceled: 0 }
        };
    } else {
        // OFFLINE → ONLINE 복귀 시 사용자가 지정했던 모드를 되살립니다.
        //
        // ⚖️ 설계 결정 (승욱님 확인):
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
                slog('통신', `🔄 [모드 복원] 기기(${deviceLabelOf(deviceId)}) 온라인 복귀 → ${session.mode} → ${restored}`);
            }
            session.mode = restored;
        }

        /**
         * ⏱️ **덮기 전에 직전 보고 시각을 챙긴다** (기사님 확정).
         *
         * 앱은 **화면에 일이 생기면 그때** 보내고, 아무 일도 없으면 **60초마다** 살아있다고만
         * 알린다. 그래서 «마지막 두 보고의 간격»이 곧 *"그 사이에 일이 있었나"* 다 —
         * 관제웹이 누른 모드·필터가 **1~2초에 닿을지 최대 60초를 기다릴지**가 거기서 갈린다.
         *
         * 🔴 `lastSeen` 을 덮으면 옛 값이 사라져 **영영 물을 수 없다.** 이 한 줄이 전부다.
         * ⚠️ 침묵 처리(0)된 폰은 옮기지 않는다 — 0 과의 간격은 «모른다»가 맞다 (규칙 ④).
         */
        session.prevSeen = session.lastSeen > 0 ? session.lastSeen : undefined;
        session.lastSeen = Date.now();
        session.status = "ONLINE"; // 데이터가 왔으므로 다시 활성화
        // 📵 다시 말을 걸어왔다 — 옛 «왜 끊겼나»는 이제 거짓말이다
        session.offlineReason = undefined;
        session.stats.polled += addedPollCount;
        if (screenContext) {
            /**
             * 🖥️ **화면이 바뀐 보고만 한 줄 남긴다** (기사님 지시:
             * *"페이지 바뀌거나 할 때 post 로 서버로 값을 보내는 거지? 그때 콘솔을 꼭 넣어서
             * 트래킹 할 수 있게 해 줘."*).
             *
             * 🔴 **간격을 함께 적는다.** 그 숫자가 *"앱이 알아채는 데 얼마나 걸렸나"* 를 말한다 —
             *    예: 정지 화면에서 18.3초가 걸린다는 것을 이 숫자로 안다.
             * ⚠️ **판정을 적지 않고 사실만 적는다** — «조용/움직임»을 여기서 정하면
             *    같은 값을 두 곳이 각자 판정하게 된다 (규칙 ⑤-4 ⑤ · 판정은 `isDeviceQuiet` 하나).
             */
            const newPage = extras?.screenPage ?? undefined;
            const newOverlay = extras?.screenOverlay ?? undefined;
            if (session.screenContext !== screenContext || (session.screenPage ?? undefined) !== newPage || (session.screenOverlay ?? undefined) !== newOverlay) {
                screenChanged = true;
                const gap = session.prevSeen ? `${((session.lastSeen - session.prevSeen) / 1000).toFixed(1)}초 만` : '첫 보고';
                // 배차망은 이 보고에 실려 온 것이 먼저다 — 아래에서 갱신되기 전이라 옛 값을 쓰면
                // 픽커로 바꾼 첫 보고가 인성 이름표로 찍힌다 («읽지 않고 단언한다» 와 같은 결)
                const net = targetApp ?? session!.targetApp;
                /* 🧭 페이지 이름이 실려 오면 그 이름(+ «· 덧칸») · 옛 원달앱은 화면 값의 이름표 */
                const name = (c?: ScreenContextType, page?: string | null, overlay?: string | null) =>
                    page ? (overlay ? `${page} · ${overlay}` : page) : (screenLabelOf(net, c)?.label ?? c ?? '모름');
                slog('화면', `🖥️ [화면 바뀜] ${session.deviceName || deviceId} · ` +
                    `${name(session.screenContext, session.screenPage, session.screenOverlay)} → ${name(screenContext, newPage, newOverlay)} · 직전 보고와 ${gap}`);
                /* ⚪ 상세에서 나가면 평가 자리의 «판정 못 함»을 지운다 — 들어올 때 지우면 먼저 닿은 요건 미달 보고를 곧바로 지운다(다른 길이라 순서가 없다) */
                if (isDetailScreen(session.screenContext) && !isDetailScreen(screenContext)) io?.to(userId).emit('detail-unreadable-clear');
            }
            session.screenContext = screenContext;
            session.screenPage = newPage;
            session.screenOverlay = newOverlay;
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
            session.lastLocationAt = session.lastSeen;   // 📍 위치가 실린 보고만 민다 — 운영센터 홈 «기사 이상»이 관제웹 GPS 와 함께 본다
        }
    }

    /**
     * 📦🚦🎛️ **받아 적기만 한다** — 서버가 해석하지 않는다 (규칙 ⑤ · 원천은 앱이다).
     * 🔴 안 온 값으로 옛 값을 지우지 않는다. 구앱이 섞이면 화면이 깜빡인다.
     */
    if (extras?.appVersion) session.version = extras.appVersion;
    if (extras?.workStage) {
        session.workStage = extras.workStage;
        // 숫자는 **그 칸이 쓰는 것만** 남긴다 — 옛 «팝업 2»가 «안전취소»에 붙으면 거짓말이다
        session.workStageStep = extras.workStageStep;
        session.workStageSeconds = extras.workStageSeconds;
    }
    if (extras?.appliedMode) session.appliedMode = extras.appliedMode;
    /* 📶 블루투스 · 폰 사실 넷 — 받아 적기만(옛 원달앱은 안 보냄 → 그대로) */
    if (typeof extras?.suppliedMode === 'string') session.suppliedMode = extras.suppliedMode;
    if (typeof extras?.supplyLinked === 'boolean') session.supplyLinked = extras.supplyLinked;
    if (typeof extras?.nearbyPermitted === 'boolean') session.nearbyPermitted = extras.nearbyPermitted;
    if (typeof extras?.batteryExempt === 'boolean') session.batteryExempt = extras.batteryExempt;
    /* 🎛️ 자동 잡기 허락이 지금 살아 있나 — 폰 보고마다 적는다(메모리). 꺼지면 AUTO 명령도 폰은 ALARM 이라 관제웹 «적용중» · 도는 모드가 이것을 본다 (shared `phoneModeOf`) */
    session.autoAllowed = allowanceOf(userId).autoLive;
    /**
     * 🎛️ **도는 모드가 명령과 갈리는 순간 · 다시 같아지는 순간만 한 줄** (하트비트마다 찍으면 로그가 덮인다).
     * 픽커는 자동이 없어 자동 명령이 알람으로 돈다 — 언제 시작해 언제 끝났는지가 남아야 한다.
     */
    if (extras?.effectiveMode) {
        const wasSplit = !!session.effectiveMode && session.effectiveMode !== session.mode;
        session.effectiveMode = extras.effectiveMode;
        const isSplit = session.effectiveMode !== session.mode;
        if (isSplit !== wasSplit) {
            slog('통신', isSplit
                ? `🎛️ [모드] ${session.deviceName || deviceId} 명령 ${session.mode} → ${session.targetApp ?? '?'} 에서 ${session.effectiveMode} 로 돈다`
                : `🎛️ [모드 복귀] ${session.deviceName || deviceId} 명령 ${session.mode} 그대로 돈다`);
        }
    }
    /**
     * 🧬 **지문은 «받은 그 순간»과 함께 남긴다** (현황판 담당 요청 ②).
     * ⚠️ 구앱은 안 보낸다 — 그때는 **건드리지 않는다**. 옛 지문이라도 «마지막으로 안 것»이
     *    남아 있어야 화면이 «구앱이라 모른다»와 «두 판 전이다»를 가른다 (규칙 ④).
     */
    if (extras?.filterVersion) {
        session.filterVersion = extras.filterVersion;
        session.filterVersionAt = Date.now();
    }

    // 새 세션이든 갱신이든 **한 곳에서** 본다 — 두 갈래에 나눠 적으면 한쪽만 고쳐진다
    applyBlindSignal(session, screenNodeCount, isScreenOn);
    /**
     * 👁️ **마지막 스캔의 필터 성적표를 그대로 얹는다** (기사님 확정).
     *
     * 서버가 만드는 값이 아니라 **앱이 판정한 사실**이라 해석하지 않고 옮기기만 한다.
     * 안 온 스캔(하트비트·상세 화면)에서는 **직전 값을 지우지 않는다** — 리스트를 안 보는
     * 동안 화면이 빈칸이 되면 *"필터가 죽었나"* 로 읽힌다. 마지막으로 본 것이 답이다.
     */
    if (filterTally) {
        session.filterTally = filterTally;
        /**
         * 🕐 **받은 순간을 서버 시계로 찍는다** (기사님 지적).
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
         * 🔔 **알람 모드 — 필터를 통과한 콜이 떴다** (기사님 확정).
         *
         * 앱은 이 모드에서 **확정·수락을 누르지 않는다.** 원달앱이 상세까지 열고 기사님이 누르므로,
         * 서버가 할 일은 *"통과한 콜이 지금 리스트에 있다"* 를 관제웹에 알리는 것뿐이다.
         *
         * 🔴 **새로 알람감이 된 통과 콜로 가른다**(`passedNew`) — `passed` 는 같은 콜이 목록에 남거나 픽커가 요금만 올려도
         *    다시 차서, 같은 콜에 15~45초마다 삑이 났다. 앱이 이미 알람을 낸 콜(상차+하차)을 기억해 새 것만 센다.
         *    옛 앱은 `passedNew` 가 없어 `passed` 로 가른다.
         *
         * 🔴 **여기 안에서만 본다.** `filterTally` 가 함께 온 보고, 즉 «방금 리스트를 훑었다»
         *    일 때만 참이다. 밖으로 빼면 하트비트마다 옛 숫자로 다시 울린다.
         */
        // 🎛️ 명령이 아니라 **도는 모드**로 — 픽커는 자동 명령이 알람으로 돌아 폰이 울린다, 관제웹도 함께 (기사님 «가»)
        /* 🔔 새로 알람감이 된 통과 콜만 — 같은 콜이 목록에 남거나 요금만 올라도 다시 울리던 것 (옛 앱은 passedNew 가 없어 passed) */
        const alarmPassed = filterTally.passedNew ?? filterTally.passed;
        const openBlocked = extras?.openBlocked;
        const alarmBody: FilterPassAlarm = {
            deviceId,
            deviceName: session.deviceName,
            /* 🔢 목록에 보이는 통과 수 · 소리는 새로 통과 수(passedNew)로 가른다 */
            passed: filterTally.passed,
            passedNew: alarmPassed,
            seen: filterTally.seen,
            at: session.lastSeen,
        };
        if (runningModeOf(session) === "ALARM" && alarmPassed > 0 && io) {
            io.to(userId).emit("filter-pass-alarm", alarmBody);
            slog('필터', `🔔 [알람] ${deviceLabelOf(deviceId)} — 본 ${filterTally.seen}건 중 통과 ${filterTally.passed}건${filterTally.passedNew != null ? ` (새로 ${filterTally.passedNew}건)` : ''}` +
                `${openBlocked ? ` · 앱이 못 연 까닭 ${openBlocked}` : ''}. 기사님이 직접 누르십니다`);
        }
    }
    activeDevices.set(deviceId, session);

    // [모드 동기화] 유저 세션의 filterEnabledByMode 가 현재 기기들의 모드 상태와 일치하는지 확인 및 자동 동기화
    const userSession = getUserSession(userId);
    const userDeviceIds = db.prepare("SELECT device_id FROM user_devices WHERE user_id = ?").all(userId).map((r: any) => r.device_id);
    const hasFilteringDevice = Array.from(activeDevices.values()).some(d =>
        userDeviceIds.includes(d.deviceId) && (d.mode === "AUTO" || d.mode === "ALARM" || d.mode === "SIMULATION")
    );
    if (userSession.filterEnabledByMode !== hasFilteringDevice) {
        userSession.filterEnabledByMode = hasFilteringDevice;
        updateActiveFilter(userId, { isActive: hasFilteringDevice }, io);
    }

    // [Zero-Latency 동기화 핵심 로직] 
    // 기사님이 수동으로 닫기를 누르거나 오더가 사라져서 안드로이드 앱이 리스트 화면으로 이탈했다면, 
    // 서버가 쥐고 있는 대기 중(롱폴링)인 콜 결정을 즉시 강제 파괴하여 데드락을 방지합니다!
    /**
     * 🔴 "리스트 계열인가"는 `shared.isListScreen` 이 유일한 정의다.
     *    `=== 'LIST'` 로 직접 판정하면 앱이 리스트로 치는 `LIST_COMPLETED` 가 **새어 나가** 유령 카드가 남는다.
     */
    /**
     * 🔴 **상세를 본 콜만 목록 보고 때 치운다** (#154) — «지금 목록»이나 «직전 화면»으로 가르지 않는다.
     *    카드를 여는 순간 폰이 아직 안 그려진 옛 목록 화면을 한 번 더 보내거나(시뮬레이터 22:15),
     *    «알 수 없는 화면»이 잠깐 끼면(실제 픽커 9/02) 방금 연 콜을 치웠다. 상세를 봤나는 `markDetailSeen` 한 곳이 적는다.
     */
    markDetailSeen(userId, deviceId, screenContext, prevScreen);
    /**
     * ⏳ **스치는 화면(`BLIP_SCREENS` — 알 수 없음 · 넘어가는 중)이 이어진 시간을 잰다** — 상세든 목록이든 다른 화면이 오면 지운다.
     *    카드를 여는 순간 잠깐 끼는 것(0.05~0.7초)과 **앱 밖으로 나간 것**을 가르는 값이다 (`leftDetail`).
     */
    if (isBlipScreen(screenContext)) session.unknownSince ??= Date.now();
    else if (screenContext) session.unknownSince = undefined;

    /**
     * 👀 **미리보기는 그 폰이 상세를 보고 있는 동안만 산다** (기사님 확정).
     *
     * 기사님: *"미리보기 끄는 건 그 미리보기 판정을 연 스캔폰의 상태값 즉 상세페이지일 때만 노출하고
     * 페이지를 이탈하면 끄는 걸로 예외 없이 적용해."*
     *
     * 🔴 **미리보기가 아닌 콜은 옛 규칙(목록 복귀) 그대로다** — AUTO 롱폴링을 푸는 것이고,
     *    직접 잡은 콜은 서버가 버리지 않는다 (규칙 ①).
     */
    {
        /* 👀 미리보기는 이 한 자리가 치운다 — 목록도 «상세를 떠났다»에 든다(목록 갈래는 미리보기가 아닌 콜만) */
        const pv = previewOfDevice(getUserSession(userId), deviceId);
        if (pv) {
            /* 🔴 상세를 아직 못 봤으면 «열리는 중»이다 — 치우지 않는다 (#154) */
            if (!pv.order.detailSeen) {
                slog('화면', `👀 [상세 못 봄 · 안 치움] ${pv.id} — 카드가 아직 열리는 중이다 (화면: ${screenContext ?? '모름'})`);
            } else if (leftDetail(session)) {
                /* ⏩ 빨리 접기 콜이면 막대 끝(judgeUntil)과 실제 접힘의 차이를 한 줄로 — 폰이 한 손이라 1~2초 늦을 수 있다 */
                if (pv.order.foldAfterSec != null && pv.order.judgeUntil != null) {
                    const gap = Date.now() - pv.order.judgeUntil;
                    slog('화면', `⏱️ [빨리 접기] 막대 끝 → 접힘 ${gap >= 0 ? '+' : ''}${gap} ms`);
                }
                clearPreview(userId, deviceId, pv.id, io, `상세 이탈 — 화면: ${screenNowOf(session) ?? '끊김'}`);
            }
        }
    }
    if (isListScreen(screenContext, targetApp ?? session.targetApp, extras?.screenPage)) {
        /* 🔑 이 보고를 올린 폰의 기사 — 폰 문(authDevice)이 이미 정했다 · 가짜 기사로 받지 않는다 */
        const userSession = getUserSession(userId);
        const stuckOrderId = userSession.deviceEvaluatingMap.get(deviceId);
        if (stuckOrderId) {
            const stuckOrder = userSession.pendingOrdersData.get(stuckOrderId);
            /**
             * 🔄 **미리보기는 리스트로 돌아가면 즉시 정리한다** (기사님 실측).
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
            /* 👀 미리보기는 위 «상세를 떠났다» 한 자리가 치웠다(또는 상세를 아직 못 봐 남겼다) — 여기는 미리보기가 아닌 콜만 */
            if ((stuckOrder as any)?.isPreview) {
                /* 같은 일을 두 번 하지 않는다 */
            } else if (stuckOrder && !stuckOrder.type?.startsWith("MANUAL") && !(stuckOrder as any).detailSeen) {
                slog('화면', `👀 [목록 보고 · 안 치움] ${stuckOrderId} — 이 콜의 상세를 아직 못 봤다 (옛 화면 보고일 수 있다)`);
            } else if (stuckOrder && !stuckOrder.type?.startsWith("MANUAL")) {
                /**
                 * 🔴 **잡은 콜은 목록으로 갔다고 바로 죽이지 않는다** (기사님 · 실주행 04:31).
                 *
                 * 오송읍에서 콜 셋이 나가던 날, 앱이 하나를 잡고 **다음 콜을 잡으러 목록으로 돌아가자**
                 * 서버가 이것을 «버렸다»로 읽고 강제 취소했다 — 취소 카운트까지 +1 됐다.
                 * 목록으로 돌아간 같은 행동이 «안 잡겠다»와 «다음 것도 잡겠다» 두 뜻을 갖는다.
                 *
                 * 🔴 **가르는 사실은 «곧 새 콜을 잡았나» 하나다.** 그래서 잠깐 기다렸다가,
                 *    그 사이 이 기기가 다른 콜로 옮겨 갔으면 이 콜은 손대지 않는다.
                 *    기다리는 동안 기사님이 결재하시면 그 길이 먼저 치운다.
                 * 🔴 기다림은 장부(`state/waits.ts`)로 건다 — 콜이 끝나면 그 콜 것이 함께 꺼진다.
                 */
                const key = `listExit_${stuckOrderId}`;
                if (!userSession.entries.has(key)) {
                    slog('화면', `🚀 [화면 이탈 감지] 기기(${deviceLabelOf(deviceId)})가 리스트 화면으로 이탈함! 그 사이 다음 콜을 잡으면 안 치웁니다.`);
                    armWait(userSession, key,
                        { label: '목록 이탈 유예', armedBy: '화면 보고', ms: LIST_EXIT_GRACE_MS, orderId: stuckOrderId, tag: '화면' }, () => {
                        /* 🎫 아직도 이 콜이 «지금 심사 중»이면 정말 버린 것이다 */
                        if (userSession.deviceEvaluatingMap.get(deviceId) !== stuckOrderId) {
                            slog('화면', `   ✅ [이탈 유예] ${stuckOrderId} — 그 사이 다음 콜로 옮겨 갔습니다. 안 치웁니다.`);
                            return;
                        }
                        if (!userSession.pendingOrdersData.has(stuckOrderId)) return;   // 이미 다른 길이 치웠다
                        slog('화면', `   🧹 [이탈 유예 끝] ${stuckOrderId} — 새 콜이 안 왔습니다. 대기 중이던 AUTO 롱폴링 파이프 강제 파괴.`);
                        forceCancelEvaluatingOrder(userId, stuckOrderId, io);
                    });
                }
            }
        }
    }

    /* 🖥️ 화면이 바뀐 보고는 관제웹 폰 줄 배지로 곧바로 — 1초 주기 방송(socketHandlers)을 기다리지 않는다 · 이 보고의 칸을 다 적은 뒤 한 번 */
    if (screenChanged) io?.to(userId).emit("telemetry-devices", getUserDevicesSnapshot(userId, io));

    return session.mode;
};

/** 이 기기의 사용자 — `user_devices` 에 없으면 null (연결 안 된 폰 · 가짜 기사로 받지 않는다) */
export function userOfDevice(deviceId: string): string | null {
    const row = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as any;
    return row?.user_id ?? null;
}

/** 📋 이 기기가 지금 목록 계열 화면인가 — 화면 값 · 배차망 · 페이지 이름으로(`isListScreen`) */
export function deviceOnList(deviceId: string): boolean {
    const s = activeDevices.get(deviceId);
    return !!s && isListScreen(s.screenContext, s.targetApp, s.screenPage);
}

/** 이 기기가 마지막으로 알린 화면 — 기기 세션이 없으면 undefined(모름) */
export function deviceScreenOf(deviceId: string): ScreenContextType | undefined {
    return activeDevices.get(deviceId)?.screenContext;
}

/** 상세 계열 화면인가 — 목록도 스치는 화면(알 수 없음 · 넘어가는 중)도 아니다. 홈 · 내 오더 · 배차망 메뉴 · 운행 화면도 여기서는 참이다 */
const isDetailish = (s?: string | null): boolean => !!s && !isBlipScreen(s) && !isListScreen(s);

/**
 * 👀 **이 폰이 상세를 떠났나 — 미리보기 노출의 유일한 기준** (기사님 확정).
 *
 * 🔴 **끊긴 폰은 화면을 말하지 않는다** (`screenNowOf`) — 마지막으로 들은 «상세»는 «아까 그것»이라,
 *    그대로 쓰면 전원이 나간 폰의 심사석이 영영 안 꺼진다.
 * 🔴 **«상세»는 양의 목록이다** (`DETAIL_SCREENS`) — 팝업은 상세 위에 뜬 것이라 이탈이 아니고,
 *    `HOME` · `MY_ORDERS` · 운행 화면은 상세가 아니다.
 * ⏳ **스치는 화면(알 수 없음 · 넘어가는 중)만 유예가 있다** — 스치는 것은 이탈이 아니고, 이어지면 이탈이다.
 *    이것은 콜의 수명을 재는 타이머가 아니라 «이탈»의 정의에 든 시간이다.
 */
function leftDetail(session: DeviceSession): boolean {
    const now = screenNowOf(session);
    if (!now) return true;
    if (isDetailScreen(now)) return false;
    if (isBlipScreen(now)) {
        const since = session.unknownSince;
        return !!since && Date.now() - since >= UNKNOWN_LEAVE_SEC * 1000;
    }
    return true;
}

/**
 * 👁️ **심사 중인 콜의 상세를 봤나** (#154) — 콜이 생긴 뒤 상세 계열 보고가 왔거나, 생긴 뒤 첫 보고 때 직전 화면이 이미 상세였으면 본 것이다.
 * 한 번 본 콜은 계속 본 것이다. 목록 보고 때 치울지는 이 표시 하나로 가른다.
 */
function markDetailSeen(userId: string, deviceId: string, screenContext?: string, prevScreen?: string): void {
    if (!screenContext) return;
    const userSession = getUserSession(userId);
    const id = userSession.deviceEvaluatingMap.get(deviceId);
    const o = id ? userSession.pendingOrdersData.get(id) as any : null;
    if (!o || o.detailSeen) return;
    o.detailSeen = isDetailish(screenContext) || (o.detailSeen === undefined && isDetailish(prevScreen));
}

/**
 * 🛟 **이 기기의 미리보기를 치운다** (#155) — 폰이 끊겨 «목록으로 돌아왔다»가 영영 안 올 때.
 * 🔴 수락 안 한 미리보기만 — 기사님이 잡은 콜은 서버가 버리지 않는다 (규칙 ①). 확정된 콜은 `forceCancelEvaluatingOrder` 가 한 번 더 막는다.
 * @returns 치웠나
 */
export function cleanPreviewOfDevice(userId: string, deviceId: string, io: any, why: string): boolean {
    const pv = previewOfDevice(getUserSession(userId), deviceId);
    if (!pv) return false;
    clearPreview(userId, deviceId, pv.id, io, `${why} — 기기가 보고를 못 보내 서버가 치운다`, 'TIMEOUT');
    return true;
}

/** 👀 이 기기가 지금 심사 중인 미리보기 — 아니면 null. 미리보기를 치우는 두 자리(상세 이탈 · 통신 두절)가 이것 하나로 찾는다 */
function previewOfDevice(userSession: ReturnType<typeof getUserSession>, deviceId: string): { id: string; order: any } | null {
    const id = userSession.deviceEvaluatingMap.get(deviceId);
    const order = id ? userSession.pendingOrdersData.get(id) as any : null;
    return id && order?.isPreview ? { id, order } : null;
}

/** 👀 미리보기를 치운다 — 아직 안 잡은 콜이라 기다릴 것이 없다. 치우는 길은 여기 하나 */
function clearPreview(userId: string, deviceId: string, id: string, io: any, why: string, reason?: 'TIMEOUT'): void {
    slog('콜단계', `👀 [미리보기 정리 · ${why}] ${id} — 기기(${deviceLabelOf(deviceId)})`);
    forceCancelEvaluatingOrder(userId, id, io, reason);
}

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

/**
 * GET /api/devices
 * 관제 대시보드에서 1초마다 현재 모든 기기의 상태를 조회
 */
/**
 * @param io 소켓 — 데드맨이 끊김으로 넘기며 미리보기를 치울 때 관제웹에 알린다. 없으면 치우되 방송만 못 한다
 */
export const getActiveDevicesSnapshot = (io?: any): DeviceSession[] => {
    const now = Date.now();
    const result: DeviceSession[] = [];

    activeDevices.forEach((session, key) => {
        // [퇴근 모드 처리] 더 이상 SHUTDOWN은 없으므로, 핑이 오랫동안 끊기면 완전히 메모리에서 치우기만 합니다
        if (now - session.lastSeen > DEVICE_FORGET_MS) {
            activeDevices.delete(key);
            return;
        }

        // 데드맨 스위치: 일정 시간 핑이 없으면 통신 단절(OFFLINE) 표기
        // mode를 MANUAL로 강제하던 로직 제거.
        // 통신이 끊긴 기기는 어차피 콜을 못 잡으므로 모드를 바꿀 실익이 없는 반면,
        // 한 번 MANUAL로 떨어지면 복귀 후에도 되돌아오지 않아 콜 잡기가 멈추는 부작용만 컸습니다.
        // 관제탑 UI에는 status(OFFLINE)가 별도로 표시되므로 식별에도 문제가 없습니다.
        if (now - session.lastSeen > DEADMAN_TIMEOUT_MS) {
            const wasOnline = session.status !== "OFFLINE";
            session.status = "OFFLINE";
            /**
             * 📡 **말이 끊긴 것과 앱이 «꺼진다»고 말한 것은 다르다** (기사님 지시).
             *    앱이 보낸 까닭이 있으면 그대로 두고, 없을 때만 «통신 두절»로 적는다 — 지어내지 않는다 (규칙 ④).
             */
            session.offlineReason ??= 'NO_CONTACT';
            /**
             * 🛟 **끊긴 폰의 미리보기는 여기서 치운다** — 앱이 죽거나 통신이 끊기면 «목록으로 돌아왔다»도
             *    «오프라인이 된다»도 영영 안 온다. 이 길이 없으면 심사석을 치울 사람이 아무도 없다.
             *    🔴 넘어가는 순간 한 번만 — 매 스냅샷마다 부르면 이미 치운 콜을 계속 찾는다.
             */
            const owner = wasOnline ? userOfDevice(session.deviceId) : null;
            if (owner) cleanPreviewOfDevice(owner, session.deviceId, io, "통신 두절");
        }

        result.push(session);
    });

    return result;
};

/**
 * GET /api/devices (유저별)
 * DB에 등록된 유저의 기기 목록을 바탕으로, 활성 세션 상태(Memory)를 병합하여 반환합니다.
 */
export const getUserDevicesSnapshot = (userId: string, io?: any, modes: Map<string, DeviceModeType> = sentModesOf(userId)): DeviceSession[] => {
    // 1. DB에서 해당 유저의 등록 기기 조회
    const registered = db.prepare("SELECT device_id, device_name FROM user_devices WHERE user_id = ?").all(userId) as any[];

    // 2. 전체 활성 기기 스냅샷 (데드맨 갱신됨)
    const allActive = getActiveDevicesSnapshot(io);
    
    const result: DeviceSession[] = [];
    
    for (const r of registered) {
        const activeItem = allActive.find(d => d.deviceId === r.device_id);
        
        if (activeItem) {
            // 메모리 객체에 최신 이름 덮어쓰기
            activeItem.deviceName = r.device_name || activeItem.deviceName;
            /* 📶 기기 목록에만 붙이는 셋 — 서버가 보내는 모드(«적용중» 셈) · 필터 옛 판 · 블루투스로만 아는 폰 사실 · 세션은 안 고친다 */
            result.push({
                ...activeItem,
                sentMode: modes.get(r.device_id),
                filterStale: phoneCheckOf(activeItem, sentFilterVersionOf(r.device_id), Date.now()).filter.state === 'stale',
                ...phoneStatusOf(r.device_id),
            });
        } else {
            // 완전 비활성 상태인 등록 기기도 UI 표시용으로 내려줌
            result.push({
                deviceId: r.device_id,
                deviceName: r.device_name,
                lastSeen: 0,
                status: "OFFLINE",
                /* ⏳ 서버가 뜬 뒤 아직 못 들었으면 «로딩 중» · 들은 뒤 치운 폰이면 진짜 끊김(통신 두절) */
                offlineReason: heardSinceBoot.has(r.device_id) ? 'NO_CONTACT' : 'NOT_HEARD_YET',
                mode: viewModeOf(r.device_id, userId),
                ...phoneStatusOf(r.device_id),   // 보고가 이 서버에 안 오는 폰(다른 서버 · 연결 풀림)도 블루투스로는 안다
                screenContext: "UNKNOWN",
                stats: { polled: 0, grabbed: 0, canceled: 0 }
            });
        }
    }
    
    return result;
};

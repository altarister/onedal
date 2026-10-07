/**
 * 📱 **기기 표 — 폰마다 메모리에 든 상태 · 등록 폰 장부(DB) 읽기** (모드 · 데드맨 · 등록 폰 · 지금 화면 · 통계).
 * 세션 저장소 · 장부만 쓰는 아래층이다 — 보고 처리(`deviceSessions`)와 공급 · 폰 상태 · 취소 셈이 여기서 읽는다(순환 풀기: 아래층은 위층을 모른다).
 * 바깥 일을 하는 함수: saveModePreference · registeredPhonesOf · demoteOtherAutoPhones · userOfDevice · resolveDefaultMode · viewModeOf · lookupDeviceName(장부(DB)) · livePhonesOf · otherAutoPhoneOf · getDeviceMode · incrementDeviceStats · deviceOnList · deviceScreenOf(기기 표 · 지금 시각 · 로그) (끊김 · 필터 거는 폰 셈 deadmanFrom · filteringDeviceFrom 은 값만 받는다)
 */
import { otherContractingAuto, type PhoneForAuto } from "@onedal/shared";
import { DeviceSession, DeviceModeType, isDeviceMode, ScreenContextType, isListScreen } from "@onedal/shared";
import { getUserSession, peekUserSession, baseFilterFromDb } from "./userSessionStore";
import db from "../db";
import { slog } from "../utils/fileLogger";
import { deviceLabelOf } from "../core/deviceAuth";

// 메모리 내부 세션 저장소 (앱폰 -> 서버 핑 유지용)
export const activeDevices = new Map<string, DeviceSession>();

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
    return ids.filter(id => { const s = activeDevices.get(id); return !!s && !deadmanFrom(s.lastSeen, now); });
}

/** 📡 말이 끊겼나 — 값만 받는 셈 (마지막 보고 시각 · 지금 시각). 데드맨 시간을 넘으면 끊김 */
export function deadmanFrom(lastSeen: number, nowMs: number): boolean {
    return nowMs - lastSeen > DEADMAN_TIMEOUT_MS;
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
export function resolveDefaultMode(deviceId: string, userId: string): DeviceModeType {
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
export function viewModeOf(deviceId: string, userId: string): DeviceModeType {
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

// ═══════════════════════════════════════
// 유틸: deviceId로 DB에서 deviceName 1회 조회 (캐싱 목적)
// ═══════════════════════════════════════
export function lookupDeviceName(deviceId: string): string | undefined {
    try {
        const row = db.prepare("SELECT device_name FROM user_devices WHERE device_id = ?").get(deviceId) as any;
        return row?.device_name || undefined;
    } catch {
        return undefined;
    }
}

/** 🎛️ 이 기사님 폰 가운데 필터를 거는 모드(자동 · 알람 · 시뮬레이션)인 폰이 있나 — 값만 받는 셈 (기기들 · 이 기사님 폰 번호) */
export function filteringDeviceFrom(devices: Iterable<Pick<DeviceSession, 'deviceId' | 'mode'>>, userDeviceIds: string[]): boolean {
    return Array.from(devices).some(d =>
        userDeviceIds.includes(d.deviceId) && (d.mode === "AUTO" || d.mode === "ALARM" || d.mode === "SIMULATION")
    );
}

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

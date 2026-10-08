import { MODE_TABLE } from './modeTable';

/**
 * 📱 관제 기기 관리 관련 타입 (Device Telemetry)
 */
export type DeviceStatusType = "ONLINE" | "OFFLINE";

/**
 * 🎛️ **기기 모드 셋 — 자동 · 알람 · 대기** (기사님 확정).
 *
 * | 화면 이름 | 키 | 필터 | 앱이 누르나 | 알람 |
 * |---|---|---|---|---|
 * | 자동 | `AUTO` | 돈다 | ✅ | — |
 * | 알람 | `ALARM` | 돈다 | ❌ | ✅ |
 * | 대기 | `MANUAL` | 돈다 (기록용) | ❌ | ❌ |
 *
 * 🔴 **「대기」에 새 키를 만들지 않았다.** 동작이 지금 `MANUAL` 과 완전히 같아서,
 *    키를 유지하면 서버·앱의 기존 분기가 한 줄도 안 바뀐다. 바뀌는 것은 화면 이름뿐이다.
 *
 * 🔴 **`STANDBY` 를 쓰지 않는다** — `dispatchPhase` 가 이미 그 낱말로 「첫짐 탐색」을
 *    가리킨다. 같은 말에 두 뜻을 주면 로그를 읽을 때 어느 쪽인지 모른다.
 *
 * 🔴 **«필터가 도는가» 와 «앱이 누르는가» 는 다른 물음이다** (에 갈랐다).
 *    자동·알람은 둘 다 필터가 돈다(`hasFilteringDevice` → `isActive`). 누르는 것은 자동뿐이다
 *    (앱의 `currentMode == "AUTO"`). 값이 둘이던 시절엔 그 둘이 같은 말이라 한 값으로 썼는데,
 *    앱의 `decide()` 가 `isActive` 로 끊으므로 **섞어 두면 알람에서 필터가 통째로 죽는다.**
 *
 * 🔴 **모드 이름을 다른 값으로 조립하지 않는다.** 앱이 `"${mode}_CLICK"` 으로 딱지를 만들어
 *    `"ALARM_CLICK"` 이 태어났고, 서버의 직접콜 보호가 그걸 못 알아봐 **기사님 콜이 강제
 *    취소**됐다. 콜의 출신은 `SessionManager.clickOrigin`(누가 눌렀나) 한 곳에서만 파생한다.
 *
 * 알람·대기로 잡은 콜은 기사님이 직접 누른 것이라 **직접콜**이고 심사하지 않는다 (규칙 ①).
 */
export const DEVICE_MODES = ["AUTO", "ALARM", "MANUAL", "SIMULATION"] as const;
export type DeviceModeType = typeof DEVICE_MODES[number];

/** 모르는 값을 모드로 받지 않는다 — 값이 늘어도 여기 한 곳만 본다 (규칙 ③) */
export function isDeviceMode(v: unknown): v is DeviceModeType {
    return typeof v === "string" && (DEVICE_MODES as readonly string[]).includes(v);
}

/** 화면에 적히는 이름 — MANUAL 의 화면 이름은 «직접», SIMULATION 의 화면 이름은 «자동(계약 안 함)» (기사님 확정 · 32 P1) */
export const DEVICE_MODE_LABEL = Object.fromEntries(DEVICE_MODES.map(m => [m, MODE_TABLE.acts[m].name])) as Record<DeviceModeType, string>;

/**
 * 🎛️ **관제앱이 고르는 모드는 셋 — «계약 안 함»은 넷째 모드가 아니라 자동의 스위치** (29 N1 · 32 P1 · 기사님 10-08 «가»).
 * 저장(`user_devices.mode` + `no_contract`)은 이 셋 + 칸이고, 서버 세션 · 폰 공급 · 판정이 읽는 명령 값(`DEVICE_MODES`)은 지금 그대로 넷이다 —
 * 자동 + 계약 안 함의 명령 값이 `SIMULATION` 이라 원달앱 · 체험 콜 표시는 한 줄도 안 바뀐다(옛 원달앱도 같은 값을 받는다).
 */
export const CHOSEN_MODES = ["AUTO", "ALARM", "MANUAL"] as const;
export type ChosenModeType = typeof CHOSEN_MODES[number];
/** 자동 + 계약 안 함의 명령 값 */
const NO_CONTRACT_COMMAND: DeviceModeType = "SIMULATION";

/** 저장 → 명령 — 확정을 누르는 모드(자동)에 계약 안 함이 켜져 있으면 SIMULATION · 옛 저장값 SIMULATION 도 SIMULATION · 모르는 값은 undefined */
export function commandModeOf(stored: unknown, noContract: boolean): DeviceModeType | undefined {
    if (!isDeviceMode(stored)) return undefined;
    return MODE_TABLE.acts[stored].contracts && noContract ? NO_CONTRACT_COMMAND : stored;
}

/** 명령 → 저장 — SIMULATION 은 자동 + 계약 안 함 · 나머지는 계약 안 함 칸을 건드리지 않는다(알람 · 직접으로 바꿨다 돌아와도 값이 남는다 · 기사님 «가») */
export function storedOf(command: DeviceModeType): { mode: ChosenModeType; noContract?: true } {
    return command === NO_CONTRACT_COMMAND ? { mode: "AUTO", noContract: true } : { mode: command as ChosenModeType };
}

/** 명령 → 관제앱 단추 — 계약 안 함은 «자동» 단추 */
export function chosenModeOf(command: DeviceModeType): ChosenModeType {
    return storedOf(command).mode;
}

/**
 * 🖱️ **잡은 방식 — 6하원칙의 «어떻게»** (기사님 확정).
 *
 * 원장 `orders.capturedVia` 에 기록만 한다: `AUTO`(앱이 누름) · `ALARM`(알람 듣고
 * 기사님이 누름) · `MANUAL`(기사님이 직접 골라 누름).
 *
 * 🔴 **기록이지 판단이 아니다.** 서버의 직접콜 보호(심사 없음·강제취소 없음)는
 *    여전히 `matchType`(AUTO/MANUAL 둘)만 본다 — #75 에서 모드 이름이 출신으로 새어
 *    기사님 콜이 취소된 사고 그대로, 이 값을 보호 분기에 쓰면 같은 사고가 재발한다.
 *    알람·직접은 보호상 똑같은 «기사님이 누른 콜»이고, 여기서는 일지가 그 둘을
 *    가려 보게 할 뿐이다 (⑤-4 ⑤: 읽는 곳 — 일지·통계만).
 */
export const CAPTURED_VIA = ["AUTO", "ALARM", "MANUAL"] as const;
export type CapturedViaType = typeof CAPTURED_VIA[number];

export function isCapturedVia(v: unknown): v is CapturedViaType {
    return typeof v === "string" && (CAPTURED_VIA as readonly string[]).includes(v);
}

/** 일지·화면용 이름 */
export const CAPTURED_VIA_LABEL: Record<CapturedViaType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
};

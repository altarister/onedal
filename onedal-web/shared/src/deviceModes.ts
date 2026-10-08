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

/** 화면에 적히는 이름 — MANUAL 의 화면 이름은 «직접», SIMULATION 의 화면 이름은 «체험» (기사님 확정) */
export const DEVICE_MODE_LABEL: Record<DeviceModeType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
    SIMULATION: "체험",
};

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

/* 📵 기기 꺼짐 까닭 — 작은 파일에 둔다: shared 안 파일(screenLabels)이 `./index` 에서 런타임 값을 가져오지 않게(순환) */
/**
 * 📵 **앱이 스스로 말해 준 까닭** — 앱만이 «접근성이 꺼졌다»를 사실로 안다 (모르면 `undefined`).
 * 🔴 서버가 판정하는 까닭을 여기 섞지 않는다 — 이 목록은 **앱 입력을 거르는 자**다 (`isDeviceOfflineReason`).
 */
export const DEVICE_OFFLINE_REASONS_APP = ["ACCESSIBILITY_OFF", "APP_SHUTDOWN"] as const;

/**
 * 📡 **서버가 판정하는 까닭** — 앱은 이 값을 보내지 않는다.
 *
 * `NO_CONTACT` 는 데드맨(`DEADMAN_TIMEOUT_MS` 무응답)이 붙인다. 앱이 «앱 꺼짐»을 보내고 죽은 것과
 * **말 없이 사라진 것**은 기사님이 하실 일이 다르다 — 앞은 앱을 켜면 되고, 뒤는 폰·통신을 봐야 한다.
 * `NOT_HEARD_YET` 은 서버가 뜬 뒤 이 폰의 보고를 아직 한 번도 못 들은 것이다 — 서버 메모리는 다시 뜨면 비어 있다.
 * 그 사이의 침묵은 폰이 끊긴 것이 아니라 서버가 아직 못 들은 것이다 · 첫 보고(목록 15초 · 그 밖 60초)가 오면 풀린다.
 */
export const DEVICE_OFFLINE_REASONS_SERVER = ["NO_CONTACT", "NOT_HEARD_YET"] as const;

export const DEVICE_OFFLINE_REASONS = [...DEVICE_OFFLINE_REASONS_APP, ...DEVICE_OFFLINE_REASONS_SERVER] as const;
export type DeviceOfflineReason = typeof DEVICE_OFFLINE_REASONS[number];

/** 📵 **앱이 보낸 까닭인가** — 앱 입력 검증 전용이라 서버 판정 값(`NO_CONTACT`)은 거짓이다 */
export function isDeviceOfflineReason(v: unknown): v is DeviceOfflineReason {
    return typeof v === "string" && (DEVICE_OFFLINE_REASONS_APP as readonly string[]).includes(v);
}
/** 📵 화면에 적을 말 — 기사님이 **무엇을 하셔야 하는지**가 갈리므로 낱말도 가른다 */
export const DEVICE_OFFLINE_LABEL: Record<DeviceOfflineReason, string> = {
    ACCESSIBILITY_OFF: "⚠️ 접근성 꺼짐",
    APP_SHUTDOWN: "🛑 앱 종료됨",
    /* 📡 말이 끊겼다 — 앱이 아무 말도 못 하고 사라졌다 (데드맨). «연결 끊김»보다 무엇이 일어났는지를 말한다 */
    NO_CONTACT: "📵 통신 두절",
    /* ⏳ 서버가 아직 못 들었다 — 끊겼다고 단언하지 않는다(기사님 «통신 끊김이라고 거짓말한 거야») */
    NOT_HEARD_YET: "⏳ 로딩 중",
};

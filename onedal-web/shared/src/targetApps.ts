/* 🌐 배차망 값 — 작은 파일에 둔다: shared 안 파일(screenLabels)이 `./index` 에서 런타임 값을 가져오지 않게(순환) */
/**
 * 🌐 **배차망 값 표준 — 여기 한 벌뿐이다** (기사님 확정 · 픽커_수집.md §6-전).
 *
 * «어느 배차망에서 온 것인가»는 6하원칙의 **어디서**다. 앱이 모든 요청에 싣고,
 * 원장(orders·intel)의 `targetApp` 열에 저장되며, 화면 배지와 통계 필터가 읽는다.
 *
 * 🔴 코드값·라벨·기본값 전부 **여기서만** 늘린다 — 매핑·폴백을 여러 곳에 두면 배차망을 더할 때마다 갈라진다. (앱은 Kotlin 이라 이 파일을 못 읽는다 —
 *    앱 쪽 한 곳은 `core/TargetApp.kt` 이고, 값이 어긋나면 서버 수신이 기본값으로
 *    떨어져 로그에 남는다)
 */
export const TARGET_APPS = ["insung", "hwamul24", "kakaopicker"] as const;
export type TargetAppType = typeof TARGET_APPS[number];
export const DEFAULT_TARGET_APP: TargetAppType = "insung";

export function isTargetApp(v: unknown): v is TargetAppType {
    return typeof v === "string" && (TARGET_APPS as readonly string[]).includes(v);
}

/** 화면 배지용 이름 — 지금은 텍스트만 (기사님: 아이콘은 나중에) */
export const TARGET_APP_LABEL: Record<TargetAppType, string> = {
    insung: "인성",
    hwamul24: "24시",
    kakaopicker: "픽커",
};

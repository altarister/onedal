import { modeActsOf, runningModeOf } from "@onedal/shared";

/**
 * 🏷️ **필터 칸 «직접 모드» 배지 — 옆 모드 단추와 같은 값(도는 모드)을 읽는다** (29 P5-3 · 27 22줄 🔴6).
 * 명령으로 읽으면 새 폰(모드를 받기 전이라 직접으로 도는데 명령은 자동)에서 단추는 «직접» · 배지는 국면이 된다.
 */
export function directBadgeOf(d: { mode?: string; autoAllowed?: boolean; effectiveMode?: string }): boolean {
    return modeActsOf(runningModeOf(d) ?? d.mode).directBadge;
}

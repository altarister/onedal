import type { FilterTally } from "@onedal/shared";
import { formatClock } from "./clock";

/**
 * 👁️ **방금 스캔에서 무엇이 걸렀나** — 앱이 매 스캔마다 채워 보내는 성적표를 화면 문구로 바꾼다.
 *
 * 🔴 **이 값의 주어는 "폰"이지 "필터"가 아니다** (기사님 지적 2026-08-23).
 *
 * 기사님: *"이것이 필터에 들어가면 안 될 것 같아. 폰이 2개 이상이어도 상관없는 건가?
 * 1번 폰은 작동하는데 2번 폰은 작동하지 않는다면?"*
 *
 * 필터는 **서버가 만들어 모든 폰에 똑같이 내려보내는 한 벌**이고, 이 성적표는
 * **폰마다 다르다.** 그래서 필터 카드에 놓으면 폰이 둘일 때 둘 중 하나를 골라야 하는데,
 * 고르는 순간 화면이 조용히 거짓말한다 — 멀쩡한 1번 폰의 숫자가 멈춘 2번 폰을 가린다.
 *
 * 그래서 이 함수는 **폰 하나의 성적표만** 받는다. 여럿을 합치거나 고르는 자리를 만들지 않는다.
 */
export interface TallySummary {
    seen: number;
    passed: number;
    /** 떨어진 축을 **많이 걸린 순서**로 — 지금 무엇을 풀어야 하는지가 맨 앞에 온다 */
    rejects: Array<[string, number]>;
    /** 🕐 서버가 그 성적표를 받은 시각 `HH:MM:SS`. 모르면 `null` */
    at: string | null;
}

/** 시각 포맷은 `lib/clock.ts` 한 곳에서만 만든다 — 왜 절대시각인지도 거기 적혀 있다 */

/** 화면 이름 ↔ 축. 동점이면 이 순서가 유지된다 (정렬이 흔들려 화면이 깜빡이지 않게) */
const AXES: Array<[string, keyof FilterTally]> = [
    ['도착지', 'region'],
    ['차종', 'vehicle'],
    ['요금', 'fare'],
    ['상차지', 'pickup'],
    ['경로순서', 'routeOrder'],
    ['블랙', 'blacklist'],
];

/**
 * 아직 리스트를 안 훑은 폰은 `null` — **0건이라고 적지 않는다** (모르는 것과 없는 것은 다르다)
 *
 * @param at 서버가 그 성적표를 **받은** 시각 (epoch ms). 앱 시계가 아니다
 */
export function summarizeTally(tally?: FilterTally | null, at?: number | null): TallySummary | null {
    if (!tally || tally.seen <= 0) return null;

    const rejects = AXES
        .map(([name, key]) => [name, tally[key] ?? 0] as [string, number])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]);

    return { seen: tally.seen, passed: tally.passed, rejects, at: formatClock(at) };
}

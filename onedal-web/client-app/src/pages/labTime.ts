/**
 * ⏱️ **시간과 정거장 이름 — 한 곳에서 만든다** (구조 리뷰).
 *
 * 🔴 **왜 뽑았나** — 같은 누적 계산이 `MapMockup.tsx` 안에 **다섯 벌**로 흩어져 있었다
 *    (919·945·1094·1254·1404). 그중 셋에서 「분끼리 빼는」 같은 버그가 났고,
 *    한 곳만 고쳤다가 나머지를 놓쳤다. 이 레포가 같은 병으로 세 번 당했다고
 *    루트 README.md 가 적어 두고 있다 (경유 4벌 · 상태목록 3벌 · 시별칭).
 *
 * 읽기 전용이다 — 실물 코드는 이 파일을 import 하지 않는다 (`labFilterOutput` 와 같은 규약).
 */

/** 구간 하나에서 이 파일이 보는 것만 — 전체 `ChainLeg` 를 안 끌어온다 */
export type LegLike = { to: string | null; durMin: number | null };
/** 전체 경로에서 이 파일이 보는 것만. `measuredAt` = **그 경로를 잰 시각** */
export type ChainLike = { legs: readonly LegLike[]; measuredAt?: number };

/** ① ② ③ … 20까지. 넘으면 `(21)` — 화면에 그대로 나가는 표기다 */
export const circled = (n: number) => n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;

/**
 * 정거장 이름 — `①상차` 처럼 **번호 + 역할**이다.
 * 🔴 지금은 «표시용 번호»가 열쇠라, 콜이 취소되면 번호가 당겨져 남의 정거장을 가리킨다.
 *    나중에 `callId` 로 바꿀 때 **고칠 자리가 여기 하나**이도록 모아 둔다.
 */
export const stopLabel = (callNo: number, kind: '상차' | '하차') => `${circled(callNo)}${kind}`;

/** 시각을 «시:분»으로. 없으면 `--:--` — 0 이나 지금 시각으로 대신 채우지 않는다 (규칙 ④) */
export const hhmm = (t: number | null | undefined) =>
    t == null ? '--:--' : new Date(t).toTimeString().slice(0, 5);

/**
 * 구간을 순서대로 걸으며 **정거장까지의 누적 분**을 낸다.
 *
 * 🔴 **못 잰 구간을 만나면 거기서 멈춘다** — 그 뒤 정거장은 «모른다»가 맞다.
 *    0 으로 치고 계속 더하면 뒤가 전부 이르게 나온다 (규칙 ④).
 * 🔴 이름 없는 정거장은 안 넣는다 — 열쇠가 없으면 나중에 못 찾는다.
 */
export function cumMinutes(
    legs: readonly LegLike[] | undefined,
    /**
     * 🧳 그 정거장에 **머무는 분** — 주면 다음 구간이 그만큼 늦게 출발한다 (기사님 «넣어줘»).
     *
     * 🔴 **도착 시각에는 안 들어간다 — 그 정거장을 떠나는 시각부터 들어간다.**
     *    「몇 시까지 갈게요」는 도착 약속이고, 짐 싣는 시간은 그 뒤에 일어나는 일이다
     *    (루트 README.md ⑤-5: *"저장하는 것은 도착 약속 하나"*).
     * 안 주면 0 — 정차를 안 세던 때와 같은 답이 나온다.
     */
    dwellOf?: (label: string) => number,
): Map<string, number> {
    const out = new Map<string, number>();
    let acc = 0;
    for (const lg of legs ?? []) {
        if (lg.durMin == null) break;
        acc += lg.durMin;
        if (lg.to) {
            out.set(lg.to, acc);          // 도착 — 여기까지는 정차가 안 붙는다
            acc += dwellOf?.(lg.to) ?? 0;  // 떠나는 시각 — 다음 구간은 여기서 시작한다
        }
    }
    return out;
}

/**
 * 그 경로가 말하는 **도착 «시각»**. 잰 시각 + 누적 분.
 *
 * 🔴 **분이 아니라 시각으로 낸다.** 두 경로를 견줄 때 각자의 «0분»이 다른 자리라,
 *    분끼리 빼면 그 사이 주행 시간이 통째로 섞인다 (실측으로 잡은 버그).
 * 🔴 잰 시각을 모르면 `null` — «지금»으로 대신 채우지 않는다.
 */
export function arrivalAt(
    chain: ChainLike | null | undefined, label: string,
    /** 🧳 정거장마다 머무는 분 — `cumMinutes` 로 그대로 넘긴다 */
    dwellOf?: (label: string) => number,
): number | null {
    if (chain?.measuredAt == null) return null;
    const min = cumMinutes(chain.legs, dwellOf).get(label);
    return min == null ? null : chain.measuredAt + min * 60000;
}

/**
 * 🔢 **방문 순번 — 한 곳에서만 센다** (기사님: *"지도의 남은 자리는 8·9·10,
 * 콜 리스트랑 달라"* — 실측: 지도 ⑧⑨⑩ ↔ 시트 10·11·12).
 *
 * 🔴 **순번을 세는 곳이 둘이면 어긋난다** — 지나온 수를 따로 세거나(`targetSeq`), 지나온 정거장을
 *    두 번 세거나(+3), 후보콜이 번호를 밀면 지도와 시트가 다른 번호를 말한다.
 *    그래서 계산을 화면 밖으로 꺼내 여기서 잠근다 (규칙 ③).
 *
 * 규칙 셋:
 *   ① 지나온 정거장이 먼저다 — 그건 사실이라 바뀌지 않는다
 *   ② 경로에 남아 있는 지나온 정거장은 **두 번 안 센다** (경로는 주행 전에 잰 것이라 품고 있다)
 *   ③ 🔴 **아직 안 잡은 콜(후보)의 정거장은 안 센다** — 잡아야 정거장이 된다.
 *      지도는 후보를 «상/하» 표시로만 그리고 번호를 안 준다. 시트만 세면 그 수만큼 어긋난다.
 */
export function visitOrder(
    /** 이미 지나온 정거장 이름 — 순서 그대로 */
    visited: readonly string[],
    /** 지금 경로가 말하는 방문 순서 */
    planned: readonly string[],
    /** 번호에서 뺄 정거장 (후보콜의 상·하차) */
    exclude: readonly string[] = [],
): string[] {
    const drop = new Set(exclude);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of [...visited, ...planned]) {
        if (drop.has(l) || seen.has(l)) continue;
        seen.add(l);
        out.push(l);
    }
    return out;
}

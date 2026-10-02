import { SIGUNGU_AMBIGUOUS, SIGUNGU_UNKNOWN } from './sigungu';

/**
 * 📊 **흐름 칸 하나** — 요일 시 × 배차망 × 출발 시군구 → 도착 시군구, 기사를 합친 합(서버 `flowCellsOf`).
 *    평균은 읽는 쪽이 «아는 값»으로 나눈다 — 요금을 모르는 콜이 섞인 합으로 평균을 내지 않는다.
 */
export interface FlowCell {
    weekday: string; hour: number; targetApp: string; from: string; to: string;
    calls: number; fareCalls: number; fareFirstSum: number; kmCalls: number; kmSum: number;
}
/** 👀 그 요일 시에 폰이 콜을 한 건이라도 본 서로 다른 날 수 — 0 이면 «못 봄»(콜이 없었는지 못 봤는지 모른다 · 서버 `watchedDaysOf`) */
export interface WatchedHour { weekday: string; hour: number; days: number }

const resolved = (s: string) => s !== SIGUNGU_AMBIGUOUS && s !== SIGUNGU_UNKNOWN;

type Sums = { calls: number; fareCalls: number; fareFirstSum: number; kmCalls: number; kmSum: number };
const add = (a: Sums, c: Sums): Sums => ({
    calls: a.calls + c.calls, fareCalls: a.fareCalls + c.fareCalls, fareFirstSum: a.fareFirstSum + c.fareFirstSum,
    kmCalls: a.kmCalls + c.kmCalls, kmSum: a.kmSum + c.kmSum,
});
const ZERO: Sums = { calls: 0, fareCalls: 0, fareFirstSum: 0, kmCalls: 0, kmSum: 0 };

/** 🧾 길 한 줄 — 평균 요금(처음 본 요금) · 평균 거리 · km당 요금. 모르면 null */
export interface RouteStat { to: string; calls: number; fareAvg: number | null; kmAvg: number | null; perKm: number | null }
const statOf = (to: string, s: Sums): RouteStat => {
    const fareAvg = s.fareCalls ? Math.round(s.fareFirstSum / s.fareCalls) : null;
    const kmAvg = s.kmCalls ? Math.round(s.kmSum / s.kmCalls * 10) / 10 : null;
    return { to, calls: s.calls, fareAvg, kmAvg, perKm: fareAvg != null && kmAvg ? Math.round(fareAvg / kmAvg) : null };
};

/** 📍 출발 시군구 후보 — 콜 많은 순(모호 · 모름은 뺀다) */
export function originsOf(cells: FlowCell[]): Array<{ origin: string; calls: number }> {
    const m = new Map<string, number>();
    for (const c of cells) if (resolved(c.from)) m.set(c.from, (m.get(c.from) ?? 0) + c.calls);
    return [...m.entries()].map(([origin, calls]) => ({ origin, calls })).sort((a, b) => b.calls - a.calls || a.origin.localeCompare(b.origin));
}

/**
 * ① **여기서 어디로** — 출발 시군구에서 뜬 콜을 도착 시군구마다 · 콜 많은 순.
 *    도착을 못 가린 콜(모호 · 모름)은 순위에 안 넣고 unresolved 로 센다(화면 꼬리의 비율).
 */
export function flowsFromOrigin(cells: FlowCell[], origin: string): { rows: RouteStat[]; total: number; unresolved: number } {
    const m = new Map<string, Sums>();
    let total = 0, unresolved = 0;
    for (const c of cells) {
        if (c.from !== origin) continue;
        total += c.calls;
        if (!resolved(c.to)) { unresolved += c.calls; continue; }
        m.set(c.to, add(m.get(c.to) ?? ZERO, c));
    }
    const rows = [...m.entries()].map(([to, s]) => statOf(to, s)).sort((a, b) => b.calls - a.calls || a.to.localeCompare(b.to));
    return { rows, total, unresolved };
}

/** 🔁 목적지 후보 한 줄 — 갈 콜(출발 → 후보) · 돌아올 콜(후보 → 출발) · 왕복으로 이어질 수 있는 수(둘 중 적은 쪽) */
export interface DestinationPair { place: string; go: number; back: number; pair: number }

/**
 * ② **목적지를 어디로** — 갈 콜만 많고 돌아올 콜이 없으면 빈 차로 돌아온다.
 *    기본 순서는 «둘 중 적은 쪽» · 같으면 갈 콜 많은 순. 관내(출발 = 후보)와 모호 · 모름은 뺀다.
 */
export function destinationPairs(cells: FlowCell[], origin: string): DestinationPair[] {
    const go = new Map<string, number>(), back = new Map<string, number>();
    for (const c of cells) {
        if (c.from === origin && c.to !== origin && resolved(c.to)) go.set(c.to, (go.get(c.to) ?? 0) + c.calls);
        if (c.to === origin && c.from !== origin && resolved(c.from)) back.set(c.from, (back.get(c.from) ?? 0) + c.calls);
    }
    const places = new Set([...go.keys(), ...back.keys()]);
    return [...places].map(place => {
        const g = go.get(place) ?? 0, b = back.get(place) ?? 0;
        return { place, go: g, back: b, pair: Math.min(g, b) };
    }).sort((a, b) => b.pair - a.pair || b.go - a.go || a.place.localeCompare(b.place));
}

/** 🕘 요일 × 시간 칸 — perDay 는 «본 날 하루 평균 콜» */
export interface HeatCell { weekday: string; hour: number; calls: number; days: number; perDay: number }

/**
 * ③ **몇 시에** — 고른 길(from · to 가 없으면 그쪽은 전부)의 요일 × 시간.
 *    🔴 나누는 수는 그 요일 시에 폰이 콜을 본 날 수다 — 기간의 날 수로 나누면 폰을 안 켠 시간이 «콜 없음»으로 읽힌다.
 *    본 날이 있는 칸만 돌려준다(못 본 칸은 화면이 «못 봄»으로 비운다). hours 는 어느 요일이든 본 날이 있는 시간(차례대로) · max 는 가장 진한 칸의 perDay.
 */
export function hourHeat(cells: FlowCell[], watched: WatchedHour[], from?: string, to?: string): { cells: HeatCell[]; hours: number[]; max: number } {
    const calls = new Map<string, number>();
    for (const c of cells) {
        if (from && c.from !== from) continue;
        if (to && c.to !== to) continue;
        const k = `${c.weekday}|${c.hour}`;
        calls.set(k, (calls.get(k) ?? 0) + c.calls);
    }
    const seen = watched.filter(w => w.days > 0);
    const heat = seen.map(w => {
        const n = calls.get(`${w.weekday}|${w.hour}`) ?? 0;
        return { weekday: w.weekday, hour: w.hour, calls: n, days: w.days, perDay: Math.round(n / w.days * 10) / 10 };
    });
    return { cells: heat, hours: [...new Set(seen.map(w => w.hour))].sort((a, b) => a - b), max: Math.max(0, ...heat.map(h => h.perDay)) };
}

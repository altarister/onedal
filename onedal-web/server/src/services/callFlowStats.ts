import type Database from "better-sqlite3";
import db from "../db";
import { businessDayKey, sigunguOfShort, SIGUNGU_AMBIGUOUS, SIGUNGU_UNKNOWN } from "@onedal/shared";
import { slog } from "../utils/fileLogger";

/**
 * 📊 **콜 흐름 통계 — 목록에 뜬 실물 콜을 하루 × 시 × 출발 시군구 × 도착 시군구로 센다** (reviews/25 3단계 · 기사님 결정).
 *
 * 기사님: *"계절·요일·월초·주초·아침·점심·저녁 등 어느 동네에서 어디로 가는 콜이 많은가를 알고 싶다."*
 *
 * 🔴 **재료는 intel 의 목록 줄(INTEL_BULK) 가운데 실물 앱(source='real')뿐** — 상세까지 간 콜만 세면 «기사님 필터를 통과한 흐름»만 쌓인다.
 *    시뮬·옛 앱(NULL)은 원문에는 남되 여기서 빠진다. 시각은 ISO 칸(`timestamp` — Z 붙은 UTC)만 읽는다 — `localtime` 칸은 안 읽는다.
 * 🔴 **같은 콜 = 상차 + 하차 + 30분 창**(미끄러진다) — 픽커는 시간이 지나면 요금을 올려 요금이 든 지문으로는 두 콜이 된다.
 *    앱 `CallMemory`(상차+하차+요금)와 **일부러 둘**이다 — 앱은 «이 줄을 다시 판정할까», 통계는 «같은 일감인가»를 묻는다.
 * 🔴 **묶기는 그날 지우고 다시 넣기 한 트랜잭션** — 되풀이해도 같다. 서버가 뜰 때 + 1시간마다 «어제까지 안 묶은 날»을 묶는다
 *    (영업일 전환에 넣지 않는다 — 한 기사의 보고를 붙잡고, 기사가 안 온 날은 안 돈다).
 * 🔴 **모르는 값은 합에 넣지 않는다** — 앱은 모르는 요금을 0 으로 적는다. 요금·km 합과 최소·최대는 아는 값만, 평균은 아는 콜 수(fare_calls · km_calls)로 나눈다.
 *    예약은 날(reservedDay)이 1 이상인 콜만 — «당상»(오늘)은 예약이 아니다.
 * ⚠️ 원문(intel) 지우기는 여기 없다 — 묶기가 한 달 잘 돈 뒤 기사님께 여쭙고 켠다.
 */

const SAME_CALL_WINDOW_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
/** 기사별 줄을 두는 날수 — 그 뒤에는 기사 칸을 뺀 합친 줄로 (크기가 기사 수에 비례하지 않게) */
const PER_DRIVER_DAYS = 90;

interface IntelRow {
    user_id: string | null; targetApp: string | null; pickup: string; dropoff: string; fare: number | null;
    timestamp: string; vehicleType?: string | null; deliveryDistanceKm?: number | null;
    verdict?: string | null; reservedDay?: number | null;
}
export interface SameCall {
    userId: string; targetApp: string; pickup: string; dropoff: string;
    /** 모르면 null — 앱이 0 으로 적은 요금도 모름 */
    firstMs: number; fareFirst: number | null; fareLast: number | null;
    vehicleType: string; km: number | null; reserved: boolean; passed: boolean;
}

/** 같은 콜로 묶는다 — (기사 · 배차망 · 상차 · 하차)가 같고 직전에 본 때로부터 30분 안이면 같은 콜. 줄은 시각 순으로 온다 */
export function groupSameCalls(rows: IntelRow[]): SameCall[] {
    const open = new Map<string, { call: SameCall; lastMs: number }>();
    const calls: SameCall[] = [];
    for (const r of rows) {
        const ms = Date.parse(r.timestamp);
        if (!Number.isFinite(ms)) continue;
        const key = `${r.user_id ?? ''}|${r.targetApp ?? ''}|${r.pickup}|${r.dropoff}`;
        const hit = open.get(key);
        const fare = r.fare != null && r.fare > 0 ? r.fare : null;
        const reserved = (r.reservedDay ?? 0) >= 1;
        if (hit && ms - hit.lastMs <= SAME_CALL_WINDOW_MS) {
            hit.lastMs = ms;
            hit.call.fareFirst ??= fare;
            if (fare != null) hit.call.fareLast = fare;
            hit.call.vehicleType ||= r.vehicleType ?? '';
            hit.call.km ??= r.deliveryDistanceKm ?? null;
            hit.call.reserved ||= reserved;
            hit.call.passed ||= r.verdict === 'pass';
            continue;
        }
        const call: SameCall = {
            userId: r.user_id ?? '', targetApp: r.targetApp ?? '', pickup: r.pickup, dropoff: r.dropoff,
            firstMs: ms, fareFirst: fare, fareLast: fare, vehicleType: r.vehicleType ?? '',
            km: r.deliveryDistanceKm ?? null, reserved, passed: r.verdict === 'pass',
        };
        calls.push(call);
        open.set(key, { call, lastMs: ms });
    }
    return calls;
}

/** 영업일(KST) `YYYY-MM-DD` 의 ISO 경계 — timestamp(Z 붙은 UTC 글자)와 글자로 견준다 */
const dayBounds = (day: string) => {
    const start = Date.parse(`${day}T00:00:00+09:00`);
    return { from: new Date(start).toISOString(), to: new Date(start + DAY_MS).toISOString() };
};
const kstHourOf = (ms: number) => new Date(ms + 9 * 3600_000).getUTCHours();
const resolved = (s: string) => s !== SIGUNGU_AMBIGUOUS && s !== SIGUNGU_UNKNOWN;

const stmtDayRows = db.prepare(`
    SELECT user_id, targetApp, pickup, dropoff, fare, timestamp, vehicleType, deliveryDistanceKm, verdict, reservedDay
    FROM intel WHERE type = 'INTEL_BULK' AND source = 'real' AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp, id
`);
/** 새 칸을 쓰는 문장은 처음 쓸 때 준비한다 — 옛 모양 표에서는 준비부터 터져 서버가 못 뜬다 */
let insertFlow: Database.Statement | null = null;
const stmtInsertFlow = () => insertFlow ??= db.prepare(`
    INSERT INTO stats_flows (day, hour, target_app, from_sigungu, to_sigungu, vehicle_type, user_id, drivers,
        calls, fare_calls, fare_first_sum, fare_last_sum, fare_min, fare_max, km_calls, km_sum, reserved_calls, passed_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/** 표가 지금 모양인가 — 아는 콜 수 칸(fare_calls)이 없으면 옛 모양. 옛 모양이면 묶기·읽기를 멈춘다(칸을 덧대지 않는다) */
export const statsTableCurrent = (conn: Database.Database = db): boolean =>
    (conn.prepare(`PRAGMA table_info(stats_flows)`).all() as Array<{ name: string }>).some(c => c.name === 'fare_calls');

/** 하루를 묶는다 — 그날 줄을 지우고 다시 넣고 표지를 적는다(한 트랜잭션 · 되풀이해도 같다) */
export function rollupDay(day: string): { calls: number; resolvedCalls: number } {
    const { from, to } = dayBounds(day);
    const rows = stmtDayRows.all(from, to) as IntelRow[];
    const calls = groupSameCalls(rows);
    const cells = new Map<string, {
        hour: number; app: string; from: string; to: string; vehicle: string; user: string;
        calls: number; fareCalls: number; fareFirst: number; fareLast: number; min: number | null; max: number | null;
        kmCalls: number; km: number; reserved: number; passed: number;
    }>();
    let resolvedCalls = 0;
    for (const c of calls) {
        const fromS = sigunguOfShort(c.pickup), toS = sigunguOfShort(c.dropoff);
        if (resolved(fromS) && resolved(toS)) resolvedCalls++;
        const hour = kstHourOf(c.firstMs);
        const key = [hour, c.targetApp, fromS, toS, c.vehicleType, c.userId].join('|');
        const cell = cells.get(key) ?? { hour, app: c.targetApp, from: fromS, to: toS, vehicle: c.vehicleType, user: c.userId,
            calls: 0, fareCalls: 0, fareFirst: 0, fareLast: 0, min: null, max: null, kmCalls: 0, km: 0, reserved: 0, passed: 0 };
        cell.calls++;
        if (c.fareFirst != null && c.fareLast != null) {
            cell.fareCalls++;
            cell.fareFirst += c.fareFirst;
            cell.fareLast += c.fareLast;
            cell.min = Math.min(cell.min ?? Infinity, c.fareFirst, c.fareLast);
            cell.max = Math.max(cell.max ?? -Infinity, c.fareFirst, c.fareLast);
        }
        if (c.km != null) { cell.kmCalls++; cell.km += c.km; }
        if (c.reserved) cell.reserved++;
        if (c.passed) cell.passed++;
        cells.set(key, cell);
    }
    db.transaction(() => {
        db.prepare(`DELETE FROM stats_flows WHERE day = ?`).run(day);
        for (const c of cells.values())
            stmtInsertFlow().run(day, c.hour, c.app, c.from, c.to, c.vehicle, c.user, 1,
                c.calls, c.fareCalls, c.fareFirst, c.fareLast, c.min, c.max, c.kmCalls, c.km, c.reserved, c.passed);
        db.prepare(`INSERT OR REPLACE INTO stats_rollup_days (day, done_at, real_rows, calls, resolved_calls, merged_at)
            VALUES (?, ?, ?, ?, ?, NULL)`).run(day, new Date().toISOString(), rows.length, calls.length, resolvedCalls);
    })();
    return { calls: calls.length, resolvedCalls };
}

/** 90일 지난 날은 기사 칸을 뺀 합친 줄로 — drivers 는 그 칸의 서로 다른 기사 수(3명 규칙의 재료) */
export function mergeOldDays(nowMs: number = Date.now()): number {
    const cutoff = businessDayKey(nowMs - PER_DRIVER_DAYS * DAY_MS);
    const days = (db.prepare(`SELECT day FROM stats_rollup_days WHERE merged_at IS NULL AND day < ? ORDER BY day`)
        .all(cutoff) as Array<{ day: string }>).map(r => r.day);
    for (const day of days) {
        db.transaction(() => {
            const merged = db.prepare(`
                SELECT hour, target_app, from_sigungu, to_sigungu, vehicle_type,
                       COUNT(DISTINCT user_id) AS drivers, SUM(calls) AS calls, SUM(fare_calls) AS fc, SUM(fare_first_sum) AS ff, SUM(fare_last_sum) AS fl,
                       MIN(fare_min) AS mn, MAX(fare_max) AS mx, SUM(km_calls) AS kc, SUM(km_sum) AS km, SUM(reserved_calls) AS rs, SUM(passed_calls) AS ps
                FROM stats_flows WHERE day = ? AND user_id != ''
                GROUP BY hour, target_app, from_sigungu, to_sigungu, vehicle_type
            `).all(day) as any[];
            db.prepare(`DELETE FROM stats_flows WHERE day = ? AND user_id != ''`).run(day);
            for (const m of merged)
                stmtInsertFlow().run(day, m.hour, m.target_app, m.from_sigungu, m.to_sigungu, m.vehicle_type, '', m.drivers,
                    m.calls, m.fc, m.ff, m.fl, m.mn, m.mx, m.kc, m.km, m.rs, m.ps);
            db.prepare(`UPDATE stats_rollup_days SET merged_at = ? WHERE day = ?`).run(new Date().toISOString(), day);
        })();
    }
    return days.length;
}

/** 표지가 없는 날 가운데 어제(KST)까지를 오래된 날부터 — 하루씩 하고 사이에 다른 일을 돌린다 */
async function rollupPending(): Promise<void> {
    const today = businessDayKey(Date.now());
    const first = (db.prepare(`SELECT MIN(timestamp) AS t FROM intel WHERE type = 'INTEL_BULK' AND source = 'real'`).get() as { t: string | null }).t;
    if (!first) return;
    const done = new Set((db.prepare(`SELECT day FROM stats_rollup_days`).all() as Array<{ day: string }>).map(r => r.day));
    for (let ms = Date.parse(first); ; ms += DAY_MS) {
        const day = businessDayKey(ms);
        if (day >= today) break;
        if (done.has(day)) continue;
        const r = rollupDay(day);
        slog('부팅', `📊 [흐름 통계] ${day} 묶음 — 콜 ${r.calls}건 · 시군구로 풀린 콜 ${r.resolvedCalls}건`);
        await new Promise(res => setImmediate(res));
    }
}

let running = false;
/** 서버가 뜰 때 한 번(부팅을 붙잡지 않게 다음 차례로) + 1시간마다 */
export function startStatsRollup(): void {
    if (!statsTableCurrent()) {
        console.warn('📊 [흐름 통계] 통계 표가 옛 모양 — 묶기를 멈춘다. 표(stats_flows · stats_rollup_days)를 지우고 다시 띄우면 원문에서 다시 묶는다');
        return;
    }
    const run = () => {
        if (running) return;
        running = true;
        rollupPending()
            .then(() => { const n = mergeOldDays(); if (n) slog('부팅', `📊 [흐름 통계] 90일 지난 ${n}일을 합친 줄로`); })
            .catch(e => console.error('📊 [흐름 통계] 묶기 실패 — 다음 시간에 다시:', (e as Error).message))
            .finally(() => { running = false; });
    };
    setImmediate(run);
    setInterval(run, 3_600_000).unref();
}

// ━━━ 읽기 — 관제웹·뉴스레터 문 / 어드민 문 (routes/stats.ts) ━━━

/** 묶는 기준 — 표는 날짜 그대로 두고 읽을 때 계산한다(요일 · 시 · 달 · 계절 · 날 · 요일×시 — 아침 카드) */
export type FlowGroupBy = 'weekday' | 'hour' | 'month' | 'season' | 'day' | 'weekdayHour';
export const FLOW_GROUP_BYS: readonly FlowGroupBy[] = ['weekday', 'hour', 'month', 'season', 'day', 'weekdayHour'];
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const SEASON_OF_MONTH = ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'];

interface FlowRow {
    day: string; hour: number; target_app: string; from_sigungu: string; to_sigungu: string; user_id: string;
    drivers: number; calls: number; fare_calls: number; fare_first_sum: number; fare_last_sum: number;
}
const groupOf = (r: FlowRow, by: FlowGroupBy): string => {
    const [y, m, d] = r.day.split('-').map(Number);
    if (by === 'hour') return `${r.hour}시`;
    if (by === 'month') return `${m}월`;
    if (by === 'season') return SEASON_OF_MONTH[m - 1];
    if (by === 'day') return r.day;
    const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return by === 'weekdayHour' ? `${weekday} ${r.hour}시` : weekday;
};
/** 평균은 요금을 아는 콜(fareCalls)로만 나눈다 — 하나도 모르면 null */
type Sum = { calls: number; fareCalls: number; fareFirstAvg: number | null; fareLastAvg: number | null };
const sumOf = (rows: FlowRow[]): Sum | null => {
    const calls = rows.reduce((s, r) => s + r.calls, 0);
    if (!calls) return null;
    const fareCalls = rows.reduce((s, r) => s + r.fare_calls, 0);
    const avg = (k: 'fare_first_sum' | 'fare_last_sum') => fareCalls ? Math.round(rows.reduce((s, r) => s + r[k], 0) / fareCalls) : null;
    return { calls, fareCalls, fareFirstAvg: avg('fare_first_sum'), fareLastAvg: avg('fare_last_sum') };
};

/** 남의 기사가 이만큼 섞여야 칸 합계를 보인다 (기사님 결정 4 — 한 사람을 알아볼 수 없게) */
const OTHERS_MIN = 3;

/**
 * 관제웹·뉴스레터 문 — **내 줄은 그대로**, 남의 줄이 섞인 칸은 서로 다른 남의 기사 3명 이상일 때만 합친 값.
 * 🔴 남이 2명 이하면 칸 합계를 주지 않는다 — «합계 − 내 값»으로 남의 값이 역산된다.
 * 🔴 합친 줄(90일 뒤 · 기사 칸 없음)에는 내가 섞였을 수 있다 — drivers − 1 만 남으로 친다(적게 쳐서 가리는 쪽으로).
 * ⚠️ 합친 줄의 내 몫은 알 수 없다 — 90일 지난 날의 «내 값»은 비고, 남이 3명 이상일 때 합계로만 보인다.
 * 기사 id 는 응답에 넣지 않는다.
 */
export function flowsForViewer(rows: FlowRow[], me: string, by: FlowGroupBy) {
    const cells = new Map<string, { group: string; targetApp: string; from: string; to: string; rows: FlowRow[] }>();
    for (const r of rows) {
        const group = groupOf(r, by);
        const key = [group, r.target_app, r.from_sigungu, r.to_sigungu].join('|');
        const cell = cells.get(key) ?? { group, targetApp: r.target_app, from: r.from_sigungu, to: r.to_sigungu, rows: [] };
        cell.rows.push(r);
        cells.set(key, cell);
    }
    return [...cells.values()].map(c => {
        const mineRows = c.rows.filter(r => r.user_id === me);
        const others = c.rows.filter(r => r.user_id !== me);
        const otherIds = new Set(others.filter(r => r.user_id !== '').map(r => r.user_id));
        const othersDrivers = otherIds.size + others.filter(r => r.user_id === '').reduce((s, r) => s + Math.max(0, r.drivers - 1), 0);
        const showAll = othersDrivers >= OTHERS_MIN;
        const all = showAll ? sumOf(c.rows) : null;
        return {
            group: c.group, targetApp: c.targetApp, from: c.from, to: c.to,
            mine: sumOf(mineRows),
            all: all ? { ...all, drivers: otherIds.size + (mineRows.length ? 1 : 0) + others.filter(r => r.user_id === '').reduce((s, r) => s + r.drivers, 0) } : null,
            /** 남이 섞였지만 3명이 안 돼 합계를 가렸다 — 화면은 «표본 적음» */
            fewOthers: others.length > 0 && !showAll,
        };
    });
}

/** 어드민 문 — 기사 칸을 준다(인증 + 관리자만) */
export function flowsForAdmin(rows: FlowRow[], by: FlowGroupBy) {
    const cells = new Map<string, { group: string; targetApp: string; from: string; to: string; userId: string; drivers: number; rows: FlowRow[] }>();
    for (const r of rows) {
        const group = groupOf(r, by);
        const key = [group, r.target_app, r.from_sigungu, r.to_sigungu, r.user_id].join('|');
        const cell = cells.get(key) ?? { group, targetApp: r.target_app, from: r.from_sigungu, to: r.to_sigungu, userId: r.user_id, drivers: 0, rows: [] };
        cell.rows.push(r);
        cell.drivers = Math.max(cell.drivers, r.drivers);
        cells.set(key, cell);
    }
    return [...cells.values()].map(({ rows: rs, ...c }) => ({ ...c, ...sumOf(rs) }));
}

/** 기간의 줄 — 두 문이 같은 줄을 읽는다(읽는 곳 한 곳). 옛 모양 표면 빈 줄 — 모르는 값이 섞인 합으로 평균을 내지 않는다 */
export function flowRowsBetween(from: string, to: string): FlowRow[] {
    if (!statsTableCurrent()) return [];
    return db.prepare(`SELECT * FROM stats_flows WHERE day >= ? AND day <= ? ORDER BY day, hour`).all(from, to) as FlowRow[];
}

/** 그 기간에 묶인 날 — «주마다 N건»의 나눗수(콜이 0건이어도 묶인 날은 센다). 기사 칸 없음 */
export function rolledUpDaysBetween(from: string, to: string): string[] {
    return (db.prepare(`SELECT day FROM stats_rollup_days WHERE day >= ? AND day <= ? ORDER BY day`).all(from, to) as Array<{ day: string }>)
        .map(r => r.day);
}

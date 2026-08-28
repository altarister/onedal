import db from '../db';
import { haversineKm } from './geoService';

/**
 * 🛰️ **주행 궤적 저장** (기사님 확정 2026-08-26)
 *
 * 기사님: *"내가 가끔 네비게이션이 가리키는 경로를 놓쳐서 지나치거나 할 경우가 있거든..
 * 그러면 얼마나 우회하게 되는 건지.. 약속 시간에 늦는다면 전화해서 상하차지와의 약속을
 * 수정하든지 해야 하거든.. 그런 기능을 만들려면 지금 부여받은 경로와 현실의 주행 궤적을
 * 매칭해야 차이를 확인할 수 있을 듯."*
 *
 * ── 왜 만들었나 ──
 * 좌표는 소켓으로 흘려보내고 **메모리에만 살았다.** 저장하는 표가 없어서 필드테스트
 * 1회차·2회차 둘 다 궤적을 못 남겼다(«발견 3»). 2회차에서 **상차지 5곳 중 3곳이 GPS
 * 자동 감지에 실패**했는데 **몇 미터 차이로 빗나갔는지를 몰라**, 반경 500m 를 늘릴
 * 일인지 장소를 바꿀 일인지 판단할 근거가 없었다.
 *
 * 「위치 점프」 경고 줄에서 복원해 봤지만 그 줄은 **시각이 없고 «이상할 때만»** 찍혀
 * 궤적이 아니라 «흔들린 순간» 모음이었다 — 실제로 한 번 오독했다.
 *
 * ── 비용 (서버가 작다 — 메모리 911MB 중 가용 345MB) ──
 * ```
 * 다 저장(1초마다)   28,800점/일   3.2MB/일   30일 95MB   ← 못 쓴다
 * 50m 또는 15초       6,400점/일   0.7MB/일   7일 상한 5MB ← 이걸로 간다
 * ```
 *   ① **문턱** — 정차 중에는 15초에 한 점만 쌓인다
 *   ② **일괄 쓰기** — 20점 또는 30초마다 트랜잭션 하나. 1점씩 넣는 것보다 수십 배 싸다
 *   ③ **7일 보관** — 부팅 때 정리. 8일째 부팅하면 1일차가 지워진다
 *      (서버 로그가 3일치만 두는 것과 같은 규칙)
 *
 * 🔴 **이 표는 «기록»이지 «판정 입력»이 아니다.** 판정은 세션의 현위치를 쓴다.
 *    여기가 비어도 콜 잡기·판정은 그대로 돌아야 한다 — 그래서 저장 실패는 삼킨다.
 */
export const GPS_TRACK = {
    /** 이만큼 안 움직였으면 안 남긴다 (50m) */
    MIN_MOVE_KM: 0.05,
    /** 안 움직여도 이만큼 지나면 남긴다 — «거기 있었다»도 기록이다 (15초) */
    MIN_GAP_MS: 15_000,
    /**
     * 이만큼 모이면 한 번에 쓴다.
     *
     * 🔴 **20 → 5 로 낮췄다** (2026-08-26 실측). 서버가 `SIGKILL` 로 죽으면 종료 절차가
     *    안 돌아 **버퍼가 통째로 날아간다** — `pnpm scenario` 가 실제로 그렇게 죽였고
     *    좌표 4점이 전부 사라졌다. 실주행에서도 서버가 갑자기 죽으면 같은 일이 난다.
     *    5점이면 «50m 문턱 × 5 = 250m» 어치만 잃는다. 쓰기 비용은 여전히 1점씩의 1/5 이다.
     */
    FLUSH_POINTS: 5,
    /** 안 차도 이만큼 지나면 쓴다 (10초) — 정차 중에도 오래 물고 있지 않게 */
    FLUSH_MS: 10_000,
    /** 보관 기간 — 8일째 부팅하면 1일차가 지워진다 */
    KEEP_DAYS: 7,
    /**
     * 궤적 공백 경보 문턱 (5분) — 표본 조건(15초)의 20배.
     * 저장 조건이 «50m 이동 **또는** 15초 경과»라 폰이 살아 있으면 정차 중에도 점이 온다.
     * 그러므로 이만큼 비면 «차가 서 있던 것»이 아니라 **폰이 좌표를 안 보낸 것**이다
     * (2026-08-28 실측: S23 배터리 최적화로 5분+ 공백 7회, 최대 17분).
     */
    GAP_ALERT_MS: 5 * 60_000,
} as const;

export interface GpsPoint {
    x: number;
    y: number;
    atMs: number;
    source?: string;
    speedKmh?: number | null;
    /** 그때 어느 콜을 향하고 있었나 — 경로 대조의 열쇠 (모르면 비운다) */
    orderId?: string | null;
    /**
     * 그 콜의 **상차지로 가던 길인가 하차지로 가던 길인가.**
     * 콜 하나가 두 구간을 만드므로, `orderId` 만으로는 궤적을 반으로 못 가른다.
     */
    stopType?: 'pickup' | 'dropoff' | null;
}

/**
 * 이 점을 남길 것인가 — **순수 계산이라 폰 없이 검사된다.**
 *
 * 🔴 첫 점은 언제나 남긴다. 비교 대상이 없는데 버리면 «출발점»이 사라진다.
 */
export function shouldStoreGpsPoint(
    prev: { x: number; y: number; atMs: number } | null | undefined,
    now: { x: number; y: number; atMs: number },
): boolean {
    if (!prev) return true;
    const movedKm = haversineKm(prev.y, prev.x, now.y, now.x);
    if (movedKm >= GPS_TRACK.MIN_MOVE_KM) return true;
    return (now.atMs - prev.atMs) >= GPS_TRACK.MIN_GAP_MS;
}

/** 아직 디스크로 안 간 점들 — 메모리에만 산다 (20점 × 110B ≈ 2KB) */
const BUFFER: Array<GpsPoint & { userId: string }> = [];
let lastFlushMs = Date.now();

/**
 * 🔴 **주기 비우기 — 좌표가 끊겨도 남긴다** (2026-08-26 실측).
 *
 * 처음엔 타이머 없이 *"좌표가 매초 오므로 그게 곧 시계다"* 로 뒀다. 틀렸다 —
 * 비우기가 **«다음 좌표가 올 때»만** 일어나니, 차를 세워 GPS 가 멎으면 마지막 점들이
 * 메모리에 갇힌다. `pnpm scenario` 에서 실제로 1점이 갇힌 채 `SIGKILL` 로 사라졌다.
 * **목적지에 도착하면 GPS 가 멎는다** — 그 마지막 구간이야말로 봐야 하는 곳이다.
 *
 * ⚠️ `unref()` — 이 타이머가 서버 종료를 붙잡으면 안 된다 (다른 인터벌과 같은 규칙).
 */
setInterval(() => flushGpsBuffer(), GPS_TRACK.FLUSH_MS).unref();

/**
 * 버퍼에 담는다. 차거나 오래되면 여기서 바로 쓴다 (위 타이머가 뒷받침한다).
 */
export function bufferGpsPoint(userId: string, p: GpsPoint): void {
    BUFFER.push({ ...p, userId });
    const full = BUFFER.length >= GPS_TRACK.FLUSH_POINTS;
    const stale = Date.now() - lastFlushMs >= GPS_TRACK.FLUSH_MS;
    if (full || stale) flushGpsBuffer();
}

const insertStmt = () => db.prepare(`
    INSERT INTO gps_tracks (user_id, at_ms, x, y, source, speed_kmh, order_id, stop_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

/**
 * 모아 둔 점을 **트랜잭션 하나로** 넣는다.
 *
 * ⚠️ 실패해도 삼킨다 — 궤적은 기록이지 판정 입력이 아니다. 저장이 안 된다고
 *    콜 잡기가 멈추면 그게 더 큰 사고다 (규칙 ② — 안전장치는 겹쳐 두되 방해하지 않는다).
 */
export function flushGpsBuffer(): void {
    if (BUFFER.length === 0) { lastFlushMs = Date.now(); return; }
    const batch = BUFFER.splice(0, BUFFER.length);
    lastFlushMs = Date.now();
    try {
        const st = insertStmt();
        db.transaction(() => {
            for (const p of batch) {
                st.run(p.userId, Math.round(p.atMs), p.x, p.y,
                    p.source ?? null, p.speedKmh ?? null, p.orderId ?? null, p.stopType ?? null);
            }
        })();
    } catch (e) {
        console.log(`⚠️ [궤적 저장 실패] ${batch.length}점을 버립니다 —`, (e as Error)?.message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 읽기 — 이 표에 처음 생긴 SELECT 다 (2026-08-28)
//
// 그동안 «쓰기 전용»이라 확인마다 EC2 에 들어가 node -e 를 손으로 짰다.
// 궤적은 «기록»이므로 읽기도 판정과 무관하다 — 여기가 비어도 콜 잡기는 그대로 돈다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DB 에서 읽은 궤적 한 점 — 칸 이름은 표 그대로(snake_case) 두지 않고 여기서 한 번만 옮긴다 */
export interface TrackPoint {
    atMs: number;
    x: number;
    y: number;
    source: string | null;
    speedKmh: number | null;
    orderId: string | null;
    stopType: 'pickup' | 'dropoff' | null;
}

export interface TrackGap { fromMs: number; toMs: number; minutes: number }

export interface TrackSummary {
    count: number;
    fromMs: number | null;
    toMs: number | null;
    /** 이 공백들이 곧 «폰이 좌표를 안 보낸 구간»이다 — GAP_ALERT_MS 주석 참조 */
    gaps: TrackGap[];
    /** 상차로 가던 점 · 하차로 가던 점 · 콜이 안 붙은 점 */
    byStop: { pickup: number; dropoff: number; none: number };
}

/**
 * 점 목록을 요약한다 — **순수 계산이라 폰 없이 검사된다** (`shouldStoreGpsPoint` 와 같은 규칙).
 * 시각 오름차순을 전제한다 (아래 SELECT 가 `ORDER BY at_ms` 로 보장).
 */
export function summarizeTrack(
    points: Pick<TrackPoint, 'atMs' | 'stopType'>[],
    gapMs: number = GPS_TRACK.GAP_ALERT_MS,
): TrackSummary {
    const byStop = { pickup: 0, dropoff: 0, none: 0 };
    const gaps: TrackGap[] = [];
    let prev: number | null = null;
    for (const p of points) {
        byStop[p.stopType ?? 'none']++;
        if (prev != null && p.atMs - prev >= gapMs) {
            gaps.push({ fromMs: prev, toMs: p.atMs, minutes: Math.round((p.atMs - prev) / 60_000) });
        }
        prev = p.atMs;
    }
    return {
        count: points.length,
        fromMs: points.length ? points[0].atMs : null,
        toMs: points.length ? points[points.length - 1].atMs : null,
        gaps, byStop,
    };
}

const rowToPoint = (r: any): TrackPoint => ({
    atMs: r.at_ms, x: r.x, y: r.y,
    source: r.source ?? null, speedKmh: r.speed_kmh ?? null,
    orderId: r.order_id ?? null, stopType: r.stop_type ?? null,
});

/** «이 콜의 궤적» — 시각 오름차순 */
export function trackOfOrder(userId: string, orderId: string): TrackPoint[] {
    return db.prepare(`
        SELECT at_ms, x, y, source, speed_kmh, order_id, stop_type
        FROM gps_tracks WHERE user_id = ? AND order_id = ? ORDER BY at_ms
    `).all(userId, orderId).map(rowToPoint);
}

/** 궤적이 붙은 콜 목록 — 콜별 점 수·구간. 어느 콜의 궤적을 열어 볼지 고르는 입구다 */
export function trackSegmentsOf(userId: string): Array<{
    orderId: string; count: number; fromMs: number; toMs: number;
    pickupCount: number; dropoffCount: number;
}> {
    return db.prepare(`
        SELECT order_id AS orderId, COUNT(*) AS count,
               MIN(at_ms) AS fromMs, MAX(at_ms) AS toMs,
               SUM(CASE WHEN stop_type = 'pickup'  THEN 1 ELSE 0 END) AS pickupCount,
               SUM(CASE WHEN stop_type = 'dropoff' THEN 1 ELSE 0 END) AS dropoffCount
        FROM gps_tracks
        WHERE user_id = ? AND order_id IS NOT NULL
        GROUP BY order_id ORDER BY MIN(at_ms)
    `).all(userId) as any[];
}

/**
 * 보관 기간이 지난 점을 지운다 — **부팅 때 한 번.**
 * @returns 지운 행 수
 */
export function pruneGpsTracks(nowMs: number = Date.now()): number {
    const cutoff = nowMs - GPS_TRACK.KEEP_DAYS * 24 * 60 * 60 * 1000;
    try {
        const r = db.prepare('DELETE FROM gps_tracks WHERE at_ms < ?').run(cutoff);
        return r.changes ?? 0;
    } catch {
        return 0;
    }
}

import { getDistanceKm } from '../lib/routeUtils';
import { nearestIndex } from './useMockGpsSimulator';
import { driveStep } from '../lib/driveStep';

interface PolylinePoint { x: number; y: number }

/**
 * 🎭 **모의 주행의 걸음 하나 — 순수 함수** (기사님 확정 2026-08-31).
 *
 * 예전 시뮬은 등속(15배)으로 정거장을 순간 통과했다. 그런데 화면 상태 기계는
 * **시간 조건**(정차 5km/h↓ 10초 · 주행 20km/h↑ 10초)으로 움직이므로, 쉬지 않는
 * 시뮬에서는 정차 상태(S2·S7)가 **한 번도 안 나온다** — 기사님: *"시뮬레이션이
 * 제대로 작동하지 못하는 것 같아."*
 *
 * 그래서 걸음에 «연기»를 넣는다:
 *   접근  정거장 1km 안 → 걸음을 ¼로 (감속이 화면 속도계에 보인다)
 *   도착  정거장 좌표를 찍고 → **실초 dwellTicks 동안 같은 자리** (정차 감지가 진짜로 발화)
 *   출발  다시 순항 걸음
 *
 * 🔴 배속은 순항 걸음에만 곱한다 — **정차 시간은 실초로 지킨다.** 시간 조건을 밟는 것이
 *    이 연기의 목적이라, 배속으로 줄이면 존재 이유가 없어진다.
 * 순수 함수라 폰·타이머 없이 검사된다 (`tests/simStep.test.ts`).
 */
export interface SimState {
    /** 폴리라인 위 **다음에 밟을** 점의 인덱스 */
    idx: number;
    /** 📍 지금 서 있는 자리 — 점과 점 «사이»일 수 있다 (`driveStep` 이 보간한다) */
    at: PolylinePoint | null;
    phase: 'cruise' | 'dwell';
    /** dwell 남은 틱 (1틱 = 실제 1초) */
    dwellLeft: number;
    /** 정차 연기 중 머무는 좌표 */
    dwellAt: PolylinePoint | null;
    /** 이미 들른 정거장 키 — 같은 자리를 두 번 찍지 않는다 */
    visited: Set<string>;
}

export const initialSimState = (idx = 0): SimState =>
    ({ idx, at: null, phase: 'cruise', dwellLeft: 0, dwellAt: null, visited: new Set() });

/**
 * 🛣️ **한 틱(1초)의 기본 걸음(km)** — 배속을 곱한다 (2026-09-12).
 *    예전엔 `idx += 배속` 으로 **폴리라인 점을 건너뛰어** 카카오 곡선이 직선으로 펴졌다
 *    (기사님: *"궤적이 엉망이야"*). 이제 목업과 **같은 함수**(`lib/driveStep`)로 거리를 간다.
 */
export const KM_PER_TICK = 0.1;

/** 정거장 접근으로 치는 반경(km) — 이 안에서는 감속 연기 */
export const APPROACH_KM = 1;
/** 도착 정차 연기(실초) — 정차 감지 10초 + 시트가 올라온 것을 «볼» 여유 */
export const DWELL_TICKS = 18;

export function simStep(
    st: SimState,
    path: PolylinePoint[],
    stops: PolylinePoint[],
    multiplier: number,
): { loc: PolylinePoint | null; finished: boolean; stoppedAt?: PolylinePoint; via?: PolylinePoint[] } {
    // ── 정차 연기 중 — 같은 자리를 다시 낸다 (속도 0 이 측정되게)
    if (st.phase === 'dwell' && st.dwellAt) {
        st.dwellLeft -= 1;
        const loc = st.dwellAt;
        if (st.dwellLeft <= 0) { st.phase = 'cruise'; st.dwellAt = null; }
        return { loc, finished: false };
    }

    if (!path.length || st.idx >= path.length) return { loc: null, finished: true };

    const herePt = st.at ?? path[Math.min(st.idx, path.length - 1)];
    const unvisited = stops.filter(s => !st.visited.has(`${s.x},${s.y}`));

    // ── 접근 감속 — 다음 정거장이 1km 안이면 걸음을 ¼로
    const nearKm = unvisited.reduce((m, s) =>
        Math.min(m, getDistanceKm(herePt.y, herePt.x, s.y, s.x)), Infinity);
    const full = KM_PER_TICK * multiplier;
    const stepKm = nearKm <= APPROACH_KM ? full / 4 : full;

    /**
     * 🚗 **걸음은 목업과 같은 함수가 낸다** (`lib/driveStep` · 2026-09-12).
     *    점을 다 밟고, 지나온 점을 `via` 로 돌려준다 — 궤적이 카카오 곡선 그대로 남는다.
     */
    const walked = driveStep(
        { lng: herePt.x, lat: herePt.y },
        path.map(p => ({ lng: p.x, lat: p.y })),
        st.idx, stepKm);
    const via = walked.via.map(v => ({ x: v.lng, y: v.lat }));

    // ── 이번 걸음에 지나치는 정거장이 있으면 거기 서서 정차 연기를 시작한다
    const from = st.idx, to = walked.idx;
    const due = unvisited.find(s => {
        const i = nearestIndex(path, s);
        return i >= from && i < to;
    });
    if (due) {
        st.visited.add(`${due.x},${due.y}`);
        st.phase = 'dwell';
        st.dwellLeft = DWELL_TICKS;
        st.dwellAt = due;
        st.at = due;
        st.idx = to;   // 정거장 앞 구간은 지난 것으로 — 되돌지 않는다
        return { loc: due, finished: false, stoppedAt: due, via };
    }

    st.idx = walked.idx;
    st.at = { x: walked.at.lng, y: walked.at.lat };
    return { loc: st.at, finished: walked.finished && st.idx >= path.length, via };
}

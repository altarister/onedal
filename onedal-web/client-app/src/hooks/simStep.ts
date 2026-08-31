import { getDistanceKm } from '../lib/routeUtils';
import { nearestIndex } from './useMockGpsSimulator';

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
    /** 폴리라인 위 현재 인덱스 */
    idx: number;
    phase: 'cruise' | 'dwell';
    /** dwell 남은 틱 (1틱 = 실제 1초) */
    dwellLeft: number;
    /** 정차 연기 중 머무는 좌표 */
    dwellAt: PolylinePoint | null;
    /** 이미 들른 정거장 키 — 같은 자리를 두 번 찍지 않는다 */
    visited: Set<string>;
}

export const initialSimState = (idx = 0): SimState =>
    ({ idx, phase: 'cruise', dwellLeft: 0, dwellAt: null, visited: new Set() });

/** 정거장 접근으로 치는 반경(km) — 이 안에서는 감속 연기 */
export const APPROACH_KM = 1;
/** 도착 정차 연기(실초) — 정차 감지 10초 + 시트가 올라온 것을 «볼» 여유 */
export const DWELL_TICKS = 18;

export function simStep(
    st: SimState,
    path: PolylinePoint[],
    stops: PolylinePoint[],
    multiplier: number,
): { loc: PolylinePoint | null; finished: boolean; stoppedAt?: PolylinePoint } {
    // ── 정차 연기 중 — 같은 자리를 다시 낸다 (속도 0 이 측정되게)
    if (st.phase === 'dwell' && st.dwellAt) {
        st.dwellLeft -= 1;
        const loc = st.dwellAt;
        if (st.dwellLeft <= 0) { st.phase = 'cruise'; st.dwellAt = null; }
        return { loc, finished: false };
    }

    if (!path.length || st.idx >= path.length) return { loc: null, finished: true };

    const herePt = path[Math.min(st.idx, path.length - 1)];
    const unvisited = stops.filter(s => !st.visited.has(`${s.x},${s.y}`));

    // ── 접근 감속 — 다음 정거장이 1km 안이면 걸음을 ¼로
    const nearKm = unvisited.reduce((m, s) =>
        Math.min(m, getDistanceKm(herePt.y, herePt.x, s.y, s.x)), Infinity);
    const step = nearKm <= APPROACH_KM ? Math.max(1, Math.round(multiplier / 4)) : multiplier;

    // ── 이번 걸음에 지나치는 정거장이 있으면 거기 서서 정차 연기를 시작한다
    const from = st.idx, to = Math.min(from + step, path.length);
    const due = unvisited.find(s => {
        const i = nearestIndex(path, s);
        return i >= from && i < to;
    });
    if (due) {
        st.visited.add(`${due.x},${due.y}`);
        st.phase = 'dwell';
        st.dwellLeft = DWELL_TICKS;
        st.dwellAt = due;
        st.idx = to;   // 정거장 앞 구간은 지난 것으로 — 되돌지 않는다
        return { loc: due, finished: false, stoppedAt: due };
    }

    const loc = path[st.idx];
    st.idx += step;
    return { loc, finished: false };
}

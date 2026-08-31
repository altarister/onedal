import { describe, it, expect } from 'vitest';
import { simStep, initialSimState, DWELL_TICKS } from './simStep';

/**
 * 🎭 모의 주행 «연기» 검사 — 정거장 앞 감속 · 도착 정차(실초) · 재출발.
 *
 * 상태 기계(정차 5km/h↓ 10초 · 주행 20km/h↑ 10초)가 책상 시뮬에서도 밟히는가가
 * 목적이다 — 등속 순간통과 시뮬에서는 정차 상태가 한 번도 안 나왔다 (기사님 0831).
 */

/** 남북 직선 경로 — 한 칸 ≈ 111m (위도 0.001도) */
const path = Array.from({ length: 200 }, (_, i) => ({ x: 127.3, y: 37.3 + i * 0.001 }));
const M = 15;   // 기본 배속

describe('모의 주행 연기 — simStep', () => {
    it('정거장이 멀면 배속 그대로 달린다', () => {
        const st = initialSimState();
        simStep(st, path, [], M);
        expect(st.idx).toBe(M);
    });

    it('정거장 1km 안에서는 걸음이 ¼로 준다 — 감속 연기', () => {
        const stop = path[30];                       // 경로 위 정거장
        const st = initialSimState(25);              // 약 550m 앞
        simStep(st, path, [stop], M);
        expect(st.idx).toBeLessThanOrEqual(25 + Math.round(M / 4));
    });

    it('정거장에 닿으면 그 좌표를 찍고, 실초 정차 연기가 시작된다', () => {
        const stop = { x: 127.3005, y: 37.33 };      // 도로에서 살짝 떨어진 정거장
        const st = initialSimState(28);
        const r = simStep(st, path, [stop], M);
        expect(r.stoppedAt).toEqual(stop);
        // 정차 연기: DWELL_TICKS 실초 동안 같은 자리 — 정차 감지(10초)가 발화할 길이
        expect(DWELL_TICKS).toBeGreaterThan(10);
        for (let i = 0; i < DWELL_TICKS; i++) {
            expect(simStep(st, path, [stop], M).loc).toEqual(stop);
        }
        // 연기가 끝나면 경로로 복귀해 다시 달린다
        const after = simStep(st, path, [stop], M);
        expect(after.loc).not.toEqual(stop);
        expect(st.phase).toBe('cruise');
    });

    it('들른 정거장은 다시 서지 않는다', () => {
        const stop = path[30];
        const st = initialSimState(28);
        simStep(st, path, [stop], M);                // 도착
        for (let i = 0; i < DWELL_TICKS; i++) simStep(st, path, [stop], M);
        const idxBefore = st.idx;
        simStep(st, path, [stop], M);                // 같은 정거장을 지나쳐도
        expect(st.idx).toBeGreaterThan(idxBefore);   // 멈추지 않고 간다
    });

    it('경로 끝에 닿으면 finished — 반복하지 않는다', () => {
        const st = initialSimState(199);
        simStep(st, path, [], M);
        expect(simStep(st, path, [], M).finished).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { simStep, initialSimState, DWELL_TICKS, KM_PER_TICK } from './simStep';

/** 위도 1도 ≈ 110.574km — `lib/driveStep` 과 같은 자 */
const KM_PER_LAT = 110.574;

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
    it('정거장이 멀면 한 틱에 «배속 × 기본 걸음»만큼의 **거리**를 간다', () => {
        const st = initialSimState();
        simStep(st, path, [], M);
        const km = (st.at!.y - path[0].y) * KM_PER_LAT;
        expect(km).toBeCloseTo(KM_PER_TICK * M, 3);
    });

    it('🔴 지나온 점을 하나도 건너뛰지 않는다 — 카카오 곡선이 직선으로 펴지던 자리', () => {
        /**
         * 예전엔 `st.idx += 배속` 이라 **점 15개를 한 번에 뛰어넘었다.**
         * 궤적은 지나온 좌표만 잇는데, 밟지 않은 점은 남길 수도 없어
         * 카카오가 준 곡선이 **직선 토막**으로 그려졌다 (기사님: *"궤적이 엉망이야"*).
         * 지금은 목업과 같은 `driveStep` 이 점을 다 밟고 `via` 로 돌려준다.
         */
        const st = initialSimState();
        const r = simStep(st, path, [], M);
        const walked = Math.floor(KM_PER_TICK * M / (0.001 * KM_PER_LAT));   // ≈13칸
        expect(r.via!.length).toBeGreaterThan(walked);
        for (let i = 0; i <= walked; i++) expect(r.via![i]).toEqual(path[i]);
    });

    it('정거장 1km 안에서는 걸음이 ¼로 준다 — 감속 연기', () => {
        const stop = path[30];                       // 경로 위 정거장
        const st = initialSimState(25);              // 약 550m 앞
        simStep(st, path, [stop], M);
        expect(st.idx).toBeLessThanOrEqual(25 + Math.ceil(M / 4));
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

    /**
     * 🎭 **연기 눈금을 돌리면 시뮬이 따른다** (기사님 지시 2026-09-12:
     *    *"모의 주행의 정차시간, 서행하는 거 오른쪽 어드민에서 설정하면 좋겠는데"*).
     *
     * 🔴 인자로 받게만 해 두고 **안 쓰면 조용히 기본값으로 돈다** — 그 모양을 오늘 한 번
     *    당했다(설정 10초가 클로저에 갇힌 것). 그래서 «돌리면 정말 달라지는가»를 문다.
     */
    it('🔴 정차 시간을 줄이면 그만큼만 선다', () => {
        const stop = path[30];
        const st = initialSimState(28);
        simStep(st, path, [stop], M, { dwellSec: 3, approachKm: 1, slowFactor: 4 });
        expect(st.phase).toBe('dwell');
        for (let i = 0; i < 3; i++) simStep(st, path, [stop], M, { dwellSec: 3, approachKm: 1, slowFactor: 4 });
        expect(st.phase).toBe('cruise');   // 3초면 끝난다 — 18초가 아니다
    });

    /**
     * ⚠️ 배속을 **2** 로 낮춰 잰다 — 15 이면 한 틱에 1.5km 라 정거장을 **지나쳐 정차**해 버려
     *    «감속했는가»를 못 잰다 (처음 이 검사를 그렇게 짰다가 그 자리에서 드러났다).
     */
    const SLOW_M = 2;                      // 한 틱 0.2km
    const STOP_AT = 67;                    // 시작(58)에서 약 1.0km — 감속 반경 언저리

    it('🔴 서행 배수를 키우면 더 천천히 간다', () => {
        const stop = path[STOP_AT];
        const walked = (slowFactor: number) => {
            const st = initialSimState(58);
            simStep(st, path, [stop], SLOW_M, { dwellSec: 18, approachKm: 2, slowFactor });
            return (st.at!.y - path[58].y) * KM_PER_LAT;
        };
        expect(walked(8)).toBeLessThan(walked(2));
    });

    it('🔴 서행 반경을 0 으로 두면 감속하지 않는다 — 눈금이 실제로 읽힌다', () => {
        const stop = path[STOP_AT];
        const st = initialSimState(58);
        simStep(st, path, [stop], SLOW_M, { dwellSec: 18, approachKm: 0, slowFactor: 4 });
        const km = (st.at!.y - path[58].y) * KM_PER_LAT;
        expect(km).toBeCloseTo(KM_PER_TICK * SLOW_M, 3);   // 온전한 걸음
    });
});

import { describe, it, expect } from 'vitest';
import { simStep, initialSimState, simStateForStops, DWELL_TICKS, KM_PER_TICK, STOP_OFF_ROAD_KM } from './simStep';
import { nearestIndex } from './useMockGpsSimulator';

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

    /**
     * 🔴 **멀리 있는 정거장으로 순간이동하지 않는다** (기사님 실측 2026-09-12 21:36:11 —
     *    한 틱에 **10,916m**).
     *
     * ── 무엇이 났나 ──
     * `due` 판정이 **인덱스만** 봤다 — «이번 걸음이 지나친 정거장»을 `nearestIndex` 가
     * `[from, to)` 안에 드는지로만 골랐다. 그런데 **새 콜이 들어와 그 상차지가 `stops` 에
     * 붙는 순간**, 그 정거장의 최근접 인덱스가 우연히 그 구간에 들면 **실제로 10km 밖인데도**
     * 「지나쳤다」고 보고 `loc = due` 로 **그 자리에 찍었다.**
     *
     * ⚠️ 방아쇠는 «경로 갈아타기»가 아니라 **«새 정거장»** 이다 — 경로 지문(`routeSignature`)을
     *    아무리 조여도 이건 안 잡힌다. 인덱스만으로는 **먼 것과 지나친 것**을 못 가른다.
     * 🔴 **정거장 좌표를 찍는 동작 자체는 남긴다** — 물류센터가 도로에서 601m 떨어져 있어
     *    넣은 것이고(실측 곤지암), 그게 없으면 도착 감지가 영영 안 걸린다.
     */
    it('🔴 새 정거장이 멀리 붙어도 그 자리로 뛰지 않는다 (10.9km 점프)', () => {
        const st = initialSimState(0);
        /**
         * 경로에서 **옆으로** ≈10.6km 떨어진 정거장. 경로가 남북 직선이므로 이 점의
         * **최근접 인덱스는 0**(출발점)이고, 이번 걸음 구간 `[0, to)` 에 그대로 든다 —
         * 인덱스만 보면 「지나쳤다」가 되지만 **실제로는 10km 밖**이다.
         * (새 콜의 상차지가 지금 경로 옆에 붙는 것이 정확히 이 모양이다)
         */
        const far = { x: 127.3 + 0.12, y: 37.3 };
        simStep(st, path, [far], M);
        /* 위도·경도 둘 다 본다 — 옆으로 뛴 것도 점프다 */
        const dLat = Math.abs(st.at!.y - path[0].y) * KM_PER_LAT;
        const dLng = Math.abs(st.at!.x - path[0].x) * 88;   // 위도 37.3 에서 경도 1도 ≈ 88km
        const jumped = Math.hypot(dLat, dLng);
        /* 한 틱 걸음(배속 × 기본)보다 크게 뛰면 순간이동이다 */
        expect(jumped).toBeLessThan(KM_PER_TICK * M * 2);
    });

    /**
     * 🔴 **가까운 정거장은 여전히 «지나친 것»으로 본다** — 도로에서 601m 떨어진
     *    물류센터를 잡으려고 넣은 동작이라, 이걸 잃으면 도착 감지가 영영 안 걸린다.
     */
    it('🔴 걸음 안에 있는 정거장에는 그대로 선다 (601m 물류센터를 잃지 않는다)', () => {
        const st = initialSimState(0);
        /* 이번 걸음 안(≈1.1km 앞)이고 도로에서 살짝 벗어난 정거장 */
        const near = { x: 127.3 + 0.004, y: 37.3 + 0.010 };
        const r = simStep(st, path, [near], M);
        expect(r.stoppedAt).toEqual(near);
        expect(st.phase).toBe('dwell');
    });

    /**
     * 🔴 **이탈폭은 배속에 딸려 줄지 않는다** (기사님 지시).
     *
     * 처음엔 닿는 거리가 `stepKm + 이탈폭` 이었다. 그러면 **1배속에서 0.74km ·
     * 서행이면 0.71km** 로 쪼그라들어 **601m 짜리가 겨우 통과**한다 — 표본보다 조금만
     * 먼 곳이 나오면 저배속에서 못 밟는다. 이탈폭은 **물리 상수**(정거장이 도로에서
     * 떨어진 거리)이지 속도의 함수가 아니다.
     */
    it('🔴 1배속에서도 도로 밖 정거장을 밟는다 — 이탈폭이 배속을 안 탄다', () => {
        const st = initialSimState(0);
        /**
         * 도로에서 **옆으로 601m** 떨어진 정거장 — 곤지암 물류센터 실측.
         * ⚠️ 위도는 출발점과 같게 둔다 — 1배속 서행은 한 틱에 **한 칸(111m)도 못 가서**,
         *    앞쪽에 두면 애초에 «지나치는» 구간에 안 든다 (그건 이 검사가 볼 것이 아니다).
         *    여기서 보려는 것은 **거리 문턱이 배속에 딸려 줄지 않는가** 하나다.
         */
        const off = { x: 127.3 + 0.00683, y: 37.3 };   // 경도 0.00683° ≈ 601m
        const r = simStep(st, path, [off], 1, { dwellSec: 18, approachKm: 1, slowFactor: 4 });
        expect(r.stoppedAt).toEqual(off);
    });

    /**
     * 🔇 **못 밟고 지나치면 «지나쳤다»를 실어 보낸다** — 조용히 넘어가면 콜이 안 끝나는데
     *    화면에도 로그에도 흔적이 없다. 순수 함수라 여기서 찍지 않고 사실만 돌려준다.
     */
    it('🔴 너무 멀어 못 밟으면 passedBy 로 알린다', () => {
        const st = initialSimState(0);
        const far = { x: 127.3 + 0.12, y: 37.3 };     // 옆으로 ≈10.6km
        const r = simStep(st, path, [far], M);
        expect(r.stoppedAt).toBeUndefined();
        expect(r.passedBy?.distKm).toBeGreaterThan(STOP_OFF_ROAD_KM);
        expect(r.passedBy?.reachKm).toBeGreaterThan(0);
    });
});

describe('대기 뒤 새 경로 — 서 있던 자리에서 출발한다 (#133 개정 · onedal-49 검토)', () => {
    it('🔴 첫 걸음이 서 있던 자리에서 한 걸음 안이다 — 경로의 먼 점으로 순간이동하지 않는다', () => {
        /* 서 있던 자리(마지막 하차지) — 새 경로는 그 자리에서 시작해 북쪽으로 갔다가 되돌아온다 */
        const here = { x: 127.3, y: 37.3 };
        const outAndBack = [...path.slice(0, 120), ...path.slice(0, 120).reverse()];
        const st = initialSimState(nearestIndex(outAndBack, here));
        st.at = { ...here };
        const r = simStep(st, outAndBack, [], M);
        expect(r.loc).not.toBeNull();
        const movedKm = Math.hypot((r.loc!.x - here.x) * 88.6, (r.loc!.y - here.y) * KM_PER_LAT);
        expect(movedKm).toBeLessThanOrEqual(KM_PER_TICK * M + 0.01);
    });

    /**
     * 🔴 **정거장이 한 순간 비어도 되감기지 않는다** (여섯 번째 바퀴 · onedal-49 짚음).
     *    합짐 선점 때 관제웹 목록이 0.2초 비자(#137) 걸음 상태가 통째로 0 이 되어 256 → 68 로 되감기고,
     *    이미 들른 상차지에서 또 섰다. 뿌리(#137)는 고쳤지만 같은 모양이 다른 틈으로 다시 오지 않게 —
     *    «빔»은 **들른 장부만** 비우고(판마다 좌표가 같은 문제 · 2026-08-31) 자리(idx·at)는 둔다.
     *    다시 채워지면 서버가 «들렀다»고 한 정거장을 장부에 옮겨 적는다 (가동 때만 옮기던 것).
     */
    it('🔴 정거장이 비었다 다시 채워져도 자리가 안 뛰고 들른 곳에 다시 서지 않는다', () => {
        const stop = { x: 127.3, y: 37.3 + 20 * 0.001 };
        let st = initialSimState();
        st.idx = 60; st.at = { x: 127.3, y: 37.3 + 60 * 0.001 }; st.visited.add(`${stop.x},${stop.y}`);
        st = simStateForStops(st, []);
        expect([st.idx, st.at]).toEqual([60, { x: 127.3, y: 37.3 + 60 * 0.001 }]);
        st = simStateForStops(st, [{ ...stop, visited: true }]);
        expect(st.visited.has(`${stop.x},${stop.y}`)).toBe(true);
    });

    it('비었을 때 들른 장부는 비운다 — 다음 판의 같은 좌표를 «들렀다»로 보지 않는다', () => {
        const st = initialSimState();
        st.visited.add('127.3,37.32');
        expect(simStateForStops(st, []).visited.size).toBe(0);
    });
});

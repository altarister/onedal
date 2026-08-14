import { useEffect, useRef, useState } from 'react';

/**
 * 폴리라인에서 **지금 자리와 가장 가까운 지점**의 인덱스.
 *
 * 경로가 갈릴 때(콜을 내렸다·합짐이 붙었다) 이어 달릴 자리를 찾는 데 쓴다.
 * 자리를 모르면 `0` — 처음부터가 맞다 (지어낼 값이 없다).
 *
 * 위경도 도(度) 단위 제곱거리로 비교한다. 실제 거리(m)로 바꿀 필요가 없다 —
 * **가장 가까운 하나를 고르는 데는 순서만 같으면 된다.**
 */
export function nearestIndex(
    path: Array<{ x: number; y: number }> | null | undefined,
    here: { x: number; y: number } | null | undefined,
): number {
    if (!path?.length || !here) return 0;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
        const dx = path[i].x - here.x, dy = path[i].y - here.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

interface PolylinePoint {
    x: number;
    y: number;
}

interface MockGpsSimulatorProps {
    isActive: boolean;
    routePolyline: PolylinePoint[] | null;
    speedMultiplier?: number;
    /** 경로 끝에 닿았을 때. 남은 가상 위치를 걷어내라는 신호다 */
    onFinished?: () => void;
}

/**
 * 🧪 지정된 경로(Polyline)를 따라 가상의 GPS 좌표(x, y)를 순차적으로 방출하는 시뮬레이터 훅
 * @param isActive 시뮬레이터 동작 여부
 * @param routePolyline 주행할 경로의 폴리라인 좌표 배열
 * @param speedMultiplier 주행 속도 배속 (기본값: 15배속, 약 1초에 1~2km)
 * @returns 현재 주행 중인 가상 위치의 { x, y } 좌표 (경도, 위도)
 */
export function useMockGpsSimulator({
    isActive,
    routePolyline,
    speedMultiplier = 15,
    onFinished,
}: MockGpsSimulatorProps) {
    const [mockLocation, setMockLocation] = useState<{ x: number; y: number } | null>(null);
    const indexRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const routeRef = useRef(routePolyline);
    /** 이 경로를 끝까지 달렸나 — **끝났으면 다시 출발하지 않는다** */
    const finishedRef = useRef(false);
    /** 지금 어디쯤 있나 — 경로가 갈릴 때 이어붙일 기준 (클로저가 굳지 않게 ref) */
    const hereRef = useRef<{ x: number; y: number } | null>(null);

    /**
     * 🔴 **경로가 바뀌어도 출발점으로 순간이동하지 않는다.**
     *
     * 2026-08-14 기사님: *"콜이 2개이고 중간에 합짐을 내리고 하차 완료 눌렀더니
     * 경로를 다시 설정해서 꼬였어."* 서버 쪽 원인(다녀온 상차지를 다시 경유)은 `6d30b0e`
     * 에서 고쳤는데, **화면이 꼬여 보인 절반은 여기였다.**
     *
     *     22:52:59  하트비트 2 → 1건            (합짐 하나를 내림)
     *     📍 Mock GPS 0/1656  x=127.294        🔴 광주 원점으로 순간이동
     *     22:53:02  📍 Mock GPS 0/2294         현위치
     *
     * 콜을 하나 내리면 남은 콜의 폴리라인으로 갈아타는데, **길이가 다르면 무조건 0 번째부터**
     * 달렸다. 그래서 파주 근처에 있던 차가 광주로 되돌아갔다.
     *
     * 🔴 **보기에만 이상한 게 아니다.** 이 좌표는 `gpsBridge` 로 서버에 그대로 올라간다 —
     *    서버는 그걸 "지금 내 위치"로 믿으므로 **지나온 구간 제거·도착 감지가 통째로 틀어진다.**
     *    (실 GPS 는 영향 없다. 시뮬레이터는 `import.meta.env.DEV` 뒤에 있다)
     *
     * 경로가 갈리면 **지금 자리에서 가장 가까운 지점**으로 이어붙인다. 뒤로 안 돌아가니까.
     */
    useEffect(() => {
        if (routeRef.current?.length !== routePolyline?.length) {
            indexRef.current = nearestIndex(routePolyline, hereRef.current);
            finishedRef.current = false;
        }
        routeRef.current = routePolyline;
    }, [routePolyline]);

    useEffect(() => {
        if (!isActive) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        /**
         * 🔴 **끝까지 갔으면 다시 시작하지 않는다.**
         *
         * 2026-08-14: 도착한 뒤에도 시뮬레이터가 **처음부터 반복**해서 달렸다.
         * 원인은 아래 두 줄이었다 —
         *
         *     if (!intervalRef.current) indexRef.current = 0;   // ← 되살아날 때마다 출발점으로
         *
         * 이 훅은 실 GPS 가 들어오면 잠시 멈추고 끊기면 다시 켜진다. 그때마다 인덱스가 0 으로
         * 돌아가니, 잠깐 멈추기만 해도 **여태 달린 게 없던 일이 됐다.**
         * 멈췄다 켜지는 것은 **이어 달리는 것**이어야 한다.
         */
        if (finishedRef.current) return;

        console.log(`🚀 [Mock GPS] ${indexRef.current > 0 ? `이어 달림 (${indexRef.current}번째 지점부터)` : '가동 시작'} — 총 ${routeRef.current?.length || 0} 포인트`);

        intervalRef.current = setInterval(() => {
            const path = routeRef.current;
            if (!path || path.length === 0) return;

            if (indexRef.current >= path.length) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                finishedRef.current = true;   // 다시 켜져도 재출발하지 않는다
                console.log(`🏁 [Mock GPS] 목적지 도달 — 시뮬레이션 종료 (반복하지 않습니다)`);
                // 🔴 남은 가상 위치를 걷어내라고 알린다. 안 그러면 서버가 그 자리를
                //    "지금 내 위치" 로 믿고 다음 콜의 경로를 엉뚱하게 그린다
                onFinished?.();
                return;
            }

            const pt = path[indexRef.current];
            console.log(`📍 [Mock GPS] 이동 중: x=${pt.x}, y=${pt.y} (진척도: ${indexRef.current}/${path.length})`);
            hereRef.current = { x: pt.x, y: pt.y };
            setMockLocation({ x: pt.x, y: pt.y });

            indexRef.current += speedMultiplier;
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isActive, speedMultiplier]);

    return mockLocation;
}

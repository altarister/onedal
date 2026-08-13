import { useEffect, useRef, useState } from 'react';

interface PolylinePoint {
    x: number;
    y: number;
}

interface MockGpsSimulatorProps {
    isActive: boolean;
    routePolyline: PolylinePoint[] | null;
    speedMultiplier?: number;
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
    speedMultiplier = 15
}: MockGpsSimulatorProps) {
    const [mockLocation, setMockLocation] = useState<{ x: number; y: number } | null>(null);
    const indexRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const routeRef = useRef(routePolyline);
    /** 이 경로를 끝까지 달렸나 — **끝났으면 다시 출발하지 않는다** */
    const finishedRef = useRef(false);

    // 경로가 바뀌면(= 다른 콜) 처음부터. 같은 경로면 있던 자리를 지킨다
    useEffect(() => {
        if (routeRef.current?.length !== routePolyline?.length) {
            indexRef.current = 0;
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
                return;
            }

            const pt = path[indexRef.current];
            console.log(`📍 [Mock GPS] 이동 중: x=${pt.x}, y=${pt.y} (진척도: ${indexRef.current}/${path.length})`);
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

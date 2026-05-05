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

    // 경로가 변경되면 새 경로를 저장하고, 길이가 다르면 인덱스 초기화
    useEffect(() => {
        if (routeRef.current?.length !== routePolyline?.length) {
            indexRef.current = 0;
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

        console.log(`🚀 [Mock GPS] 시뮬레이터 가동 시작 (총 ${routeRef.current?.length || 0} 포인트)`);

        if (!intervalRef.current) {
            indexRef.current = 0;
        }

        intervalRef.current = setInterval(() => {
            const path = routeRef.current;
            if (!path || path.length === 0) return;

            if (indexRef.current >= path.length) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                console.log(`🏁 [Mock GPS] 목적지 도달 시뮬레이션 완료`);
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

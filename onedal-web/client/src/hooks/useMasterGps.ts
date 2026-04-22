import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';
import { useMockGpsSimulator } from './useMockGpsSimulator';

interface PolylinePoint {
    x: number;
    y: number;
}

/**
 * 관제웹의 실시간 위치(Real) 및 폴리라인 시뮬레이션(Mock)을 처리하는 마스터 GPS 훅
 */
export function useMasterGps(
    isTestMode: boolean,
    isDriving: boolean,
    activePolyline: PolylinePoint[] | null
) {
    const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number } | null>(null);

    // 1. Mock 시뮬레이터 훅 연결 (isActive가 true일 때만 가동됨)
    const mockGps = useMockGpsSimulator({
        isActive: isTestMode && isDriving && activePolyline !== null && activePolyline.length > 0,
        routePolyline: activePolyline,
        speedMultiplier: 15
    });

    // 가상 GPS 좌표가 방출될 때마다 현재 위치 업데이트 및 서버 전송
    useEffect(() => {
        if (isTestMode && mockGps) {
            const loc = { lat: mockGps.y, lng: mockGps.x };
            setCurrentGps(loc);
            socket.emit("dashboard-gps-update", loc);
        }
    }, [mockGps, isTestMode]);

    // 2. Real 모드 (향후 React Native 이식 시 navigator.geolocation.watchPosition 사용)
    useEffect(() => {
        if (isTestMode) return;

        // 웹 환경에서의 임시 Real 모드 (운영 환경)
        let watchId: number;
        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    if (isDriving) {
                        const loc = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        console.log(`📍 [Master GPS - Real] 실제 위치 이동: 위도 ${loc.lat}, 경도 ${loc.lng}`);
                        setCurrentGps(loc);
                        socket.emit("dashboard-gps-update", loc);
                    }
                },
                (error) => console.error("Geolocation 에러:", error),
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
        }

        return () => {
            if (watchId !== undefined && "geolocation" in navigator) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, [isTestMode, isDriving]);

    return { currentGps };
}

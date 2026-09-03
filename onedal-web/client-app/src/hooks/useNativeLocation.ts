import { useEffect, useRef } from 'react';
import { useLocationStore } from '../stores/useLocationStore';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * 네이티브 GPS 위치 추적 훅.
 * 
 * Capacitor 환경(네이티브 앱)에서는 고정밀 GPS를 사용하고,
 * 브라우저 환경(로컬 개발)에서는 navigator.geolocation을 폴백으로 사용합니다.
 * 
 * 획득한 좌표는 Zustand useLocationStore에 자동으로 캐싱됩니다.
 */
export function useNativeLocation(enabled = true) {
    const { setLocation, setTracking, setError } = useLocationStore();
    const watchIdRef = useRef<number | null>(null);
    const isInitializedRef = useRef(false);

    useEffect(() => {
        /**
         * 🧭 **내비 화면은 위치를 «받기만» 한다** (기사님 지적 2026-09-03).
         * 개인 폰(아이폰)에서 이 화면을 열면 관제폰과 좌표가 **한 차량으로 섞인다** —
         * 위치 점프로 찍히고 도착·지나침 판정이 통째로 흔들린다.
         * 훅은 조건부로 못 부르므로 **인자로 끈다** (호출 자리를 옮기지 않는 가장 단순한 길).
         */
        if (!enabled) return;
        if (isInitializedRef.current) return;
        isInitializedRef.current = true;

        // 화면 꺼짐 방지 활성화
        KeepAwake.keepAwake().catch(() => {
            // 브라우저 환경에서는 무시 (Web Fallback 없음)
            console.log('[1DAL] KeepAwake not available (browser fallback)');
        });

        startTracking();

        return () => {
            stopTracking();
            KeepAwake.allowSleep().catch(() => {});
        };
    }, []);

    function startTracking() {
        if (!('geolocation' in navigator)) {
            setError('이 기기에서 GPS를 사용할 수 없습니다.');
            return;
        }

        setTracking(true);

        // watchPosition: 위치가 변할 때마다 콜백 호출
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                setLocation(latitude, longitude, accuracy || 0);
            },
            (error) => {
                console.error('[1DAL GPS] 위치 획득 실패:', error.message);
                setError(error.message);
            },
            {
                enableHighAccuracy: true, // GPS 칩 사용 (높은 정확도)
                timeout: 10000,           // 10초 타임아웃
                maximumAge: 3000,         // 3초 이내 캐시 허용
            }
        );
    }

    function stopTracking() {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setTracking(false);
    }

    return { startTracking, stopTracking };
}

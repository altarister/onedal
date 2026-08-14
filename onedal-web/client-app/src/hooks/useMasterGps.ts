import { useEffect, useRef, useState } from 'react';
import { publishLocation } from '../lib/gpsBridge';
import { useMockGpsSimulator } from './useMockGpsSimulator';
import { useLocationStore } from '../stores/useLocationStore';

interface PolylinePoint {
    x: number;
    y: number;
}

/** 실 GPS 가 이 시간 넘게 안 오면 "없는 것"으로 본다 (그때 시뮬레이터가 대신 달린다) */
const REAL_GPS_STALE_MS = 15_000;

/**
 * 관제웹의 마스터 GPS — **실 GPS 와 시뮬레이터가 같은 통로를 쓴다.**
 *
 * 기사님(2026-08-14): *"출발을 눌렀을 때 GPS 가 활성화된 상태이면 앱의 GPS 로 작동하고,
 * 그렇지 않으면 시뮬레이터가 작동하도록. 둘 다 일관적으로 같은 품질의 코드를 적용 가능."*
 *
 * 그래서 **고르는 것은 좌표의 출처뿐**이다. 그 뒤(`dashboard-gps-update` → 서버의
 * 지나온 구간 제거)는 완전히 같은 길을 간다. 시뮬레이터로 확인한 것이 실제 운행에서도
 * 그대로 성립한다 — 검사용 우회로를 따로 만들면 그 보장이 사라진다.
 *
 * 🔴 **실 GPS 가 언제나 이긴다.** 시뮬레이터는 **빈자리를 메울 뿐**이다:
 *   · 실 좌표가 한 번이라도 오면 그 즉시 시뮬레이터를 멈춘다
 *   · 15초 넘게 안 오면(권한 거부·실내·기기 없음) 시뮬레이터가 이어 달린다
 *   이 15초가 **떨림 방지**다 — 신호가 오락가락할 때마다 갈아타면 위치가 튄다.
 */
export function useMasterGps(
    isTestMode: boolean,
    isDriving: boolean,
    activePolyline: PolylinePoint[] | null
) {
    const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number } | null>(null);
    const { lat: nativeLat, lng: nativeLng } = useLocationStore();

    /** 실 좌표가 마지막으로 온 시각. 0 = 아직 한 번도 안 왔다 */
    const lastRealFixAt = useRef(0);
    /** 지금 좌표를 누가 대고 있나 — 화면·로그에 그대로 쓴다 */
    const [source, setSource] = useState<'real' | 'mock' | 'none'>('none');

    /** 실 좌표를 받았다 — 한 곳에서만 처리한다 */
    const pushReal = (loc: { lat: number; lng: number }, from: 'native' | 'browser') => {
        lastRealFixAt.current = Date.now();
        setSource('real');
        setCurrentGps(loc);
        publishLocation(loc.lat, loc.lng, from);
    };

    // ── 1. 네이티브(앱 웹뷰)가 밀어 주는 좌표
    useEffect(() => {
        if (nativeLat === null || nativeLng === null) return;
        pushReal({ lat: nativeLat, lng: nativeLng }, 'native');
    }, [nativeLat, nativeLng]);

    // ── 2. 브라우저 위치 — **테스트 중에도 계속 지켜본다.**
    //      실 GPS 가 살아나면 그 순간 시뮬레이터를 밀어내야 하기 때문이다
    useEffect(() => {
        if (!isDriving || !("geolocation" in navigator)) return;
        const watchId = navigator.geolocation.watchPosition(
            (position) => pushReal({ lat: position.coords.latitude, lng: position.coords.longitude }, 'browser'),
            (error) => console.warn(`📍 [Master GPS] 실 위치를 못 받습니다 (${error.message}) — 시뮬레이터가 대신 달립니다`),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isDriving]);

    // ── 3. 실 GPS 가 있나 없나를 주기적으로 판정 (없으면 시뮬레이터 차례)
    const [realIsLive, setRealIsLive] = useState(false);
    useEffect(() => {
        if (!isDriving) { setRealIsLive(false); return; }
        const tick = () => setRealIsLive(Date.now() - lastRealFixAt.current < REAL_GPS_STALE_MS);
        tick();
        const id = setInterval(tick, 3000);
        return () => clearInterval(id);
    }, [isDriving]);

    /**
     * 시뮬레이터가 도는 조건.
     * `isTestMode` 는 **강제 스위치**다 — 실 GPS 가 있어도 시뮬레이터로 달리고 싶을 때.
     */
    const useMock = isDriving
        && !!activePolyline?.length
        && (isTestMode || !realIsLive);

    const mockGps = useMockGpsSimulator({
        isActive: useMock,
        routePolyline: activePolyline,
        speedMultiplier: 15
    });

    useEffect(() => {
        if (!useMock || !mockGps) return;
        const loc = { lat: mockGps.y, lng: mockGps.x };
        setSource('mock');
        setCurrentGps(loc);
        publishLocation(loc.lat, loc.lng, 'mock');
    }, [mockGps, useMock]);

    // 출처가 바뀌는 순간만 알린다 (매 좌표마다 찍으면 로그가 묻힌다)
    useEffect(() => {
        if (!isDriving) return;
        console.log(`📍 [Master GPS] 좌표 출처 = ${
            source === 'real' ? '실제 GPS' : source === 'mock' ? '시뮬레이터' : '아직 없음'}`);
    }, [source, isDriving]);

    return { currentGps, gpsSource: source };
}

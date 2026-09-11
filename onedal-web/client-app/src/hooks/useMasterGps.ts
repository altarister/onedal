import { useEffect, useRef, useState } from 'react';
import { publishLocation, endMockDriving } from '../lib/gpsBridge';
import { useMockGpsSimulator } from './useMockGpsSimulator';
import { useMockDriveStore } from '../stores/mockDriveStore';
import { useLocationStore } from '../stores/useLocationStore';

interface PolylinePoint {
    x: number;
    y: number;
}

/** 실 GPS 가 이 시간 넘게 안 오면 "없는 것"으로 본다 */
const REAL_GPS_STALE_MS = 15_000;

/**
 * 🔴 **시뮬레이터는 개발 빌드에만 존재한다.**
 *
 * 기사님(2026-08-14): *"나중에 실 폰에서 앱으로 진짜 GPS 가 실행될 때는 다른 것에
 * 영향을 주면 안 된다."*
 *
 * 처음에는 *"실 GPS 가 15초 안 오면 시뮬레이터가 이어 달린다"* 로 만들었다. 테스트는
 * 편했지만 **실 운행을 안 본 설계**였다 — 터널·지하주차장·건물 안에서 GPS 가 끊기면
 * **15초 뒤 시뮬레이터가 켜져 가짜 좌표를 서버로 보낸다.** 서버는 그걸 진짜로 믿고
 * 경유를 다시 그린다.
 *
 * `import.meta.env.DEV` 는 `vite build` 에서 `false` 로 접히므로, **실 폰에 들어가는
 * 번들에는 시뮬레이터 코드가 아예 없다.** 켜질 코드가 없으면 켜질 일도 없다.
 */
const SIMULATOR_AVAILABLE = import.meta.env.DEV;

/* 🐢🐇 **속도는 스토어가 정한다** — 주소창 `?speed=` 는 `mockDriveStore` 의 **첫값**으로만
   산다 (기사님 2026-09-12: 버튼으로 켜고 끈다). 옛 `mockSpeedMultiplier()` 는 그리로 옮겼다. */

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
 * 🔴 **실 GPS 가 언제나 이긴다.** 시뮬레이터는 **개발 빌드에서 빈자리를 메울 뿐**이다:
 *   · 실 좌표가 한 번이라도 오면 그 즉시 시뮬레이터를 멈춘다
 *   · 15초 넘게 안 오면(권한 거부·실내) 시뮬레이터가 이어 달린다 — **개발 빌드에서만**
 *   이 15초가 **떨림 방지**다 — 신호가 오락가락할 때마다 갈아타면 위치가 튄다.
 *
 * 🔴 **시뮬레이션이 끝나면 마지막 실제 좌표를 되돌려 보낸다.** 안 그러면 가상 위치가
 *    서버에 남아 **이후 모든 경로 계산을 오염시킨다** — 2026-08-14 에 실제로 그랬다.
 *    파주에서 멈춘 가상 좌표가 남아, 광주에서 잡은 콜의 경로가 `파주 → 광주 → 파주`
 *    (75km 짜리가 156km)로 그려졌다. 시뮬레이션이 끝났으면 거기 있는 게 아니다.
 */
export function useMasterGps(
    isDriving: boolean,
    activePolyline: PolylinePoint[] | null,
    /** 🏁 들러야 할 정거장 — 모의 주행이 도로를 벗어나 실제 좌표를 찍게 한다 (2026-08-25) */
    stops?: PolylinePoint[],
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
     * 시뮬레이터가 도는 조건 — **개발 빌드에서, 실 GPS 가 없을 때만.**
     * 실 폰 빌드에서는 `SIMULATOR_AVAILABLE` 이 false 라 절대 돌지 않는다.
     */
    /**
     * 🎭 **손으로 켠다** (기사님 확정 2026-09-12 — *"경로가 생기면 현황판도 알게 될 거고
     *    그때 **버튼을 활성화해서 클릭**하도록 하면 될 듯"*).
     *
     * 🔴 예전엔 위 조건이 맞으면 **저절로** 시작했다. 끄는 길이 없어 «그만 보고 싶은데 계속
     *    도는» 상태가 됐고 속도는 주소창 `?speed=` 뿐이었다. 이제 `running` 이 주인이다.
     * 🔴 **«켤 수 있나»는 여기서 올린다** — 현황판이 «경로가 있나»를 제 손으로 다시 보면
     *    두 곳이 다른 답을 낸다 (규칙 ③). 경로가 사라지면 스토어가 돌던 것도 멈춘다.
     * ⚠️ 실 GPS 가 살아 있으면 **진짜가 이긴다** — 켜 뒀어도 가짜를 안 쓴다.
     */
    const canMock = SIMULATOR_AVAILABLE && isDriving && !!activePolyline?.length;
    const setMockAvailable = useMockDriveStore(st => st.setAvailable);
    const mockRunning = useMockDriveStore(st => st.running);
    const mockSpeed = useMockDriveStore(st => st.speed);
    useEffect(() => { setMockAvailable(canMock); }, [canMock, setMockAvailable]);

    const useMock = canMock && mockRunning && !realIsLive;

    const mockGps = useMockGpsSimulator({
        isActive: useMock,
        routePolyline: activePolyline,
        stops,
        speedMultiplier: mockSpeed,   // 🐢🚗🚀 스토어가 정한다 (주소창 `?speed=` 는 첫값으로만)
        // 경로 끝에 닿으면 가상 위치를 걷어내고 마지막 실제 좌표로 되돌린다
        onFinished: () => { endMockDriving(); setSource('none'); useMockDriveStore.getState().stop(); },
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

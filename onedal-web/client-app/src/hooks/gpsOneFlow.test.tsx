// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { initialMotion, motionOnFix, motionOnTick } from '../components/dashboard/driveMotion';

/**
 * 📍 **위치 한 점은 한 번만 흐른다** (38 F09 · 72판 G7 · M1 — 시속 55~100km 로 달리는데 «주행판정»이 «서 있음»).
 *
 * 좌표 하나가 두 길(보내는 훅 `useGpsTelemetry` · 관제 화면 `useMasterGps`)로 `publishLocation` 되면
 * 화면 알림(`local-gps-update`)이 같은 좌표로 두 번 온다. 두 번째가 1ms 라도 늦으면 `driveMotion` 이 그 자리에서
 * 속도를 0 으로 내려(«내려갈 땐 즉시») «운행 중»이 유지 초를 못 채운다 — 🚀 출발(GATHERING → DELIVERING)이 안 선다.
 *
 * 🔴 이 검사는 소스를 안 읽는다 — 두 훅을 실제로 함께 그려 «알림이 몇 번 나가나 · 판정이 서나»를 본다.
 */

const emit = vi.fn();
vi.mock('../lib/socket', () => ({ socket: { emit: (...a: unknown[]) => emit(...a), on: () => {}, off: () => {}, connected: false } }));

const HOLD_MS = 10_000;
const LAT_PER_KM = 1 / 110.574;
const KMH = 55;

describe('driveMotion — 같은 좌표가 한 번 더 오면 (계산으로 보인 사실)', () => {
    /** 1초마다 북쪽으로 KMH 로 간 좌표 · dupEvery 마다 같은 좌표가 1ms 뒤 한 번 더 */
    function run(dupEvery: number) {
        let st = initialMotion();
        for (let s = 0; s <= 20; s++) {
            const now = s * 1000, lat = 37.3 + s * (KMH / 3600) * LAT_PER_KM;
            st = motionOnFix(st, { lat, lng: 127.3 }, now);
            if (dupEvery && s % dupEvery === 0) st = motionOnFix(st, { lat, lng: 127.3 }, now + 1);
            st = motionOnTick(st, now + 500, HOLD_MS);
        }
        return st.mode;
    }
    it('55km/h 한 번씩이면 «운행 중»', () => expect(run(0)).toBe('drive'));
    it('🔴 55km/h 에서 좌표 둘에 하나꼴로 같은 좌표가 1ms 뒤 한 번 더 오면 «서 있음» — 실주행에서도 출발이 안 선다', () => expect(run(2)).toBe('idle'));
});

describe('관제앱 — 저장소 좌표 하나 → 화면 알림 하나 · 운행 판정', () => {
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
        vi.setSystemTime(1_760_000_000_000);
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
        emit.mockClear();
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));   // 마운트 때 설정을 부르는 모듈 — 이 검사의 관심이 아니다(끝에 끊김 소음 없게)
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

    /**
     * 실측 모양: 위치 감시가 저장소에 좌표를 넣고(App `useNativeLocation`),
     * 같은 좌표가 8~19ms 뒤 운행 국면의 두 번째 감시로도 온다 — 그래서 감시 콜백을 12ms 뒤에 같은 좌표로 부른다.
     */
    async function drive15s(isDriving: boolean) {
        const { useLocationStore } = await import('../stores/useLocationStore');
        const { useGpsTelemetry } = await import('./useGpsTelemetry');
        const { useMasterGps } = await import('./useMasterGps');
        const { useDriveMotion } = await import('../components/dashboard/VehicleStatusPanel');
        const watchers: Array<(p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void> = [];
        Object.defineProperty(navigator, 'geolocation', { configurable: true,
            value: { watchPosition: (cb: (typeof watchers)[number]) => watchers.push(cb), clearWatch: () => {} } });
        let mode: 'drive' | 'idle' = 'idle';
        /* App(보내는 훅) + StageView(관제 화면) + 주행판정 — 관제앱에서 함께 떠 있는 셋 */
        function Probe() { useGpsTelemetry(true); useMasterGps(isDriving, null); mode = useDriveMotion(); return null; }
        act(() => root.render(<Probe />));

        const seen: number[] = [];
        const on = (e: Event) => seen.push((e as CustomEvent<{ lat: number }>).detail.lat);
        window.addEventListener('local-gps-update', on);
        const fixes = 15;
        for (let s = 0; s < fixes; s++) {
            const lat = 37.3 + s * (KMH / 3600) * LAT_PER_KM;
            act(() => useLocationStore.getState().setLocation(lat, 127.3, 5));
            act(() => { vi.advanceTimersByTime(12); });
            act(() => watchers.forEach(cb => cb({ coords: { latitude: lat, longitude: 127.3, accuracy: 5 } })));
            act(() => { vi.advanceTimersByTime(988); });
        }
        window.removeEventListener('local-gps-update', on);
        const perFix = new Map<number, number>(); for (const lat of seen) perFix.set(lat, (perFix.get(lat) ?? 0) + 1);
        return { twice: [...perFix.values()].filter(n => n > 1), flowed: perFix.size, fixes, mode };
    }

    it('🔴 모으는 국면 · 55km/h 15초 — 좌표마다 알림 한 번 · «운행 중»이 선다', async () => {
        const r = await drive15s(false);
        expect(r.twice).toEqual([]);          // 한 좌표가 두 번 흐르지 않는다(보내는 훅 + 관제 화면)
        expect(r.flowed).toBe(r.fixes);       // 좌표마다 한 번은 흐른다(같은 좌표만 거름)
        expect(r.mode).toBe('drive');
    });

    it('🔴 운행 국면 · 55km/h 15초 — 두 번째 위치 감시가 같은 좌표를 한 번 더 내지 않는다 · «운행 중»이 선다', async () => {
        const r = await drive15s(true);
        expect(r.twice).toEqual([]);
        expect(r.flowed).toBe(r.fixes);
        expect(r.mode).toBe('drive');
    });

    /**
     * 서 있을 때(F09 후속): 폰은 서 있어도 새 측정을 낸다(실측 — 실내 진짜 GPS 8초 안팎 · JoyStick 1초).
     * 한 점의 이름은 좌표가 아니라 측정 시각이다 — 좌표가 같아도 새 측정이면 흐르고(«아직 여기 있다»),
     * 캐시된 같은 측정(같은 측정 시각)이 다시 오면 한 번만 흐른다(F09 가 안 되살아남).
     */
    async function stand20s(repeatCached: boolean) {
        const { useLocationStore } = await import('../stores/useLocationStore');
        const { useGpsTelemetry } = await import('./useGpsTelemetry');
        const { useMasterGps } = await import('./useMasterGps');
        const { useDriveMotion } = await import('../components/dashboard/VehicleStatusPanel');
        let mode: 'drive' | 'idle' = 'drive';
        function Probe() { useGpsTelemetry(true); useMasterGps(false, null); mode = useDriveMotion(); return null; }
        act(() => root.render(<Probe />));
        let screen = 0; const on = () => { screen++; };
        window.addEventListener('local-gps-update', on);
        const setFix = (fixAt: number) => (useLocationStore.getState().setLocation as (a: number, b: number, c: number, d?: number) => void)(37.3, 127.3, 5, fixAt);
        const t0 = Date.now();
        for (let s = 0; s < 20; s++) {
            act(() => setFix(t0 + s * 1000));
            if (repeatCached) { act(() => { vi.advanceTimersByTime(2); }); act(() => setFix(t0 + s * 1000)); }   // 같은 측정이 캐시로 한 번 더
            act(() => { vi.advanceTimersByTime(repeatCached ? 998 : 1000); });
        }
        window.removeEventListener('local-gps-update', on);
        const sent = emit.mock.calls.filter(c => c[0] === 'dashboard-gps-update').length;
        return { screen, sent, mode };
    }

    it('🔴 정차 20초 · 같은 좌표 · 새 측정 매초 — 화면은 측정마다 · 서버는 6초마다 «아직 여기» · «서 있음»', async () => {
        const r = await stand20s(false);
        expect(r.screen).toBe(20);                     // 같은 좌표라도 새 측정이면 흐른다
        expect(r.sent).toBeGreaterThanOrEqual(3);      // 서버는 gpsBridge 6초 규칙으로 «아직 여기 있다»
        expect(r.sent).toBeLessThanOrEqual(5);
        expect(r.mode).toBe('idle');
    });

    it('🔴 캐시된 같은 측정이 2ms 뒤 한 번 더 와도 한 번만 흐른다', async () => {
        const r = await stand20s(true);
        expect(r.screen).toBe(20);
    });
});

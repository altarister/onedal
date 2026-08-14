import { readFileSync } from "fs";
import { join } from "path";

const CLIENT = join(__dirname, "../../../client-app/src");
const read = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const gps = codeOnly(read("hooks/useMasterGps.ts"));

/**
 * 🔴 **실 GPS 와 시뮬레이터는 같은 통로를 쓴다** (2026-08-14 기사님 확정)
 *
 * 기사님: *"출발을 눌렀을 때 GPS 가 활성화된 상태이면 앱의 GPS 로 작동하고, 그렇지 않으면
 * 시뮬레이터가 작동하도록. 둘 다 일관적으로 같은 품질의 코드를 적용 가능해 보인다."*
 *
 * 고르는 것은 **좌표의 출처뿐**이다. 그 뒤(`dashboard-gps-update` → 서버의 지나온 구간
 * 제거)는 완전히 같은 길이다. 검사용 우회로를 따로 만들면 *"시뮬레이터로는 되는데
 * 실제로는 안 되는"* 상태가 생기고, 그건 검사가 아니라 착각이다.
 */
describe('마스터 GPS — 실 GPS 와 시뮬레이터가 같은 길을 간다', () => {

    it('🔴 훅이 직접 emit 하지 않는다 — 브리지(publishLocation)가 유일한 송신 자리다', () => {
        // 2026-08-14 `pnpm map` 이 찾았다: 두 훅이 각각 쏘고 있었고 서로를 몰랐다
        expect(gps).not.toMatch(/socket\.emit/);
        expect(gps).toMatch(/publishLocation\(/);
    });

    it('🔴 실 GPS 가 언제나 이긴다 — 시뮬레이터는 빈자리만 메운다', () => {
        expect(gps).toMatch(/&& !realIsLive/);
    });

    /**
     * 🔴 **시뮬레이터는 개발 빌드에만 존재한다** (2026-08-14 기사님 지적)
     *
     * 기사님: *"나중에 실 폰에서 앱으로 진짜 GPS 가 실행될 때는 다른 것에 영향을 주면 안 된다."*
     *
     * 처음엔 *"실 GPS 가 15초 안 오면 시뮬레이터가 이어 달린다"* 였다. 테스트는 편했지만
     * **실 운행을 안 본 설계**였다 — 터널·지하주차장·건물 안에서 GPS 가 끊기면 15초 뒤
     * 시뮬레이터가 켜져 **가짜 좌표를 서버로 보낸다.** 서버는 그걸 진짜로 믿는다.
     */
    it('🔴 시뮬레이터 가동 조건에 개발 빌드 여부가 걸려 있다  (실 폰에서는 켜질 수 없다)', () => {
        expect(gps).toMatch(/const SIMULATOR_AVAILABLE = import\.meta\.env\.DEV/);
        expect(gps).toMatch(/const useMock = SIMULATOR_AVAILABLE/);
    });

    it('강제 스위치(isTestMode)는 없앴다 — 🚀 출발 하나로 끝난다', () => {
        expect(gps).not.toMatch(/isTestMode/);
    });

    it('🔴 시뮬레이션이 끝나면 가상 위치를 걷어낸다', () => {
        // 안 그러면 서버가 그 자리를 "지금 내 위치" 로 믿고 다음 콜의 경로를 엉뚱하게 그린다
        expect(gps).toMatch(/onFinished: \(\) => \{ endMockDriving\(\)/);
    });

    it('실 GPS 감시는 테스트 중에도 멈추지 않는다 (살아나면 즉시 넘겨받아야 하니까)', () => {
        const watch = gps.slice(gps.indexOf('watchPosition') - 400, gps.indexOf('watchPosition') + 200);
        expect(watch).not.toMatch(/if \(isTestMode\) return/);
        expect(gps).toMatch(/if \(!isDriving \|\| !\("geolocation" in navigator\)\) return/);
    });

    it('🔴 신호가 오락가락할 때 갈아타지 않는다 (떨림 방지 — 유예 시간이 있다)', () => {
        expect(gps).toMatch(/REAL_GPS_STALE_MS/);
        const v = gps.match(/const REAL_GPS_STALE_MS = ([\d_]+)/);
        expect(v).not.toBeNull();
        expect(Number(v![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(5000);
    });

    it('출발하기 전에는 시뮬레이터가 안 돈다', () => {
        expect(gps).toMatch(/const useMock = SIMULATOR_AVAILABLE\s*\n\s*&& isDriving/);
    });

    it('좌표를 내보내는 자리는 실 GPS 한 곳 · 시뮬레이터 한 곳', () => {
        expect((gps.match(/publishLocation\(/g) || []).length).toBe(2);
        expect(gps).toMatch(/const pushReal =/);
    });
});

/**
 * 🔴 **시뮬레이터는 멈췄다 켜지면 이어 달린다** (2026-08-14 기사님 신고)
 *
 * 기사님: *"웹상에서 gps 시뮬레이터가 계속 반복해서 이동한다."*
 *
 * 원인은 `if (!intervalRef.current) indexRef.current = 0;` 한 줄이었다.
 * 이 훅은 실 GPS 가 들어오면 잠시 멈추고 끊기면 다시 켜지는데, 그때마다 인덱스가 0 으로
 * 돌아가 **여태 달린 게 없던 일이 됐다.** 도착한 뒤에도 다시 출발해 무한 반복이 됐다.
 */
describe('GPS 시뮬레이터 — 반복하지 않는다', () => {

    const sim = codeOnly(read('hooks/useMockGpsSimulator.ts'));

    it('🔴 다시 켜질 때 인덱스를 0 으로 되돌리지 않는다 (이어 달린다)', () => {
        const eff = sim.slice(sim.indexOf('if (!isActive)'));
        expect(eff).not.toMatch(/if \(!intervalRef\.current\)\s*\{?\s*indexRef\.current = 0/);
    });

    it('🔴 끝까지 달렸으면 다시 출발하지 않는다', () => {
        expect(sim).toMatch(/finishedRef/);
        expect(sim).toMatch(/if \(finishedRef\.current\) return/);
        expect(sim).toMatch(/finishedRef\.current = true/);
    });

    it('경로가 바뀌면(= 다른 콜) 처음부터 · 그때 완료 표시도 푼다', () => {
        const onRoute = sim.slice(sim.indexOf('routeRef.current?.length !== routePolyline?.length'));
        const body = onRoute.slice(0, 220);
        expect(body).toMatch(/indexRef\.current = 0/);
        expect(body).toMatch(/finishedRef\.current = false/);
    });
});

/**
 * 🔴 **서버에 위치를 알리는 곳은 하나다** (2026-08-14 `pnpm map` 이 찾았다)
 *
 * 두 훅이 각각 `dashboard-gps-update` 를 쏘고 있었다 — `useGpsTelemetry`(App 에서 항상)와
 * `useMasterGps`(운행 중). 둘 다 같은 `useLocationStore` 를 읽으니 네이티브 위치가
 * 갱신되면 **같은 좌표가 두 번** 나갔고, **서로의 존재를 몰랐다.**
 *
 * 더 나쁜 것은 시뮬레이터가 달리는 동안 실제 좌표가 섞이는 것이다 — 서버의 위치가
 * 파주(가상)와 집(실제) 사이를 오가면 **진행도가 튀고 지나온 구간 제거가 되돌아간다.**
 */
describe('GPS 브리지 — 송신은 한 곳', () => {

    const bridge = codeOnly(read('lib/gpsBridge.ts'));
    const telemetry = codeOnly(read('hooks/useGpsTelemetry.ts'));

    it('🔴 dashboard-gps-update 를 쏘는 파일이 브리지 하나뿐이다', () => {
        const CLIENT_SRC = join(__dirname, '../../../client-app/src');
        const walk = (dir: string, out: string[] = []): string[] => {
            for (const e of require('fs').readdirSync(dir)) {
                const p = join(dir, e);
                if (require('fs').statSync(p).isDirectory()) walk(p, out);
                else if (/\.tsx?$/.test(e)) out.push(p);
            }
            return out;
        };
        const senders = walk(CLIENT_SRC)
            .filter(f => /socket\.emit\(\s*['"`]dashboard-gps-update/.test(readFileSync(f, 'utf8')))
            .map(f => f.split('/').pop());
        expect(senders).toEqual(['gpsBridge.ts']);
    });

    it('🔴 시뮬레이터가 도는 동안 실제 좌표를 서버로 보내지 않는다', () => {
        expect(bridge).toMatch(/lastMockAt/);
        expect(bridge).toMatch(/reason: 'mock-running'/);
    });

    it('좌표에 **출처**를 싣는다 — 받는 쪽이 알아야 거짓말을 안 한다', () => {
        expect(bridge).toMatch(/socket\.emit\('dashboard-gps-update', \{ lat, lng, source/);
        expect(bridge).toMatch(/type GpsSource = 'native' \| 'browser' \| 'mock'/);
    });

    it('같은 자리를 다시 보내지 않는다', () => {
        expect(bridge).toMatch(/same-position/);
    });

    it('두 훅 모두 브리지를 통해서만 보낸다', () => {
        expect(telemetry).not.toMatch(/socket\.emit/);
        expect(telemetry).toMatch(/publishLocation\(lat, lng, 'native'/);
    });
});

/**
 * 🔴 **없는 숫자를 지어내지 않는다** (규칙 ④)
 *
 * 화면에 `11669 km/h` 가 떴다. 시뮬레이터는 1초에 경로를 1~2km 씩 **점프**하는데
 * 속도를 `거리 ÷ 시간` 으로 재니 그 숫자가 나왔다. 상한을 씌우는 건 땜빵이다 —
 * 좌표에 출처가 실려 오므로 시뮬레이션이면 **속도 대신 그 사실을 말한다.**
 */
describe('속도 표시 — 시뮬레이터 점프를 실제 속도로 말하지 않는다', () => {

    const panel = codeOnly(read('components/dashboard/VehicleStatusPanel.tsx'));

    it('🔴 시뮬레이션이면 속도를 재지 않는다', () => {
        expect(panel).toMatch(/loc\.source === 'mock'/);
        expect(panel).toMatch(/if \(isMock\)/);
    });

    it('🔴 시뮬레이션이면 km/h 를 띄우지 않는다', () => {
        expect(panel).toMatch(/isMoving && !gpsIsMock/);
        expect(panel).toMatch(/시뮬레이션 주행/);
    });
});

/**
 * 🔴 **시뮬레이션이 만든 가상 위치는 시뮬레이션이 끝나면 참이 아니다** (규칙 ④)
 *
 * 2026-08-14: 시뮬레이터가 파주에서 멈춘 뒤 그 좌표가 서버에 남았다. 그 상태로 광주에서
 * 콜을 잡으니 `파주(가짜 현위치) → 광주(상차) → 파주(하차)` 로 경로가 그려졌다 —
 * 75.7km 짜리 콜의 총거리가 **156.2km**. 화면은 브라우저 좌표(광주)를 보고 있었으니
 * **서버와 화면이 서로 다른 곳을 알고 있었다.**
 */
describe('가상 위치는 남지 않는다', () => {

    const bridge = codeOnly(read('lib/gpsBridge.ts'));
    const sim = codeOnly(read('hooks/useMockGpsSimulator.ts'));

    it('마지막 **실제** 좌표를 기억한다', () => {
        expect(bridge).toMatch(/let lastReal/);
    });

    it('🔴 시뮬레이션이 끝나면 그 실제 좌표로 되돌린다', () => {
        const fn = bridge.slice(bridge.indexOf('export function endMockDriving'));
        expect(fn).toMatch(/lastMockAt = 0/);
        expect(fn).toMatch(/publishLocation\(lastReal\.lat, lastReal\.lng/);
    });

    it('🔴 실제 좌표를 한 번도 못 받았으면 아무것도 하지 않는다 (가짜로 채우지 않는다)', () => {
        const fn = bridge.slice(bridge.indexOf('export function endMockDriving'));
        expect(fn).toMatch(/if \(!lastReal\) return/);
    });

    it('시뮬레이터가 경로 끝에 닿으면 알린다', () => {
        expect(sim).toMatch(/onFinished\?\.\(\)/);
    });
});

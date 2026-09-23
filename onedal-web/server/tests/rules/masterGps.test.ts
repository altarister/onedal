import { readFileSync } from "fs";
import { join } from "path";

import { nearestIndex } from "../../../client-app/src/hooks/useMockGpsSimulator";

const CLIENT = join(__dirname, "../../../client-app/src");
const read = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const gps = codeOnly(read("hooks/useMasterGps.ts"));

/**
 * 🔴 **실 GPS 와 시뮬레이터는 같은 통로를 쓴다** (기사님 확정)
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
        // 두 훅이 각각 쏘면 같은 좌표가 두 번 나가고, 서로를 모른다
        expect(gps).not.toMatch(/socket\.emit/);
        expect(gps).toMatch(/publishLocation\(/);
    });

    it('🔴 실 GPS 가 언제나 이긴다 — 시뮬레이터는 빈자리만 메운다', () => {
        expect(gps).toMatch(/realLive: realIsLive/);   // 🅿️ 판단은 `mockLine.mockDriveOn` 에 있다 — «실 GPS 가 살아 있으면 안 낸다»는 vitest 가 문다
    });

    /**
     * 🔴 **시뮬레이터는 개발 빌드에만 존재한다** (기사님 지적)
     *
     * 기사님: *"나중에 실 폰에서 앱으로 진짜 GPS 가 실행될 때는 다른 것에 영향을 주면 안 된다."*
     *
     * *"실 GPS 가 15초 안 오면 시뮬레이터가 이어 달린다"* 같은 설계는 테스트는 편해도
     * **실 운행을 안 본 것**이다 — 터널·지하주차장·건물 안에서 GPS 가 끊기면 15초 뒤
     * 시뮬레이터가 켜져 **가짜 좌표를 서버로 보낸다.** 서버는 그걸 진짜로 믿는다.
     */
    it('🔴 시뮬레이터 가동 조건에 개발 빌드 여부가 걸려 있다  (실 폰에서는 켜질 수 없다)', () => {
        expect(gps).toMatch(/const SIMULATOR_AVAILABLE = import\.meta\.env\.DEV/);
        /**
         * 조건은 «켤 수 있나»(`canMock`)와 «켰나»(`running`) 둘이다.
         *    기사님: *"경로가 생기면 현황판도 알게 될 거고 그때 **버튼을 활성화해서 클릭**하도록"*.
         *    개발 빌드 게이트는 `canMock` 안에 있다 — 실 폰에서는 켜질 수 없다.
         *    ⚠️ `isDriving` 은 조건에 넣지 않는다 — 넣으면 상차지까지 가는 구간이 순환으로 막힌다.
         */
        expect(gps).toMatch(/const canMock = SIMULATOR_AVAILABLE/);
    });

    it('강제 스위치(isTestMode)는 없앴다 — 🚀 출발 하나로 끝난다', () => {
        expect(gps).not.toMatch(/isTestMode/);
    });

    it('🔴 시뮬레이션을 멈추면(기사님 · 실 GPS) 마지막 실제 좌표로 되돌린다', () => {
        // 경로 끝은 «끝»이 아니라 대기다 (#133). 끝은 모의 주행을 안 쓰게 된 순간(`useMock` 이 꺼짐)이다
        expect(gps).toMatch(/if \(useMock\) \{ usedMockRef\.current = true; return; \}/);
        expect(gps).toMatch(/usedMockRef\.current = false;\s*endMockDriving\(\);/);
    });

    it('실 GPS 감시는 테스트 중에도 멈추지 않는다 (살아나면 즉시 넘겨받아야 하니까)', () => {
        const watch = gps.slice(gps.indexOf('watchPosition') - 400, gps.indexOf('watchPosition') + 200);
        expect(watch).not.toMatch(/if \(isTestMode\) return/);
        expect(gps).toMatch(/if \(!isDriving \|\| !\("geolocation" in navigator\)\) return/);
    });

    it('🔴 신호가 오락가락할 때 갈아타지 않는다 (떨림 방지 — 유예 시간이 있다)', () => {
        /* 끊김 기준은 주행/정차 판정과 한 벌(`driveMotion.GPS_STALE_MS`) (#132) */
        expect(gps).toMatch(/GPS_STALE_MS/);
        const v = codeOnly(read('components/dashboard/driveMotion.ts')).match(/export const GPS_STALE_MS = ([\d_]+)/);
        expect(v).not.toBeNull();
        expect(Number(v![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(5000);
    });

    /**
     * 🔴 **모의 주행을 막는 조건은 «출발 전»이 아니라 «경로가 없으면»이다.**
     *
     * `dispatchPhase === 'DELIVERING'`(출발함)을 조건으로 두면 **순환**이 된다:
     * DELIVERING 이 되려면 상차를 마쳐야 하고, 상차를 하려면 상차지까지 가야 하고,
     * **가는 것이 모의 주행**이다. 기사님: *"출발을 해야 상차를 하지"*.
     *
     * 지키려는 뜻(«빈 차인데 가짜가 달리면 안 된다»)은 경로가 지킨다 — 빈 차면 잡은 콜이 없어
     * **경로가 없고**, 경로가 없으면 안 돈다.
     */
    /* 🅿️ 달리던 모의 주행은 선이 사라져도 그 자리에서 대기하며 낸다 (`mockLine.mockDriveOn` · 판단은 vitest 가 문다).
       «한 번도 안 달렸고 선도 없으면 안 켜진다» — 켤 수 있나(`canMock`)는 선이 있어야 참이다. */
    it('경로가 없으면 켤 수 없다 · 달리던 자리가 있으면 대기한다 (빈 차에는 경로가 없다)', () => {
        expect(gps).toMatch(/const canMock = SIMULATOR_AVAILABLE && !!activePolyline\?\.length/);
        expect(gps).toMatch(/const useMock = mockDriveOn\(\{ simulator: SIMULATOR_AVAILABLE, running: mockRunning, realLive: realIsLive, hasLine: canMock, parked \}\)/);
    });

    it('좌표를 내보내는 자리는 실 GPS 한 곳 · 시뮬레이터 한 곳', () => {
        expect((gps.match(/publishLocation\(/g) || []).length).toBe(2);
        expect(gps).toMatch(/const pushReal =/);
    });
});

/**
 * 🔴 **시뮬레이터는 멈췄다 켜지면 이어 달린다** (기사님 신고)
 *
 * 기사님: *"웹상에서 gps 시뮬레이터가 계속 반복해서 이동한다."*
 *
 * 이 훅은 실 GPS 가 들어오면 잠시 멈추고 끊기면 다시 켜진다. 그때마다 인덱스를 0 으로 돌리면
 * (`if (!intervalRef.current) indexRef.current = 0;`) **여태 달린 게 없던 일이 되고**,
 * 도착한 뒤에도 다시 출발해 무한 반복이 된다.
 */
describe('GPS 시뮬레이터 — 반복하지 않는다', () => {

    const sim = codeOnly(read('hooks/useMockGpsSimulator.ts'));

    it('🔴 다시 켜질 때 인덱스를 0 으로 되돌리지 않는다 (이어 달린다)', () => {
        const eff = sim.slice(sim.indexOf('if (!isActive)'));
        expect(eff).not.toMatch(/if \(!intervalRef\.current\)\s*\{?\s*indexRef\.current = 0/);
    });

    it('🔴 끝까지 달렸으면 처음부터 다시 출발하지 않는다 — 🔄 그 자리에서 대기한다 (#133 개정)', () => {
        const i = sim.indexOf('if (r.finished)');
        expect(i).toBeGreaterThan(-1);
        const block = sim.slice(i, sim.indexOf('\n            }\n', i));
        expect(block).toMatch(/stopped: true/);
        expect(block).not.toMatch(/indexRef\.current = 0|simRef\.current\.idx = 0/);
    });

    /**
     * ⚠️ 경로가 바뀌면 지킬 것은 **대기(완료 표시)를 푸는 것**이다 (안 풀면 새 경로를 아예 안 달린다).
     *    출발 자리는 처음(0)이 아니라 **가장 가까운 지점**이다 — 0 으로 돌리면 합짐 하나를 내리자
     *    파주 근처에 있던 차가 **광주 원점으로 순간이동**하고, 그 좌표가 서버로 올라가 위치가 통째로 틀어진다.
     */
    it('경로가 바뀌면 대기를 푼다 · 다만 처음부터가 아니라 가까운 자리에서', () => {
        /**
         * 🔴 **경로가 바뀌었는지는 지문(`routeSignature()` — 모든 점 해시)으로 견준다** (현황판 실측).
         *    양끝·점 수만 보면 같은 수의 다른 경로를 «같은 경로»로 보고 앞 경로의 인덱스를 그대로 써 **한 틱에 10.9km** 뛴다.
         *    불변식 — 대기를 풀고, 가까운 자리에서 잇는다.
         */
        /* 🧬 **지문 함수 이름이 바뀌면 여기 이름도 바뀐다.** **무엇을 보는지**는 `routeSignature.test.ts` 가 문다 */
        const onRoute = sim.slice(sim.indexOf('routeSignature(routeRef.current) !== routeSignature(routePolyline)'));
        const body = onRoute.slice(0, 420);
        /* «대기»를 푼다 (#133) */
        expect(body).toMatch(/waitingRef\.current = false/);
        expect(body).toMatch(/nearestIndex\(/);
        expect(body).not.toMatch(/indexRef\.current = 0/);
    });
});

/**
 * 🔴 **서버에 위치를 알리는 곳은 하나다** — 브리지(`gpsBridge`)
 *
 * 두 훅 — `useGpsTelemetry`(App 에서 항상)와 `useMasterGps`(운행 중) — 이 각각 `dashboard-gps-update` 를
 * 쏘면, 둘 다 같은 `useLocationStore` 를 읽으니 네이티브 위치가 갱신될 때 **같은 좌표가 두 번**
 * 나가고 **서로의 존재를 모른다.**
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
        /* ⚠️ 배속 같은 칸이 함께 실리므로 줄 전체가 아니라 «출처를 싣는가»만 문다 */
        expect(bridge).toMatch(/socket\.emit\('dashboard-gps-update'/);
        const i = bridge.indexOf("socket.emit('dashboard-gps-update'");
        expect(bridge.slice(i, i + 240)).toMatch(/lat, lng, source/);
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
 * 좌표가 한 번에 1~2km 씩 **튀면** 속도를 `거리 ÷ 시간` 으로 잴 때 `11669 km/h` 같은 숫자가 나온다.
 * 그 튐은 상한(250km/h)으로 막고, 모의와 실제는 **같은 잣대**로 잰다 — 출처(`mock`)는 «시뮬» 표시에만 쓴다.
 */
describe('속도 표시 — 시뮬레이터 점프를 실제 속도로 말하지 않는다', () => {

    const panel = codeOnly(read('components/dashboard/VehicleStatusPanel.tsx'));

    /**
     * 🔴 **모의도 속도를 잰다** (기사님 확정). 시뮬은 **연기를 한다**(감속·18초 정차·재출발)
     *    — «시뮬이면 속도를 재지 않는다» 같은 특례를 두면 그 정차가 통째로 묻히고 무대 자막(«정차 중») 옆에서 배지가
     *    «시뮬 주행»이라고 반대말을 한다. 출처가 아니라 **속도**가 답한다.
     *    (튐 방어는 특례가 아니라 상한 250km/h 로 한다)
     */
    it('🔴 모의도 실제와 같은 잣대로 잰다 — 출처 특례가 없다', () => {
        expect(panel).toMatch(/loc\.source === 'mock'/);      // 출처는 «시뮬» 표시에만 쓴다
        expect(panel).not.toMatch(/if \(isMock\)\s*\{/);
        expect(panel).not.toMatch(/isMoving && !gpsIsMock/);
        /* 속도 계산은 순수 함수 한 곳(`driveMotion`)에 있다 (#132) */
        expect(codeOnly(read('components/dashboard/driveMotion.ts'))).toMatch(/Math\.min\(250,/);            // 튐은 상한으로 막는다
    });
});

/**
 * 🔴 **시뮬레이션이 만든 가상 위치는 시뮬레이션이 끝나면 참이 아니다** (규칙 ④)
 *
 * 시뮬레이터가 파주에서 멈춘 뒤 그 좌표가 남으면, 광주에서 콜을 잡을 때
 * `파주(가짜 현위치) → 광주(상차) → 파주(하차)` 로 경로가 그려진다 —
 * 75.7km 짜리 콜의 총거리가 **156.2km** 가 된다. 화면은 브라우저 좌표(광주)를 보고 있으니
 * **서버와 화면이 서로 다른 곳을 안다.** 그래서 끝나면 마지막 실제 좌표로 되돌린다.
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

    it('🔴 실제 좌표가 없으면 **아무 일도 하지 않는다** — 가짜로 채우지도, 되돌리지도 않는다', () => {
        /**
         * 🔴 **실제 좌표가 없으면 서버에 알리지도, 화면을 되돌리지도 않는다** (기사님 지시).
         *
         * 서버는 가상 좌표를 지우지 않는다 — `originOf` 가 물을 때마다 고르고,
         *    **콜을 쥔 동안에는 그 자리를 그대로 기점으로 쓴다.** 그러니 화면도 그대로
         *    두는 것이 «같은 말»이다 (규칙 ③). 되돌리면 두 곳이 갈라진다.
         */
        const fn = bridge.slice(bridge.indexOf('export function endMockDriving'));
        const noReal = fn.slice(fn.indexOf('if (!lastReal)'), fn.indexOf('lastSent = null'));
        expect(noReal).toMatch(/return/);
        expect(noReal).not.toMatch(/publishLocation\(/);
        /* 🔴 `mock-driving-ended` 를 쏘면 서버·화면이 갈라진다 */
        expect(noReal).not.toMatch(/mock-driving-ended/);
    });

    it('🔄 시뮬레이터는 경로 끝에서 끝내지 않고 대기한다 (#133 개정 · `mockHomeLeg.test.ts`)', () => {
        expect(sim).not.toMatch(/onFinished\?\.\(\)/);
    });
});

/**
 * 🔴 **경로가 갈려도 출발점으로 순간이동하지 않는다**
 *
 * 콜이 둘일 때 합짐 하나를 내리면 경로가 다시 그려진다. 그때 **0 번째부터** 달리면
 * 파주 근처에 있던 차가 광주 원점으로 순간이동한다 (서버 쪽 원인 — 다녀온 상차지를 다시 경유 — 과 별개다).
 * 보기에만 이상한 게 아니다 — 이 좌표는 `gpsBridge` 로 서버에 올라가고,
 * 서버는 그걸 "지금 내 위치"로 믿는다. **지나온 구간 제거·도착 감지가 통째로 틀어진다.**
 */
describe('시뮬레이터 — 경로가 갈리면 가장 가까운 자리에서 이어 달린다', () => {

    const src = codeOnly(readFileSync(join(CLIENT, 'hooks/useMockGpsSimulator.ts'), 'utf8'));

    it('🔴 경로가 달라져도 0 으로 되돌리지 않는다', () => {
        /* 경로가 바뀌었는지는 지문(`routeSignature` — 모든 점 해시)으로 견준다 (점 수가 같아도 다른 경로다) */
        const eff = src.slice(src.indexOf('routeSignature(routeRef.current) !== routeSignature(routePolyline)'));
        const body = eff.slice(0, eff.indexOf('}, [routePolyline])'));
        expect(body).toMatch(/indexRef\.current = nearestIndex\(/);
        expect(body).not.toMatch(/indexRef\.current = 0/);
    });

    it('🔴 달린 자리를 기억한다 — 없으면 이어붙일 기준이 없다', () => {
        // 연기 각본(simStep) 걸음의 결과(r.loc)를 기억한다
        expect(src).toMatch(/hereRef\.current = \{ x: r\.loc\.x, y: r\.loc\.y \}/);
    });

    it('nearestIndex — 가장 가까운 지점을 고른다', () => {
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
        expect(nearestIndex(path, { x: 2.1, y: 0.05 })).toBe(2);
        expect(nearestIndex(path, { x: 0, y: 0 })).toBe(0);
        expect(nearestIndex(path, { x: 99, y: 99 })).toBe(3);   // 다 멀면 끝점
    });

    it('자리를 모르면 0 — 지어낼 값이 없다', () => {
        const path = [{ x: 5, y: 5 }, { x: 6, y: 6 }];
        expect(nearestIndex(path, null)).toBe(0);
        expect(nearestIndex(null, { x: 1, y: 1 })).toBe(0);
        expect(nearestIndex([], { x: 1, y: 1 })).toBe(0);
    });
});

/**
 * 📍 **서버가 아는 자리를 화면도 본다 — 한 화면이 두 자리를 말하지 않게**
 *
 * 기사님 실측 (2026-09-23): 현황판에서 현위치를 **대전 복합터미널**로 바꾸셨더니
 * **동 점만 대전으로 옮겨가고, 현위치 표시와 상차·하차 영역은 옛 자리**에 남았다.
 * 기사님: *"서버랑 웹이랑 폰이 싱크가 맞아야 해 그치? … 이건 뭔가 레이어 그리는
 * 시점에 맞고 틀린것이 있는것이 분명한거 같아."*
 *
 * 까닭은 서버가 보낸 좌표를 **`source === 'gps'` 일 때만** 받고 있었기 때문이다.
 * 손으로 정한 자리는 `manual` 이라 버려졌다 — 서버는 그 자리로 목록을 다시 만드는데
 * 지도만 못 들었다.
 */
describe('📍 손으로 정한 자리도 화면이 받는다', () => {

    it('🔴 실기기 GPS 와 손으로 정한 자리를 둘 다 채택한다', () => {
        expect(gps).toMatch(/p\.source === 'gps' \|\| p\.source === 'manual'/);
    });

    it('🔴 모의 좌표는 이 길로 안 받는다 — 화면이 제 시뮬레이터로 달린다', () => {
        /* 서버 에코까지 받으면 한 걸음 뒤처진 좌표가 내 점을 뒤로 당긴다
           (driverPositionStore 의 «묵은 좌표가 내 점을 뒤로 당겨 모의 주행이 멈춘다») */
        const i = gps.indexOf("p.source === 'gps'");
        expect(i).toBeGreaterThan(-1);
        expect(gps.slice(i, i + 200)).not.toMatch(/'mock'/);
    });

    it('🔴 받은 좌표를 서버로 되쏘지 않는다 — 서버가 이미 아는 자리다', () => {
        const i = gps.indexOf("p.source === 'gps'");
        expect(gps.slice(i, i + 300)).not.toMatch(/publishLocation\(/);
    });
});

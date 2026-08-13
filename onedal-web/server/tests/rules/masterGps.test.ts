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

    it('🔴 좌표를 보내는 이벤트가 하나다 (출처가 달라도 서버는 구분하지 않는다)', () => {
        const emits = gps.match(/socket\.emit\("([^"]+)"/g) || [];
        expect(emits.length).toBeGreaterThan(0);
        expect(new Set(emits)).toEqual(new Set(['socket.emit("dashboard-gps-update"']));
    });

    it('🔴 실 GPS 가 언제나 이긴다 — 시뮬레이터는 빈자리만 메운다', () => {
        expect(gps).toMatch(/isTestMode \|\| !realIsLive/);
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

    it('출발하기 전에는 아무것도 안 보낸다 (사냥 전 위치는 서버가 쓸 데가 없다)', () => {
        expect(gps).toMatch(/const useMock = isDriving/);
    });

    it('좌표를 내보내는 자리는 실 GPS 한 곳 · 시뮬레이터 한 곳 (두 번 쏘면 서버가 두 번 계산한다)', () => {
        expect((gps.match(/socket\.emit\("dashboard-gps-update"/g) || []).length).toBe(2);
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

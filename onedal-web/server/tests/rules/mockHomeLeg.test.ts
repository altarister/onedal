import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🅿️ **모의 주행은 경로 끝에서 끝나지 않고 그 자리에서 대기한다** (버그 대장 #133 개정 · 기사님 지시 2026-09-15).
 *
 * 기사님: *"경로가 마지막 하차지에서 끝나서 콜을 못 잡으면 그냥 그 자리에서 대기하는 거지.
 * 복귀를 내가 누르지도 않았는데 목적지를 바꾸는 건 위반이지."* — 처음 #133 은 «집으로 떠나는 구간»을 이어 달렸다(cfc52cdf) → 걷었다.
 * 실 GPS 처럼 **좌표를 계속 보내며 서 있다가**, 새 콜로 경로가 생기면 **그 자리에서** 다시 달린다.
 * 대기 중에도 속도 0 이 재어져 «주행»이 박히지 않는다 (#132 와 같은 자리). 하차 완료는 기사님이 누르거나 다음 콜로 떠나면 찍힌다.
 * 🔴 시험 도구다 — 개발 빌드(`SIMULATOR_AVAILABLE`)에서만 돈다.
 */
const CLIENT = join(__dirname, "../../../client-app/src");
const read = (p: string) => readFileSync(join(CLIENT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('모의 주행 경로 끝 대기 배선', () => {
    const sim = read('hooks/useMockGpsSimulator.ts');
    const gps = read('hooks/useMasterGps.ts');
    const i = sim.indexOf('if (r.finished)');
    const block = sim.slice(i, sim.indexOf('\n            }\n', i));

    it('🔴 경로 끝에서 끝내지 않는다 — 끝남 신호를 안 보내고 걸음을 안 멈춘다', () => {
        expect(i).toBeGreaterThan(-1);
        expect(block).not.toMatch(/onFinished/);
        expect(block).not.toMatch(/clearInterval/);
        expect(sim).not.toMatch(/onFinished/);
    });

    it('🔴 그 자리 좌표를 «서 있다»로 계속 보낸다 — 좌표가 끊기지 않는다', () => {
        expect(block).toMatch(/setMockLocation\(\{ x: hereRef\.current\.x, y: hereRef\.current\.y, stopped: true \}\)/);
    });

    it('🔴 복귀를 안 눌렀는데 집으로 가지 않는다 — 방향은 기사님이 정한다', () => {
        expect(sim).not.toMatch(/homeLeg/);
        expect(gps).not.toMatch(/homeLeg|fetchHomeLeg/);
    });

    it('🔴 끄는 것은 기사님뿐 — 경로 끝이 모의 주행을 끄지 않는다', () => {
        expect(gps).not.toMatch(/useMockDriveStore\.getState\(\)\.stop\(\)/);
    });
});

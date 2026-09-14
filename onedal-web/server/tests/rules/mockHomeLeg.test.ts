import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🏠 **모의 주행은 마지막 하차 뒤 집으로 떠난다** (버그 대장 #133 · 판단 검사는 `client-app/src/hooks/homeLeg.test.ts`).
 *
 * 경로 끝(마지막 하차지)에서 멈추면 서버의 하차 완료(지나침 이탈 · 떠남)가 영영 안 찍힌다.
 * 🔴 시험 도구다 — 개발 빌드(`SIMULATOR_AVAILABLE`)에서만 돈다. 실 GPS 가 살아 있으면 진짜가 이긴다(`useMock`).
 */
const CLIENT = join(__dirname, "../../../client-app/src");
const read = (p: string) => readFileSync(join(CLIENT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('모의 주행 집으로 떠나기 배선', () => {
    const sim = read('hooks/useMockGpsSimulator.ts');
    const gps = read('hooks/useMasterGps.ts');

    it('🔴 경로 끝에서 바로 끝내지 않고 «집으로 떠날까»를 먼저 묻는다', () => {
        const i = sim.indexOf('if (r.finished)');
        expect(i).toBeGreaterThan(-1);
        expect(sim.slice(i, i + 500)).toMatch(/homeLegNeeded\(/);
    });

    it('🔴 집으로 가는 길은 도로 경로로 받는다 — 직선을 지어내지 않는다', () => {
        expect(read('hooks/homeLegRoute.ts')).toMatch(/\/sim\/route/);
        expect(gps).toMatch(/route: fetchHomeLeg/);
    });

    it('🔴 모의 주행 훅은 서버 주소를 끌어오지 않는다 — 서버 jest 가 이 훅을 import 한다 (masterGps.test)', () => {
        expect(sim).not.toMatch(/serverTarget|import\.meta/);
        expect(read('hooks/homeLeg.ts')).not.toMatch(/serverTarget|import\.meta/);
    });

    it('집 좌표는 관제웹이 이미 받은 «내 주소»를 넘긴다 — 두 번 묻지 않는다', () => {
        expect(gps).toMatch(/home: homeLocation/);
        expect(read('hooks/useRouteDerivations.ts')).toMatch(/useMasterGps\(isDriving, activePolyline \|\| null, mockStops, homeLocation\)/);
    });
});

import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🚗 **주행/정차 판정은 한 곳 — 좌표가 끊기면 모름** (판단 검사는 `client-app/src/components/dashboard/driveMotion.test.ts`).
 *
 * 무대 신호(`useDriveMotion`)와 지도 배지(`MovingBadge`)가 속도 계산을 **각자** 들고 있었다 — 한쪽만 고치면
 * «자막은 정차인데 배지는 이동 중»이 난다(0831 에 한 번 났다). «실 GPS 가 끊겼나»(`useMasterGps`)도 같은 질문이라 같은 기준을 쓴다.
 */
const CLIENT = join(__dirname, "../../../client-app/src");
const read = (p: string) => readFileSync(join(CLIENT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('주행/정차 판정 배선', () => {
    const panel = read('components/dashboard/VehicleStatusPanel.tsx');

    it('🔴 무대 신호와 지도 배지가 같은 순수 함수를 쓴다 — 속도 계산을 제 손으로 두지 않는다', () => {
        expect(panel).toMatch(/from ['"]\.\/driveMotion['"]/);
        expect(panel.match(/motionOnFix\(/g)?.length).toBeGreaterThanOrEqual(2);
        expect(panel.match(/motionOnTick\(/g)?.length).toBeGreaterThanOrEqual(2);
        expect(panel).not.toMatch(/getDistanceKm\(/);
    });

    it('🔴 «좌표가 끊겼나» 기준은 한 벌 — 실 GPS 끊김도 같은 값을 쓴다', () => {
        const gps = read('hooks/useMasterGps.ts');
        expect(gps).not.toMatch(/const REAL_GPS_STALE_MS = /);
        expect(gps).toMatch(/GPS_STALE_MS/);
    });
});

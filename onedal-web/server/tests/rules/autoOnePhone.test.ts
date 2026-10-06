import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔁 **같은 기사님의 자동 폰은 한 대만** (reviews/48 가 · 표 shared `modeTable.ts` 의 otherAuto 줄).
 * 두 폰이 서로 모른 채 같은 순간 함께 확정하는 일을 원리상 없앤다 — 다른 폰은 알람(소리 + 미리보기).
 * 자동을 누른 폰이 이기고 앞 자동 폰의 명령은 알람으로 옮겨 저장한다. 이미 둘이 자동 명령이면(옛 DB · 한 번도 안 고른 폰의 기본값) 보고 응답이 둘 다 알람으로 내려준다.
 * 못 잡는 것: 실제 두 폰이 같은 순간 콜에 들어가는 운행(실물 두 배차망 자동은 사업자 뒤) · 관제웹 단추가 옮겨진 모드를 다시 그리는 화면 ·
 *   옛 DB 에 둘 다 자동인 채 서버가 다시 뜬 경우(메모리가 비어 `getDeviceMode` 가 DB 를 읽는 길 — drive e2e 는 서버를 다시 띄우지 않아 못 만듦).
 */
const devices = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8');
const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');

describe('🔁 자동은 한 폰만', () => {
    it('🔴 자동을 누르면 같은 기사님의 다른 자동 폰을 알람으로 옮겨 저장한다', () => {
        expect(devices).toContain("if (mode === 'AUTO') demoteOtherAutoPhones(deviceId, userId);");
        expect(devices).toMatch(/function demoteOtherAutoPhones\(deviceId: string, userId: string\)[\s\S]*?saveModePreference\(other, userId, 'ALARM'\)/);
    });

    it('🔴 보고 응답은 다른 폰도 자동 명령이면 알람으로 내려준다(이미 둘인 경우의 안전망)', () => {
        expect(scrap).toContain('const otherAuto = !!deviceId && otherAutoPhoneOf(deviceId, userId);');
        expect(scrap).toContain('mode: modeForPhone(deviceMode, autoLive, webAttached, otherAuto)');
        expect(devices).toMatch(/function otherAutoPhoneOf[\s\S]*?getDeviceMode\(o\.device_id, userId\) === 'AUTO'/);   // 메모리 › DB › 기본값 한 길
    });
});

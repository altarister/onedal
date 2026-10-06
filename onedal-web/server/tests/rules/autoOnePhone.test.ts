import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔁 **같은 기사님의 자동 폰은 한 대만** (reviews/48 가 · 표 shared `modeTable.ts` 의 otherAuto 줄).
 * 두 폰이 서로 모른 채 같은 순간 함께 확정하는 일을 원리상 없앤다 — 다른 폰은 알람(소리 + 미리보기).
 * 셈하는 폰은 «지금 확정을 누를 수 있는 다른 폰»(살아 있음 · 명령이나 받은 모드가 자동 · 배차망이 자동 확정 가능) — 동작 검사는 shared `modeTable.test.ts`.
 * 자동을 누른 폰이 이기고 앞 자동 폰의 명령은 알람으로 옮겨 저장한다. 이미 둘이 자동 명령이면(옛 DB · 한 번도 안 고른 폰의 기본값) 보고 응답이 둘 다 알람으로 내려준다.
 * 못 잡는 것: 실제 두 폰이 같은 순간 콜에 들어가는 운행(실물 두 배차망 자동은 사업자 뒤) · 관제웹 단추가 옮겨진 모드를 다시 그리는 화면 ·
 *   옛 DB 에 둘 다 자동인 채 서버가 다시 뜬 경우(메모리가 비어 `getDeviceMode` 가 DB 를 읽는 길 — drive e2e 는 서버를 다시 띄우지 않아 못 만듦).
 *   넘기는 도중 앞 폰이 꺼지면 새 폰은 앞 폰이 «살아 있음»에서 빠질 때(데드맨 150초)까지 알람으로 기다린다 — 안전한 쪽.
 */
const devices = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8');
const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
const supply = readFileSync(join(__dirname, '../../src/state/phoneSupply.ts'), 'utf8');

describe('🔁 자동은 한 폰만', () => {
    it('🔴 자동을 누르면 같은 기사님의 다른 자동 폰을 알람으로 옮겨 저장한다', () => {
        expect(devices).toContain("if (mode === 'AUTO') demoteOtherAutoPhones(deviceId, userId);");
        expect(devices).toMatch(/function demoteOtherAutoPhones\(deviceId: string, userId: string\)[\s\S]*?saveModePreference\(other, userId, 'ALARM'\)/);
    });

    it('🔴 보고 응답은 다른 폰도 자동 명령이면 알람으로 내려준다(이미 둘인 경우의 안전망)', () => {
        expect(supply).toContain('const otherAuto = otherAutoPhoneOf(deviceId, userId);');
        expect(supply).toContain('return modeForPhone(commanded, autoLive, webAttached, otherAuto)');
        expect(scrap).toContain('const phoneMode = deviceId ? modeSentToPhone(deviceId, userId, deviceMode as DeviceModeType)');
        expect(devices).toMatch(/function otherAutoPhoneOf[\s\S]*?otherContractingAuto\(deviceId, phones, Date\.now\(\), DEADMAN_TIMEOUT_MS\)/);   // 판단은 shared 한 곳 · 동작 검사는 modeTable.test
    });
});

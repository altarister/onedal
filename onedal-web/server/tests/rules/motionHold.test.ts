import { readFileSync } from 'fs';
import { join } from 'path';
import { MOTION_HOLD_SEC_DEFAULT } from '@onedal/shared';

/**
 * ⏱️ **«주행·정차로 굳는 시간»은 기사님이 정한다** (화면규칙 S16 · 2026-09-12)
 *
 * 기사님: *"주행중에 시트가 '나'로 내려가야 하는데 내려가지 않았어"* →
 * *"**10초를 설정할 수 있게 만들면** 내가 모의주행할 때는 그걸 줄이고 시험하고
 * **진짜 때는 10으로** 만들면 되니까. 기본값은 10으로 하고 이건 설정창에서 저장"*
 *
 * ── 왜 필요했나 ──
 * 주행 판정은 «20km/h↑ 가 10초». 그런데 모의 주행은 배속이 빨라 정거장 사이를
 * **2~7초**에 지나가고 나머지는 정차 연기(18초)다 — **10초를 채울 수가 없다.**
 * 그래서 기사님이 빠름(40배)으로 한 판을 다 도셨는데 **하루 종일 `idle`** 이었고,
 * 「주행이면 시트가 내려간다」가 한 번도 발화하지 못했다 (로그로 확인).
 *
 * 🔴 **이 검사는 규칙 ⑤-4 의 다섯이 이어졌는지를 본다** — 값이 태어나도 «저장할 자리 ·
 *    고칠 화면 · 읽는 곳» 중 하나가 끊기면 **조용히 코드 상수로 남는다.**
 */

const SERVER = join(__dirname, '../../src');
const CLIENT = join(__dirname, '../../../client-app/src');
const SHARED = join(__dirname, '../../../shared/src');
const read = (abs: string) => readFileSync(abs, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('S16 — 주행·정차로 굳는 시간은 고칠 수 있다', () => {

    it('② 값 — 기본은 10초이고 원천은 shared 한 곳이다', () => {
        expect(MOTION_HOLD_SEC_DEFAULT).toBe(10);
        expect(codeOnly(read(join(SHARED, 'index.ts')))).toMatch(/MOTION_HOLD_SEC_DEFAULT = 10/);
    });

    it('① 스키마 — 저장할 칸이 있다 (기존 DB 에도 붙는다)', () => {
        /**
         * ⚠️ `CREATE TABLE IF NOT EXISTS` 에만 적으면 **기존 DB 에는 안 붙는다** —
         *    `tsc`·`jest` 는 통과하고 실서버에서만 `no such column` 으로 터진다.
         */
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        const ensured = db.slice(db.indexOf("ensureColumns('user_settings'"));
        expect(ensured.slice(0, 400)).toMatch(/motion_hold_sec:\s*'INTEGER DEFAULT 10'/);
    });

    it('③ 시점 — 서버가 내주고 받아 적는다', () => {
        const st = codeOnly(read(join(SERVER, 'routes/settings.ts')));
        expect(st).toMatch(/motionHoldSec: row\.motion_hold_sec/);      // 읽어서 내준다
        expect(st).toMatch(/motion_hold_sec = COALESCE\(@motionHoldSec/); // 받아 적는다
        /* 🔴 INSERT 갈래에도 실어야 한다 — 설정 행이 없던 계정에서만 조용히 빠진다 */
        expect(st.split('motionHoldSec:').length - 1).toBeGreaterThanOrEqual(3);
    });

    it('④ 화면 — 「화면 설정」 탭에서 고친다', () => {
        const modal = codeOnly(read(join(CLIENT, 'components/dashboard/SettingsModal.tsx')));
        expect(modal).toMatch(/value="screen"/);
        expect(modal).toMatch(/ScreenSettingsTab/);
        /* 탭이 늘었으면 격자 칸도 늘어야 한다 — 안 늘리면 마지막 탭이 줄바꿈돼 잘린다 */
        expect(modal).toMatch(/grid-cols-5/);
        const tab = read(join(CLIENT, 'components/dashboard/settings/ScreenSettingsTab.tsx'));
        expect(tab).toMatch(/motionHoldSec/);
    });

    it('⑤ 읽는 곳 — 주행 판정이 그 값을 쓴다. 10초가 박혀 있지 않다', () => {
        const panel = codeOnly(read(join(CLIENT, 'components/dashboard/VehicleStatusPanel.tsx')));
        const i = panel.indexOf('export function useDriveMotion');
        const body = panel.slice(i, panel.indexOf('\n}', panel.indexOf('setInterval', i)));
        expect(body).toMatch(/holdMs/);
        /* 🔴 상수가 남아 있으면 설정을 고쳐도 안 따른다 */
        expect(body).not.toMatch(/>= 10_000/);
    });

    it('🔴 읽는 곳은 하나다 — 여럿이 각자 읽으면 화면마다 다른 답이 나온다', () => {
        /* 설정을 담는 그릇은 스토어 하나이고, 판정은 그것만 본다 (규칙 ③) */
        const store = codeOnly(read(join(CLIENT, 'stores/settingsStore.ts')));
        expect(store).toMatch(/motionHoldSec/);
        const panel = codeOnly(read(join(CLIENT, 'components/dashboard/VehicleStatusPanel.tsx')));
        expect(panel).toMatch(/useSettingsStore\(st => st\.motionHoldSec\)/);
    });
});

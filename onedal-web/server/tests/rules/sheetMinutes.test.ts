import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⏱️ **통화 시트의 분(分)은 판정과 같은 값이어야 한다**
 *
 * 통화 시트는 갈래별로 **이미 그리고 있다** (단위·수량·상차방법·보호·성질)
 * 그리고 그 옆에 **분(分)**을 적는다: `지게차 2분` · `수작업 10분` · `결박 4분`.
 *
 * ── 왜 같은 값이어야 하나 ──
 *
 * 「지게차 박스당 분」·「수작업 박스당 분」·「검수 후작업」은 **판정 기준 탭**에서 고친다.
 * 이 화면이 `dwellMinutes(h, points)` 를 **설정 없이** 부르면 코드의 상수로 그린다.
 *
 * ```
 * 기사님이 탭에서 수작업을 30초/박스로 바꾼다
 *   판정  →  정차 19분  (새 값)
 *   화면  →  «수작업 10분»  (상수)      ← 두 목소리
 * ```
 *
 * 🔴 **화면과 판정이 다른 숫자를 말하면 기사님이 어느 쪽을 믿을지 알 수 없다.**
 *
 * ⚠️ 이 검사는 **글자를 본다** — «설정을 넘기는가»를 보는 것이라 그렇다.
 *    화면 렌더링을 흉내 내는 것보다 이쪽이 깨지지 않는다.
 */

const 시트 = readFileSync(
    join(__dirname, '../../../client-app/src/components/dashboard/StepSheetMock.tsx'), 'utf8');
const 코드만 = 시트.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('⏱️ 통화 시트의 분(分)', () => {
    /**
     * 🔴 **정차 값을 만드는 곳은 하나여야 한다**.
     *    화면이 각자 `derivationInputsOf` 를 부르면 **콜 옵션을 빠뜨리기 쉽다** —
     *    빠뜨리면 통화 시트가 판정과 갈린다 (#71). 그래서 훅 하나(`useDerivation`)로 받는다.
     */
    it('🔴 정차 값을 훅 하나로 받는다 — 각자 조립하지 않는다', () => {
        expect(코드만).toMatch(/useDerivation\(\)/);
        expect(코드만).not.toMatch(/derivationInputsOf\(/);
    });

    it('🔴 상하차 방법의 분을 설정과 함께 잰다 — 옛 상수로 그리지 않는다', () => {
        // `dwellMinutes(h, points)` 처럼 설정 없이 부르면 안 된다
        expect(코드만).not.toMatch(/dwellMinutes\(\s*\w+\s*,\s*points\s*\)/);
        expect(코드만).toMatch(/dwellMinutes\([^)]*unk/);
    });

    it('🔴 후작업(검수 60분)도 설정에서 온다', () => {
        // `AFTERWORK_MINUTES[a]` 로 직접 읽으면 판정 기준 탭 값이 안 닿는다
        expect(코드만).not.toMatch(/AFTERWORK_MINUTES\[/);
    });
});

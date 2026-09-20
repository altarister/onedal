import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📋 **끝난 콜을 가르는 규칙은 한 벌이다** (기사님 확정)
 *
 * 끝난 콜을 그리는 곳은 ☰ 서랍(`Drawer`) 하나다. 거르는 조건을 화면에 적으면
 * 곧 두 벌이 되어 **«한쪽에는 있는데 다른 쪽에는 없는» 콜**이 생긴다.
 * 그래서 규칙은 `lib/finishedCalls` 한 곳에 있고, 화면은 그것을 부르기만 한다 (규칙 ③).
 * 시트(콜 목록)는 «진행 중»만 그린다 — 끝난 콜을 다시 그리면 두 곳이 된다.
 *
 * 함께 잠그는 것:
 *   · ☰ 는 새 화면에서도 보여야 한다 — 폰에서 끝난 콜을 볼 유일한 길이다
 *     (현황판은 폭 1018px 이상에서만 뜬다 · `useSidePanelRoom`)
 *   · 헤더 로고에 테마 전환을 두지 않는다 — 운전 중 오탭으로 화면이 뒤집힌다
 */

const CLIENT = join(__dirname, '../../../client-app/src');
/** 주석을 걷어낸 원문 — 주석 속 예시 문자열을 규칙 위반으로 읽지 않는다 */
const codeOnly = (p: string) =>
    readFileSync(join(CLIENT, p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const RULE = codeOnly('lib/finishedCalls.ts');
const DRAWER = codeOnly('components/layout/Drawer.tsx');
const OLD = codeOnly('components/dashboard/PinnedRoute.tsx');
const HEADER = codeOnly('components/layout/Header.tsx');
const DASHBOARD = codeOnly('pages/Dashboard.tsx');

/** 끝난 콜을 가리키는 상태값 — 이것으로 «직접» 거르면 규칙이 두 벌이 된 것이다 */
const TERMINAL_LITERALS = ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE'];

describe('📋 끝난 콜 — 거르는 규칙이 한 곳이다', () => {
    it('규칙 파일이 셋을 모두 안다', () => {
        for (const s of TERMINAL_LITERALS) expect(RULE).toContain(s);
        expect(RULE).toMatch(/isDeliveredCall/);
    });

    it('🔴 서랍이 규칙 함수를 부른다 — 제 손으로 거르지 않는다', () => {
        expect(DRAWER).toMatch(/callsInView|countsByView/);
        for (const s of TERMINAL_LITERALS) {
            // 상태값을 «비교»하면 안 된다 — 화면에 뭐라고 적을지(whyOf) 고르는 것은 괜찮다
            expect(DRAWER).not.toMatch(new RegExp(`status\\s*===\\s*['"]${s}['"]`));
        }
    });

    /**
     * 🔴 **시트에는 끝난 콜이 없다** — 옛 화면의 탭 줄을 걷어낸 뒤로 콜 목록은 «진행 중»만 그린다.
     *    시트가 끝난 콜을 다시 그리기 시작하면 서랍과 두 곳이 되고, 곧 두 규칙이 된다.
     */
    it('🔴 시트(콜 목록)는 끝난 콜을 그리지 않는다 — 서랍 하나가 든다', () => {
        for (const s of TERMINAL_LITERALS) {
            expect(OLD).not.toMatch(new RegExp(`status\\s*===\\s*['"]${s}['"]`));
        }
        expect(OLD).not.toMatch(/callsInView|countsByView/);
    });

    /**
     * 🔴 탭에 적는 숫자와 목록이 **같은 규칙**에서 나와야 한다.
     *    따로 세면 «취소 1» 이라 적고 목록은 비어 있는 화면이 된다.
     */
    it('🔴 탭 숫자도 같은 규칙에서 나온다', () => {
        expect(DRAWER).toMatch(/countsByView/);
        expect(RULE).toMatch(/countsByView[\s\S]*belongsToView/);
    });
});

describe('☰ 서랍으로 가는 길 — 폰에서 끝난 콜을 볼 유일한 자리다', () => {
    it('🔴 헤더에 ☰ 가 있고 누르면 바깥이 받는다', () => {
        expect(HEADER).toContain('☰');
        expect(HEADER).toMatch(/onMenu/);
    });

    it('🔴 대시보드가 ☰ 를 서랍에 잇는다 — 버튼만 있고 안 열리면 안 된다', () => {
        expect(DASHBOARD).toMatch(/onMenu=\{/);
        expect(DASHBOARD).toMatch(/<Drawer\b/);
    });

    /**
     * 🔴 **새 화면에서도 보여야 한다.** 무대(`stagePreview`)에서 헤더나 서랍을 접으면
     *    폰에서 끝난 콜을 볼 길이 사라진다 — 이 서랍이 생긴 이유가 그것이다.
     */
    it('🔴 서랍을 새 화면 분기 뒤에 숨기지 않는다', () => {
        const line = DASHBOARD.split('\n').find(l => l.includes('<Drawer')) ?? '';
        expect(line).not.toMatch(/stagePreview/);
        const hdr = DASHBOARD.split('\n').find(l => l.includes('<Header')) ?? '';
        expect(hdr).not.toMatch(/stagePreview/);
    });

    /**
     * 🔴 **곁 패널(현황판)은 덮지 않는다** — 곁에서 지켜보는 판이라 가리면
     *    지금 무슨 일이 일어나는지를 놓친다. 그래서 서랍은 `fixed` 가 아니라 `absolute` 다.
     */
    it('🔴 서랍이 화면 전체(fixed)가 아니라 관제 영역 안(absolute)에 깔린다', () => {
        expect(DRAWER).toMatch(/absolute[^"'`]*inset-0/);
        expect(DRAWER).not.toMatch(/fixed\s+inset-0/);
    });
});

describe('🌓 테마 전환은 헤더 로고에 두지 않는다 — 운전 중 오탭', () => {
    it('🔴 헤더가 테마를 바꾸지 않는다', () => {
        expect(HEADER).not.toMatch(/toggleTheme/);
    });

    /** 🔴 **고르는 것이다** — 토글이면 누르기 전에는 지금 무엇인지 알 수 없다 */
    it('테마는 서랍이 들고, 둘을 «골라» 누른다 (토글 아님)', () => {
        expect(DRAWER).toMatch(/setTheme/);
        expect(DRAWER).not.toMatch(/toggleTheme/);
        expect(DRAWER).toMatch(/aria-pressed/);
    });
});

import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 국면 전환 시 조각 펼치기 — docs/필터_재설계_명세.md §2-4-7
 *
 * 기사님: *"첫짐 도착반경 5km 로 사냥하다 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
 * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
 *
 * 이 구간에서 가장 위험한 것은 **무한 루프**다. 조각을 펼치면 필터가 바뀌고,
 * 바뀐 필터로 파생을 다시 돌리면 또 펼치게 된다. 그래서 규칙 두 개를 고정한다.
 *   ① 국면 키가 **실제로 바뀔 때만** 편다
 *   ② 펼치는 함수는 `updateActiveFilter` 를 **다시 부르지 않는다**
 */
describe('국면 전환 — 조각 펼치기', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    /**
     * `applyPhaseSettingsIfChanged` **함수 본문만** 잘라낸다.
     *
     * ⚠️ 예전엔 다음 `\nfunction ` 까지 잘랐는데, 사이에 `export function`/`export const`
     *    가 끼어들면서 **옆 함수까지 딸려 들어와** 엉뚱한 곳에서 테스트가 깨졌다.
     *    다음 최상위 선언에서 끊는다.
     */
    const applyFn = (() => {
        const start = fm.indexOf('function applyPhaseSettingsIfChanged');
        expect(start).toBeGreaterThan(-1);
        const next = fm.slice(start + 10).search(/\n(export )?(function|const) /);
        return next === -1 ? fm.slice(start) : fm.slice(start, start + 10 + next);
    })();

    it('🔴 국면 키가 같으면 아무것도 안 한다 — 매번 덮으면 기사님이 방금 고친 값이 되돌아간다', () => {
        expect(applyFn).toMatch(/appliedPhaseKey/);
        expect(applyFn).toMatch(/return/);   // 조기 반환이 있다
    });

    it('🔴 펼치는 함수가 updateActiveFilter 를 다시 부르지 않는다 (무한 루프 방지)', () => {
        expect(applyFn).not.toMatch(/updateActiveFilter\s*\(/);
    });

    it('🔴 기사님이 방금 고친 값(changes)은 덮지 않는다', () => {
        // 안 그러면 필터 팝업에서 저장한 값이 곧바로 국면 기본값으로 되돌아간다
        expect(applyFn).toMatch(/in changes/);
    });

    it('평면 매핑은 shared 의 applyPhaseToFilter 로만 한다 — 이름 매핑이 두 곳에 있으면 갈라진다', () => {
        expect(applyFn).toMatch(/applyPhaseToFilter/);
        // 여기서 직접 이름을 옮기지 않는다
        expect(applyFn).not.toMatch(/detourAllowKm/);
        expect(applyFn).not.toMatch(/dropoffRadiusKm/);
    });

    it('국면 키는 resolvePhaseKey 로만 구한다 (두 축 조합 규칙을 재구현하지 않는다)', () => {
        expect(applyFn).toMatch(/resolvePhaseKey/);
        expect(applyFn).not.toMatch(/GATHERING/);   // 조건을 직접 쓰지 않는다
    });

    it('단가표는 할인율에서 다시 파생시킨다 (§2-1)', () => {
        expect(applyFn).toMatch(/rateFloorsFrom/);
    });
});

describe('국면별 설정 — 저장과 복귀', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const store = codeOnly(read('state/userSessionStore.ts'));

    it('평소값 저장(계속)에 phase_settings 가 들어간다', () => {
        expect(fm).toMatch(/phase_settings\s*=\s*\?/);
        expect(fm).toMatch(/JSON\.stringify\(session\.basePhaseSettings\)/);
    });

    it('🔴 자정에 국면별 오늘값도 평소값으로 되돌아간다', () => {
        const reset = fm.slice(fm.indexOf('export function ensureBusinessDay'));
        expect(reset).toMatch(/phaseSettings\s*=/);
        expect(reset).toMatch(/appliedPhaseKey\s*=\s*null/);   // 다시 펼치도록
    });

    it('🔴 저장된 게 없으면 기존 평면값을 first 국면으로 옮긴다 — 쓰던 설정을 잃지 않는다', () => {
        expect(store).toMatch(/phaseFromFlat/);
        expect(store).toMatch(/migrated\.first/);
    });

    it('오늘값은 평소값의 **독립 복사본**이다 (참조를 공유하면 오늘 바꾼 게 평소값까지 바꾼다)', () => {
        expect(store).toMatch(/JSON\.parse\(JSON\.stringify\(session\.basePhaseSettings\)\)/);
    });
});

describe('운행 중 우회 금지 — 강제에서 기본값으로', () => {

    it('🔴 getEffectiveCorridorRadius 는 더 이상 0 을 강제하지 않는다', () => {
        const shared = codeOnly(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8'));
        const fn = shared.slice(shared.indexOf('export function getEffectiveCorridorRadius'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).not.toMatch(/DELIVERING/);
    });
});

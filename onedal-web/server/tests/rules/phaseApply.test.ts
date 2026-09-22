import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
/** 주석을 걷어낸 코드만 — 주석의 설명 글에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **필터 값은 한 벌이다 — 국면이 바뀌어도 펼 것이 없다**
 *
 * 값이 국면마다 다섯 벌이면 국면이 바뀔 때 그 벌을 평면에 펴야 하고, 펴면 필터가 바뀌어
 * 파생이 다시 돌며 또 펴는 **무한 루프**를 따로 막아야 한다. 값이 한 벌이면
 * 펼 것도, 고를 국면도, 복사할 다섯 벌도 없다 —
 * 기사님: *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * ✅ **그 장치가 지키던 뜻 셋은 아래 검사가 지킨다.**
 */
describe('값이 바뀔 때 — 펼치던 고리가 없어진 뒤에도 지켜야 하는 것', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const store = codeOnly(read('state/userSessionStore.ts'));

    /**
     * 🔴 **기사님이 방금 고친 값을 덮지 않는다.**
     *    **`changes` 가 마지막에 덮어쓴다** — 파생이 나중에 덮지 않게.
     */
    it('🔴 기사님이 보낸 값이 이긴다 (파생이 나중에 덮지 않는다)', () => {
        const upd = fm.slice(fm.indexOf('export function updateActiveFilter'));
        expect(upd).toMatch(/session\.activeFilter = \{ \.\.\.session\.activeFilter, \.\.\.changes \}/);
    });

    /**
     * 🔴 **단가표는 할인율에서 파생된다**.
     *    국면 전환이 아니라 할인율 변경이 원인이라, **값이 바뀔 때** 다시 만든다.
     */
    it('🔴 단가표는 할인율에서 다시 파생시킨다', () => {
        expect(fm).toMatch(/rateFloorsFrom\(/);
    });

    /**
     * 🔴 **평소값 ↔ 오늘값 두 그릇은 그대로다** (기사님 확정 · 관제웹 CLAUDE.md).
     *    국면별로 또 두 벌을 두지 않을 뿐, 평소값/오늘값 구분은 있다.
     */
    it('🔴 평소값과 오늘값은 여전히 갈라져 있다', () => {
        expect(store).toMatch(/baseFilter/);
        expect(store).toMatch(/activeFilter/);
        /* 국면별로 또 나누던 그릇은 없다 */
        expect(store).not.toMatch(/basePhaseSettings/);
        expect(store).not.toMatch(/phaseSettings/);
    });

    /** 🔴 자정에 오늘값이 평소값으로 되돌아간다 — 어제가 오늘 되살아나지 않는다 */
    it('🔴 자정에 오늘값이 평소값으로 되돌아간다', () => {
        expect(fm).toMatch(/resetToBaseFilter/);
    });

    /** 🔴 읽는 원천이 하나다 — 두 번째 원천을 두지 않는다 */
    it('🔴 로그인의 값 원천은 한 곳이다', () => {
        expect(store).toMatch(/loadFilterValues\(userId\)/);
        expect(store).not.toMatch(/loadPhaseRows/);
    });
});

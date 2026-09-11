import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 국면 전환 시 조각 펼치기 — docs/지금/필터.md §3
 *
 * 기사님: *"첫짐 도착반경 5km 로 콜을 잡다가 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
 * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
 *
 * 이 구간에서 가장 위험한 것은 **무한 루프**다. 조각을 펼치면 필터가 바뀌고,
 * 바뀐 필터로 파생을 다시 돌리면 또 펼치게 된다. 그래서 규칙 두 개를 고정한다.
 *   ① 국면 키가 **실제로 바뀔 때만** 편다
 *   ② 펼치는 함수는 `updateActiveFilter` 를 **다시 부르지 않는다**
 */
/**
 * 🔄 **이 파일이 지키던 고리 셋이 걷혔다** (이식 C3-3b · 2026-09-11).
 *
 *   `applyPhaseSettingsIfChanged`  국면이 바뀌면 그 벌을 평면에 편다
 *   `savePhaseSettings`            국면 하나만 저장한다
 *   `loadPhaseRows` / 오늘값 복사   다섯 행을 읽어 평소값·오늘값 두 벌로
 *
 * 셋 다 **값이 국면마다 다섯 벌이던 시절**의 장치다. 값이 한 벌이 되며(C3-3a)
 * 펼 것도, 고를 국면도, 복사할 다섯 벌도 없어졌다 —
 * 기사님 2026-09-11: *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * ✅ **지키던 뜻 셋은 그대로 산다 — 자리만 옮겼다.**
 */
describe('값이 바뀔 때 — 펼치던 고리가 없어진 뒤에도 지켜야 하는 것', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const store = codeOnly(read('state/userSessionStore.ts'));

    /**
     * 🔴 **기사님이 방금 고친 값을 덮지 않는다.**
     *    예전엔 «국면을 펼 때 `changes` 에 든 키는 건너뛴다»로 지켰다.
     *    이제 펴는 일 자체가 없어 **`changes` 가 마지막에 덮어쓴다** — 같은 뜻이다.
     */
    it('🔴 기사님이 보낸 값이 이긴다 (파생이 나중에 덮지 않는다)', () => {
        const upd = fm.slice(fm.indexOf('export function updateActiveFilter'));
        expect(upd).toMatch(/session\.activeFilter = \{ \.\.\.session\.activeFilter, \.\.\.changes \}/);
    });

    /**
     * 🔴 **단가표는 할인율에서 파생된다** (§2-1).
     *    예전엔 «국면이 바뀔 때» 다시 만들었다. 이제 **값이 바뀔 때** 만든다 —
     *    국면 전환이 아니라 할인율 변경이 진짜 원인이라 그쪽이 맞다.
     */
    it('🔴 단가표는 할인율에서 다시 파생시킨다', () => {
        expect(fm).toMatch(/rateFloorsFrom\(/);
    });

    /**
     * 🔴 **평소값 ↔ 오늘값 두 그릇은 그대로다** (기사님 확정 · 관제웹 CLAUDE.md).
     *    사라진 것은 «국면별로 또 두 벌»이지, 평소값/오늘값 구분이 아니다.
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

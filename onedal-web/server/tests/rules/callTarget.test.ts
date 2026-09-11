import { readFileSync } from "fs";
import { join } from "path";
import { CALL_TARGET_LABEL } from "@onedal/shared";
import type { CallTarget } from "@onedal/shared";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");

/**
 * 주석을 걷어낸 **코드만** 남긴다.
 *
 * 이 파일들의 주석에는 "왜 그렇게 고쳤는가"가 적혀 있고 거기에는 옛 이름
 * (`startTwoTrack`·`투-트랙 탐색`)이 그대로 나온다. 그 기록은 남겨야 하지만,
 * 검사 대상은 **코드가 그 짓을 하느냐**이지 이름이 문서에 나오느냐가 아니다.
 */
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 2026-08-13 — **국면 전환은 필터만 바꾼다. 콜은 건드리지 않는다.**
 *
 * 옛 `startTwoTrack` 은 전환하면서 활성 콜을 전부 `ORDER_COMPLETED` 로 만들었다.
 *
 *   기사님: *"투트랙은 활성콜을 완료처리하는 것이 아니고 지금 상황에 맞는 콜을
 *   필터에 넣어야 한다는 거지. **콜은 무조건 배달을 해서 완료되어야 한다.**"*
 *
 * 짐을 싣고 가는 중에 눌렀다면 배달하지도 않은 콜이 완료로 기록됐다 —
 * 정산도 운행일지도 통째로 틀어진다. 이 테스트가 그 코드의 부활을 막는다.
 */
describe('국면 전환 (CallTarget) — 콜을 건드리지 않는다', () => {

    const engine = codeOnly(read('services/dispatchEngine.ts'));
    /** `setCallTarget` 함수 본문만 잘라낸다 (다음 export 직전까지) */
    const setCallTargetBody = (() => {
        const start = engine.indexOf('export async function setCallTarget');
        expect(start).toBeGreaterThan(-1);
        const next = engine.indexOf('\nexport ', start + 10);
        return engine.slice(start, next === -1 ? undefined : next);
    })();

    it('🔴 setCallTarget 는 콜 상태를 바꾸지 않는다 (setOrderStatus / UPDATE orders 없음)', () => {
        expect(setCallTargetBody).not.toMatch(/setOrderStatus/);
        expect(setCallTargetBody).not.toMatch(/ORDER_COMPLETED/);
        expect(setCallTargetBody).not.toMatch(/UPDATE\s+orders/i);
    });

    it('🔴 옛 startTwoTrack 은 완전히 사라졌다 — 되살리지 말 것', () => {
        expect(engine).not.toMatch(/function startTwoTrack/);
        expect(codeOnly(read('socket/socketHandlers.ts'))).not.toMatch(/start-two-track/);
    });

    it('없는 도시 이름을 지어내지 않는다 — 옛 코드의 "🎯 투-트랙 탐색"', () => {
        // 값을 거짓으로 만들면 그 값을 읽는 모든 곳(지리 연산·화면)이 함께 속는다
        expect(engine).not.toMatch(/투-트랙 탐색/);
    });

    /**
     * 🔄 **개정 2026-09-11 — 관내가 «고르는 것»에서 «파생»이 되었다** (이식 C4-8b·C4-8b-2).
     *
     * 기사님 2026-09-11: *"우린 **집으로 갈건지 말껀지만** 있어."*
     *
     * ⚠️ 옛 검사는 *«LOCAL 국면은 GPS 가 없으면 전환을 거부한다»* 였다. 그때는 옳았다 —
     *    관내로 가려면 «지금 어느 시인가»를 알아야 했고, 그래서 `destinationCity` 를
     *    **갈아치웠다**(김포시 → 성남시).
     * 🔴 **그 갈아치움이 문제였다.** 파생으로 두면 기사님이 정한 목적지가 저절로 바뀐다.
     *    지금 관내는 `netKeywordsOf` 가 `isLocalPhase()` 로 보고 **목적지는 그대로 둔 채**
     *    그물의 방향만 끈다 (각도 360°). 그러니 여기서 거부할 일이 없다.
     *
     * 🔴 **«위치를 지어내지 않는다»는 그대로다** — 자리가 옮겨졌을 뿐이다.
     *    집 좌표나 내 위치가 없으면 `localMode` 는 **거짓**이 된다 (관내로 안 친다).
     *    `phaseUi.test.ts` 의 «관내 — 목적지를 안 잃는 파생»이 그것을 잠근다.
     */
    it('🔄 관내 전환 길이 사라졌다 — 파생이라 «전환»이 없다', () => {
        expect(setCallTargetBody).not.toMatch(/'LOCAL'/);
        expect(setCallTargetBody).not.toMatch(/reverseGeocodeToRegion/);
    });

    /** 🔴 복귀는 여전히 **집 주소가 없으면 거부**한다 — 그쪽은 지어낼 수 없는 값이다 */
    it('🔴 복귀는 집 주소가 없으면 거부한다 — 주소를 지어내지 않는다', () => {
        expect(setCallTargetBody).toMatch(/home_address/);
        expect(setCallTargetBody).toMatch(/success:\s*false/);
    });

    it('파생값(키워드·별칭)을 직접 채우지 않는다 — filterManager 한 곳에서만 만든다', () => {
        // destinationCity/RadiusKm 같은 **입력만** 넘겨야 recalculateDerivedFields 가
        // customCityFilters 까지 채운다 (2026-08-12 사고)
        expect(setCallTargetBody).not.toMatch(/destinationKeywords:/);
        expect(setCallTargetBody).not.toMatch(/customCityFilters:/);
    });

    /**
     * 🔄 **개정 2026-09-11 — 셋에서 «둘»로** (이식 C4-8b-2).
     *    관내는 고르는 것이 아니라 파생이라 `CallTarget` 에서 걷었다.
     *    ⚠️ 관내 자체가 없어진 것이 아니다 — `AutoDispatchFilter.localMode` 가 말한다.
     */
    it('🔄 국면 라벨은 둘이다 — 노선행 · 복귀행', () => {
        const phases: CallTarget[] = ['DEST', 'HOME'];
        for (const p of phases) expect(CALL_TARGET_LABEL[p]).toBeTruthy();
        expect(Object.keys(CALL_TARGET_LABEL).sort()).toEqual(['DEST', 'HOME']);
    });
});

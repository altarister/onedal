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
 * 🔴 **국면 전환은 필터만 바꾼다. 콜은 건드리지 않는다.**
 *
 *   기사님: *"투트랙은 활성콜을 완료처리하는 것이 아니고 지금 상황에 맞는 콜을
 *   필터에 넣어야 한다는 거지. **콜은 무조건 배달을 해서 완료되어야 한다.**"*
 *
 * 전환하면서 활성 콜을 `ORDER_COMPLETED` 로 만들면, 짐을 싣고 가는 중에 눌렀을 때 배달하지도 않은
 * 콜이 완료로 기록된다 — 정산도 운행일지도 통째로 틀어진다. 이 검사가 그런 코드(`startTwoTrack`)를 막는다.
 */
describe('국면 전환 (CallTarget) — 콜을 건드리지 않는다', () => {

    const engine = codeOnly(read('services/dispatchEngine.ts'));

    it('🔴 옛 startTwoTrack 은 완전히 사라졌다 — 되살리지 말 것', () => {
        expect(engine).not.toMatch(/function startTwoTrack/);
        expect(codeOnly(read('socket/socketHandlers.ts'))).not.toMatch(/start-two-track/);
    });

    it('없는 도시 이름을 지어내지 않는다 — 옛 코드의 "🎯 투-트랙 탐색"', () => {
        // 값을 거짓으로 만들면 그 값을 읽는 모든 곳(지리 연산·화면)이 함께 속는다
        expect(engine).not.toMatch(/투-트랙 탐색/);
    });

    /**
     * 🔴 **국면은 둘이다** — 노선행 · 복귀행.
     *    관내는 고르는 것이 아니라 파생이라 `CallTarget` 에 없다 (목적지 가까이 옴 `filterArea.withNearness`).
     */
    it('🔄 국면 라벨은 둘이다 — 노선행 · 복귀행', () => {
        const phases: CallTarget[] = ['DEST', 'HOME'];
        for (const p of phases) expect(CALL_TARGET_LABEL[p]).toBeTruthy();
        expect(Object.keys(CALL_TARGET_LABEL).sort()).toEqual(['DEST', 'HOME']);
    });
});

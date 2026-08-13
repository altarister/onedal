import { readFileSync } from "fs";
import { join } from "path";
import { HUNT_PHASE_LABEL } from "@onedal/shared";
import type { HuntPhase } from "@onedal/shared";

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
describe('국면 전환 (HuntPhase) — 콜을 건드리지 않는다', () => {

    const engine = codeOnly(read('services/dispatchEngine.ts'));
    /** `setHuntPhase` 함수 본문만 잘라낸다 (다음 export 직전까지) */
    const setHuntPhaseBody = (() => {
        const start = engine.indexOf('export async function setHuntPhase');
        expect(start).toBeGreaterThan(-1);
        const next = engine.indexOf('\nexport ', start + 10);
        return engine.slice(start, next === -1 ? undefined : next);
    })();

    it('🔴 setHuntPhase 는 콜 상태를 바꾸지 않는다 (setOrderStatus / UPDATE orders 없음)', () => {
        expect(setHuntPhaseBody).not.toMatch(/setOrderStatus/);
        expect(setHuntPhaseBody).not.toMatch(/ORDER_COMPLETED/);
        expect(setHuntPhaseBody).not.toMatch(/UPDATE\s+orders/i);
    });

    it('🔴 옛 startTwoTrack 은 완전히 사라졌다 — 되살리지 말 것', () => {
        expect(engine).not.toMatch(/function startTwoTrack/);
        expect(codeOnly(read('socket/socketHandlers.ts'))).not.toMatch(/start-two-track/);
    });

    it('없는 도시 이름을 지어내지 않는다 — 옛 코드의 "🎯 투-트랙 탐색"', () => {
        // 값을 거짓으로 만들면 그 값을 읽는 모든 곳(지리 연산·화면)이 함께 속는다
        expect(engine).not.toMatch(/투-트랙 탐색/);
    });

    it('LOCAL 국면은 GPS 가 없으면 전환을 거부한다 — 위치를 지어내지 않는다', () => {
        expect(setHuntPhaseBody).toMatch(/driverLocation/);
        expect(setHuntPhaseBody).toMatch(/success:\s*false/);
    });

    it('파생값(키워드·별칭)을 직접 채우지 않는다 — filterManager 한 곳에서만 만든다', () => {
        // destinationCity/RadiusKm 같은 **입력만** 넘겨야 recalculateDerivedFields 가
        // customCityFilters 까지 채운다 (2026-08-12 사고)
        expect(setHuntPhaseBody).not.toMatch(/destinationKeywords:/);
        expect(setHuntPhaseBody).not.toMatch(/customCityFilters:/);
    });

    it('세 국면 라벨이 정의돼 있다', () => {
        const phases: HuntPhase[] = ['DEST', 'LOCAL', 'HOME'];
        for (const p of phases) expect(HUNT_PHASE_LABEL[p]).toBeTruthy();
        expect(HUNT_PHASE_LABEL.LOCAL).toContain('이 동네');
    });
});

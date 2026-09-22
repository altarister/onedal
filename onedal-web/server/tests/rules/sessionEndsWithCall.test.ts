import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔚 **세션은 콜이 끝날 때만 지운다** (기사님 확정)
 *
 * 자동 터치 직후 화면이 상세로 바뀌기 전에 LIST 이벤트가 한 번 더 오면:
 *
 *     .707  [인성콜] 꿀콜 클릭!            ← isAutoActive = true
 *     .825  📡 화면: LIST                  ← 화면이 아직 안 바뀜 (118ms)
 *     .826  🔄 세션 상태 완전 초기화        ← isAutoActive = false 💥
 *    1.026  📡 화면: DETAIL_PRE_CONFIRM
 *    1.049  👀 [미리보기] 손으로 연 상세    ← AUTO 인데 "손으로 연 것"으로 오판
 *
 * 앱이 **자기가 터치한 콜**을 "기사님이 손으로 연 것"으로 읽어 **확정을 안 누른다.**
 * 판정(🔵)까지 받아 놓고 콜을 놓친다. 터치→상세가 빨라 LIST 이벤트가 안 끼면
 * 정상 확정되므로 **타이밍에 따라 가끔만** 난다.
 *
 * 🔴 **클래스: 콜의 생애를 화면 이벤트로 끝낸다.**
 *
 * `resetSessionState()` 를 부르는 자리는 전부 *"이 콜은 끝났다"* 여야 한다
 * (복귀 · 동명이동 실패 · 2차 필터 실패 · 판결 집행 ×2 · 배차망 자동 전환 · 체험 뒤로가기 복귀).
 * *"지금 리스트를 보고 있다"* 로 지우는 자리가 하나라도 있으면 나머지를 덮는다.
 * 복귀는 «지금 LIST 냐»가 아니라 «LIST 로 돌아왔느냐»(`isListScreen && !wasListScreen`)로 판정한다.
 * 그래서 인스턴스가 아니라 **리스트 핸들러에서 지우는 자리 자체를 없앤다**.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
/** 주석은 전부 걷어낸다 — 주석 속 코드 모양 글자를 구현으로 세면 검사가 물러진다 */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **세션을 지우는 자리는 세 파일에 나뉘어 있다** —
 * `HijackService.kt` · `InsungSequence.kt` · `PreConfirmSequence.kt`.
 * 지키려는 뜻은 «앱 전체에서 일곱 곳»이므로 함께 읽는다.
 */
const SEQUENCE_FILES = ['HijackService.kt', 'plugins/insung/InsungSequence.kt', 'core/engine/PreConfirmSequence.kt'];
const src = () => SEQUENCE_FILES.map(f => code(app(f))).join('\n');
const fnOf = (name: string) => {
    const s = src();
    return s.split(`private fun ${name}`)[1]?.split('\n    private fun ')[0] ?? '';
};

describe('🔚 세션은 콜이 끝날 때만 지운다', () => {
    /**
     * 🔴 리스트를 **보고 있는 것**은 콜의 끝이 아니다. 자동 터치 직후 화면이 바뀌기 전
     *    LIST 이벤트가 한 번 더 오면 방금 잡은 콜이 통째로 지워진다.
     */
    it('🔴 리스트 화면 핸들러는 세션을 지우지 않는다', () => {
        expect(fnOf('handleListScreen')).not.toMatch(/resetSessionState\(\)/);
    });

    /**
     * 🔴 대신 **복귀(DETAIL → LIST)** 에서는 반드시 지운다 — 그게 콜의 끝이다.
     *    조건을 달지 않는다: `hasActiveSession()` 은 `surfingState`·`isPreview` 를
     *    안 보므로, 그것만 더럽게 남으면 다음 상세에서 팝업 서핑이 안 붙는다.
     */
    it('🔴 복귀(LIST 로 돌아옴)에서는 조건 없이 지운다', () => {
        const s = src();
        const i = s.indexOf('isListScreen && !wasListScreen');
        expect(i).toBeGreaterThan(-1);
        const block = s.slice(i, i + 400);
        expect(block).toMatch(/resetSessionState\(\)/);
        expect(block).not.toMatch(/hasActiveSession\(\)/);
    });

    /**
     * 🔴 남은 자리는 **전부 콜의 끝**이어야 한다. 새 자리가 늘면 이 숫자가 흔들리고,
     *    그때 "이것도 콜의 끝인가"를 다시 묻게 된다.
     */
    it('🔴 세션을 지우는 자리는 콜이 끝나는 일곱 곳뿐이다', () => {
        // 선언(`private fun resetSessionState()`)은 호출이 아니다 — 빼고 센다
        // 여섯째 자리: 배차망 자동 전환(applyTargetApp) — 다른 배차망으로 갈아타는 순간
        // 일곱째 자리: 체험(SIMULATION) 뒤로가기 복귀 시 세션 리셋
        const hits = src().match(/(?<!fun )resetSessionState\(\)/g) ?? [];
        expect(hits.length).toBe(7);
    });
});

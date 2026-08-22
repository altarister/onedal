import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔚 **세션은 콜이 끝날 때만 지운다** (기사님 확정 2026-08-23)
 *
 * 실사고 (2026-08-23 03:27:00, 리허설 16콜):
 *
 *     .707  [인성콜] 꿀콜 클릭!            ← isAutoActive = true
 *     .825  📡 화면: LIST                  ← 화면이 아직 안 바뀜 (118ms)
 *     .826  🔄 세션 상태 완전 초기화        ← isAutoActive = false 💥
 *    1.026  📡 화면: DETAIL_PRE_CONFIRM
 *    1.049  👀 [미리보기] 손으로 연 상세    ← AUTO 인데 "손으로 연 것"으로 오판
 *
 * 앱이 **자기가 터치한 콜**을 "기사님이 손으로 연 것"으로 읽어 **확정을 안 눌렀다.**
 * 판정(🔵 100점)까지 받아 놓고 콜을 놓쳤다. 같은 콜을 잡은 다음 콜(03:27:16)은
 * 터치→상세가 376ms 라 LIST 이벤트가 안 끼었고 정상 확정됐다 — **순전히 타이밍**이다.
 *
 * 🔴 **클래스: 콜의 생애를 화면 이벤트로 끝낸다.**
 *
 * `resetSessionState()` 호출 지점 6곳 중 다섯은 *"이 콜은 끝났다"* 인데
 * (복귀 · 동명이동 실패 · 2차 필터 실패 · 판결 집행 ×2), `handleListScreen` 첫 줄
 * 하나만 *"지금 리스트를 보고 있다"* 였다. 그 하나가 나머지를 덮었다.
 *
 * ⚠️ 이 클래스는 **두 번째**다. 2026-08-12 에는 같은 리셋이 `matchType` 을 AUTO→MANUAL
 *    로 뒤집어 유령 콜을 만들었다. 그때 [HijackService.kt:282] 에 "지금 LIST 냐가 아니라
 *    LIST 로 돌아왔느냐" 라는 정확한 판정을 넣었는데, **핸들러 첫 줄이 그걸 무의미하게
 *    만들고 있었다.** 그래서 인스턴스가 아니라 **자리 자체를 없앤다** (CLAUDE.md 커밋 규칙).
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
/** 주석은 전부 걷어낸다 — 사고 기록을 구현으로 세면 검사가 물러진다 */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const src = () => code(app('HijackService.kt'));
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
    it('🔴 세션을 지우는 자리는 콜이 끝나는 다섯 곳뿐이다', () => {
        // 선언(`private fun resetSessionState()`)은 호출이 아니다 — 빼고 센다
        const hits = src().match(/(?<!fun )resetSessionState\(\)/g) ?? [];
        expect(hits.length).toBe(5);
    });
});

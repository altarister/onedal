import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🎛️ **모르면 잡지 않는다** (2026-09-02 실측 사고)
 *
 * 앱을 새로 깐 직후, 서버가 «알람»이라고 답하기 **전에** 앱이 스스로 «자동»이라 믿고
 * 콜을 눌렀다:
 * ```
 * 15:35:40.0  모드: AUTO                         ← 앱 기본값. 서버 말을 아직 못 들음
 * 15:35:40.1  💥 [AUTO] 꿀콜 조건 통과! 강제 터치!
 * 15:35:40.4  🔔 [알람] … 기사님이 직접 누르십니다  ← 서버 대답은 이때 왔다
 * ```
 * 그날 그 창은 **50초**였다 — 화면이 안 바뀌어 첫 통신이 60초 생존신고였기 때문이다.
 *
 * 🔴 픽커에서 같은 일이 나면 「수락하기」가 눌리고 **되돌릴 창이 없다**
 *    (버튼 취소 없음 · 전화만 · 하루 5번).
 *
 * ⚠️ 앱 기본값은 «서버 미응답 시의 오프라인 안전망»이라 일부러 두는 것이지만
 *    (CLAUDE.md 규칙 ③), 안전망은 **안전한 쪽**으로 틀어야 한다.
 */
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🎛️ 앱 기본값 — 모르면 잡지 않는다', () => {
    it('서버 대답을 듣기 전의 모드는 «자동»이 아니다', () => {
        const src = codeOnly(app('core/TelemetryManager.kt'));
        const m = src.match(/var\s+currentMode\s*:\s*String\s*=\s*"(\w+)"/);
        expect(m).not.toBeNull();
        expect(m![1]).not.toBe('AUTO');
    });

    it('자동 클릭은 그 모드를 보고 갈린다 — 기본값이 곧 «누를까 말까»다', () => {
        expect(codeOnly(app('HijackService.kt'))).toContain('currentMode == "AUTO"');
    });
});

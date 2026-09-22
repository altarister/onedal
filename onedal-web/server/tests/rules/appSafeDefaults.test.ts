import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🎛️ **모르면 잡지 않는다** (실측 사고)
 *
 * 앱을 새로 깐 직후처럼 서버가 «알람»이라고 답하기 **전에** 앱 기본값이 «자동»이면, 앱이 스스로
 * 콜을 누른다. 화면이 안 바뀌면 첫 통신이 60초 생존신고라 그 창이 수십 초가 된다.
 * 그래서 서버 대답 전의 모드(`currentMode` 기본값)는 «자동»이 아닌 값으로 둔다.
 *
 * 🔴 픽커에서 같은 일이 나면 「수락하기」가 눌리고 **되돌릴 창이 없다**
 *    (버튼 취소 없음 · 전화만 · 하루 5번).
 *
 * ⚠️ 앱 기본값은 «서버 미응답 시의 오프라인 안전망»이라 일부러 두는 것이지만
 *    (규칙 ③), 안전망은 **안전한 쪽**으로 틀어야 한다.
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

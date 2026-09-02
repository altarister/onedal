import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **화면이 바뀐 보고는 예약하지 않는다** (2026-09-02 계측으로 확정)
 *
 * 200ms 뒤로 예약해 두면 안드로이드가 **제때 안 깨운다** — 실측 2174ms · 13396ms.
 * (「발사 준비 지연」 줄은 한 줄도 안 나왔다 — flush 안이 아니라 «깨어나기»가 늦다)
 * 기사님 체감 «페이지 바뀌고 수초 이상»의 정체가 이것이었다.
 */
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('👀 화면 보고는 그 자리에서 나간다', () => {
    const body = () => {
        const src = codeOnly(app('core/TelemetryManager.kt'));
        return src.split('fun forceFlushEvent')[1]?.split('\n    fun ')[0] ?? '';
    };

    it('예약(postDelayed)하지 않는다 — 안드로이드가 제때 안 깨운다', () => {
        expect(body()).not.toContain('postDelayed');
        expect(body()).not.toContain('scheduleFlush');
    });

    it('그 자리에서 flush 를 부른다', () => {
        expect(body()).toContain('flush(');
    });
});

/**
 * 🟢 **서비스가 붙자마자 한 번 보고한다** (기사님 실측 2026-09-02: *"폰이랑 서버랑
 * 연결이 안 되는데?"*)
 *
 * 앱이 뜨면 60초 생존신고 시계만 걸리고 **첫 보고는 그 60초 뒤**였다. 그동안 관제웹에서는
 * 폰이 아예 없는 것처럼 보인다. 접근성을 껐다 켜면 그 시계가 **처음부터 다시** 시작하므로,
 * 실측에서는 세 번 토글하는 사이 1분 넘게 조용했다.
 */
describe('🟢 붙자마자 첫 보고', () => {
    it('서비스가 붙으면 생존신고를 기다리지 않고 한 번 쏜다', () => {
        const src = codeOnly(app('HijackService.kt'));
        const started = src.indexOf('telemetryManager.start()');
        expect(started).toBeGreaterThan(-1);
        // start() 직후 200자 안에 즉시 발사가 있어야 한다
        expect(src.slice(started, started + 200)).toContain('forceHeartbeat()');
    });
});

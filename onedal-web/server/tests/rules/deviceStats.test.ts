import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📊 **기기 카드의 세 숫자는 각각 참말이어야 한다** (기사님 지적 2026-08-23)
 *
 * 기사님: *"서버를 새로 켰으니 리셋되었고 16개의 콜을 받았으면 수집 14 · 수락 2 ·
 * 취소 0 이렇게 표시되어야 하는 거 아닌가?"*
 *
 * 실측은 `수집:13 · 수락:0 · 취소:2` 였다. 세 숫자가 각각 다른 이유로 어긋나 있었다.
 *
 * 🔴 **수락은 코드에 올리는 곳이 아예 없었다.** `incrementDeviceStats(…, "grabbed")` 를
 *    부르는 자리가 0곳이라 **항상 0** 이다. 화면이 조용히 거짓말했다 (규칙 ⑤-4 ④).
 *
 * 🔴 **수집은 "본 콜"이 아니라 "탈락한 콜"만 셌다.** 앱은 잡을 콜을 찾으면 `break` 로
 *    루프를 나가는데, `telemetryManager.enqueue` 가 그 아래에 있어 **잡은 콜은 안 세어졌다.**
 *    이름이 "수집"이라 전부 세는 것처럼 읽힌다.
 *
 * 기사님 확정 (2026-08-23): **잡은 콜도 센다** — *"16개 중 몇 개를 봤나"* 가 화면에서
 * 더 쓸모 있다. 실전에서는 리스트에 몇 개가 뜨는지 모르기 때문이다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const srv = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('📊 수락 — 올리는 자리가 있어야 한다', () => {
    /**
     * 🔴 취소가 `countCancel` 한 곳에서 세듯, 수락도 **한 곳**에서 센다.
     *    네 군데가 각자 세면 조건을 더할 때 한쪽만 고쳐진다 (이 레포의 반복 사고).
     */
    it('🔴 수락을 세는 자리가 코드에 있다 (지금은 0곳이라 항상 0이었다)', () => {
        const all = ['core/cancelCount.ts', 'services/dispatchEngine.ts', 'routes/detail.ts']
            .map(p => { try { return code(srv(p)); } catch { return ''; } }).join('\n');
        expect(all).toMatch(/incrementDeviceStats\([^)]*["']grabbed["']\)/);
    });

    /**
     * 🔴 **KEEP 이 곧 수락이다.** 판정이 KEEP 으로 내려간 순간에 센다 —
     *    앱이 확정을 누른 것과 서버가 KEEP 한 것은 같은 사건의 양면이다.
     */
    it('🔴 수락은 취소와 같은 자리에서 센다 (한 곳에서 센다)', () => {
        const c = code(srv('core/cancelCount.ts'));
        expect(c).toMatch(/countKeep|export function countKeep/);
    });

    it('🔴 미리보기 콜은 수락으로 세지 않는다 (인성엔 아무 일도 안 일어났다)', () => {
        const c = code(srv('core/cancelCount.ts'));
        const fn = c.split('export function countKeep')[1] ?? '';
        expect(fn).toMatch(/isPreview/);
    });
});

describe('📊 수집 — 잡은 콜도 센다', () => {
    const scan = () => {
        const s = code(app('HijackService.kt'));
        return s.split('private fun handleListScreen')[1]?.split('\n    private fun ')[0] ?? '';
    };

    /**
     * 🔴 잡은 콜은 `break` 로 루프를 나가므로 아래의 `enqueue` 에 못 닿는다.
     *    **나가기 전에** 세야 한다.
     */
    it('🔴 AUTO 로 잡은 콜도 텔레메트리에 실린다 (break 전에 센다)', () => {
        const fn = scan();
        const beforeBreak = fn.split('break')[0] ?? '';
        expect(beforeBreak).toMatch(/telemetryManager\.enqueue\(order\)/);
    });

    it('🔴 그래도 두 번 세지 않는다 (잡은 콜은 아래에서 또 담기지 않는다)', () => {
        const hits = (scan().match(/telemetryManager\.enqueue\(order\)/g) ?? []).length;
        expect(hits).toBe(2);   // 잡은 갈래 1 + 탈락 갈래 1 — 갈래가 갈리므로 한 콜은 한 번만
    });
});

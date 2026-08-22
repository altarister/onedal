import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👁️ **리스트가 빈 이유를 구분해 남긴다** (기사님 확정 2026-08-22 · 크리티컬)
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * 접근성이 막혀 앱이 콜을 하나도 못 읽는 동안, **관제웹은 파란불이었다.** 텔레메트리가
 * 5초마다 계속 갔고 화면 판별(`LIST`)도 됐기 때문이다 — 서버는 *"데이터가 왔으니 ONLINE"*
 * 으로 봤다. 기사님은 멀쩡해 보이는 화면을 믿고 *"왜 안 잡지"* 하며 기다리셨다.
 *
 * 🔴 **실운행이면 콜을 통째로 놓치는데 기사님이 알 방법이 없다.**
 *
 * 실측(2026-08-22): `LIST` 화면인데 콜 0개 — 8/21 은 하루 종일 **18,824회 전부 0개**였다.
 * 대부분은 진짜 빈 리스트지만, **고장과 구분할 수가 없다:**
 *
 *     리스트에 콜이 없다      → 0항목   ← 정상
 *     콜이 있는데 못 읽는다   → 0항목   ← 고장
 *
 * 로그도 `resetSessionState` 에서 끊겨서, 노드를 몇 개 읽었는지·그룹이 왜 0인지
 * **알 수가 없었다.** 관측 구멍이 처음부터 있었고 오늘 처음 증상으로 드러났다.
 *
 * ⚠️ 오늘 미리보기 작업과는 **무관하다** — 리스트 스캔 경로는 건드리지 않았다(diff 확인).
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
/** 주석은 전부 걷어낸다 — **줄 끝 인라인 주석까지**. 안 그러면 "…파싱 실패 → 스킵" 같은
 *  설명 글이 구현으로 세어져 검사가 물러진다 (실제로 한 번 그랬다) */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('👁️ 리스트 스캔 — 빈 이유를 구분한다', () => {
    const scan = () => {
        const src = code(app('HijackService.kt'));
        return src.split('private fun handleListScreen')[1]?.split('private fun ')[0] ?? '';
    };

    /**
     * 🔴 세 숫자가 있어야 어느 칸인지 갈린다:
     *    노드 많음 + 그룹 0  → 콜은 화면에 있는데 못 뽑는다
     *    노드 0    + 그룹 0  → 접근성 트리가 아예 안 온다
     *    노드 적음 + 그룹 0  → 리스트가 진짜 비었다 (정상)
     */
    it('🔴 콜이 0개면 그 이유를 남긴다 — 노드 수와 그룹 수를 함께', () => {
        const fn = scan();
        expect(fn).toMatch(/allNodes\.size/);
        expect(fn).toMatch(/groupedNodes\.size/);
    });

    it('🔴 요금 파싱 실패도 센다 — 그룹은 나왔는데 콜이 안 되는 경우', () => {
        const fn = scan();
        // fare == 0 으로 조용히 건너뛰던 자리에 숫자가 남아야 한다
        expect(fn).toMatch(/fareFail|파싱 실패/);
    });

    /**
     * 🔴 **앱만 알고 있으면 소용없다.** 기사님이 보는 것은 관제웹이다.
     *    앱이 센 숫자를 텔레메트리에 실어야 서버가 판단하고 화면이 말할 수 있다.
     */
    it('🔴 그 숫자를 서버로 보낸다 (앱 안에서만 알면 화면은 여전히 거짓말한다)', () => {
        expect(code(app('core/TelemetryManager.kt'))).toMatch(/screenNodeCount|nodeCount/);
    });
});

/**
 * 💤 **화면 꺼짐과 접근성 막힘을 구분한다** (기사님 확정 2026-08-22).
 *
 * 기사님: *"화면꺼짐이 그대로 보이는 것이 맞을 것 같아. 접근성 스크래핑이 꺼진 건지,
 * 화면이 꺼진 건지 구분이 되면 더 좋고."*
 *
 * 실측: 폰 화면이 꺼진 채로 관제웹은 **녹색**이었다. 앱은 `Screen Off` 를 감지해
 * `sendOffline()` 까지 보냈는데(20:28:15), 60초 뒤 하트비트가 오자
 * `touchDeviceSession` 이 `status = "ONLINE"` 으로 **되돌렸다.**
 *
 * 🔴 원인은 **이벤트 한 번으로 알리고 그 뒤 상태를 서버가 추측**하는 구조다.
 *    이벤트가 덮이면 끝이다. 사실을 매번 실어 보내면 추측할 일이 없다 (규칙 ③).
 *
 * ⚠️ 그리고 **화면이 꺼지면 노드가 0인 게 당연하다.** 그걸 "못 읽음"으로 부르면
 *    기사님이 폰을 끌 때마다 거짓 경고가 뜬다 — 당연한 것을 고장이라 하지 않는다.
 */
describe('💤 화면 꺼짐 — 접근성 막힘과 구분한다', () => {
    it('🔴 앱이 화면 켜짐/꺼짐을 매번 실어 보낸다 (이벤트 한 번에 기대지 않는다)', () => {
        expect(code(app('core/TelemetryManager.kt'))).toMatch(/isScreenOn/);
        expect(code(app('models/SharedModels.kt'))).toMatch(/isScreenOn/);
    });

    /**
     * 🔴 **화면을 끄는 순간 알린다.** 끄면 텔레메트리 주기가 5초 → **60초(하트비트)** 로
     *    떨어져서, 앱은 즉시 알았는데 관제웹은 최대 1분 뒤에야 알았다.
     */
    it('🔴 화면 꺼짐은 다음 하트비트를 기다리지 않는다', () => {
        const src = code(app('HijackService.kt'));
        const off = src.split('ACTION_SCREEN_OFF')[1]?.split('ACTION_SCREEN_ON')[0] ?? '';
        expect(off).toMatch(/forceFlushEvent|forceHeartbeat/);
    });

    it('🔴 화면이 꺼져 있으면 "못 읽음"으로 치지 않는다 (당연한 것을 고장이라 하지 않는다)', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const fn = src.split('function applyBlindSignal')[1]?.split('\nexport ')[0] ?? '';
        expect(fn).toMatch(/isScreenOn/);
    });
});

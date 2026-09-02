import { readFileSync } from 'fs';
import { join } from 'path';
import { PICKER_SCREEN_LABELS, screenLabelOf } from '@onedal/shared';

/**
 * 🖥️ **화면 보고는 «본 것»만 말한다** (2026-09-02 · 기사님 실측 제보).
 *
 * 기사님: *"픽커는 지금 홈에 있는데. 콜 리스트로 나오고 있어."*
 *
 * ── 무엇이 있었나 ──
 * 스캐너가 붙는 순간 `updateScreenContext(ScreenContext.LIST)` 로 **화면을 읽지도 않고**
 * «콜 리스트»라고 세우고 있었다. 인성에서는 우연히 맞았다 — 스캐너를 켤 때 대개 리스트를
 * 보고 있으니까. 픽커 홈에서는 그 우연이 깨졌고, 관제웹이 **1분 넘게 거짓말**을 했다.
 *
 * 왜 안 고쳐졌나: 홈 화면은 움직이지 않아 `TYPE_WINDOW_CONTENT_CHANGED` 가 안 온다.
 * 이벤트가 없으니 판별도 없고, 처음 세운 값이 그대로 남는다.
 *
 * ── 이 레포가 이미 아는 병이다 ──
 * 규칙 ④ *"없는 숫자를 지어내지 않는다"* 의 화면판이다. `0` 이 아니라 `null` 이어야 하듯,
 * **안 본 화면은 «리스트»가 아니라 «아직 모름»** 이다. 그리고 규칙 ⑤-4 ⑤(읽는 곳):
 * 이 값은 관제웹이 «지금 폰이 어디 있나»의 답으로 읽는다 — 그 질문에 추측으로 답하면
 * 기사님이 폰을 안 보고 관제만 보다 틀린 판단을 한다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const hijack = readFileSync(join(APP, 'HijackService.kt'), 'utf-8');

/** 주석에 적힌 예시가 검사를 통과시키지 않도록 — 코드 줄만 남긴다 */
const codeOnly = hijack
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');

describe('🖥️ 화면 보고는 본 것만 말한다', () => {
    it('🔴 서비스가 붙을 때 화면을 안 읽고 LIST 라고 세우지 않는다', () => {
        expect(codeOnly).not.toMatch(/updateScreenContext\(\s*ScreenContext\.LIST\s*\)/);
    });

    /**
     * 지어내지 않는 유일한 길은 **그 자리에서 읽는 것**이다 (규칙 ③ — 저장하지 말고 파생).
     * 화면이 아직 없으면(`rootInActiveWindow == null`) 그때는 «모름»이 정직한 답이다.
     */
    it('🔴 대신 붙는 순간 실제 화면을 한 번 읽는다', () => {
        const connected = codeOnly.slice(
            codeOnly.indexOf('override fun onServiceConnected'),
            codeOnly.indexOf('override fun onAccessibilityEvent'),
        );
        expect(connected).toMatch(/rootInActiveWindow/);
        expect(connected).toMatch(/detectScreenContext|ScreenContext\.UNKNOWN/);
    });
});

/**
 * 🪟 **창이 바뀌는 것도 화면이 바뀐 것이다** (2026-09-02 · 기사님 두 번째 실측 제보).
 *
 * 기사님: *"리스트 갔다가 다시 홈으로 왔는데.. 중간에 「나가시겠습니까」 알럿창이 떠서
 * 「네」 하고 홈으로 왔는데.. 알 수 없는 화면으로 계속 남아 있어."*
 *
 * ── 실측 ──
 * ```
 * 12:36:11.741  🔎 [UNKNOWN 화면 진단] 「close dialog 오더 탐색을」   ← 알럿창. 마지막 판별
 * 12:36:11.945  📦 screen=UNKNOWN
 * 12:37:11.966  📦 screen=UNKNOWN                                   ← 1분 뒤에도 그대로
 * ```
 * 그 사이 **판별이 한 번도 안 돌았다.** 홈으로 돌아왔는데 아무도 안 본 것이다.
 *
 * ── 왜 ──
 * 접근성 설정에 `typeWindowContentChanged` **하나만** 등록돼 있었다. 다이얼로그가 닫히고
 * 홈으로 돌아가는 것은 «창이 바뀌는» 사건(`typeWindowStateChanged`)이라
 * **OS 가 보내지도 않는다.** 안 오는 이벤트는 코드로 못 고친다.
 *
 * 🔴 앞의 «붙는 순간 LIST» 와 **뿌리가 같다** — *화면이 안 움직이면 아무도 다시 안 본다.*
 * 그때는 «첫 값»이 굳었고, 이번엔 «마지막 값»이 굳었다. 첫 값만 고쳐서는 반쪽이었다.
 */
describe('🪟 창이 바뀌면 화면을 다시 본다', () => {
    const xml = readFileSync(
        join(__dirname, '../../../../onedal-app/app/src/main/res/xml/accessibility_service_config.xml'),
        'utf-8',
    );

    it('🔴 OS 에 «창 전환»도 보내 달라고 등록한다 — 안 오는 이벤트는 코드로 못 고친다', () => {
        expect(xml).toMatch(/accessibilityEventTypes="[^"]*typeWindowStateChanged/);
    });

    it('🔴 그리고 코드가 그 이벤트를 버리지 않는다', () => {
        const handler = codeOnly.slice(codeOnly.indexOf('override fun onAccessibilityEvent'));
        expect(handler).toMatch(/TYPE_WINDOW_STATE_CHANGED/);
    });

    /** 내용 변경은 여전히 필요하다 — 리스트가 갱신되는 것은 창이 안 바뀌고 내용만 바뀐다 */
    it('내용 변경도 계속 본다 — 리스트 갱신은 창이 안 바뀐다', () => {
        expect(xml).toMatch(/typeWindowContentChanged/);
        const handler = codeOnly.slice(codeOnly.indexOf('override fun onAccessibilityEvent'));
        expect(handler).toMatch(/TYPE_WINDOW_CONTENT_CHANGED/);
    });
});

/**
 * ⏱️ **값이 늦게 도는 것은 «폰이 알려줄 때만 볼 수 있다»는 한계다** (2026-09-02 · 되돌린 기록).
 *
 * 기사님 실측: *"바뀌고 나서 1분 가까이 기다려야 하는 것 같아."*
 *
 * ── 해 봤고, 안 됐다 ──
 * 창이 바뀌거나 «모름»으로 읽히면 0.3·0.9·2초 뒤에 화면을 **다시 읽는** 코드를 넣었다가
 * **되돌렸다.** 안드로이드 접근성은 화면을 **캐시**하고 그 캐시는 **이벤트가 와야** 버린다 —
 * 이벤트 없이 읽으면 **아까 그 화면**을 준다. 실측에서 세 번 다시 읽었는데 값이 한 번도
 * 안 바뀌었고(`🔁 [다시 보기]` 로그가 한 줄도 안 찍혔다), **18.3초 → 18.3초** 그대로였다.
 *
 * ── 먼발치에서 본 결론 ──
 * 늦는 것은 **정지 화면뿐**이다. 리스트·상세·팝업은 계속 움직여 이벤트가 쏟아지므로
 * 즉시 반영된다(실측: 리스트는 즉시). 늦는 곳은 픽커 홈이고 거기는 일을 안 하는 시간이다.
 * 서버가 화면 값을 실제로 쓰는 곳(«리스트로 돌아왔다» → 안 잡은 콜 정리)은 **안 늦는다.**
 *
 * 남은 길은 `todo.md` 최상단에 적어 뒀다 — 이벤트 종류를 늘리거나, 캐시를 끄거나
 * (인성 전체의 배터리를 건다), 보고 주기를 줄이거나.
 */
describe('📤 다시 읽든 아니든, 보내야 서버가 안다', () => {
    /**
     * 🔴 **POST 가 유일한 기회다** (기사님 확인 2026-09-02:
     * *"post 방식의 통신을 하고 있어서 요청하지 않으면 변하지 않는 것도 알고 있는 거지?"*).
     *
     * 서버는 앱에 먼저 물어볼 수 없다. 값이 바뀌었으면 **앱이 그 자리에서 보내야** 한다.
     */
    it('🔴 화면 값이 바뀌면 그 자리에서 보낸다', () => {
        const marker = 'private fun updateScreenContext';
        const rest = codeOnly.slice(codeOnly.indexOf(marker) + marker.length);
        const body = rest.slice(0, rest.indexOf('fun '));
        expect(body).toMatch(/forceFlushEvent/);
    });
});

/**
 * 📣 **같은 클래스의 두 번째 인스턴스라서 함께 잡는다** (CLAUDE.md — *"같은 클래스가
 * 두 번 나오면 인스턴스가 아니라 그 클래스를 없애는 수정을 한다"*).
 *
 * 위의 «붙는 순간 LIST 라고 세운다»와 **같은 병**이 부팅 배너에도 있었다:
 *
 * ```
 *   🔍 Parser     (${scrapParser.currentParserName()})   ← 읽어서 답한다
 *   🎯 Keywords   (인성콜)                                ← 지어낸다
 * ```
 *
 * 한 화면에서 한 줄은 파생이고 한 줄은 리터럴이었다. 픽커로 돌 때도 「인성콜」이라 찍혀,
 * 2026-09-02 홈 화면 오보를 진단하다 **이 로그를 믿고 한 번 헛짚었다.**
 *
 * 🔴 **로그도 보고다.** 화면에 안 보인다고 지어내도 되는 것이 아니다 — 이 레포는
 * 로그를 근거로 진단하고, 잘못된 로그는 잘못된 수리로 이어진다.
 */
describe('📣 앱이 자기 상태를 말할 때는 원천에서 파생시킨다', () => {
    /** 부팅 배너 = 「Service Connected」 이후 `onServiceConnected` 가 끝날 때까지 */
    const banner = codeOnly.slice(
        codeOnly.indexOf('1DAL Service Connected'),
        codeOnly.indexOf('override fun onInterrupt'),
    );

    it('🔴 부팅 배너가 배차망 이름을 지어내지 않는다', () => {
        expect(banner).not.toMatch(/["(](인성콜|픽커|화물24시|24시)[")]/);
    });

    it('배차망 이름은 지금 쓰는 낱말 사전에서 읽는다', () => {
        expect(banner).toMatch(/keywords\.appLabel/);
    });
});

describe('🏠 픽커 홈은 «홈»이라고 답한다', () => {
    /**
     * 🔴 홈을 `UNKNOWN` 으로 두면 관제웹이 **빨간 깜빡임**을 낸다 — «못 읽는 중»과
     * «홈에서 대기 중»이 같아 보인다. 이 레포가 «연결됐다»와 «읽고 있다»를 섞어
     * 당한 것과 같은 모양이다.
     */
    it('픽커 라벨에 홈이 있다', () => {
        expect(PICKER_SCREEN_LABELS.HOME).toBeDefined();
        expect(screenLabelOf('kakaopicker', 'HOME')?.label).toContain('홈');
    });

    /** ⚠️ 인성·24시에는 홈 화면 개념이 없다 — 없는 것을 지어내 붙이지 않는다 */
    it('인성에는 홈이 없다 — 없는 화면을 만들어 붙이지 않는다', () => {
        expect(screenLabelOf('insung', 'HOME')?.label).toBe('알 수 없는 화면');
    });
});

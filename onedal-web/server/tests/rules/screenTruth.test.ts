import { readFileSync } from 'fs';
import { join } from 'path';
import { PICKER_SCREEN_LABELS, screenLabelOf } from '@onedal/shared';

/**
 * 🖥️ **화면 보고는 «본 것»만 말한다** (기사님 실측 제보).
 *
 * 스캐너가 붙는 순간 화면을 **읽지도 않고** «콜 리스트»(`ScreenContext.LIST`)라고 세우면,
 * 인성에서는 대개 맞지만(스캐너를 켤 때 대개 리스트를 보고 있다) 픽커 홈에서는 틀린다.
 * 홈 화면은 움직이지 않아 `TYPE_WINDOW_CONTENT_CHANGED` 가 안 오므로 판별이 안 돌고,
 * 처음 세운 값이 그대로 남아 관제웹이 **1분 넘게 틀린 화면**을 말한다.
 * 그래서 붙는 순간 실제 화면을 한 번 읽는다.
 *
 * ── 규칙 ④ 의 화면 쪽 ──
 * 규칙 ④ *"없는 숫자를 지어내지 않는다"* 를 화면에 적용한 것이다. `0` 이 아니라 `null` 이어야 하듯,
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
 * 🪟 **창이 바뀌는 것도 화면이 바뀐 것이다** (기사님 실측 제보).
 *
 * 「나가시겠습니까」 알럿창을 닫고 홈으로 돌아가는 것은 «창이 바뀌는» 사건(`typeWindowStateChanged`)이다.
 * 접근성 설정에 `typeWindowContentChanged` **하나만** 등록하면 **OS 가 그 사건을 보내지도 않아**
 * 판별이 한 번도 안 돌고, 마지막 값(알럿창 → `UNKNOWN`)이 1분 넘게 그대로 남는다.
 * 안 오는 이벤트는 코드로 못 고치므로 설정에 등록하고, 코드도 그 이벤트를 받는다.
 *
 * 🔴 앞의 «붙는 순간 LIST» 와 **뿌리가 같다** — *화면이 안 움직이면 아무도 다시 안 본다.*
 * «첫 값»도 «마지막 값»도 굳을 수 있으므로 둘 다 막는다.
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
 * ⏱️ **값이 늦게 도는 것은 «폰이 알려줄 때만 볼 수 있다»는 한계다**.
 *
 * ── 다시 읽기로는 못 푼다 ──
 * 창이 바뀌거나 «모름»으로 읽힐 때 몇 초 뒤 화면을 **다시 읽어도** 값이 안 바뀐다.
 * 안드로이드 접근성은 화면을 **캐시**하고 그 캐시는 **이벤트가 와야** 버린다 —
 * 이벤트 없이 읽으면 **아까 그 화면**을 준다. 그래서 다시 읽는 코드는 두지 않는다.
 *
 * ── 그래도 되는 까닭 ──
 * 늦는 것은 **정지 화면뿐**이다. 리스트·상세·팝업은 계속 움직여 이벤트가 쏟아지므로
 * 즉시 반영된다(실측: 리스트는 즉시). 늦는 곳은 픽커 홈이고 거기는 일을 안 하는 시간이다.
 * 서버가 화면 값을 실제로 쓰는 곳(«리스트로 돌아왔다» → 안 잡은 콜 정리)은 **안 늦는다.**
 *
 * 남은 길 — 이벤트 종류를 늘리거나, 캐시를 끄거나
 * (인성 전체의 배터리를 건다), 보고 주기를 줄이거나.
 */
describe('📤 다시 읽든 아니든, 보내야 서버가 안다', () => {
    /**
     * 🔴 **POST 가 유일한 기회다** (기사님 확인:
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
 * 📣 **부팅 배너도 «본 것»만 말한다** — 위의 «붙는 순간 LIST 라고 세운다»와 같은 모양이라 함께 잡는다.
 *
 * ```
 *   🔍 Parser     (${scrapParser.currentParserName()})   ← 읽어서 답한다
 *   🎯 Keywords   (인성콜)                                ← 지어낸다
 * ```
 *
 * 배차망 이름을 리터럴(「인성콜」)로 찍으면 픽커로 돌 때도 「인성콜」이라 찍혀,
 * 화면 오보를 진단하는 사람이 **이 로그를 믿고 헛짚는다.** 그래서 `keywords.appLabel` 에서 읽는다.
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
     * «홈에서 대기 중»이 같아 보인다.
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

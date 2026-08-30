import { readFileSync } from 'fs';
import { join } from 'path';
import { DEVICE_MODES, isDeviceMode, type DeviceModeType } from '@onedal/shared';

/**
 * 🎛️ **기기 모드는 셋이다 — 자동 · 알람 · 직접** (기사님 지시 2026-08-30)
 *
 * 기사님: *"메뉴얼은 진짜 메뉴얼처럼, 필터를 통과한 콜이 리스트 맨 위에 나타나면
 * 알람을 주는 기능이야. 그러면 내가 직접 인성 리스트 첫 번째 것을 클릭하는 거지."*
 *
 * 확정은 `docs/지금/기기_모드.md` 에 있다.
 *
 * | 화면 이름 | 키 | 필터 | 앱이 누르나 | 알람 |
 * |---|---|---|---|---|
 * | 자동 | `AUTO` | 돈다 | ✅ | — |
 * | 알람 | `ALARM` | 돈다 | ❌ | ✅ |
 * | 직접 (구 «대기») | `MANUAL` | 돈다 | ❌ | ❌ |
 *
 * 🔴 「직접」(구 «대기»)에 새 키를 만들지 않은 것은 **동작이 지금 `MANUAL` 과 같기 때문**이다.
 *    키를 유지하면 기존 분기가 한 줄도 안 바뀐다.
 */

const SRC = join(__dirname, '../../src');
const srv = (p: string) => readFileSync(join(SRC, p), 'utf8');
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const web = (p: string) => readFileSync(join(__dirname, '../../../client-app/src', p), 'utf8');
/** 주석은 «앞으로 할 말»을 담는다 — 코드만 본다 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🎛️ 모드 셋 — 값과 그 뜻', () => {
    it('🔴 모드는 정확히 셋이다 (자동·알람·직접)', () => {
        expect([...DEVICE_MODES].sort()).toEqual(['ALARM', 'AUTO', 'MANUAL']);
    });

    /**
     * 🔴 `STANDBY` 는 `dispatchPhase`(첫짐 탐색)가 이미 쓰는 말이다.
     *    같은 낱말에 두 뜻을 주면 로그를 읽을 때 어느 쪽인지 모른다.
     */
    it('🔴 dispatchPhase 의 STANDBY 와 낱말이 겹치지 않는다', () => {
        expect(DEVICE_MODES).not.toContain('STANDBY' as any);
    });

    it('모르는 값은 모드가 아니라고 답한다 (빈 값·소문자·옛 이름)', () => {
        expect(isDeviceMode('AUTO')).toBe(true);
        expect(isDeviceMode('ALARM')).toBe(true);
        expect(isDeviceMode('MANUAL')).toBe(true);
        expect(isDeviceMode('')).toBe(false);
        expect(isDeviceMode('auto')).toBe(false);
        expect(isDeviceMode('STANDBY')).toBe(false);
        expect(isDeviceMode(undefined)).toBe(false);
    });
});

describe('🎛️ isActive 는 «필터가 도는가» 다 — «누가 누르나»가 아니다', () => {
    /**
     * 🔴 **여기가 이 일의 핵심이다.** 앱의 `decide()` 는 맨 앞에서
     *    `if (!filter.isActive) return false` 로 끊는다 (`InsungParser:165`).
     *    그래서 알람 모드에서 `isActive` 가 꺼져 있으면 **필터가 아예 안 돌고
     *    아무것도 안 울린다** — 기능이 통째로 죽는다.
     *
     * 값이 둘일 땐 «필터가 돈다»와 «앱이 누른다»가 같은 말이었다. 알람이 생기며 갈라졌다.
     */
    it('🔴 자동·알람 둘 다 필터를 켠다 (알람에서 필터가 죽으면 안 울린다)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const block = c.split('hasFilteringDevice')[1]?.slice(0, 300) ?? '';
        expect(block).toBeTruthy();
        expect(block).toMatch(/mode === "AUTO"/);
        expect(block).toMatch(/mode === "ALARM"/);
    });

    /**
     * 🔴 그래도 **누르는 것은 AUTO 뿐이다.** 두 사실을 두 곳이 나눠 답한다 (규칙 ③) —
     *    필터가 도는가는 `isActive`, 누가 누르는가는 앱의 `currentMode`.
     *    (누르는 쪽 잠금은 아래 「앱은 AUTO 일 때만 누른다」 가 맡는다)
     */
    it('🔴 직접(MANUAL)는 필터를 켜지 않는다', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const block = c.split('hasFilteringDevice')[1]?.slice(0, 300) ?? '';
        expect(block).not.toMatch(/mode === "MANUAL"/);
    });

    it('🔴 모드 검증이 세 값을 다 받는다 (ALARM 을 400 으로 막지 않는다)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        expect(c).toMatch(/isDeviceMode\(/);
        // 옛 방식(값을 손으로 나열)이 남아 있으면 값이 늘 때 한쪽만 고쳐진다 (규칙 ③)
        expect(c).not.toMatch(/mode !== "AUTO" && mode !== "MANUAL"/);
    });
});

describe('🎛️ 모드는 서버 재시작을 견딘다', () => {
    /**
     * 🔴 메모리에만 두면 **알람이 말없이 대기로 떨어진다.**
     *    값이 둘일 때는 `isActive` 로 되살렸는데, 셋이 되면 `isActive === false` 에서
     *    「대기」와 「알람」을 못 가른다. 화면은 멀쩡하고 알람만 안 울린다.
     */
    it('🔴 user_devices 에 mode 칸이 있다', () => {
        const c = srv('db.ts');
        expect(c).toMatch(/ensureColumns\('user_devices'|ensureColumns\("user_devices"/);
        expect(c).toMatch(/mode:/);
    });

    it('🔴 모드를 DB 에 쓴다 (메모리에만 남기지 않는다)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        expect(c).toMatch(/UPDATE user_devices SET mode/);
    });

    /**
     * 🔴 **남의 폰 모드를 못 바꾼다** (2026-08-30 코드리뷰).
     *
     * `requireAuth` 는 *"로그인했는가"* 만 본다 — *"이 폰이 네 것인가"* 는 안 본다.
     * 기기 해제(DELETE)는 `user_id` 로 거르는데 이 자리만 안 걸렀다.
     *
     * ⚠️ 구멍 자체는 전부터 있었지만 **메모리라 재시작에 사라졌다.**
     *    DB 로 내리면서 **영구화**됐다 — 그래서 지금 막는다.
     */
    it('🔴 모드 변경이 남의 폰을 막는다 (user_id 로 거른다)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const fn = c.split('function saveModePreference')[1]?.split('\n}')[0] ?? '';
        expect(fn).toBeTruthy();
        expect(fn).toMatch(/WHERE device_id = \? AND user_id = \?/);
    });

    it('🔴 남의 폰이면 거절한다 (조용히 무시하지 않는다)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const route = c.split('router.post("/:deviceId/mode"')[1]?.split('\n});')[0] ?? '';
        expect(route).toBeTruthy();
        // 0행 갱신 = 내 폰이 아니다 → 404. 조용히 200 을 주면 화면이 거짓말한다
        expect(route).toMatch(/changes === 0/);
        expect(route).toMatch(/404/);
    });

    it('🔴 기본 모드를 DB 에서 읽는다 (원천은 하나다 — 규칙 ③)', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const fn = c.split('function resolveDefaultMode')[1]?.split('\n}')[0] ?? '';
        expect(fn).toBeTruthy();
        expect(fn).toMatch(/SELECT mode FROM user_devices/);
    });
});

describe('🔴 대기로 두면 필터가 정말로 꺼진다', () => {
    /**
     * 🔴 **2026-08-30 코드리뷰가 잡은 «거짓 계약».**
     *
     * 용어집에 *"대기면 콜 필터가 꺼진다"* 라고 적었는데 성립하지 않았다.
     * `updateActiveFilter(isActive:false)` 를 받은 **바로 그 함수 안에서**
     * 불변식(`filterManager.ts`)이 «선점 중인 콜 0건이면 다시 켠다»로 되돌린다.
     *
     * 🔴 뿌리 — `isActive` 가 **세 사실**을 답하고 있었다:
     *    ① 기사님이 필터를 켰는가 (기기 모드)
     *    ② 지금 콜을 물어도 되는가 (선점 잠금 · 불변식이 푼다)
     *    ③ 필터를 믿을 수 있는가 (`scrap.ts` — 부트스트랩·만석·미접속·고장)
     *
     * 셋은 **AND** 여야 하는데 서로 덮어쓰고 있었다. ①을 세션에 따로 담아
     * 불변식이 그것을 **넘지 못하게** 한다.
     */
    /** ⚠️ 닻은 **코드**여야 한다 — `codeOnly` 가 주석을 걷어내므로 주석 문구로 자르면 헛돈다 */
    const invariant = () => {
        const c = codeOnly(srv('state/filterManager.ts'));
        const i = c.indexOf('evaluating.length === 0');
        expect(i).toBeGreaterThan(-1);
        return c.slice(i, i + 300);
    };

    it('🔴 불변식이 기사님의 «필터 끔» 을 넘지 않는다', () => {
        expect(invariant()).toMatch(/filterEnabledByMode/);
    });

    it('🔴 기기 모드가 그 의도를 세션에 적는다', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        expect(c).toMatch(/filterEnabledByMode/);
    });

    it('🔴 세션 타입에 그 칸이 선언돼 있다 (any 로 새어 들어오지 않는다)', () => {
        const c = srv('state/userSessionStore.ts');
        expect(c).toMatch(/filterEnabledByMode/);
    });

    /**
     * 🔴 **한 번도 안 고른 사용자는 예전 그대로 돈다.** 기본이 `false` 면
     *    콜 필터가 통째로 죽는다 — 값을 더하며 남을 망가뜨리지 않는다.
     */
    it('🔴 기본값은 «켬» 이다 (모드를 고른 적 없으면 예전과 같다)', () => {
        // undefined 를 «끔» 으로 읽으면 안 된다 — 명시적으로 false 일 때만 막는다
        expect(invariant()).toMatch(/filterEnabledByMode !== false/);
    });
});

describe('🎛️ 앱은 AUTO 일 때만 누른다', () => {
    const scan = () => {
        const s = codeOnly(app('HijackService.kt'));
        return s.split('private fun handleListScreen')[1]?.split('\n    private fun ')[0] ?? '';
    };

    /**
     * 🔴 알람·대기에서 앱이 누르면 **기사님이 안 잡기로 한 콜이 잡힌다.**
     *    지금 코드는 `currentMode == "AUTO"` 로 이미 막고 있다 — 그 문이 열리지 않는지 잠근다.
     */
    it('🔴 터치는 currentMode == "AUTO" 문 안에서만 일어난다', () => {
        const fn = scan();
        expect(fn).toContain('performSimulatedTouch');
        const beforeTouch = fn.split('performSimulatedTouch')[0] ?? '';
        expect(beforeTouch).toMatch(/currentMode == "AUTO"/);
    });

    /**
     * 🟢 필터는 **모드와 무관하게** 돈다 — 알람이 쓸 판정이 이미 그 자리에 있다.
     *    이 줄이 AUTO 문 안으로 들어가면 알람 모드에서 필터가 죽는다.
     */
    it('🔴 필터 판정(shouldClick)은 AUTO 문 밖에서 돈다 (항시 인터셉터)', () => {
        const fn = scan();
        const beforeGate = fn.split('currentMode == "AUTO"')[0] ?? '';
        expect(beforeGate).toMatch(/shouldClick\(order, tally\)/);
    });
});

describe('🔴 모드 이름이 «콜의 출신»으로 새어 나가지 않는다', () => {
    /**
     * 🔴 **2026-08-30 코드리뷰가 잡은 진짜 결함.** 앱이 `"${mode}_CLICK"` 으로 딱지를
     *    조립해서, 알람 모드에서는 서버가 모르는 `"ALARM_CLICK"` 이 태어났다.
     *
     *    서버는 `type.startsWith("MANUAL")` 로 직접콜을 보호한다(아래 검사) —
     *    딱지가 안 붙으니 **리스트 복귀 순간 기사님의 콜이 강제 취소**된다 (규칙 ① 위반).
     *
     * ⚠️ 모드가 셋이라 커졌을 뿐 **원래 틀려 있었다**: 자동 스위치인 채 손으로 확정하면
     *    `"AUTO_CLICK"` 이 찍혀 같은 사고가 났다. 뿌리는 판단이 두 벌이었던 것 (규칙 ③).
     */
    it('🔴 앱이 기기 모드로 딱지를 조립하지 않는다', () => {
        const s = codeOnly(app('HijackService.kt'));
        expect(s).not.toMatch(/\$\{mode\}_CLICK/);
        expect(s).not.toMatch(/currentMode\)\s*$/m);          // ensureOrderId(currentMode)
        expect(s).toMatch(/\$\{session\.clickOrigin\}_CLICK/);
    });

    it('🔴 출신을 파생하는 자리가 하나다 (clickOrigin)', () => {
        const s = codeOnly(app('core/engine/SessionManager.kt'));
        expect(s).toMatch(/val clickOrigin/);
        expect(s).toMatch(/if \(isAutoActive\) "AUTO" else "MANUAL"/);
        // id 접두사도 같은 원천 — 예전엔 모드를 인자로 받았다
        expect(s).toMatch(/fun ensureOrderId\(\)/);
        expect(s).toMatch(/\$clickOrigin-\$\{System\.currentTimeMillis\(\)\}/);
    });

    /**
     * 🔴 **서버가 무엇을 보고 직접콜을 지키는지**를 함께 못박는다.
     *    앱만 고치고 이 자리가 바뀌면 다시 갈라진다.
     */
    it('🔴 서버의 직접콜 보호는 MANUAL 딱지를 본다', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        expect(c).toMatch(/startsWith\("MANUAL"\)/);
    });
});

describe('🔔 알람이 관제웹까지 가는 길', () => {
    /**
     * 🟢 **앱을 안 고쳐도 된다** — 필터 성적표(`passed`)가 이미 서버로 온다.
     *    앱은 이미 본 콜을 지문으로 건너뛰므로 `passed` 는 **새로 본** 통과 콜만 센다.
     */
    it('🔴 서버가 ALARM 모드에서만 알람을 쏜다', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        expect(c).toMatch(/filter-pass-alarm/);
        const block = c.split('filter-pass-alarm')[0].slice(-400);
        expect(block).toMatch(/mode === "ALARM"/);
        expect(block).toMatch(/passed > 0/);
    });

    /**
     * 🔴 **성적표가 함께 온 보고일 때만** 참이다 — 「방금 리스트를 훑었다」.
     *    밖으로 빼면 하트비트마다 옛 숫자로 다시 운다.
     */
    it('🔴 알람은 filterTally 가 온 보고 안에서만 울린다', () => {
        const c = codeOnly(srv('routes/devices.ts'));
        const guard = c.split('if (filterTally)')[1]?.split('activeDevices.set')[0] ?? '';
        expect(guard).toMatch(/filter-pass-alarm/);
    });
});

describe('🔔 2단계 — 스캐너 폰이 스스로 알린다 (기사님 확정 §6-②④)', () => {
    /**
     * 관제웹 소리만으로는 부족하다 — 기사님이 보는 화면은 **인성 리스트**다.
     * 폰이 소리 두 번 + 강한 진동을 내고, 통과한 콜 줄에 테두리를 그린다.
     */
    it('🔴 진동 권한이 매니페스트에 있다 (없으면 SecurityException 으로 조용히 죽는다)', () => {
        const m = readFileSync(join(APP, '../../../../AndroidManifest.xml'), 'utf8');
        expect(m).toMatch(/android\.permission\.VIBRATE/);
    });

    it('🔴 테두리는 접근성 오버레이 창이다 — 「다른 앱 위에 표시」 권한을 요구하지 않는다', () => {
        const s = codeOnly(app('core/AlarmSignaler.kt'));
        expect(s).toMatch(/TYPE_ACCESSIBILITY_OVERLAY/);
        expect(s).not.toMatch(/TYPE_APPLICATION_OVERLAY|SYSTEM_ALERT_WINDOW/);
    });

    /**
     * 🔴 **터치를 먹으면 안 된다** — 그 줄을 눌러야 하므로 (기사님 확정 §6-④).
     */
    it('🔴 테두리가 터치를 먹지 않는다 (FLAG_NOT_TOUCHABLE)', () => {
        const s = codeOnly(app('core/AlarmSignaler.kt'));
        expect(s).toMatch(/FLAG_NOT_TOUCHABLE/);
    });

    it('🔴 알람은 ALARM 모드 + 필터 통과에서만 난다 (자동·대기는 조용하다)', () => {
        const s = codeOnly(app('HijackService.kt'));
        const scan = s.split('private fun handleListScreen')[1]?.split('\n    private fun ')[0] ?? '';
        const fireLine = scan.split('alarmSignaler.fire')[0].slice(-400);
        expect(fireLine).toMatch(/currentMode == "ALARM"/);
        expect(fireLine).toMatch(/isTarget/);
    });

    /**
     * 🔇 «먼저 오는 것»으로 그친다 (§6-③): 그 콜이 리스트에서 사라짐 / 10초.
     *    리스트가 아닌 화면으로 가도 걷는다 — 남의 화면 위에 테두리가 떠돌면 안 된다.
     */
    it('🔴 10초가 지나거나 콜이 리스트에서 사라지면 걷는다', () => {
        const s = codeOnly(app('core/AlarmSignaler.kt'));
        expect(s).toMatch(/10_000|10000/);
        expect(s).toMatch(/fun onScan/);
        const svc = codeOnly(app('HijackService.kt'));
        expect(svc).toMatch(/alarmSignaler\.onScan\(/);
    });
});

describe('🎛️ 관제웹 — 버튼 셋과 알람', () => {
    it('🔴 관제웹이 알람을 듣고 소리를 낸다', () => {
        const c = codeOnly(web('hooks/useSystemAlerts.ts'));
        expect(c).toMatch(/socket\.on\("filter-pass-alarm"/);
        expect(c).toMatch(/soundManager\.playFilterAlarm\(\)/);
        // 🔇 손으로 끄게 하지 않는다 — 10초 뒤 스스로 사라진다
        expect(c).toMatch(/FILTER_ALARM_HOLD_MS/);
    });

    /**
     * 🔴 소리만 나고 화면에 아무것도 없으면 *"방금 그게 무슨 소리였지"* 가 된다.
     */
    it('🔴 알람이 화면에도 뜬다 (소리만 나지 않는다)', () => {
        const c = web('components/dashboard/DeviceControlPanel.tsx');
        expect(c).toMatch(/filterAlarm/);
        expect(c).toMatch(/인성 리스트에서 직접 누르십시오/);
    });

    it('🔴 모드 버튼이 셋이다 (알람이 화면에 있다)', () => {
        const c = web('components/dashboard/DeviceControlPanel.tsx');
        expect(c).toMatch(/ALARM/);
        expect(c).toMatch(/알람/);
    });

    /**
     * 🔴 소리는 **짧게 두 번 + 강한 진동** (기사님 확정 2026-08-30).
     *    무한 반복(`playCallRinging`)은 이미 남에게 간 콜에도 계속 울린다.
     */
    it('🔴 알람은 짧게 두 번 + 강한 진동이다 (무한 반복이 아니다)', () => {
        const c = codeOnly(web('lib/soundManager.ts'));
        const fn = c.split('playFilterAlarm')[1]?.slice(0, 600) ?? '';
        expect(fn).toBeTruthy();
        expect(fn).toMatch(/NotificationType\.Warning|NotificationType\.Error/);
        expect(fn).not.toMatch(/callAudio|loop/);
    });
});

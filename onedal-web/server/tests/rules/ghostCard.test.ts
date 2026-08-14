import { readFileSync } from "fs";
import { join } from "path";
import { LIST_SCREENS, isListScreen } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const APP = join(__dirname, "../../../../onedal-app/app/src/main/java/com/onedal/app");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **유령 카드** — 앱은 리스트로 돌아갔는데 관제탑이 계속 기다리던 사고 (2026-08-14)
 *
 * 기사님: *"앱이 콜을 잡아서 서버로 올리고 특정 사항으로 연산을 못할 때 앱은 기다리지 않고
 * 리스트로 돌아가는데, 관제앱은 계속 기다리는 버그가 있어. 이건 크리티컬한 버그야."*
 *
 * 원인은 **같은 판단을 두 곳에서 따로 정의한 것**이었다.
 *   앱   — `LIST` · `LIST_COMPLETED` 둘 다 "리스트 복귀"로 보고 세션을 리셋한다
 *   서버 — `screenContext === 'LIST'` **하나만** 인정했다
 * 그래서 완료 리스트로 빠져나가면 서버가 콜을 계속 쥐었고, 관제탑 카드가 남고
 * `isActive` 도 꺼진 채라 **사냥이 통째로 멈췄다.**
 */
describe('유령 카드 — "리스트로 돌아왔다"의 정의는 하나다', () => {

    const devices = codeOnly(read('routes/devices.ts'));

    it('🔴 서버는 화면 종류를 직접 비교하지 않는다 (shared 의 isListScreen 을 쓴다)', () => {
        expect(devices).toMatch(/isListScreen\(screenContext\)/);
        expect(devices).not.toMatch(/screenContext === 'LIST'/);
    });

    it('🔴 완료 리스트도 "손을 뗀 화면"이다 — 이게 빠져서 사고가 났다', () => {
        expect(isListScreen('LIST')).toBe(true);
        expect(isListScreen('LIST_COMPLETED')).toBe(true);
        expect(LIST_SCREENS).toEqual(['LIST', 'LIST_COMPLETED']);
    });

    it('상세·팝업은 손을 뗀 것이 아니다 (여기서 정리하면 잡는 중인 콜이 날아간다)', () => {
        for (const s of ['DETAIL_PRE_CONFIRM', 'DETAIL_CONFIRMED', 'POPUP_PICKUP', 'POPUP_DROPOFF', 'POPUP_MEMO', 'POPUP_ERROR', 'UNKNOWN']) {
            expect(isListScreen(s)).toBe(false);
        }
        expect(isListScreen(undefined)).toBe(false);
        expect(isListScreen(null)).toBe(false);
    });

    it('🔴 앱이 리스트로 치는 화면과 서버가 인정하는 화면이 같다', () => {
        // 앱은 HijackService 에서 LIST · LIST_COMPLETED 를 복귀로 본다.
        // 한쪽만 늘어나면 그 화면이 다시 새어 나간다
        const hijack = readFileSync(join(APP, 'HijackService.kt'), 'utf8');
        const appList = ['LIST', 'LIST_COMPLETED']
            .filter(v => new RegExp(`ScreenContext\\.${v}\\b`).test(hijack));
        expect(appList.sort()).toEqual([...LIST_SCREENS].sort());
    });

    it('MANUAL 콜은 정리하지 않는다 — 규칙이다 (버그가 아니다)', () => {
        // CLAUDE.md: "MANUAL 콜은 심사하지 않는다 … 데스밸리도 LIST 이탈 정리도 없는 건 설계다"
        expect(devices).toMatch(/startsWith\("MANUAL"\)/);
    });
});

/**
 * 🔴 **안전망이 조건부면 안전망이 아니다.**
 *
 * 30초 강제 취소 타이머가 `if (session.activeFilter.isActive)` **안에** 있었다.
 * 그 블록은 자기가 `isActive` 를 끈다 — 필터가 꺼진 채로 들어온 확정(특히 MANUAL 콜)은
 * **감시자가 아예 없었다.**
 */
describe('가확정 콜의 안전망', () => {

    const orders = codeOnly(read('routes/orders.ts'));

    it('🔴 30초 타이머가 isActive 블록 밖에 있다', () => {
        const gate = orders.indexOf('if (session.activeFilter.isActive)');
        const timer = orders.indexOf('presecured_');
        expect(gate).toBeGreaterThan(-1);
        expect(timer).toBeGreaterThan(gate);
        // 게이트 블록이 타이머보다 먼저 닫힌다 = 타이머는 밖에 있다
        const between = orders.slice(gate, timer);
        expect(between).toMatch(/\n            \}/);
    });

    it('🔴 타이머 ID 를 저장한다 — 취소할 수 없는 타이머는 좀비가 된다', () => {
        expect(orders).toMatch(/session\.activeTimers\.set\(`presecured_/);
    });
});

/**
 * 🔴 **타이머 키 목록은 한 곳에만 있다.**
 * `warn_` · `timeout_` 을 세 파일이 각자 지우고 있었다. 네 번째 키를 더하는 순간
 * 한 곳만 고치면 나머지가 좀비로 남는 구조가 드러났다.
 */
describe('타이머 정리 — 키 목록은 한 곳', () => {

    const store = codeOnly(read('state/userSessionStore.ts'));

    it('clearOrderTimers 가 세 키를 모두 끈다', () => {
        const fn = store.slice(store.indexOf('export function clearOrderTimers'));
        expect(fn).toMatch(/'warn_'/);
        expect(fn).toMatch(/'timeout_'/);
        expect(fn).toMatch(/'presecured_'/);
        expect(fn).toMatch(/clearTimeout/);
    });

    it('🔴 키를 손으로 조립하는 곳이 없다 (타이머를 만드는 자리 하나만 예외)', () => {
        const offenders: string[] = [];
        for (const f of ['routes/scrap.ts', 'routes/emergency.ts', 'routes/detail.ts', 'services/dispatchEngine.ts']) {
            if (/activeTimers\.(get|delete)\(/.test(codeOnly(read(f)))) offenders.push(f);
        }
        expect(offenders).toEqual([]);
    });

    it('결재가 나면 그 콜의 타이머를 끈다 (이미 처리된 콜을 30초 뒤에 다시 건드리지 않게)', () => {
        const engine = codeOnly(read('services/dispatchEngine.ts'));
        const fn = engine.slice(engine.indexOf('export async function handleDecision'));
        expect(fn.slice(0, 800)).toMatch(/clearOrderTimers\(session, orderId\)/);
    });
});

/**
 * 🔴 **바뀐 게 없으면 안 보낸다** — 필터도 오더 동기화와 같은 규칙 (2026-08-14)
 *
 * `updateActiveFilter` 는 호출부가 22곳이고 불릴 때마다 broadcast 했다. KEEP 하나가
 * 내부적으로 여러 단계를 거치면 **관제웹이 중간 상태를 다 받는다** — 실측 54ms 안에 15번.
 * 관제웹은 그때마다 다시 그렸다.
 *
 * 이미 `isBootstrapping` 중에는 안 보내고 있었다("중간 상태를 내보내면 관제탑이 깜빡인다").
 * 같은 생각을 부트스트랩 밖까지 민 것이다.
 */
describe('브로드캐스트 — 바뀐 것만 보낸다', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const handlers = codeOnly(read('socket/socketHandlers.ts'));

    it('🔴 필터는 직전 전송본과 같으면 안 보낸다', () => {
        const fn = fm.slice(fm.indexOf('function broadcastFilter'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).toMatch(/json === session\.lastFilterJson/);
        expect(body).toMatch(/session\.lastFilterJson = json/);
    });

    it('🔴 오더 동기화도 마찬가지', () => {
        expect(handlers).toMatch(/json === session\.lastOrderSyncJson/);
    });

    it('🔴 새 화면이 붙으면 둘 다 무조건 한 번 보낸다 (자동 치유)', () => {
        const conn = handlers.slice(handlers.indexOf('socket.join(userId)'));
        expect(conn.slice(0, 600)).toMatch(/lastOrderSyncJson = null/);
        expect(conn.slice(0, 600)).toMatch(/lastFilterJson = null/);
    });
});

/**
 * 🔴 **로그는 setState updater 안에서 찍지 않는다.**
 * React StrictMode 가 updater 를 두 번 부른다 — 순수해야 할 함수에 부작용을 넣으면
 * **같은 줄이 두 번** 찍혀 화면이 "두 번 일어났다"고 잘못 말한다.
 */
describe('관제웹 로그 — updater 안에 부작용을 넣지 않는다', () => {

    it('setActiveOrders(prev => …) 안에 console.log 가 없다', () => {
        const src = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/hooks/useOrderEngine.ts'), 'utf8'));
        for (const m of src.matchAll(/setActiveOrders\(\s*(?:prev|\w+)\s*=>\s*\{([\s\S]*?)\n\s{12}\}\)/g)) {
            expect(m[1]).not.toMatch(/console\.log/);
        }
    });
});

/**
 * 🔴 **유령 카드의 쌍둥이 — 사냥이 죽은 채로 남던 문제** (2026-08-14 실측)
 *
 * 기사님이 자동으로 콜을 잡는 중에 앱을 손으로 만져 리스트로 빠져나왔다. 서버 로그:
 *      22:03:46  콜 선점 → isActive = false   (결재 날 때까지 다른 콜 안 물게 — 정상)
 *      22:04:07  🚀 화면 이탈 감지 → 강제 취소 → 카드 삭제        ✅
 *                🔴 그런데 isActive 를 되돌리지 않았다
 *      그 뒤     isActive = false 그대로 → **사냥이 죽은 채로 남았다**
 *
 * 카드는 사라졌으니 화면에는 아무 표시도 없다. 왜 콜이 안 잡히는지 알 방법이 없다 —
 * **유령 카드보다 나쁘다.**
 *
 * `isActive` 를 끄는 곳은 하나(`/orders/confirm`)인데 켜는 곳이 흩어져 있었고,
 * 결재를 거치지 않는 취소 경로 셋(화면 이탈·타임아웃·비상)이 그걸 빠뜨렸다.
 * → 취소 경로마다 켜지 않는다. **"선점 중인 콜이 없다"는 데이터에서 파생시킨다.**
 */
describe('사냥 재개 — 끄는 곳이 있으면 켜는 곳도 있다', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const engine = codeOnly(read('services/dispatchEngine.ts'));

    it('🔴 선점 중인 콜이 없으면 isActive 를 다시 켠다 (불변식)', () => {
        const inv = fm.slice(fm.indexOf('const evaluating ='), fm.indexOf('const derivedShared'));
        expect(inv).toMatch(/!session\.activeFilter\.isActive && evaluating\.length === 0/);
        expect(inv).toMatch(/isActive = true/);
    });

    it('🔴 종료된 콜은 "선점 중"이 아니다 — 캐시에는 종료 콜도 남아 있다', () => {
        // pendingOrdersData.size 로 세면 영영 0 이 안 된다 (buildOrderSync 가 거기서 terminated 를 뽑는다).
        // 2026-08-14 재현에서 이걸 틀려 한 번 헛돌았다
        const inv = fm.slice(fm.indexOf('const evaluating ='), fm.indexOf('const derivedShared'));
        expect(inv).toMatch(/!isTerminal\(o\.status\)/);
        expect(inv).not.toMatch(/pendingOrdersData\.size === 0/);
    });

    it('취소 경로가 각자 켜지 않는다 — 하나를 빠뜨리면 사냥이 죽는다', () => {
        const fn = engine.slice(engine.indexOf('export function forceCancelEvaluatingOrder'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).not.toMatch(/isActive: true/);
        expect(body).toMatch(/updateActiveFilter\(userId, \{\}, io\)/);   // 불변식만 태운다
    });
});

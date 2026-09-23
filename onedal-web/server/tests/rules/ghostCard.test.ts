import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { LIST_SCREENS, isListScreen } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const APP = join(__dirname, "../../../../onedal-app/app/src/main/java/com/onedal/app");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **유령 카드** — 앱은 리스트로 돌아갔는데 관제탑이 계속 기다리던 사고
 *
 * 기사님: *"앱이 콜을 잡아서 서버로 올리고 특정 사항으로 연산을 못할 때 앱은 기다리지 않고
 * 리스트로 돌아가는데, 관제앱은 계속 기다리는 버그가 있어. 이건 크리티컬한 버그야."*
 *
 * 🔴 **«리스트로 돌아왔다»는 앱과 서버가 한 정의를 쓴다** — 같은 판단을 두 곳에서 따로 정의하면 갈라진다.
 *   앱   — `LIST` · `LIST_COMPLETED` 둘 다 "리스트 복귀"로 보고 세션을 리셋한다
 *   서버 — 같은 목록(`isListScreen` · `LIST_SCREENS`)을 쓴다
 * 서버가 `LIST` 하나만 인정하면 완료 리스트로 빠져나갈 때 서버가 콜을 계속 쥐어, 관제탑 카드가 남고
 * `isActive` 도 꺼진 채라 **콜 잡기가 통째로 멈춘다.**
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
        // README 「이건 버그가 아니라 규칙이다」: 기사님이 직접 누른 콜(MANUAL)에는 안전취소 자동 취소를 걸지 않는다
        expect(devices).toMatch(/startsWith\("MANUAL"\)/);
    });
});

/**
 * 🔴 **안전망이 조건부면 안전망이 아니다.**
 *
 * 30초 강제 취소 타이머는 `if (session.activeFilter.isActive)` 블록 **밖에** 둔다.
 * 그 블록은 자기가 `isActive` 를 끈다 — 안에 두면 필터가 꺼진 채로 들어온 확정(특히 MANUAL 콜)은
 * **감시자가 아예 없다.**
 */
describe('가확정 콜의 안전망', () => {

    const orders = codeOnly(read('routes/orders.ts'));

    /**
     * 🔴 **재는 법이 바뀌었다 — 지키는 것은 그대로다.**
     *
     * 예전에는 «타이머가 `if (session.activeFilter.isActive)` 블록 **밖**에 있나»를 글자로 쟀다.
     * 그 블록이 선점 때 콜 잡기를 껐기 때문이다. 그런데 그 끄는 일 자체를 걷었다 —
     * `isActive=false` 는 「만석」이라는 뜻인데 「선점 중」까지 실으면 앱이 둘을 못 가려,
     * 목록에 콜이 보여도 판정조차 안 했다 (오송읍 셋에 3분 25초).
     *
     * 블록이 사라졌으니 «밖에 있나»는 잴 수 없다. 대신 **더 센 것**을 잰다 —
     * 그 조건문이 아예 없다. 조건이 없으면 안전망은 늘 걸린다.
     */
    it('🔴 30초 타이머를 막는 조건문이 없다 — 안전망이 조건부면 안전망이 아니다', () => {
        expect(orders).not.toContain('if (session.activeFilter.isActive)');
        expect(orders.indexOf('presecured_')).toBeGreaterThan(-1);
    });

    it('🔴 타이머 ID 를 저장한다 — 취소할 수 없는 타이머는 좀비가 된다', () => {
        expect(orders).toMatch(/session\.activeTimers\.set\(`presecured_/);
    });
});

/**
 * 🔴 **타이머 키 목록은 한 곳에만 있다.**
 * `warn_` · `timeout_` · `presecured_` 를 여러 파일이 각자 지우면, 새 키를 더할 때
 * 한 곳만 고쳐져 나머지가 좀비 타이머로 남는다. 그래서 `clearOrderTimers` 하나가 지운다.
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
 * 🔴 **바뀐 게 없으면 안 보낸다** — 필터도 오더 동기화와 같은 규칙
 *
 * `updateActiveFilter` 는 호출부가 여러 곳이다. 불릴 때마다 broadcast 하면 KEEP 하나가
 * 내부적으로 여러 단계를 거칠 때 **관제웹이 중간 상태를 다 받아** 그때마다 다시 그린다
 * (실측 54ms 안에 15번). 그래서 직전 전송본과 같으면 안 보낸다 —
 * `isBootstrapping` 중에 안 보내는 것("중간 상태를 내보내면 관제탑이 깜빡인다")과 같은 생각이다.
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
 * 🔴 **유령 카드의 쌍둥이 — 콜 잡기가 죽은 채로 남지 않게**
 *
 * 기사님이 자동으로 콜을 잡는 중에 앱을 손으로 만져 리스트로 빠져나오면 서버는 이렇게 간다:
 *      콜 선점 → isActive = false   (결재 날 때까지 다른 콜 안 물게 — 정상)
 *      🚀 화면 이탈 감지 → 강제 취소 → 카드 삭제
 *      여기서 isActive 를 되돌리지 않으면 → **콜 잡기가 죽은 채로 남는다**
 *
 * 카드는 사라졌으니 화면에는 아무 표시도 없다. 왜 콜이 안 잡히는지 알 방법이 없다 —
 * **유령 카드보다 나쁘다.**
 *
 * `isActive` 를 끄는 곳은 하나(`/orders/confirm`)인데 결재를 거치지 않는 취소 경로가
 * 셋(화면 이탈·타임아웃·비상)이다. 경로마다 켜면 하나를 빠뜨린다.
 * → **"선점 중인 콜이 없다"는 데이터에서 파생시킨다** (`updateActiveFilter` 의 불변식).
 */
describe('콜 잡기 재개 — 끄는 곳이 있으면 켜는 곳도 있다', () => {

    const fm = codeOnly(read('state/filterManager.ts'));
    const engine = codeOnly(read('services/dispatchEngine.ts'));

    it('🔴 선점 중인 콜이 없으면 isActive 를 다시 켠다 (불변식)', () => {
        const inv = fm.slice(fm.indexOf('const evaluating ='), fm.indexOf('const derivedShared'));
        expect(inv).toMatch(/!session\.activeFilter\.isActive && evaluating\.length === 0/);
        expect(inv).toMatch(/isActive = true/);
    });

    it('🔴 «심사 중»만 선점 중이다 — 종료 콜도, 보유(확정) 콜도 아니다', () => {
        // pendingOrdersData.size 로 세면 영영 0 이 안 된다 (buildOrderSync 가 거기서 terminated 를 뽑는다).
        // 🔴 «끝나지 않은 콜»(!isTerminal)로 세도 안 된다 (#80) —
        //    KEEP 된 콜은 캐시에 일부러 남으므로, 보유 중이면 불변식이 영영 안 돈다.
        //    행동 검사는 securedLockInvariant.test.ts 가 세 갈래로 지킨다.
        const inv = fm.slice(fm.indexOf('const evaluating ='), fm.indexOf('const derivedShared'));
        expect(inv).toMatch(/EVALUATING_STATUSES/);
        expect(inv).not.toMatch(/isTerminal/);
        expect(inv).not.toMatch(/pendingOrdersData\.size === 0/);
    });

    it('취소 경로가 각자 켜지 않는다 — 하나를 빠뜨리면 콜 잡기가 죽는다', () => {
        const fn = engine.slice(engine.indexOf('export function forceCancelEvaluatingOrder'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).not.toMatch(/isActive: true/);
        expect(body).toMatch(/updateActiveFilter\(userId, \{\}, io\)/);   // 불변식만 태운다
    });
});

/**
 * 🔴 **서버가 1번 보낸 것을 관제웹도 1번만 처리한다**
 *
 * `useFilterConfig()` 를 부르는 컴포넌트가 여럿이라, **훅마다 `socket.on` 을 걸면**
 * 달리는 동안 매초 동 179개짜리 페이로드로 `normalizePhaseSettings` + 스토어 갱신이
 * **컴포넌트 수만큼** 돈다 (실측: 브라우저 콘솔 `filter-updated` 5번 · 서버 `broadcastFilter` 1회).
 *
 * 서버에서 "바뀐 것만 보낸다"로 줄여도 **여기서 다시 불어난다** —
 * 그래서 구독은 스토어가 한 번 갖는다(`ensureFilterSocketSubscribed`). 훅은 읽기만 한다.
 */
describe('소켓 구독 — 컴포넌트 수만큼 늘어나지 않는다', () => {

    const CLIENT = join(__dirname, '../../../client-app/src');
    const rc = (rel: string) => codeOnly(readFileSync(join(CLIENT, rel), 'utf8'));

    it('🔴 훅은 filter 소켓을 직접 구독하지 않는다', () => {
        const hook = rc('hooks/useFilterConfig.ts');
        expect(hook).not.toMatch(/socket\.on\(/);
        expect(hook).toMatch(/ensureFilterSocketSubscribed\(\)/);
    });

    it('🔴 구독은 스토어에서 단 한 번 (두 번째 호출은 아무것도 안 한다)', () => {
        const store = rc('stores/filterStore.ts');
        const fn = store.slice(store.indexOf('export function ensureFilterSocketSubscribed'));
        expect(fn).toMatch(/if \(subscribed\) return;/);
        expect(fn).toMatch(/subscribed = true;/);
        expect(fn).toMatch(/socket\.on\('filter-init'/);
        expect(fn).toMatch(/socket\.on\('filter-updated'/);
    });

    /**
     * 이 훅은 컴포넌트 5개가 쓴다. 그 수가 문제가 아니라 **훅이 구독을 갖는 것**이 문제다.
     * 다른 훅이 같은 실수를 하면 여기서 걸린다.
     */
    it('🔴 여러 컴포넌트가 쓰는 훅은 socket.on 을 갖지 않는다', () => {
        const files: string[] = [];
        const walk = (d: string) => {
            for (const e of readdirSync(d)) {
                const p = join(d, e);
                if (statSync(p).isDirectory()) walk(p);
                else if (/\.tsx?$/.test(e)) files.push(p);
            }
        };
        walk(CLIENT);

        const offenders: string[] = [];
        for (const f of files.filter(f => /\/hooks\/use\w+\.tsx?$/.test(f))) {
            if (!/socket\.on\(/.test(codeOnly(readFileSync(f, 'utf8')))) continue;
            const name = f.split('/').pop()!.replace(/\.tsx?$/, '');
            const users = files.filter(o => o !== f && new RegExp(`\\b${name}\\s*\\(`).test(readFileSync(o, 'utf8')));
            if (users.length > 1) offenders.push(`${name} — 컴포넌트 ${users.length}개가 쓴다`);
        }
        expect(offenders).toEqual([]);
    });
});

/**
 * 🔴 **한 컴포넌트가 터져도 관제탑 전체가 죽지 않는다**
 *
 * 에러 경계가 없으면 렌더 중 예외 하나에 React 가 트리를 통째로 걷어내 화면이 하얘진다 —
 * `PinnedRoute` 하나가 터져도 관제탑 전부가 죽는다. 그래서 결재 카드를 `ErrorBoundary` 로 감싼다.
 *
 * 기사님이 운행 중이면 그 화면이 **KEEP/CANCEL 결재를 하는 유일한 창구**다.
 * 죽으면 잡아 둔 콜을 어떻게 할 방법이 없다 — 안전 문제다.
 */
describe('관제탑 — 한 곳이 터져도 전체가 죽지 않는다', () => {

    const CLIENT2 = join(__dirname, '../../../client-app/src');
    const rc2 = (rel: string) => codeOnly(readFileSync(join(CLIENT2, rel), 'utf8'));

    it('🔴 결재 카드에 에러 경계가 있다', () => {
        const dash = rc2('pages/Dashboard.tsx');
        expect(dash).toMatch(/<ErrorBoundary label="결재 카드">[\s\S]*?<StageView[\s\S]*?<\/ErrorBoundary>/);
    });

    it('🔴 경계가 예외를 삼키지 않는다 — 콘솔에 원래 예외를 남긴다', () => {
        const eb = rc2('components/common/ErrorBoundary.tsx');
        expect(eb).toMatch(/componentDidCatch/);
        expect(eb).toMatch(/console\.error\(/);
        expect(eb).toMatch(/info\.componentStack/);
    });

    it('🔴 되살릴 수단을 준다 — 조용히 빈 화면으로 두지 않는다', () => {
        const eb = rc2('components/common/ErrorBoundary.tsx');
        expect(eb).toMatch(/다시 그리기/);
        expect(eb).toMatch(/window\.location\.reload\(\)/);
        expect(eb).toMatch(/error\.message/);      // 무엇이 터졌는지 보여준다
    });
});

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🚫 **취소 예산 10회 — 다 쓰면 알리고 새 차례를 연다** (기사님 확정)
 *
 * 기사님: *"화면에 인성 47/10 이 떠 있습니다. 10회가 되면 토스트 알림주고 리셋해줘."*
 *
 * 🔴 **`47/10` 은 화면이 이미 무의미해진 상태다.** 한도를 네 배 넘긴 숫자는
 *    *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다 — 그냥 커지기만 한다.
 *
 * ⚠️ 원칙 *"취소 10회는 **리셋되지 않는다**"* 의 취지는 **총량이 사라지면 안 된다**는 것이다 (페널티는 못 피하는
 *    영업 비용이고, 소진 속도가 "필터를 조여라"의 신호다).
 *
 * 🔴 그래서 **지우지 않고 차례를 나눈다:**
 *      · 한 차례 = 10회. 다 쓰면 **알리고** 새 차례가 열린다
 *      · **차례 수가 남으므로 총량은 사라지지 않는다** (로그의 `3/10 · 2판째` = 지금까지 13회)
 *    둘 다 산다 — 화면은 다시 뜻을 갖고, 총량도 보인다.
 *
 * ⚠️ 저장하는 것은 **리셋 시각 하나**다. 카운트는 여전히 장부에서 센다 (규칙 ③) —
 *    리셋은 *사건*이고 카운트는 *파생값*이다. 파생값을 저장하면 갈라진다.
 */

const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const shared = () => readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8');
const client = (p: string) => readFileSync(join(__dirname, '../../../client-app/src', p), 'utf8');

describe('🚫 한도는 한 곳에서 정한다', () => {
    /**
     * 🔴 한도는 shared 의 `CANCEL_BUDGET_PER_ROUND` 하나다 — 관제웹 문자열에 박지 않는다.
     *    서버가 판정하려면(`cancelCount.ts`) 관제웹과 같은 값을 봐야 한다 — 두 벌이면 갈라진다 (규칙 ⑤-4 ①).
     */
    it('🔴 취소 한도가 shared 에 있다 (화면 문자열에 박아 두지 않는다)', () => {
        expect(code(shared())).toMatch(/CANCEL_BUDGET_PER_ROUND/);
    });

    /**
     * 🔴 필터 상황판에는 **상시 취소 카운트도, 소진 토스트도 없다** (기사님: «인성 4/10 필요 없어» ·
     *    *"취소한도 토스트는 빼 그건 폰마다 배차망마다 다르기때문에 다른곳에서 해야 할것같다"*).
     *    필터 상황판은 모든 폰에 똑같이 내려가는 **한 벌**을 말하는 줄이라, 폰·배차망마다 다른 값은 맞지 않는다.
     *    알림을 들을 자리는 남겨 둔다(아래 «그 알림을 듣는다»).
     */
    it('🔴 필터 상황판에는 취소 한도 토스트가 없다 (폰·배차망마다 달라 다른 자리에서)', () => {
        expect(code(client('components/dashboard/OrderFilterStatus.tsx')))
            .not.toMatch(/budgetToast/);
    });
});

describe('🚫 다 쓰면 알리고 새 판을 연다', () => {
    it('🔴 리셋 시각을 담을 자리가 있다 (카운트가 아니라 시각을 저장한다)', () => {
        expect(code(read('db.ts'))).toMatch(/cancel_budget_resets/);
    });

    /**
     * 🔴 카운트는 **리셋 이후 것만** 센다. 안 그러면 리셋해도 숫자가 그대로다.
     */
    it('🔴 취소 집계가 리셋 시각 이후만 센다', () => {
        const h = code(read('core/helpers.ts'));
        const i = h.indexOf("status = 'SAFE_CANCEL'");
        expect(i).toBeGreaterThan(-1);
        expect(h.slice(Math.max(0, i - 400), i + 400)).toMatch(/resetAt|reset_at/);
    });

    /**
     * 🔴 **차례 수가 남아야 총량이 안 사라진다** — "리셋 없음" 원칙의 취지를 지키는 자리다.
     */
    it('🔴 몇 판째인지 함께 내보낸다 (총량이 사라지지 않게)', () => {
        expect(code(read('core/helpers.ts'))).toMatch(/cancelRounds/);
        expect(code(shared())).toMatch(/cancelRounds/);
    });

    /** 🔴 판정도 **세는 자리에서** 한다 — 호출부 넷이 각자 보면 갈라진다 */
    it('🔴 한도에 닿으면 관제탑에 알린다 (세는 자리에서 판정한다)', () => {
        expect(code(read('core/cancelCount.ts'))).toMatch(/cancel-budget-reached/);
    });

    it('🔴 관제웹이 그 알림을 듣고 토스트를 띄운다', () => {
        const c = code(client('hooks/useOrderEngine.ts')) + code(client('components/dashboard/OrderFilterStatus.tsx'));
        expect(c).toMatch(/cancel-budget-reached/);
    });
});

/**
 * 🧮 **한 콜은 한 번만 센다** (기사님 · 실주행에서 잡힘)
 *
 * 콜이 끝나는 길이 여럿이라 **같은 콜을 두 길이 각각 셌다.** 실측 —
 *   서버 안전취소 타이머가 `handleDecision(SAFE_CANCEL)` → 취소 +1,
 *   3초 뒤 앱이 그 취소를 받고 `/api/emergency` 로 보고 → 취소 +1.
 *
 * 🔴 **두 번째다.** `dispatchEngine` 머리에 «셈은 여기 한 번이다 — 타임아웃 경로가 이 함수 뒤에
 *    countCancel 을 또 불러 보통 콜을 두 번 셌다» 고 적혀 있다. 그때는 한 경로를 고쳤고,
 *    오늘은 다른 경로로 또 났다. **조건을 더하는 방식으로는 또 샌다.**
 *
 * 🔴 그래서 **세는 자리가 스스로 «이미 셌나»를 안다.** 부르는 곳이 몇이든, 앞으로 늘어도 안전하다.
 */
describe('🧮 한 콜은 한 번만 센다 — 부르는 곳이 여럿이어도', () => {

    const makeSession = () => ({
        userId: 'u1', pendingOrdersData: new Map<string, any>(), myOrders: [] as any[],
        countedOnce: new Set<string>(),
    });

    it('🔴 세션에 «이미 센 콜» 칸이 있다', () => {
        expect(code(read('state/userSessionStore.ts'))).toMatch(/countedOnce/);
    });

    it('🔴 취소를 세는 자리가 그 칸을 본다', () => {
        expect(code(read('core/cancelCount.ts'))).toMatch(/countedOnce/);
    });

    it('🔴 같은 콜을 두 길로 취소해도 한 번만 센다', () => {
        const { countCancel } = require('../../src/core/cancelCount');
        const { incrementDeviceStats } = require('../../src/routes/devices');
        const session = makeSession();
        countCancel(session as any, 'dev1', 'order-A', 'DECISION_CANCEL');
        countCancel(session as any, 'dev1', 'order-A', 'AUTO_CANCEL');
        /* 🔴 셈 자체는 기기 세션에 쌓이므로 여기서는 «두 번째가 돌아섰나»를 그릇으로 잰다 */
        expect([...session.countedOnce].filter(k => k.includes('order-A')).length).toBe(1);
        expect(typeof incrementDeviceStats).toBe('function');
    });

    it('🔴 다른 콜은 각각 센다 — 막는 것이 과하면 한도가 거짓말한다', () => {
        const { countCancel } = require('../../src/core/cancelCount');
        const session = makeSession();
        countCancel(session as any, 'dev1', 'order-A', 'DECISION_CANCEL');
        countCancel(session as any, 'dev1', 'order-B', 'DECISION_CANCEL');
        expect(session.countedOnce.size).toBe(2);
    });

    it('🔴 수락도 같은 문을 지난다 — 지금은 부르는 곳이 하나지만 늘면 같은 병이 난다', () => {
        const { countKeep } = require('../../src/core/cancelCount');
        const session = makeSession();
        countKeep(session as any, 'dev1', 'order-A');
        countKeep(session as any, 'dev1', 'order-A');
        expect([...session.countedOnce].filter(k => k.includes('order-A')).length).toBe(1);
    });

    it('🔴 취소와 수락은 서로를 막지 않는다 — 한 콜이 수락됐다가 취소될 수 있다', () => {
        const { countCancel, countKeep } = require('../../src/core/cancelCount');
        const session = makeSession();
        countKeep(session as any, 'dev1', 'order-A');
        countCancel(session as any, 'dev1', 'order-A', 'DECISION_CANCEL');
        expect(session.countedOnce.size).toBe(2);
    });
});

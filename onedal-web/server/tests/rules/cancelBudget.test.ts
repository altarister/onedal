import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🚫 **취소 예산 10회 — 다 쓰면 알리고 새 판을 연다** (기사님 확정 2026-08-23)
 *
 * 기사님: *"화면에 인성 47/10 이 떠 있습니다. 10회가 되면 토스트 알림주고 리셋해줘."*
 *
 * 🔴 **`47/10` 은 화면이 이미 무의미해진 상태다.** 한도를 네 배 넘긴 숫자는
 *    *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다 — 그냥 커지기만 한다.
 *
 * ⚠️ docs/지금/필터.md §6 는 *"취소 10회는 **리셋되지 않는다**"* 로
 *    적혀 있었다. 그 취지는 **총량이 사라지면 안 된다**는 것이다 (페널티는 못 피하는
 *    영업 비용이고, 소진 속도가 "필터를 조여라"의 신호다).
 *
 * 🔴 그래서 **지우지 않고 판을 나눈다:**
 *      · 한 판 = 10회. 다 쓰면 **알리고** 새 판이 열린다
 *      · **판수가 남으므로 총량은 사라지지 않는다** (`3/10 · 2판째` = 지금까지 13회)
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
     * 🔴 지금은 `/10` 이 관제웹 문자열에 **박혀** 있고 서버는 한도를 아예 모른다.
     *    서버가 판정하려면 같은 값을 봐야 한다 — 두 벌이면 갈라진다 (규칙 ⑤-4 ①).
     */
    it('🔴 취소 한도가 shared 에 있다 (화면 문자열에 박아 두지 않는다)', () => {
        expect(code(shared())).toMatch(/CANCEL_BUDGET_PER_ROUND/);
    });

    it('🔴 관제웹이 그 값을 쓴다 (10 을 다시 적지 않는다)', () => {
        expect(code(client('components/dashboard/OrderFilterStatus.tsx')))
            .toMatch(/CANCEL_BUDGET_PER_ROUND/);
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
     * 🔴 **판수가 남아야 총량이 안 사라진다** — 문서의 "리셋 없음" 취지를 지키는 자리다.
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

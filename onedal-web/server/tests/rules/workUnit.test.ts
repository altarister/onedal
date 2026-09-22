import { readFileSync } from "fs";
import { join } from "path";
import { TERMINAL_STATUSES, isTerminal } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **관제앱은 업무 단위다 — 정산 단위가 아니다** (기사님 결정)
 *
 * *"관제앱은 업무단위로 보는 것이 맞고, 정산은 관제앱에서 만들어진 데이터로
 * **정산 페이지에서 따로** 컨트롤하는 것이 맞을 듯하다."*
 *
 * 코드에는 **완료를 뜻하는 이름이 둘**이다.
 *   `ORDER_DELIVERED`  — 마일스톤이 만드는 **살아 있는** 상태
 *   `ORDER_COMPLETED`  — 관제앱에서는 만드는 곳이 없는 상태 (정산 페이지 자리)
 *
 * 매출 집계는 **`ORDER_DELIVERED`** 를 센다. 도달하지 않는 쪽을 세면 실측
 *      하차 완료 13건 · 1,258,000원  →  집계 **0건 · 0원**
 * 이 된다 — **일을 끝낼수록 오늘 매출이 사라진다.**
 */
describe('매출은 업무 단위로 센다', () => {

    const stat = codeOnly(read('services/statService.ts'));

    it('🔴 하차를 마친 콜(ORDER_DELIVERED)을 센다', () => {
        const queries = [...stat.matchAll(/status IN \(([^)]*)\)/g)].map(m => m[1]);
        expect(queries.length).toBeGreaterThan(0);
        for (const q of queries) {
            expect(q).toContain('ORDER_DELIVERED');
            // 확정만 하고 아직 안 내린 콜은 매출이 아니다 (업무가 안 끝났다)
            expect(q).not.toContain('ORDER_CONFIRMED');
        }
    });

    /**
     * 영업일 기준은 **하차 시각**이다 — 기사님 결정:
     * *"그냥 하차시간을 기준으로 24시를 기준으로."* (`shared/timing.ts` businessDayKey)
     *
     * 잡은 시각(`capturedAt`)으로 세면 **어제 잡아 오늘 배달한 콜이 어제 매출**이 된다.
     * 기사님: *"어제 잡은 콜을 오늘 아침에 배달하는 경우가 흔할 거니까."*
     */
    it('🔴 잡은 날이 아니라 **내린 날**로 센다', () => {
        expect(stat).toMatch(/completedAt LIKE/);
        expect(stat).not.toMatch(/capturedAt LIKE/);
    });
});

/**
 * 🔴 **아무도 안 쏘는 문은 열어 두지 않는다**
 *
 * `update-my-location` · `dispatch-complete` 는 관제웹·앱 어디도 쏘지 않는다.
 * 열려 있으면 각각 `session.origin` 을 직접 덮어쓰고(→ 지나온 구간 제거·도착 감지 우회)
 * 콜을 완료 처리한다(→ 마일스톤 시퀀스 우회).
 *
 * `pnpm audit:socket` 은 서버 `emit` ↔ 관제웹 `on` 을 대조하므로 **서버 on → 아무도 emit 안 함**은
 * 못 잡는다 — 그래서 여기서 문다.
 */
describe('열린 문 — 상태를 바꾸는 통로는 하나뿐이다', () => {

    const handlers = codeOnly(read('socket/socketHandlers.ts'));
    const engine = codeOnly(read('services/dispatchEngine.ts'));

    it('🔴 죽은 문 둘이 없다', () => {
        expect(handlers).not.toMatch(/["']update-my-location["']/);
        expect(handlers).not.toMatch(/["']dispatch-complete["']/);
    });

    it('🔴 위치가 들어오는 문은 하나 — 반드시 processDriverMovement 를 탄다', () => {
        const sets = [...handlers.matchAll(/session\.origin\s*=/g)];
        expect(sets.length).toBe(0);                       // 핸들러가 직접 쓰지 않는다
        expect(handlers).toMatch(/dashboard-gps-update/);
        expect(handlers).toMatch(/processDriverMovement\(/);
    });

    it('🔴 두 번째 완료 구현(completeOrder)이 없다', () => {
        expect(engine).not.toMatch(/function completeOrder/);
    });

    it('ORDER_COMPLETED 는 타입에 남는다 — 정산 페이지가 쓸 자리다', () => {
        // 지우지 않는다. 기사님 결정: 관제앱=업무, 정산=별도 페이지
        expect(TERMINAL_STATUSES).toContain('ORDER_COMPLETED');
        expect(isTerminal('ORDER_COMPLETED')).toBe(true);
    });
});

/**
 * 🔴 **종결 상태 목록을 손으로 적지 않는다.**
 * 손으로 적으면 빠지는 것이 생긴다 — `emergency.ts` 목록에서 `ORDER_DELIVERED` 가 빠지면
 * 비상 보고 때 **하차를 마친 콜을 아직 실려 있다고 센다.** 그래서 `isTerminal` 한 곳을 쓴다.
 */
describe('종결 판정은 한 곳', () => {
    it('🔴 상태 배열을 손으로 만들어 includes 하지 않는다', () => {
        const offenders: string[] = [];
        for (const f of ['routes/emergency.ts', 'routes/orders.ts', 'routes/detail.ts',
                         'routes/scrap.ts', 'services/dispatchEngine.ts', 'state/filterManager.ts']) {
            const src = codeOnly(read(f));
            if (/\[\s*'ORDER_\w+'\s*,[^\]]*\]\.includes\(/.test(src)) offenders.push(f);
        }
        expect(offenders).toEqual([]);
    });

    it('emergency 는 isTerminal 을 쓴다', () => {
        expect(codeOnly(read('routes/emergency.ts'))).toMatch(/!isTerminal\(c\.status\)/);
    });
});

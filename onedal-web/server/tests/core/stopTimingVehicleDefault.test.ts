import db from '../../src/db';
import { getStopTiming, totalDetourCost } from '../../src/core/helpers';

/**
 * 🚚 **차종을 알면 짐을 안다 — 판정이 「모른다」고 하면 안 된다** (기사님 지적 2026-08-29)
 *
 * 기사님: *"그걸 왜 모른다고 하지 자꾸? 콜을 잡을 때 **다마스를 불렀다면 기본적으로
 * 박스 30개**라고 묵시적으로 알 수 있다고 한 것 같은데.. 싣는 게 박스니까 수작업일 거고,
 * 박스당 상하차 시간은 우리 계산식 있으니 시간 나올 거고.. **모르는 게 있다는 것이
 * 버그 아닐까?**"*
 *
 * ── 무엇이 문제였나 ──
 *
 * `getStopTiming` 은 **단계 장부에 태어난 행만** 읽었다. 그런데 행은 KEEP 해야 태어난다
 * (`birthFirstStep`). **판정은 KEEP 하기 전에 난다** — 색을 보고 KEEP 을 누르니까.
 * 그래서 판정 시점에는 장부가 늘 비어 있었고, 정차 시간이 언제나
 * 「미확인 일반값」(상차 15분·하차 10분)으로 떨어졌다.
 *
 * 🔴 **차종은 그 전부터 알고 있었다.** 앱이 콜을 집을 때 이미 실려 온다.
 *    `defaultCargoByVehicle` 이 차종에서 단위·수량·방법을 뽑고, 시딩(`stepSeeder`)은
 *    그 값을 이미 쓴다 — **정차 시간 계산만 안 쓴 것**이다 (규칙 ③: 같은 값을 한 곳에서).
 *
 * ── 무엇이 달라지나 (실측 2026-08-29) ──
 *
 * | 차종 | 짐 | 상차 | 하차 | 합 | 옛 일반값(25분)과 |
 * |---|---|---|---|---|---|
 * | 승용차 | 라면박스 5 · 수작업 | 6 | 3 | **9분** | 16분 **과대**했다 |
 * | 1t | 파레트 2 · 지게차 | 8 | 5 | **13분** | 12분 **과대**했다 |
 * | 다마스 | 라면박스 30 · 수작업 | 14 | 11 | **25분** | 우연히 같다 |
 * | 2.5t | 파레트 6 · 지게차 | 16 | 13 | **29분** | 4분 과소 |
 * | 라보 | 라면박스 40 · 수작업 | 17 | 14 | **31분** | 6분 과소 |
 * | 5t | 파레트 12 · 지게차 | 30 | 27 | **57분** | 32분 **과소**했다 |
 *
 * ⚠️ **1t 이 다마스보다 빠르다** — 파레트는 지게차로 뜨고 박스는 손으로 나른다.
 *    옛 일반값은 그 차이를 통째로 지웠다.
 *
 * 🔴 **방향이 차종마다 다르다** — "늘 나쁘게 나왔다"가 아니다. 1t 은 지게차라 빠른데
 *    수작업 일반값을 물려 **우회가 비싸 보였고**, 5t 은 반대로 **싸 보였다.**
 *    색이 곧 결정이므로(규칙 ⑤-3) 양쪽 다 사고다.
 *
 * ⚠️ **다마스가 우연히 25분으로 같다는 것**이 이 버그가 오래 산 이유일 수 있다.
 *    가장 흔한 차종에서 티가 안 났다.
 */

const ID = 'TEST-DWELL-VEHICLE';
const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;

const putOrder = (vehicleType: string | null) => {
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID);
    const row: Record<string, any> = {
        id: ID, userId: USER, status: 'ORDER_CONFIRMED',
        timestamp: '2026-08-29T00:00:00Z', capturedAt: '2026-08-29T00:00:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
        vehicleType,
    };
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map(c => row[c]));
};

afterAll(() => { db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID); });

const maybe = USER ? describe : describe.skip;   // 빈 DB 에서는 건너뛴다

/**
 * 🔴 **진짜 판정 시점에는 `orders` 행조차 없다** (2026-08-29 · 첫 수정이 헛돌아서 잡음).
 *
 * `upsertOrder` 는 **KEEP 할 때**(`handleDecision`) 돈다. 판정은 그 전이다 —
 * 기사님은 색을 보고 KEEP 을 누르니까. 그래서 DB 만 보고 고치면 **검사는 초록불인데
 * 실제 판정은 그대로 「모른다」**가 된다. 실제로 그랬다: 시나리오 14번(승용차)에
 * 「정차 미확인(일반값)」 딱지가 그대로 붙어 있었다.
 *
 * → 판정 경로는 **메모리의 콜 객체**를 넘긴다. 아래 검사가 그 경로다.
 */
maybe('🔴 KEEP 전 — DB 에 행이 없다. 메모리의 콜로 잰다', () => {
    const 메모리콜 = (vehicleType: string | null) => ({
        id: 'NOT-IN-DB', userId: USER, vehicleType,
        capturedAt: '2026-08-29T00:00:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
    });

    it('DB 에 없는 콜도 차종만 있으면 잰다 — 1t 13분', () => {
        const t = getStopTiming('NOT-IN-DB', undefined, 메모리콜('1t'));
        expect(t.hasUnknown).toBe(false);
        expect(t.totalDwell).toBe(13);
    });

    it('넘기지 않으면 못 잰다 — 그래서 판정이 「모른다」였다', () => {
        const t = getStopTiming('NOT-IN-DB');
        expect(t.hasUnknown).toBe(true);
        expect(t.totalDwell).toBe(25);
    });

    it('우회 비용도 메모리 콜로 잰다 — 판정이 실제로 부르는 것', () => {
        expect(totalDetourCost(20, 'NOT-IN-DB', undefined, 메모리콜('5t')).total).toBe(77);
    });
});

maybe('판정 시점의 정차 시간 — 신고가 없어도 차종에서 나온다', () => {
    it('🔴 다마스 콜은 KEEP 전에도 「모른다」가 아니다', () => {
        putOrder('다마스');
        const t = getStopTiming(ID);
        expect(t.hasUnknown).toBe(false);
    });

    it('🔴 1t 은 파레트·지게차라 13분 — 일반값 25분이 아니다', () => {
        putOrder('1t');
        const t = getStopTiming(ID);
        expect([t.pickupDwell, t.dropoffDwell, t.totalDwell]).toEqual([8, 5, 13]);
    });

    it('🔴 5t 은 파레트가 열둘이라 57분 — 일반값의 두 배가 넘는다', () => {
        putOrder('5t');
        expect(getStopTiming(ID).totalDwell).toBe(57);
    });

    it('🔴 차종이 다르면 정차도 다르다 — 예전에는 전부 25분으로 같았다', () => {
        const 잰다 = (v: string) => { putOrder(v); return getStopTiming(ID).totalDwell; };
        expect(new Set([잰다('1t'), 잰다('다마스'), 잰다('라보'), 잰다('5t')]).size)
            .toBeGreaterThan(1);
    });

    /**
     * ⚠️ 다마스는 **우연히** 일반값과 같은 25분이 나온다 (14+11 vs 15+10).
     *    가장 흔한 차종에서 티가 안 나는 것이 이 버그가 오래 산 이유일 수 있다.
     *    그래도 **상차·하차 나눈 값은 다르다** — 합만 보면 못 잡는다.
     */
    it('다마스는 합이 우연히 같다 — 그래도 상·하차는 다르다', () => {
        putOrder('다마스');
        const t = getStopTiming(ID);
        expect(t.totalDwell).toBe(25);                       // 일반값과 같은 합
        expect([t.pickupDwell, t.dropoffDwell]).toEqual([14, 11]);   // 일반값은 15·10 이다
    });

    /**
     * 🔴 **차종조차 못 읽은 콜은 여전히 「모른다」다.** 규칙 ④ — 없는 숫자를 지어내지 않는다.
     *    이때만 일반값(15·10)으로 돌고, 화면에 「정차 미확인(일반값)」이 붙는다.
     */
    it('차종을 못 읽었으면 그때는 정말 모른다 — 일반값 15·10', () => {
        putOrder(null);
        const t = getStopTiming(ID);
        expect(t.hasUnknown).toBe(true);
        expect([t.pickupDwell, t.dropoffDwell]).toEqual([15, 10]);
    });

    it('우회 비용도 같이 움직인다 — 판정이 쓰는 것은 이 값이다', () => {
        putOrder('1t');
        const 차종앎 = totalDetourCost(20, ID);
        putOrder(null);
        const 차종모름 = totalDetourCost(20, ID);
        // 1t 은 지게차라 빠르다 — 옛 일반값은 우회를 **12분 비싸게** 보여 줬다
        expect(차종앎.total).toBe(33);      // 주행 20 + 정차 13
        expect(차종모름.total).toBe(45);    // 주행 20 + 일반값 25
        expect(차종앎.hasUnknown).toBe(false);
        expect(차종모름.hasUnknown).toBe(true);
    });
});

import db from '../../src/db';
import { ensureBusinessDay } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🌅 **자정을 걸친 사이클 — 어제 하차분은 오늘 화면에 남지 않는다** (2026-08-22 실측)
 *
 * `deckOfCycle` 규칙(기사님 확정 2026-08-19)은 *"진행 중이 하나라도 남으면 하차한
 * 콜도 함께 보여준다"* — 6단계 채워진 모습을 보기 위한 **화면 규칙**이다. 그런데
 * 사이클이 자정을 걸치면(운행 중 2콜을 남기고 잠들면) 어제 하차한 3콜이 오늘 아침
 * "진행 중 (5)" 로 계속 보였다 — 성과 기록은 어제로 닫혔는데 화면만 어제를 산다.
 *
 * 답은 이미 있는 규칙이다: **"어제 상태가 오늘 되살아나지 않는다"** (영업일 전환).
 * 재부팅 복구는 이미 영업일 기준으로 거른다 — 구멍은 자정을 넘겨 살아 있는
 * 메모리 세션뿐이고, 그 정리는 영업일 전환(ensureBusinessDay)의 일이다.
 *
 * 🔴 지킬 선: 정리는 **하차 완료된 콜의 화면 재료(메모리)만**이다.
 *    - 미하차 콜은 절대 건드리지 않는다 (규칙 ① — KEEP 된 콜은 버리지 않는다)
 *    - 오늘 새벽에 하차한 콜은 남는다 (오늘 사이클의 "한 일" — completedAt 이 가른다)
 *    - orders 장부·매출·운행일지는 여기와 무관하게 이미 맞다 (상태는 콜별 즉시)
 */

const U = 'midnight-cycle-test-user';

/**
 * 🔴 **날짜를 박아 두지 않는다** (2026-08-23 회귀로 발견).
 *
 * 예전에는 `'2026-08-22'` 를 "오늘"이라 적어 뒀다. 하루가 지나자 그 콜이 진짜로
 * *"어제 하차분"* 이 되어 정리됐고, **서버는 옳게 동작하는데 검사만 빨간불**이 됐다.
 * 검사가 시간에 따라 뜻이 달라지면 진짜 회귀와 구분할 수가 없다.
 *
 * `ensureBusinessDay` 가 보는 것과 **같은 오늘**(KST 기준)에서 거꾸로 센다.
 */
const KST_MS = 9 * 60 * 60 * 1000;
/** 오늘 KST 자정(UTC 기준 시각) */
const todayMidnightMs = (() => {
    const nowKst = new Date(Date.now() + KST_MS);
    return Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) - KST_MS;
})();
const at = (dayOffset: number, h: number) =>
    new Date(todayMidnightMs + dayOffset * 86400000 + h * 3600000).toISOString();

const yday = (h: number) => at(-1, h);    // 어제 h 시 (KST)
const today = (h: number) => at(0, h);    // 오늘 h 시 (KST)

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`)
      .run(U, `g-${U}`, 'cycle@test', '자정사이클검사');
    const ins = db.prepare(`INSERT OR REPLACE INTO orders
        (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, completedAt)
        VALUES (?, 'NEW_ORDER', ?, ?, ?, ?, '상', '하', 10000, 'insung', ?)`);
    ins.run(`${U}-ydone`, 'ORDER_DELIVERED', U, yday(21), yday(21), yday(22));   // 어제 하차
    ins.run(`${U}-tdone`, 'ORDER_DELIVERED', U, yday(21), yday(21), today(5));   // 어제 잡고 오늘 새벽 하차
    ins.run(`${U}-live`, 'ORDER_PICKED_UP', U, yday(21), yday(21), null);        // 미하차 — 절대 안 건드림
});

afterAll(() => {
    db.prepare(`DELETE FROM filter_day_results WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_filter_phases WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM user_filters WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM user_judgment WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

it('🔴 영업일 전환이 어제 하차분만 화면 사이클에서 정리한다 — 오늘 하차분·미하차는 남는다', () => {
    const session = getUserSession(U);
    const mem = (id: string, status: string) => ({ id: `${U}-${id}`, status, capturedAt: yday(21) }) as any;
    session.myOrders = [mem('ydone', 'ORDER_DELIVERED'), mem('tdone', 'ORDER_DELIVERED'), mem('live', 'ORDER_PICKED_UP')];
    for (const o of session.myOrders) session.pendingOrdersData.set(o.id, o);
    session.businessDay = yday(0).slice(0, 10);  // 어제 날짜 — 자정을 걸쳐 살아 있던 세션

    const switched = ensureBusinessDay(U);
    expect(switched).toBe(true);

    const ids = session.myOrders.map(o => o.id);
    expect(ids).not.toContain(`${U}-ydone`);     // 어제 하차 — 오늘 화면에서 빠진다
    expect(ids).toContain(`${U}-tdone`);         // 오늘 새벽 하차 — 오늘 사이클의 "한 일"
    expect(ids).toContain(`${U}-live`);          // 미하차 — 규칙 ①
    expect(session.pendingOrdersData.has(`${U}-ydone`)).toBe(false);
    expect(session.pendingOrdersData.has(`${U}-live`)).toBe(true);
});

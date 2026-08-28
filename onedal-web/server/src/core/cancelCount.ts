import { incrementDeviceStats } from "../routes/devices";
import db from "../db";
import { CANCEL_BUDGET_PER_ROUND } from "@onedal/shared";

/**
 * 🧮 **취소를 세는 자리는 여기 하나다** (2026-08-22 · 미리보기 콜과 함께 신설).
 *
 * 취소 카운트는 **배차망 10회 패널티**를 세는 값이다 (용어집 §2-1). 한 건도 새면 안 되고,
 * **없던 취소를 세도 안 된다.**
 *
 * 🔴 예전에는 네 곳(`dispatchEngine` ×2 · `detail` · `emergency`)이 각자
 *    `incrementDeviceStats(…, "canceled")` 를 불렀다. 조건을 하나 더하려면 네 번 적어야 했고,
 *    그러면 한쪽만 고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다
 *    (경유 4벌 · 상태목록 3벌 · 타이머 키 4벌).
 *
 * 👀 **미리보기 콜은 세지 않는다.** 기사님이 확정을 누르기 전에 판정만 받아 본 콜이라
 *    **인성에서는 아무 일도 일어나지 않았다.** 취소할 것이 없는데 우리 장부에만 쌓이면
 *    화면이 거짓말을 한다 (2026-08-22 실측: 하루에 5건이 그렇게 쌓였다).
 */
export function countCancel(
    session: { pendingOrdersData: Map<string, any>; myOrders: any[]; userId?: string },
    deviceId: string | undefined,
    orderId: string,
    reason: 'DECISION_CANCEL' | 'FORCE_CANCEL' | 'TIMEOUT' | string,
    /**
     * 👀 **미리 뽑아 둔 미리보기 딱지** (2026-08-22 18:45 실측으로 추가).
     *
     * 🔴 `forceCancelEvaluatingOrder` 는 캐시를 **지운 뒤에** 이 함수를 부른다. 그러면
     *    세션에서 콜을 못 찾아 딱지를 영영 못 본다 — 미리보기인데 취소 카운트가 올랐다.
     *    **판단에 쓸 값을 지운 다음에 판단하지 않는다.** 지우기 전에 뽑아 여기로 넘긴다.
     */
    isPreviewHint?: boolean,
    /** 한도 도달을 관제탑에 알리기 위한 소켓 (없으면 판정만 하고 조용히 넘어간다) */
    io?: any,
): void {
    if (!deviceId) return;

    const order = session.pendingOrdersData.get(orderId)
        ?? session.myOrders.find(o => o.id === orderId);

    if (isPreviewHint || order?.isPreview) {
        console.log(`   👀 [미리보기] ${orderId} — 확정 전이라 인성엔 취소가 없다. 카운트에 넣지 않는다 (reason: ${reason})`);
        return;
    }

    incrementDeviceStats(deviceId, "canceled");
    console.log(`   📈 기기(${deviceId}) 취소 카운트 +1 반영 (reason: ${reason})`);

    // 한 판을 다 썼는지는 **세는 자리에서** 본다 — 호출부 넷이 각자 보면 갈라진다
    checkBudgetRound(session, (order as any)?.targetApp ?? 'insung', io);
}

/**
 * 🚫 **한 판(10회)을 다 썼으면 알리고 새 판을 연다** (기사님 확정 2026-08-23).
 *
 * 기사님: *"10회가 되면 토스트 알림주고 리셋해줘."*
 *
 * ⚠️ docs/지금/필터.md §6 의 *"취소는 리셋되지 않는다"* 와
 *    어긋나 보이지만 아니다. 그 취지는 **총량이 사라지면 안 된다**는 것이고,
 *    여기서는 **판수를 남겨** 총량을 지킨다 (`3/10 · 2판째` = 지금까지 13회).
 *    `47/10` 처럼 한도를 네 배 넘긴 숫자는 아무것도 못 알려 준다 — 화면이 뜻을 잃는다.
 *
 * 🔴 저장하는 것은 **리셋 시각 하나**다. 카운트는 장부에서 세는 파생값이라 저장하지
 *    않는다 (규칙 ③). 여기 사는 것은 *"이 시각에 한 판이 끝났다"* 는 **사건**이다.
 */
function checkBudgetRound(
    session: { userId?: string },
    app: string,
    io?: any,
): void {
    const userId = session.userId;
    if (!userId) return;

    try {
        const cutRow = db.prepare(
            `SELECT MAX(reset_at) AS resetAt FROM cancel_budget_resets WHERE user_id = ? AND app = ?`
        ).get(userId, app) as any;
        const cut = cutRow?.resetAt ?? null;

        const row = db.prepare(
            `SELECT COUNT(*) AS n FROM orders
             WHERE userId = ? AND status = 'SAFE_CANCEL'
               AND COALESCE(targetApp, 'insung') = ?
               AND (? IS NULL OR timestamp > ?)`
        ).get(userId, app, cut, cut) as any;

        const used = row?.n ?? 0;
        if (used < CANCEL_BUDGET_PER_ROUND) return;

        const at = new Date().toISOString();
        db.prepare(`INSERT INTO cancel_budget_resets (user_id, app, reset_at) VALUES (?, ?, ?)`)
            .run(userId, app, at);

        const rounds = (db.prepare(
            `SELECT COUNT(*) AS n FROM cancel_budget_resets WHERE user_id = ? AND app = ?`
        ).get(userId, app) as any)?.n ?? 1;

        console.warn(`🚫 [취소 예산 소진] ${app} — ${used}/${CANCEL_BUDGET_PER_ROUND} 다 썼습니다. ` +
            `${rounds + 1}판째를 엽니다 (누적 ${rounds * CANCEL_BUDGET_PER_ROUND}회)`);
        io?.to(userId).emit("cancel-budget-reached", {
            app, used, limit: CANCEL_BUDGET_PER_ROUND, round: rounds + 1,
        });
    } catch (e) {
        // 파생 계측 — 실패해도 취소 처리 자체는 계속된다
        console.error("취소 예산 판정 실패:", e);
    }
}

/**
 * ✅ **수락을 세는 자리도 여기 하나다** (기사님 지적 2026-08-23).
 *
 * 🔴 예전에는 **아무 데도 없었다.** `incrementDeviceStats(…, "grabbed")` 를 부르는 자리가
 *    0곳이라 관제웹의 `수락:N` 이 **항상 0** 이었다 — 화면이 조용히 거짓말했다 (규칙 ⑤-4 ④).
 *
 * 취소와 **같은 파일에 나란히** 둔다. 둘은 한 사건의 양면(KEEP/CANCEL)이라
 * 떨어져 있으면 조건이 갈라진다 — 미리보기 예외가 정확히 그런 조건이다.
 *
 * 👀 **미리보기 콜은 세지 않는다.** 확정을 누르기 전이라 **인성에서는 아직 내 콜이 아니다.**
 *    취소를 안 세는 이유와 같다.
 */
export function countKeep(
    session: { pendingOrdersData: Map<string, any>; myOrders: any[] },
    deviceId: string | undefined,
    orderId: string,
    isPreviewHint?: boolean,
): void {
    if (!deviceId) return;

    const order = session.pendingOrdersData.get(orderId)
        ?? session.myOrders.find(o => o.id === orderId);

    if (isPreviewHint || order?.isPreview) {
        console.log(`   👀 [미리보기] ${orderId} — 확정 전이라 아직 내 콜이 아니다. 수락에 넣지 않는다`);
        return;
    }

    incrementDeviceStats(deviceId, "grabbed");
    console.log(`   📈 기기(${deviceId}) 수락 카운트 +1 반영`);
}

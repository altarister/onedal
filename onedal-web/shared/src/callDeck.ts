import { isTerminal, isEvaluating } from './callStatus';
import { businessDayKey } from './timing';

/**
 * 이미 상차한 콜인가 — **이 판단은 여기 한 곳에만 둔다.**
 *
 * 🔴 server/routeComposer 와 관제웹이 **같은 정의**를 봐야 지도와 경로가 갈라지지 않는다.
 *
 * 기사님 원칙 그대로 — **KEEP 은 예약이고 상차가 적재다.** 짐을 실었으면 남은 일은 하차뿐이다.
 */
export function isAlreadyLoaded(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_PICKED_UP';
}

/**
 * 🚏 **이 정거장에 이미 다녀왔는가 — 판단은 여기 하나뿐이다** (기사님 확정).
 *
 * 기사님: *"현실에서는 내가 지나온 것은 무시할 것 같은데."*
 *
 * 🔴 **경로 조립과 시각 계산이 이 판단 하나를 쓴다** — 둘로 나뉘면(버튼 vs GPS) 상차 완료를 안 누른 콜이
 *    이미 지나온 상차지로 되돌아가는 경로를 만들어 **없는 우회 비용**을 문다.
 *
 * **GPS 도착이면 다녀온 것이다.** 도착 감지는 500m 안에 들어와야 찍히므로 "거기 갔다"는
 * 뜻이고, **가는 길**은 더 필요 없다.
 *
 * ⚠️ `isAlreadyLoaded`(실었는가)와 **다른 질문**이다. 도착했지만 아직 안 실은 상태가 있고,
 *    그때 단계는 여전히 "상차 완료" 대기다 — 단계는 `isAlreadyLoaded` 로 묻는다.
 *    여기는 오직 **"경로에 남겨 둘 이유가 있는가"** 만 답한다.
 *
 * 📦 적재 계산(«함께 실리는 최대» `peakLoadPoints`)은 이 답으로 **실린 것(loaded)** 을 가른다 — 상차지에 와 있는 콜은
 *    남은 경로 맨 앞에서 실리므로 처음부터 짐에 넣는다. 경로가 뺀 상차를 따로 세면 순서가 콜 전부를 못 덮어
 *    다 더한 값으로 물러선다.
 */
export function hasVisitedStop(
    c: { status?: string | null; arrivedPickupAt?: string | null; arrivedDropoffAt?: string | null },
    stopType: 'pickup' | 'dropoff',
): boolean {
    if (stopType === 'pickup') {
        return !!c.arrivedPickupAt || c.status === 'ORDER_PICKED_UP' || c.status === 'ORDER_DELIVERED';
    }
    return !!c.arrivedDropoffAt || c.status === 'ORDER_DELIVERED';
}

/**
 * 🪧 **심사석에 앉힐 콜** — 평가·미리보기 중인 것 하나 (덱에서는 뺀다).
 *
 * 🔴 **술어는 여기 하나다** (0831 리뷰에서 잡힘). 파생 제조소와 대시보드가 글자까지 같은
 *    식을 각자 들고 있었다 — 한쪽에 조건이 붙는 순간 «심사석에 뜬 콜»과 «덱에서 빠진 콜»이
 *    달라진다. 그 둘은 반드시 같은 콜이어야 한다 (규칙 ③).
 */
export function judgingCallOf<T extends { status?: string | null; isPreview?: boolean }>(
    calls: T[],
): T | undefined {
    return calls.find(c => {
        const s = c.status ?? undefined;
        if (isTerminal(s)) return false;
        // 🛡️ 이미 배차가 확정되었거나 운행 중인 콜은 심사 대상이 아니다 (잔여 isPreview 플래그 방어)
        if (s === 'ORDER_CONFIRMED' || s === 'ORDER_PICKED_UP' || s === 'ORDER_DELIVERED') return false;
        return isEvaluating(s) || !!c.isPreview;
    });
}

/**
 * 🔄 **이번 운행에서 "한 일"인가** — 하차·정산 완료만이다.
 *    취소·방출은 종결(`isTerminal`)이지만 **없던 일**이라 여기 안 든다.
 */
export function isDeliveredCall(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_DELIVERED' || c.status === 'ORDER_COMPLETED';
}

/**
 * 🗓️ **시트의 카드 목록 — 오늘 한 일** (기사님 결정 «시트는 오늘 한 일을 남긴다 · 화면의 사이클 = 하루»).
 *
 * 처음엔 «진행 중이 남은 동안만 하차분을 함께» 보여 줬고(6단계 채운 모습을 보려고),
 * #40에서 «이번 운행 — 진행 중 콜을 잡기 전에 내린 것은 뺀다»로 좁혔다. 그래서 콜 사이 빈 차가 될 때마다
 * 오늘 한 일이 통째로 사라졌다. 이제 경계는 **자정 하나**다 — 오늘 하차한 콜은 진행 중이 0건이어도, 운행이 끊겼다 이어져도 남는다.
 *
 * 경계는 저장하지 않고 하차 시각에서 파생한다 (규칙 ③ · `businessDayKey` — 서버 `ensureBusinessDay` 와 같은 선).
 * ⚠️ **하차 시각을 모르면 남긴다.** 없는 값으로 카드를 지우지 않는다 (규칙 ④).
 * ⚠️ 시각은 **날짜로** 비교한다 — 장부의 두 칸은 표기가 달라(`+09:00` · `Z`) 문자열로 비교하면 뒤집힌다.
 * 🔴 **상태는 콜별 즉시, 화면만 하루 단위.** 하차의 운임은 그 순간 발생한다.
 * ⚠️ 이 목록은 **화면 전용**이다. 경로·적재·운임·카운트다운은 진행 중인 콜만 본다 (`TERMINAL_STATUSES` 주석의 사고).
 * ⚠️ 이름은 옛 «사이클»을 그대로 둔다 — 짝 여럿이 이 이름을 문다. 뜻은 «하루»다.
 */
export function deckOfCycle<T extends { status?: string | null; capturedAt?: string; completedAt?: string | null }>(calls: T[], nowMs: number = Date.now()): T[] {
    const inProgress = calls.filter(c => !isTerminal(c.status ?? undefined));
    const today = businessDayKey(nowMs);
    const doneToday = (c: T) => {
        const t = Date.parse(c.completedAt ?? '');
        return Number.isNaN(t) || businessDayKey(t) === today;
    };
    return [...inProgress, ...calls.filter(c => isDeliveredCall(c) && doneToday(c))]
        .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''));
}

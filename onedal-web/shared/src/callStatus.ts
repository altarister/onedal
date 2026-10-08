import { LET_GO_STATUSES, type LetGoStatus } from './orderStatuses';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 콜(Order) 통합 라이프사이클 상태 (DB 영구 저장 + 메모리 관리)
// 모든 상태값에 ORDER_ 접두사를 붙여 다른 도메인 상태와 즉각 구분
// 2단계(ORDER_SECURED_EVALUATING)부터 사용자 의지로 버리면 모두 패널티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type OrderStatus =
    // --- [심사 및 결재 단계] ---
    | 'ORDER_PRE_SECURED'          // (패널티 X) 상세화면에서 검토 중 (확정 버튼 누르기 전)
    | 'ORDER_SECURED_EVALUATING'   // (패널티 O) 확정 화면 진입, 내 콜로 등록됨, 서버 연산 중
    | 'ORDER_AWAITING_DECISION'    // (패널티 O) 관제탑 결재 대기 (안전취소)
    // --- [확정 이후 단계] ---
    | 'ORDER_CONFIRMED'            // (패널티 O) 관제탑 승인 (내 퀵)
    | 'ORDER_PICKED_UP'            // (패널티 O) 상차 완료 (픽업지에서 서명)
    | 'ORDER_DELIVERED'            // (패널티 O) 하차 완료 (수취인 서명)
    | 'ORDER_COMPLETED'            // 정산 완료 — 지금은 아무도 안 쓴다. 정산 화면이 생기면 거기서 만든다 (하차 완료는 ORDER_DELIVERED · 루트 README.md 「관제앱은 업무 단위다」)
    // --- [취소 및 방출 단계] ---
    // 취소의 세 갈래 — 패널티(배차망 취소 횟수 10회)는 **안전취소에만** 붙는다
    | 'SAFE_CANCEL'                // (패널티 O) 안전취소 — 확정 후 30초 안에 내가 취소
    | 'ORDER_RELEASED_BY_ME'       // (패널티 X) 내가통화후방출 — 내가 주선사에 전화해 취소 요청
    | 'ORDER_RELEASED_BY_OFFICE';  // (패널티 X) 일방적퀵사방출 — 사무실이 일방적으로 취소시킴

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [런타임 상수] 상태 그룹 배열 + 헬퍼 함수
// 클라이언트/서버 양쪽에서 하드코딩 없이 import하여 사용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 평가/심사 중 상태 (아직 확정되지 않음) */
export const EVALUATING_STATUSES: readonly OrderStatus[] = [
    'ORDER_PRE_SECURED',
    'ORDER_SECURED_EVALUATING',
    'ORDER_AWAITING_DECISION',
] as const;

/**
 * 모든 주문 상태 — **런타임 배열**.
 *
 * 타입(`OrderStatus`)만으로는 런타임에 순회할 수 없어서, 상태 목록이 필요한 곳마다
 * 손으로 다시 나열해 왔다. 그러다 갈라졌다 (아래 `RESTORABLE_STATUSES` 주석 참고).
 * 새 상태를 추가하면 **여기에만** 추가한다.
 */
export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
    'ORDER_PRE_SECURED',
    'ORDER_SECURED_EVALUATING',
    'ORDER_AWAITING_DECISION',
    'ORDER_CONFIRMED',
    'ORDER_PICKED_UP',
    'ORDER_DELIVERED',
    'ORDER_COMPLETED',
    'ORDER_RELEASED_BY_ME',
    'SAFE_CANCEL',
    'ORDER_RELEASED_BY_OFFICE',
] as const;

/**
 * 🏷️ **콜 상태 이름표 — 한 벌** · `Record` 라 새 상태를 `OrderStatus` 에 더하면 여기서 타입이 막는다(빠진 이름표가 영어로 새지 않게).
 *    화면(운영센터 등)은 이 표로만 옮겨 적는다 — 화면마다 따로 적으면 갈라진다.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
    ORDER_PRE_SECURED: '선점 중',
    ORDER_SECURED_EVALUATING: '심사 중',
    ORDER_AWAITING_DECISION: '결재 기다림',
    ORDER_CONFIRMED: '진행 중',
    ORDER_PICKED_UP: '상차 완료',
    ORDER_DELIVERED: '하차 완료',
    ORDER_COMPLETED: '완료',
    ORDER_RELEASED_BY_ME: '방출(기사님)',
    SAFE_CANCEL: '안전취소',
    ORDER_RELEASED_BY_OFFICE: '방출(사무실)',
};

/** 종결 상태 (더 이상 상태 전이 없음) */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
    // 하차 보고(ORDER_DELIVERED)가 곧 배송 종료다. 여기 있어야 getActiveCalls() 가 제외해
    // 적재 계산·경로 계산·화면 표시가 함께 짐을 내린다 — 빠지면 잔여 용량이 회복되지 않아 다음 짐을 못 잡는다.
    'ORDER_DELIVERED',
    'ORDER_COMPLETED',
    ...LET_GO_STATUSES,   // 🔙 무른 콜 셋은 원천 하나(`orderStatuses.ts`)에서
] as const;

/**
 * 서버 재시작·재접속 시 **DB 에서 세션으로 되살려야 하는** 상태.
 *
 * 🔴 **손으로 나열하지 않고 파생시킨다** — 나열하면 새 상태를 복구 쿼리에 빠뜨려, 짐을 실은 채 새로고침하면
 *    콜이 화면에서 사라지고 서버는 빈 차로 착각한다.
 *
 * 평가 중(안전취소 이전)은 메모리에만
 * 존재하므로 복구 대상이 아니고, 그 외에는 전부 복구한다 —
 * 진행 중이면 조작해야 하고, 종결이면 목록(완료됨·취소/방출)에 보여야 한다.
 *
 * 새 상태를 추가하면 `ALL_ORDER_STATUSES` 에만 넣으면 되고,
 * 어느 쪽인지 정하지 않으면 `orderStatus.test.ts` 가 실패한다.
 */
export const RESTORABLE_STATUSES: readonly OrderStatus[] =
    ALL_ORDER_STATUSES.filter(s => !EVALUATING_STATUSES.includes(s));

/** 확정됐지만 아직 안 끝난 상태 — 화면에서 **조작해야 하는** 콜 */
export const IN_PROGRESS_STATUSES: readonly OrderStatus[] =
    RESTORABLE_STATUSES.filter(s => !TERMINAL_STATUSES.includes(s));

/**
 * 🗓️ **미완료 콜은 영업일 며칠 전까지 되살리나** (기사님 확정: 어제 영업일부터).
 *
 * `timestamp >= 오늘 자정` 만 쓰면 **전날 상차한 콜이 사라져** 전날 상차·다음날 배송 운행이 깨진다.
 * 그래서 미완료 콜만 영업일 경계(자정 · `businessDayKey`) 기준으로 하루 더 거슬러 살린다.
 * 🔴 «지금부터 몇 시간»이 아니라 **날짜**로 자른다 — 자정을 넘겨 일해도 어제 잡은 콜이 그대로 산다.
 * 종결 콜은 오늘 것만이다.
 */
export const UNFINISHED_RESTORE_BUSINESS_DAYS = 1;

/**
 * 복구 시간 창 두 개. 서버의 두 쿼리가 같은 값을 쓰도록 여기서만 만든다.
 *
 * ⚠️ 기준 필드는 `orders.timestamp` 다. 정확해서가 아니라 **기존 동작을 바꾸지 않기 위해서**다
 *    (`capturedAt` 과 섞어 쓰면 Phase 7.5 가 정리할 시각 포맷 문제를 새로 만든다).
 */
/**
 * 🗓️ **복구 창의 조건 한 벌** — 재부팅 복구(`restoreAndRecalculateSession`)와 새로고침 이력(`GET /orders`)이 같이 쓴다.
 *    어긋나면 소켓에는 있는데 HTTP 에는 없는 콜이 생겨 새로고침마다 깜빡인다 (규칙 ③).
 *    · 오늘 잡은 콜 · 어제 영업일부터의 미완료 콜 · **오늘 하차한 콜** — 자정을 넘긴 운행에서 어제 잡고 오늘 내린 콜을 오늘 시트에 올린다
 *      (기사님 확정 *"오늘 내린 콜만 분리해서 오늘 시트에 올린다"*).
 *    · 🧾 **폰이 받았다고 답하지 않은 확정은 빼낸다**(`ackedAt` 이 빈 `ORDER_CONFIRMED` · 35 X7 ②) — KEEP 뒤 받았음 전에 서버가 다시 뜨면
 *      폰은 안 잡았는데 장부엔 «확정»이 남아 유령 콜이 경로 · 적재 · 경유를 좁혔다. 상차 뒤 상태는 안 뺀다(짐을 실었으면 진짜다)
 *    `sql` 은 `orders` 의 칸 이름(`timestamp`·`status`·`completedAt`·`ackedAt`)을 쓴다 — 별칭이 있으면 `prefix` 로 붙인다.
 */
export function restoreWhere(nowMs: number, prefix = ''): { sql: string; params: string[] } {
    const { todayStartIso, unfinishedSinceIso } = restoreWindow(nowMs);
    const inProgress = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
    return {
        sql: `( ${prefix}timestamp >= ? OR (${prefix}status IN (${inProgress}) AND ${prefix}timestamp >= ?) OR ${prefix}completedAt >= ? )`
            + ` AND NOT (${prefix}status = ? AND ${prefix}ackedAt IS NULL)`,
        params: [todayStartIso, ...IN_PROGRESS_STATUSES, unfinishedSinceIso, todayStartIso, 'ORDER_CONFIRMED'],
    };
}

export function restoreWindow(nowMs: number): { todayStartIso: string; unfinishedSinceIso: string } {
    const todayStart = new Date(nowMs);
    todayStart.setHours(0, 0, 0, 0);
    return {
        todayStartIso: todayStart.toISOString(),
        unfinishedSinceIso: new Date(
            todayStart.getTime() - UNFINISHED_RESTORE_BUSINESS_DAYS * 86_400_000).toISOString(),
    };
}

/** 주어진 상태가 평가/심사 중인지 판별 */
export function isEvaluating(status?: string): boolean {
    return EVALUATING_STATUSES.includes(status as OrderStatus);
}

/** 주어진 상태가 종결 상태인지 판별 */
export function isTerminal(status?: string): boolean {
    return TERMINAL_STATUSES.includes(status as OrderStatus);
}

/**
 * 직접 갈래(기사님이 잡은 콜)인가 — `type` 은 확정 전 «MANUAL_CLICK» → 승격 후 «MANUAL»
 * **두 표기**다. `=== 'MANUAL'` 비교가 0830~31 하룻밤에 배지 누락·결재 버튼 잔상을
 * 세 번 만들었다 — «직접 갈래인가»는 여기서만 답한다 (한 값 두 표기 클래스 봉쇄).
 */
export function isManualLineage(type?: string | null): boolean {
    return !!type?.startsWith('MANUAL');
}

// [폐기됨] PendingOrderPhase는 OrderStatus에 통합되었습니다.
// 'SCREENING' → 'ORDER_PRE_SECURED', 'AWAITING_DECISION' → 'ORDER_AWAITING_DECISION'
// 하위 호환을 위해 alias만 유지
export type PendingOrderPhase = 'ORDER_PRE_SECURED' | 'ORDER_AWAITING_DECISION';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 상태 (내가 책임지고 수행해야 하는 퀵)
// 업계 표준 3단계: 배차확정 → 상차완료(서명) → 하차완료(서명)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type MyOrderStatus = 'ORDER_CONFIRMED' | 'ORDER_PICKED_UP' | 'ORDER_DELIVERED' | 'ORDER_COMPLETED' | LetGoStatus;

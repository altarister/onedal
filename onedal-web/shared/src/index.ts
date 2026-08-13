import { unitPoints } from './cargoUnits';
import type { CapacityConfidence } from './vehicles';
export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
    MANUAL: "MANUAL" as const,
};

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
/**
 * 결제수단. 인성앱 확정 상세의 `요금 : 40,000(신용)` 괄호 안에 표기된다.
 * 파서가 괄호 안 자유 텍스트("협의" 등)를 결제수단으로 오인하지 않으려면
 * **런타임에 검사할 목록**이 필요하므로 배열을 진실 공급원으로 두고 타입을 파생시킨다.
 */
export const PAYMENT_TYPES = ['신용', '선불', '착불', '카드', '현금'] as const;
export type PaymentType = typeof PAYMENT_TYPES[number];
export type BillingType = '계산서' | '인수증' | '무과세';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 콜(Order) 통합 라이프사이클 상태 (DB 영구 저장 + 메모리 관리)
// 모든 상태값에 ORDER_ 접두사를 붙여 다른 도메인 상태와 즉각 구분
// 2단계(ORDER_SECURED_EVALUATING)부터 사용자 의지로 버리면 모두 패널티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type OrderStatus =
    // --- [심사 및 결재 단계] ---
    | 'ORDER_PRE_SECURED'          // (패널티 X) 상세화면에서 검토 중 (확정 버튼 누르기 전)
    | 'ORDER_SECURED_EVALUATING'   // (패널티 O) 확정 화면 진입, 내 콜로 등록됨, 서버 연산 중
    | 'ORDER_AWAITING_DECISION'    // (패널티 O) 관제탑 결재 대기 (데스밸리)
    // --- [확정 이후 단계] ---
    | 'ORDER_CONFIRMED'            // (패널티 O) 관제탑 승인 (내 퀵)
    | 'ORDER_PICKED_UP'            // (패널티 O) 상차 완료 (픽업지에서 서명)
    | 'ORDER_DELIVERED'            // (패널티 O) 하차 완료 (수취인 서명)
    | 'ORDER_COMPLETED'            // (패널티 O) 운행 완료 (정상 종료)
    // --- [취소 및 방출 단계] ---
    | 'ORDER_RELEASED'             // (패널티 O) 배차 방출 (확정 후 내가 포기)
    | 'ORDER_CANCELED'             // (패널티 O) 배차 거절 (내가 능동 거절)
    | 'ORDER_FORCE_CANCELED';      // (패널티 X) 수동태 취소 (사무실/화주가 강제 취소)

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
    'ORDER_RELEASED',
    'ORDER_CANCELED',
    'ORDER_FORCE_CANCELED',
] as const;

/** 종결 상태 (더 이상 상태 전이 없음) */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
    // [Phase 8.3] 하차 보고(ORDER_DELIVERED)가 곧 배송 종료다.
    //
    // 예전에는 이 값이 정의만 되어 있고 아무도 쓰지 않아, 하차한 뒤에도 서버가 그 짐을
    // 계속 "적재 중"으로 세었다. 잔여 용량이 회복되지 않아 합짐 필터가 좁은 채로 남고
    // **다음 짐을 못 잡았다.** 여기에 넣는 것만으로 getActiveCalls() 가 제외해 주므로
    // 적재 계산·경로 계산·화면 표시가 한꺼번에 정상화된다.
    'ORDER_DELIVERED',
    'ORDER_COMPLETED',
    'ORDER_RELEASED',
    'ORDER_CANCELED',
    'ORDER_FORCE_CANCELED',
] as const;

/**
 * 서버 재시작·재접속 시 **DB 에서 세션으로 되살려야 하는** 상태.
 *
 * 🔴 2026-08-11 — 이 목록이 세 군데에 손으로 적혀 있었고 서로 갈라져 있었다.
 *    Phase 8.3 이 `ORDER_PICKED_UP` · `ORDER_DELIVERED` 를 만들면서
 *    복구 쿼리에 추가하는 걸 빠뜨렸고, 그 결과
 *    **짐을 실은 채 새로고침하면 콜이 화면에서 통째로 사라졌다.**
 *    서버는 빈 차로 착각해 1t 콜까지 잡으러 갔고, 하차 보고할 화면도 없어졌다.
 *
 * 그래서 나열하지 않고 **파생시킨다.** 평가 중(데스밸리 이전)은 메모리에만
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
 * [임시 · Phase 7(영업일) 도입 시 삭제] 미완료 콜을 며칠까지 되살릴 것인가.
 *
 * 기사님 결정(2026-08-11): **3일.**
 *
 * 복구 쿼리가 `timestamp >= 오늘 자정` 이라 **전날 상차한 콜이 사라졌다.**
 * 전날 상차해서 다음날 배송하는 운행이 통째로 깨진다.
 * 영업일 경계를 제대로 정하는 건 Phase 7 의 일이고 시각 표준 통일(7.5)이 선행이라,
 * 그때까지 **미완료 콜만** 날짜 무관으로 되살린다. 종결 콜은 지금처럼 오늘 것만.
 *
 * 무기한으로 두면 몇 달 전 미완료 콜이 되살아나므로 상한을 둔다.
 */
export const UNFINISHED_RESTORE_DAYS = 3;

/**
 * 복구 시간 창 두 개. 서버의 두 쿼리가 같은 값을 쓰도록 여기서만 만든다.
 *
 * ⚠️ 기준 필드는 `orders.timestamp` 다. 정확해서가 아니라 **기존 동작을 바꾸지 않기 위해서**다
 *    (`capturedAt` 과 섞어 쓰면 Phase 7.5 가 정리할 시각 포맷 문제를 새로 만든다).
 */
export function restoreWindow(nowMs: number): { todayStartIso: string; unfinishedSinceIso: string } {
    const todayStart = new Date(nowMs);
    todayStart.setHours(0, 0, 0, 0);
    return {
        todayStartIso: todayStart.toISOString(),
        unfinishedSinceIso: new Date(nowMs - UNFINISHED_RESTORE_DAYS * 86_400_000).toISOString(),
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Phase 8.2] 운행 마일스톤 — 확정과 종료 사이의 실제 업무 단계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 운행 마일스톤 4단계.
 *
 * 기사님: *"실제로 도착 버튼과 상차 완료 버튼을 누른 시간을 넣어 주어 저장해 주면
 * **예상 시간과 오차를 확인**할 수 있을 듯하다."*
 *
 * 🎯 그래서 도착을 따로 받는다. 도착과 완료 사이가 곧 **실제 상하차 소요 시간**이라,
 *    `dwellMinutes()` 의 추정치(지게차 19분 / 수작업 60분)를 **실측으로 검증**할 수 있다.
 *    지금 그 값은 내가 정한 계수일 뿐이다. 기사님 현장에서 맞는지는 재봐야 안다.
 */
export const MILESTONES = ['ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF', 'DELIVERED'] as const;
export type Milestone = typeof MILESTONES[number];

/**
 * 마일스톤이 들어온 경로. **셋 다 같은 함수로 수렴시킨다.**
 *   AUTO_SCRAPE — 앱이 배차망 화면 변화를 감지 (인성앱 상세의 `상태 : 배송` 텍스트)
 *   APP_BUTTON  — 앱에서 기사님이 직접
 *   MANUAL_WEB  — 관제탑에서 기사님이 직접
 * 나중에 자동 감지 정확도를 측정할 유일한 근거이므로 반드시 기록한다.
 */
export const MILESTONE_SOURCES = ['AUTO_SCRAPE', 'APP_BUTTON', 'MANUAL_WEB'] as const;
export type MilestoneSource = typeof MILESTONE_SOURCES[number];

/** 마일스톤 → 그 보고가 성립했을 때의 오더 상태 */
/**
 * 마일스톤 → 오더 상태.
 * 도착(ARRIVED_*)은 **상태를 바꾸지 않는다** — 도착했다고 짐이 실린 것은 아니다.
 * 시각만 기록해 두고 오차 계산에 쓴다.
 */
export const MILESTONE_TO_STATUS: Record<Milestone, OrderStatus | null> = {
    ARRIVED_PICKUP: null,
    PICKED_UP: 'ORDER_PICKED_UP',
    ARRIVED_DROPOFF: null,
    DELIVERED: 'ORDER_DELIVERED',
};

/**
 * 남아 있는 마일스톤으로 **오더 상태를 파생**한다.
 *
 * 기사님 기준: *"단계별로 DB 에 저장하고 … **수정이 가능해야 한다**."*
 * 잘못 누른 마일스톤을 지울 때 상태를 손으로 되돌리면(예: DELIVERED 취소 → CONFIRMED)
 * 어느 상태로 갈지를 취소 경로마다 다시 정해야 하고, 그러다 갈라진다.
 * 지우고 나서 **남은 것으로 다시 구하면** 갈라질 자리가 없다.
 */
export function deriveStatusFromMilestones(milestones: { milestone: string }[]): OrderStatus {
    const has = (m: string) => milestones.some(x => x.milestone === m);
    if (has('DELIVERED')) return 'ORDER_DELIVERED';
    if (has('PICKED_UP')) return 'ORDER_PICKED_UP';
    return 'ORDER_CONFIRMED';
}

export const MILESTONE_LABEL: Record<Milestone, string> = {
    ARRIVED_PICKUP: '상차지 도착',
    PICKED_UP: '상차 완료',
    ARRIVED_DROPOFF: '하차지 도착',
    DELIVERED: '하차 완료',
};

/**
 * 이 오더에서 지금 보고할 수 있는 마일스톤.
 *
 * 순서를 강제한다 — 상차 없이 하차가 먼저 올 수는 있어도(기사님이 상차 보고를 건너뜀),
 * **하차한 뒤에 상차 보고가 늦게 도착해도 상태를 되돌리지 않는다.**
 * 자동 감지와 수동 클릭이 뒤섞이면 순서가 역전될 수 있기 때문이다.
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Phase 8.4] 화물 신고 — 통화로 들은 값(DECLARED) vs 현장 실측(ACTUAL)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 짐 크기. kg 가 아니라 **적재 점수** 축으로 받는다.
 * 기사님 확인값: 1t = 30점 기준으로 소=2 / 중=5 / 대=10 / 초과=30.
 * 통화 중에 한 손으로 탭 한 번에 고를 수 있어야 하므로 네 단계로 끊었다.
 */
export const CARGO_SIZES = ['소', '중', '대', '초과'] as const;
export type CargoSize = typeof CARGO_SIZES[number];

export const CARGO_SIZE_POINTS: Record<CargoSize, number> = {
    '소': 2, '중': 5, '대': 10, '초과': 30,
};

/** 상하차 방법 — 소요 시간과 직결된다 (수작업이면 대기가 길어져 합짐 계획이 틀어진다) */
/**
 * 상하차 방법. 정차 시간이 여기서 갈린다 (`dwellMinutes`).
 *
 * [2026-08-12] 기사님 요청으로 `검수` 추가 — **90분 고정**.
 * 물건을 하나하나 확인받는 자리라 수량과 무관하게 오래 걸린다는 판단이다.
 */
export const HANDLING_METHODS = ['지게차', '수작업', '호이스트', '검수'] as const;
export type HandlingMethod = typeof HANDLING_METHODS[number];

/**
 * 정거장 기록의 종류.
 *
 * [2026-08-12] `SKIPPED` 추가 — **통화를 건너뛰기로 한 결정**.
 *
 * 기사님 기준: *"완료 전까지는 페이지별로 기억하고 있어야 하고 수정이 가능해야 한다."*
 * 예전엔 건너뛰기가 화면 로컬(`skippedTo`)이라 **새로고침하면 되살아났다.**
 * "안 한 일을 기록하지 않는다"는 원칙과 충돌하지 않는다 —
 * 건너뛰기는 안 한 일이 아니라 **기사님이 내린 결정**이고, 시각과 함께 남길 값이다.
 * (나중에 "적요만 보고 갔다가 문제가 생긴" 경우를 되짚을 수 있다)
 */
export type CargoReportKind = 'DECLARED' | 'ACTUAL' | 'SKIPPED';

export interface CargoReport {
    stopType: 'pickup' | 'dropoff';
    kind: CargoReportKind;
    /**
     * 적재 단위. 기사님이 통화에서 실제로 쓰는 말이다 — 1t 기준 파레트가 기본,
     * 소량이면 라면박스. 추상적인 소·중·대보다 부피를 유추하기 쉽다.
     */
    unit?: string;
    /** @deprecated `unit` 으로 대체. 기존 데이터 호환용 */
    sizeClass?: CargoSize;
    quantity?: number;
    handling?: HandlingMethod;
    /** 약속·예정 시각 (적요의 `12:42상차` 등에서 자동 추출) */
    promisedAt?: string;
    /**
     * [2026-08-12] **상차지 통화에서 함께 들은 하차지 도착 예정 시각.**
     *
     * 기사님: *"상차지에서 하차지 정보를 대략 알 수 있을 거야."*
     * 그래서 상차지 통화 한 번으로 하차지 시각까지 물어 둔다.
     *
     * 🔴 이 값을 **하차지 기록으로 저장하지 않는다.** 저장하면
     *    `deriveCallStep` 이 "하차지 통화를 했다"고 보고 그 단계를 건너뛴다.
     *    기사님: *"내 의도는 시퀀스로 되어 있는데 두 개를 한 번에 가는 건 기준이 흔들리는 것 같아."*
     *    맞다 — 이건 **들은 값**일 뿐이고, 통화를 했는지는 기사님이 정한다.
     *    그래서 상차지 기록에 담아 두고, 하차지 통화 단계에서 **미리 채워** 준다.
     */
    onwardDeadlineAt?: string;
    /**
     * **마감 시각** — "늦어도 언제까지". 약속 시각과 다르다.
     * 기사님 예시: 14:00 에 잡았고 "5시까지는 와야 한다" → 17:00.
     * 이 값이 있어야 합짐 우회를 몇 분까지 허용할지 계산할 수 있다.
     */
    deadlineAt?: string;
    /** 화물 성질 (식료품·냉장·파손주의 등). 시간 민감도와 동승 가능 여부를 결정 */
    tags?: string[];
    memo?: string;
}

/** 신고된 짐이 차지하는 적재 점수 */
export function cargoPoints(r: Pick<CargoReport, 'unit' | 'sizeClass' | 'quantity'>): number {
    // 새 단위(파레트/라면박스/소·중·대)를 우선 쓰고, 없으면 예전 sizeClass 로 폴백
    if (r.unit) return unitPoints(r.unit, r.quantity);
    if (!r.sizeClass) return 0;
    return CARGO_SIZE_POINTS[r.sizeClass] * (r.quantity || 1);
}

/**
 * 신고값과 실측값이 얼마나 어긋났는지.
 * 1.5배 이상이면 합짐 계획이 깨진다 — 퀵사무실에 확인해야 하는 수준이다.
 */
export function cargoMismatchRatio(declared?: CargoReport | null, actual?: CargoReport | null): number | null {
    // 🔴 2026-08-11 — 관문이 `!declared?.sizeClass || !actual?.sizeClass` 였다.
    //    `sizeClass` 는 단위를 파레트·라면박스로 바꾸기 전의 옛 필드이고
    //    화면은 `unit` 만 보낸다. 그래서 **불일치 경고가 한 번도 뜬 적이 없다.**
    //    통화 파레트 2개 → 현장 5개(2.5배)여도 조용했고,
    //    CargoMismatchBanner · resolve-cargo-mismatch 가 통째로 도달 불가능한 코드였다.
    //
    //    관문을 필드가 아니라 **점수**로 건다 (cargoPoints 가 unit·sizeClass 를 모두 처리한다).
    //
    // ⚠️ 하차지는 여전히 null 이 나오고, **그게 맞다.**
    //    기사님 설계상 부피는 상차지에서만 묻는다 —
    //    "하차지 통화 시 물건의 크기와 부피 성질은 이미 파악된 상태이고 시간과 방법만 관심사."
    //    하차지 신고에는 unit·quantity 가 없으므로 비교가 성립하지 않는다.
    //    이걸 버그로 보고 하차지에도 부피를 받게 만들지 말 것.
    if (!declared || !actual) return null;
    const d = cargoPoints(declared);
    const a = cargoPoints(actual);
    if (d === 0 || a === 0) return null;
    return a / d;
}

export function canReportMilestone(status: string | undefined, milestone: Milestone): boolean {
    switch (milestone) {
        // 도착은 상태를 바꾸지 않으므로 아직 안 끝난 콜이면 언제든 받는다
        case 'ARRIVED_PICKUP':  return status === 'ORDER_CONFIRMED';
        case 'PICKED_UP':       return status === 'ORDER_CONFIRMED';
        case 'ARRIVED_DROPOFF': return status === 'ORDER_CONFIRMED' || status === 'ORDER_PICKED_UP';
        case 'DELIVERED':       return status === 'ORDER_CONFIRMED' || status === 'ORDER_PICKED_UP';
        default: return false;
    }
}

/**
 * 예상과 실제의 오차(분). 양수면 늦은 것.
 * 이 값이 쌓이면 `dwellMinutes()` 계수와 카카오 ETA 를 현장에 맞게 교정할 수 있다.
 */
export function timingError(predictedAt?: string | null, occurredAt?: string | null): number | null {
    if (!predictedAt || !occurredAt) return null;
    const p = new Date(predictedAt).getTime();
    const o = new Date(occurredAt).getTime();
    if (!Number.isFinite(p) || !Number.isFinite(o)) return null;
    return Math.round((o - p) / 60000);
}

/** 주어진 상태가 평가/심사 중인지 판별 */
export function isEvaluating(status?: string): boolean {
    return EVALUATING_STATUSES.includes(status as OrderStatus);
}

/** 주어진 상태가 종결 상태인지 판별 */
export function isTerminal(status?: string): boolean {
    return TERMINAL_STATUSES.includes(status as OrderStatus);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 1] 기사 행동 상태 — 기사님이 직접 버튼을 눌러 전환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type DriverAction =
    | 'WAITING'      // 콜 대기중 (주차 상태에서 앱 보며 콜 고르는 중)
    | 'DRIVING'      // 운전중 (상차지든 하차지든 어딘가로 이동 중)
    | 'LOADING'      // 상차중 (픽업지에서 물건 싣는 중)
    | 'UNLOADING'    // 하차중 (하차지에서 물건 내리는 중)
    | 'RESTING';     // 휴식중 (밥, 화장실, 일시정지)

// [폐기됨] PendingOrderPhase는 OrderStatus에 통합되었습니다.
// 'SCREENING' → 'ORDER_PRE_SECURED', 'AWAITING_DECISION' → 'ORDER_AWAITING_DECISION'
// 하위 호환을 위해 alias만 유지
export type PendingOrderPhase = 'ORDER_PRE_SECURED' | 'ORDER_AWAITING_DECISION';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 상태 (내가 책임지고 수행해야 하는 퀵)
// 업계 표준 3단계: 배차확정 → 상차완료(서명) → 하차완료(서명)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type MyOrderStatus = 'ORDER_CONFIRMED' | 'ORDER_PICKED_UP' | 'ORDER_DELIVERED' | 'ORDER_COMPLETED' | 'ORDER_RELEASED' | 'ORDER_CANCELED' | 'ORDER_FORCE_CANCELED';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 3] 사냥 전략 단계 — DriverAction + 확정 콜 수에서 파생
// DB에 저장하지 않음. 순수 계산(Pure Function)으로만 도출.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type DispatchPhase = 'STANDBY' | 'GATHERING' | 'DELIVERING';

// 나중에 상세 주소나 위경도가 필요할 때를 대비한 하위 객체
export interface LocationPoint {
    code?: string;
    name: string;             // 예: "역삼동"
    fullName?: string;        // 예: "서울 강남구 역삼동"
    centroid?: [number, number];
}

// [신규] 출발지/도착지 팝업에서 긁어올 상세 정보 (운행일지 및 리뷰 작성용)
// 인성앱 "출발지 상세" / "도착지 상세" 팝업 기준 1:1 매핑
export interface LocationDetailInfo {
    customerName?: string;    // [고객] 상호/고객명 (예: "*레드캠프", "SK스토아 홈쇼핑(5층하차")
    department?: string;      // [부서] 부서명 (예: "정실장님", 빈 값일 경우 "*")
    contactName?: string;     // [담당] 담당자명 (예: "정종혁차장")
    mileage?: number;         // [마일리지] 마일리지 포인트 (예: 0)
    phone1?: string;          // [전화1] 대표 연락처 (예: "010-2228-4991")
    phone2?: string;          // [전화2] 보조 연락처 (예: "031-267-1224", 빈 값일 경우 "*")
    region?: string;          // [출발/도착] 광역 지역명 (예: "경기 화성시", "서울 마포구")
    addressDetail?: string;   // [위치] 상세 주소+건물명 (예: "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)")
    requestedTime?: string;   // 상차/하차 예약 시간 (확정 페이지에서 파싱, 예: "13:53")
    memo?: string;            // 현장 전달사항 (적요 등에서 추출)
}

// 1. [목록 위젯] 매크로가 0.01초만에 읽어야 하는 겉표면 텍스트
export interface SimplifiedOfficeOrder {
    id: string;                       // 스캐너 앱 쪽 고유 ID
    type: EventType;                  // NEW_ORDER 등 통신 규격
    pickup: string;                   // 예: "경기 광주 오포"
    dropoff: string;                  // 예: "강남구 역삼동"
    fare: number;                     // 45000 (숫자)
    timestamp: string;                // ISO 8601 포맷
    postTime?: string;                // [추가] 앱에서 긁어온 콜 상차시간/등록시간 (예: "12:23")
    scheduleText?: string;            // [추가] 예약일정/수식어 (예: "낼09시", "11일)09시", "@")
    vehicleType?: string;             // [추가] 차종 (예: "라", "다", "1t" 등)
    rawText?: string;                 // 안드로이드 스캐너에서 긁어온 원본 텍스트         
    // (선택) MOCK 지도 연산 및 시뮬레이션 용 임시 좌표
    pickupX?: number;
    pickupY?: number;
    dropoffX?: number;
    dropoffY?: number;
    pickupDistance?: number;          // 상차지까지의 남은 직선 거리 (km)
    /**
     * 배송거리 (상차지 → 하차지, km). 리스트 최좌측 두 숫자 중 **두 번째** 값.
     * 앱의 단가 판정(`fare ≥ deliveryDistance × ratePerKm[차종]`) 입력이며,
     * 서버는 판정 근거를 로그에 남길 때 쓴다 (실제 판정은 카카오 도로거리로 다시 잰다).
     * 🔍 이 값이 직선거리인지 도로거리인지는 실콜 대조 대기 중 (docs/필터_재설계_명세.md §6)
     */
    deliveryDistance?: number;
}
// 2. [상세 페이지] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface DetailedOfficeOrder {
    // 1. 배차사(퀵사무실) 정보 (상세화면 최상단)
    dispatcherName?: string;          // 배차 사무실 상호 (예: "고양퀵서비스")
    dispatcherPhone?: string;         // 배차 사무실 연락처 (예: "031-932-7722")
    
    // 2. 문서/전표 기본 정보
    receiptStatus?: string;           // 전표 상태 (예: "신규", "수정", "취소")
    itemDescription?: string;         // 물품 요약 (예: "소형 가전", "박스 2개")
    vehicleType?: string;             // 차량 종류 (예: "1t", "다마스")
    
    // 3. 요금 상세 스펙
    commissionRate?: string;          // 수수료율 (예: "23%", "10%", "*%")
    tollFare?: string;                // 탁송료/통행료 별도 기재 항목
    paymentType?: PaymentType;        // 신용, 착불 등 결제수단
    billingType?: BillingType;        // 세금계산서, 인수증 발급 형태
    
    // 4. 운행 조건 스펙
    tripType?: string;                // 배송 구분 (예: "편도", "왕복")
    orderForm?: string;               // 배송 형태 (예: "보통", "급송")
    detailMemo?: string;              // 적요 상세 (원문 전체)
    
    // 5. 위치 정보
    pickups?: LocationPoint[];        // 다중/상세 상차지
    dropoffs?: LocationPoint[];       // 다중/상세 하차지
    pickupDetails?: LocationDetailInfo[];  // 출발지 상세 정보 (팝업 파싱)
    dropoffDetails?: LocationDetailInfo[]; // 도착지 상세 정보 (팝업 파싱)
    distanceKm?: number;              // 운행 거리(km)
    
    // 6. 메타 데이터 및 호환성 필드
    isMock?: boolean;                 // 목업 콜 여부
    isShared?: boolean;               // 합짐(혼적) 여부
    isExpress?: boolean;              // 급송(독차) 여부
    companyName?: string;             // 화주 상호/이름 (과거 호환 유지 목적)
    pickupTime?: string;              // 픽업 예약 시간 지정
}

// (FilterConfig removed in favor of AutoDispatchFilter)
// 3. [오더 풀스팩] 배차 확정 후, 들어가서 스크래핑해올 구체적 데이터
export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder { }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-A] 심사 중 오더 — 서버 메모리 전용 (아직 내 퀵이 아님)
// 앱이 긁어와서 서버가 꿀/똥콜 판별 중인 임시 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface PendingOrder extends OfficeOrder {
    status: OrderStatus;                  // ORDER_PRE_SECURED | ORDER_SECURED_EVALUATING | ORDER_AWAITING_DECISION
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmSoloDistanceKm?: number;      // OSRM이 연산한 해당 콜만의 '단독' 주행 거리
    osrmSoloDurationMin?: number;     // OSRM이 연산한 해당 콜만의 '단독' 소요 시간
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    isRejected?: boolean;             // 서버 종합 평가 결과: 똥콜 판정 여부
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 (내 퀵) — 기사가 KEEP하여 내 소유가 된 오더
// 업계 표준: 배차확정(CONFIRMED) → 상차완료(PICKED_UP) → 하차완료(DELIVERED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface MyOrder extends OfficeOrder {
    status: MyOrderStatus;            // ORDER_CONFIRMED | ORDER_PICKED_UP | ORDER_DELIVERED
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmSoloDistanceKm?: number;      // OSRM이 연산한 해당 콜만의 '단독' 주행 거리
    osrmSoloDurationMin?: number;     // OSRM이 연산한 해당 콜만의 '단독' 소요 시간
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    settlement?: SettlementInfo;      // 정산 및 미수금 관리 트래킹 (운행일지용)
    isRejected?: boolean;             // 서버 종합 평가 결과: 똥콜 판정 여부
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// [통합] SecuredOrder — PendingOrder와 MyOrder를 모두 아우르는 통합 인터페이스
// 프론트엔드(useOrderEngine, PinnedRouteCard)에서 심사 중 + 확정된 오더를 하나의 배열로 관리
export interface SecuredOrder extends OfficeOrder {
    status: OrderStatus;                  // 단일 통합 라이프사이클 상태
    capturedDeviceId: string;
    capturedAt: string;
    kakaoCalculatedFare?: number;
    kakaoTimeExt?: string;
    routePolyline?: Array<{ x: number; y: number }>;
    totalDistanceKm?: number;
    totalDurationMin?: number;
    kakaoSoloDistanceKm?: number;
    kakaoSoloDurationMin?: number;
    approachDurationMin?: number;
    osrmSoloDistanceKm?: number;
    osrmSoloDurationMin?: number;
    osrmError?: string;
    sectionEtas?: string[];
    pickupEta?: string;
    dropoffEta?: string;
    settlement?: SettlementInfo;
    isRejected?: boolean;
    rejectionReasons?: string[];
    approvalReasons?: string[];
}

// [신규] 운행일지 정산 및 미수금 추적을 위한 구조체
export interface SettlementInfo {
    status: '미정산' | '지급예정' | '정산완료' | '미수금'; // 현재 돈을 받았는지 상태
    unpaidAmount: number;             // 받지 못한 금액 (미수금) 
    payerName?: string;               // 결제/입금 담당자명 또는 회사명 (예: "레드캠프 경리팀")
    payerPhone?: string;              // 결제 담당자 연락처 (이 번호로 전화해서 청구)
    dueDate?: string;                 // 입금 예정일 (예: "매월 말일", "15일", ISO date 등)
    memo?: string;                    // 정산 관련 메모 (예: "수수료 떼고 입금하기로 함", "전화 안받음")
}

// 자동배차 설정 인터페이스 (전역 설정 동기화용)
// [하위 호환] 기존 코드가 LoadState를 아직 참조할 수 있으므로 alias 유지
export type LoadState = 'EMPTY' | 'LOADING' | 'DRIVING' | 'ARRIVED';

export interface AutoDispatchFilter {
    /**
     * [Phase 8.4] 지금 잔여 적재량을 얼마나 믿을 수 있는가.
     * 관제탑에 그대로 표시한다 — '추정' 상태에서 잡은 합짐은 현장에서 안 들어갈 수 있다.
     */
    capacityConfidence?: CapacityConfidence;
    allowedVehicleTypes: string[];   // 허용 차종 배열 (예: ["1t","다마스"]) — 빈 배열이면 모든 차종 허용
    isActive: boolean;              // 필터링(매크로) 활성화 여부
    isSharedMode: boolean;          // 첫짐/합짐 분기 (true면 합짐 회랑, false면 첫짐 수동)
    driverAction: DriverAction;     // [V2] 기사 행동 상태 (WAITING, DRIVING, LOADING, UNLOADING, RESTING)
    dispatchPhase: DispatchPhase;   // [V2] 사냥 전략 단계 (STANDBY, GATHERING, DELIVERING) — 파생값
    pickupRadiusKm: number;         // 내위치 반경 상차지 탐색(km)
    minFare: number;                // 최소 운임 (하한선)
    maxFare: number;                // 최대 운임 (디폴트 100만)
    /**
     * 하차 목표 메인 지역 (시/군/자치구).
     * ⚠️ 앱은 이 값을 **판정에 쓰지 않는다** — 서버가 읍/면/동으로 펼쳐
     *    `destinationKeywords` 로 보내기 때문이다. (`destinationRadiusKm` 도 같다)
     */
    destinationCity: string;
    destinationRadiusKm: number;    // 하차 목표 주위 탐색 반경 (km)
    excludedKeywords: string[];     // 제외 단어 배열 (예: ["착불", "수거", "까대기"])
    destinationKeywords: string[];  // (내부망) 앱 파싱용 읍/면/동 50개 키워드 배열
    destinationGroups?: Record<string, string[]>; // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customCityFilters: string[];    // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    corridorRadiusKm?: number;      // (합짐 모드) 경로 주변 이탈 허용 반경 (기본값 5km, DB설정값)
    userOverrides?: boolean;        // 기사가 팝업에서 수동으로 필터(destinationKeywords 등)를 조작했는지 여부(서버 덮어쓰기 방지용)

    // ── 단가 판정 모델 (2026-08-13 확정 · docs/필터_재설계_명세.md) ──
    // 셋 다 optional: 구버전 앱은 이 키들을 파싱하지 않으므로 무시된다 (호환).
    // minFare/maxFare 는 구버전 앱 호환용으로 유지 — 새 앱은 ratePerKm 이 있으면 그걸 쓴다.
    /** 차종별 하한 단가(원/km) = 실수령 시세 × (1 − 눈높이). 판정: fare ≥ 배송거리 × ratePerKm[차종] */
    ratePerKm?: Record<string, number>;
    /** 눈높이 — 시세 대비 허용 할인 %. 100 = "전부"(금액 무관) */
    eyelinePct?: number;
    /** 사용 중인 적재 칸 (내 1t 트럭 = 5칸). 명목값이며 통화 확인 시 갱신 */
    slotsUsed?: number;
    /** 지금 어느 국면을 사냥하는가 — 기사님이 요약줄 스와이프로 고른다 (기본 DEST) */
    huntPhase?: HuntPhase;
}

/**
 * **하루의 국면** — 기사님이 요약줄을 스와이프해서 고른다.
 *
 *   DEST(목적지행) → LOCAL(이 동네에서 찾기) → HOME(복귀행)
 *
 * 스와이프 순서가 하루의 흐름과 같다: 목적지로 가다가, 거의 도착하면 그 동네 콜을 잡고,
 * 다 내리면 집 방향으로. (docs/필터_재설계_명세.md §4-1)
 *
 * ⚠️ `DispatchPhase`(STANDBY/GATHERING/DELIVERING)와 **다른 것**이다.
 *    · `DispatchPhase` — 지금 짐이 얼마나 실렸나. **데이터에서 파생**된다 (기사님이 못 고른다)
 *    · `HuntPhase`     — 어느 방향을 사냥하나. **기사님이 고른다**
 *    둘은 직교한다: "복귀행이면서 합짐 수집 중"이 정상적인 상태다.
 *
 * 🔴 국면 전환은 **필터만 바꾼다. 콜 상태는 절대 건드리지 않는다.**
 *    옛 `startTwoTrack` 은 전환하면서 활성 콜을 전부 `ORDER_COMPLETED` 로 만들었다 —
 *    기사님: *"콜은 무조건 배달을 해서 완료되어야 한다."* 배달하지 않은 콜이
 *    완료로 기록되면 정산·운행일지가 통째로 틀어진다.
 */
export type HuntPhase = 'DEST' | 'LOCAL' | 'HOME';

export const HUNT_PHASE_LABEL: Record<HuntPhase, string> = {
    DEST: '목적지행',
    LOCAL: '이 동네에서 찾기',
    HOME: '복귀행',
};

/**
 * **이 필터로 사냥해도 되는가.**
 *
 * 🔴 2026-08-12 — 빈 필터가 "제한 없음"으로 읽히고 있었다.
 *
 *    앱 (`InsungParser.kt`):
 *        if (filter.destinationKeywords.isEmpty()) true   // ← 아무 데나 통과
 *    서버 (`OrderEvaluator`):
 *        if (isSharedMode && destinationKeywords.length > 0) { ...검사... }
 *
 *    **두 겹이 같은 방향으로 열려 있었다.** 회랑 계산이 0개를 내거나(경로 실패)
 *    목적지 도시가 비면, `isActive` 는 켜진 채 도착지 조건만 사라진다.
 *    필터가 느슨해지는 게 아니라 **없어지는** 것이다.
 *
 *    도착지가 정의되지 않은 상태는 "제한 없음"이 아니라 **"필터가 고장났음"** 이다.
 *    앱 기본값을 안전 방향으로 돌린 것(v1.3)과 같은 판단이다 —
 *    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
 *
 * @returns 사냥해도 되면 `null`, 안 되면 **왜 안 되는지** (그대로 로그·화면에 쓴다)
 */
export function filterHuntBlocker(filter: AutoDispatchFilter): string | null {
    if (filter.isSharedMode) {
        // 합짐은 경로에서 회랑이 나와야 성립한다. 회랑이 없으면 "가는 길"이 없는 것이다
        if (!filter.destinationKeywords?.length) return '회랑이 아직 안 잡혔습니다';
        return null;
    }
    // 첫짐은 도착 목표가 있어야 성립한다
    if (!filter.destinationCity) return '도착 희망 지역이 비어 있습니다';
    if (!filter.destinationKeywords?.length) return `${filter.destinationCity} 에서 지역을 못 찾았습니다`;
    return null;
}

/**
 * **오늘 필터를 기본 설정으로 되돌린다.**
 *
 * 두 자리에서 쓴다. 규칙이 갈라지지 않게 여기 한 곳에만 둔다.
 *   · 영업일 전환 (자정을 넘겼다)               — `ensureBusinessDay`
 *   · 세션 생성 (서버 재시작·첫 접속)
 *
 * 되돌리지 **않는** 것은 없다 — 오늘 정한 것은 전부 기본값으로 간다.
 * 다만 회랑 파생값은 기본 설정에도 없는 값이라 명시적으로 비운다.
 * 비워 두면 `recalculateDerivedFields` 가 **오늘의** 목적지 도시로 다시 만든다.
 * (어제 경로에서 나온 지역으로 오늘 사냥하면 안 된다)
 *
 * ⚠️ `isActive` 는 기본 설정 값을 그대로 따른다. 끄지 않는다 —
 *    기사님: *"아침에 출근시 필터 설정 없으면 그냥 디폴트 값으로 콜을 잡는 거고."*
 */
export function resetToBaseFilter(base: AutoDispatchFilter): AutoDispatchFilter {
    return {
        ...base,
        destinationKeywords: [],
        destinationGroups: {},
        customCityFilters: [],
        userOverrides: false,
    };
}

/**
 * [계층 3] 사냥 전략 파생 함수 (Pure Function)
 * DriverAction(기사 행동) + 확정 오더 수를 조합하여 DispatchPhase를 자동 계산합니다.
 * DB에 저장하지 않으며, 하드코딩(0km, 10km)을 원천 차단합니다.
 */
export function deriveDispatchPhase(
    driverAction: DriverAction,
    confirmedOrderCount: number
): DispatchPhase {
    if (confirmedOrderCount === 0) return 'STANDBY';
    if (driverAction === 'DRIVING') return 'DELIVERING';
    return 'GATHERING';
}

/**
 * [계층 3] DispatchPhase에 따라 실제 적용할 우회 반경을 결정합니다.
 * DELIVERING(운전중) 상태일 때만 0km를 강제하고, 그 외에는 기사님의 원본 설정값을 그대로 사용합니다.
 * 이 함수를 통해서만 corridorRadiusKm를 결정하므로 하드코딩이 원천 차단됩니다.
 */
/**
 * 우회 반경 기본값. **한 곳에서만 정한다.**
 *
 * 🔴 2026-08-12 — 같은 기본값이 네 갈래로 갈라져 있었다.
 *      dispatchEngine  `?? 10`   (회랑 계산에 실제로 쓰이던 값)
 *      socketHandlers  `?? 1`
 *      routes/filters  `?? 0`
 *      DB · 세션 기본값 5
 *    어느 값이 진짜인지 코드로는 알 수 없었다. DB 기본값(5)에 맞춘다.
 */
export const DEFAULT_CORRIDOR_RADIUS_KM = 5;

export function getEffectiveCorridorRadius(
    _phase: DispatchPhase,
    baseCorridorRadiusKm: number
): number {
    /**
     * 🔴 2026-08-14 — **강제 0 을 걷어냈다.** (docs/필터_재설계_명세.md §2-4)
     *
     * 예전에는 `DELIVERING` 이면 무조건 0 을 돌려줬다. 국면별 설정이 없던 시절,
     * 운행 중 우회를 끊을 방법이 이것뿐이었기 때문이다.
     *
     * 이제 운행중(`drive`) 국면이 **자기 경유 허용값을 갖는다**(기본 0). 기사님이
     * 3km 정도는 허용하고 싶으면 그렇게 저장할 수 있어야 한다 —
     * 여기서 덮어쓰면 그 설정이 영영 무시된다.
     *
     * 함수는 남겨 둔다. 호출부가 "회랑 반경은 여기서만 정한다"는 계약을 지키고 있고,
     * 나중에 국면과 무관한 상한이 필요해지면 다시 여기에 넣는다.
     */
    return baseCorridorRadiusKm;
}

// 서버 전용: 다이내믹 요율 계산 엔진 파라미터 (앱으로 전송하지 않음)
export interface PricingConfig {
    vehicleRates: Record<string, number>;  // 차종별 km당 적정 단가 (예: { "1t": 1000, "다마스": 800 })
    agencyFeePercent: number;              // 퀵사(사무실) 수수료율 (예: 23)
    maxDiscountPercent: number;            // 기사 수용 가능 최대 할인율 (예: 10)
}

// 스마트 회랑 전용 데이터 구조 (PinnedRoute 등 프론트엔드 UI용)
export interface CorridorRouteData {
    summaryText: string;
    totalDistanceKm: number;
    totalTimeMinutes: number;
    tollFare?: number;
    waypoints: {
        lat: number;
        lng: number;
        type: 'PICKUP' | 'DROPOFF';
        label: string;
    }[];
    alternatives?: {
        id: string;
        name: string;
        timeMinutes: number;
        distanceKm: number;
    }[];
}

// 안드로이드 앱폰 -> 서버로 쏘는 주기적인 상태 보고(텔레메트리)
export interface EdgeDeviceTelemetry {
    deviceId: string;                 // 기기 고유 식별자 (예: "phone-1")
    macroStatus: 'IDLE' | 'SCANNING' | 'PAUSED' | 'ERROR'; // 현재 매크로 엔진 상태
    lastOrderCheckedAt: string;       // "오더 조회 중입니다" 토스트가 마지막으로 뜬 시간 (ISO 8601)

    // 앱에서 긁어낸 실시간 통계 누적 현황
    collectedCount: number;           // 인성망에서 긁어낸 전체 오더 갯수 (블랙리스트 걸러지기 전)
    acceptedCount: number;            // 0.01초 광클 로직이 성공해서 수락된 배차 갯수
    bannedCount: number;              // 지뢰콜/하한가/까대기 등으로 로컬 필터가 뱉어버린 콜 갯수

    // 정합성 검사 용도
    appVersion?: string;              // 안드로이드 앱 버전 정보
    activeFilterHash?: string;        // 앱폰이 현재 들고 있는 AutoDispatchFilter의 해시/ID (웹폰과 세팅값이 불일치하는지 검사용)

    // (현재 폰 화면에 표시되어 있는 스크래핑된 오더 리스트 미러링용)
    visibleOrders?: SimplifiedOfficeOrder[];
}

// 1-A. 앱폰 -> 서버: 1차 호출 (리스트 창에서 '확정' 버튼 클릭 직후)
export interface DispatchBasicRequest {
    step: 'BASIC';
    deviceId: string;
    order: SimplifiedOfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
}

// 1-B. 앱폰 -> 서버: 2차 호출 (상세 페이지 진입 후 상세 정보 파싱 완료 시)
export interface DispatchDetailedRequest {
    step: 'DETAILED';
    deviceId: string;
    order: OfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
}

// 두 가지 Step을 묶어주는 유니온 타입
export type DispatchConfirmRequest = DispatchBasicRequest | DispatchDetailedRequest;

// 2. 서버 -> 앱폰: Piggyback 통신 응답 (가성비 연산 후 최종 지시)
export interface DispatchConfirmResponse {
    deviceId: string;                 // 수락한 앱폰 ID
    action: 'KEEP' | 'CANCEL';        // KEEP: 유지, CANCEL: 서버가 보기에 구리니 즉시 취소 후 복귀
}

/**
 * 📱 관제 기기 관리 관련 타입 (Device Telemetry)
 */
export type DeviceStatusType = "ONLINE" | "OFFLINE";
export type DeviceModeType = "AUTO" | "MANUAL";

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 사냥 리스트 화면
    | 'DETAIL_PRE_CONFIRM'    // 광클 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
    | 'UNKNOWN';              // 알 수 없는 화면

/**
 * 🚨 Safety Mode V3: 비상 보고 사유
 */
export type EmergencyReason =
    | 'AUTO_CANCEL'           // 30초 타임아웃으로 앱이 스스로 취소함
    | 'CANCEL_EXPIRED'        // "시간이 지나 취소할 수 없습니다" 팝업 발생
    | 'UNKNOWN_SCREEN'        // 알 수 없는 화면에 빠짐
    | 'BUTTON_NOT_FOUND'      // 버튼(닫기/취소)을 찾을 수 없음
    | 'APP_CRASH';            // 앱 비정상 종료 후 재시작

/**
 * 🚨 Safety Mode V3: POST /api/emergency 요청 바디
 */
export interface EmergencyReport {
    deviceId: string;
    orderId: string;
    reason: EmergencyReason;
    screenContext: ScreenContextType;
    screenText: string;           // 현재 화면 텍스트 전부 (서버 분석용)
    timestamp: string;
}

export interface ScrapResponse {
    apiStatus: {
        success: boolean;
        totalItems: number;
    };
    deviceControl: {
        mode: DeviceModeType;
    };
    dispatchEngineArgs?: AutoDispatchFilter;
}

export interface DeviceSession {
    deviceId: string;
    deviceName?: string;    // 기기 별명 (PIN 페어링 시 등록, 예: "메인폰", "서브폰")
    lastSeen: number;       // 밀리초 타임스탬프
    status: DeviceStatusType;
    mode: DeviceModeType;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    isHolding?: boolean;    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    lat?: number;           // [GPS 텔레메트리] 앱폰(차량) 위도
    lng?: number;           // [GPS 텔레메트리] 앱폰(차량) 경도
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
}


export * from './vehicles';
export * from './pricing';
export * from './phases';
export * from './cargoHints';
export * from './cargoTags';
export * from './cargoUnits';

/**
 * 관제탑으로 보내는 오더 스냅샷.
 * **진행 중과 종료된 것을 나눠서** 보낸다 — 한 배열로 보내면 받는 쪽이 거르기를 잊는다.
 */
export interface OrderSyncPayload {
    active: SecuredOrder[];
    terminated: SecuredOrder[];
}
export * from './callSteps';
export * from './timing';

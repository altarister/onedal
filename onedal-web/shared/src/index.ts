import { unitPoints } from './cargoUnits';
import type { CapacityConfidence } from './vehicles';
import { businessDayKey } from './timing';
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
    | 'ORDER_AWAITING_DECISION'    // (패널티 O) 관제탑 결재 대기 (안전취소)
    // --- [확정 이후 단계] ---
    | 'ORDER_CONFIRMED'            // (패널티 O) 관제탑 승인 (내 퀵)
    | 'ORDER_PICKED_UP'            // (패널티 O) 상차 완료 (픽업지에서 서명)
    | 'ORDER_DELIVERED'            // (패널티 O) 하차 완료 (수취인 서명)
    | 'ORDER_COMPLETED'            // 정산 완료 — 지금은 아무도 안 쓴다. 정산 화면이 생기면 거기서 만든다 (하차 완료는 ORDER_DELIVERED · 루트 CLAUDE.md 「관제앱은 업무 단위다」)
    // --- [취소 및 방출 단계] ---
    // 취소의 세 갈래 — 패널티(배차망 취소 횟수 10회)는 **안전취소에만** 붙는다 (용어집 §2-1)
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
    'ORDER_RELEASED_BY_ME',
    'SAFE_CANCEL',
    'ORDER_RELEASED_BY_OFFICE',
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
 * 그래서 나열하지 않고 **파생시킨다.** 평가 중(안전취소 이전)은 메모리에만
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
/**
 * 🗓️ **복구 창의 조건 한 벌** — 재부팅 복구(`restoreAndRecalculateSession`)와 새로고침 이력(`GET /orders`)이 같이 쓴다.
 *    어긋나면 소켓에는 있는데 HTTP 에는 없는 콜이 생겨 새로고침마다 깜빡인다 (규칙 ③).
 *    · 오늘 잡은 콜 · 3일 안의 미완료 콜 · **오늘 하차한 콜** — 자정을 넘긴 운행에서 어제 잡고 오늘 내린 콜을 오늘 시트에 올린다
 *      (기사님 확정 2026-09-15 *"오늘 내린 콜만 분리해서 오늘 시트에 올린다"*).
 *    `sql` 은 `orders` 의 칸 이름(`timestamp`·`status`·`completedAt`)을 쓴다 — 별칭이 있으면 `prefix` 로 붙인다.
 */
export function restoreWhere(nowMs: number, prefix = ''): { sql: string; params: string[] } {
    const { todayStartIso, unfinishedSinceIso } = restoreWindow(nowMs);
    const inProgress = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
    return {
        sql: `( ${prefix}timestamp >= ? OR (${prefix}status IN (${inProgress}) AND ${prefix}timestamp >= ?) OR ${prefix}completedAt >= ? )`,
        params: [todayStartIso, ...IN_PROGRESS_STATUSES, unfinishedSinceIso, todayStartIso],
    };
}

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
/**
 * 🔴 **출처가 곧 신뢰도다** (기사님 확정 2026-08-19).
 *
 * 기사님: *"내가 확인한 건지 아닌지가 명확하게 데이터로 남아 있어야
 * 데이터로 가치가 있는지 판단할 수 있을 것 같아."*
 *
 *   `MANUAL_WEB`·`APP_BUTTON` — 기사님이 **직접** 눌렀다 → 확인된 시각, 실측 통계에 쓴다
 *   `GPS`                     — 자동 감지 → 참고값 (500m 안에 들어왔다)
 *   `SKIPPED`                 — **안 한 채 지나갔다** → 그 콜의 실측은 믿을 수 없다
 */
export const MILESTONE_SOURCES = ['AUTO_SCRAPE', 'APP_BUTTON', 'MANUAL_WEB', 'GPS', 'SKIPPED'] as const;
export type MilestoneSource = typeof MILESTONE_SOURCES[number];

/**
 * 건너뛴 기록인가 — **판단은 여기 한 곳**이다.
 * 문자열 비교를 여기저기 흩으면 또 갈라진다 (`hasVisitedStop` 을 만든 이유와 같다).
 */
export function isSkipped(m: { source?: string | null }): boolean {
    return m.source === 'SKIPPED';
}

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
// 🔴 **호이스트를 뺐다** (기사님 2026-08-18): *"해본 적이 없는데 이건 그냥 뺄까?"*
//    안 해 본 일에 시간 값을 지어내면 그 값이 색을 정한다. DB 제약도 기존 행도 없어 안전했다.
// 🔴 **검수를 뺐다** (기사님 2026-08-18): *"검수는 하차할 때 하는 거라 하차로 옮기는 것이 맞을 듯."*
//    → 하차의 `후작업`(AFTERWORK_MINUTES)으로 이사했다. 방법은 옮기는 행위만 남는다.
export const HANDLING_METHODS = ['지게차', '수작업'] as const;
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
/**
 * 'PLANNED' 는 **화면 파생 전용**이다 (recordsOfSteps 가 만든다) — DB 에 저장되지 않는다
 * (`stop_cargo_reports` 의 CHECK 는 세 값만 안다). KEEP 때 미리 눌러 둔 차종 기본값이
 * 타임라인의 정차 계산까지 닿게 하는 통로다 — 시딩(서버)과 타임라인(관제웹)이
 * 다른 정차를 먹고 한 화면에서 두 데드라인을 말한 사고(2026-08-21)의 수리.
 */
export type CargoReportKind = 'DECLARED' | 'ACTUAL' | 'SKIPPED' | 'PLANNED';

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
     * 🕒 **도착 약속** — 통화로 정한 "몇 시까지 갈게요" (ISO · 기사님 확정 2026-08-18).
     * 상차 소요(짐 양에 따라 변함)와 분리해 저장한다. 완료 시각은 저장하지 않고
     * `도착 약속 + 지금 추정 소요` 로 파생한다 — 신고가 약속을 흔들지 않게 (규칙 ③).
     */
    promisedArrivalAt?: string;
    /**
     * 🕒 약속의 **"부터"(하한)** (기사님 2026-08-19) — "12시부터 12시30분 사이에 갈게요".
     * promisedArrivalAt 이 "까지"(상한·출발 마감과 지각 판정의 기준)이고, 이 칸은
     * **일찍 가도 소용없음**을 뜻한다 — 화주가 12시부터면 11:40 에 도착해도 상차는
     * 12시 시작이라, 타임라인이 뒤 정거장 도착예상을 그만큼 민다. 탭 1번(까지만)이면 없다.
     */
    promisedArrivalFromAt?: string;
    /** 🔒 보호 — 호루·결박·그물망·탑박스 (복수 선택 · 기사님 2026-08-18) */
    protections?: string[];
    /** 🧹 후작업 — 정리·검수 (하차 전용 · 복수 선택 · 기사님 2026-08-18) */
    afterworks?: string[];
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
    /** 화물 성질 (식료품·냉장·파손주의 등). 시간 민감도와 «같이 실을 수 있나»를 결정 */
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

/**
 * 직접 갈래(기사님이 잡은 콜)인가 — `type` 은 확정 전 «MANUAL_CLICK» → 승격 후 «MANUAL»
 * **두 표기**다. `=== 'MANUAL'` 비교가 0830~31 하룻밤에 배지 누락·결재 버튼 잔상을
 * 세 번 만들었다 — «직접 갈래인가»는 여기서만 답한다 (한 값 두 표기 클래스 봉쇄).
 */
export function isManualLineage(type?: string | null): boolean {
    return !!type?.startsWith('MANUAL');
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
export type MyOrderStatus = 'ORDER_CONFIRMED' | 'ORDER_PICKED_UP' | 'ORDER_DELIVERED' | 'ORDER_COMPLETED' | 'ORDER_RELEASED_BY_ME' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_OFFICE';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 3] 콜 잡기 전략 단계 — DriverAction + 확정 콜 수에서 파생
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
    /** 🌐 픽커 전용 — 물품 크기(초소형/소형…). 차종 칸에 섞지 않는다 (규칙 ⑤-4 ⑤) */
    itemSize?: string | null;
    /** 🌐 픽커 전용 — 태그 원문(급송·예약 17:00·준비 29분…) */
    tagsText?: string | null;
    /**
     * 🗳️ **앱이 이 콜을 어떻게 판정했나** (현황판 의뢰 2026-09-12).
     *    `pass` · `vehicle` · `region` · `fare` · `pickup` · `blacklist` · `routeOrder` · `locked`
     *
     * 🔴 화면이 판정을 **다시 계산하지 않게** 하려는 것이다 — 사본은 이미 한 번 갈라졌다.
     * ⚠️ 못 정하면 `null` — 화면은 «못 잼»으로 그린다 (규칙 ④).
     */
    verdict?: string | null;
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
     * 🔍 이 값이 직선거리인지 도로거리인지는 실콜 대조 대기 중 (docs/지금/필터.md §11)
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
export interface OfficeOrder extends SimplifiedOfficeOrder, DetailedOfficeOrder {
    /** 어느 배차망에서 온 콜인가 — TARGET_APPS 표준값 (앱 confirm 페이로드가 싣는다).
     *  🔴 원장(orders.targetApp)에 저장 — 배차망별 콜 검색·분석의 근거 (기사님 2026-08-17) */
    targetApp?: string;
    /** 🖱️ 잡은 방식 — 6하원칙의 «어떻게» (CAPTURED_VIA · 기록 전용, 보호 분기는 matchType).
     *  구앱·모르는 값은 null — 지어내지 않는다 (기사님 확정 2026-08-30) */
    capturedVia?: string | null; }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-A] 심사 중 오더 — 서버 메모리 전용 (아직 내 퀵이 아님)
// 앱이 긁어와서 서버가 꿀/똥콜 판별 중인 임시 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface PendingOrder extends OfficeOrder {
    status: OrderStatus;                  // ORDER_PRE_SECURED | ORDER_SECURED_EVALUATING | ORDER_AWAITING_DECISION
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 적는다(`filterManager.goalOfCall`) — 복귀 대기면 목적지·집 중 하나, 둘 다면 집.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /** 👀 미리보기 콜 — 확정 전이라 취소 카운트에 안 들어간다 (용어집 §9 · `DispatchBasicRequest.isPreview`) */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    /**
     * 🚚 **배송거리** (상차지 → 하차지, km) — 앱이 리스트에서 긁어 온 값.
     *
     * 🔴 **타입에만 없었다** (2026-09-05 고침). `orders` 테이블에 `deliveryDistance REAL`
     *    로 살고 `GET /orders` 가 그대로 보내는데 여기 선언이 없어서, 관제웹이
     *    `(route as any).deliveryDistance` 로 읽고 있었다 — **`as any` 가 «타입이
     *    실제보다 좁다»는 사실을 덮고 있었다.**
     *    같은 이름이 `SimplifiedOfficeOrder` 에도 있다 (앱이 올려 주는 쪽).
     */
    deliveryDistance?: number;
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 (2026-08-21) */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    /**
     * 🎨 **구간이 끝나는 자리** — `routePolyline` 안에서 각 구간의 **끝 인덱스(누적)** 다
     *    (2026-09-11 · 이식 B1). 지도가 «구간마다 그 콜의 색»으로 그리려면 경계가 필요한데
     *    통짜 배열은 그것을 잃는다.
     *
     * 🔴 **선을 한 벌 더 보내지 않는다.** 2026-08-14 에 종료 콜의 폴리라인만으로 초당 474KB 가
     *    오가 브라우저가 죽었다 — 같은 점열을 복제하면 그 사고가 되살아난다. 경계는 숫자 몇 개뿐이고
     *    `sectionLinesOf()` 가 그것으로 잘라 준다 (파생은 한 곳 · 규칙 ③).
     * ⚠️ `sectionStops` 가 «정거장마다»라면 이건 «정거장 사이마다»라 길이가 하나 짧다 —
     *    카카오 `sections` 를 그대로 따른다.
     */
    sectionEnds?: number[];
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = 카카오호출시점
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-B] 확정 오더 (내 퀵) — 기사가 KEEP하여 내 소유가 된 오더
// 업계 표준: 배차확정(CONFIRMED) → 상차완료(PICKED_UP) → 하차완료(DELIVERED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * 🎨 **판정 스냅샷** (판정색 확정안 v2) — 심사 1회, 불변.
 * 심사 카드가 조건 전수를 이걸로 그리고, **색도 여기서 온다** (2026-08-29 · 4단계).
 *
 * import 순환을 피해 `dryRun.ts` 의 `DryRunVerdict` 를 구조로 적는다.
 * 🔴 **여기 한 곳에만 적는다** (규칙 ③) — 예전엔 `SecuredOrder` 안에만 있어서
 *    `MyOrder` 로 다니는 콜(재시작 복구가 만드는 것)에는 **색이 실리지 못했다.**
 */
export interface JudgmentSnapshot {
    color: '꿀' | '보통' | '똥' | '사고';
    /** 🔴 못 쟀으면 `null` — **0 이 아니다** (0 은 «나쁘다»로 읽힌다) */
    score: number | null;
    /** 🔴 못 잰 기준은 `score` 가 `null` 이다 — 0 은 «나쁘다»로 읽힌다 */
    axes: Array<{ key: string; name: string; score: number | null; weight: number; raw: string; value?: number }>;
    gates: Array<{ key: string; name: string; pass: boolean; why: string | null }>;
    tags: string[];
    /**
     * 🧾 **기존 콜 정거장마다 — 이 후보를 받으면** (전수표 #43 #45 #46 #47 · 합짐 심사 때만 있다).
     *    약속(`promisedAt`) · 예정(`etaAt`) · 늦음(분 — 양수면 늦다). 모르면 `null` — 지어내지 않는다 (규칙 ④).
     *    결론은 관제웹 `seatConclusion` 한 곳이 낸다.
     */
    stops?: Array<{ name: string; stopType: 'pickup' | 'dropoff'; promisedAt: string | null; etaAt: string | null;
        lateMin: number | null; confirmed: boolean; arrived: boolean;
        /** ☎️ 그 정거장의 동 이름 — 늦으면 «전화할 곳»이다 (전수표 #42). 좌표를 모르면 `null` */
        place?: string | null }>;
    /** ❓ **기존 콜 도착을 모르는 까닭** — 있으면 심사석이 «안 밀린다»고 말하지 않는다 */
    unknownWhy?: string | null;
    /**
     * ⏱️ **더 쓰는 시간(분)** — 판정이 시급의 분모로 쓴 값 (전수표 #42 · 목업 «더 쓰는 시간»).
     *    첫짐은 이 콜 전체, 합짐은 전체 경로가 늘어나는 만큼 + 정차. 화면이 다시 재지 않는다 (규칙 ③)
     */
    extraMin?: number | null;
}

export interface MyOrder extends OfficeOrder {
    status: MyOrderStatus;            // ORDER_CONFIRMED | ORDER_PICKED_UP | ORDER_DELIVERED
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 적는다(`filterManager.goalOfCall`) — 복귀 대기면 목적지·집 중 하나, 둘 다면 집.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /** 🏁 하차한 시각 (장부 `orders.completedAt`) — 화면의 사이클 경계가 본다 (#40) */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /**
     * 👀 미리보기 콜 (용어집 §9). 확정되면 `false` 로 덮여 보통 콜이 된다 —
     * `PendingOrder` 와 **같은 모양이어야** 두 타입이 한 함수(`pickRouteHolder` 등)에
     * 섞여 들어갈 때 갈라지지 않는다.
     */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    /** 🎨 판정 스냅샷 — `SecuredOrder` 와 **같은 타입**을 가리킨다 (규칙 ③) */
    judgment?: JudgmentSnapshot;
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    /**
     * 🚚 **배송거리** (상차지 → 하차지, km) — 앱이 리스트에서 긁어 온 값.
     *
     * 🔴 **타입에만 없었다** (2026-09-05 고침). `orders` 테이블에 `deliveryDistance REAL`
     *    로 살고 `GET /orders` 가 그대로 보내는데 여기 선언이 없어서, 관제웹이
     *    `(route as any).deliveryDistance` 로 읽고 있었다 — **`as any` 가 «타입이
     *    실제보다 좁다»는 사실을 덮고 있었다.**
     *    같은 이름이 `SimplifiedOfficeOrder` 에도 있다 (앱이 올려 주는 쪽).
     */
    deliveryDistance?: number;
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 (2026-08-21) */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    /**
     * 🎨 **구간이 끝나는 자리** — `routePolyline` 안에서 각 구간의 **끝 인덱스(누적)** 다
     *    (2026-09-11 · 이식 B1). 지도가 «구간마다 그 콜의 색»으로 그리려면 경계가 필요한데
     *    통짜 배열은 그것을 잃는다.
     *
     * 🔴 **선을 한 벌 더 보내지 않는다.** 2026-08-14 에 종료 콜의 폴리라인만으로 초당 474KB 가
     *    오가 브라우저가 죽었다 — 같은 점열을 복제하면 그 사고가 되살아난다. 경계는 숫자 몇 개뿐이고
     *    `sectionLinesOf()` 가 그것으로 잘라 준다 (파생은 한 곳 · 규칙 ③).
     * ⚠️ `sectionStops` 가 «정거장마다»라면 이건 «정거장 사이마다»라 길이가 하나 짧다 —
     *    카카오 `sections` 를 그대로 따른다.
     */
    sectionEnds?: number[];
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = 카카오호출시점
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
    pickupEta?: string;               // 카카오 궤적 연산 기반 상차지 예상 도착 시간
    dropoffEta?: string;              // 카카오 궤적 연산 기반 하차지 예상 도착 시간
    settlement?: SettlementInfo;      // 정산 및 미수금 관리 트래킹 (운행일지용)
    rejectionReasons?: string[];      // 모든 탈락/패널티 사유 배열
    approvalReasons?: string[];       // 모든 장점/긍정 사유 배열
}

// [통합] SecuredOrder — PendingOrder와 MyOrder를 모두 아우르는 통합 인터페이스
// 프론트엔드(useOrderEngine, PinnedRouteCard)에서 심사 중 + 확정된 오더를 하나의 배열로 관리
export interface SecuredOrder extends OfficeOrder {
    status: OrderStatus;                  // 단일 통합 라이프사이클 상태
    capturedDeviceId: string;
    capturedAt: string;
    /**
     * 🎯 **판 — 이 콜을 잡을 때 통과한 목적지 시** (전수표 #30 · 목업 `confirmCall` 의 caughtDest).
     *    확정 순간 서버가 적는다(`filterManager.goalOfCall`) — 복귀 대기면 목적지·집 중 하나, 둘 다면 집.
     *    «복귀콜을 잡았나»(`goalCitiesOf`)가 이 값으로 갈린다. 🔴 메모리에만 — 서버가 다시 켜지면 하차지의 시로 대신한다.
     */
    goalCity?: string;
    /**
     * 🏁 **하차한 시각** (장부 `orders.completedAt`). 없으면 아직 안 내렸거나 옛 행이다.
     * 화면의 사이클 경계가 이걸 본다 (`deckOfCycle` — 버그 대장 #40).
     */
    completedAt?: string | null;
    /** 🧹 취소·방출한 시각 (장부 `orders.terminatedAt` · 전수표 #65) — 하차는 `completedAt`, 취소는 이것 */
    terminatedAt?: string | null;
    /** 👀 미리보기 콜 — 확정 전이라 아직 안 잡은 콜이다 (용어집 §9) */
    isPreview?: boolean;
    /** 🎨 판정 스냅샷 — 심사 1회, 불변 ([[JudgmentSnapshot]]) */
    judgment?: JudgmentSnapshot;
    kakaoCalculatedFare?: number;
    kakaoTimeExt?: string;
    routePolyline?: Array<{ x: number; y: number }>;
    /** 🎨 구간이 끝나는 자리 — `routePolyline` 을 콜 색으로 칠하려면 이 경계가 필요하다 (이식 B1) */
    sectionEnds?: number[];
    /** 🧭 구간마다 어느 정거장인가 — `sectionEnds` 와 같은 길이. 구간의 **색 주인**이다 (이식 B2) */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    totalDistanceKm?: number;
    totalDurationMin?: number;
    kakaoSoloDistanceKm?: number;
    kakaoSoloDurationMin?: number;
    approachDurationMin?: number;
    osrmError?: string;
    sectionEtas?: string[];
    sectionDriveMin?: Array<number | null>;
    routeComputedAt?: string;
    arrivedPickupAt?: string;
    arrivedDropoffAt?: string;
    pickupEta?: string;
    dropoffEta?: string;
    settlement?: SettlementInfo;
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
    isSharedMode: boolean;          // 첫짐/합짐 분기 (true면 합짐 경유, false면 첫짐 수동)
    driverAction: DriverAction;     // [V2] 기사 행동 상태 (WAITING, DRIVING, LOADING, UNLOADING, RESTING)
    dispatchPhase: DispatchPhase;   // [V2] 콜 잡기 전략 단계 (STANDBY, GATHERING, DELIVERING) — 파생값
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
    /**
     * 📋 **상차 목록** — 원달앱이 상차지를 거르는 읍·면·동 목록 (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
     *    서버가 필터 영역에서 파생한다(`filterManager.rebuildPickupList`) · 저장하지 않는다. 아직 안 만들었으면 undefined.
     */
    pickupKeywords?: string[];
    /**
     * 🗺️ **상차 영역을 지도에 그릴 재료** (기사님 2026-09-15 «현위치 영역에 교집합 영역이 보이지 않는다»).
     *    목록을 만든 그 순간의 값 — 관제웹이 이것으로 shared `pickupAreaPlan` 을 다시 불러 **원으로 잘라** 도형을 칠한다.
     *    ⚠️ **앱에 안 내려간다** (`APP_FILTER_KEYS` 밖). 저장하지 않는다 — `rebuildPickupList` 가 목록과 함께 만든다.
     */
    pickupArea?: {
        /** 목록을 만든 내 위치 */
        at: { x: number; y: number };
        homeCity: string | null;
        homeOn: boolean;
        /** 집 방향 콜을 쥐었나 (`homeCallsOf`) */
        homeCaught: boolean;
        /** 라인 띠를 썼나 — 관제웹은 지금 그리는 경로 선으로 띠를 잰다 */
        hasLine: boolean;
    };
    destinationGroups?: Record<string, string[]>; // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customCityFilters: string[];    // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    detourRadiusKm?: number;      // (합짐 모드) 경로 주변 이탈 허용 반경 (기본값 5km, DB설정값)
    userOverrides?: boolean;        // 기사가 팝업에서 수동으로 필터(destinationKeywords 등)를 조작했는지 여부(서버 덮어쓰기 방지용)

    /**
     * 📐 **마름모의 모양 — 국면 밖 한 벌** (이식 C3-2 · 2026-09-11 · `QuadShape`).
     *
     * 관제웹 지도가 «가는 길목»을 이 셋으로 그린다. 국면과 무관한 값이라 국면 그릇이 아니라
     * 여기(사용자당 한 벌)에 실려 온다 — DB 자리는 `user_filters`.
     *
     * ⚠️ **앱에는 안 내려간다** (`scrap.ts` 가 뗀다) — 앱은 그물 모양을 모르고,
     *    서버가 이미 읍·면·동으로 펼쳐 `destinationKeywords` 로 보낸다
     *    (`detourRadiusKm`·`callDiscountPct` 와 같은 처지).
     */
    srcAngleDeg?: number;
    dstAngleDeg?: number;
    quadRadiusKm?: number;

    /**
     * 📐 **반경 넷을 목적지까지 거리에 맞춰 자동으로** (이식 C4-12 · 2026-09-12).
     *
     * 기사님: *"목적지와의 거리에 따라 … **자동으로 바뀌어 주면 좋겠다.
     * 그래서 자동, 수동으로** 만들어 주는 거야."*
     *
     * 🔴 **반경 넷은 여기 저장되지 않는다 — 파생이다** (규칙 ③). 저장하는 것은
     *    «자동인가»와 «기준 거리» 둘뿐이고, 값은 `shared` 의 `autoRadii` 가 그때그때 낸다.
     *    앱에는 **계산된 반경**이 내려간다 — 앱은 모드를 모른다.
     * ⚠️ 각도 둘은 자동이 손대지 않는다 — 거리와 무관한 «방향 허용폭»이다.
     */
    /**
     * 🛣️🔷 **노선 / 동선 — 그물을 어떤 모양으로 볼까** (전수 조사 ①-9 · 2026-09-12).
     *    노선(true)은 경로 양옆(라인반경) ∪ 목적지, 동선(false)은 내 위치 → 목적지 마름모 하나.
     * 🔴 예전엔 관제웹 `Dashboard` 의 `useState` 하나였다 — **서버가 몰라** «동선»을 골라도
     *    판정·앱 목록은 계속 노선이었고, 새로고침하면 노선으로 돌아갔다. 목업이 그 모양이다 —
     *    이것은 **필터 값**이다. DB 자리는 `user_filters.route_mode`.
     * ⚠️ 앱에는 안 내려간다 — 앱은 그물의 결과(동 목록)만 본다.
     */
    routeMode?: boolean;
    radiusAuto?: boolean;
    /** 기준 거리 km — «지금 값이 몇 km 갈 때 맞춘 것인가». 근거는 `RADIUS_BASE_KM_DEFAULT` */
    radiusBaseKm?: number;
    /**
     * 📏 **마름모 축의 길이(km) — 서버가 잰 «재료»** · 읽기 전용 · DB 저장 안 함.
     *
     * 첫짐은 «내 위치 → 목적지», 합짐은 «마지막 하차지 → 목적지». 배율은 여기서 안 싣는다 —
     * **`effectiveRadii` 가 이 거리와 `radiusBaseKm` 으로 어디서든 낸다** (규칙 ③).
     *
     * ⚠️ 처음엔 배율(`radiusScale`)을 서버가 재서 실었다. 그러자 화면이 기준거리를 끄는 동안
     *    **지도가 못 따라왔다** — 배율을 다시 낼 재료가 없었다 (2026-09-12 전수 조사 1단계 실측).
     *    서버는 재료만 싣고 셈은 한 함수가 한다.
     * ⚠️ 자동·수동과 무관하게 싣는다 — 그래야 수동에서 «자동이면 얼마가 되나»를 미리 볼 수 있다.
     *    못 재면 **없다** — 0 으로 지어내지 않는다.
     * 🔄 **2026-09-14 — 하루에 한 번 잰 값을 들고 있는다** (`heldRadiusDistanceKm`). `null` 은 «다시 구하기» —
     *    관제웹이 보내면 서버가 지금 위치로 다시 잰다.
     */
    radiusDistanceKm?: number | null;

    /**
     * 🚚 **기사님이 «받겠다»고 고른 차종** (이식 C4-6b · 2026-09-12).
     *
     * 기사님: *"내 차가 1톤이지만 **라보 다마스 짐만 받겠다** … 합짐을 위해 필요."*
     *
     * 🔴 **`allowedVehicleTypes` 와 답하는 질문이 다르다** (규칙 ⑤-4 ⑤):
     *      · `acceptedVehicleTypes` «나는 어떤 짐을 **받겠다**고 했나» — **기사님**이 정한다
     *      · `allowedVehicleTypes`  «지금 짐 때문에 어떤 것이 **막혔나**» — **서버**가 파생한다
     *    겹쳐 두면 기사님이 고른 것이 **짐 한 번에 지워진다** (2026-08-10 사고).
     * 🔴 **비어 있으면 «제한 없음»** — 새 칸이 생겨도 아무것도 안 바뀌는 것이 기본이다.
     * ⚠️ **앱에 안 내려간다** (`APP_FILTER_KEYS` 밖) — 앱은 서버가 낸 교집합
     *    (`allowedVehicleTypes`) 하나만 본다.
     */
    acceptedVehicleTypes?: string[];

    /**
     * 🚫 **제외 지역 — 국면 밖 한 벌** (이식 C2 · 2026-09-11 · 명세 §3).
     *    *"거긴 안 간다"* 는 그 지역이지 그 국면의 사정이 아니다. DB 자리는 `user_filters`.
     *    키 문법은 `S|도` · `R|시군구` · `D|시군구|동` — 규칙은 `shared/callNet.ts` 하나다.
     *
     * ⚠️ **앱에는 안 내려간다** (`scrap.ts` 가 뗀다). 서버가 `destinationKeywords` 를
     *    만들 때 이미 뺐으므로 앱은 제외를 몰라도 된다.
     */
    excludedRegions?: string[];
    /**
     * 🏘️ **지금 관내로 재고 있나** — 서버가 파생해 화면에 알린다 (이식 C4-8b · 2026-09-11).
     *
     * 기사님 2026-09-11: *"우린 집으로 갈건지 말껀지만 있어"* — 관내는 **고르는 것이 아니라
     * 파생**이다 (`isLocalPhase`: 목적지에 다 왔고 집에서는 멀어졌다).
     *
     * 🔴 **읽기 전용이다.** 관제웹이 이 값을 **보내지 않는다** — 보내면 파생과 손입력이
     *    갈라진다 (규칙 ③). 서버가 그물을 그릴 때마다 다시 정한다.
     * 🔴 **DB 에 저장하지 않는다.** 파생값을 저장하면 «어제 관내»가 오늘 되살아난다.
     * 🔴 **앱에 안 내려간다** (`APP_FILTER_KEYS` 밖) — 앱은 그물(동 목록)만 받으면 되고,
     *    관내인지 아닌지는 그 목록에 이미 녹아 있다.
     */
    localMode?: boolean;
    /**
     * 🎯 **그물이 실제로 향하는 시** — 서버가 파생 · 읽기 전용 · DB 저장 안 함 (2026-09-12 전수 조사 ①-1).
     *
     * `callTarget` 이 HOME 이면 **집이 있는 시**, 아니면 `destinationCity`. 기사님이 정한
     * `destinationCity` 는 복귀를 켜도 **한 번도 안 바뀐다** — 예전엔 HOME 으로 갈 때 그것을
     * 집 시로 덮어써서, 돌아올 때 `activeFilter || baseFilter` 가 이미 덮인 값에서 끝나
     * **파주시가 광주시로 굳었다.** 툴팁 «끄면 원래 목적지로»가 거짓이었다.
     * 🔴 «저장했다 되돌리는» 대신 **매번 파생**한다 (규칙 ③). 목업이 그 모양이다 —
     *    복귀를 켜면 목적지가 바뀌는 게 아니라 **얹힌다.**
     * 앱에는 이 값이 `destinationCity` 자리에 실려 간다 (앱은 «어디로 가나» 하나만 안다).
     */
    goalCity?: string;
    /**
     * 🏠 **살아 있는 목적지 전부** — 서버가 파생 · 읽기 전용 · DB 저장 안 함 (전수표 #6 · `callNet.activeGoals`).
     *    복귀 끔: [목적지] · 복귀 켬·복귀콜 없음: [목적지, 집] · 복귀콜 잡음: [집]. 지도가 목적지마다 그물을 그린다.
     *    🔴 앱에 안 내려간다 — 앱은 합친 동 목록(`destinationKeywords`)만 본다.
     */
    goalCities?: string[];

    // ── 단가 판정 모델 (2026-08-13 확정 · docs/지금/필터.md) ──
    // 셋 다 optional: 구버전 앱은 이 키들을 파싱하지 않으므로 무시된다 (호환).
    // minFare/maxFare 는 구버전 앱 호환용으로 유지 — 새 앱은 ratePerKm 이 있으면 그걸 쓴다.
    /** 차종별 하한 단가(원/km) = 실수령 시세 × (1 − 콜할인율). 판정: fare ≥ 배송거리 × ratePerKm[차종] */
    ratePerKm?: Record<string, number>;
    /** 콜할인율 — 시세 대비 허용 할인 %. 100 = "전부"(금액 무관) */
    callDiscountPct?: number;
    /**
     * 사용 중인 적재 **박스 수** (내 1t 트럭 = 100박스 · `TRUCK_CAPACITY_SLOTS`).
     * 명목값이며 통화 확인 시 갱신.
     * ⚠️ 예전엔 "적재 칸 (1t = 5칸)"이라 적혀 있었다 — **옛 5칸 축**이라 20배 어긋났다.
     *    앱·서버·관제웹이 함께 읽는 칸이라 오독 비용이 크다 (2026-08-29 정정)
     */
    slotsUsed?: number;
    /** 지금 어느 국면을 콜 잡기하는가 — 기사님이 요약줄 스와이프로 고른다 (기본 DEST) */
    callTarget?: CallTarget;
    /**
     * 🗺️ 키워드 트랩 — 키워드로 시작하는 더 긴 다른 지명 (예: 남동 → [남동구]).
     * 부분 문자열 오탐 방지(regionMatch ④)의 사전. destinationKeywords 에서 매번 파생.
     */
    keywordTraps?: Record<string, string[]>;
}

/**
 * 📦 **앱이 필터에서 읽는 키 — 유일한 원천** (이식 C5 · 2026-09-11 · 명세 §5).
 *
 * 서버는 하트비트 응답에 **이 열다섯만** 싣는다 (`routes/scrap.ts`).
 *
 * 🔴 **골라 싣는다, 떼어내지 않는다.** 예전엔 «떼는 키»를 손으로 나열했다
 *    (`const { destinationGroups, dispatchPhase, … } = activeFilter`). 그러면 **새 칸이
 *    생길 때마다 그 목록에 넣어야 하고, 안 넣으면 조용히 앱으로 간다.** 2026-09-11 하루에만
 *    마름모 셋과 제외 지역을 그렇게 손으로 넣었다 — 한 번만 잊으면 규격이 어긋난다.
 *    골라 싣는 쪽은 **기본이 «안 간다»** 라 안전하다.
 *
 * ⚠️ **`orderKm`·`pickerAlarmMinFare` 는 `AutoDispatchFilter` 에 없다** — 조립할 때 얹는다
 *    (경로 순서 맵 · 픽커 알람 하한). 그래서 이 표는 «앱이 읽는 키»이지
 *    «평면 필터의 부분집합»이 아니다.
 *
 * 🔴 **표 ↔ 앱(Kotlin)이 어긋나면 `appFilterKeys.test.ts` 가 잡는다.** 앱이 읽는데
 *    서버가 안 보내면 **조용한 고장**이고(빈 값으로 거른다), 서버가 보내는데 앱이 안 읽으면
 *    **낭비**다 (2026-08-22 에 `destinationGroups` 하나가 응답의 27%였다).
 */
export const APP_FILTER_KEYS = [
    'isActive', 'isSharedMode',
    'pickupRadiusKm', 'destinationCity', 'destinationRadiusKm',
    'destinationKeywords', 'customCityFilters', 'keywordTraps',
    /* 📋 상차 목록 — 1단계는 옛 칸(pickupRadiusKm · orderKm)과 함께 간다 (필터.md «올리는 순서») */
    'pickupKeywords',
    'excludedKeywords', 'allowedVehicleTypes',
    'minFare', 'maxFare', 'ratePerKm',
    /* ⬇️ 평면 필터에 없다 — 조립할 때 얹는다 */
    'orderKm', 'pickerAlarmMinFare',
    /* ⏱️ 배차망별 대기 시간 — 원천 DB user_settings (docs/지금/배차망별_대기_시간.md) */
    'safeCancelSecInsung', 'safeCancelSecHwamul24', 'pickerAlarmDetailSec',
] as const;

/**
 * **타겟** — 기사님이 필터의 복귀 토글로 고른다 (C4-5 · 2026-09-11).
 *
 *   DEST(노선행) ↔ HOME(복귀행) · 관내는 파생(`localMode`)
 *
 * 스와이프 순서가 하루의 흐름과 같다: 목적지로 가다가, 거의 도착하면 그 동네 콜을 잡고,
 * 다 내리면 집 방향으로. (docs/지금/필터.md §3)
 *
 * ⚠️ `DispatchPhase`(STANDBY/GATHERING/DELIVERING)와 **다른 것**이다.
 *    · `DispatchPhase` — 지금 짐이 얼마나 실렸나. **데이터에서 파생**된다 (기사님이 못 고른다)
 *    · `CallTarget`     — 어느 방향을 콜 잡기하나. **기사님이 고른다**
 *    둘은 직교한다: "복귀행이면서 합짐 수집 중"이 정상적인 상태다.
 *
 * 🔴 국면 전환은 **필터만 바꾼다. 콜 상태는 절대 건드리지 않는다.**
 *    옛 `startTwoTrack` 은 전환하면서 활성 콜을 전부 `ORDER_COMPLETED` 로 만들었다 —
 *    기사님: *"콜은 무조건 배달을 해서 완료되어야 한다."* 배달하지 않은 콜이
 *    완료로 기록되면 정산·운행일지가 통째로 틀어진다.
 */
/**
 * 🧭 **콜을 어디로 향해 찾나** — 기사님이 고르는 것은 **둘뿐**이다.
 *
 * 기사님 2026-09-11: *"우린 **집으로 갈건지 말껀지만** 있어."*
 *
 * 🔴 **`'LOCAL'`(관내)을 걷었다** (이식 C4-8b-2). 관내는 고르는 것이 아니라 **파생**이다 —
 *    `isLocalPhase()` 가 «목적지에 다 왔고 집에서는 멀어졌다»를 보고
 *    `AutoDispatchFilter.localMode` 로 알린다. 목업이 그 모양이다.
 * 🔴 **같은 일을 하는 길을 둘 두지 않는다** (규칙 ③) — 그러면 언젠가 갈라진다.
 *    이 레포가 경유 4벌 · 상태목록 3벌 · 시별칭으로 이미 당한 모양이다.
 * ⚠️ 걷어도 안전한 근거: `callTarget` 은 **DB 에 없고**(메모리뿐) **앱이 안 읽는다.**
 */
export type CallTarget = 'DEST' | 'HOME';

export const CALL_TARGET_LABEL: Record<CallTarget, string> = {
    DEST: '노선행',
    HOME: '복귀행',
};

/**
 * **이 필터로 콜을 잡아도 되는가.**
 *
 * 🔴 2026-08-12 — 빈 필터가 "제한 없음"으로 읽히고 있었다.
 *
 *    앱 (`InsungParser.kt`):
 *        if (filter.destinationKeywords.isEmpty()) true   // ← 아무 데나 통과
 *    서버 (`OrderEvaluator`):
 *        if (isSharedMode && destinationKeywords.length > 0) { ...검사... }
 *
 *    **두 겹이 같은 방향으로 열려 있었다.** 경유 계산이 0개를 내거나(경로 실패)
 *    목적지 도시가 비면, `isActive` 는 켜진 채 도착지 조건만 사라진다.
 *    필터가 느슨해지는 게 아니라 **없어지는** 것이다.
 *
 *    도착지가 정의되지 않은 상태는 "제한 없음"이 아니라 **"필터가 고장났음"** 이다.
 *    앱 기본값을 안전 방향으로 돌린 것(v1.3)과 같은 판단이다 —
 *    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
 *
 * @returns 콜 잡기해도 되면 `null`, 안 되면 **왜 안 되는지** (그대로 로그·화면에 쓴다)
 */
export function callFilterBlocker(filter: AutoDispatchFilter): string | null {
    /* 📋 빈 상차 목록은 «제한 없음»이 아니라 고장이다 (규칙 ④ · 필터.md «상차 목록»). 아직 안 만들었으면(undefined) 옛 흐름이라 막지 않는다 */
    if (Array.isArray(filter.pickupKeywords) && filter.pickupKeywords.length === 0) return '상차 목록이 비었습니다 — 내 위치 둘레에서 동을 못 찾았습니다';
    if (filter.isSharedMode) {
        // 합짐은 경로에서 경유가 나와야 성립한다. 경유가 없으면 "가는 길"이 없는 것이다
        if (!filter.destinationKeywords?.length) return '경유가 아직 안 잡혔습니다';
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
 * 다만 경유 파생값은 기본 설정에도 없는 값이라 명시적으로 비운다.
 * 비워 두면 `recalculateDerivedFields` 가 **오늘의** 목적지 도시로 다시 만든다.
 * (어제 경로에서 나온 지역으로 오늘 콜 잡기하면 안 된다)
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
        /* 📏 어제 잰 자동 반경 거리가 오늘 살아나지 않는다 (필터.md §10-1 ③ · 2026-09-14) */
        radiusDistanceKm: undefined,
    };
}

/**
 * [계층 3] 콜 잡기 전략 파생 함수 (Pure Function)
 * DriverAction(기사 행동) + 확정 오더 수를 조합하여 DispatchPhase를 자동 계산합니다.
 * DB에 저장하지 않으며, 하드코딩(0km, 10km)을 원천 차단합니다.
 */
/**
 * 🔴 **"운행 중"은 출발한 사실에서 나온다 — 지금 몸이 뭘 하는지가 아니라.**
 *
 * 2026-08-14 사고: 예전에는 `driverAction === 'DRIVING'` 이면 DELIVERING 이었다.
 * 그런데 `driverAction` 은 **정류장마다 바뀐다** — 하차지에 도착하면 `UNLOADING` 이 되고,
 * 그 순간 DELIVERING 이 풀렸다. 짐이 2건이면 정류장이 4곳이니 **출발을 네 번 눌러야** 했다.
 *
 * 풀리면서 딸려 온 것들: 운행중 국면 설정(우회 0)이 풀려 경유가 다시 넓어지고,
 * 지나온 구간 제거가 멈추고, 🚀 출발 버튼이 다시 나타나고, 요약줄이 "대기"로 바뀌었다.
 * **증상 넷이 이 한 줄에서 나왔다.**
 *
 * 기사님에게 "운행 중"은 *"이제 그만 모으고 간다"* 이고, 그건 **한 번 켜지면 마지막 하차까지
 * 유지되는 상태**다. 중간에 짐을 내리는 건 그 안에서 일어나는 일이지 운행이 끝난 게 아니다.
 *
 * 그래서 판정을 **출발했는가**(`hasDeparted`)로 옮겼다. `driverAction` 은 순수하게
 * "지금 몸이 뭘 하는가"로 남아 화면 표시·도착 마일스톤·통계에 쓰인다 —
 * **콜 잡기 기준을 흔들지 않는다.**
 *
 * 끝나는 조건은 따로 없다. 마지막 콜을 하차 완료하면 콜이 0건이 되어 STANDBY 로 돌아간다.
 */
export function deriveDispatchPhase(
    confirmedOrderCount: number,
    hasDeparted: boolean
): DispatchPhase {
    if (confirmedOrderCount === 0) return 'STANDBY';
    return hasDeparted ? 'DELIVERING' : 'GATHERING';
}


/**
 * [계층 3] DispatchPhase에 따라 실제 적용할 우회 반경을 결정합니다.
 * DELIVERING(운전중) 상태일 때만 0km를 강제하고, 그 외에는 기사님의 원본 설정값을 그대로 사용합니다.
 * 이 함수를 통해서만 detourRadiusKm를 결정하므로 하드코딩이 원천 차단됩니다.
 */
/**
 * 우회 반경 기본값. **한 곳에서만 정한다.**
 *
 * 🔴 2026-08-12 — 같은 기본값이 네 갈래로 갈라져 있었다.
 *      dispatchEngine  `?? 10`   (경유 계산에 실제로 쓰이던 값)
 *      socketHandlers  `?? 1`
 *      routes/filters  `?? 0`
 *      DB · 세션 기본값 5
 *    어느 값이 진짜인지 코드로는 알 수 없었다. DB 기본값(5)에 맞춘다.
 */
export const DEFAULT_DETOUR_RADIUS_KM = 5;

export function getEffectiveDetourRadius(
    _phase: DispatchPhase,
    baseDetourRadiusKm: number
): number {
    /**
     * 🔴 2026-08-14 — **강제 0 을 걷어냈다.** (docs/지금/필터.md §3)
     *
     * 예전에는 `DELIVERING` 이면 무조건 0 을 돌려줬다. 국면별 설정이 없던 시절,
     * 운행 중 우회를 끊을 방법이 이것뿐이었기 때문이다.
     *
     * 이제 운행중(`drive`) 국면이 **자기 경유 허용값을 갖는다**(기본 0). 기사님이
     * 3km 정도는 허용하고 싶으면 그렇게 저장할 수 있어야 한다 —
     * 여기서 덮어쓰면 그 설정이 영영 무시된다.
     *
     * 함수는 남겨 둔다. 호출부가 "경유 반경은 여기서만 정한다"는 계약을 지키고 있고,
     * 나중에 국면과 무관한 상한이 필요해지면 다시 여기에 넣는다.
     */
    return baseDetourRadiusKm;
}

// 서버 전용: 다이내믹 요율 계산 엔진 파라미터 (앱으로 전송하지 않음)
export interface PricingConfig {
    vehicleRates: Record<string, number>;  // 차종별 km당 적정 단가 (예: { "1t": 1000, "다마스": 800 })
    agencyFeePercent: number;              // 퀵사(사무실) 수수료율 (예: 23)
    maxDiscountPercent: number;            // 기사 수용 가능 최대 할인율 (예: 10)
}

// 스마트 경유 전용 데이터 구조 (PinnedRoute 등 프론트엔드 UI용)
export interface DetourRouteData {
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
    acceptedCount: number;            // 선점(확정 버튼 자동 클릭)이 성공해서 수락된 배차 갯수
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
    /**
     * 👀 **미리보기 콜** — 기사님이 **확정을 누르기 전에** 팝업 3장(적요상세·출발지·도착지)을
     *    읽어 판정만 받아 보는 콜 (기사님 확정 2026-08-22 · 용어집 §9).
     *
     * 🔴 아직 안 잡은 콜이라 **인성에서는 아무 일도 일어나지 않았다** — 취소할 것이 없다.
     *    그래서 취소 카운트(배차망 10회 패널티)에 넣지 않는다. 확정을 누르면 딱지가 벗겨진다.
     *
     * ⚠️ **선택 필드로 둔다.** 없으면 옛 동작 — 갱신 안 된 APK 가 그대로 돈다.
     */
    isPreview?: boolean;
}

// 1-B. 앱폰 -> 서버: 2차 호출 (상세 페이지 진입 후 상세 정보 파싱 완료 시)
export interface DispatchDetailedRequest {
    step: 'DETAILED';
    deviceId: string;
    order: OfficeOrder;
    capturedAt: string;
    matchType: 'AUTO' | 'MANUAL';
    listRanking?: number;
    /** 👀 미리보기 콜 — 뜻과 규칙은 `DispatchBasicRequest.isPreview` 에 적었다 */
    isPreview?: boolean;
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

/** 📵 오프라인이 된 까닭 — 앱이 스스로 말해 준 것만 담는다 (모르면 `undefined`) */
export const DEVICE_OFFLINE_REASONS = ["ACCESSIBILITY_OFF", "APP_SHUTDOWN"] as const;
export type DeviceOfflineReason = typeof DEVICE_OFFLINE_REASONS[number];
export function isDeviceOfflineReason(v: unknown): v is DeviceOfflineReason {
    return typeof v === "string" && (DEVICE_OFFLINE_REASONS as readonly string[]).includes(v);
}
/** 📵 화면에 적을 말 — 기사님이 **무엇을 하셔야 하는지**가 갈리므로 낱말도 가른다 */
export const DEVICE_OFFLINE_LABEL: Record<DeviceOfflineReason, string> = {
    ACCESSIBILITY_OFF: "접근성 꺼짐",
    APP_SHUTDOWN: "앱 꺼짐",
};

/**
 * 🎛️ **기기 모드 셋 — 자동 · 알람 · 대기** (기사님 확정 2026-08-30 · [docs/지금/기기_모드.md]).
 *
 * | 화면 이름 | 키 | 필터 | 앱이 누르나 | 알람 |
 * |---|---|---|---|---|
 * | 자동 | `AUTO` | 돈다 | ✅ | — |
 * | 알람 | `ALARM` | 돈다 | ❌ | ✅ |
 * | 대기 | `MANUAL` | 돈다 (기록용) | ❌ | ❌ |
 *
 * 🔴 **「대기」에 새 키를 만들지 않았다.** 동작이 지금 `MANUAL` 과 완전히 같아서,
 *    키를 유지하면 서버·앱의 기존 분기가 한 줄도 안 바뀐다. 바뀌는 것은 화면 이름뿐이다.
 *
 * 🔴 **`STANDBY` 를 쓰지 않는다** — `dispatchPhase` 가 이미 그 낱말로 「첫짐 탐색」을
 *    가리킨다. 같은 말에 두 뜻을 주면 로그를 읽을 때 어느 쪽인지 모른다.
 *
 * 🔴 **«필터가 도는가» 와 «앱이 누르는가» 는 다른 물음이다** (2026-08-30 에 갈랐다).
 *    자동·알람은 둘 다 필터가 돈다(`hasFilteringDevice` → `isActive`). 누르는 것은 자동뿐이다
 *    (앱의 `currentMode == "AUTO"`). 값이 둘이던 시절엔 그 둘이 같은 말이라 한 값으로 썼는데,
 *    앱의 `decide()` 가 `isActive` 로 끊으므로 **섞어 두면 알람에서 필터가 통째로 죽는다.**
 *
 * 🔴 **모드 이름을 다른 값으로 조립하지 않는다.** 앱이 `"${mode}_CLICK"` 으로 딱지를 만들어
 *    `"ALARM_CLICK"` 이 태어났고, 서버의 직접콜 보호가 그걸 못 알아봐 **기사님 콜이 강제
 *    취소**됐다. 콜의 출신은 `SessionManager.clickOrigin`(누가 눌렀나) 한 곳에서만 파생한다.
 *
 * 알람·대기로 잡은 콜은 기사님이 직접 누른 것이라 **직접콜**이고 심사하지 않는다 (규칙 ①).
 */
export const DEVICE_MODES = ["AUTO", "ALARM", "MANUAL"] as const;
export type DeviceModeType = typeof DEVICE_MODES[number];

/** 모르는 값을 모드로 받지 않는다 — 값이 늘어도 여기 한 곳만 본다 (규칙 ③) */
export function isDeviceMode(v: unknown): v is DeviceModeType {
    return typeof v === "string" && (DEVICE_MODES as readonly string[]).includes(v);
}

/** 화면에 적히는 이름 — MANUAL 의 화면 이름은 «직접» (기사님 확정 2026-08-30 · 구 «대기» — «쉬는 중»으로 오독되던 이름이라 직접콜 가족으로 통일) */
export const DEVICE_MODE_LABEL: Record<DeviceModeType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
};

/**
 * 🌐 **배차망 값 표준 — 여기 한 벌뿐이다** (기사님 확정 2026-08-30 · 픽커_수집.md §6-전).
 *
 * «어느 배차망에서 온 것인가»는 6하원칙의 **어디서**다. 앱이 모든 요청에 싣고,
 * 원장(orders·intel)의 `targetApp` 열에 저장되며, 화면 배지와 통계 필터가 읽는다.
 *
 * 🔴 예전엔 이 값의 매핑·폴백이 앱 4곳 + 서버 3곳에 흩어져 있었다 — 배차망을 하나
 *    더할 때마다 일곱 곳이 각자 갈라질 판이었다 (#76~#82 «한 값 여러 곳» 클래스).
 *    코드값·라벨·기본값 전부 **여기서만** 늘린다. (앱은 Kotlin 이라 이 파일을 못 읽는다 —
 *    앱 쪽 한 곳은 `core/TargetApp.kt` 이고, 값이 어긋나면 서버 수신이 기본값으로
 *    떨어져 로그에 남는다)
 */
export const TARGET_APPS = ["insung", "hwamul24", "kakaopicker"] as const;
export type TargetAppType = typeof TARGET_APPS[number];
export const DEFAULT_TARGET_APP: TargetAppType = "insung";

export function isTargetApp(v: unknown): v is TargetAppType {
    return typeof v === "string" && (TARGET_APPS as readonly string[]).includes(v);
}

/** 화면 배지용 이름 — 지금은 텍스트만 (기사님: 아이콘은 나중에) */
export const TARGET_APP_LABEL: Record<TargetAppType, string> = {
    insung: "인성",
    hwamul24: "24시",
    kakaopicker: "픽커",
};

/**
 * 🖱️ **잡은 방식 — 6하원칙의 «어떻게»** (기사님 확정 2026-08-30).
 *
 * 원장 `orders.capturedVia` 에 기록만 한다: `AUTO`(앱이 누름) · `ALARM`(알람 듣고
 * 기사님이 누름) · `MANUAL`(기사님이 직접 골라 누름).
 *
 * 🔴 **기록이지 판단이 아니다.** 서버의 직접콜 보호(심사 없음·강제취소 없음)는
 *    여전히 `matchType`(AUTO/MANUAL 둘)만 본다 — #75 에서 모드 이름이 출신으로 새어
 *    기사님 콜이 취소된 사고 그대로, 이 값을 보호 분기에 쓰면 같은 사고가 재발한다.
 *    알람·직접은 보호상 똑같은 «기사님이 누른 콜»이고, 여기서는 일지가 그 둘을
 *    가려 보게 할 뿐이다 (⑤-4 ⑤: 읽는 곳 — 일지·통계만).
 */
export const CAPTURED_VIA = ["AUTO", "ALARM", "MANUAL"] as const;
export type CapturedViaType = typeof CAPTURED_VIA[number];

export function isCapturedVia(v: unknown): v is CapturedViaType {
    return typeof v === "string" && (CAPTURED_VIA as readonly string[]).includes(v);
}

/** 일지·화면용 이름 */
export const CAPTURED_VIA_LABEL: Record<CapturedViaType, string> = {
    AUTO: "자동",
    ALARM: "알람",
    MANUAL: "직접",
};

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 콜 잡기 리스트 화면
    | 'LIST_COMPLETED'        // 완료 리스트 화면 — 여기서도 "리스트로 돌아온 것"이다
    | 'DETAIL_PRE_CONFIRM'    // 선점 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
    /**
     * 🚚 **수락한 뒤의 운행 화면 — 픽커에만 있다** (기사님 지시 2026-09-02).
     *
     * 기사님: *"내가 관제앱에서 현 페이지를 확인할 수 있어야 해.. 그래야 일을 시작할 수 있지.
     * 관제에서는 폰의 상황을 잘 알아야 해. 그래서 가장 위에 있는 거야."*
     *
     * 인성은 확정하면 리스트로 돌아가고 **진행은 GPS가 답한다.** 픽커는 반대로
     * **화면이 진행을 말해 준다** — 그래서 인성 목록 아홉에는 갈 자리가 없었고,
     * 운행 중 다섯이 전부 `UNKNOWN`(관제웹에 «알 수 없는 화면» 빨간 깜빡임)으로 떴다.
     * 기사님이 가장 알고 싶은 순간에 관제가 가장 모르는 상태였다.
     *
     * 🔴 **마일스톤과는 다른 것이다.** 이건 «지금 무슨 화면인가»이고, 마일스톤은
     * «이 콜이 어디까지 왔나»다. 마일스톤은 넷 그대로 안 늘어난다
     * ([기획/배차망_통합.md] §1 — 기사님: *"모든 페이지를 마일스톤에 넣으면
     * 앱이 추가될 때마다 마일스톤이 생겨날 것 같아"*).
     *
     * ⚠️ 배차망이 늘어도 여기가 계속 부풀면 안 된다. 화면 «이름표»는 배차망별로
     * 갈라 두었으므로(`screenLabelsOf`), 다음 배차망은 **자기 이름표만** 더한다.
     */
    | 'RUN_TO_PICKUP'         // 🚚 픽커 — 픽업지로 이동 중
    | 'RUN_AT_PICKUP'         // 🚚 픽커 — 픽업지 도착, 픽업 완료 대기
    | 'RUN_TO_DROPOFF'        // 🚚 픽커 — 배송지로 이동 중
    | 'RUN_AT_DROPOFF'        // 🚚 픽커 — 배송지 도착, 배송 완료 대기
    | 'RUN_DONE'              // 🚚 픽커 — 배송 완료
    /**
     * 🏠 **일을 안 잡고 있는 화면** (2026-09-02 · 기사님 실측 제보로 신설).
     *
     * 기사님: *"픽커는 지금 홈에 있는데 콜 리스트로 나오고 있어."*
     *
     * 픽커는 앱을 켜면 홈(「시작하기」 버튼이 있는 화면)에 있고, 거기서 리스트로 들어간다.
     * 인성에는 이 층이 없다 — 켜면 바로 리스트다. 그래서 목록에 자리가 없었고
     * **홈이 «알 수 없는 화면»(빨간 깜빡임)** 으로 떨어졌다.
     *
     * 🔴 **«모름»과 «홈»은 다른 답이다.** 앞은 *"못 읽고 있다"*, 뒤는 *"읽었고, 대기 중이다"* —
     * 관제웹에서 이 둘이 같아 보이면 기사님이 폰이 죽은 줄 안다.
     * (규칙 ⑤-4 ⑤ — 한 값이 두 사실을 답하게 두지 않는다)
     */
    | 'HOME'                  // 🏠 배차망 홈 — 리스트에 들어가기 전
    | 'UNKNOWN';              // 알 수 없는 화면

/**
 * 🔴 **"콜에서 손을 뗀 화면"의 정의 — 여기 하나뿐이다.**
 *
 * 2026-08-14 유령 카드 사고. 앱은 `LIST` 와 `LIST_COMPLETED` **둘 다** 리스트 복귀로 보고
 * 세션을 리셋하는데(`HijackService`), 서버는 `screenContext === 'LIST'` **하나만** 인정했다.
 * 그래서 완료 리스트로 빠져나가면 **앱은 다음 콜을 찾는데 서버는 그 콜을 계속 쥐고 있었다** —
 * 관제탑에 결재 카드가 영원히 남고, `isActive` 도 꺼진 채라 콜 잡기가 통째로 멈췄다.
 *
 * `LIST_COMPLETED` 는 애초에 이 타입에 **있지도 않았다.** 앱만 알고 있던 값이다.
 *
 * 같은 판단을 두 곳에서 따로 정의하면 갈라진다 — 이 레포가 경유 4벌·상태목록 3벌로
 * 이미 당한 형태다. 화면이 늘어나면 **이 배열에만** 넣는다.
 */
export const LIST_SCREENS: ScreenContextType[] = ['LIST', 'LIST_COMPLETED'];

/** 지금 화면이 "콜에서 손을 뗀" 상태인가 (= 서버가 쥐고 있던 콜을 놓아도 되는가) */
/**
 * 👁️ **앱은 켜져 있는데 화면을 못 읽는 중인가** (기사님 확정 2026-08-22 · 크리티컬).
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * 접근성이 막혀 콜을 하나도 못 읽는 동안 관제웹은 파란불이었다 — 텔레메트리가 계속 왔고
 * 서버는 *"데이터가 왔으니 ONLINE"* 으로만 봤기 때문이다. 실운행이면 **콜을 통째로
 * 놓치는데 기사님이 알 방법이 없다.**
 *
 * 🔴 판단은 **근거 있는 것만** 한다. `노드 0` 은 접근성 트리가 안 오는 명백한 고장이다.
 *    반면 *"노드는 있는데 콜이 0"* 은 **빈 리스트일 수도** 있어 여기서 단정하지 않는다 —
 *    가르려면 "콜이 없을 때 노드가 몇 개인가"의 실측이 필요하다 (규칙 ⑤-4 ②).
 *
 * ⏱️ **15초**를 기다린다: 화면 전환·앱 전환 중에는 순간적으로 0이 될 수 있고,
 *    텔레메트리는 5초 간격이라 세 번 연속이면 일시적인 것이 아니다.
 */
export const BLIND_GRACE_MS = 15_000;

export function isDeviceBlind(session: { blindSince?: number }, now: number = Date.now()): boolean {
    return !!session.blindSince && now - session.blindSince >= BLIND_GRACE_MS;
}

/**
 * 🚦 **작업 단계의 이름은 여기 한 곳에서 짓는다** (기사님 확정 2026-09-02 ·
 * `docs/기획/폰_상태바.md` 0단계 ①).
 *
 * 앱은 **칸과 숫자만** 보낸다. 한글을 앱에도 두면 낱말이 두 벌이 되고 한쪽만 고쳐진다.
 * ⚠️ 안 보내는 구앱은 `null` 이다 — «대기»로 지어내지 않는다 (규칙 ④).
 */
export function workStageLabel(d: {
    workStage?: string; workStageStep?: number; workStageSeconds?: number;
}): string | null {
    switch (d.workStage) {
        case "IDLE": return "대기";
        case "DETAIL": return "상세";
        case "POPUP": return d.workStageStep ? `팝업 ${d.workStageStep}/3` : "팝업";
        case "AWAITING_VERDICT": return "판결 대기";
        case "SAFE_CANCEL":
            return d.workStageSeconds != null ? `안전취소 ${d.workStageSeconds}초` : "안전취소";
        default: return null;
    }
}

/**
 * 🎛️ **모드가 아직 폰에 안 닿았나** — 저장하지 않고 **대조로 파생**시킨다 (규칙 ③).
 *
 * 🔴 여태 관제웹은 버튼을 누르는 순간 바뀐 것처럼 그렸다(«낙관적 업데이트») —
 *    폰이 받았는지 모르면서. 오전에 고친 «읽지 않고 단언»과 같은 병이었다.
 * ⚠️ 대답을 안 싣는 구앱(`undefined`)은 «적용중»이라 하지 않는다 — 모름을
 *    «안 됐다»로 읽으면 영원히 안 풀리는 딤드가 된다 (규칙 ④).
 */
export function isModeApplying(d: { mode?: string; appliedMode?: string }): boolean {
    if (!d.appliedMode) return false;
    return d.mode !== d.appliedMode;
}

export function isListScreen(screenContext?: string | null): boolean {
    return !!screenContext && (LIST_SCREENS as string[]).includes(screenContext);
}

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

/**
 * ⏱️ **폰이 조용한가** — 직전 보고와 이번 보고 사이가 이만큼 벌어졌나.
 *
 * 🔴 값 **30초** (기사님 확정 2026-09-02). 지어낸 값이 아니라 **생존신고 60초의 절반**이다 —
 *    앱은 일이 생기면 그때 보내고(수초) 아무 일도 없으면 60초마다 보내므로,
 *    간격이 그 중간값으로 나오는 일이 **거의 없다.** 그래서 30초가 둘을 가장 잘 가른다.
 */
export const DEVICE_QUIET_MS = 30_000;

/**
 * ⏱️ **판정은 여기 하나다** (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면 각자 다른 질문을 답한다).
 *
 * 🔴 이 함수는 **2026-09-05 까지 없었다.** 폰_상태바.md 는 ✅ 로 적어 뒀고
 *    `devices.ts` 주석은 *"판정은 `isDeviceQuiet` 하나"* 라며 **없는 이름을 가리켰다** —
 *    「계획을 완료로 적는」 사고의 다섯 번째다.
 *
 * 🔴 **첫 보고(모름)를 «조용»으로 세지 않는다** (규칙 ④). 모르는 것과 조용한 것은
 *    다르다 — 방금 켠 폰에 «말이 없다»고 적으면 그것이 곧 거짓말이다.
 *
 * ⚠️ 읽는 곳은 **관제웹의 `⏱️` 배지 하나뿐**이다. 서버 판정도 앱도 안 읽는다 —
 *    «콜을 줄까»를 이걸로 정하기 시작하면 한 값이 두 사실을 답하게 된다.
 */
export function isDeviceQuiet(prevSeen: number | undefined, lastSeen: number): boolean {
    if (prevSeen === undefined) return false;   // 첫 보고 — 모른다
    return lastSeen - prevSeen > DEVICE_QUIET_MS;
}

export interface DeviceSession {
    deviceId: string;
    deviceName?: string;    // 기기 별명 (PIN 페어링 시 등록, 예: "메인폰", "서브폰")
    lastSeen: number;       // 밀리초 타임스탬프
    /**
     * 📵 **왜 오프라인인가** (기사님 지적 2026-09-02: *"'접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 접근성을 끄면 앱은 죽기 **전에** «나 오프라인이다»를 스스로 보낸다(`onDestroy`).
     * 그때 자기 서비스가 «켜진 접근성 목록»에 없으면 그건 추측이 아니라 **사실**이다.
     * 아무 말 없이 끊긴 것(데드맨)과는 기사님이 하실 일이 다르므로 갈라 둔다.
     * ⚠️ 다시 보고가 오면 지운다 — 옛 이유가 살아 있으면 화면이 거짓말한다.
     */
    offlineReason?: DeviceOfflineReason;
    /**
     * ⏱️ **직전 보고 시각** (밀리초) — `lastSeen` 과의 간격이 «그 사이에 일이 있었나»를 답한다.
     * 지금 읽는 곳은 서버의 `🖥️ [화면 바뀜]` 로그 하나뿐이다 («직전 보고와 N초 만»).
     * 첫 보고에는 없다(«모른다»).
     */
    prevSeen?: number;
    status: DeviceStatusType;
    mode: DeviceModeType;
    /**
     * 🌐 이 폰이 지금 **어느 배차망을 보고 있나** (기사님 확정 2026-08-30).
     * scrap 마다 갱신되는 실시간 상태다 — 저장하지 않는다(원장은 orders·intel 의
     * targetApp). 없으면(구앱) 화면은 표시를 비운다 — 기본값을 지어내지 않는다.
     */
    targetApp?: TargetAppType;
    /**
     * 🧬 **이 폰이 «들고 있는» 콜 필터의 지문** (2026-09-12 · 현황판 담당 요청 ②).
     *
     * 앱은 `filterVersion` 을 **매 scrap 에 싣고** 서버는 «바뀌었나»를 대조해 본문을
     * 생략할지 정한다(`scrap.ts`). 그런데 **대조만 하고 버리고 있었다** — 그래서
     * *"메인폰은 새 필터, 서브폰은 두 판 전"* 을 아무도 볼 수 없었다.
     *
     * 🔴 **«폰이 들고 온 것»을 적는다 — 서버가 방금 내려보낸 것이 아니다.**
     *    서버가 준 것을 적으면 **언제나 최신으로 보여** 이 칸이 있으나 마나가 된다
     *    (규칙 ⑤-4 ⑤ — 읽는 곳이 답하려는 질문은 «이 폰이 뒤처졌나»다).
     * ⚠️ 구앱은 안 보낸다 — 없으면 «모른다»로 둔다. 화면은 비워야 한다 (규칙 ④).
     */
    filterVersion?: string;
    /** 그 지문을 마지막으로 확인한 시각 (밀리초) — 낡음을 재려면 «언제»가 있어야 한다 */
    filterVersionAt?: number;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    isHolding?: boolean;    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    lat?: number;           // [GPS 텔레메트리] 앱폰(차량) 위도
    lng?: number;           // [GPS 텔레메트리] 앱폰(차량) 경도
    /**
     * 👁️ **마지막 리스트에서 읽은 텍스트 노드 수** (2026-08-22 · 크리티컬).
     * `0` 이면 접근성 트리가 안 오는 것 — 앱은 살아 있지만 **화면을 못 읽는다.**
     */
    screenNodeCount?: number;
    /**
     * 💤 **폰 화면이 켜져 있는가** (기사님 확정 2026-08-22).
     * 접근성 스크래핑은 화면이 켜져 있어야 돈다 — 꺼지면 앱은 살아 있어도 **콜을 못 잡는다.**
     * 예전에는 `Screen Off` 이벤트 한 번으로 알렸는데, 60초 뒤 하트비트가 `ONLINE` 으로
     * 되돌려 관제웹이 녹색이 됐다. 이제 앱이 **매 텔레메트리에 사실을 싣는다** (규칙 ③).
     */
    isScreenOn?: boolean;
    /**
     * 👁️ **화면을 못 읽기 시작한 시각** (밀리초). 노드가 0이 아니면 지워진다.
     * 관제웹이 이걸 보고 *"앱은 켜져 있는데 화면을 못 읽는 중"* 을 말한다 —
     * 기사님이 **파란불을 믿고 기다리는 일**을 막는 유일한 신호다.
     */
    blindSince?: number;
    /**
     * 👁️ **마지막 스캔의 필터 성적표** (기사님 확정 2026-08-23).
     *
     * 기사님: *"앱에서 리스트는 돌아가고 있는데 관제웹에서는 **필터링이 잘되고 있는 건지
     * 알 수가 없어서** 답답하더라구. 실전에서는 16개가 다 들어오지 않으니까."*
     *
     * `stats.polled` 는 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 이 값이 말한다 —
     * *"도착지에서 5개"* 면 경유 반경을 넓힐 때고, *"요금에서만"* 이면 콜할인율을 만질 때다.
     *
     * ⚠️ **누적이 아니라 마지막 스캔의 스냅샷**이다. 누적은 *"어제부터 300개 떨어짐"* 이라
     *    지금 상태를 못 알려 준다. 질문은 *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 다.
     * ⚠️ **한 콜은 첫 번째로 걸린 축에만** 세어져 있다 — 그래야 합이 `seen` 과 맞고
     *    *"이 축을 풀면 몇 개가 들어오나"* 를 읽을 수 있다.
     */
    filterTally?: FilterTally;
    /**
     * 🕐 **그 성적표가 서버에 닿은 시각** (epoch ms · 기사님 지적 2026-08-23).
     *
     * 기사님: *"`방금 1건 → 통과 0 · 차종 1` 같은 게 나오니까 **멈춰 있는 것 같아.**
     * 보내온 마지막 시간을 쓰는 것이 더 좋을 것 같다."*
     *
     * 🔴 숫자만으로는 *"지금 그런 것"* 과 *"아까 그러고 멈춘 것"* 을 구분할 수 없다.
     * 🔴 **서버 시계로 찍는다.** 앱이 보낸 시각을 쓰면 폰 시계가 틀어졌을 때 화면이
     *    미래나 과거를 말한다 — 받은 순간이 유일하게 확실한 사실이다.
     * ⚠️ `filterTally` 가 실제로 온 스캔에서만 갱신한다. 하트비트가 시각만 밀어 올리면
     *    **옛 숫자가 새것처럼** 보인다 (그게 지금 고치려는 거짓말 그 자체다).
     */
    filterTallyAt?: number;
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
    /**
     * 🚦 **지금 무슨 일을 하는 중인가** — 앱이 보낸 다섯 칸 중 하나
     * (`IDLE`·`DETAIL`·`POPUP`·`AWAITING_VERDICT`·`SAFE_CANCEL`).
     * 여태 `isHolding` 불리언 하나라 «어디서 멈췄는지»를 관제웹이 몰랐다.
     * ⚠️ 이름(한글)은 `workStageLabel` 이 짓는다 — 앱은 칸과 숫자만 보낸다.
     */
    workStage?: string;
    /** 🚦 팝업이 몇 장째인가 (`POPUP` 일 때만) */
    workStageStep?: number;
    /** 🚦 안전취소가 몇 초 남았나 (`SAFE_CANCEL` 일 때만) */
    workStageSeconds?: number;
    /**
     * 🎛️ **폰이 «나 지금 이 모드다»라고 대답한 값** (기사님 확정 2026-09-02).
     * `mode`(관제가 정한 목표)와 **대조**하면 「적용중」이 파생된다 (규칙 ③).
     * ⚠️ 안 싣는 구앱은 `undefined` — 그걸 «적용 안 됨»으로 읽지 않는다 (규칙 ④).
     */
    appliedMode?: string;
}


export * from './vehicles';
export * from './regionMatch';
export * from './pricing';
export * from './phases';
export * from './callTargetDay';
export * from './pickupList';
export * from './cargoHints';
export * from './cargoTags';
export * from './cargoUnits';

/**
 * 관제탑으로 보내는 오더 스냅샷.
 * **진행 중과 종료된 것을 나눠서** 보낸다 — 한 배열로 보내면 받는 쪽이 거르기를 잊는다.
 */
/**
 * 이미 상차한 콜인가 — **이 판단은 여기 한 곳에만 둔다.**
 *
 * 🔴 서버에서 2026-08-13 에 합짐 경로에서만 고치고 단독 경로를 빠뜨렸다가
 *    2026-08-14 에 같은 사고가 났다 (다녀온 상차지가 경유지로 되살아남).
 *    관제웹도 지도 폴백에서 같은 판단이 필요해져 shared 로 올렸다 (2026-08-19) —
 *    server/routeComposer 와 관제웹이 **같은 정의**를 봐야 지도와 경로가 갈라지지 않는다.
 *
 * 기사님 원칙 그대로 — **KEEP 은 예약이고 상차가 적재다.** 짐을 실었으면 남은 일은 하차뿐이다.
 */
export function isAlreadyLoaded(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_PICKED_UP';
}

/**
 * 🚏 **이 정거장에 이미 다녀왔는가 — 판단은 여기 하나뿐이다** (기사님 확정 2026-08-19).
 *
 * 기사님: *"현실에서는 내가 지나온 것은 무시할 것 같은데."*
 *
 * 🔴 그동안 판단이 **두 벌**이었다 — 경로 조립은 `status`(상차 완료 버튼), 시각 계산은
 *    마일스톤(GPS 도착). 그래서 **상차 완료를 안 누르면 이미 지나온 상차지로 되돌아가는
 *    경로**가 나왔다. 실측: 같은 콜이 버튼 전엔 경유지 5개·+20.0km·🟢56점,
 *    누른 뒤엔 3개·+0.7km·🔵80점 — **없는 우회 비용 20km**를 물고 있었다.
 *    같은 자리를 세 번 고친 뒤라, 인스턴스가 아니라 **클래스를 없앤다** (버그 대장 #24 연장).
 *
 * **GPS 도착이면 다녀온 것이다.** 도착 감지는 500m 안에 들어와야 찍히므로 "거기 갔다"는
 * 뜻이고, **가는 길**은 더 필요 없다.
 *
 * ⚠️ `isAlreadyLoaded`(실었는가)와 **다른 질문**이다. 도착했지만 아직 안 실은 상태가 있고,
 *    그때 단계는 여전히 "상차 완료" 대기다. 적재 계산도 실은 것만 센다.
 *    여기는 오직 **"경로에 남겨 둘 이유가 있는가"** 만 답한다.
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
    return calls.find(c => !isTerminal(c.status ?? undefined)
        && (isEvaluating(c.status ?? undefined) || !!c.isPreview));
}

/**
 * 🔄 **이번 운행에서 "한 일"인가** — 하차·정산 완료만이다.
 *    취소·방출은 종결(`isTerminal`)이지만 **없던 일**이라 여기 안 든다.
 */
export function isDeliveredCall(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_DELIVERED' || c.status === 'ORDER_COMPLETED';
}

/**
 * 🗓️ **시트의 카드 목록 — 오늘 한 일** (기사님 결정 2026-09-15 «시트는 오늘 한 일을 남긴다 · 화면의 사이클 = 하루» · 결정_이력).
 *
 * 처음(2026-08-19)엔 «진행 중이 남은 동안만 하차분을 함께» 보여 줬고(6단계 채운 모습을 보려고),
 * #40(08-22)에서 «이번 운행 — 진행 중 콜을 잡기 전에 내린 것은 뺀다»로 좁혔다. 그래서 콜 사이 빈 차가 될 때마다
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

/**
 * 📍 **단계 사유 — 그때 무슨 일이 있었나** (기사님 확정 2026-08-19).
 * 기획: `docs/기획/도착_사유_기획.md`
 *
 * 🔴 **단계마다 관심사가 다르다.** 기사님: *"상차지 도착에서는 단위·수량·방법·보호·성질
 *    이것들이 모두 없어야 하는 거 아닌가? 상차지 도착에 관한 것만 있으면 될 것 같은데.
 *    이동 중에 문제가 없었는지, 상차지에 문제(주소 다름·점심시간) 뭐 그런 것들."*
 *
 *   상차지 도착 — 오는 길 + 그 장소            (아직 문을 열기 전이다)
 *   상차 완료   — 화주·짐                      (여기서 비로소 실어 본다)
 *   하차지 도착 — 오는 길 + 그 장소 + **짐 상태** (문을 열면 보인다)
 *   하차 완료   — 인수 단계
 *
 * 🔴 **이 값은 아무것도 판정하지 않는다** — 색·필터·약속과 무관하다. 겪은 일을 적어 두는
 *    칸일 뿐이라 목록이 아직 **가설**이어도 안전하다 (기사님: *"유튜브에서 본 것이 전부야"*).
 *
 * 🔴 **`기타` 를 반드시 둔다.** 목록 밖의 일이 어디에도 안 남으면 **목록을 고칠 근거
 *    자체가 사라진다.** 한 달쯤 뒤 "한 번도 안 쓴 사유"와 "기타로 적힌 것"을 세어 고친다.
 *
 * ⚠️ `수량 다름` 은 넣지 않는다 (기사님 확정: *"3 실측폼"*). 실측 폼에 실제 수량을 적으면
 *    `cargoMismatchRatio` 가 신고와의 차이를 **스스로 센다** — 사유로 또 적으면 같은 사실이
 *    두 곳에 살고 갈라진다 (규칙 ③).
 */
/**
 * 🗂️ **갈래로 묶는다** (기사님 확정 2026-08-19).
 *
 * 기사님: *"모든 종류의 트러블이 하나에 모여 있어서 찾기 너무 어렵고 추가하기도 좀
 * 그렇다. 도로문제 / 상차지문제 / 기타 이런 식으로 카테고리로 나누어 표시하는 것이
 * 좋을 것 같은데. 어느 정도 높이가 시트마다 비슷해야 버튼 찾기도 좋으니까."*
 *
 * 한 줄에 쏟아 두면 찾는 데 시간이 걸리고 **늘릴 자리도 없다.** 묶어 두면 눈이 먼저
 * 갈래를 고르고, 사유를 더해도 그 갈래 안에서 자란다 — 목록이 가설이라 늘어날 것을
 * 전제로 짜야 한다.
 */
const ROAD_TROUBLE = ['교통 지연', '사고', '진입 곤란'] as const;   // 오는 길 — 도착 단계에만

const REASON_GROUPS_BY_STEP: Record<string, ReadonlyArray<{ label: string; reasons: readonly string[] }>> = {
    /** 오는 길 + 그 장소. 짐 이야기는 없다 — 아직 문을 못 열었다 */
    ARRIVE_PICKUP: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '상차지 문제', reasons: ['주소 다름', '점심시간', '문 잠김'] },
    ],
    /** 실어 본 뒤에야 아는 것 */
    LOADED: [
        { label: '상차 문제', reasons: ['화주 미준비', '물건 없음', '상차 중 파손'] },
    ],
    /** 오는 길 + 그 장소 + 짐 상태 (문을 열면 보인다 — 하차 완료는 이미 내린 뒤라 늦다) */
    ARRIVE_DROPOFF: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '하차지 문제', reasons: ['주소 다름', '수령인 부재'] },
        { label: '짐 상태', reasons: ['짐 무너짐', '결박 풀림', '파손 발견'] },
    ],
    /** 인수 단계 */
    DELIVERED: [
        { label: '하차 문제', reasons: ['검수 지연', '인수 거부'] },
    ],
};

/** 이것을 고를 때만 메모를 받는다 — 자유 입력 금지 원칙의 유일한 예외 (근거는 위) */
export const REASON_NEEDS_MEMO = '기타';

/** 이 **단계**의 사유 갈래 — `기타` 는 언제나 마지막 갈래로 따로 선다 */
export function arrivalReasonGroupsFor(stepId: string): Array<{ label: string; reasons: string[] }> {
    const own = REASON_GROUPS_BY_STEP[stepId];
    if (!own) return [];
    return [
        ...own.map(g => ({ label: g.label, reasons: [...g.reasons] })),
        { label: '기타', reasons: [REASON_NEEDS_MEMO] },
    ];
}

/** 갈래를 펼친 평면 목록 (검사·저장 검증용) */
export function arrivalReasonsFor(stepId: string): string[] {
    return arrivalReasonGroupsFor(stepId).flatMap(g => g.reasons);
}

export const ARRIVAL_REASONS = Array.from(new Set(
    Object.keys(REASON_GROUPS_BY_STEP).flatMap(arrivalReasonsFor),
));

/**
 * 📍 **마지막으로 아는 자리 — «내가 지금 어디 있나»의 답** (2026-09-12).
 *
 * 🔴 **낡아도 집으로 바꾸지 않는다.** 터널·주차장에서 5분 끊긴 것뿐인데 지도가 집으로
 *    날아가면, 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다. **그물은 더 심하다** —
 *    이천에 있는데 파주 콜이 올라온다 (기사님 확정: 지도·그물 둘 다 «마지막 실제 위치»).
 * 🔴 모르면 **`null`** 이다 — 집을 지어내지 않는다 (규칙 ④).
 */
export interface DriverPositionDto {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** 기점으로 쓰기엔 낡았나 (서버 문턱 5분) */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

/**
 * 🧭 **경로를 어디서부터 짰나 — 위와 다른 질문이다** (규칙 ⑤-4 ⑤).
 *    출발점이 없으면 계산 자체가 안 되므로 낡으면 **집**을 넣는다. 그 규칙은 실제
 *    사고에서 나왔다 (여주에서 4시간 25분 뒤 광주 콜의 경로가 40km 뒤에서 그려졌다).
 *    🔴 **이 값으로 «내 위치» 마커를 찍지 않는다** — 그러면 화면이 «집에 있다»고 거짓말한다.
 */
export interface RouteOriginDto {
    x: number; y: number;
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 «집 주소로 대신했다» — 화면이 그 사실을 말할 수 있게 */
    isFallback: boolean;
}

export interface OrderSyncPayload {
    active: SecuredOrder[];
    terminated: SecuredOrder[];
    /**
     * 🧭 **경로 기점 — 정거장 순서(`routeStops`)를 짠 그 자리** (2026-09-12).
     *    같이 와야 «1번 정거장이 내 뒤에 있다» 같은 화면이 안 난다.
     *
     * ⚠️ **«내 위치»는 여기 없다** — 이 봉투는 «콜이 바뀔 때» 나가는데 위치는 1초마다
     *    바뀐다. 한때 함께 실었다가 **옛 좌표가 내 점을 뒤로 당겨** 모의 주행이 멈춘 것처럼
     *    보였다 (기사님 실측). 위치는 `driver-position` 이벤트로 따로 간다 (규칙 ⑤-4 ③).
     *    🔴 이 봉투를 1초마다 보내는 길은 막혀 있다 — **초당 474KB 사고 자리**다.
     * ⚠️ 옛 서버는 안 싣는다 — `undefined` 면 화면이 «모른다»로 그린다.
     */
    routeOrigin?: RouteOriginDto | null;
    /**
     * 🚫 취소 카운터 — **한 판(10회)에서 몇 번 썼나** (기사님 개정 2026-08-23).
     * 망별(targetApp) SAFE_CANCEL 건수. 파생값이라 저장하지 않고 서버가 장부에서 센다.
     *
     * ⚠️ 예전에는 **전 기간 누적**이었다. 그래서 `47/10` 처럼 한도를 몇 배씩 넘긴 숫자가
     *    떴는데, 그건 *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다. 지금은
     *    **리셋 시각 이후만** 센다 — 총량은 `cancelRounds` 가 지킨다.
     */
    cancelCounts?: Record<string, number>;
    /**
     * 🚫 **몇 판째인가** (망별). 한 판 = `CANCEL_BUDGET_PER_ROUND` 회.
     *
     * 🔴 docs/지금/필터.md §6 의 *"취소는 리셋되지 않는다"* 를
     *    지키는 자리다. 그 취지는 **총량이 사라지면 안 된다**는 것이지 "숫자가 영원히
     *    커져야 한다"가 아니다. 판수가 남으므로 총량은 `(판수-1)×10 + 카운트` 로 그대로 산다.
     */
    cancelRounds?: Record<string, number>;
    /**
     * 🧭 **경로 순서의 원천 — 서버 하나다** (기사님 동의 2026-08-19).
     * 방문 순서대로의 정거장 목록. 관제웹은 자기 TSP 를 돌리지 않고 이걸 그대로 그린다
     * (두 벌이면 ETA 가 엉뚱한 정거장에 붙는다 — "파생값 두 벌" 사고 클래스).
     * 빈 배열은 "정거장 없음"이 아니라 "경로 미연산/고장"일 수 있다 — 콜 자체는 그린다.
     */
    routeStops?: RouteStopInfo[];
    /**
     * 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = **카카오호출시점**. 지금 시각을 기준으로 쓰면
     * 추정 약속이 매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다.
     */
    routeComputedAt?: string | null;
    /**
     * 🧭 **지금 경로를 든 콜의 id** (기사님 확정 2026-08-31 · 잔상 수리).
     *
     * 폴리라인은 «홀더» 한 콜에만 실린다. 예전엔 관제웹이 그 홀더를 **추측**했고
     * («폴리라인 가진 마지막 콜») 서버의 판정과 규칙이 달라, KEEP 직후처럼 갈리는
     * 순간에 **직전 콜의 옛 선**을 그렸다. 이름을 실어 추측을 없앤다 (규칙 ③).
     * 🔴 폴리라인 자체를 여기 담지 않는다 — 콜에 이미 있는 것을 한 벌 더 만들면
     *    payload 가 두 배가 되고(초당 237KB 사고) 파생이 두 벌이 된다.
     */
    routeHolderId?: string | null;
    /**
     * 🟡 **심사 중인 콜의 «미리보기 궤적» 홀더** (기사님 실물 2026-09-06).
     *
     * 위 `routeHolderId` 는 **주행분(`sectionDriveMin`)이 있는 콜**을 가리키는데,
     * 그 값은 KEEP 뒤에 채워져 **심사 중 30초 동안은 없다.** 그 사이 카카오 궤적은
     * 이미 콜에 실려 있는데도 아무도 안 가리켜, 화면이 «경로가 없을 때만 그리는»
     * 직선 보조선을 그렸다 (기사님: *"점선으로 궤적이 나와야 하는데 또 직선으로 나온다"*).
     *
     * 한 값이 두 질문을 답하고 있었다 (규칙 ⑤-4 ⑤) — **타임라인**과 **그림**은 다른 질문이다.
     * 그래서 갈랐다. 합치면 심사 중 콜의 빈 주행분이 타임라인을 폴백으로 돌린다(2026-08-19).
     */
    previewRouteHolderId?: string | null;
}

/** 경로 위의 정거장 하나 — 어느 콜의 어느 쪽을 몇 분 주행 뒤에 가는가 */
/**
 * 🚫 **취소 예산 한 판의 크기** (기사님 확정 2026-08-23).
 *
 * 배차망이 세는 취소 한도다 (용어집 §2-1 — 카운터에 들어가는 것은 **안전취소**뿐).
 * 🔴 예전에는 관제웹 문자열에 `/10` 으로 **박혀 있었고 서버는 한도를 아예 몰랐다.**
 *    서버가 "다 썼다"를 판정하려면 같은 값을 봐야 한다 — 두 벌이면 갈라진다.
 */
/**
 * 👁️ **필터 성적표 — 마지막 스캔 한 판** (기사님 확정 2026-08-23).
 * 앱의 `FilterTally` 와 **같은 모양**이다. 축 이름이 갈라지면 화면이 엉뚱한 축을 가리킨다.
 */
export interface FilterTally {
    /** 이번 스캔에서 판정한 콜 수 (요금을 못 읽어 버려진 카드는 여기 안 든다) */
    seen: number;
    /** 전부 통과한 콜 수 */
    passed: number;
    vehicle: number;
    region: number;
    fare: number;
    pickup: number;
    blacklist: number;
    routeOrder: number;
    /** 📋 상차 목록에 안 걸린 콜 — 원달앱 2.9.7 부터 (옛 앱은 안 보낸다 · docs/지금/필터.md «상차 목록 · 하차 목록») */
    pickupList?: number;
}

export const CANCEL_BUDGET_PER_ROUND = 10;

export interface RouteStopInfo {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    /** 출발점(현위치)에서 이 정거장까지 **누적 주행(분), 정차 미포함**. 연산 전·실패면 null */
    driveMinutes: number | null;
}
export * from './callSteps';
export * from './callOptions';
export * from './cargoSpec';
export * from './stepTables';
export * from './stepRecords';
export * from './timing';
export * from './dryRun';
/**
 * 🔴 콜의 **색을 정하는 곳 — 여기 하나뿐이다** (2026-08-15 신설).
 *    이 파일은 아무것도 import 하지 않는다 — 순환 참조를 만들지 않으려는 것이다.
 */
export * from './judgment';
export * from './judge';
export * from './criteria';

/** 🏷️ 화면 이름표 — 배차망별로 갈라 둔다 (기사님 설계 2026-09-02) */
export * from './screenLabels';
export * from './naviLink';
/** ⏱️ 밀림 — 한 콜이 앞선 정거장을 몇 분 밀었나, 누가 밀었나 (2026-09-11 실험실에서 올림) */
export * from './stopImpact';
/** 🎨 구간별 선 — 통짜 폴리라인 + 경계로 자른다 (이식 B1) */
export * from './sectionLine';
/**
 * 🕸️ **콜 그물·2단계 판정** — 지도 실험실이 나흘 동안 기사님과 맞춰 온 계산
 *    (2026-09-11 기사님 확정: *«실험실 계산을 올린다»* · 이식 B3 · 계획서 §4 Q1).
 *    마름모·라인 띠·든 동·제외 지역·정거장 재배치가 전부 여기 있다.
 * 🔴 **실물이 원천이고 실험실이 그것을 부른다** — 화면과 서버가 같은 계산을 봐야
 *    «화면은 든다는데 판정은 탈락»이 안 생긴다 (규칙 ③).
 */
export * from './callNet';

/**
 * ⏱️ **«주행·정차»로 굳는 데 걸리는 초 — 기본값** (기사님 확정 2026-09-12 · 화면규칙 S16).
 *
 * 20km/h↑ 가 이 시간만큼 이어지면 «주행», 5km/h↓ 면 «정차»로 본다.
 * 기사님이 ⚙️ 설정 → 「화면 설정」에서 고칠 수 있다 (`user_settings.motion_hold_sec`).
 *
 * 🔴 **모의 주행에서는 줄여야 한다** — 배속이 빠르면 정거장 사이를 2~7초에 지나가
 *    10초를 채울 수가 없다. 그래서 «주행이면 시트가 내려간다»가 발화 못 했다
 *    (기사님 실측: 빠름 40배로 한 판을 다 돌았는데 하루 종일 `idle`).
 *    기사님: *"모의주행할 때는 그걸 줄이고 시험하고 **진짜 때는 10으로**"*
 */
export const MOTION_HOLD_SEC_DEFAULT = 10;

/**
 * ⏱️ **배차망별 대기 시간** (기사님 확정 2026-09-14 · `docs/지금/배차망별_대기_시간.md`).
 *
 * 원천은 DB `user_settings` 세 칸이다 — 여기는 **값이 없을 때의 기본값**(DB DEFAULT 와 같다)과
 * «그 배차망은 몇 초인가»를 가르는 한 곳이다. 서버 타이머 · 관제웹 표시가 같은 함수를 부른다.
 *
 * 🔴 **뜻이 다른 둘이다** (규칙 ⑤-4 ⑤):
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간(안전취소).
 *     인성의 취소 가능 시간은 1분이고, 30초는 기사님이 둔 안전 여유다
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다.** 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
export const SAFE_CANCEL_SEC_DEFAULT = 30;
export const PICKER_ALARM_DETAIL_SEC_DEFAULT = 60;
/** 서버는 원달앱이 취소한 **뒤에** 메모리를 치운다 — 그 간격 (옛 30초 경고 · 35초 해제의 차이) */
export const SERVER_CLEANUP_EXTRA_SEC = 5;

export interface WaitTimes {
    safeCancelSecInsung: number;
    safeCancelSecHwamul24: number;
    pickerAlarmDetailSec: number;
}

export const DEFAULT_WAIT_TIMES: WaitTimes = {
    safeCancelSecInsung: SAFE_CANCEL_SEC_DEFAULT,
    safeCancelSecHwamul24: SAFE_CANCEL_SEC_DEFAULT,
    pickerAlarmDetailSec: PICKER_ALARM_DETAIL_SEC_DEFAULT,
};

/**
 * ⏱️ **대기 시간 입력 — 1 이상 정수만 값이다** · 아니면 `null` (2026-09-14 리뷰).
 * 관제웹 칸을 비우고 저장하면 0초가 저장됐다 — 인성 안전취소 0초면 원달앱이 잡자마자 스스로 취소한다.
 * 🔴 1초 미만은 값이 아니라 고장이다 · 상한은 걸지 않는다(기사님 확정). `null` 이면 설정 경로가 옛 값을 그대로 둔다.
 */
export function waitSecOrNull(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const sec = Math.floor(n);
    return sec >= 1 ? sec : null;
}

/** 그 배차망의 안전취소 초 — 픽커는 안전취소가 없어 `null` · 모르는 배차망은 기본 배차망(인성) */
export function safeCancelSecOf(w: WaitTimes, targetApp: string | null | undefined): number | null {
    const app = isTargetApp(targetApp) ? targetApp : DEFAULT_TARGET_APP;
    if (app === 'kakaopicker') return null;
    return app === 'hwamul24' ? w.safeCancelSecHwamul24 : w.safeCancelSecInsung;
}

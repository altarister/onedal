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
    | 'ORDER_AWAITING_DECISION'    // (패널티 O) 관제탑 결재 대기 (안전취소)
    // --- [확정 이후 단계] ---
    | 'ORDER_CONFIRMED'            // (패널티 O) 관제탑 승인 (내 퀵)
    | 'ORDER_PICKED_UP'            // (패널티 O) 상차 완료 (픽업지에서 서명)
    | 'ORDER_DELIVERED'            // (패널티 O) 하차 완료 (수취인 서명)
    | 'ORDER_COMPLETED'            // (패널티 O) 운행 완료 (정상 종료)
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
    /** 어느 배차망에서 온 콜인가 — 'insung' | 'hwamul24' (앱 confirm 페이로드가 싣는다).
     *  🔴 원장(orders.targetApp)에 저장 — 배차망별 콜 검색·분석의 근거 (기사님 2026-08-17) */
    targetApp?: string; }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [계층 2-A] 심사 중 오더 — 서버 메모리 전용 (아직 내 퀵이 아님)
// 앱이 긁어와서 서버가 꿀/똥콜 판별 중인 임시 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface PendingOrder extends OfficeOrder {
    status: OrderStatus;                  // ORDER_PRE_SECURED | ORDER_SECURED_EVALUATING | ORDER_AWAITING_DECISION
    capturedDeviceId: string;         // 이 오더를 물어온 기기 (앱폰 1호기)
    capturedAt: string;               // 낚아챈 실제 타임스탬프
    /** 👀 미리보기 콜 — 확정 전이라 취소 카운트에 안 들어간다 (용어집 §9 · `DispatchBasicRequest.isPreview`) */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 (2026-08-21) */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 닻
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
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
    /** 🏁 하차한 시각 (장부 `orders.completedAt`) — 화면의 사이클 경계가 본다 (#40) */
    completedAt?: string | null;
    /**
     * 👀 미리보기 콜 (용어집 §9). 확정되면 `false` 로 덮여 보통 콜이 된다 —
     * `PendingOrder` 와 **같은 모양이어야** 두 타입이 한 함수(`pickRouteHolder` 등)에
     * 섞여 들어갈 때 갈라지지 않는다.
     */
    isPreview?: boolean;
    kakaoCalculatedFare?: number;     // 서버 연산 기반 가성비 단가
    kakaoTimeExt?: string;            // 카카오 연산 결과: 예상 소요 시간 텍스트
    routePolyline?: Array<{ x: number; y: number }>;  // 카카오 실제 궤적 좌표들
    totalDistanceKm?: number;         // 통합 연산된 전체 총 주행 거리
    totalDurationMin?: number;        // 통합 연산된 전체 총 주행 시간
    kakaoSoloDistanceKm?: number;     // 카카오가 연산한 해당 콜만의 '단독' 주행 거리
    kakaoSoloDurationMin?: number;    // 카카오가 연산한 해당 콜만의 '단독' 소요 시간
    /** 현위치 → 상차지 소요 시간(분). 통화 대본의 "여기서 N분 걸립니다"가 이 값이다 */
    approachDurationMin?: number;
    osrmError?: string;               // OSRM 연산 실패 시 에러 메세지 노출용
    sectionEtas?: string[];           // 카카오 궤적 연산 기반 각 경유지 도착 예상 시간 배열
    sectionDriveMin?: Array<number | null>;       // 출발점 기준 정거장별 **누적 주행(분)** — 시계가 아니라 상대값이라 낡지 않는다
    /** 🧭 구간마다 어느 정거장인가 — sectionDriveMin 과 같은 길이. 도착으로 정거장이 빠져도 이름으로 맞춘다 (2026-08-21) */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    routeComputedAt?: string;         // 이 경로를 계산한 시점 — 타임라인 추정 약속의 닻
    arrivedPickupAt?: string;         // 🚏 상차지에 실제로 도착한 시각 — 경로에서 뺄지의 근거 (hasVisitedStop)
    arrivedDropoffAt?: string;        // 🚏 하차지에 실제로 도착한 시각
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
    /**
     * 🏁 **하차한 시각** (장부 `orders.completedAt`). 없으면 아직 안 내렸거나 옛 행이다.
     * 화면의 사이클 경계가 이걸 본다 (`deckOfCycle` — 버그 대장 #40).
     */
    completedAt?: string | null;
    /** 👀 미리보기 콜 — 확정 전이라 아직 안 잡은 콜이다 (용어집 §9) */
    isPreview?: boolean;
    /**
     * 🎨 판정 스냅샷 (판정색 확정안 v2) — 심사 1회, 불변. 심사 카드가 조건 전수를
     * 이걸로 그린다. import 순환을 피해 타입만 구조로 적는다 (dryRun.ts 의 DryRunVerdict)
     */
    judgment?: {
        color: '꿀' | '보통' | '똥' | '사고';
        score: number;
        axes: Array<{ key: string; name: string; score: number; weight: number; raw: string }>;
        gates: Array<{ key: string; name: string; pass: boolean; why: string | null }>;
        tags: string[];
    };
    kakaoCalculatedFare?: number;
    kakaoTimeExt?: string;
    routePolyline?: Array<{ x: number; y: number }>;
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
    destinationGroups?: Record<string, string[]>; // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    customCityFilters: string[];    // (UI용) 시/구 단위로 그룹핑된 읍면동 목록
    detourRadiusKm?: number;      // (합짐 모드) 경로 주변 이탈 허용 반경 (기본값 5km, DB설정값)
    userOverrides?: boolean;        // 기사가 팝업에서 수동으로 필터(destinationKeywords 등)를 조작했는지 여부(서버 덮어쓰기 방지용)

    // ── 단가 판정 모델 (2026-08-13 확정 · docs/지금/필터.md) ──
    // 셋 다 optional: 구버전 앱은 이 키들을 파싱하지 않으므로 무시된다 (호환).
    // minFare/maxFare 는 구버전 앱 호환용으로 유지 — 새 앱은 ratePerKm 이 있으면 그걸 쓴다.
    /** 차종별 하한 단가(원/km) = 실수령 시세 × (1 − 콜할인율). 판정: fare ≥ 배송거리 × ratePerKm[차종] */
    ratePerKm?: Record<string, number>;
    /** 콜할인율 — 시세 대비 허용 할인 %. 100 = "전부"(금액 무관) */
    callDiscountPct?: number;
    /** 사용 중인 적재 칸 (내 1t 트럭 = 5칸). 명목값이며 통화 확인 시 갱신 */
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
 * **하루의 국면** — 기사님이 요약줄을 스와이프해서 고른다.
 *
 *   DEST(노선행) → LOCAL(이 동네에서 찾기) → HOME(복귀행)
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
export type CallTarget = 'DEST' | 'LOCAL' | 'HOME';

export const CALL_TARGET_LABEL: Record<CallTarget, string> = {
    DEST: '노선행',
    LOCAL: '이 동네에서 찾기',
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
    if (filter.isSharedMode) {
        // 합짐은 경로에서 경유이 나와야 성립한다. 경유이 없으면 "가는 길"이 없는 것이다
        if (!filter.destinationKeywords?.length) return '경유이 아직 안 잡혔습니다';
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
 * 풀리면서 딸려 온 것들: 운행중 국면 설정(우회 0)이 풀려 경유이 다시 넓어지고,
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
export type DeviceModeType = "AUTO" | "MANUAL";

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 콜 잡기 리스트 화면
    | 'LIST_COMPLETED'        // 완료 리스트 화면 — 여기서도 "리스트로 돌아온 것"이다
    | 'DETAIL_PRE_CONFIRM'    // 광클 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
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
}


export * from './vehicles';
export * from './regionMatch';
export * from './pricing';
export * from './phases';
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
 * 🔄 **이번 운행에서 "한 일"인가** — 하차·정산 완료만이다.
 *    취소·방출은 종결(`isTerminal`)이지만 **없던 일**이라 여기 안 든다.
 */
export function isDeliveredCall(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_DELIVERED' || c.status === 'ORDER_COMPLETED';
}

/**
 * 🔄 **이번 운행(사이클)의 카드 목록** (기사님 확정 2026-08-19).
 *
 * 기사님: *"노선행으로 묶어서 생각해 보면 합짐이 들어가 있는 여러 개의 한 경로로 볼 수
 * 있을 것 같고, 모든 경로가 끝나면 완료로 한꺼번에 상태값을 바꾸면 될 것 같다."*
 * + *"마지막 6번째 바의 하차 완료는 볼 수도 없는 상황인 듯."*
 *
 * 하차 완료를 누르는 순간 카드가 사라져서 **6단계가 채워진 모습을 볼 수 없었다.**
 * 그래서 진행 중인 콜이 하나라도 남아 있는 동안에는 **하차한 콜도 함께 보여준다.**
 * 마지막 하차가 끝나면(진행 중 0건) 한꺼번에 빠진다.
 *
 * 🔴 **상태는 미루지 않는다.** 하차한 콜의 운임은 그 순간 발생하므로
 *    `ORDER_DELIVERED` 는 즉시 쓴다 — 미루면 정산·운행일지가 늦고, 서버가 죽으면
 *    "내린 짐이 안 내린 걸로" 남는다. **상태는 콜별 즉시, 화면만 사이클 단위.**
 *
 * ⚠️ 이 목록은 **화면 전용**이다. 경로·적재·운임·카운트다운은 진행 중인 콜만 봐야 한다 —
 *    섞이면 하차한 짐이 계속 실려 있는 것으로 세어진다 (`TERMINAL_STATUSES` 주석의 사고).
 */
export function deckOfCycle<T extends { status?: string | null; capturedAt?: string; completedAt?: string | null }>(calls: T[]): T[] {
    const inProgress = calls.filter(c => !isTerminal(c.status ?? undefined));
    if (inProgress.length === 0) return [];          // 사이클이 끝났다 — 완료분도 보낸다

    /**
     * 🔵 **이번 운행에서 하차한 것만이다** (기사님 확정 2026-08-22 · 버그 대장 #40).
     *
     * 기사님: *"상태가 완료된 상황인데 왜 이것이 진행중으로 나오는 거지?
     * 지금 진행중인 콜과 연결된 것도 없는데 말이지."*
     *
     * 예전 규칙은 *"진행 중이 있나"* 와 *"하차했나"* 둘만 물었다. **"같은 운행인가"를
     * 묻지 않아서**, 10:05 에 하차한 콜이 네 시간 뒤 14:24 에 잡은 새 콜과 함께 되살아났다.
     *
     * 경계는 저장하지 않고 데이터에서 파생한다 (규칙 ③):
     *   이번 운행의 시작 = 지금 진행 중인 콜 중 **가장 먼저 잡은 시각**
     *   그보다 먼저 하차했으면 지난 운행이다
     * 같은 운행이면 자연히 남는다 — 먼저 내린 콜의 하차가 뒤 콜을 잡은 뒤이기 때문이다.
     *
     * ⚠️ **하차 시각을 모르면 남긴다.** 없는 값으로 카드를 지우지 않는다 (규칙 ④) —
     *    안 보이는 것이 잘못 보이는 것보다 나쁘다.
     * ⚠️ 시각은 **반드시 날짜로** 비교한다. 장부의 두 칸은 표기가 달라(`+09:00` · `Z`)
     *    문자열로 비교하면 같은 순간이 뒤집힌다.
     */
    const ms = (s?: string | null) => { const t = Date.parse(s ?? ''); return Number.isNaN(t) ? null : t; };
    const cycleStart = inProgress.reduce<number | null>((min, c) => {
        const t = ms(c.capturedAt);
        return t === null ? min : (min === null ? t : Math.min(min, t));
    }, null);
    const inThisCycle = (c: T) => {
        if (cycleStart === null) return true;        // 잡은 시각을 모르면 가르지 않는다
        const done = ms(c.completedAt);
        return done === null || done >= cycleStart;
    };

    return [...inProgress, ...calls.filter(c => isDeliveredCall(c) && inThisCycle(c))]
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

export interface OrderSyncPayload {
    active: SecuredOrder[];
    terminated: SecuredOrder[];
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
     * 경로를 계산한 시점 — 타임라인 추정 약속의 **닻**. 지금 시각을 닻으로 쓰면
     * 추정 약속이 매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다.
     */
    routeComputedAt?: string | null;
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

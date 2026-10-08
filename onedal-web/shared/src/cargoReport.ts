import { unitPoints } from './cargoUnits';

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
 * 방법은 짐을 옮기는 행위만이다 — 둘뿐이다.
 */
// 🔴 호이스트는 방법이 아니다 (기사님: *"해본 적이 없는데 이건 그냥 뺄까?"*) — 안 해 본 일에 시간 값을 지어내면 그 값이 색을 정한다.
// 🔴 검수는 하차의 `후작업`(AFTERWORK_MINUTES)이다 (기사님: *"검수는 하차할 때 하는 거라 하차로 옮기는 것이 맞을 듯."*)
export const HANDLING_METHODS = ['지게차', '수작업'] as const;
export type HandlingMethod = typeof HANDLING_METHODS[number];



/**
 * 정거장 기록의 종류.
 *
 * `SKIPPED` — **통화를 건너뛰기로 한 결정**.
 *
 * 기사님 기준: *"완료 전까지는 페이지별로 기억하고 있어야 하고 수정이 가능해야 한다."*
 * 건너뛰기를 화면에만 두면 **새로고침하면 되살아난다** — 서버에 남긴다.
 * "안 한 일을 기록하지 않는다"는 원칙과 충돌하지 않는다 —
 * 건너뛰기는 안 한 일이 아니라 **기사님이 내린 결정**이고, 시각과 함께 남길 값이다.
 * (나중에 "적요만 보고 갔다가 문제가 생긴" 경우를 되짚을 수 있다)
 */
/**
 * 'PLANNED' 는 **화면 파생 전용**이다 (recordsOfSteps 가 만든다) — DB 에 저장되지 않는다
 * (`stop_cargo_reports` 의 CHECK 는 세 값만 안다). KEEP 때 미리 눌러 둔 차종 기본값이
 * 타임라인의 정차 계산까지 닿게 하는 통로다 — 시딩(서버)과 타임라인(관제웹)이
 * 다른 정차를 먹고 한 화면에서 두 데드라인을 말한 사고의 수리.
 */
export type CargoReportKind = 'DECLARED' | 'ACTUAL' | 'SKIPPED' | 'PLANNED';

export interface CargoReport {
    stopType: 'pickup' | 'dropoff';
    kind: CargoReportKind;
    /** 📵 상대(화주)가 콜을 취소했다 — true 면 그때 시각을 적고 · false 면 비우고 · 없으면(undefined) 그대로 둔다(통화 단계 행 counterpart_cancelled_at) */
    counterpartCancelled?: boolean;
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
     * 🕒 **도착 약속** — 통화로 정한 "몇 시까지 갈게요" (ISO · 기사님 확정).
     * 상차 소요(짐 양에 따라 변함)와 분리해 저장한다. 완료 시각은 저장하지 않고
     * `도착 약속 + 지금 추정 소요` 로 파생한다 — 신고가 약속을 흔들지 않게 (규칙 ③).
     */
    promisedArrivalAt?: string;
    /**
     * 🕒 약속의 **"부터"(하한)** (기사님) — "12시부터 12시30분 사이에 갈게요".
     * promisedArrivalAt 이 "까지"(상한·출발 마감과 지각 판정의 기준)이고, 이 칸은
     * **일찍 가도 소용없음**을 뜻한다 — 화주가 12시부터면 11:40 에 도착해도 상차는
     * 12시 시작이라, 타임라인이 뒤 정거장 도착예상을 그만큼 민다. 탭 1번(까지만)이면 없다.
     */
    promisedArrivalFromAt?: string;
    /** 🔒 보호 — 호루·결박·그물망·탑박스 (복수 선택 · 기사님) */
    protections?: string[];
    /** 🧹 후작업 — 정리·검수 (하차 전용 · 복수 선택 · 기사님) */
    afterworks?: string[];
    /**
     * **상차지 통화에서 함께 들은 하차지 도착 예정 시각.**
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
    // 새 단위(파레트/라면박스/소·중·대)를 우선 쓰고, 없으면 옛 필드 sizeClass 로 폴백
    if (r.unit) return unitPoints(r.unit, r.quantity);
    if (!r.sizeClass) return 0;
    return CARGO_SIZE_POINTS[r.sizeClass] * (r.quantity || 1);
}

/**
 * 신고값과 실측값이 얼마나 어긋났는지.
 * 1.5배 이상이면 합짐 계획이 깨진다 — 퀵사무실에 확인해야 하는 수준이다.
 */
export function cargoMismatchRatio(declared?: CargoReport | null, actual?: CargoReport | null): number | null {
    // 🔴 관문을 필드(`sizeClass`)가 아니라 **점수**로 건다 — 화면은 `unit` 만 보내므로 필드로 걸면
    //    불일치 경고가 한 번도 안 뜬다 (cargoPoints 가 unit·sizeClass 를 모두 처리한다).
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

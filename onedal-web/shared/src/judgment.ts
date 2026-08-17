/**
 * 콜의 **색을 정하는 곳 — 여기 하나뿐이다.**
 *
 * 기사님(2026-08-15): *"나는 KEEP 버튼의 내용보다는 **파란색, 녹색이면 너가 만든 코드를 믿고
 * 바로 잡을 거야**."* → 색이 곧 결정이다. 색을 틀리는 것이 이 시스템의 가장 큰 사고다 (규칙 ⑤-3).
 *
 * 🔴 **왜 `shared` 인가**: 서버가 색을 내고 관제웹이 같은 색을 설명한다. 두 곳이 각자 계산하면
 *    *"같은 콜, 다른 색"* 이 난다 — 실제로 그랬다. 2026-08-15 기준
 *      `OrderEvaluator`  똥 = 60분 이상 OR 30km 이상
 *      `recalculateKakaoRoute` 똥 = 30분 초과 OR 10km 초과   ← 자기 숫자를 갖고 있었다
 *    **같은 콜이 재탐색만 해도 색이 바뀌었다.**
 *
 * 🔴 **앱은 이 파일을 쓰지 않는다.** 앱은 색 판정을 하지 않고 `요금 ≥ 배송거리 × 단가` 만 본다
 *    (규칙 ⑤-1 — 돈은 앱이 이미 걸렀다. 서버가 다시 세지 않는다).
 *
 * 🔴 **카카오·DB·소켓을 모른다.** 값만 넣으면 색이 나오는 순수 함수라 **테스트가 값으로 증명**한다.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 판정 기준. 지금은 코드에 기본값으로 있고, **다음 단계에서 DB(`user_filters.judgment_config`)
 * 로 옮긴다.** 그래야 기사님이 도로에서 데이터를 모아 팝업에서 고칠 수 있다.
 *
 * 기사님(2026-08-15): *"나중에 실지로 도로에 나가서 데이터를 모아서 쉽게 수정할 수 있도록
 * 사용자 설정 팝업에서 수정 가능하도록 하는 기능이 필요하겠다."*
 */
export interface JudgmentConfig {
    /** 📦 합짐 — 경로에 콜을 더할 때 */
    merge: {
        /** 이 분 이하면 만점 */ honeyMaxMin: number;
        /** 이 분 이상이면 0점 */ shitMinMin: number;
        /** 이 km 이하면 만점 */ honeyMaxKm: number;
        /** 이 km 이상이면 0점 */ shitMinKm: number;
    };
    /** 🚚 첫짐 — 빈 차로 잡는 첫 콜 */
    solo: { honeyMaxMin: number; shitMinMin: number };
    /**
     * 모르는 값을 채우는 **일반값** (규칙 ⑤-2).
     * 불리한 값이 아니다 — 모르면 나쁜 쪽으로 잡던 것이 꿀콜을 놓치게 했다.
     */
    unknown: {
        /** 상차 방법 미확인 — 찾기 + 상차 + **결박** */ pickupDwellMin: number;
        /** 하차 방법 미확인 — 찾기 + 하차 */ dropoffDwellMin: number;
        /**
         * 🔴 **콜 잡은 시각 + 이만큼 = 상차 마감** (콜 대기 여유).
         *    그 시각은 "상차지 도착"이 아니라 **물건을 실어 보내는 시각**이다.
         */
        pickupOffsetMin: number;
        /** 🔴 **상차 마감 + 단독 주행 + 이만큼 = 하차 마감** (휴식 여유) */
        restMarginMin: number;
    };
    /**
     * 요소별 가중치. **상대값**이다 — 3 과 1 은 "3배 중요"라는 뜻이고 합이 10 일 필요는 없다.
     * `0` 이면 그 요소를 **색에 반영하지 않는다** (표시는 계속한다).
     *
     * 기사님(2026-08-15): *"아직 나도 어떻게 가중치를 주어야 할지 잘 모르겠어 그래서 모두 1을
     * 준 상태이다. 나중에 실지로 도로에 나가서 데이터를 모아서…"* → 전부 1 = 단순 평균.
     */
    weights: {
        driveTime: number; detourDist: number; deadline: number; slots: number;
    };
    /** 총점이 몇 점 이상이면 무슨 색인가 */
    color: { honeyMin: number; normalMin: number };
}

export const DEFAULT_JUDGMENT: JudgmentConfig = {
    // 지금 `dispatchConfig.ts` 에 있던 값을 **그대로** 옮겼다.
    // 🔴 구조를 바꾸는 일과 값을 바꾸는 일을 같이 하지 않는다 — 색이 바뀌면 원인을 못 가린다.
    merge: { honeyMaxMin: 30, shitMinMin: 60, honeyMaxKm: 15, shitMinKm: 30 },
    solo:  { honeyMaxMin: 40, shitMinMin: 90 },
    unknown: { pickupDwellMin: 15, dropoffDwellMin: 10, pickupOffsetMin: 60, restMarginMin: 30 },
    weights: { driveTime: 1, detourDist: 1, deadline: 1, slots: 1 },
    color: { honeyMin: 70, normalMin: 40 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 표 — **DB 컬럼 · 화면 폼 · 기본값이 전부 여기서 나온다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **값이 하나 늘면 이 표에 한 줄만 더한다.**
 *    DB 컬럼도, 관제웹 폼도, 기본값도 전부 이걸 읽는다 — 화면 코드와 서버 판정 코드는 안 고친다.
 *    (`PHASE_FIELDS` 가 이미 같은 패턴이다 — 표가 화면을 그린다)
 *
 * 기사님(2026-08-16): *"수정할 때마다 문서를 읽어야 할 건데.. **문서가 항상 최종본이 아닐 수
 * 있고**."* → 그래서 역할을 갈랐다:
 *      DB        지금 값이 얼마인가        ← 진실
 *      이 표      라벨 · 단위 · 범위 · **근거**  ← 관제웹 폼이 칸마다 띄운다
 *      docs      왜 그렇게 정했나 (경위)    ← 값은 안 적는다
 */
export interface JudgmentField {
    /** DB 컬럼 이름 = 폼의 키 */ col: string;
    /** `JudgmentConfig` 안의 자리 */ path: [keyof JudgmentConfig, string];
    group: '합짐' | '첫짐' | '모를 때' | '가중치' | '색 경계';
    label: string;
    unit: string;
    min: number;
    max: number;
    /** SQLite 타입 — 정수인가 실수인가 */ int: boolean;
    /** 왜 이 값인가. **폼의 칸 아래 그대로 뜬다** */ why: string;
}

export const JUDGMENT_FIELDS: readonly JudgmentField[] = [
    { col: 'merge_honey_max_minutes', path: ['merge', 'honeyMaxMin'], group: '합짐',
      label: '🔵 꿀 기준 시간', unit: '분', min: 0, max: 240, int: true,
      why: '추가 주행이 이 시간 이하면 만점' },
    { col: 'merge_shit_min_minutes', path: ['merge', 'shitMinMin'], group: '합짐',
      label: '🟡 똥 기준 시간', unit: '분', min: 0, max: 480, int: true,
      why: '이 시간 이상이면 0점' },
    { col: 'merge_honey_max_km', path: ['merge', 'honeyMaxKm'], group: '합짐',
      label: '🔵 꿀 기준 거리', unit: 'km', min: 0, max: 200, int: false,
      why: '카카오 시간에 도로 종류가 이미 반영돼 있어 거리는 보조 지표다' },
    { col: 'merge_shit_min_km', path: ['merge', 'shitMinKm'], group: '합짐',
      label: '🟡 똥 기준 거리', unit: 'km', min: 0, max: 400, int: false,
      why: '고속도로 30km 와 국도 30km 는 시간이 다르다 (기사님 2026-08-15)' },

    { col: 'solo_honey_max_minutes', path: ['solo', 'honeyMaxMin'], group: '첫짐',
      label: '🔵 꿀 기준 시간', unit: '분', min: 0, max: 240, int: true,
      why: '첫짐은 순증이 아니라 기준을 세우는 짐이다' },
    { col: 'solo_shit_min_minutes', path: ['solo', 'shitMinMin'], group: '첫짐',
      label: '🟡 똥 기준 시간', unit: '분', min: 0, max: 480, int: true, why: '' },

    { col: 'unknown_pickup_dwell_minutes', path: ['unknown', 'pickupDwellMin'], group: '모를 때',
      label: '상차 미확인', unit: '분', min: 0, max: 120, int: true,
      why: '찾기 + 상차 + 결박 (기사님 2026-08-15)' },
    { col: 'unknown_dropoff_dwell_minutes', path: ['unknown', 'dropoffDwellMin'], group: '모를 때',
      label: '하차 미확인', unit: '분', min: 0, max: 120, int: true,
      why: '찾기 + 하차 — 결박이 없어 상차보다 짧다' },
    /**
     * 🔴 `마감 미확인 여유 90분` 을 **두 규칙으로 갈랐다** (기사님 2026-08-16).
     *    *"여유"* 는 입력값이 아니라 **마감에서 계산해 나오는 값**이다 — 상수로 두면 안 된다.
     *    상차지 여유(콜 대기)와 하차지 여유(배송)는 성격이 달라 하나로 퉁칠 수도 없다.
     */
    { col: 'unknown_pickup_offset_minutes', path: ['unknown', 'pickupOffsetMin'], group: '모를 때',
      label: '상차완료 약속', unit: '분', min: 0, max: 480, int: true,
      why: '콜 잡은 시각 + 이만큼 = 물건을 실어 보내는 시각 (교통량 포함)' },
    { col: 'unknown_rest_margin_minutes', path: ['unknown', 'restMarginMin'], group: '모를 때',
      label: '휴게 버퍼', unit: '분', min: 0, max: 240, int: true,
      why: '상차완료 약속 + 주행 + 이만큼 = 하차완료 약속 (안 쉬면 경유버퍼가 된다)' },

    { col: 'weight_drive_time', path: ['weights', 'driveTime'], group: '가중치',
      label: '추가 주행', unit: '배', min: 0, max: 10, int: false,
      why: '0 이면 색에 반영하지 않는다 (표시는 계속한다)' },
    { col: 'weight_detour_dist', path: ['weights', 'detourDist'], group: '가중치',
      label: '우회 거리', unit: '배', min: 0, max: 10, int: false, why: '' },
    { col: 'weight_deadline', path: ['weights', 'deadline'], group: '가중치',
      label: '경유버퍼', unit: '배', min: 0, max: 10, int: false, why: '' },
    { col: 'weight_slots', path: ['weights', 'slots'], group: '가중치',
      label: '적재 용량', unit: '배', min: 0, max: 10, int: false, why: '' },

    { col: 'color_honey_min', path: ['color', 'honeyMin'], group: '색 경계',
      label: '🔵 꿀', unit: '점 이상', min: 0, max: 100, int: true,
      why: '총점이 이 점수 이상이면 파란색' },
    { col: 'color_normal_min', path: ['color', 'normalMin'], group: '색 경계',
      label: '🟢 보통', unit: '점 이상', min: 0, max: 100, int: true,
      why: '그 미만은 🟡 — 파란색·녹색이면 기사님이 바로 잡으신다' },
] as const;

/** 표의 기본값을 DB 컬럼 이름으로 뽑는다 (`CREATE TABLE` 의 `DEFAULT` 와 시드가 이걸 쓴다) */
export function judgmentDefaults(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of JUDGMENT_FIELDS) {
        out[f.col] = (DEFAULT_JUDGMENT[f.path[0]] as any)[f.path[1]];
    }
    return out;
}

/** DB 한 줄 → `JudgmentConfig`. 값이 없거나 이상하면 **기본값으로 메운다** */
export function judgmentFromRow(row: Record<string, any> | undefined | null): JudgmentConfig {
    const cfg: JudgmentConfig = JSON.parse(JSON.stringify(DEFAULT_JUDGMENT));
    if (!row) return cfg;
    for (const f of JUDGMENT_FIELDS) {
        const v = Number(row[f.col]);
        if (!Number.isFinite(v)) continue;
        (cfg[f.path[0]] as any)[f.path[1]] = Math.min(f.max, Math.max(f.min, v));
    }
    return cfg;
}

/** `JudgmentConfig` → DB 한 줄 */
export function judgmentToRow(cfg: JudgmentConfig): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of JUDGMENT_FIELDS) {
        const v = Number((cfg[f.path[0]] as any)[f.path[1]]);
        out[f.col] = Math.min(f.max, Math.max(f.min, Number.isFinite(v) ? v : 0));
    }
    return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 점수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CallColor = '꿀' | '보통' | '똥';

/** 요소 하나가 낸 점수 — 로그와 화면이 **이 배열을 그대로 읽는다** */
export interface ScorePart {
    /** 화면에 적을 이름 */ name: string;
    /** 사람이 읽는 원래 값 (`+6분`) */ raw: string;
    /** 0~100 */ score: number;
    weight: number;
    /** 일반값으로 때웠는가 — 화면에 `미확인` 배지를 단다 */ assumed?: boolean;
}

export interface JudgmentResult {
    score: number;              // 0~100 (가중 평균)
    color: CallColor;
    parts: ScorePart[];
    /** 점수와 무관하게 떨어뜨린 이유 (있으면 색은 무조건 '똥') */ blocked?: string;
}

/**
 * 좋을수록 100, 나쁠수록 0. `good` 이하면 만점, `bad` 이상이면 0점, 사이는 선형.
 *
 * 🔴 기존 임계값(꿀/똥)을 **그대로 두 점으로 쓴다.** 점수 구조만 씌우고 값은 안 바꾼다.
 */
export function rampDown(value: number, good: number, bad: number): number {
    if (!Number.isFinite(value)) return 0;
    if (bad <= good) return value <= good ? 100 : 0;
    if (value <= good) return 100;
    if (value >= bad) return 0;
    return Math.round(100 * (bad - value) / (bad - good));
}

const weighted = (parts: ScorePart[]): number => {
    const total = parts.reduce((a, p) => a + p.weight, 0);
    if (total <= 0) return 0;
    return Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / total);
};

const colorOf = (score: number, c: JudgmentConfig['color']): CallColor =>
    score >= c.honeyMin ? '꿀' : score >= c.normalMin ? '보통' : '똥';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MergeInput {
    /** 카카오가 준 **추가 주행** 시간(분) — 도로 종류가 이미 반영돼 있다 */ driveDiffMin: number;
    /** 추가 우회 거리(km) */ detourKm: number;
    /** 이 콜을 넣으면 늘어나는 상하차 시간(분) */ dwellMin: number;
    /** 상하차 방법을 몰라 일반값으로 때웠는가 */ dwellAssumed: boolean;
    /**
     * 마감까지 남은 여유(분).
     *   `null` 마감을 아무도 모른다  → 일반값(`unknown.detourBufferMin`)을 쓴다
     *   음수    이미 늦었다          → **합짐을 막는다**
     */
    detourBufferMin: number | null;
    /** 남은 적재 칸 / 총 칸 */ slotsFree: number; slotsTotal: number;
}

/**
 * 🔴 **경유(도착지)은 점수에 넣지 않는다.**
 *
 * 기사님 기준표에는 가중치 1로 적혀 있었지만, 같은 표 4가 *"경유 이탈 = 탈락"* 이라고
 * **하드 조건**으로도 정의한다. 두 곳에서 세면 이중 계산이다 —
 * 이탈한 콜은 어차피 탈락하므로 점수에 남는 것은 **언제나 적중(100점)** 이고,
 * 그러면 평균을 100 쪽으로 밀어 **모든 콜이 좋아 보이게** 만든다.
 *
 * 그래서 경유은 `OrderEvaluator` 의 기존 하드 게이트 **한 곳에만** 둔다.
 */

/**
 * 📦 합짐 색.
 *
 * 명세 §1-5: *"합짐은 **순증 매출** — 바닥이 '전부'(금액 무관)."*
 * 하한이 없으므로 색은 *"잡을까 말까"* 가 아니라 **"얼마나 좋은가"** 다.
 * 그래서 요금을 보지 않는다 — 돈은 앱이 이미 걸렀다 (규칙 ⑤-1).
 */
/** 첫짐 판정 입력 — 빈 차에 처음 싣는 콜은 우회가 아니라 **총 운행시간**으로 잰다 */
export interface SoloInput {
    /** 현위치→상차지→하차지 총 주행 (분) — 접근 포함 */
    driveMin: number;
}

/**
 * 🎯 **첫짐 판정** — 색을 정하는 곳은 여기 하나다 (합짐의 `scoreMerge` 와 짝).
 *
 * 🔴 2026-08-17 이관 — 예전에는 `OrderEvaluator` 가 `DISPATCH_CONFIG.SOLO_SHIT_TIME_MIN`
 *    (코드 상수 90분)을 직접 비교해 **넘으면 사유 한 줄**만 남겼다. 그래서 첫짐은
 *    색·점수 없이 "요율 🍯 인데 종합 💩" 처럼 갈라져 보였다 (2026-08-17 실측: 오포읍 콜).
 *    이제 `user_judgment` 의 첫짐 기준(꿀 40 · 똥 90 — 기사님이 탭에서 고친다)을 쓴다.
 */
export function scoreSolo(input: SoloInput, cfg: JudgmentConfig = DEFAULT_JUDGMENT): JudgmentResult {
    const parts: ScorePart[] = [{
        name: '운행시간',
        raw: `${Math.round(input.driveMin)}분`,
        score: rampDown(input.driveMin, cfg.solo.honeyMaxMin, cfg.solo.shitMinMin),
        weight: 1,
    }];
    const score = weighted(parts);
    return { score, color: colorOf(score, cfg.color), parts };
}

export function scoreMerge(input: MergeInput, cfg: JudgmentConfig = DEFAULT_JUDGMENT): JudgmentResult {
    const { merge: m, weights: w } = cfg;

    /**
     * 🔴 마감을 **정했는데** 여유가 음수면 이미 늦은 것이다. 점수와 무관하게 막는다.
     *    마감을 **안 정했으면**(null) 늦은 게 아니라 모르는 것이다 — 일반값을 쓴다.
     *    예전에는 `Math.max(0, …)` 가 둘을 `0` 으로 뭉개 **모든 합짐이 똥**이 됐다.
     */
    if (input.detourBufferMin !== null && input.detourBufferMin < 0) {
        return {
            score: 0, color: '똥', parts: [],
            blocked: `이 합짐을 붙이면 하차완료 약속을 ${-input.detourBufferMin}분 못 지킵니다 (합짐 불가)`,
        };
    }

    /**
     * 🔴 **여유를 상수로 때우지 않는다** (기사님 2026-08-16).
     *
     * 예전에는 `detourBufferMin === null` 이면 `cfg.unknown.detourBufferMin`(90분)을 썼다.
     * 기사님: *"여유 90분으로 퉁치니 문제가 발생하는 거야."* **여유는 입력값이 아니라
     * 마감에서 계산해 나오는 값**이다 — 이제 `computeAllowedDetour` 가 통화 마감이 없어도
     * **추정 마감**(잡은 시각+60분 / 상차마감+주행+30분)에서 구해 넘긴다.
     *
     * 그래도 `null` 이 오면 그 콜은 **마감을 셀 근거가 아예 없다**는 뜻이다
     * (잡은 시각도 주행 시간도 모른다). 지어내지 않고 이 요소를 **점수에서 뺀다** — 규칙 ④.
     */
    const slackUnknown = input.detourBufferMin === null;
    const slack = input.detourBufferMin ?? 0;
    const totalAdd = input.driveDiffMin + input.dwellMin;

    const parts: ScorePart[] = [
        {
            name: '추가 주행', raw: `+${input.driveDiffMin}분`, weight: w.driveTime,
            score: rampDown(input.driveDiffMin, m.honeyMaxMin, m.shitMinMin),
        },
        {
            name: '우회 거리', raw: `+${input.detourKm.toFixed(1)}km`, weight: w.detourDist,
            score: rampDown(input.detourKm, m.honeyMaxKm, m.shitMinKm),
        },
        {
            // 여유의 절반 안이면 만점, 여유를 다 쓰면 0점
            name: '경유버퍼',
            raw: slackUnknown ? `${totalAdd}분 / 모름` : `${totalAdd}분 / ${slack}분`,
            // 근거가 없으면 가중치 0 — 색에 영향을 주지 않는다 (지어낸 점수로 밀지 않는다)
            weight: slackUnknown ? 0 : w.deadline,
            score: slackUnknown ? 0 : rampDown(totalAdd, slack / 2, slack),
            assumed: slackUnknown,
        },
        {
            name: '적재 용량', raw: `${input.slotsFree}/${input.slotsTotal}박스`, weight: w.slots,
            score: input.slotsTotal > 0
                ? Math.round(100 * Math.max(0, input.slotsFree) / input.slotsTotal) : 0,
        },
    ];
    if (input.dwellAssumed) {
        // 상하차를 일반값으로 때웠다는 사실은 **경유버퍼** 점수에 섞여 들어간다
        parts[2].assumed = true;
    }

    const score = weighted(parts);
    return { score, color: colorOf(score, cfg.color), parts };
}

/**
 * 🚚 첫짐 색은 **이번 단계에서 건드리지 않는다.**
 *
 * 고장은 합짐 쪽에 있었고(마감 여유 0 → 모든 합짐이 똥), 재탐색이 자기 숫자를 쓰던 것도
 * 합짐 경로다. 첫짐까지 같이 바꾸면 색이 변했을 때 **원인이 둘**이 된다.
 * 표 2(첫짐 가중치)는 판정 기준을 DB 로 옮기는 단계에서 함께 붙인다.
 */

/** 로그·화면이 그대로 쓰는 한 줄 요약 */
export function describeJudgment(r: JudgmentResult): string {
    if (r.blocked) return `🚫 ${r.blocked}`;
    const icon = r.color === '꿀' ? '🔵' : r.color === '보통' ? '🟢' : '🟡';
    const body = r.parts.map(p => `${p.name} ${p.raw}(${p.score})${p.assumed ? '·미확인' : ''}`).join(' · ');
    return `${icon} 총점 ${r.score} — ${body}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 콜을 부르는 이름 — **조합해서 만든다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **콜 이름은 여기서만 만든다** (기사님 확정 2026-08-16).
 *
 * ```
 * 타겟명  +  첫짐(생략) / 합짐N  +  (후보)  +  콜
 * ```
 * | 타겟 | 첫짐 | 첫 합짐 | 두 번째 합짐 |
 * |---|---|---|---|
 * | 목적지 | `목적지콜` | `목적지합짐1콜` | `목적지합짐2콜` |
 * | 관내 | `관내콜` | `관내합짐1콜` | `관내합짐2콜` |
 * | 복귀 | `복귀콜` | `복귀합짐1콜` | `복귀합짐2콜` |
 *
 * 심사 전(안전취소에서 결재 안 난 콜)은 `후보` 를 넣는다 — `목적지 합짐1 후보콜`.
 *
 * 🔴 **`본콜` 은 폐기했다.** 한 단어가 세 뜻으로 쓰이고 있었다 —
 *    `routeComposer` 는 *잡아 둔 첫 콜*, `kakaoService` 는 *첫짐*, 그리고
 *    `OrderEvaluator` 의 `본콜 좌표 누락` 은 실제로 **후보콜**이었다.
 *    그래서 기사님이 *"내가 KEEP 한 첫 콜에 문제가 있나?"* 로 잘못 읽으셨다 (2026-08-16).
 */
const TARGET_LABEL: Record<string, string> = { DEST: '목적지', LOCAL: '관내', HOME: '복귀' };

export function callName(opts: {
    /** `callTarget` — 모르면 타겟명을 빼고 부른다 (지어내지 않는다) */
    target?: string | null;
    /** `getActiveCalls()` 순서. `0` = 첫짐 · `1` = 합짐1 · `2` = 합짐2 */
    index: number;
    /** 아직 결재가 안 난 콜인가 */
    candidate?: boolean;
}): string {
    const target = opts.target ? (TARGET_LABEL[opts.target] ?? '') : '';
    const slot = opts.index <= 0 ? '' : `합짐${opts.index}`;
    if (!opts.candidate) return `${target}${slot}콜` || '콜';
    // 후보는 띄어 쓴다 — `목적지 합짐1 후보콜`
    return [target, slot, '후보콜'].filter(Boolean).join(' ');
}

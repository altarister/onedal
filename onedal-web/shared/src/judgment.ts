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
        /** 마감 미확인 — 용달 마감 2시간 − 상하차 30분 */ slackMin: number;
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
    unknown: { pickupDwellMin: 15, dropoffDwellMin: 10, slackMin: 90 },
    weights: { driveTime: 1, detourDist: 1, deadline: 1, slots: 1 },
    color: { honeyMin: 70, normalMin: 40 },
};

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
     *   `null` 마감을 아무도 모른다  → 일반값(`unknown.slackMin`)을 쓴다
     *   음수    이미 늦었다          → **합짐을 막는다**
     */
    slackMin: number | null;
    /** 남은 적재 칸 / 총 칸 */ slotsFree: number; slotsTotal: number;
}

/**
 * 🔴 **회랑(도착지)은 점수에 넣지 않는다.**
 *
 * 기사님 기준표에는 가중치 1로 적혀 있었지만, 같은 표 4가 *"회랑 이탈 = 탈락"* 이라고
 * **하드 조건**으로도 정의한다. 두 곳에서 세면 이중 계산이다 —
 * 이탈한 콜은 어차피 탈락하므로 점수에 남는 것은 **언제나 적중(100점)** 이고,
 * 그러면 평균을 100 쪽으로 밀어 **모든 콜이 좋아 보이게** 만든다.
 *
 * 그래서 회랑은 `OrderEvaluator` 의 기존 하드 게이트 **한 곳에만** 둔다.
 */

/**
 * 📦 합짐 색.
 *
 * 명세 §1-5: *"합짐은 **순증 매출** — 바닥이 '전부'(금액 무관)."*
 * 하한이 없으므로 색은 *"잡을까 말까"* 가 아니라 **"얼마나 좋은가"** 다.
 * 그래서 요금을 보지 않는다 — 돈은 앱이 이미 걸렀다 (규칙 ⑤-1).
 */
export function scoreMerge(input: MergeInput, cfg: JudgmentConfig = DEFAULT_JUDGMENT): JudgmentResult {
    const { merge: m, weights: w } = cfg;

    /**
     * 🔴 마감을 **정했는데** 여유가 음수면 이미 늦은 것이다. 점수와 무관하게 막는다.
     *    마감을 **안 정했으면**(null) 늦은 게 아니라 모르는 것이다 — 일반값을 쓴다.
     *    예전에는 `Math.max(0, …)` 가 둘을 `0` 으로 뭉개 **모든 합짐이 똥**이 됐다.
     */
    if (input.slackMin !== null && input.slackMin < 0) {
        return {
            score: 0, color: '똥', parts: [],
            blocked: `이미 마감을 ${-input.slackMin}분 넘겼습니다 (합짐 불가)`,
        };
    }

    const slackAssumed = input.slackMin === null;
    const slack = slackAssumed ? cfg.unknown.slackMin : input.slackMin!;
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
            name: '마감 여유', raw: `${totalAdd}분 / ${slack}분`, weight: w.deadline,
            score: rampDown(totalAdd, slack / 2, slack), assumed: slackAssumed,
        },
        {
            name: '적재 칸', raw: `${input.slotsFree}/${input.slotsTotal}칸`, weight: w.slots,
            score: input.slotsTotal > 0
                ? Math.round(100 * Math.max(0, input.slotsFree) / input.slotsTotal) : 0,
        },
    ];
    if (input.dwellAssumed) {
        // 상하차를 일반값으로 때웠다는 사실은 **마감 여유** 점수에 섞여 들어간다
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

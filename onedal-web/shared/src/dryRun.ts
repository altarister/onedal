/**
 * 🧪 **새 판정 채점기 (dryRun)** — docs/지금/판정.md 의 구현.
 *
 * 노하우 4콜 낙제(2026-08-21 · 전부 🟡)의 답이다. 확정된 뼈대:
 *
 *   **조건 전수를 표시하고, 축 셋으로 색을 내고, 서버는 떨어뜨리지 않는다.**
 *
 *   문지기(통과/실패) — 실패 = 🔴 고정 + 사유. 자동 탈락 없음 (규칙 ①)
 *   축(0~100 × 가중치) — 순증 대비 우회 · 버퍼 소비 · 적재 · 시급(첫짐)
 *   딱지(사실만) — 우회 절대값 · 통화 필요 · 블라인드 · 미확인
 *
 * 🔴 **이름이 `dryRun` 이지만 시험 주행이 아니다 — 이게 지금 쓰는 채점기다** (2026-08-28 확인).
 *
 *    여기 «서버 로그에만 나간다» 고 적혀 있었는데 **사실이 아니었다.** 실제로는
 *      ① `order_judgments` 에 색·점수·상세가 저장되고 (심사 1회, 불변)
 *      ② `dry.color` 가 문구를 «잡을 이유 / 버릴 이유» 로 가르고
 *      ③ 그 문구의 표식을 관제웹 카드가 읽어 **화면 색을 정한다**
 *    기사님이 보는 🔵🟢🟡🔴 가 이 함수의 결과다. 고칠 때 그렇게 알고 고쳐야 한다.
 *
 * ⚠️ 화면이 색을 **값이 아니라 문자열 표식**으로 받는 것이 이 구조의 가장 약한 곳이다 —
 *    문구를 바꾸면 색이 조용히 틀어진다. 고칠 것은 docs/지금/판정.md §7 에.
 */
import type { JudgmentConfig } from './judgment';

export interface DryRunGate {
    key: string;
    name: string;
    pass: boolean;
    /** 실패했을 때 기사님이 읽는 문장 — "잡으면 ~가 깨집니다" */
    why: string | null;
}

export interface DryRunAxis {
    key: string;
    name: string;
    /** 0~100 */
    score: number;
    weight: number;
    /** 판단 없이 사실만 — 화면·로그에 그대로 적는 문자열 */
    raw: string;
}

export interface DryRunInput {
    kind: 'first' | 'merge';
    fare: number;
    /** 합짐: 이 콜을 붙일 때 늘어나는 총 소요(주행 delta + 정차 delta, 분) */
    detourExtraMin?: number | null;
    /** 합짐: 붙인 뒤 경로의 최소 버퍼(기존 콜 정거장만, 분). null = 잴 약속이 없다 */
    bufferAfterMin?: number | null;
    /** 합짐: 붙이기 전 최소 버퍼 — 소비량 표시용 */
    bufferBeforeMin?: number | null;
    /** 첫짐: 접근 + 정차 + 배송 전체 소요(분) */
    totalMinutes?: number | null;
    /** 적재 여유 % (0~100). null = 모름 */
    slotsFreePct?: number | null;
    gates: DryRunGate[];
    /** 판단 없는 사실 딱지 — 서버가 조립해 넘긴다 */
    tags: string[];
    /** 시급 목표(원/시간). 생략하면 판정 기준 탭의 `target.hourlyKrw` (캘리브레이션으로 3.0만 확정) */
    targetHourlyKrw?: number;
}

export interface DryRunVerdict {
    /** '사고' = 문지기 실패 (🔴). 뜻은 "잡으면 사고" 하나 — 사유 문장이 가른다 */
    color: '꿀' | '보통' | '똥' | '사고';
    /** 축 가중 평균. 문지기 실패여도 계산해 둔다 — 캘리브레이션 재료 */
    score: number;
    axes: DryRunAxis[];
    gates: DryRunGate[];
    tags: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const manwon = (krw: number) => (krw / 10_000).toFixed(1);

export function scoreDryRun(input: DryRunInput, cfg: JudgmentConfig): DryRunVerdict {
    // 🎯 기준은 전부 판정 기준 탭(DB)에서 — 기본값의 원천은 DB 다 (규칙 ③)
    const target = input.targetHourlyKrw ?? cfg.target.hourlyKrw;
    const w = cfg.weights;
    const axes: DryRunAxis[] = [];

    if (input.kind === 'merge') {
        // ── 순증 대비 우회 — "같은 40분이라도 3.5만이면 좋고 5천원이면 나쁘다" (기사님 확정 ②)
        if (input.detourExtraMin != null && input.detourExtraMin > 0) {
            const hourly = (input.fare / input.detourExtraMin) * 60;
            axes.push({
                key: 'revenuePerDetour', name: '순증 대비 우회',
                score: clamp((hourly / target) * 100), weight: w.revenueDetour,
                raw: `${manwon(input.fare)}만 ÷ ${input.detourExtraMin}분 = ${manwon(hourly)}만/h`,
            });
        } else if (input.detourExtraMin != null) {
            // 우회 0분 이하 — 길목 콜. 공짜 순증이므로 만점
            axes.push({ key: 'revenuePerDetour', name: '순증 대비 우회', score: 100, weight: w.revenueDetour,
                        raw: `우회 ${input.detourExtraMin}분 — 길목` });
        }

        // ── 버퍼 소비 — 콜을 붙인 뒤 "남는 최소 버퍼"로 잰다 (곡선: 30분↑ 100 · 0분 40 · 음수 0)
        if (input.bufferAfterMin != null) {
            const a = input.bufferAfterMin;
            const score = a >= 30 ? 100 : a >= 0 ? 40 + 2 * a : 0;
            const spent = input.bufferBeforeMin != null ? input.bufferBeforeMin - a : null;
            axes.push({
                key: 'bufferCost', name: '버퍼 소비', score: clamp(score), weight: w.bufferCost,
                raw: `${spent != null ? `소비 ${spent}분 → ` : ''}최소 ${a >= 0 ? '+' : ''}${a}분`,
            });
        }
        // ── 적재 (합짐만) — 남을수록 다음 합짐 여지가 크다 (옛 축 보존).
        //    첫짐은 빈 차라 늘 ~만점이 되어 시급 축을 희석한다 — 축에서 빼고 사실만 안다
        if (input.slotsFreePct != null) {
            axes.push({ key: 'loadCapacity', name: '적재', score: clamp(input.slotsFreePct), weight: w.slots,
                        raw: `여유 ${Math.round(input.slotsFreePct)}%` });
        }
    } else {
        // ── 시급 (첫짐) — 요금 ÷ (접근+정차+배송)
        if (input.totalMinutes != null && input.totalMinutes > 0) {
            const hourly = (input.fare / input.totalMinutes) * 60;
            axes.push({
                key: 'hourlyRate', name: '시급', score: clamp((hourly / target) * 100), weight: w.revenueDetour,
                raw: `${manwon(input.fare)}만 ÷ ${input.totalMinutes}분 = ${manwon(hourly)}만/h`,
            });
        }
    }

    const totalW = axes.reduce((a, x) => a + x.weight, 0);
    const score = totalW > 0
        ? Math.round(axes.reduce((a, x) => a + x.score * x.weight, 0) / totalW)
        : 0;

    const failed = input.gates.some(g => !g.pass);
    const color: DryRunVerdict['color'] = failed ? '사고'
        : score >= cfg.color.honeyMin ? '꿀'
        : score >= cfg.color.normalMin ? '보통' : '똥';

    return { color, score, axes, gates: input.gates, tags: input.tags };
}

/**
 * 🧮 **합짐의 우회는 한계 비용이다 — 첫짐 대비 누적이 아니다** (문제지 캘리브레이션 1차 · 2026-08-21)
 *
 * 카카오 `timeDiffMin` 은 **첫짐 단독 대비**라, 나중에 온 후보일수록 앞 합짐들의
 * 비용까지 뒤집어쓴다. 문제지 실측: 16번의 delta +189분 — 진짜 한계 비용은
 * 294(4콜) − 251(직전 3콜) = **43분**이었다. 이 부풀림이 옛 판정 낙제(+162분)와
 * dryRun 1차의 15·16 🟢(합격선 🔵) 둘 다의 원인이다.
 *
 * 직전 경로의 총 소요를 알면 그걸 빼고, 모르면(첫 합짐 — 직전 = 첫짐 단독) 카카오
 * delta 를 그대로 쓴다 — 그때는 둘이 같은 값이다.
 */
export function marginalDetourMin(
    mergedTotalMin: number,
    prevRouteTotalMin: number | null,
    fallbackDiffMin: number,
): number {
    return prevRouteTotalMin != null ? Math.round(mergedTotalMin - prevRouteTotalMin) : fallbackDiffMin;
}

/** 로그 한 줄 — `🧪 [dryRun] 🟢 64점 (순증 2.6만/h · 버퍼 최소 +18분) · 딱지: 통화 필수` */
export function describeDryRun(v: DryRunVerdict): string {
    const emoji = v.color === '꿀' ? '🔵' : v.color === '보통' ? '🟢' : v.color === '똥' ? '🟡' : '🔴';
    const gates = v.gates.filter(g => !g.pass).map(g => g.why ?? g.name);
    const head = gates.length
        ? `${emoji} 잡으면 사고 — ${gates.join(' · ')} (축점 ${v.score})`
        : `${emoji} ${v.score}점`;
    const axes = v.axes.map(a => `${a.name} ${a.raw}(${a.score})`).join(' · ');
    const tags = v.tags.length ? ` · 딱지: ${v.tags.join(' · ')}` : '';
    return `${head}${axes ? ` — ${axes}` : ''}${tags}`;
}

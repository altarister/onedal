import type { JudgmentConfig } from './judgment';

/**
 * ⚖️ **판정 — 기준 하나하나가 따로 살고, 엔진은 더하기만 한다** (2026-08-29 · 5단계)
 *
 * 기사님: *"모든 값은 이 기능만 통해서만 항상 같은 값을 가질 거야. 먼발치서 가장
 * 효율적인 구조가 되어야 해. 우리 프로젝트의 핵심이야."*
 * *"각각의 기준이 서로 섞이지 않도록 스마트하게 만들어줘. 기준이 추가될 수도 삭제될 수도 있어."*
 *
 * ══ 섞이지 않게 하는 법 — 규율이 아니라 **구조** ══
 *
 * 🔴 **기준은 자기 몫의 사실만 받는다.** 남의 사실은 **타입에 아예 없어서 못 본다.**
 *    「조심해서 안 쓰기」로는 언젠가 샌다 — 이 레포가 여러 번 겪은 그것이다.
 *    (같은 사실을 두 곳에서 세던 사고: 경유 4벌 · 상태목록 3벌 · 시별칭)
 *
 * ```
 * 사실 = { money: {...}, promise: {...}, space: {...}, nature: {...}, geography: {...} }
 *                ↓            ↓             ↓
 *            돈 기준      약속 기준      공간 기준     ← 각자 자기 칸만 받는다
 * ```
 *
 * ══ 기준을 더하거나 빼는 법 ══
 *
 * `CRITERIA` 목록에 한 줄 넣거나 빼면 끝이다. **엔진은 안 고친다.**
 * 화면·저장·평균은 전부 이 목록에서 파생된다 (규칙 ③).
 * 새 기준의 가중치 칸만 `JUDGMENT_FIELDS` 에 함께 넣는다 — 기사님이 못 고치는 값을
 * 만들지 않기 위해서다 (규칙 ⑤-4 ①).
 *
 * ══ 세 가지 대답을 가른다 ══
 *
 * | 대답 | 뜻 | 어떻게 다루나 |
 * |---|---|---|
 * | **점수** | 쟀다 | 평균에 든다 |
 * | **잴 게 없다** | 잴 **대상**이 없다 (첫짐엔 지킬 약속이 없다) | 조용히 뺀다. 정상이다 |
 * | **잴 수 없다** | 잴 **재료**가 없다 (카카오가 터졌다) | 🔴 로 보내고 «못 쟀다»고 적는다 |
 *
 * 🔴 이 셋을 뭉뚱그리면 두 가지 사고가 난다 —
 *    ① 재료가 없는데 «괜찮다»고 넘어간다  ② 잴 게 없는 첫짐이 «못 쟀다»로 빨간불이 된다.
 *
 * ══ 갈아탔다 (2026-08-29) ══
 *
 * 만들 때는 아무도 안 불렀다. 옛 채점기와 나란히 놓고 **84건을 대조해 어긋남 0** 을
 * 확인한 뒤 갈아탔다 (검사 73 · 기사님 리허설 11). 옛 채점기는 그 뒤 **철거했다**.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기준이 내놓는 대답
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Outcome =
    /** 쟀다. `hardFail` 이면 점수와 무관하게 «잡으면 사고» — 가중치가 0 이면 이것도 안 본다 */
    | { kind: 'scored'; score: number; why: string; hardFail?: boolean }
    /** 잴 **대상**이 없다 — 첫짐엔 지킬 약속이 없고, 빈 차엔 자리 문제가 없다 */
    | { kind: 'nothing'; why: string }
    /** 잴 **재료**가 없다 — 카카오가 터졌다, 주소를 못 찾았다 */
    | { kind: 'unmeasurable'; why: string };

export const scored = (score: number, why: string, hardFail = false): Outcome =>
    ({ kind: 'scored', score: Math.max(0, Math.min(100, Math.round(score))), why, hardFail });
export const nothing = (why: string): Outcome => ({ kind: 'nothing', why });
export const unmeasurable = (why: string): Outcome => ({ kind: 'unmeasurable', why });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기준 하나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 가중치가 사는 칸 — `JudgmentConfig.weights` 의 이름이어야 한다 (DB 칸과 이어진다) */
export type WeightKey = keyof JudgmentConfig['weights'];

export interface Criterion<F> {
    /** 저장·설정에서 쓰는 이름. 사실 꾸러미의 칸 이름이기도 하다 */
    key: string;
    /** 화면에 보이는 이름 */
    name: string;
    /** 한 줄 설명 — 화면이 «무엇을 보는 기준인가»를 말할 수 있게 */
    asks: string;
    weightKey: WeightKey;
    /**
     * 🔴 **자기 몫의 사실만 받는다.** 남의 칸은 타입에 없다.
     *    `undefined` 는 «그 사실 자체가 안 왔다» — 대개 「잴 수 없다」다.
     */
    measure(facts: F | undefined, cfg: JudgmentConfig): Outcome;
}

/** 목록에 넣을 때 타입을 잃지 않게 감싸는 것 뿐 — 하는 일은 없다 */
export const defineCriterion = <F>(c: Criterion<F>): Criterion<any> => c as Criterion<any>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결과
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Color = '꿀' | '보통' | '똥' | '사고';

export interface JudgedCriterion {
    key: string;
    name: string;
    asks: string;
    weight: number;
    outcome: Outcome;
}

export interface Judgment {
    color: Color;
    /** 잰 기준들의 가중 평균. 하나도 못 쟀으면 `null` — **0 이 아니다** (0 은 «나쁘다»로 읽힌다) */
    score: number | null;
    criteria: JudgedCriterion[];
    /** 색을 안 건드리는 것들 — «평소보다 큰 요금입니다» 같은 것 */
    notes: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 엔진 — 더하기만 한다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 사실 꾸러미 — 칸 이름이 기준의 `key` 와 같다. 값의 모양은 **각 기준이** 정한다.
 *
 * ⚠️ 여기서 칸을 열거하지 않는다. 열거하면 **기준을 더할 때 두 곳을 고쳐야** 하고,
 *    한쪽만 고치면 조용히 어긋난다 (규칙 ③). 꾸러미의 모양은 `criteria.ts` 가 적는다.
 */
export type Facts = { notes?: string[]; [criterionKey: string]: unknown };

/**
 * 🔴 **여기서 기준을 알아보지 않는다.** 어떤 기준이 몇 개든 똑같이 돈다 —
 *    그래서 기준을 더하거나 빼도 이 함수는 안 고친다.
 */
export function judge(criteria: Array<Criterion<any>>, facts: Facts, cfg: JudgmentConfig): Judgment {
    const bag = facts as Record<string, unknown>;
    const rows: JudgedCriterion[] = criteria.map(c => ({
        key: c.key, name: c.name, asks: c.asks,
        weight: cfg.weights[c.weightKey] ?? 0,
        // 가중치 0 = «이 기준은 안 본다». 재지도 않는다 — 재면 «잴 수 없다»가 색을 덮는다
        outcome: (cfg.weights[c.weightKey] ?? 0) > 0
            ? c.measure(bag[c.key], cfg)
            : nothing('안 봄 (가중치 0)'),
    }));

    /** 색에 드는 것 = 가중치가 있고 실제로 점수가 나온 것 */
    const counted = rows.filter(r => r.weight > 0 && r.outcome.kind === 'scored');
    const cannot = rows.filter(r => r.weight > 0 && r.outcome.kind === 'unmeasurable');

    const totalW = counted.reduce((a, r) => a + r.weight, 0);
    const score = totalW > 0
        ? Math.round(counted.reduce((a, r) =>
            a + (r.outcome as { score: number }).score * r.weight, 0) / totalW)
        : null;

    /**
     * 🔴 **못 쟀으면 색을 지어내지 않는다** (규칙 ⑤ · 3단계에서 정한 것 그대로).
     *    잴 재료가 하나라도 없거나, 잰 기준이 하나도 없으면 🔴 다.
     *    «못 쟀다»는 «나쁘다»가 아니다 — 딱지가 그 말을 한다.
     */
    const hardFailed = counted.some(r => (r.outcome as { hardFail?: boolean }).hardFail);
    const color: Color =
        hardFailed || cannot.length > 0 || score == null ? '사고'
        : score >= cfg.color.honeyMin ? '꿀'
        : score >= cfg.color.normalMin ? '보통' : '똥';

    const notes = [...(facts.notes ?? [])];
    if (score == null) notes.push('잴 수 없음 — 재료가 없어 점수를 못 냅니다');
    else for (const r of cannot) notes.push(`잴 수 없음 — ${r.name}: ${r.outcome.why}`);

    return { color, score, criteria: rows, notes };
}


/**
 * 🎁 **새 판정을 화면이 아는 모양으로 옮긴다** (2026-08-29 · 6단계 갈아타기)
 *
 * 관제웹 카드는 **조건 전수**를 그린다 — 기사님: *"모든 조건이 표시되었으면 좋겠다."*
 * 그 화면이 읽는 칸은 `axes`(기준) · `gates`(무조건 빨간불) · `tags`(딱지) 셋이다.
 * **화면을 고치지 않고** 새 판정을 그 칸에 옮겨 담는다 — 갈아타기를 한 걸음으로 줄인다.
 *
 * 🔴 **기준은 하나도 빼지 않는다.** 「잴 게 없음」·「잴 수 없음」도 그대로 보인다 —
 *    그게 «전수»다. 점수 대신 이유가 적힌다.
 * 🔴 **점수는 못 쟀으면 `null` 이다.** 0 으로 바꾸지 않는다 (0 은 «나쁘다»로 읽힌다).
 */
export function toSnapshot(v: Judgment) {
    const scoreOf = (o: Outcome) => (o.kind === 'scored' ? o.score : null);
    return {
        color: v.color,
        score: v.score,
        axes: v.criteria.map(c => ({
            key: c.key, name: c.name,
            // 🔴 못 잰 기준은 **null** 이다 — 위 주석대로. `?? 0` 이었을 때
            //    첫짐 카드가 「약속 — 잡아 둔 콜이 없습니다 (0점)」 로 그려졌다
            score: scoreOf(c.outcome),
            weight: c.weight,
            // 점수를 못 낸 기준은 **숫자 대신 이유**가 보인다
            raw: c.outcome.kind === 'scored' ? c.outcome.why
                : c.outcome.kind === 'nothing' ? `— ${c.outcome.why}`
                : `⚠️ ${c.outcome.why}`,
        })),
        /** 「잡으면 사고」로 색을 덮은 기준만 — 화면이 빨간 줄로 그린다 */
        gates: v.criteria
            .filter(c => c.outcome.kind === 'scored' && (c.outcome as { hardFail?: boolean }).hardFail)
            .map(c => ({ key: c.key, name: c.name, pass: false, why: (c.outcome as { why: string }).why })),
        tags: v.notes,
    };
}

/** 한 줄 설명 — 로그·화면이 같은 말을 쓰게 (규칙 ③) */
export function describe(v: Judgment): string {
    const emoji = v.color === '꿀' ? '🔵' : v.color === '보통' ? '🟢' : v.color === '똥' ? '🟡' : '🔴';
    const head = v.score == null ? `${emoji} 잴 수 없음` : `${emoji} ${v.score}점`;
    const body = v.criteria
        .filter(r => r.outcome.kind === 'scored')
        .map(r => `${r.name} ${r.outcome.why}(${(r.outcome as { score: number }).score})`)
        .join(' · ');
    const skipped = v.criteria
        .filter(r => r.outcome.kind !== 'scored')
        .map(r => `${r.name} ${r.outcome.why}`)
        .join(' · ');
    return [head, body, skipped && `[${skipped}]`, v.notes.length && `딱지: ${v.notes.join(' · ')}`]
        .filter(Boolean).join(' — ');
}

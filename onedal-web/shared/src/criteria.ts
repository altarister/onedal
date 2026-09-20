import { defineCriterion, scored, multiplied, nothing, unmeasurable } from './judge';
import type { Criterion } from './judge';

/**
 * ⚖️ **판정 기준 다섯 — 하나씩 따로 산다** (2026-08-29 · 5단계)
 *
 * 기준을 더하거나 빼려면 **이 파일의 목록만** 고친다. 엔진(`judge.ts`)은 안 고친다.
 * 🔴 새 기준을 넣을 때는 **가중치 칸을 `JUDGMENT_FIELDS` 에 함께** 넣는다 —
 *    안 그러면 기사님이 못 고치는 값이 또 태어난다 (규칙 ⑤-4 ①).
 *
 * ══ 왜 이 다섯인가 ══
 *
 * 판정에 관여하던 **13개 사유를 전수조사**해서 나눠 담은 결과다 (2026-08-29).
 * 새로 만든 규칙이 하나도 없다 — 있던 것을 자리에 넣기만 했다.
 *
 * | 있던 사유 | 어디로 |
 * |---|---|
 * | 첫짐 하한가 미달 · 요율 미달 | **돈** |
 * | 이미 잡은 콜이 늦는다 | **약속** |
 * | 자리 부족 | **공간** |
 * | 같이 못 싣는 조합 · 제외 키워드 | **성질** |
 * | 경유 이탈 | 🪦 **지웠다** — 합짐의 지리는 「돈」(우회 시급)이 이미 센다. 지금 「지리」는 **첫짐의 목적지 전진 배수**다 |
 * | 요금 초과 · 경유 미확정 · **차종 불일치** | **딱지** (색을 안 건드린다) |
 * | 주소 못 찾음 · 카카오 실패 · API 키 없음 | **잴 수 없음** (🔴) |
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💰 돈 — 이 시간 써서 얼마 버나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MoneyFacts {
    /** 이 콜의 운임(원) */
    fare: number;
    /**
     * 이 콜 때문에 **더 쓰는 시간**(분). 주행 + 상하차 정차까지.
     * 첫짐이면 «이 콜에 쓰는 전체 시간», 합짐이면 «붙여서 늘어나는 시간».
     * 🔴 모르면 `null` — 지어내지 않는다 (규칙 ④).
     */
    extraMinutes: number | null;
    /** 이 콜에 걸린 평소 하한가(원). 없으면 안 본다 */
    minAcceptableKrw?: number | null;
    /**
     * **빈 차에 처음 싣는 콜인가.** 눈금을 고르는 데만 쓴다 — 첫짐은 `soloHourlyKrw` 하나로,
     * 합짐은 두 점 꺾은선(`hourlyKrw` 50점 · `honeyHourlyKrw` 100점)으로 잰다.
     *
     * 🔴 **판정 함수는 여전히 하나다** (2026-08-29 결정) — 갈래는 여기, 사실을 채울 때 갈린다.
     *    까닭: 기회비용이 다르다. 합짐은 안 잡아도 잃는 것이 없고 첫짐은 안 잡으면 0원이다.
     */
    firstLoad: boolean;
}

/**
 * 기사님 확정: *"같은 40분이라도 3.5만이면 좋고 5천원이면 나쁘다."*
 * → **절대 문턱(30분 이하면 꿀)을 폐기**하고 시급으로 잰다. 그 옛 상수 넷은 지웠다.
 *
 * 🔴 **눈금은 두 점이다** — 보통 시급에서 50점, 꿀 시급에서 100점 (기사님 확정).
 *    한 점 비율이던 시절엔 보통 기준에서 이미 천장을 쳐 좋은 콜끼리 구분이 없었다.
 *    첫짐은 제 기준선 하나로 잰다 — 까닭은 아래 `measure` 안에.
 *
 * 🔴 **여기가 돈을 보는 유일한 곳이다.** 규칙 ⑤-1 — 돈은 앱이 이미 걸렀다.
 *    다른 기준이 요금을 다시 보면 같은 사실을 두 번 세는 것이다.
 */
export const MONEY = defineCriterion<MoneyFacts>({
    key: 'money', name: '돈', asks: '이 시간 써서 얼마 버나',
    weightKey: 'revenueDetour',
    measure(f, cfg) {
        if (!f) return unmeasurable('요금·소요를 못 받았습니다');
        if (f.extraMinutes == null) return unmeasurable('걸리는 시간을 못 쟀습니다');
        // 우회가 없는 길목 콜 — 운임이 통째로 이득이다
        if (f.extraMinutes <= 0) return scored(100, `우회 ${f.extraMinutes}분 — 길목`);

        const hourly = (f.fare / f.extraMinutes) * 60;
        const toManwon = (n: number) => (n / 10_000).toFixed(1);
        const T = cfg.target.hourlyKrw, H = cfg.target.honeyHourlyKrw, S = cfg.target.soloHourlyKrw;
        const scaleNote = f.firstLoad ? `첫짐 기준 ${toManwon(S)}만` : `보통 ${toManwon(T)}만 · 꿀 ${toManwon(H)}만`;
        const why = `${toManwon(f.fare)}만 ÷ ${f.extraMinutes}분 = ${toManwon(hourly)}만/h (${scaleNote})`;

        /**
         * 🔴 **눈금이 국면마다 다르다** (기사님 확정 · 설계서 §4-2·§4-3).
         *    판정 함수는 하나고(2026-08-29), 갈리는 것은 **눈금 하나**다 — 까닭은 기회비용이다.
         *
         *    첫짐   안 잡으면 그 시간이 0원이다        → 제 기준선 하나로 후하게
         *    합짐   안 잡아도 잃는 것이 없다            → 두 점 꺾은선으로 엄격하게
         *
         *    🔴 합짐을 한 점 비율로 재면 **보통 기준에서 천장을 쳐** 3만/h 와 5만/h 가 같은 꿀이 된다.
         *       그래서 우회 235분짜리도 요금만 크면 보통으로 올라왔다 (쌓인 판정 53건).
         */
        const base = f.firstLoad
            ? (hourly / S) * 100
            : hourly <= T
                ? 50 * (hourly / T)
                // 꿀 기준을 보통 이하로 내려 두면 «보통을 넘으면 꿀»이 된다 — 꺾은선의 극한이라 값을 지어내지 않는다
                : H > T ? 50 + 50 * ((hourly - T) / (H - T)) : 100;

        /**
         * 🔴 **하한가 미달은 색을 «무조건 빨간불»로 만들지 않는다** (규칙 ①).
         *    서버는 콜을 자동으로 버리지 않는다 — 점수로만 말한다.
         *    노하우 13번(3만원짜리 고수의 콜)을 «하한 미달 똥»으로 낙제시키던 자리다.
         */
        /**
         * 🛣️ **긴 우회는 «가는 길»이 아니다 — 값을 깎는다** (기사님 확정).
         *
         * 합짐은 «가는 길에 붙이는 것»이다. 네 시간짜리 우회는 그 전제가 깨진 것이라
         * 시급이 나와도 하루를 통째로 건다 (우회 235분 15만원이 보통 위로 올라오던 자리).
         *
         * 🔴 **시급 눈금으로는 못 잡는다** — 시급은 «얼마나 버나»를 재고 이건 «이게 합짐인가»를
         *    묻는다. 눈금을 올리면 짧은 콜까지 함께 깎인다.
         * 🔴 **기회비용(요금 − 보통시급×시간)으로 빼지 않는다** — 눈금을 평행이동할 뿐이라
         *    순위가 그대로이고, 보통 시급 콜이 0점이 된다 (기존 눈금이 이미 그 몫을 담고 있다).
         * 🔴 **버리지 않는다** (규칙 ①) — 색으로만 말한다.
         *
         * 첫짐에는 안 붙인다 — 빈 차에 처음 싣는 시간은 «우회»가 아니라 그 콜 자체다.
         */
        const decayOf = (mins: number): number => {
            const { freeMin, cautionMin, hardMin } = cfg.detour;
            const dungCut = 0.39;                // 만점 콜도 40점 아래로 (color.normalMin)
            if (mins <= freeMin) return 1;
            const caution = 0.75;               // 주의 한계에서 3/4 — 대박 콜은 🔵 를 지킨다
            if (mins <= cautionMin) return 1 - (1 - caution) * ((mins - freeMin) / Math.max(1, cautionMin - freeMin));
            if (mins <= hardMin) return caution - (caution - dungCut) * ((mins - cautionMin) / Math.max(1, hardMin - cautionMin));
            return dungCut * (hardMin / mins);        // 넘을수록 계속 무거워진다
        };
        const decay = f.firstLoad ? 1 : decayOf(f.extraMinutes);
        const decayNote = decay < 1 ? ` · 우회 ${f.extraMinutes}분이라 값 ${Math.round(decay * 100)}%` : '';
        /**
         * 🔴 **100 으로 먼저 맞춘 뒤 깎는다.** 시급 10만/h 면 `base` 가 225 까지 올라가는데,
         *    거기에 절반을 곱해도 112 라 깎인 티가 안 난다 — 만점 위의 «여분»이 감쇠를 삼킨다.
         */
        const capped = Math.min(100, base);

        if (f.minAcceptableKrw && f.fare < f.minAcceptableKrw) {
            return scored(capped * decay * 0.6, `${why}${decayNote} · 평소 하한(${toManwon(f.minAcceptableKrw)}만) 미달`, false, hourly / 10_000);
        }
        return scored(capped * decay, `${why}${decayNote}`, false, hourly / 10_000);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ 약속 — 이미 잡은 콜에 늦지 않나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PromiseFacts {
    /** 이미 잡아 둔 콜이 있는가 — 없으면 **잴 게 없다** (첫짐) */
    hasExistingCalls: boolean;
    /**
     * 이 콜을 붙였을 때 늦는 약속들. 비어 있으면 안 깨진다.
     * 🔴 `lateMinutes` 는 **모를 수 있다** — 옛 조건은 «몇 분 늦는지»를 문장으로만
     *    들고 있다. 모르면 `null` 이고, 그때는 «N분 늦음» 을 **안 적는다** (규칙 ④).
     */
    lateStops: Array<{ label: string; lateMinutes: number | null }>;
    /** 붙인 뒤 남는 **가장 빠듯한** 여유(분). 음수면 이미 빠듯하다 */
    bufferAfterMin: number | null;
}

/**
 * 🔴 **여유는 입력이 아니라 계산 결과다** (규칙 ⑤-5). 여기서는 이미 계산된 값을 받아
 *    점수로만 바꾼다 — 마감에서 주행·정차를 빼는 일은 밖에서 한다.
 *
 * 곡선은 옛 채점기 그대로다 (30분 이상 100 · 0분 40 · 음수 0) — 구조만 옮기고
 * **값은 안 바꾼다.** 같이 움직이면 «구조 때문인지 값 때문인지» 못 가린다.
 */
export const PROMISE = defineCriterion<PromiseFacts>({
    key: 'promise', name: '약속', asks: '이미 잡은 콜에 늦지 않나',
    weightKey: 'promiseGuard',
    measure(f, cfg) {
        if (!f || !Array.isArray(f.lateStops)) return unmeasurable('경로 타임라인을 못 받았습니다');
        if (!f.hasExistingCalls) return nothing('잡아 둔 콜이 없습니다');
        if (f.lateStops.length) {
            const whyText = f.lateStops.map(s => s.lateMinutes == null ? s.label : `${s.label} ${s.lateMinutes}분 늦음`).join(' · ');
            return scored(0, whyText, true);          // 🔴 이건 «잡으면 사고»다
        }
        if (f.bufferAfterMin == null) return unmeasurable('남는 여유를 못 쟀습니다');
        /**
         * 🔴 **곡선의 두 끝이 판정 기준 탭에서 온다** (2026-08-29 화면으로 올림).
         *    예전엔 `30분 만점 · 0분 40점` 이 여기 박혀 있어 기사님이 못 고쳤다.
         *    값은 그대로다 — 자리만 옮겼다.
         */
        const fullMin = cfg.slack.fullMin, zeroScore = cfg.slack.zeroScore;
        const a = f.bufferAfterMin;
        const s = a >= fullMin ? 100 : a >= 0 ? zeroScore + ((100 - zeroScore) / fullMin) * a : 0;
        return scored(s, `최소 ${a >= 0 ? '+' : ''}${a}분`);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📦 공간 — 실을 자리 있나 · 내 차에 들어가나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SpaceFacts {
    /** 이 콜을 실었을 때 **남는 자리**(%). 음수면 안 들어간다 */
    freePct: number | null;
    /** 이미 실린 짐이 있는가 — 없으면 자리는 **잴 게 없다** */
    hasLoad: boolean;
    /**
     * 📦 **그 적재량을 어떻게 알았나** — 색을 덮을지 가르는 값이다.
     *
     * `CONFIRMED` 현장 실측 · `DECLARED` 통화 신고 → **확정값**이라 안 들어가면 🔴
     * `ESTIMATED` 차종에서 추정 → 오독일 수 있어 **점수만** 깎는다
     * `null` 모른다 → 안 덮는다 (없는 확신을 지어내지 않는다 · 규칙 ④)
     */
    confidence?: 'CONFIRMED' | 'DECLARED' | 'ESTIMATED' | null;
}

/**
 * 🔴 **「차종 불일치」는 여기 없다 — 딱지로 간다** (기사님과 확정 2026-08-29).
 *
 * 처음엔 «내 차에 안 들어가는 짐»이니 «잡으면 사고»라고 봤다. **틀렸다.**
 * 코드를 보니 그 검사는 `allowedVehicleTypes` — **기사님이 평소 받는 차종 목록**에
 * 없다는 뜻이지 물리적으로 못 싣는다는 뜻이 아니다. 게다가:
 *
 *   ① **앱이 같은 목록으로 이미 거른다** (`InsungParser` 의 `filter.allowedVehicleTypes`).
 *      서버가 다시 세는 것은 규칙 ⑤-1 위반이다 — 지리를 끈 것과 같은 이유
 *   ② 차종은 **화면에서 읽는 글자**다. 2026-08-29 실측: 리스트 29개 중 9개가 요금
 *      파싱에 실패했다. **오독으로 멀쩡한 콜을 빨간불로 만들 위험**이 실재한다
 *   ③ 큰 콜이 떠도 **통화로 짐 양을 확인**하면 실을 수 있다 — 잡은 뒤 전화하는 것이
 *      이 제품의 순서다 (규칙 ⑤-2)
 *
 * 🔴 **진짜 «못 싣는다»는 자리로 잰다.** 짐이 정원을 넘으면 여유가 음수가 되고,
 *    그건 아래에서 0점이 된다. 그게 물리 제약이다.
 *
 * ⚠️ **빈 차의 자리는 안 센다.** 첫짐은 늘 100 이라 다른 기준을 희석한다
 *    (옛 채점기 주석에 남아 있던 교훈).
 */
export const SPACE = defineCriterion<SpaceFacts>({
    key: 'space', name: '공간', asks: '실을 자리 있나',
    weightKey: 'slots',
    measure(f) {
        if (!f) return unmeasurable('적재 상태를 못 받았습니다');
        if (!f.hasLoad) return nothing('빈 차입니다');
        if (f.freePct == null) return unmeasurable('남는 자리를 못 쟀습니다');
        /**
         * 🔴 **자리가 모자랄 때 색을 덮는 것은 «확정값»일 때만이다** (기사님 확정).
         *
         *   신고·실측 → 🔴 못 싣는 짐을 추천하면 현장에서 상차 거부 사고가 난다
         *   추정      → 점수 0 만. 차종 글자를 오독하면 멀쩡한 콜이 🔴 가 된다
         *               (실측: 리스트 29개 중 9개가 파싱에 실패했다 — 차종 불일치를 딱지로 내린 것과 같은 까닭)
         *
         * 옛 규칙은 근거를 안 가리고 **언제나 점수만** 깎았다. 그때 기사님 말씀이
         * *"나중에 가중치를 높일 거야"* 였고, 가른 지금은 확정값에서만 덮는다.
         */
        if (f.freePct < 0) {
            const sure = f.confidence === 'DECLARED' || f.confidence === 'CONFIRMED';
            const how = sure ? (f.confidence === 'CONFIRMED' ? '실측' : '신고') : '추정';
            if (sure) return scored(0, `자리 부족 ${Math.round(f.freePct)}% (${how})`, true);
            /**
             * 🔴 **추정으로 나온 부족은 «못 쟀다» 다** (규칙 ⑤-2 · 기사님 확정).
             *    적재량을 차종 글자에서 추정하는데 그 글자를 자주 못 읽는다(실측 29개 중 9개).
             *    0점을 주면 **오독 하나가 멀쩡한 꿀콜의 평균을 끌어내린다.**
             *    «못 쟀다»는 가중평균에서 아예 빠지고 이유만 화면에 남는다 —
             *    *«모르는 값은 불리하게 가정해 떨어뜨리지 않는다»*.
             */
            return unmeasurable(`자리 부족 ${Math.round(f.freePct)}% (${how}) — 차종을 못 읽었을 수 있습니다`);
        }
        return scored(f.freePct, `여유 ${Math.round(f.freePct)}%`);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧪 성질 — 같이 실어도 되는 짐인가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NatureFacts {
    /** 같이 못 싣는 조합들. 비어 있으면 문제 없다 */
    conflicts: Array<[string, string]>;
    /** 적요에서 걸린 제외 키워드 (착불 등) */
    excludedHits: string[];
    /** 이미 실린 짐이 있는가 — 없으면 **부딪힐 상대가 없다** */
    hasLoad: boolean;
}

export const NATURE = defineCriterion<NatureFacts>({
    key: 'nature', name: '성질', asks: '같이 실어도 되는 짐인가',
    weightKey: 'cargoCompat', role: 'gate',
    measure(f) {
        // ⚠️ 재료가 반만 와도 죽지 않는다 — 판정이 터지면 색이 아예 안 뜬다
        if (!f || !Array.isArray(f.excludedHits) || !Array.isArray(f.conflicts))
            return unmeasurable('짐 성질을 못 받았습니다');
        // 제외 키워드는 실린 짐과 무관하게 본다 — 이 콜 자체의 성질이다
        if (f.excludedHits.length) {
            return scored(0, `제외 키워드(${f.excludedHits.join(' · ')})`, true);
        }
        if (!f.hasLoad) return nothing('실린 짐이 없습니다');
        if (f.conflicts.length) {
            const whyText = f.conflicts.map(([a, b]) => `${a}+${b}`).join(' · ');
            return scored(0, `같이 못 실음 — ${whyText}`, true);
        }
        return scored(100, '문제 없음');
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧭 지리 — 목적지로 전진하나  (첫짐의 **배수**)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GeographyFacts {
    /** 빈 차에 처음 싣는 콜인가 — **배수는 첫짐에만 붙는다** */
    firstLoad: boolean;
    /**
     * **전진율** −1~1 — 이 콜로 움직이는 거리 중 얼마가 목적지 쪽으로 줄어드는가.
     * `(dist(현위치, 목적지) − dist(하차지, 목적지)) ÷ dist(현위치, 하차지)`
     *
     * 🔴 **여기서 계산하지 않는다** (규칙 ③) — 이미 잰 값을 받는다. 못 쟀으면 `null`.
     */
    progressRatio: number | null;
    /** 못 쟀으면 그 까닭 — 「목적지 미설정」 같은 것. 쟀으면 `null` */
    unknownWhy?: string | null;
}

/**
 * 🧭 **첫짐이 목적지로 얼마나 전진하나 — 점수에 곱한다** (기사님 확정 · 설계서 §4-3)
 *
 * 2026-08-29 에 «잴 값이 생기면 켠다»고 자리만 남겨 둔 기준이다. **전진율이 그 첫 잴 값**이다.
 *
 * 🔴 **평균의 한 항이 아니라 배수다** (`role: 'multiplier'`). 더하기로 섞으면
 *    «요금 0원인데 목적지 방향만 맞는 콜»이 절반 점수를 받는다 — 목적지 가치는 돈을
 *    **키우는** 것이지 돈과 더하는 것이 아니다.
 *
 * 🔴 **합짐에는 안 붙인다** — 그쪽 지리는 「돈」(우회 시급)이 이미 센다. 역주행이면 우회 주행이
 *    길어지고 우회 시급이 그대로 깎는다. 같은 사실을 두 번 세지 않는다.
 *
 * 🔴 **못 쟀으면 배수 1.0 이다** (규칙 ⑤-2) — 목적지를 안 정하셨다고 콜을 떨어뜨리지 않는다.
 *    「잴 수 없음」으로 답하면 색이 통째로 🔴 가 되므로, 까닭만 적고 배수를 1.0 으로 둔다.
 *
 * ⚠️ 전진율은 **방향 지표**다 — 직선으로 재므로 **거리로 읽지 않는다**
 *    (왕복 분리 도로에서 직선은 실제와 크게 다르다).
 */
export const GEOGRAPHY = defineCriterion<GeographyFacts>({
    key: 'geography', name: '지리', asks: '목적지로 전진하나',
    weightKey: 'geography', role: 'multiplier',
    measure(f, cfg) {
        if (!f) return nothing('전진율을 안 받았습니다');
        if (!f.firstLoad) return nothing('합짐입니다 — 지리는 「돈」이 셉니다');

        const { max, min } = cfg.destBonus;
        if (f.progressRatio == null) {
            return multiplied(1, 50, `${f.unknownWhy ?? '전진율을 못 쟀습니다'} — 배수 ×1.0`);
        }
        const p = Math.max(-1, Math.min(1, f.progressRatio));
        const bonus = Math.max(min, Math.min(max, 1 + (max - 1) * p));
        const sign = p >= 0 ? '+' : '';
        // 화면 눈금은 −1~1 을 0~100 으로 펴 놓은 것이다 (색을 정하는 것은 배수다)
        return multiplied(bonus, (p + 1) / 2 * 100, `전진율 ${sign}${p.toFixed(2)} → 배수 ×${bonus.toFixed(2)}`);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **판정 기준의 목록은 여기 하나다.** 더하거나 빼려면 이 배열만 고친다.
 *    순서가 곧 **화면에 보이는 순서**다.
 */
export const CRITERIA: Array<Criterion<any>> = [MONEY, PROMISE, SPACE, NATURE, GEOGRAPHY];

/** 사실 꾸러미 — 칸 이름이 기준의 `key` 와 같다. 각 기준은 **자기 칸만** 본다 */
export type JudgeFacts = {
    money?: MoneyFacts;
    promise?: PromiseFacts;
    space?: SpaceFacts;
    nature?: NatureFacts;
    geography?: GeographyFacts;
    /** 색을 안 건드리는 것들 — 「평소보다 큰 요금」 · 「배송주행 추정」 같은 것 */
    notes?: string[];
}

import { defineCriterion, scored, multiplied, nothing, unmeasurable } from './judge';
import type { Criterion } from './judge';

/**
 * ⚖️ **판정 기준 다섯 — 하나씩 따로 산다** (5단계)
 *
 * 기준을 더하거나 빼려면 **이 파일의 목록만** 고친다. 엔진(`judge.ts`)은 안 고친다.
 * 🔴 새 기준을 넣을 때는 **가중치 칸을 `JUDGMENT_FIELDS` 에 함께** 넣는다 —
 *    안 그러면 기사님이 못 고치는 값이 또 태어난다 (규칙 ⑤-4 ①).
 *
 * ══ 왜 이 다섯인가 ══
 *
 * 판정에 관여하던 **13개 사유를 전수조사**해서 나눠 담은 결과다.
 * 새로 만든 규칙이 하나도 없다 — 있던 것을 자리에 넣기만 했다.
 *
 * | 있던 사유 | 어디로 |
 * |---|---|
 * | 첫짐 하한가 미달 · 요율 미달 | **돈** |
 * | 이미 잡은 콜이 늦는다 | **약속** |
 * | 자리 부족 | **공간** |
 * | 같이 못 싣는 조합 · 제외 키워드 | **성질** |
 * | 경유 이탈 | 기준이 없다 — 합짐의 지리는 「돈」(우회 시급)이 센다. 「지리」는 **첫짐의 목적지 전진 배수**다 |
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
     * ⛽ **이 콜 때문에 더 달리는 거리(km)** — 합짐이면 «붙여서 늘어나는 거리», 첫짐이면 «이 콜의 전체 거리».
     *    🔴 모르면 `null` — 그때는 기름값을 안 뺀다 (지어내지 않는다 · 규칙 ④).
     */
    extraKm?: number | null;
    /**
     * ⛽ **1km 달리는 기름값(원)** — 기사님 설정에서 나온다 (`fuelCost.fuelCostPerKm` 한 곳).
     *    🔴 여기서 다시 나누지 않는다 (규칙 ③). 설정이 비면 `null` 로 온다.
     */
    fuelCostPerKm?: number | null;
    /**
     * 🛣️ **이 콜 때문에 더 내는 톨비(원)** — 카카오가 경로마다 준다 (`summary.fare.toll` 의 차이).
     *    🔴 모르면 `null`. 0 과 다르다 — 0 은 «톨비가 없는 길»이고 `null` 은 «못 받았다»이다.
     */
    tollKrw?: number | null;
    /**
     * **빈 차에 처음 싣는 콜인가.** 눈금을 고르는 데만 쓴다 — 첫짐은 `soloHourlyKrw` 하나로,
     * 합짐은 두 점 꺾은선(`hourlyKrw` 50점 · `honeyHourlyKrw` 100점)으로 잰다.
     *
     * 🔴 **판정 함수는 여전히 하나다** (결정) — 갈래는 여기, 사실을 채울 때 갈린다.
     *    까닭: 기회비용이 다르다. 합짐은 안 잡아도 잃는 것이 없고 첫짐은 안 잡으면 0원이다.
     */
    firstLoad: boolean;
}

/**
 * 기사님 확정: *"같은 40분이라도 3.5만이면 좋고 5천원이면 나쁘다."*
 * → 시간 문턱이 아니라 **시급**으로 잰다.
 *
 * 🔴 **눈금은 두 점이다** — 보통 시급에서 50점, 꿀 시급에서 100점 (기사님 확정).
 *    한 점 비율이면 보통 기준에서 이미 천장을 쳐 좋은 콜끼리 구분이 없다.
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

        /**
         * ⛽🛣️ **나가는 돈을 빼고 잰다 — 시급의 분자는 «순이익»이다** (기사님 확정).
         *
         * ```
         * 순이익 = 요금 − 늘어나는 거리 × km당 기름값 − 늘어나는 톨비
         * ```
         *
         * 🔴 **못 잰 비용은 0 으로 치지 않고 그 항목만 뺀다** (규칙 ④ · ⑤-2) —
         *    0 으로 치면 «기름이 안 든다»가 되어 먼 콜이 공짜로 보인다. 못 쟀으면 그 항목 없이
         *    지금까지 하던 대로 요금 그대로 잰다. 화면은 딱지로 «미확인»을 말한다.
         * 🔴 **곱셈·나눗셈을 여기서 만들지 않는다** — km당 기름값은 `fuelCost` 한 곳에서 온다 (규칙 ③).
         * 🔴 **순이익이 음수여도 0 으로 자르지 않는다** — 아래 눈금이 0점으로 받는다.
         *    자르면 «10만원 손해»와 «본전»이 같아진다.
         */
        const toManwon = (n: number) => (n / 10_000).toFixed(1);
        const fuelKrw = f.extraKm != null && f.fuelCostPerKm != null
            ? Math.round(f.extraKm * f.fuelCostPerKm) : null;
        const netFare = f.fare - (fuelKrw ?? 0) - (f.tollKrw ?? 0);
        /* 🧾 뺀 것을 화면이 말한다 — 숫자만 내려가고 까닭이 없으면 기사님이 «왜 깎였나»를 못 보신다 */
        const costNote = [
            fuelKrw ? `기름 ${fuelKrw > 0 ? '−' : '+'}${toManwon(Math.abs(fuelKrw))}만` : '',
            f.tollKrw ? `톨비 ${f.tollKrw > 0 ? '−' : '+'}${toManwon(Math.abs(f.tollKrw))}만` : '',
        ].filter(Boolean).join(' · ');

        const hourly = (netFare / f.extraMinutes) * 60;
        const T = cfg.target.hourlyKrw, H = cfg.target.honeyHourlyKrw, S = cfg.target.soloHourlyKrw;
        const scaleNote = f.firstLoad ? `첫짐 기준 ${toManwon(S)}만` : `보통 ${toManwon(T)}만 · 꿀 ${toManwon(H)}만`;
        /* 🧾 뺀 것이 있으면 «요금 − 비용»을 그대로 보인다 — 없으면 지금까지와 같은 문장이다 */
        const fareText = costNote ? `${toManwon(f.fare)}만(${costNote})` : `${toManwon(f.fare)}만`;
        const why = `${fareText} ÷ ${f.extraMinutes}분 = ${toManwon(hourly)}만/h (${scaleNote})`;

        /**
         * 🔴 **눈금이 국면마다 다르다** (기사님 확정).
         *    판정 함수는 하나고, 갈리는 것은 **눈금 하나**다 — 까닭은 기회비용이다.
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
// 💪 노동강도 — 이 콜에 팔다리를 얼마나 쓰나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LaborFacts {
    /**
     * 💪 **손으로 하는 분** — 상·하차를 **직접 드는** 시간만.
     *    지게차면 거의 0(박스당 3초), 수작업(까대기)이면 박스당 20초씩 쌓인다.
     *    셈은 `timing.handMinutesOf` 한 곳이다 — 여기서 박스를 다시 세지 않는다 (규칙 ③).
     *    🔴 통화 전이라 짐을 모르면 `null` — 그때는 **잴 게 없다** (규칙 ⑤-2).
     */
    handMinutes: number | null;
    /**
     * 🪢 **묶고 푸는 분** — 결박 4 · 그물망 1 · 호루 3 · 탑박스 1 (`PROTECTION_MINUTES`).
     *    🔴 방법과 축이 다르다 (기사님 확정): 방법은 «짐을 드는 행위», 보호는 «안전 조치».
     */
    protectionMinutes: number | null;
}

/**
 * 💪 **이 콜에 팔다리를 얼마나 쓰나** (기사님 확정)
 *
 * 기사님: *"까대기, 파레트, 짐의 상하차 방법과 량, 결박도 표현되어 들어가야 할 것 같다."*
 *
 * 🔴 **시간과 몸은 다르다.** 같은 80박스라도 —
 * ```
 * 지게차  80 × 3초  =  4분   앉아서 기다린다
 * 수작업  80 × 20초 = 27분   여든 개를 손으로 나른다
 * ```
 *    「돈」은 그 분을 **시급의 분모**로 쓴다. 이 기준은 그중 **손으로 하는 몫만** 본다 —
 *    같은 27분이라도 「돈」에게는 «시간»이고 여기서는 «노동»이라 묻는 것이 다르다 (규칙 ⑤-4 ⑤).
 *
 * 🔴 **운전은 안 본다** — 그건 「운전」이 따로 묻는다 (기사님: *"노동강도, 운전 이렇게 2개로
 *    의미가 다른 것 같기도 하고 분리하는 것이 지금 보니 맞는 거 같다"*).
 *    팔다리를 쓰는 것과 길이 고된 것은 다른 일이고, 무게도 따로 정하셔야 한다.
 *
 * 🔴 **새 문턱을 만들지 않는다** — 박스당 분과 보호 분이 전부 기사님이 확정하신 값이고,
 *    «얼마면 고된가»의 한계는 이미 있는 **상차 미확인 일반값**(찾기+상차+결박)의 두 배로 둔다.
 *
 * 🔴 **모르면 잴 게 없다** (규칙 ⑤-2) — 통화 전에는 짐을 모른다. 색을 🔴 로 만들지 않는다.
 */
export const LABOR = defineCriterion<LaborFacts>({
    key: 'labor', name: '노동강도', asks: '이 콜에 팔다리를 얼마나 쓰나',
    weightKey: 'labor',
    measure(f, cfg) {
        if (!f) return nothing('짐을 안 받았습니다');
        if (f.handMinutes == null && f.protectionMinutes == null) return nothing('짐 미확인 — 통화로 정해집니다');

        const hand = f.handMinutes ?? 0, guard = f.protectionMinutes ?? 0;
        const bodyMin = hand + guard;
        /**
         * 💪 **한계는 «흔한 상차 두 번치»** — 상차 미확인 일반값(찾기+상차+결박)의 두 배.
         *    그만큼 손으로 들면 0 점이다. 🔴 새 칸이 아니라 이미 있는 값을 눈금으로 쓴다.
         */
        const heavyAt = Math.max(1, cfg.unknown.pickupDwellMin) * 2;
        const score = Math.max(0, 100 - (bodyMin / heavyAt) * 100);
        const why = `손 ${Math.round(hand)}분` + (guard ? ` · 묶기 ${Math.round(guard)}분` : '');
        return scored(score, why, false, bodyMin);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚚 운전 — 이 길이 고속인가 시내인가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DriveFacts {
    /** 이 콜 때문에 더 달리는 거리(km) — 「돈」이 받는 값과 **같은 것**이다 */
    extraKm: number | null;
    /**
     * 🚚 **더 달리는 «주행» 분** — 상·하차 정차는 **빼고**.
     *
     * 🔴 「돈」이 받는 `extraMinutes` 와 **다른 값**이다 (규칙 ⑤-4 ⑤).
     *    저쪽은 «이 콜에 더 쓰는 시간»이라 정차가 들어야 맞고, 여기는 «길이 고된가»라 정차가 들면 안 된다.
     *    섞으면 «+2.6km · +30분(정차 25분 포함)» 이 **5km/h** 로 읽혀 멀쩡한 고속 콜까지 0 점이 된다 (실측).
     */
    driveMinutes: number | null;
}

/**
 * 🚚 **길이 고된가 — 평균 속도가 말한다** (기사님: *"고속도로 가니 편하고 빨라"*)
 *
 * 🔴 **분이 아니라 속도로 본다** — 분은 「돈」이 시급의 분모로 이미 쓴다.
 *    같은 60분이라도 고속으로 70km 를 가는 것과 시내에서 20km 를 기는 것은 몸이 다르다.
 * 🔴 **상하차는 안 본다** — 그건 「노동강도」가 따로 묻는다.
 * 🔴 **새 문턱을 만들지 않는다** — 판정 기준 탭의 배송 속도 셋(시내·국도·고속)을 그대로 눈금으로 쓴다.
 *    그 값은 카카오 실측에서 나왔고 기사님이 한 곳에서 고치시면 여기도 같이 움직인다 (규칙 ③).
 * 🔴 **둘 중 하나라도 모르면 「잴 게 없다」** — 재료가 깨진 것이 아니라 아직 안 실어 준 것이다 (규칙 ⑤-2).
 */
export const DRIVE = defineCriterion<DriveFacts>({
    key: 'drive', name: '운전', asks: '이 길이 고속인가 시내인가',
    weightKey: 'drive',
    measure(f, cfg) {
        if (!f || f.extraKm == null || f.driveMinutes == null) return nothing('주행을 안 받았습니다');
        if (f.driveMinutes <= 0) return nothing('더 달리지 않습니다 — 길목');
        /* 🔴 뒤로 가서 거리가 줄어든 합짐은 «길이 고된가»를 물을 대상이 아니다 — 그건 「돈」이 센다 */
        if (f.extraKm <= 0) return nothing('더 달리지 않습니다');

        const kmh = (f.extraKm / f.driveMinutes) * 60;
        const { shortKmh, midKmh, longKmh } = cfg.speed;
        const score = kmh <= shortKmh ? 0
            : kmh <= midKmh ? 50 * ((kmh - shortKmh) / Math.max(1, midKmh - shortKmh))
            : kmh <= longKmh ? 50 + 50 * ((kmh - midKmh) / Math.max(1, longKmh - midKmh))
            : 100;
        const how = kmh <= shortKmh ? '시내' : kmh <= midKmh ? '시내·국도' : kmh <= longKmh ? '국도' : '고속';
        return scored(score, `${Math.round(kmh)}km/h — ${how}`, false, kmh);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏳ 콜 대기 — 이 콜을 하고도 콜을 더 기다릴 수 있나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface WaitFacts {
    /**
     * 🚚 **상차지까지 가는 분** — 지금 자리에서 그 상차지에 닿는 데 걸리는 시간.
     *    타임라인이 이미 쟀다 (`approachMinutes`). 모르면 `null`.
     */
    toPickupMinutes: number | null;
    /**
     * 📦 **배송 주행 분** — 상차지에서 하차지까지 혼자 갈 때 걸리는 시간 (`soloMinutes`).
     *    모르면 `null`.
     */
    deliveryMinutes: number | null;
}

/**
 * ⏳ **이 콜이 나에게 여유를 얼마나 만들어 주나** (기사님 확정)
 *
 * 기사님: *"상차까지 시간이 20분인데 여기서 5분 걸리는 상차지와 20분 걸리는 상차지는 엄연히 달리 점수를 줘야 하고.
 * 배달거리는 길면 길수록 여유시간이 150%이니 많아져 다음 콜을 잡을 때도 여유스러울 수 있다."*
 *
 * ```
 * 상차 여유 = 상차 약속 분 − 상차지까지 가는 분     (20분 약속에 5분이면 15분이 남는다)
 * 배송 여유 = 배송 주행 분 × (마감 비율 − 100)%     (150% 면 주행의 절반이 남는다)
 * 점수      = (상차 여유 + 배송 여유) ÷ 상차 약속 × 50   (한 콜치 50점 · 두 콜치 100점)
 * ```
 *
 * 🔴 **「약속」과 묻는 것이 다르다.** 「약속」은 *«이미 잡은 콜에 늦나»* 를 묻고 여유 30분에서 천장을 친다 —
 *    그게 맞다, 늦지만 않으면 되니까. 이쪽은 *«이 콜이 시간을 얼마나 남겨 주나»* 를 물어 **천장이 없다**.
 *    그래서 기존 콜의 남은 여유(`minRouteBuffer`)를 여기서 또 보지 않는다 (규칙 ③).
 *
 * 🔴 **새 문턱을 만들지 않는다** — 눈금의 단위는 판정 기준 탭의 **상차 약속**이다.
 *    콜을 하나 더 잡으려면 적어도 그 상차지까지 가야 하고 그 시간이 곧 상차 약속이라서다.
 *    마감 비율도 같은 탭의 값이다 — 기사님이 고치시면 여기도 같이 움직인다.
 *
 * 🔴 **상차 여유가 음수여도 배송 여유를 지우지 않는다** — 상차에 늦는 것을 말하는 일은 「약속」의 몫이고,
 *    여기서 또 깎으면 같은 사실을 두 번 센다. 다만 합이 음수면 0 점이다.
 * 🔴 **둘 중 하나만 알아도 잰다** — 모르는 쪽은 0 으로 두지 않고 **빼고** 센다 (규칙 ⑤-2).
 *    둘 다 모르면 「잴 게 없다」 — 색을 🔴 로 만들지 않는다.
 */
export const WAIT = defineCriterion<WaitFacts>({
    key: 'wait', name: '콜 대기', asks: '이 콜이 시간을 얼마나 남겨 주나',
    weightKey: 'wait',
    measure(f, cfg) {
        if (!f) return nothing('주행을 안 받았습니다');
        if (f.toPickupMinutes == null && f.deliveryMinutes == null) return nothing('주행을 못 쟀습니다');

        const promiseMin = Math.max(1, cfg.unknown.pickupPromiseMin);
        const extraPct = Math.max(0, (cfg.deadline.ratioPct - 100) / 100);

        const pickupSlack = f.toPickupMinutes == null ? null : promiseMin - f.toPickupMinutes;
        const deliverySlack = f.deliveryMinutes == null ? null : f.deliveryMinutes * extraPct;
        const slack = (pickupSlack ?? 0) + (deliverySlack ?? 0);

        const calls = slack / promiseMin;
        const score = Math.max(0, Math.min(100, calls * 50));
        const part = [
            pickupSlack == null ? '상차 모름' : `상차 ${pickupSlack >= 0 ? '+' : ''}${Math.round(pickupSlack)}분`,
            deliverySlack == null ? '배송 모름' : `배송 +${Math.round(deliverySlack)}분`,
        ].join(' · ');
        return scored(score, `${part} = ${Math.round(slack)}분 · 약 ${calls.toFixed(1)}콜치 (상차 약속 ${promiseMin}분 기준)`, false, calls);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ☎️ 전화할 곳 — 이 콜을 받으면 남의 약속을 몇 곳 흔드나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CallsFacts {
    /**
     * ☎️ **이 콜을 받으면 전화를 걸어야 할 기존 콜 정거장 수**.
     *    세는 규칙(아직 안 다녀왔고 · 설정 분 이상 늦는)은 **부르는 쪽**이 안다 — 여기서 다시 세지 않는다 (규칙 ③).
     *    🔴 못 셌으면 `null`. 0 과 다르다 — 0 은 «흔들 곳이 없다»이고 `null` 은 «경로를 못 받았다»이다.
     */
    count: number | null;
    /** 이미 잡아 둔 콜이 있는가 — 없으면 흔들 남이 없어 **잴 게 없다** */
    hasExistingCalls: boolean;
}

/**
 * ☎️ **이 콜을 받으면 전화기를 몇 번 드셔야 하나** (기사님 확정)
 *
 * 기사님: *"이 콜을 받을 때 다른 콜에 주는 영향도 같이 넣어주면 좋을 것 같은데."*
 *
 * 🔴 **시간이 아니라 «손»을 센다.** 시간 축은 이미 둘이다 —
 *    「약속」이 *«굳힌 약속을 깨나»*, 「콜 대기」가 *«나에게 남겨 주나»* 를 묻는다.
 *    이 기준은 *«남에게 손이 얼마나 가나»* 를 물어 **셋이 대칭**이 된다.
 *    🔴 운전 중에는 전화를 못 거신다 — 그래서 **잡기 전에** 알아야 하는 사실이다 (규칙 ⑤-3).
 *
 * 🔴 **새 문턱을 만들지 않는다** — 곳 수를 「약속」이 쓰는 지연 눈금 셋에 그대로 댄다.
 *    한 곳이면 «거의 문제없음» 점수, 늘수록 «주의»를 거쳐 0 점으로 간다.
 *    기사님이 그 눈금을 고치시면 여기도 같이 움직인다 (규칙 ③).
 *
 * 🔴 **색을 덮지 않는다** — 전화는 걸면 되는 일이다. 약속이 실제로 깨지는 것은 「약속」이 🔴 로 말한다.
 */
export const CALLS = defineCriterion<CallsFacts>({
    key: 'calls', name: '전화할 곳', asks: '남의 약속을 몇 곳 흔드나',
    weightKey: 'calls',
    measure(f, cfg) {
        if (!f) return nothing('경로를 안 받았습니다');
        if (!f.hasExistingCalls) return nothing('빈 차입니다 — 흔들 콜이 없습니다');
        if (f.count == null) return nothing('경로를 못 받았습니다');
        if (f.count <= 0) return scored(100, '없음 — 남을 안 건드립니다');

        /**
         * 🔴 **곳 수를 「약속」의 지연 눈금에 댄다** — 그 눈금은 «몇 분»이지만 **꺾이는 세 자리**가
         *    «괜찮다 → 주의 → 한계»를 뜻한다. 곳 수도 같은 뜻의 세 자리가 필요하고,
         *    문턱을 또 만들면 기사님이 고칠 칸이 늘기만 한다 (규칙 ⑤-4).
         *    한 곳이 «거의 문제없음» 점수(90), 「주의」 눈금만큼이면 60, 「0점」 눈금만큼이면 0.
         */
        const { lateSoftMin, lateWarnMin, lateZeroMin } = cfg.slack;
        const softScore = 90, warnScore = 60;
        const n = f.count;
        const warnAt = Math.max(2, Math.round(lateWarnMin / Math.max(1, lateSoftMin)));
        const zeroAt = Math.max(warnAt + 1, Math.round(lateZeroMin / Math.max(1, lateSoftMin)));
        const span = (lo: number, hi: number) => Math.max(1, hi - lo);
        const score = n >= zeroAt ? 0
            : n <= 1 ? softScore
            : n <= warnAt ? softScore - (softScore - warnScore) * ((n - 1) / span(1, warnAt))
            : warnScore * (1 - (n - warnAt) / span(warnAt, zeroAt));
        return scored(score, `${n}곳에 전화해 약속을 미뤄야 합니다`, false, n);
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
         * 🔴 **곡선의 두 끝이 판정 기준 탭에서 온다** (화면으로 올림).
         *    코드에 박으면 기사님이 못 고치신다.
         */
        const { fullMin, zeroScore, lateSoftMin, lateWarnMin, lateZeroMin } = cfg.slack;
        const a = f.bufferAfterMin;
        if (a >= fullMin) return scored(100, `최소 +${a}분`);
        if (a >= 0) return scored(zeroScore + ((100 - zeroScore) / fullMin) * a, `최소 +${a}분`);

        /**
         * ⏰ **통화 전 임시 지연은 분만큼만 깎는다** (기사님 확정).
         *    🔴 한 번에 0 으로 떨어뜨리면 몇 분 밀리는 콜을 다 버린다 —
         *    정차 중에 3~4콜을 모으려면 몇 분씩은 밀린다.
         *
         * 🔴 **분은 설정, 계수는 코드** — 우회 감쇠(`decayOf`)와 같은 모양이다.
         * 🔴 통화로 굳힌 약속(`lateStops`)이 깨지는 것은 위에서 이미 빨간불이다. 여긴 그 전 단계다.
         */
        const softScore = 90, warnScore = 60;
        const late = -a;
        /**
         * 🔴 **색을 덮지 않는다** — 이건 서버가 지레짐작한 시간이다 (`hardFailIsConfirmed`).
         *    0 점이면 색이 «똥» 이라 충분히 말린다. 덮는 것은 **통화로 굳힌 약속**뿐이다.
         */
        if (late >= lateZeroMin) return scored(0, `${late}분 지연 — 한계(${lateZeroMin}분) 밖`);
        const span = (lo: number, hi: number) => Math.max(1, hi - lo);
        const s = late <= lateSoftMin
            ? zeroScore - (zeroScore - softScore) * (late / Math.max(1, lateSoftMin))
            : late <= lateWarnMin
                ? softScore - (softScore - warnScore) * ((late - lateSoftMin) / span(lateSoftMin, lateWarnMin))
                : warnScore * (1 - (late - lateWarnMin) / span(lateWarnMin, lateZeroMin));
        return scored(s, `${late}분 지연`);
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
 * 🔴 **「차종 불일치」는 여기 없다 — 딱지로 간다** (기사님과 확정).
 *
 * 그 검사는 `allowedVehicleTypes` — **기사님이 평소 받는 차종 목록**에
 * 없다는 뜻이지 물리적으로 못 싣는다는 뜻이 아니다. 게다가:
 *
 *   ① **앱이 같은 목록으로 이미 거른다** (`InsungParser` 의 `filter.allowedVehicleTypes`).
 *      서버가 다시 세는 것은 규칙 ⑤-1 위반이다 — 지리를 끈 것과 같은 이유
 *   ② 차종은 **화면에서 읽는 글자**다. 실측: 리스트 29개 중 9개가 요금
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
    /**
     * 🔙 **등 뒤 상차인가** — 첫짐에만 쓴다. 합짐은 한계 우회가 이미 센다.
     * 못 쟀으면 `null` — 깎지 않는다 (규칙 ⑤-2). 잰 곳은 `isPickupBackward` 하나다.
     */
    pickupBackward?: boolean | null;
    /**
     * 🏔️ **하차지가 갇힘 지역인가** — 들어가면 빈 차로 나온다 (`isTrappedRegion`).
     * 첫짐에만 쓴다. 못 쟀으면 `null` — 깎지 않는다 (규칙 ⑤-2).
     */
    trapped?: boolean | null;
    /**
     * 🛫 **목적지에서 몇 km 멀어지나** — 음수면 가까워지는 것이라 안 깎는다.
     * 전진율은 나누기라 «얼마나»가 약분된다 (`destGainKm` 이 나누기 전 값이다).
     */
    awayKm?: number | null;
}

/**
 * 🧭 **첫짐이 목적지로 얼마나 전진하나 — 점수에 곱한다** (기사님 확정)
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

        /**
         * 🔙 **등 뒤 상차는 사고다** — 첫짐에는 한계 우회가 없어 되돌아가는 거리를 아무도 안 센다.
         *    합짐이면 위에서 이미 빠졌다 — 「돈」이 한계 우회로 센다 (규칙 ③).
         *    🔴 못 쟀으면(`null`) 깎지 않는다 — 목적지를 안 정하셨을 뿐이다 (규칙 ⑤-2).
         */
        if (f.pickupBackward === true) {
            return scored(0, '등 뒤 상차 — 목적지에서 멀어집니다', true);
        }

        const { max, min } = cfg.destBonus;
        if (f.progressRatio == null) {
            return multiplied(1, 50, `${f.unknownWhy ?? '전진율을 못 쟀습니다'} — 배수 ×1.0`);
        }
        const p = Math.max(-1, Math.min(1, f.progressRatio));
        /**
         * 🔴 **두 끝 사이를 고르게 나눈다 — 곧장이 `max`, 뒤로가 `min`, 옆으로가 한가운데.**
         *
         * 🔴 **배수가 1 을 넘으면 안 된다.** 넘으면 **100점 천장을 뚫어** 시급 2.1만(기준 미달)과
         *    4.0만이 둘 다 🔵 100점이 된다 — 평균이 85 든 100 이든 두 배를 곱하면 똑같이 잘려
         *    기사님이 고르실 수가 없다.
         * 🔴 **배수는 «깎기»다.** 곧장 가는 것은 상이 아니라 기본이고, 벗어나는 것이 값을 깎는다.
         *    그래야 평균의 차이가 총점까지 살아남는다.
         */
        const bonus = min + (max - min) * (p + 1) / 2;
        const sign = p >= 0 ? '+' : '';
        /**
         * 🏔️ **갇힘 지역은 한 번 더 깎는다** — 들어가면 빈 차로 나온다 (노하우 148행).
         *    요금으로는 안 보인다: 그쪽 콜은 오히려 비싸다 (아무도 안 가려 하니까).
         *    🔴 버리지 않는다 (규칙 ①) — 색으로만 말한다.
         */
        const trapMult = f.trapped === true ? cfg.destBonus.trappedMult : 1;
        /**
         * 🛫 **반대쪽으로 «얼마나» 멀어지나** — 전진율은 나누기라 60km 와 180km 가 같다.
         *    🔴 가까워지는 콜(음수)은 아무리 멀어도 안 깎는다 — 목적지 쪽 장거리 꿀콜을
         *    죽이지 않으려는 자리다 (노하우 231행).
         */
        const { awayFreeKm, awayHardKm } = cfg.destBonus;
        const away = f.awayKm ?? 0;
        const awayMult = away <= awayFreeKm ? 1
            : away >= awayHardKm ? min
            : 1 - (1 - min) * ((away - awayFreeKm) / Math.max(1, awayHardKm - awayFreeKm));
        const mult = bonus * trapMult * awayMult;
        const why = `전진율 ${sign}${p.toFixed(2)} → 배수 ×${bonus.toFixed(2)}`
            + (f.trapped === true ? ` · 🏔️ 못 빠져나오는 곳 ×${trapMult}` : '')
            + (awayMult < 1 ? ` · 🛫 ${Math.round(away)}km 멀어짐 ×${awayMult.toFixed(2)}` : '');
        // 화면 눈금은 −1~1 을 0~100 으로 펴 놓은 것이다 (색을 정하는 것은 배수다)
        return multiplied(mult, (p + 1) / 2 * 100 * trapMult * awayMult, why);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **판정 기준의 목록은 여기 하나다.** 더하거나 빼려면 이 배열만 고친다.
 *    순서가 곧 **화면에 보이는 순서**다.
 */
export const CRITERIA: Array<Criterion<any>> = [MONEY, LABOR, DRIVE, WAIT, CALLS, PROMISE, SPACE, NATURE, GEOGRAPHY];

/** 사실 꾸러미 — 칸 이름이 기준의 `key` 와 같다. 각 기준은 **자기 칸만** 본다 */
export type JudgeFacts = {
    money?: MoneyFacts;
    labor?: LaborFacts;
    drive?: DriveFacts;
    wait?: WaitFacts;
    calls?: CallsFacts;
    promise?: PromiseFacts;
    space?: SpaceFacts;
    nature?: NatureFacts;
    geography?: GeographyFacts;
    /** 색을 안 건드리는 것들 — 「평소보다 큰 요금」 · 「배송주행 추정」 같은 것 */
    notes?: string[];
}

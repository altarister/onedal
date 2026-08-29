import { defineCriterion, scored, nothing, unmeasurable } from './judge';
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
 * | 차종 불일치 · 자리 부족 | **공간** |
 * | 같이 못 싣는 조합 · 제외 키워드 | **성질** |
 * | 경유 이탈 | **지리** (지금은 안 봄 — 아래 참고) |
 * | 요금 초과 · 경유 미확정 | **딱지** (색을 안 건드린다) |
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
}

/**
 * 기사님 확정 (2026-08-21 판정색 v2): *"같은 40분이라도 3.5만이면 좋고 5천원이면 나쁘다."*
 * → **절대 문턱(30분 이하면 꿀)을 폐기**하고 시급으로 잰다. 그 옛 상수 넷은 2026-08-29 에 지웠다.
 *
 * 🔴 **여기가 돈을 보는 유일한 곳이다.** 규칙 ⑤-1 — 돈은 앱이 이미 걸렀다.
 *    다른 기준이 요금을 다시 보면 같은 사실을 두 번 세는 것이다.
 */
export const 돈 = defineCriterion<MoneyFacts>({
    key: 'money', name: '돈', asks: '이 시간 써서 얼마 버나',
    weightKey: 'revenueDetour',
    measure(f, cfg) {
        if (!f) return unmeasurable('요금·소요를 못 받았습니다');
        if (f.extraMinutes == null) return unmeasurable('걸리는 시간을 못 쟀습니다');
        // 우회가 없는 길목 콜 — 운임이 통째로 이득이다
        if (f.extraMinutes <= 0) return scored(100, `우회 ${f.extraMinutes}분 — 길목`);

        const hourly = (f.fare / f.extraMinutes) * 60;
        const 만 = (n: number) => (n / 10_000).toFixed(1);
        const why = `${만(f.fare)}만 ÷ ${f.extraMinutes}분 = ${만(hourly)}만/h`;

        /**
         * 🔴 **하한가 미달은 색을 «무조건 빨간불»로 만들지 않는다** (규칙 ①).
         *    서버는 콜을 자동으로 버리지 않는다 — 점수로만 말한다.
         *    노하우 13번(3만원짜리 고수의 콜)을 «하한 미달 똥»으로 낙제시키던 자리다.
         */
        const base = (hourly / cfg.target.hourlyKrw) * 100;
        if (f.minAcceptableKrw && f.fare < f.minAcceptableKrw) {
            return scored(base * 0.6, `${why} · 평소 하한(${만(f.minAcceptableKrw)}만) 미달`);
        }
        return scored(base, why);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ 약속 — 이미 잡은 콜에 늦지 않나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PromiseFacts {
    /** 이미 잡아 둔 콜이 있는가 — 없으면 **잴 게 없다** (첫짐) */
    hasExistingCalls: boolean;
    /** 이 콜을 붙였을 때 늦는 약속들. 비어 있으면 안 깨진다 */
    lateStops: Array<{ label: string; lateMinutes: number }>;
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
export const 약속 = defineCriterion<PromiseFacts>({
    key: 'promise', name: '약속', asks: '이미 잡은 콜에 늦지 않나',
    weightKey: 'promiseGuard',
    measure(f) {
        if (!f || !Array.isArray(f.lateStops)) return unmeasurable('경로 타임라인을 못 받았습니다');
        if (!f.hasExistingCalls) return nothing('잡아 둔 콜이 없습니다');
        if (f.lateStops.length) {
            const 왜 = f.lateStops.map(s => `${s.label} ${s.lateMinutes}분 늦음`).join(' · ');
            return scored(0, 왜, true);          // 🔴 이건 «잡으면 사고»다
        }
        if (f.bufferAfterMin == null) return unmeasurable('남는 여유를 못 쟀습니다');
        const a = f.bufferAfterMin;
        const s = a >= 30 ? 100 : a >= 0 ? 40 + 2 * a : 0;
        return scored(s, `최소 ${a >= 0 ? '+' : ''}${a}분`);
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📦 공간 — 실을 자리 있나 · 내 차에 들어가나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SpaceFacts {
    /** 이 콜을 실었을 때 **남는 자리**(%). 첫짐이라 빈 차면 100 */
    freePct: number | null;
    /** 콜이 부른 차종과 내 차종이 맞는가. 모르면 `null` */
    vehicleFits: boolean | null;
    /** 화면에 적을 차종 (예: `다마스`) */
    vehicleLabel?: string;
    /** 이미 실린 짐이 있는가 — 없으면 자리는 **잴 게 없다** */
    hasLoad: boolean;
}

/**
 * 🔴 **차종 불일치가 여기 있는 이유** — 「내 차에 들어가는가」는 자리 문제다.
 *    성질(같이 실어도 되는가)과는 다른 축이다.
 *
 * ⚠️ **빈 차의 자리는 안 센다.** 첫짐은 늘 100 이라 다른 기준을 희석한다
 *    (옛 채점기 주석에 남아 있던 교훈).
 */
export const 공간 = defineCriterion<SpaceFacts>({
    key: 'space', name: '공간', asks: '실을 자리 있나',
    weightKey: 'slots',
    measure(f) {
        if (!f) return unmeasurable('적재 상태를 못 받았습니다');
        if (f.vehicleFits === false) {
            return scored(0, `차종(${f.vehicleLabel ?? '?'}) 불일치`, true);
        }
        if (!f.hasLoad) return nothing('빈 차입니다');
        if (f.freePct == null) return unmeasurable('남는 자리를 못 쟀습니다');
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

export const 성질 = defineCriterion<NatureFacts>({
    key: 'nature', name: '성질', asks: '같이 실어도 되는 짐인가',
    weightKey: 'cargoCompat',
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
            const 왜 = f.conflicts.map(([a, b]) => `${a}+${b}`).join(' · ');
            return scored(0, `같이 못 실음 — ${왜}`, true);
        }
        return scored(100, '문제 없음');
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧭 지리 — 가는 길 위에 있나  (지금은 **안 봄**)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GeographyFacts {
    /** 목적지가 경유 위에 있는가. 모르면 `null` */
    onDetourPath: boolean | null;
}

/**
 * 🔴 **기본 가중치가 0 이다** (기사님과 확정 2026-08-29). 자리와 이름은 화면에 **보이되
 *    꺼져 있다** — 「일단 만들고 나중에 노출」이 아니다 (규칙 ⑤-4).
 *
 * 왜 껐나 — 셋 다 «같은 사실을 두 번 세는 것»이 되기 때문이다:
 *   ① **합짐**의 지리는 「돈」이 이미 센다. 역주행이면 우회 주행이 길어지고,
 *      그건 우회 시급이 그대로 깎는다
 *   ② **첫짐**의 지리는 앱이 집기 전에 이미 걸렀다. 서버가 `progressKm` 를 계산해
 *      내려보내고 앱이 그걸로 방향을 거른다 (규칙 ⑤-1 의 지리 판)
 *   ③ 지리로 점수를 깎으면 **잡을 수 있었던 콜을 놓친다** (규칙 ① · ⑤)
 *
 * 🔴 **다만 「돈」이 못 보는 것이 하나 있다** — 역주행은 시간이 같아도 **다음 콜 기회**를
 *    죽인다(목적지에서 멀어지면 그 자리에서 합짐을 못 잡는다). 그런데 **그걸 잴 값이
 *    아직 없다.** 근거가 생기면 기사님이 판정 기준 탭에서 켜시면 된다.
 */
export const 지리 = defineCriterion<GeographyFacts>({
    key: 'geography', name: '지리', asks: '가는 길 위에 있나',
    weightKey: 'geography',
    measure(f) {
        if (!f || f.onDetourPath == null) return unmeasurable('경유를 아직 못 정했습니다');
        return f.onDetourPath ? scored(100, '경유 적중') : scored(0, '경유 이탈');
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **판정 기준의 목록은 여기 하나다.** 더하거나 빼려면 이 배열만 고친다.
 *    순서가 곧 **화면에 보이는 순서**다.
 */
export const CRITERIA: Array<Criterion<any>> = [돈, 약속, 공간, 성질, 지리];

/** 사실 꾸러미 — 칸 이름이 기준의 `key` 와 같다. 각 기준은 **자기 칸만** 본다 */
export interface JudgeFacts {
    money?: MoneyFacts;
    promise?: PromiseFacts;
    space?: SpaceFacts;
    nature?: NatureFacts;
    geography?: GeographyFacts;
    /** 색을 안 건드리는 것들 — 「평소보다 큰 요금」 · 「배송주행 추정」 같은 것 */
    notes?: string[];
}

import { cityCenter, destProgressRatio, haversineKm } from '@onedal/shared';
import type { JudgeFacts } from '@onedal/shared';
import type { DryRunGate } from '@onedal/shared';

/**
 * 🧾 **판정이 쓸 «사실»을 모은다** (2026-08-29 · 6단계)
 *
 * 새 판정 함수(`judge`)는 카카오도 DB 도 모른다 — **이미 밝혀진 사실**만 받는다.
 * 그 사실을 담는 자리가 여기다. 카카오를 부르고 적재를 세는 일은 `OrderEvaluator` 가
 * 하던 그대로 하고, **그 결과를 옮겨 담기만** 한다.
 *
 * 🔴 **새로 계산하지 않는다.** 여기서 무엇이든 다시 재면 같은 값이 두 곳에서 태어난다
 *    (규칙 ③). 이 파일에 산술이 생기면 잘못 만든 것이다.
 *
 * 🔴 **여기서 채운 사실이 곧 화면의 색이다** — `OrderEvaluator` 가 이 사실로 `judge` 를 부르고
 *    그 결과를 콜에 붙인다. 칸 하나를 빼먹으면 색이 조용히 달라진다.
 */

/** 첫짐 — 잡아 둔 콜이 없다. 약속·공간은 «잴 게 없다»가 된다 */
export function firstLoadFacts(input: {
    fare: number;
    /** 이 콜에 쓰는 전체 시간(접근+주행+정차). 모르면 null */
    totalMinutes: number | null;
    /** 미리보기 콜의 평소 하한가. 필터콜은 넘기지 않는다 (규칙 ⑤-1) */
    minAcceptableKrw?: number | null;
    /**
     * 🧭 **목적지 전진율** −1~1 — 「지리」 기준이 배수로 바꾼다. 못 쟀으면 `null` 과 까닭.
     *    잰 곳은 `destProgressOf` 하나다 (여기서 다시 재지 않는다 · 규칙 ③).
     */
    progress?: { ratio: number | null; unknownWhy: string | null };
    /**
     * 🧪 **형상 필터가 이미 찾아 둔 제외어** — 여기서 다시 훑지 않는다 (규칙 ③).
     *    찾는 곳은 `OrderEvaluator.runStage1ShapeFilter` 하나다.
     */
    excludedHits: string[];
    tags: string[];
}): JudgeFacts {
    return {
        money: { fare: input.fare, extraMinutes: input.totalMinutes, minAcceptableKrw: input.minAcceptableKrw ?? null, firstLoad: true },
        promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
        space: { freePct: null, hasLoad: false },
        nature: { conflicts: [], excludedHits: input.excludedHits, hasLoad: false },
        geography: {
            firstLoad: true,
            progressRatio: input.progress?.ratio ?? null,
            unknownWhy: input.progress?.unknownWhy ?? '전진율을 안 넘겼습니다',
        },
        notes: [...input.tags],
    };
}

/**
 * 🎯 **판정의 목적지 도착 반경** (3km).
 * 콜 필터의 탐색 반경(`destinationRadiusKm`, 보통 20~25km)과 분리한다 (설계서 §9 10번).
 * 탐색 반경(22km)을 그대로 쓰면 서울 외곽(복정·송파)에서 강남으로 진입하는 첫짐이 전부 «도착»으로
 * 오판되어 전진 배수(1.5~2.0배)가 마비되는 사고(04:54 복정→대치 36점 똥콜)가 났다.
 * 판정은 도심 중심 3km 이내에 진짜 도달했을 때만 «도착»으로 인정한다.
 */
export const DEST_ARRIVED_RADIUS_KM = 3;

/**
 * 🧭 **첫짐의 전진율을 잰다 — 이 콜로 목적지에 얼마나 가까워지나** (설계서 §4-3)
 *
 * 세 점이 필요하다: **지금 자리**(`originOf`) · **하차지**(지오코딩 결과) · **목적지**(`goalCityOf` 의 시내).
 * 🔴 하나라도 없으면 **지어내지 않고 까닭을 적는다** — 그때 배수는 1.0 이다 (규칙 ④ · ⑤-2).
 * 🔴 **셈은 `destProgressRatio` 한 곳**에 있다. 여기서는 점 셋을 모아 넘기기만 한다 (규칙 ③).
 *
 * ⚠️ **목적지 반경 안에 있으면 안 잰다** — 이미 도착했으니 «전진할 것»이 없다.
 *    그때도 배수 1.0 이라, 목적지 둘레의 관내콜이 방향 때문에 깎이지 않는다.
 */
export function destProgressOf(input: {
    me: { x: number; y: number } | null;
    dropoff: { x?: number | null; y?: number | null };
    goalCity: string;
    /** 목적지 반경(km) — 이 안에 있으면 전진을 재지 않는다 (판정은 DEST_ARRIVED_RADIUS_KM 3km 사용) */
    destinationRadiusKm?: number | null;
}): { ratio: number | null; unknownWhy: string | null } {
    const no = (why: string) => ({ ratio: null, unknownWhy: why });
    if (!input.me) return no('내 위치를 모릅니다');
    if (!input.goalCity) return no('목적지 미설정');
    if (input.dropoff.x == null || input.dropoff.y == null) return no('하차지 좌표 미확인');

    let goal: { lng: number; lat: number };
    try { goal = cityCenter(input.goalCity); } catch { return no(`목적지 좌표 미확인 (${input.goalCity})`); }

    const me = { lng: input.me.x, lat: input.me.y };
    const radiusKm = input.destinationRadiusKm ?? 0;
    if (radiusKm > 0 && haversineKm(me, goal) <= radiusKm) return no(`목적지 반경 ${radiusKm}km 안입니다`);

    const ratio = destProgressRatio(me, { lng: input.dropoff.x, lat: input.dropoff.y }, goal);
    return ratio == null ? no('상차지와 하차지가 같은 자리입니다') : { ratio, unknownWhy: null };
}

/** 합짐 — 이미 실린 짐이 있다. 다섯 기준을 다 잰다 (지리는 가중치 0 이라 안 본다) */
export function mergeFacts(input: {
    fare: number;
    /** 붙여서 **늘어나는** 시간(한계 주행 + 늘어난 정차). 모르면 null */
    extraMinutes: number | null;
    /** 붙인 뒤 남는 가장 빠듯한 여유(분). 잴 약속이 없으면 null */
    bufferAfterMin: number | null;
    /** 실었을 때 남는 자리(%). 못 세면 null. 🔴 음수를 0 으로 자르지 않는다 — 자르면 부족이 안 보인다 */
    freePct: number | null;
    /** 그 적재량을 어떻게 알았나 — 확정값(신고·실측)일 때만 색을 덮는다 */
    confidence?: 'CONFIRMED' | 'DECLARED' | 'ESTIMATED' | null;
    /** 옛 채점기가 쓰던 통과/실패 조건 그대로 — 여기서 다시 판단하지 않는다 */
    gates: DryRunGate[];
    /** 같이 못 싣는 조합 (성질) */
    conflicts: Array<[string, string]>;
    /** 🧪 형상 필터가 이미 찾아 둔 제외어 — 여기서 다시 훑지 않는다 (규칙 ③) */
    excludedHits: string[];
    tags: string[];
}): JudgeFacts {
    /**
     * 🔴 «늦는 약속»은 옛 조건(`routePromiseGuard`)이 이미 문장으로 들고 있다.
     *    분(分)은 그 문장 안에만 있어 숫자로 못 꺼낸다 — **지어내지 않는다** (규칙 ④).
     *    깨졌다는 사실만 넘기고, 몇 분인지는 그 문장이 말한다.
     */
    const guard = input.gates.find(g => g.key === 'routePromiseGuard');
    const lateStops = guard && !guard.pass
        // 🔴 분(分)은 그 문장 안에만 있다 — **자리표시자 0 을 넣지 않는다.**
        //    넣었더니 «…12분 깨집니다 **0분 늦음**» 이라 스스로 모순됐다 (규칙 ④)
        ? [{ label: guard.why ?? guard.name, lateMinutes: null }]
        : [];

    return {
        money: { fare: input.fare, extraMinutes: input.extraMinutes, firstLoad: false },
        promise: { hasExistingCalls: true, lateStops, bufferAfterMin: input.bufferAfterMin },
        space: { freePct: input.freePct, hasLoad: true, confidence: input.confidence ?? null },
        nature: { conflicts: input.conflicts, excludedHits: input.excludedHits, hasLoad: true },
        /**
         * 🧭 **국면을 실어 준다 — 배수는 안 붙지만 까닭은 사실대로 적혀야 한다.**
         *    안 실으면 「지리」가 «전진율을 안 받았습니다» 라고 적어, 합짐인데 «재료가 빠졌나»로 읽힌다.
         *    합짐의 지리는 원래 안 재는 것이다 — 우회 시급이 이미 센다.
         */
        geography: { firstLoad: false, progressRatio: null },
        notes: [...input.tags],
    };
}

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
 * ⚠️ 지금은 **옛 채점기와 나란히 놓고 대조하는 용도**다. 색은 아직 옛것이 낸다.
 *    두 답이 어긋나면 로그에 남고, 어긋남이 없는 것을 확인한 뒤 갈아탄다 (규칙 ②).
 */

/** 첫짐 — 잡아 둔 콜이 없다. 약속·공간은 «잴 게 없다»가 된다 */
export function firstLoadFacts(input: {
    fare: number;
    /** 이 콜에 쓰는 전체 시간(접근+주행+정차). 모르면 null */
    totalMinutes: number | null;
    /** 미리보기 콜의 평소 하한가. 필터콜은 넘기지 않는다 (규칙 ⑤-1) */
    minAcceptableKrw?: number | null;
    tags: string[];
}): JudgeFacts {
    return {
        money: { fare: input.fare, extraMinutes: input.totalMinutes, minAcceptableKrw: input.minAcceptableKrw ?? null },
        promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
        space: { freePct: null, hasLoad: false },
        nature: { conflicts: [], excludedHits: [], hasLoad: false },
        notes: [...input.tags],
    };
}

/** 합짐 — 이미 실린 짐이 있다. 다섯 기준을 다 잰다 (지리는 가중치 0 이라 안 본다) */
export function mergeFacts(input: {
    fare: number;
    /** 붙여서 **늘어나는** 시간(한계 주행 + 늘어난 정차). 모르면 null */
    extraMinutes: number | null;
    /** 붙인 뒤 남는 가장 빠듯한 여유(분). 잴 약속이 없으면 null */
    bufferAfterMin: number | null;
    /** 실었을 때 남는 자리(%). 못 세면 null */
    freePct: number | null;
    /** 옛 채점기가 쓰던 통과/실패 조건 그대로 — 여기서 다시 판단하지 않는다 */
    gates: DryRunGate[];
    /** 같이 못 싣는 조합 (성질) */
    conflicts: Array<[string, string]>;
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
        money: { fare: input.fare, extraMinutes: input.extraMinutes },
        promise: { hasExistingCalls: true, lateStops, bufferAfterMin: input.bufferAfterMin },
        space: { freePct: input.freePct, hasLoad: true },
        nature: { conflicts: input.conflicts, excludedHits: [], hasLoad: true },
        notes: [...input.tags],
    };
}

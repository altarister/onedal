import type { AutoDispatchFilter } from '@onedal/shared';
import { draftGoalCitiesOf } from '@onedal/shared';

/**
 * 🔍 **필터창 초안 — 서버 값 위에 얹어 보이는 값 · «적용 안 함»** (기사님 «가»).
 * 초안은 필터 저장소의 `draft` 칸이다. 여기는 값만 받는 셈이다 — 저장소 · 소켓을 안 만진다.
 */
type Draft = Partial<AutoDispatchFilter> | null | undefined;

/**
 * 🗺️ 필터창 · 지도가 그리는 값 — 서버 값에 초안을 얹는다. 초안이 없으면 서버 값 그대로(같은 것).
 * 목적지 원은 서버가 낸 목록이라 초안 도시로 바꿔 그린다(shared `draftGoalCitiesOf`).
 * 복귀를 켰으면 그물이 보는 목적지는 집이라 초안 도시가 목적지를 안 바꾼다(서버 `goalCityFrom` 과 같다).
 */
export function draftViewOf(filter: AutoDispatchFilter | null, draft: Draft): AutoDispatchFilter | null {
    if (!filter || !draft) return filter;
    const draftFilterCity = 'destinationCity' in draft && filter.callTarget !== 'HOME' ? (draft.destinationCity ?? '') : undefined;
    return {
        ...filter,
        ...draft,
        goalCities: draftGoalCitiesOf({ goalCities: filter.goalCities ?? [], goalCity: filter.goalCity, draftFilterCity }),
        ...(draftFilterCity !== undefined ? { goalCity: draftFilterCity || undefined } : {}),
    };
}

/** 🔍 값 가운데 서버 값과 다른 칸만 — 되돌리기가 초안에 담을 것 */
export function changedFrom(filter: AutoDispatchFilter | null, values: Partial<AutoDispatchFilter>): Partial<AutoDispatchFilter> {
    const served = (filter ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(values).filter(([k, v]) => !sameValue(v, served[k]))) as Partial<AutoDispatchFilter>;
}

/** 🔍 초안에 서버 값과 다른 칸이 남았나 — 목록은 순서가 달라도 같은 것으로 본다 */
export function hasUnappliedDraft(filter: AutoDispatchFilter | null, draft: Draft): boolean {
    if (!filter || !draft) return false;
    const served = filter as unknown as Record<string, unknown>;
    return Object.entries(draft).some(([k, v]) => !sameValue(v, served[k]));
}

function sameValue(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    }
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

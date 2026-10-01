import { DONG_CENTROIDS } from './dongCentroids';

/**
 * 🗺️ **짧은 주소 글자 → 시군구** (reviews/25 통계 · 기사님 결정 2 «시군구 + 모호 칸»).
 *
 * 목록 원문의 주소는 «광주 경안» · «용산 한남» · «종로1»처럼 짧다 — 앞 토막이 시군구 실마리, 마지막 토막이 동 줄기다.
 * 명부는 서버 지도(merged_map)에서 뽑은 `DONG_CENTROIDS` 한 벌이다(원달앱 주소 명부와 같은 원천).
 *
 * 🔴 **추측하지 않는다** — 후보 동들의 시군구가 둘 이상이면 «모호», 하나도 없으면 «모름»(버리지 않고 센다 · 규칙 ④).
 *    명부 밖 시도(광주광역시 등)는 «모름»이 된다 — 명부가 넓어지면 저절로 따라 넓어진다.
 */
export const SIGUNGU_AMBIGUOUS = '모호' as const;
export const SIGUNGU_UNKNOWN = '모름' as const;

/** 시군구 글자(«서울 용산구» · «성남시 분당구» · «광주시»)가 실마리(«용산» · «분당» · «광주»)로 시작하는 토막을 갖나 */
const hintMatches = (sigungu: string, hint: string) => sigungu.split(' ').some(part => part.startsWith(hint));

export function sigunguOfShort(short: string | null | undefined): string {
    const tokens = (short ?? '').trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return SIGUNGU_UNKNOWN;
    const stem = tokens[tokens.length - 1];
    const hint = tokens.length > 1 ? tokens[0] : null;

    const byStem = (st: string) => {
        const hits = DONG_CENTROIDS.filter(([name]) => name.startsWith(st));
        return hint ? hits.filter(([, sigungu]) => hintMatches(sigungu, hint)) : hits;
    };
    /* 번호 동(«종로1» = 종로1가동)은 명부에서 한 이름(«종로»)으로 합쳐져 있다 — 끝 번호를 떼고 한 번 더 찾는다 */
    let found = byStem(stem);
    if (!found.length && /\d+$/.test(stem)) found = byStem(stem.replace(/\d+$/, ''));
    /* 동 줄기로 못 찾으면 토막 자체가 시군구일 수 있다(«광주» 한 토막) */
    const sigungus = found.length
        ? new Set(found.map(([, sigungu]) => sigungu))
        : new Set(DONG_CENTROIDS.filter(([, sigungu]) => hintMatches(sigungu, stem)).map(([, sigungu]) => sigungu));
    if (sigungus.size === 1) return [...sigungus][0];
    /* 🔴 픽커는 행정동 이름(«수정 위례» · «광주 광남1» · «처인 중앙»)을 쓰고 명부는 법정동뿐이다 —
          동으로 못 찾았고 앞 토막이 시군구 하나로 정해지면 그 시군구(시군구 수준이라 추측이 아니다 · 둘 이상이면 그대로 모호) */
    if (!found.length && hint) {
        const byHint = new Set(DONG_CENTROIDS.filter(([, sigungu]) => hintMatches(sigungu, hint)).map(([, sigungu]) => sigungu));
        if (byHint.size === 1) return [...byHint][0];
    }
    return sigungus.size > 1 ? SIGUNGU_AMBIGUOUS : SIGUNGU_UNKNOWN;
}

/** 명부의 시군구 이름 한 벌 (서울 · 인천 · 대전과 경기 · 충청 시군구) */
const SIGUNGU_NAMES: readonly string[] = [...new Set(DONG_CENTROIDS.map(([, sigungu]) => sigungu))];

/**
 * 🏘️ **이름이 둘 이상 시군구에 있는 동** — 명부에서 센다(«고덕동» = 서울 강동구 · 평택시). 서버가 오늘 도착 목록 가운데
 *    이 동에만 destinationDongSigungu 를 붙인다(filterManager).
 */
export const SAME_NAME_DONGS: ReadonlySet<string> = (() => {
    const byName = new Map<string, Set<string>>();
    for (const [name, sigungu] of DONG_CENTROIDS) {
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name)!.add(sigungu);
    }
    return new Set([...byName].filter(([, s]) => s.size > 1).map(([name]) => name));
})();

/**
 * 🏘️ **동 키워드 바로 앞에 보이는 시군구** — 대조할 글자(한 토막 «평택시» · 두 토막 «서울 중구») 또는 모름(null).
 *    서버 anyRegionHit · 원달앱 RegionMatch 가 같은 규칙을 쓴다(문제지 regionMatchCases.json).
 *    · 앞 토막(공백 · @ · / 로 자름)이 명부 시군구의 어떤 토막으로 시작하면 시군구 꼴 — 명부에 없어도 «…시·군·구»로 끝나면 시군구 꼴(문법 안전망 · «달서구»)
 *    · 시도만 보이면(«서울») 모름 — 목록 페이지에서 상세 주소가 안 보이면 통과(상세 페이지는 요건 확인이 시·군·구 없는 하차 주소를 먼저 막는다)
 *    · 여러 곳의 같은 구 이름(«중구» = 서울 중구 · 대전 중구)이면 앞 토막까지 두 토막으로 — 두 토막이 없으면 모름
 *    · 구를 건너뛴 «시 + 동»(«경기 성남시 정자동»)은 한 토막 «성남시» — 가리키는 시가 하나다
 */
export function sigunguHintBefore(before: string): string | null {
    const tokens = before.split(/[\s@/]+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    if (!last) return null;
    const hits = SIGUNGU_NAMES.filter(s => hintMatches(s, last));
    const suffixed = /[시군구]$/.test(last);
    if (!hits.length) return suffixed ? last : null;
    /* 시도 토막(«서울»)만 — 명부 이름의 첫 토막이고 시·군·구 꼴이 아니다 */
    if (!suffixed && hits.every(s => s.includes(' ') && s.split(' ')[0] === last)) return null;
    /* 이 토막이 가리키는 곳이 하나면 한 토막 — «성남시»는 분당구·수정구·중원구에 걸려도 가리키는 시는 하나다 */
    const places = new Set(hits.map(s => {
        const parts = s.split(' ');
        return parts.slice(0, parts.findIndex(p => p.startsWith(last)) + 1).join(' ');
    }));
    if (places.size === 1) return last;
    /* 여러 곳의 같은 이름(«중구» = 서울 중구 · 대전 중구) — 앞 토막까지 두 토막으로 */
    const prev = tokens[tokens.length - 2];
    return prev ? `${prev} ${last}` : null;
}


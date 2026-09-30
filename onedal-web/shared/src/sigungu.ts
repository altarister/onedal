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
    return sigungus.size > 1 ? SIGUNGU_AMBIGUOUS : SIGUNGU_UNKNOWN;
}

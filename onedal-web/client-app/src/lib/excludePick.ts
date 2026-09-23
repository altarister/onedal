/**
 * 🚫 **빼는 곳을 고르는 판단** — 화면에서 떼어 여기 둔다 (렌더 없이 검사한다).
 *
 * 기사님 확정 (2026-09-23): *"빼기는 멀티셀렉이 가능해야 한다. 도 서울을 선택하고
 * 시군구 전체를 선택했다면 나머지는 선택된 상태로 보여야 한다. 그중 강남구를 뺀다면
 * 전체 선택이 선택해제 되어야 한다. 일반적인 ui 니 금방 알수 있을꺼다."*
 *
 * ── 저장되는 키 세 갈래 (`excludedLabel` 이 읽는 그 형식) ──
 *   `S|서울`              시·도 전체
 *   `R|서울 강남구`        시·군·구 전체
 *   `D|서울 강남구|역삼동`  읍·면·동 하나
 *
 * 🔴 **「전체」가 켜진 동안은 `S|` · `R|` 하나로 둔다** — 하위를 펼쳐 적어 두면
 *    나중에 구가 새로 생겼을 때 그 구가 안 빠진다 (인천 검단구 · 영종구 · 제물포구,
 *    화성시 동탄구가 실제로 그렇게 생겼다). 「전체」는 «그 아래 전부»라는 뜻이다.
 */

/**
 * 🏷️ 「전체」 항목의 값 — 목록 맨 앞에 선다.
 *
 * 🔴 **지역 이름과 섞이지 않는 값이어야 한다** — 「전체」라는 글자를 값으로 쓰면
 *    그 이름의 동이 생길 때 조용히 부딪힌다. 화면은 `optionLabel` 로 「전체」라 그린다.
 */
export const ALL_KEY = '*ALL*';

const sidoKey = (sido: string) => `S|${sido}`;
const sggKey = (sgg: string) => `R|${sgg}`;
const dongKey = (sgg: string, dong: string) => `D|${sgg}|${dong}`;

/** 그 시·도에 딸린 키인가 — 시·도 전체 · 그 아래 시·군·구 · 그 아래 읍·면·동 */
const underSido = (key: string, sido: string, allSggs: string[]) =>
    key === sidoKey(sido)
    || allSggs.some(g => key === sggKey(g) || key.startsWith(`D|${g}|`));

/**
 * 🔍 그 시·도 아래에서 **지금 빠져 있는 시·군·구** — 「전체」가 켜져 있으면 전부다.
 * 화면은 이 목록으로 칩을 칠한다 (기사님 ②).
 */
export function excludedSggsOf(draft: string[], sido: string, allSggs: string[]): string[] {
    if (draft.includes(sidoKey(sido))) return [...allSggs];
    return allSggs.filter(g => draft.includes(sggKey(g)));
}

/**
 * 🔍 그 시·군·구 아래에서 **지금 빠져 있는 읍·면·동** — 위(시·도 · 시·군·구)가
 * 통째로 빠져 있으면 전부다.
 */
export function excludedDongsOf(
    draft: string[], sido: string, sgg: string, allDongs: string[],
): string[] {
    if (draft.includes(sidoKey(sido)) || draft.includes(sggKey(sgg))) return [...allDongs];
    return allDongs.filter(d => draft.includes(dongKey(sgg, d)));
}

/**
 * 그 시·도의 제외를 **통째로 갈아 끼운다** — 셈은 한 곳에서만 한다.
 * 전부면 `S|` 하나로 압축하고(기사님 ④), 아니면 `R|` 로 펼친다(기사님 ③).
 * 통째로 빠지는 시·군·구의 읍·면·동 키는 뜻이 없어지므로 함께 지운다.
 */
function withExcludedSggs(
    draft: string[], sido: string, allSggs: string[], next: string[],
): string[] {
    const rest = draft.filter(k => !underSido(k, sido, allSggs));
    const keptDongs = draft.filter(k =>
        allSggs.some(g => k.startsWith(`D|${g}|`) && !next.includes(g)));
    if (allSggs.length > 0 && next.length === allSggs.length) return [...rest, sidoKey(sido)];
    return [...rest, ...next.map(sggKey), ...keptDongs];
}

/** 🚫 「전체」를 눌렀다 — 켜져 있으면 그 시·도를 통째로 되살리고, 아니면 통째로 뺀다 */
export function toggleSggAll(draft: string[], sido: string, allSggs: string[]): string[] {
    const on = excludedSggsOf(draft, sido, allSggs).length === allSggs.length && allSggs.length > 0;
    return withExcludedSggs(draft, sido, allSggs, on ? [] : [...allSggs]);
}

/** 🚫 시·군·구 하나를 눌렀다 — 그것만 뒤집는다. 「전체」는 결과에서 파생된다 */
export function toggleSggOne(
    draft: string[], sido: string, allSggs: string[], sgg: string,
): string[] {
    const now = excludedSggsOf(draft, sido, allSggs);
    const next = now.includes(sgg) ? now.filter(g => g !== sgg) : [...now, sgg];
    return withExcludedSggs(draft, sido, allSggs, next);
}

/**
 * 그 시·군·구의 읍·면·동 제외를 **통째로 갈아 끼운다**.
 * 전부면 `R|` 하나로 압축한다. 위 시·도가 「전체」로 접혀 있으면 먼저 펼친다 —
 * 안 펼치면 «서울 전체 제외»에서 역삼동만 되살리는 길이 없다.
 */
function withExcludedDongs(
    draft: string[], sido: string, allSggs: string[], sgg: string,
    allDongs: string[], next: string[],
): string[] {
    /* 🔴 여기서 `withExcludedSggs` 를 부르면 안 된다 — 나머지가 «전부»라 곧바로 다시
       `S|` 로 접혀, 이 시·군·구의 동을 되살릴 자리가 사라진다 */
    const spread = draft.includes(sidoKey(sido))
        ? [...draft.filter(k => k !== sidoKey(sido)),
           ...allSggs.filter(g => g !== sgg).map(sggKey)]
        : draft;
    const rest = spread.filter(k => k !== sggKey(sgg) && !k.startsWith(`D|${sgg}|`));
    if (allDongs.length > 0 && next.length === allDongs.length) return [...rest, sggKey(sgg)];
    return [...rest, ...next.map(d => dongKey(sgg, d))];
}

/** 🚫 읍·면·동 칸의 「전체」 — 그 시·군·구를 통째로 빼거나 되살린다 */
export function toggleDongAll(
    draft: string[], sido: string, allSggs: string[], sgg: string, allDongs: string[],
): string[] {
    const on = excludedDongsOf(draft, sido, sgg, allDongs).length === allDongs.length && allDongs.length > 0;
    return withExcludedDongs(draft, sido, allSggs, sgg, allDongs, on ? [] : [...allDongs]);
}

/** 🚫 읍·면·동 하나를 눌렀다 */
export function toggleDongOne(
    draft: string[], sido: string, allSggs: string[], sgg: string,
    allDongs: string[], dong: string,
): string[] {
    const now = excludedDongsOf(draft, sido, sgg, allDongs);
    const next = now.includes(dong) ? now.filter(d => d !== dong) : [...now, dong];
    return withExcludedDongs(draft, sido, allSggs, sgg, allDongs, next);
}

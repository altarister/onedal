/**
 * 🎨 **구간마다 끊어 본 경로** — 통짜 폴리라인과 구간 경계로 «구간별 선»을 만든다.
 *
 * 🔴 **선을 두 벌로 보내지 않으려고 있는 파일이다.** 폴리라인을 콜마다 복제해 보내면 초당 수백 KB 가 오가
 *    브라우저가 죽는다. 같은 점열을 복제하는 대신
 *    **끝 인덱스 몇 개**만 싣고 여기서 자른다.
 *
 * 🔴 **자르는 규칙은 한 곳이다** (규칙 ③) — 화면도 서버도 이 함수를 부른다.
 */

/** 구간 경계를 만든다 — 카카오 `sections` 마다의 점 수를 누적한 끝 인덱스 */
export function sectionEndsOf(lines: ReadonlyArray<ReadonlyArray<unknown>>): number[] {
    const ends: number[] = [];
    let acc = 0;
    for (const l of lines) { acc += l.length; ends.push(acc); }
    return ends;
}

/**
 * 통짜 폴리라인을 구간별로 자른다.
 * 경계가 없거나 마지막 끝이 점 수와 안 맞으면 **한 구간으로 돌려준다** —
 * 지어내지 않고, 그리는 쪽이 «한 색»으로 물러날 수 있게 (규칙 ④).
 */
export function sectionLinesOf<T>(
    polyline: ReadonlyArray<T> | undefined,
    ends: ReadonlyArray<number> | undefined,
): T[][] {
    if (!polyline?.length) return [];
    if (!ends?.length || ends[ends.length - 1] !== polyline.length) return [polyline.slice()];
    const out: T[][] = [];
    let from = 0;
    for (const e of ends) {
        if (e < from || e > polyline.length) return [polyline.slice()];   // 어긋난 경계는 안 믿는다
        out.push(polyline.slice(from, e));
        from = e;
    }
    return out;
}

/**
 * 🌈 **화면 좌표를 진행 방향의 직각으로 민다** — 콜 띠를 나란히 긋는 재료.
 *
 * 같은 길을 두 콜이 함께 갈 때 선을 그대로 겹쳐 그으면 나중 색이 앞 색을 덮는다.
 * 투명도로 섞으면 둘 다 흐려져 **운전 중에 안 읽힌다** (기사님). 그래서 진한 선을 몇 픽셀 옆으로 밀어
 * **나란히** 둔다 — 겹친 구간이 «두 줄»로 보인다.
 *
 * 🔴 미는 양은 **화면 픽셀**이다 — 지도를 확대해도 두 줄 사이 간격이 그대로여야 두 줄로 읽힌다.
 * ⚠️ 같은 점이 이어지면(길이 0) 밀 방향이 없다 — 그 점은 그대로 둔다 (0 으로 나누지 않는다).
 */
export function offsetScreenPath(
    pts: ReadonlyArray<{ cx: number; cy: number }>, px: number,
): Array<{ cx: number; cy: number }> {
    if (px === 0 || pts.length < 2) return pts.map(p => ({ cx: p.cx, cy: p.cy }));
    return pts.map((p, i) => {
        const a = pts[i === 0 ? 0 : i - 1];
        const b = pts[i === 0 ? 1 : Math.min(i + 1, pts.length - 1)];
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        const len = Math.hypot(dx, dy);
        if (!(len > 0)) return { cx: p.cx, cy: p.cy };
        /* 진행 방향 (dx, dy) 의 직각은 (−dy, dx) — 오른쪽으로 가는 선을 양수로 밀면 화면 아래로 간다 */
        return { cx: p.cx + (-dy / len) * px, cy: p.cy + (dx / len) * px };
    });
}

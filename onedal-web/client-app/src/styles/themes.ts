/**
 * 중앙화된 맵 테마 색상 정의.
 * Map.tsx, BaseMapLayerCanvas, RoadLayer, 
 * 모든 렌더링 레이어가 이 파일을 단일 소스로 참조합니다.
 */

// ── Base Map & Overlay Colors ────────────────────────────────────────────────

export const MAP_THEME_COLORS = {
    dark: {
        fill: 'rgb(26, 26, 26)', // #1a1a1a
        stroke: 'rgb(68, 68, 68)', // #444444
        answeredFill: 'rgb(22, 163, 74)',
        answeredStroke: 'rgb(68, 68, 68)',
        correctFill: 'rgb(22, 163, 74)',
        correctStroke: 'rgb(68, 68, 68)',
        wrongFill: 'rgb(220, 38, 38)',
        wrongStroke: 'rgb(68, 68, 68)',
        hoverFill: 'rgb(255, 255, 255)',
        hoverStroke: 'rgb(255, 255, 255)',
        hoverDefaultFill: 'rgb(51, 51, 51)',
        
        // --- Canvas Dashboard Elements ---
        sidoFill: 'rgb(100, 116, 139)',
        sidoStroke: 'rgb(100, 116, 139)',
        routeLine: 'rgb(59, 130, 246)',
        /** 👣 내가 실제로 달린 자취 — 계획선(routeLine)과 **다른 색**이어야 어느 쪽인지 갈린다 */
        drivenLine: 'rgb(248, 250, 252)',
        nodePickup: 'rgb(16, 185, 129)',
        nodeDropoff: 'rgb(244, 63, 94)',
        nodeEvaluating: 'rgb(245, 158, 11)',
        nodeStrokeRegular: 'rgb(15, 20, 35)',
        nodeStrokeEvaluating: 'rgb(253, 230, 138)',
        textBgDark: 'rgb(15, 20, 35)',
        textBgLight: 'rgb(255, 255, 255)',
        myLocationPulse: 'rgb(56, 189, 248)',
        myLocationDotText: 'rgb(224, 242, 254)',
        myLocationStroke: 'rgb(255, 255, 255)',
        textBody: 'rgb(255, 255, 255)',
        textMuted: 'rgb(148, 163, 184)'
    },
    light: {
        fill: 'rgb(248, 250, 252)', // #f8fafc (slate-50)
        stroke: 'rgb(122, 145, 179)', // #7a91b3
        answeredFill: 'rgb(59, 130, 246)',
        answeredStroke: 'rgb(37, 99, 235)',
        correctFill: 'rgb(59, 130, 246)',
        correctStroke: 'rgb(29, 78, 216)',
        wrongFill: 'rgb(239, 68, 68)',
        wrongStroke: 'rgb(185, 28, 28)',
        hoverFill: 'rgb(250, 204, 21)',
        hoverStroke: 'rgb(217, 119, 6)',
        hoverDefaultFill: 'rgb(253, 230, 138)',

        // --- Canvas Dashboard Elements ---
        sidoFill: 'rgb(100, 116, 139)',
        sidoStroke: 'rgb(100, 116, 139)',
        routeLine: 'rgb(37, 99, 235)', // blue-600
        /** 👣 밝은 테마에서는 어두운 선이 회색조 지도 위에서 산다 */
        drivenLine: 'rgb(30, 41, 59)',
        nodePickup: 'rgb(5, 150, 105)', // emerald-600
        nodeDropoff: 'rgb(225, 29, 72)', // rose-600
        nodeEvaluating: 'rgb(217, 119, 6)', // amber-600
        nodeStrokeRegular: 'rgb(255, 255, 255)', // white
        nodeStrokeEvaluating: 'rgb(253, 230, 138)', // amber-200
        textBgDark: 'rgb(15, 20, 35)',
        textBgLight: 'rgb(255, 255, 255)',
        myLocationPulse: 'rgb(2, 132, 199)', // sky-600
        myLocationDotText: 'rgb(255, 255, 255)',
        myLocationStroke: 'rgb(255, 255, 255)',
        textBody: 'rgb(51, 65, 85)', // slate-700
        textMuted: 'rgb(148, 163, 184)'
    },
} as const;

/**
 * 🎨 **색에 투명도를 붙인다 — 형식이 무엇이든**.
 *
 * 🔴 `rgb()` 만 처리하면 `hsl()` 색은 **불투명하게 그대로** 돌아온다. 콜 색이 `hsl()` 이라
 *    지도에서 콜 띠를 겹쳐 그려도 마지막 색 하나만 보이고 «함께 가는 구간»이 사라진다.
 * 🔴 **이미 투명도가 있는 색은 그대로 둔다** — 두 번 씌우면 의도보다 훨씬 옅어진다.
 * ⚠️ 모르는 형식은 그대로 돌려준다 — 색을 지어내지 않는다 (규칙 ④).
 */
export const withAlpha = (color: string, alpha: number) => {
    const c = color.trim();
    if (c.startsWith('rgba(') || c.startsWith('hsla(')) return c;
    if (c.startsWith('rgb(')) return c.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    /* `hsl(210 70% 55%)` · `hsl(210, 70%, 55%)` 둘 다 — 값은 그대로 두고 슬래시로 투명도만 붙인다 */
    if (c.startsWith('hsl(')) return `hsla(${c.slice(4, -1)} / ${alpha})`;
    const hex = /^#([0-9a-f]{6})$/i.exec(c);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    return c;
};

export type MapTheme = keyof typeof MAP_THEME_COLORS;
export type MapThemeColors = typeof MAP_THEME_COLORS[MapTheme];

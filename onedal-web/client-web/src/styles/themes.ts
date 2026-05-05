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

export const withAlpha = (rgbStr: string, alpha: number) => {
    if (rgbStr.startsWith('rgb(')) {
        return rgbStr.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    // Fallback for solid hexes if any leak
    return rgbStr;
};

export type MapTheme = keyof typeof MAP_THEME_COLORS;
export type MapThemeColors = typeof MAP_THEME_COLORS[MapTheme];

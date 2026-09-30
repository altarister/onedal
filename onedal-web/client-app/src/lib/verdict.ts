import type { Color } from '@onedal/shared';

/**
 * 🎨 **색 → 버튼 칠** — 색을 정하는 것(verdictOf)과 동그라미(COLOR_DOT)는 shared 에 있다(공통 함수 5).
 *    칠은 Tailwind 반 이름이라 화면 쪽에 둔다 — 색과 칠을 한 곳에서 짝지어 둔다 (두 벌이 되지 않게 · 규칙 ③)
 */
export const BUTTON_BG: Record<Color | '없음', string> = {
    '꿀': 'bg-info hover:bg-info/80 shadow-[0_0_15px_var(--theme-glow-primary)]',
    '보통': 'bg-success hover:bg-success/80',
    '똥': 'bg-warning hover:bg-warning/80 shadow-[0_0_15px_var(--theme-glow-warning)]',
    '사고': 'bg-danger hover:bg-danger/80 shadow-[0_0_15px_var(--theme-glow-warning)]',
    '없음': 'bg-success hover:bg-success/80',
};

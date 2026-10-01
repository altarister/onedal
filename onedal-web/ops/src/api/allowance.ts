import { allowanceLive } from '@onedal/shared';

/**
 * 🎛️ **허락 한 칸의 글 — «지금 살아 있나»는 shared `allowanceLive` 하나** (reviews/29 6단계 · 서버 `core/allowance` 와 같은 함수).
 *    허락 시각이 없으면 꺼짐 · 있고 기한이 비었거나 오늘(한국 달력 날) 이후면 켜짐 · 기한이 지났으면 «기한 지남»(허락 시각은 남아 있다).
 *    여기서 날짜를 더하거나 빼지 않는다 — `today` 는 부르는 쪽이 준다(`ui.tsx` 의 `todayKey` = shared `kstDateText`).
 */
export interface AllowState { live: boolean; on: boolean; text: string }

export function allowState(allowedAt: string | null | undefined, until: string | null | undefined, today: string): AllowState {
    if (!allowedAt) return { live: false, on: false, text: '꺼짐' };
    if (allowanceLive(allowedAt, until, today)) return { live: true, on: true, text: until ? `켜짐 · ${until} 까지` : '켜짐 · 기한 없음' };
    return { live: false, on: true, text: `기한 지남 (${until})` };
}

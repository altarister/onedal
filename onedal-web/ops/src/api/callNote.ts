import { kstDateText } from '@onedal/shared';

/**
 * 📞 **통화 도우미 — 약속 시각의 기준 날은 그 콜의 상차(하차) 예정 시각의 한국 달력 날** (onedal-1f · reviews/29 5단계).
 *    오늘로 박으면 내일 상차 콜의 약속이 하루 어긋나고, 영업일 키(businessDayKey)면 새벽 02:00 상차 콜이 전날로 붙는다 —
 *    그래서 shared `kstDateText`(한국 달력 날) 하나만 쓴다. 기준 시각이 없으면 지금(오늘).
 */
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 기준 날 «YYYY-MM-DD» — 콜의 예정 시각(ISO)의 한국 달력 날, 없으면 지금의 */
export function baseDayOf(stopAt: string | null | undefined, now: Date | number = Date.now()): string {
    return kstDateText(stopAt) ?? kstDateText(now) ?? '';
}

/** «10/2(금)» — 칸 옆에 보이는 기준 날 */
export function baseDayLabel(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    const w = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${m}/${d}(${w})`;
}

/** 기준 날 + «HH:MM» → 한국 시각 ISO(«YYYY-MM-DDTHH:MM:00+09:00»). 시각이 비면 null */
export function promisedAtOf(stopAt: string | null | undefined, hhmm: string, now: Date | number = Date.now()): string | null {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
    return `${baseDayOf(stopAt, now)}T${hhmm}:00+09:00`;
}

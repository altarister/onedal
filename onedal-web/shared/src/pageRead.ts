import type { TargetAppType } from './index';
import type { PageField, ScreenPage } from './pageFields';
import { NETWORK_PAGES } from './networkPages';

/**
 * 📄 **화면 칸을 배차망 정의 표대로 읽는다 — 서버 쪽 한 곳** (reviews/34 3단계 · 원달앱 짝 `core/PageFieldRead.kt`).
 * 그 배차망 · 그 화면에서 칸이 맞고 «읽는다(READ)»이며 읽는 법(`read`)이 있는 줄 하나로 읽는다 — 배차망 이름으로 가르지 않는다.
 * 노드 글 목록은 한 칸 띄어 잇는다(원달앱과 같은 꼴). 이미 이은 원문은 그대로 — 읽는 법이 `\s` 로 줄바꿈도 넘는다.
 * 원달앱과 같은 원문에 같은 답을 내는지는 공통 문제지 `pageReadCases.json` 이 묻는다.
 */
const compiled = new Map<string, RegExp | null>();
const readOf = (app: TargetAppType, page: ScreenPage, field: PageField): RegExp | null => {
    const key = `${app}|${page}|${field}`;
    if (!compiled.has(key)) {
        const spec = NETWORK_PAGES[app]?.pages[page]?.find(r => r.field === field && r.handling === 'READ' && r.read !== undefined);
        compiled.set(key, spec?.read !== undefined ? new RegExp(spec.read) : null);
    }
    return compiled.get(key)!;
};

/** 그 화면 · 그 칸의 값 글자 — 정의에 읽는 법이 없거나 원문에 없으면 null(지어내지 않는다) */
export function pageFieldOf(app: TargetAppType, page: ScreenPage, field: PageField, text: string | readonly string[]): string | null {
    const re = readOf(app, page, field);
    if (!re) return null;
    const joined = typeof text === 'string' ? text : text.join(' ');
    return re.exec(joined)?.[1]?.trim() || null;
}

/** 요금 — 값 글자에서 쉼표를 떼어 정수로 · 0 이하 · 정수가 아니면 null (원달앱 `PageFieldRead.fareOf` 와 같은 규칙 · 만 · 천 · 축약을 짐작하지 않는다) */
export function pageFareOf(app: TargetAppType, page: ScreenPage, text: string | readonly string[]): number | null {
    const digits = pageFieldOf(app, page, 'fare', text)?.replace(/,/g, '');
    if (!digits || !/^\d+$/.test(digits)) return null;
    const n = Number(digits);
    return n > 0 && n <= 2147483647 ? n : null;
}

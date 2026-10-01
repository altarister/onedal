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

/**
 * 🚫 **제외어를 찾는 글** — 배차망마다 정의 표의 «제외어 찾는 칸»(`excludeScan`) 글만 이어 붙인다(reviews/34 3단계 5③ · 기사님 «가»).
 *    인성 적요 · 결제 괄호 · 구분 / 화물24시 화물정보 · 결제방법 / 픽커 물품정보 · 유의사항 — 주소 · 화주 이름 · 화면 머리 · 버튼은 안 본다.
 *    칸마다 상세 화면의 읽는 법(`pageFieldOf`)으로 읽고, 못 읽은 칸은 빠진다(지어내지 않는다).
 */
export function excludeScanTextOf(app: TargetAppType, text: string | readonly string[]): string {
    return NETWORK_PAGES[app].excludeScan.map(f => pageFieldOf(app, 'detail', f, text)).filter((t): t is string => !!t).join(' ');
}

const addressCutRes = new Map<TargetAppType, RegExp | null>();
/**
 * 🏠 **카카오에 묻기 전 콜 주소 다듬기** — 정의 표의 배차망 단위 칸 `addressCut` 에 맞는 부분을 지우고 앞뒤 공백을 자른다(reviews/34 3단계 5②).
 *    인성 끝의 «(건물명)» · 화물24시 쉼표 뒤 상세 주소 · 픽커는 자르기만. 원달앱은 안 읽는다(원달앱은 주소를 꺼내고, 서버는 묻기 전에 다듬는다).
 */
export function addressOf(app: TargetAppType, raw: string): string {
    if (!addressCutRes.has(app)) {
        const cut = NETWORK_PAGES[app].addressCut;
        addressCutRes.set(app, cut ? new RegExp(cut) : null);
    }
    const re = addressCutRes.get(app);
    return (re ? raw.replace(re, '') : raw).trim();
}

import type { TargetAppType, LocationDetailInfo, PaymentType, BillingType, DetailedOfficeOrder } from './index';
import { PAYMENT_TYPES } from './index';
import type { PageField, ScreenPage } from './pageFields';
import { NETWORK_PAGES } from './networkPages';

/**
 * 📄 **화면 칸을 배차망 정의 표대로 읽는다 — 서버 쪽 한 곳** (reviews/34 3단계 · 원달앱 짝 `core/PageFieldRead.kt`).
 * 그 배차망 · 그 화면에서 칸이 맞고 «읽는다(READ)»이며 읽는 법(`read`)이 있는 줄 하나로 읽는다 — 배차망 이름으로 가르지 않는다.
 * 노드 글 목록은 한 칸 띄어 잇는다(원달앱과 같은 꼴). 이미 이은 원문은 그대로 — 읽는 법이 `\s` 로 줄바꿈도 넘는다.
 * 원달앱과 같은 원문에 같은 답을 내는지는 공통 문제지 `pageReadCases.json` 이 묻는다.
 * 한 화면에 같은 칸이 여러 조각으로 나오면(인성 상세의 배차사 · 출발 고객 · 도착 고객 …) 줄마다 조각 이름 `part` 가 붙는다 —
 * 조각을 주면 그 조각 줄을, 안 주면 조각 없는 줄을 읽는다.
 */
const compiled = new Map<string, RegExp | null>();
const readOf = (app: TargetAppType, page: ScreenPage, field: PageField, part: string): RegExp | null => {
    const key = `${app}|${page}|${field}|${part}`;
    if (!compiled.has(key)) {
        const spec = NETWORK_PAGES[app]?.pages[page]?.find(r => r.field === field && (r.part ?? '') === part
            && r.handling === 'READ' && r.read !== undefined);
        compiled.set(key, spec?.read !== undefined ? new RegExp(spec.read) : null);
    }
    return compiled.get(key)!;
};

/** 그 화면 · 그 칸(· 그 조각)의 값 글자 — 정의에 읽는 법이 없거나 원문에 없으면 null(지어내지 않는다) */
export function pageFieldOf(app: TargetAppType, page: ScreenPage, field: PageField, text: string | readonly string[], part = ''): string | null {
    const re = readOf(app, page, field, part);
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

/** 📄 상세 콜 자료 — 상세 화면 정의 칸(· 조각)이 콜의 어느 자료가 되나. 배차망마다 다른 것은 표의 읽는 법뿐이다 */
type DetailRecordText = 'receiptStatus' | 'itemDescription' | 'commissionRate' | 'tollFare' | 'tripType' | 'orderForm' | 'dispatcherName' | 'dispatcherPhone';
const DETAIL_RECORD: ReadonlyArray<readonly [key: DetailRecordText, field: PageField, part?: string]> = [
    ['receiptStatus', 'stage'], ['itemDescription', 'itemSize'], ['commissionRate', 'commission'],
    ['tollFare', 'toll'], ['tripType', 'tags'], ['orderForm', 'reservation'],
    ['dispatcherName', 'contact', 'dispatcher'], ['dispatcherPhone', 'contact', 'dispatcherPhone'],
];
/** 연락처 팝업 한 덩어리의 조각 — 출발 · 도착이 같은 꼴이다 */
const STOP_CONTACT: ReadonlyArray<readonly [key: keyof LocationDetailInfo, field: PageField, part: (side: string) => string]> = [
    ['customerName', 'contact', s => `${s}.customer`], ['addressDetail', 'pickup', () => ''], ['department', 'contact', s => `${s}.department`],
    ['contactName', 'contact', s => `${s}.contactName`], ['phone1', 'contact', s => `${s}.phone1`], ['phone2', 'contact', s => `${s}.phone2`],
];

/**
 * 📄 **상세 원문의 콜 자료** — 상태 · 물품 · 결제 · 계산서 · 수수료 · 탁송료 · 구분 · 형태 · 배차사 · 적요 · 출발 · 도착 연락처(서버 `/detail` · 기사님 «1~5 모두 가»).
 *    칸마다 상세 화면 정의 줄의 읽는 법으로 읽는다. 🔴 못 찾은 칸은 싣지 않는다 — `/detail` 이 이 결과를 앞 기억 위에 펼치므로 빈 칸이 아는 값을 지우면 안 된다.
 *    결제 · 계산서는 알려진 값(PAYMENT_TYPES · 계산서 · 인수증 · 무과세)일 때만 · 적요는 팝업 글(줄바꿈 → 공백)이 먼저, 없으면 본문 «적요상세» 줄(상차 약속 시각이 본문 시각으로 바뀌지 않게).
 *    출발 · 도착 연락처는 그 팝업 머리표가 원문에 있을 때만 한 덩어리(없으면 빈 목록).
 */
const BILLING_TYPES: readonly BillingType[] = ['계산서', '인수증', '무과세'];
export type DetailRecord = Partial<Pick<DetailedOfficeOrder, DetailRecordText | 'paymentType' | 'billingType' | 'detailMemo'>>
    & { pickupDetails: LocationDetailInfo[]; dropoffDetails: LocationDetailInfo[] };
export function detailRecordOf(app: TargetAppType, rawText: string): DetailRecord {
    const read = (field: PageField, part = '') => pageFieldOf(app, 'detail', field, rawText, part) ?? undefined;
    const out: Partial<Pick<DetailedOfficeOrder, DetailRecordText | 'paymentType' | 'billingType' | 'detailMemo'>> = {};
    for (const [key, field, part] of DETAIL_RECORD) { const v = read(field, part); if (v !== undefined) out[key] = v; }
    const pay = read('payment');
    if (pay && (PAYMENT_TYPES as readonly string[]).includes(pay)) out.paymentType = pay as PaymentType;
    const bill = read('billing');
    if (bill && (BILLING_TYPES as readonly string[]).includes(bill)) out.billingType = bill as BillingType;
    const memo = read('memo', 'popup')?.replace(/\s+/g, ' ').trim() || read('memo', 'body');
    if (memo) out.detailMemo = memo;
    const stopOf = (side: 'pickup' | 'dropoff', tag: string): LocationDetailInfo[] => {
        if (!rawText.includes(tag)) return [];
        const info: LocationDetailInfo = {};
        for (const [key, field, part] of STOP_CONTACT) {
            const v = read(field === 'pickup' ? side : field, part(side));
            if (v !== undefined) (info as Record<string, string>)[key] = v;
        }
        return [info];
    };
    return { ...out, pickupDetails: stopOf('pickup', '[출발지상세]'), dropoffDetails: stopOf('dropoff', '[도착지상세]') };
}

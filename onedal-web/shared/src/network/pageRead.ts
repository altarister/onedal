/**
 * 화면 값 읽기
 * 누가: 서버 판정 · 상세 · 스캔 · 시뮬레이션
 * 언제: 배차망 화면 글자에서 칸 값을 꺼낼 때
 * 어디서: 서버가 원달앱 보고를 받는 자리
 * 무엇을: pageFieldOf · pageFareOf · badgeOf · addressOf · geocodeTargetOf · stopTextOf · stopQueryOf · detailRecordOf
 * 어떻게: 정의 표의 읽는 법으로 글자를 잘라 낸다
 * 왜: 정의에 없거나 원문에 없는 값을 지어내지 않기 위해서다
 */
import type { TargetAppType, CallStop, DetailedOfficeOrder, CallIdentity } from '../index';
import { PAYMENT_TYPES, BILLING_TYPES, type PaymentType, type BillingType } from '../call/money';
import type { BadgePlace, BadgeWord } from '../call/badges';
import type { PageField, ScreenPage } from './pageFields';
import { NETWORK_PAGES, fieldsOf } from './networkPages';
import { dongsBySigungu } from '../filter/adminDongMatch';
import { sigunguHintBefore } from '../filter/sigungu';

/**
 * 📄 **화면 칸을 배차망 정의 표대로 읽는다 — 서버 쪽 한 곳** (원달앱 짝 `core/PageFieldRead.kt`).
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
        const spec = fieldsOf(app, page).find(r => r.field === field && (r.part ?? '') === part
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
 * 🚫 **제외어를 찾는 글** — 배차망마다 정의 표의 «제외어 찾는 칸»(`excludeScan`) 글만 이어 붙인다(기사님 «가»).
 *    인성 적요 · 결제 괄호 · 구분 / 화물24시 화물정보 · 결제방법 / 픽커 물품정보 · 유의사항 — 주소 · 화주 이름 · 화면 머리 · 버튼은 안 본다.
 *    칸마다 상세 화면의 읽는 법(`pageFieldOf`)으로 읽고, 못 읽은 칸은 빠진다(지어내지 않는다).
 */
export function excludeScanTextOf(app: TargetAppType, text: string | readonly string[]): string {
    return NETWORK_PAGES[app].excludeScan.map(f => pageFieldOf(app, 'newCall', f, text)).filter((t): t is string => !!t).join(' ');
}

/**
 * 🏷️ **표시 글자 하나의 뜻** — 그 배차망 정의 표 `badgeWords` 에서 자리 · 글자가 같은 줄. 없으면 null(뜻을 지어내지 않는다 · 표시 글자가 아닐 수도 있다).
 *    글자는 화면 글자 그대로 견준다 — «급송/» 과 «급송» 은 다른 줄이다. 공통 문제지 `pageReadCases.json` `badgeCases` 가 묻는다.
 */
export function badgeOf(app: TargetAppType, at: BadgePlace, text: string): BadgeWord | null {
    return NETWORK_PAGES[app].badgeWords?.find(w => w.at === at && w.text === text) ?? null;
}

/**
 * 🧾 **늘 있던 칸이 이 원문에 없나** — 표에서 «늘 있음»(ALWAYS)이고 읽는 법이 있는 칸 가운데 못 읽은 것(칸 · 조각 이름).
 * 비지 않으면 배차망 화면이 바뀌었을 수 있다(58 ② · 리뉴얼 신호). 읽는 법이 없는 늘 있음 칸은 여기서 못 본다(표식 글자가 필요 — 남은 일).
 */
export function missingAlwaysOf(app: TargetAppType, page: ScreenPage, text: string | readonly string[]): string[] {
    return fieldsOf(app, page)
        .filter(r => r.presence === 'ALWAYS' && r.handling === 'READ' && r.read !== undefined)
        .filter(r => pageFieldOf(app, page, r.field, text, r.part ?? '') === null)
        .map(r => (r.part ? `${r.field}.${r.part}` : r.field));
}

const addressCutRes = new Map<TargetAppType, RegExp | null>();
/**
 * 🏠 **카카오에 묻기 전 콜 주소 다듬기** — 정의 표의 배차망 단위 칸 `addressCut` 에 맞는 부분을 지우고 앞뒤 공백을 자른다.
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

/**
 * 📍 **이 정거장을 어느 글로 지오코딩하나 · 다시 찍나 — 한 곳** (90판 · 71 «가» · `geocodeTarget.test`).
 *    상세 팝업에서 읽은 주소(`addressDetail`)가 있으면 그것이 먼저 · 없으면 목록 글(`listText`) — 둘 다 `addressOf` 로 다듬는다.
 *    좌표는 «고른 글»을 따라가는 값이라, 좌표가 없거나 찍은 글(`geoText`)이 지금 고른 글과 다르면 다시 찍는다(짧은 목록 글로 먼저 찍힌 콜에 상세 주소가 오면).
 */
export function geocodeTargetOf(app: TargetAppType, stop: CallStop | null | undefined): { text: string; need: boolean } {
    const text = addressOf(app, stopTextOf(stop));
    const need = !stop?.geo?.x || !stop?.geo?.y || stop?.geoText !== text;
    return { text, need };
}

/** 🏠 **이 정거장 글자** — 상세 주소(앞뒤 빈칸 뗌)가 있으면 그것, 없으면 목록 원문 · 둘 다 없으면 빈 글자 */
export function stopTextOf(stop: CallStop | null | undefined): string {
    return stop?.addressDetail?.trim() || stop?.listText || '';
}

const SPACES = /\s+/;
/** 약속 앞글자 · 뒷글자와 동을 가르는 표 — «낼8:30/가산동» · «@낼8:30)방배동» · «내곡동/7시까지» · 글자에 «(» 가 있으면 «)» 는 인성 끝 괄호라 «/» 만 */
const PROMISE_CUT = /[/)]/;
const PROMISE_CUT_NO_PAREN = /\//;
/** 지역 끝말이 붙은 토막 — 원달앱 `LocationTextAnalyzer` 1차와 같은 끝말(숫자+동 · 가 · 동 · 읍 · 면 · 리 · 시 · 구 · 군) · «오늘중»은 아니다 */
const REGION_PIECE = /^[가-힣]{2,}(?:\d{1,2}[동가]|[동읍면리시구군])$/;
/** 동 꼴 토막 — 끝말 토막이 없을 때 · 한글 둘 이상으로 시작하고 숫자는 동 번호 둘까지(«역삼1동» · «을지로6가») · «낼8:30» · «7시까지»는 아니다 */
const PLACE_PIECE = /^[가-힣]{2,}\d{0,2}[가-힣]*$/;
const JOINED_CITY_GU = /^([가-힣]+[시군])([가-힣]+구)$/;
/** 번지 — 숫자만 · 숫자-숫자 토막(«907» · «158-95») · «은행2동» 같은 동 번호는 아니다 */
const LOT_NUMBER = /(?:^|\s)\d+(?:-\d+)?(?=\s|$)/;

/** 시 · 군 짧은 이름(«수원») → 그 시 · 군의 동 전부 · 명부의 동 이름 전부 — 처음 부를 때 만든다 */
let cityDongsMemo: { byCity: Map<string, Set<string>>; all: Set<string> } | null = null;
function cityDongs(): { byCity: Map<string, Set<string>>; all: Set<string> } {
    if (cityDongsMemo) return cityDongsMemo;
    const byCity = new Map<string, Set<string>>();
    const all = new Set<string>();
    for (const [sigungu, dongs] of dongsBySigungu()) {
        for (const d of dongs) all.add(d);
        const head = sigungu.split(' ')[0];
        if (head.length <= 2 || !(head.endsWith('시') || head.endsWith('군'))) continue;
        const city = head.slice(0, -1);
        if (!byCity.has(city)) byCity.set(city, new Set());
        for (const d of dongs) byCity.get(city)!.add(d);
    }
    return cityDongsMemo = { byCity, all };
}

/** «수원시영통구» → «수원시» «영통구» — 명부에 «수원시 영통구» 가 있을 때만 */
function splitCityGu(token: string): string[] {
    const m = JOINED_CITY_GU.exec(token);
    return m && dongsBySigungu().has(`${m[1]} ${m[2]}`) ? [m[1], m[2]] : [token];
}

/** «수원이의동» → 앞 토막이 없으면 «수원 이의동» · 앞 토막에 그 시가 있으면 «이의동» — 그 글자 자체가 명부 동이거나 명부 밖이면 그대로 */
function unglueCity(dong: string, head: readonly string[]): string {
    const { byCity, all } = cityDongs();
    if (all.has(dong)) return dong;
    for (const [city, dongs] of byCity) {
        if (!dong.startsWith(city) || dong.length <= city.length) continue;
        const rest = dong.slice(city.length);
        if (!dongs.has(rest)) continue;
        if (head.length === 0) return `${city} ${rest}`;
        if (head.some(t => t === city || t === `${city}시` || t === `${city}군`)) return rest;
    }
    return dong;
}

const CLOSED_PAREN = /^(.+)\(([^()]+)\)$/;
const UNCLOSED_PAREN = /^(.*)\(([^()]*)$/;
const UNPAIRED_BRACKET = /^([^[\]]*)\]([^[\]]*)$/;
/** 도로명 덧글 — «폭포로412-18» · «…길 12» 꼴(…로 · 길 + 번호) */
const ROAD_NOTE = /^[가-힣\d]+[로길]\d+(?:-\d+)?$/;

/**
 * 괄호 · 꺾쇠 덧글 가르기 — 마지막 토막의 «동(덧글)» · 잘린 «동(덧글» · «덧글]동».
 *    덧글이 시 · 군 · 구 짧은 이름(`sigunguHintBefore` 명부 — «하남» · «종로» · «평택»)이면 `city` 로 돌려준다(«시 동»으로 잇는다).
 *    닫힌 괄호는 그 밖이면 토막을 그대로 둔다(«잠원동(논현역)») · 잘린 덧글은 도로명 꼴이면 `road` 로 뒤에 잇고(«화도읍(폭포로412-18» → «화도읍 폭포로412-18»), 아니면 버린다(«상대원동(1박스» → «상대원동»).
 */
function noteOf(token: string): { base: string; city?: string; road?: string } {
    const closed = CLOSED_PAREN.exec(token);
    if (closed) return sigunguHintBefore(closed[2]) ? { base: closed[1], city: closed[2] } : { base: token };
    const paren = UNCLOSED_PAREN.exec(token);
    const bracket = paren ? null : UNPAIRED_BRACKET.exec(token);
    const [base, extra] = paren ? [paren[1], paren[2]] : bracket ? [bracket[2], bracket[1]] : [token, ''];
    if (!base || !extra) return { base: token };
    if (sigunguHintBefore(extra)) return { base, city: extra };
    return ROAD_NOTE.test(extra) ? { base, road: extra } : { base };
}

const PROMISE_GLUE_FRONT = new Set(['/', '@', '(']);
const PROMISE_GLUE_BACK = new Set(['/', ')']);

/**
 * 약속 원문 떼기 — 하나만 뗀다(상호 안의 같은 글자는 남긴다). 뗀 자리는 빈칸이 된다.
 *    ① 원문 앞에 «/» · «@» · «(» 가 붙었거나 뒤에 «/» · «)» 가 붙은 첫 자리를 붙은 글자와 함께 —
 *       «@낼8:30/가산동» − «@낼8:30» → « 가산동» · «오포읍(14시전)» − «14시전» → «오포읍 »
 *    ② 그런 자리가 없으면 낱말 머리(글 시작이나 빈칸 뒤)의 첫 자리 — «14시전쌍림동» − «14시전» → « 쌍림동»
 *    ③ 그것도 없으면 낱말 끝(뒤가 글 끝이나 빈칸)의 첫 자리 — «쌍림동14시전» − «14시전» → «쌍림동 »
 *    셋 다 없으면 그대로.
 */
function withoutPromise(text: string, promise: string): string {
    const at: number[] = [];
    for (let i = text.indexOf(promise); i >= 0; i = text.indexOf(promise, i + 1)) at.push(i);
    const frontGlued = (i: number) => PROMISE_GLUE_FRONT.has(text[i - 1]);
    const backGlued = (i: number) => PROMISE_GLUE_BACK.has(text[i + promise.length]);
    const glued = at.find(i => frontGlued(i) || backGlued(i));
    if (glued !== undefined) {
        const start = frontGlued(glued) ? glued - 1 : glued;
        const end = glued + promise.length + (backGlued(glued) ? 1 : 0);
        return `${text.slice(0, start)} ${text.slice(end)}`;
    }
    const head = at.find(i => i === 0 || /\s/.test(text[i - 1]))
        ?? at.find(i => i + promise.length === text.length || /\s/.test(text[i + promise.length]));
    return head === undefined ? text : `${text.slice(0, head)} ${text.slice(head + promise.length)}`;
}

/**
 * 📍 **판정 글자** — 지오코딩 · 필터 · 상세 요건이 읽는 다듬은 글자와, 좌표를 다시 찍을지(`geocodeTargetOf` 와 같은 규칙).
 *    ① `stopTextOf` ② 약속 원문 떼기 — 정거장에 `promiseText` 가 있으면 그 글자 한 자리(와 붙은 «/» · «@» · «(» · «)»)를 뗀다.
 *       없을 때만 글자 규칙: 마지막 토막에 약속 글자가 «/» · «)»(글자에 «(» 가 없을 때만) 로 붙어 있으면
 *       지역 끝말 토막(`REGION_PIECE`)을 · 없으면 동 꼴 토막(`PLACE_PIECE`)을 남긴다.
 *       끝말 목록은 원달앱 `LocationTextAnalyzer` 1차와 같다. 원달앱은 토막을 나누지 않아 «가산동/오늘중»을 «오늘중»으로 읽는다.
 *       어느 쪽이든 토막마다 앞 «@» 는 뗀다
 *       마지막 토막의 괄호 · 꺾쇠 덧글은 먼저 가른다 — 시 · 군 · 구 짧은 이름이면 «시 동»으로 잇고(«신장동(하남)» → «하남 신장동» · «고덕동(평택» → «평택 고덕동»),
 *       아니면 닫힌 괄호는 그대로 · 잘린 덧글은 도로명 꼴만 뒤에 잇고 나머지는 버린다(«상대원동(1박스» → «상대원동»)
 *    ③ 정의 표 `addressCut` ④ 붙은 «…시…구» · «시 이름 + 동»을 명부에 있을 때만 띄운다(원달앱 `IsflexAddress.clean` 과 같은 규칙)
 *    ⑤ 번지가 없고 상호가 있으면(그 상호가 아직 글자에 없을 때) 뒤에 잇는다.
 *    정거장에는 화면 원문이 남고, 이 글자는 저장하지 않는다.
 */
export function stopQueryOf(app: TargetAppType, stop: CallStop | null | undefined): { text: string; need: boolean } {
    const promise = stop?.promiseText?.trim();
    const raw = promise ? withoutPromise(stopTextOf(stop), promise) : stopTextOf(stop);
    const tokens = raw.trim().split(SPACES).map(t => t.replace(/^@+/, '')).filter(Boolean);
    const note = tokens.length ? noteOf(tokens.pop()!) : undefined;
    if (note) tokens.push(note.base);
    const last = promise ? undefined : tokens.pop();
    if (last !== undefined) {
        const promiseCut = tokens.some(t => t.includes('(')) || last.includes('(') ? PROMISE_CUT_NO_PAREN : PROMISE_CUT;
        const pieces = promiseCut.test(last) ? last.split(promiseCut) : [];
        const place = pieces.filter(p => REGION_PIECE.test(p)).pop() ?? pieces.filter(p => PLACE_PIECE.test(p)).pop();
        tokens.push(place ?? last);
    }
    if (note?.city) tokens.splice(tokens.length - 1, 0, note.city);
    if (note?.road) tokens.push(note.road);
    const cut = addressOf(app, tokens.join(' ')).split(SPACES).filter(Boolean);
    const dong = cut.pop();
    const head = cut.flatMap(splitCityGu);
    let text = [...head, ...(dong !== undefined ? [unglueCity(dong, head)] : [])].join(' ');
    const name = stop?.customerName?.trim();
    if (text && name && !LOT_NUMBER.test(text) && !text.includes(name)) text = `${text} ${name}`;
    const need = !stop?.geo?.x || !stop?.geo?.y || stop?.geoText !== text;
    return { text, need };
}

/** 📄 상세 콜 자료 — 상세 화면 정의 칸(· 조각)이 콜의 어느 자료가 되나. 배차망마다 다른 것은 표의 읽는 법뿐이다 */
type DetailRecordText = 'stageText' | 'itemDescription' | 'commissionRate' | 'tollFare' | 'tripType' | 'orderForm' | 'dispatcherName' | 'dispatcherPhone';
/** 상세 원문에서 읽는 콜 칸 — 상세 칸 + 번호 묶음의 배차사 · 진행 글자 */
type DetailFields = Partial<Pick<DetailedOfficeOrder & CallIdentity, DetailRecordText | 'paymentType' | 'billingType' | 'detailMemo'>>;
const DETAIL_RECORD: ReadonlyArray<readonly [key: DetailRecordText, field: PageField, part?: string]> = [
    ['stageText', 'stage'], ['itemDescription', 'itemSize'], ['commissionRate', 'commission'],
    ['tollFare', 'toll'], ['tripType', 'tags'], ['orderForm', 'reservation'],
    ['dispatcherName', 'contact', 'dispatcher'], ['dispatcherPhone', 'contact', 'dispatcherPhone'],
];
/** 정거장 한 덩어리의 조각 — 출발 · 도착이 같은 꼴이다 · 상세 주소는 `<쪽>.address` 조각 줄이 먼저, 없으면 조각 없는 줄(`plainToo`) */
const STOP_CONTACT: ReadonlyArray<readonly [key: keyof CallStop, field: PageField, part: (side: string) => string, plainToo?: true]> = [
    ['customerName', 'contact', s => `${s}.customer`], ['addressDetail', 'pickup', s => `${s}.address`, true], ['department', 'contact', s => `${s}.department`],
    ['contactName', 'contact', s => `${s}.contactName`], ['phone1', 'contact', s => `${s}.phone1`], ['phone2', 'contact', s => `${s}.phone2`],
];

/**
 * 📄 **상세 원문의 콜 자료** — 상태 · 물품 · 결제 · 계산서 · 수수료 · 탁송료 · 구분 · 형태 · 배차사 · 적요 · 출발 · 도착 연락처(서버 `/detail` · 기사님 «1~5 모두 가»).
 *    칸마다 상세 화면 정의 줄의 읽는 법으로 읽는다. 🔴 못 찾은 칸은 싣지 않는다 — `/detail` 이 이 결과를 앞 기억 위에 펼치므로 빈 칸이 아는 값을 지우면 안 된다.
 *    결제 · 계산서는 알려진 값(결제 · 증빙 값 목록 `money.ts` — «모름» 은 빼고)일 때만 · 적요는 팝업 글(줄바꿈 → 공백)이 먼저, 없으면 본문 «적요상세» 줄(상차 약속 시각이 본문 시각으로 바뀌지 않게).
 *    출발 · 도착 정거장은 인성 팝업 머리표가 원문에 있거나 그 정거장 조각(`pickup.` · `dropoff.`) 줄을 하나라도 읽었을 때만 한 덩어리(없으면 빈 목록) —
 *    조각 없는 출발 · 도착 줄만 읽힌 원문(플렉스 상세)은 덩어리를 만들지 않는다.
 */
export type DetailRecord = DetailFields
    & { pickupDetails: CallStop[]; dropoffDetails: CallStop[] };
export function detailRecordOf(app: TargetAppType, rawText: string): DetailRecord {
    const read = (field: PageField, part = '') => pageFieldOf(app, 'newCall', field, rawText, part) ?? undefined;
    const out: DetailFields = {};
    for (const [key, field, part] of DETAIL_RECORD) { const v = read(field, part); if (v !== undefined) out[key] = v; }
    const pay = read('payment');
    if (pay && pay !== '모름' && (PAYMENT_TYPES as readonly string[]).includes(pay)) out.paymentType = pay as PaymentType;
    const bill = read('billing');
    if (bill && bill !== '모름' && (BILLING_TYPES as readonly string[]).includes(bill)) out.billingType = bill as BillingType;
    const memo = read('memo', 'popup')?.replace(/\s+/g, ' ').trim() || read('memo', 'body');
    if (memo) out.detailMemo = memo;
    const stopOf = (side: 'pickup' | 'dropoff', tag: string): CallStop[] => {
        const info: CallStop = {};
        let partRead = false;
        for (const [key, field, part, plainToo] of STOP_CONTACT) {
            const name = field === 'pickup' ? side : field;
            const fromPart = read(name, part(side));
            if (fromPart !== undefined) partRead = true;
            const v = fromPart ?? (plainToo ? read(name) : undefined);
            if (v !== undefined) (info as Record<string, string>)[key] = v;
        }
        return partRead || rawText.includes(tag) ? [info] : [];
    };
    return { ...out, pickupDetails: stopOf('pickup', '[출발지상세]'), dropoffDetails: stopOf('dropoff', '[도착지상세]') };
}

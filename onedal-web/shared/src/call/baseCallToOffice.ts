/**
 * 기본 콜 → 옛 콜 바꾸기
 * 누가: 서버 (옮기는 동안). 읽는 코드를 다 옮기면 이 파일이 사라진다
 * 언제: 원달앱이 보낸 BaseCall 을 지금 코드에 넘길 때
 * 어디서: 상세 · 선점 입구 (계획서 D 묶음)
 * 무엇을: 보고마다 온 BaseCall 합치기 · BaseCall 에서 OfficeOrder 칸 만들기
 * 어떻게: 찾은 칸만 싣는다. 뜻이 섞인 칸은 담긴 글자 그대로 옮기고, 옛 목록에 없는 값은 안 넘긴다
 * 왜: 플러그인이 값을 채우는 동안 판정과 화면을 그대로 두기 위해서다
 */
import type { BaseCall, CallEvidence, CallReport, CallCoordinates, CallStop, LocationDetailInfo, MoneyKind, MoneyLine, OfficeOrder, BaseCallShape, CallMoney, CallRoute } from './orderShapes';
import { BILLING_TYPES, PAYMENT_TYPES } from './paymentTypes';
import type { BillingType, PaymentType } from './paymentTypes';

/* 타입과 값이 갈라지면 타입 검사가 잡는다 */
const MONEY_KIND_SET: Record<MoneyKind, true> = {
    total: true, income: true, collect: true, fee: true, collectedFee: true, insurance: true,
    consign: true, freight: true, vat: true, deliveryFee: true, promo: true, unknown: true,
};
const isMoneyKind = (kind: string): kind is MoneyKind => Object.prototype.hasOwnProperty.call(MONEY_KIND_SET, kind);

/** 값이 있는 칸만 남긴다 — 빈 칸을 실으면 앞 보고의 값을 지운다. 빈 글자도 빈 칸이다 */
function present<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}
/** 앞 묶음과 뒤 묶음을 칸별로 합친다 — 둘 다 없으면 키를 안 만든다 */
function mergeOptional<T extends object>(prev: T | undefined, next: T | undefined): T | undefined {
    return prev || next ? ({ ...prev, ...present(next ?? ({} as T)) } as T) : undefined;
}
const mergeStop = (prev: CallStop | undefined, next: CallStop): CallStop => ({ ...prev, ...present(next) });

/** 앱은 글자로 보내므로 모르는 금액 종류는 unknown 으로 둔다 — 규칙이 안 읽는다 */
function knownLines(lines: readonly MoneyLine[]): MoneyLine[] {
    return lines.map((line) => (isMoneyKind(line.kind) ? line : { ...line, kind: 'unknown' as const, label: line.label ?? line.kind }));
}

/* 지금 요금은 목록 값이 있으면 상세가 안 건드린다 — 판정 입력이라 종류가 달라도 처음 값을 지킨다 */
const FIRST_WINS: readonly MoneyKind[] = ['total', 'income'];
const lineKey = (line: MoneyLine) => (line.kind === 'unknown' ? `unknown:${line.label ?? ''}` : line.kind);
function mergeLines(prev: readonly MoneyLine[], next: readonly MoneyLine[]): MoneyLine[] {
    const fareHeld = prev.some((line) => FIRST_WINS.includes(line.kind) && (line.won ?? 0) > 0);
    const incoming = fareHeld ? next.filter((line) => !FIRST_WINS.includes(line.kind)) : next;
    const keys = new Set(incoming.map(lineKey));
    return [...prev.filter((line) => !keys.has(lineKey(line))), ...incoming];
}

/** 같은 콜의 뒤 보고를 합친다 — 칸별로 나중 값이 이긴다. 요금 줄과 목록 동은 처음 값을 지킨다. 경유지는 빈 목록으로 안 지운다 */
export function mergeBaseCall(prev: BaseCall | undefined, next: BaseCall): BaseCall {
    const nextLines = knownLines(next.money.lines);
    if (!prev) return { ...next, money: { ...next.money, lines: nextLines } };
    const listRegion = prev.route.listRegion || next.route.listRegion ? { ...present(next.route.listRegion ?? {}), ...present(prev.route.listRegion ?? {}) } : undefined;
    const viaDropoffs = next.route.viaDropoffs?.length ? next.route.viaDropoffs : prev.route.viaDropoffs;
    const pickupPromise = mergeOptional(prev.time.pickup, next.time.pickup);
    const dropoffPromise = mergeOptional(prev.time.dropoff, next.time.dropoff);
    const returnPromise = mergeOptional(prev.time.returnPickup, next.time.returnPickup);
    return {
        ...prev,
        ...present(next),
        route: {
            ...prev.route,
            ...present(next.route),
            ...(listRegion ? { listRegion } : {}),
            ...(viaDropoffs ? { viaDropoffs } : {}),
            pickup: mergeStop(prev.route.pickup, next.route.pickup),
            dropoff: mergeStop(prev.route.dropoff, next.route.dropoff),
        },
        money: { ...prev.money, ...present(next.money), lines: mergeLines(prev.money.lines, nextLines) },
        load: { ...prev.load, ...present(next.load) },
        time: {
            ...prev.time,
            ...present(next.time),
            ...(pickupPromise ? { pickup: pickupPromise } : {}),
            ...(dropoffPromise ? { dropoff: dropoffPromise } : {}),
            ...(returnPromise ? { returnPickup: returnPromise } : {}),
        },
        job: { ...prev.job, ...present(next.job) },
    };
}

/** 기록은 덮지 않고 더한다 — 같은 화면 · 같은 방법 · 같은 글자를 다시 보낸 줄은 안 더한다(미리보기 → 확정 재전송) */
export function mergeEvidence(prev: CallEvidence | undefined, next: CallEvidence): CallEvidence {
    const keyOf = (line: CallEvidence['seen'][number]) => `${line.screen ?? ''}|${line.read ?? ''}|${line.rawText ?? ''}`;
    const known = new Set((prev?.seen ?? []).map(keyOf));
    return { seen: [...(prev?.seen ?? []), ...next.seen.filter((line) => !known.has(keyOf(line)))] };
}

const lineOf = (call: BaseCall, kind: MoneyKind) => call.money.lines.find((line) => line.kind === kind);
/** 연락처 줄 — 고객 · 부서 · 담당 · 전화 중 하나라도 있을 때만. 주소만 있는 정거장은 연락처가 아니다(서버가 팝업에서 읽은 전화를 지우지 않는다) */
const stopDetails = (stop: CallStop): LocationDetailInfo[] | undefined => (STOP_CONTACT.some((k) => filledValue(stop[k])) ? [present({ ...stop, loadingMethod: undefined }) as LocationDetailInfo] : undefined);

/** 요금 — 목록 요금 · 없으면 수입 줄 · 없으면 운송료 줄 · 없으면 «옛 요금»(원달앱이 기본 콜을 못 채워 옛 양식에서 만든 줄 · 계획서 F2-b). 배차망 이름으로 가르지 않는다 */
function fareOf(call: BaseCall): number | undefined {
    const won = lineOf(call, 'total')?.won ?? lineOf(call, 'income')?.won ?? lineOf(call, 'freight')?.won
        ?? call.money.lines.find((line) => line.kind === 'unknown' && line.label === OLD_FARE_LABEL)?.won;
    return won === undefined ? undefined : Math.round(won);
}

/**
 * 옛 콜 칸 — 찾은 칸만 싣는다. `evolveOrder` 는 키가 있으면 빈 값도 앞 기억을 덮는다.
 * 🔴 합친 BaseCall 에서 만든 값만 쓴다. 평평한 앞 값 위에 얹으면 빈 상차 · 하차 · 요금이 앞 값을 지운다.
 * 🔴 서버가 정하는 칸(status · capturedAt · isSimulated 등)보다 먼저 합친다. 앱 값이 서버 값을 덮으면 안 된다.
 * 🔴 상세 보고는 지금처럼 연락처 칸을 빈 배열로도 싣는다 — 증거 서랍이 그 글자를 그린다. 첫 보고에는 안 싣는다.
 * 🔴 상차 · 하차 · 요금은 지금 앱이 늘 보내는 칸이라 없어도 빈 값으로 싣는다. orders.dropoff 는 NOT NULL 이다.
 */
export function officeOrderOf(call: BaseCall, report: Partial<CallReport> = {}, coordinates: CallCoordinates = {}, detailReport = false): Partial<OfficeOrder> & Pick<OfficeOrder, 'id' | 'pickup' | 'dropoff' | 'fare'> {
    const { route, money, load, time, job } = call;
    const consign = lineOf(call, 'consign');
    const payment = money.paymentType;
    const billing = money.billingType;
    return {
        id: call.id,
        pickup: route.pickup.addressDetail || route.listRegion?.pickup || '',
        dropoff: route.dropoff.addressDetail || route.listRegion?.dropoff || '',
        fare: fareOf(call) ?? 0,
        ...present({
            targetApp: call.targetApp,
            dispatcherName: call.dispatcherName,
            dispatcherPhone: call.dispatcherPhone,
            receiptStatus: call.stage,
            pickupDetails: stopDetails(route.pickup) ?? (detailReport ? [] : undefined),
            dropoffDetails: stopDetails(route.dropoff) ?? (detailReport ? [] : undefined),
            pickupDistance: route.pickupDistance,
            deliveryDistance: route.deliveryDistance,
            commissionRate: lineOf(call, 'fee')?.rate,
            tollFare: consign?.rate,   // 지금 값은 화면 글자 그대로다(«3,000») — 플러그인이 rate 에 글자를 담는다
            paymentType: payment !== undefined && (PAYMENT_TYPES as readonly string[]).includes(payment) ? (payment as PaymentType) : undefined,
            billingType: billing !== undefined && (BILLING_TYPES as readonly string[]).includes(billing) ? (billing as BillingType) : undefined,
            vehicleType: load.vehicleType,
            itemSize: load.itemSize,
            itemDescription: load.itemDescription,
            scheduleText: time.pickup?.text,
            reserved: time.pickup?.reserved,
            reservedDay: time.pickup?.day,
            reservedAt: time.pickup?.at,
            postTime: time.postTime,
            tripType: job.tripType,
            orderForm: job.orderForm,
            tagsText: job.tagsText,
            detailMemo: job.detailMemo,
            type: report.type as OfficeOrder['type'] | undefined,
            timestamp: report.timestamp,
            verdict: report.verdict,
            capturedMode: report.capturedMode as OfficeOrder['capturedMode'],
            openedBy: report.openedBy,
            isSimulated: report.isSimulated,
            rawText: report.rawText,
            ...coordinates,
        }),
    };
}

/**
 * 🎯 **새 앱 보고(order 없음)의 옛 콜 칸** (계획서 F2-a · 기사님 «가») — `officeOrderOf` 에서 넘기는 칸(`fields`)만 남긴다.
 * `fields` 는 배차망 정의 표의 `officeFields` 다 — 부르는 쪽이 찾아 넘긴다(빠뜨리면 타입이 막는다).
 * 상차 · 하차 · 요금은 표와 상관없이 싣는다 — 옛 앱이 늘 보낸 칸이다. 보고 봉투 값(갈래 · 시각 · 원문)도 그대로 싣는다.
 * 🔴 합친 기본 콜로 부른다 — 이번 조각으로 부르면 빈 값이 앞 기억을 지운다.
 */
export function officeOrderForReport(call: BaseCall, report: Partial<CallReport>, coordinates: CallCoordinates, detailReport: boolean, fields: ReadonlyArray<keyof OfficeOrder>): ReturnType<typeof officeOrderOf> {
    const office: Record<string, unknown> = officeOrderOf(call, report, coordinates, detailReport);
    const keep = new Set<string>([...fields, 'pickup', 'dropoff', 'fare']);
    for (const field of OFFICE_FIELDS) if (!keep.has(field)) delete office[field];
    return office as ReturnType<typeof officeOrderOf>;
}

/** 기본 콜에서 만드는 옛 칸 — 견줄 때 쓴다. 보고 봉투 값(번호 · 시각 · 원문)은 안 본다 */
export const OFFICE_FIELDS: ReadonlyArray<keyof OfficeOrder> = [
    'fare', 'pickup', 'dropoff', 'vehicleType', 'itemSize', 'itemDescription', 'tagsText', 'reserved', 'reservedDay', 'reservedAt', 'scheduleText',
    'pickupDistance', 'deliveryDistance', 'detailMemo', 'tripType', 'orderForm', 'paymentType', 'billingType', 'commissionRate', 'tollFare',
    'receiptStatus', 'dispatcherName', 'dispatcherPhone', 'postTime', 'pickupDetails', 'dropoffDetails',
];
/* 칸 차례 · 빈 값 · 빈 배열은 차이가 아니다 */
const comparable = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) return JSON.stringify(value.map((row) => Object.entries(present(row as object)).sort(([a], [b]) => a.localeCompare(b))).filter((row) => row.length > 0));
    return String(value);
};
const EMPTY = comparable([]);

/**
 * 🔍 **기본 콜로 만든 옛 칸과 지금 콜 값이 다른 칸 이름** (계획서 D1) — 값은 돌려주지 않는다. 전화번호가 로그에 남지 않게.
 */
export function baseCallDiff(call: BaseCall, order: Partial<OfficeOrder>): string[] {
    const office = officeOrderOf(call, {}, {}, true);
    const text = (value: unknown) => { const t = comparable(value); return t === EMPTY ? '' : t; };
    return OFFICE_FIELDS.filter((field) => text(office[field]) !== text(order[field])).map(String);
}

/**
 * 🎯 **옛 길이 값을 낸 칸만 기본 콜 값으로 바꾼다** (계획서 D3) — 옛 길이 비운 칸은 비운 채로 둔다.
 * 0 · 아니오(거짓)는 «모름»이 아니라 찬 값이다.
 * 배차망 이름으로 가르지 않는다 — «옛 값이 있나»라는 사실로만 가른다. 새로 살린 값을 옛 칸으로 넘기는 일은 E 단계에서 따로 정한다.
 */
export function officeValuesOf(call: BaseCall, order: Partial<OfficeOrder>): Partial<OfficeOrder> {
    const office = officeOrderOf(call, {}, {}, true);
    const filled = (value: unknown) => { const t = comparable(value); return t !== '' && t !== EMPTY; };
    return Object.fromEntries(OFFICE_FIELDS.filter((field) => filled(order[field]) && filled(office[field])).map((field) => [field, office[field]])) as Partial<OfficeOrder>;
}

/**
 * 옛 칸 → 기본 콜 경로 — 옛 칸이 있는 값의 원천은 옛 칸이다 (계획서 E).
 * 요금 · 수수료 · 탁송료는 금액 줄이라 따로 만든다. 연락처는 정거장 칸으로 간다.
 */
const OFFICE_PATHS: ReadonlyArray<readonly [keyof OfficeOrder, readonly string[]]> = [
    ['pickup', ['route', 'pickup', 'addressDetail']], ['dropoff', ['route', 'dropoff', 'addressDetail']],
    ['pickupDistance', ['route', 'pickupDistance']], ['deliveryDistance', ['route', 'deliveryDistance']],
    ['paymentType', ['money', 'paymentType']], ['billingType', ['money', 'billingType']],
    ['vehicleType', ['load', 'vehicleType']], ['itemSize', ['load', 'itemSize']], ['itemDescription', ['load', 'itemDescription']],
    ['scheduleText', ['time', 'pickup', 'text']], ['reserved', ['time', 'pickup', 'reserved']], ['reservedDay', ['time', 'pickup', 'day']],
    ['reservedAt', ['time', 'pickup', 'at']], ['postTime', ['time', 'postTime']],
    ['tripType', ['job', 'tripType']], ['orderForm', ['job', 'orderForm']], ['tagsText', ['job', 'tagsText']], ['detailMemo', ['job', 'detailMemo']],
    ['receiptStatus', ['stage']], ['dispatcherName', ['dispatcherName']], ['dispatcherPhone', ['dispatcherPhone']],
];
/** 종류를 모르는 옛 요금 줄의 이름 — 펼칠 때 만들고, 다시 펼칠 때 걸러 낸다 */
const OLD_FARE_LABEL = '옛 요금';
const STOP_CONTACT: ReadonlyArray<keyof LocationDetailInfo & keyof CallStop> = ['customerName', 'department', 'contactName', 'phone1', 'phone2'];

const filledValue = (value: unknown) => value !== undefined && value !== null && value !== '';
function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
    let at = target;
    for (const key of path.slice(0, -1)) at = (at[key] ??= {}) as Record<string, unknown>;
    if (filledValue(value)) at[path[path.length - 1]] = value;
    else delete at[path[path.length - 1]];
}

/**
 * 🎯 **콜에 펼칠 기본 콜 묶음** (계획서 E) — 옛 칸이 있는 값은 옛 칸에서, 옛 칸이 없는 새 값만 원달앱 기본 콜에서 가져온다.
 * 옛 칸이 비면 기본 콜에 값이 있어도 비운다 — 옛 칸에 없던 값(화물 글 · 유의사항 · 인수증 · 사진 거리 · 연락처)이 읽는 줄로 몰래 흐르지 않게.
 * 배차망 이름으로 가르지 않는다. 기본 콜이 없는 콜(옛 앱 · 옛 행)은 옛 칸으로만 만든다.
 * 🔴 옛 요금은 종류(목록 요금 · 수입)를 모른다 — 기본 콜에 같은 금액 줄이 없으면 «옛 요금»으로만 둔다. 종류는 요금을 옮기는 E5 에서 정한다.
 */
export function baseCallShapeOf(order: Partial<OfficeOrder>, held?: BaseCall): BaseCallShape {
    /* 기본 콜 기억이 밀렸으면 콜이 이미 가진 묶음에서 새 칸을 가져온다 — 다시 펼쳐도 새 값이 사라지지 않게 */
    const source = held ?? (order.route ? (order as unknown as BaseCall) : undefined);
    const base = JSON.parse(JSON.stringify(source ?? {})) as Record<string, unknown>;
    const shape: Record<string, unknown> = {
        ...Object.fromEntries((['requesterName', 'fromOtherOffice', 'orderNo', 'clientOrderNo'] as const).filter((k) => base[k] !== undefined).map((k) => [k, base[k]])),
        route: { ...((base.route as object) ?? {}), pickup: { ...((base.route as CallRoute | undefined)?.pickup ?? {}) }, dropoff: { ...((base.route as CallRoute | undefined)?.dropoff ?? {}) } },
        money: { ...((base.money as object) ?? {}) }, load: { ...((base.load as object) ?? {}) }, time: { ...((base.time as object) ?? {}) }, job: { ...((base.job as object) ?? {}) },
    };
    for (const [field, path] of OFFICE_PATHS) setPath(shape, path, order[field]);
    const route = shape.route as CallRoute;
    for (const [side, details] of [['pickup', order.pickupDetails], ['dropoff', order.dropoffDetails]] as const) {
        for (const key of STOP_CONTACT) setPath(route as unknown as Record<string, unknown>, [side, key], details?.[0]?.[key]);
    }
    const heldLines = source?.money?.lines ?? [];
    const fareLine = heldLines.find((line) => (line.kind === 'total' || line.kind === 'income') && line.won === order.fare);
    const lines: MoneyLine[] = [
        ...(order.fare && order.fare > 0 ? [fareLine ?? { kind: 'unknown' as const, won: order.fare, label: OLD_FARE_LABEL }] : []),
        ...(filledValue(order.commissionRate) ? [{ kind: 'fee' as const, rate: String(order.commissionRate) }] : []),
        ...(filledValue(order.tollFare) ? [{ kind: 'consign' as const, rate: String(order.tollFare) }] : []),
        ...heldLines.filter((line) => !['total', 'income', 'fee', 'consign'].includes(line.kind) && line.label !== OLD_FARE_LABEL),   // 지난번 펼칠 때 만든 «옛 요금» 줄은 다시 안 가져온다
    ];
    (shape.money as CallMoney).lines = lines;
    return shape as BaseCallShape;
}

/**
 * 💰 **콜 요금(원)** — 묶음의 요금 줄에서 한 줄만 고른다: 목록 요금 · 수입 · «옛 요금». 줄을 더하지 않는다 (계획서 E5).
 * 펼친 콜에서는 옛 요금 칸과 같은 값이다 — `baseCallShapeOf` 가 옛 칸과 같은 목록 요금 · 수입 줄만 남기고 없으면 «옛 요금» 줄을 만든다.
 * 🔴 운송료 · 다른 이름의 종류 모르는 줄(«상세 요금»)은 안 읽는다. 옛 칸과 다른 값일 수 있다.
 * 손에 오는 돈이 아니다 — 화물24시 목록 요금에는 «수»가 들어 있다. 모르면 0.
 */
export function fareWonOf(order: Pick<BaseCallShape, 'money'>): number {
    const lines = order.money?.lines ?? [];
    const line = lines.find((l) => l.kind === 'total') ?? lines.find((l) => l.kind === 'income') ?? lines.find((l) => l.kind === 'unknown' && l.label === OLD_FARE_LABEL);
    return line?.won ?? 0;
}

/**
 * 💵 **착불 현장에서 받을 현금(원)** — 받을 현금 줄(collect · 인성 «고객에게 받을 금액»). 없으면 요금 (기사님 2-2 나).
 * 받을 현금 줄은 원달앱이 확정 뒤 화면을 읽은 콜에만 있다 — 원달앱이 잡은 콜 · 옛 앱 · 다른 배차망은 요금이다.
 */
export function collectWonOf(order: Pick<BaseCallShape, 'money'>): number {
    return order.money?.lines?.find((l) => l.kind === 'collect')?.won ?? fareWonOf(order);
}

/**
 * 📍 **정거장 주소 글자** — 묶음의 주소 칸 (계획서 E7). 비면 빈 글자 — 목록 지역으로 대신하지 않는다. 빈 글자는 «못 읽음» 경고의 재료라, 대신할지는 F3 에서 정한다.
 * 깎지 않는다 — 배차망 꼬리 글자를 다듬는 일은 `addressOf`(지오코딩 · 판정)의 몫이다. 묶음이 없는 콜은 옛 칸으로 펼쳐 읽는다.
 */
export function stopAddressOf(order: Partial<Pick<OfficeOrder, 'pickup' | 'dropoff' | 'route'>>, side: 'pickup' | 'dropoff'): string {
    const route = order.route ?? baseCallShapeOf(order).route;
    return route?.[side]?.addressDetail || '';
}

/** 🚨 **급송 콜인가** — 묶음의 형태(job.orderForm) 하나로 가른다. 서버 저장 · 관제웹 표시가 같은 함수를 쓴다 (계획서 E2) */
export function isExpressOf(order: Pick<BaseCallShape, 'job'>): boolean {
    return order.job?.orderForm === '급송';
}

/** 🎯 묶음 다섯이 반드시 있는 콜 — 읽는 함수(시간 계산 등)는 이것만 받는다 (계획서 E) */
export type ShapedGroups = Required<Pick<BaseCallShape, 'route' | 'money' | 'load' | 'time' | 'job'>>;

/**
 * 🎯 **묶음이 있는 콜로** — 이미 펼친 콜은 그대로, 묶음이 없으면 옛 칸으로 펼친다.
 * 읽는 함수에 넘기는 자리가 거친다. 빠뜨리면 타입 검사가 멈춘다 — 묶음 없는 콜이 조용히 들어가 값이 비는 일을 막는다.
 */
export function asShaped<T extends Partial<OfficeOrder>>(order: T): T & ShapedGroups {
    if (order.route && order.money && order.load && order.time && order.job) return order as T & ShapedGroups;
    /* 가진 묶음은 그대로 두고 빠진 묶음만 옛 칸에서 펼친다 — 가진 값을 덮지 않고, 빠진 값은 확실한 원천(옛 칸)에서 온다.
       «빠짐»은 «없음»이다 — 빈 묶음({})은 펼친 결과로 본다(서버가 늘 다섯을 한꺼번에 만든다) */
    const fill = baseCallShapeOf(order);
    return { ...order, route: order.route ?? fill.route, money: order.money ?? fill.money, load: order.load ?? fill.load, time: order.time ?? fill.time, job: order.job ?? fill.job } as T & ShapedGroups;
}

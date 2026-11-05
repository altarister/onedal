/**
 * 기본 콜 → 옛 콜 바꾸기
 * 누가: 서버 (옮기는 동안). 읽는 코드를 다 옮기면 이 파일이 사라진다
 * 언제: 원달앱이 보낸 BaseCall 을 지금 코드에 넘길 때
 * 어디서: 상세 · 선점 입구 (계획서 D 묶음)
 * 무엇을: 보고마다 온 BaseCall 합치기 · BaseCall 에서 OfficeOrder 칸 만들기
 * 어떻게: 찾은 칸만 싣는다. 뜻이 섞인 칸은 담긴 글자 그대로 옮기고, 옛 목록에 없는 값은 안 넘긴다
 * 왜: 플러그인이 값을 채우는 동안 판정과 화면을 그대로 두기 위해서다
 */
import type { BaseCall, CallEvidence, CallReport, CallCoordinates, CallStop, LocationDetailInfo, MoneyKind, MoneyLine, OfficeOrder } from './orderShapes';
import { PAYMENT_TYPES } from './paymentTypes';
import type { PaymentType } from './paymentTypes';

/* 타입과 값이 갈라지면 타입 검사가 잡는다 */
const MONEY_KIND_SET: Record<MoneyKind, true> = {
    total: true, income: true, collect: true, fee: true, collectedFee: true, insurance: true,
    consign: true, freight: true, vat: true, deliveryFee: true, promo: true, unknown: true,
};
const isMoneyKind = (kind: string): kind is MoneyKind => Object.prototype.hasOwnProperty.call(MONEY_KIND_SET, kind);

/** 값이 있는 칸만 남긴다 — 빈 칸을 실으면 앞 보고의 값을 지운다 */
function present<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
const mergeStop = (prev: CallStop | undefined, next: CallStop): CallStop => ({ ...prev, ...present(next) });

/** 앱은 글자로 보내므로 모르는 금액 종류는 unknown 으로 둔다 — 규칙이 안 읽는다 */
function knownLines(lines: readonly MoneyLine[]): MoneyLine[] {
    return lines.map((line) => (isMoneyKind(line.kind) ? line : { ...line, kind: 'unknown' as const, label: line.label ?? line.kind }));
}

/** 같은 콜의 뒤 보고를 합친다 — 칸별로 나중 값이 이긴다. 금액은 종류별로, 목록 동은 처음 값을 지킨다 */
export function mergeBaseCall(prev: BaseCall | undefined, next: BaseCall): BaseCall {
    const nextLines = knownLines(next.money.lines);
    if (!prev) return { ...next, money: { ...next.money, lines: nextLines } };
    const kinds = new Set(nextLines.map((line) => line.kind));
    return {
        ...prev,
        ...present(next),
        route: {
            ...prev.route,
            ...present(next.route),
            listRegion: prev.route.listRegion || next.route.listRegion ? { ...next.route.listRegion, ...prev.route.listRegion } : undefined,
            pickup: mergeStop(prev.route.pickup, next.route.pickup),
            dropoff: mergeStop(prev.route.dropoff, next.route.dropoff),
        },
        money: { ...prev.money, ...present(next.money), lines: [...prev.money.lines.filter((line) => !kinds.has(line.kind)), ...nextLines] },
        load: { ...prev.load, ...present(next.load) },
        time: {
            ...prev.time,
            ...present(next.time),
            pickup: prev.time.pickup || next.time.pickup ? { ...prev.time.pickup, ...present(next.time.pickup ?? {}) } : undefined,
            dropoff: prev.time.dropoff || next.time.dropoff ? { ...prev.time.dropoff, ...present(next.time.dropoff ?? {}) } : undefined,
        },
        job: { ...prev.job, ...present(next.job) },
    };
}

/** 기록은 덮지 않고 더한다 */
export function mergeEvidence(prev: CallEvidence | undefined, next: CallEvidence): CallEvidence {
    return { seen: [...(prev?.seen ?? []), ...next.seen] };
}

const lineOf = (call: BaseCall, kind: MoneyKind) => call.money.lines.find((line) => line.kind === kind);
const stopDetails = (stop: CallStop): LocationDetailInfo[] | undefined => (Object.keys(present(stop)).some((k) => k !== 'loadingMethod') ? [present({ ...stop, loadingMethod: undefined }) as LocationDetailInfo] : undefined);

/** 요금 — 목록 요금 · 없으면 수입 줄 · 없으면 운송료 줄. 배차망 이름으로 가르지 않는다 */
function fareOf(call: BaseCall): number | undefined {
    const won = lineOf(call, 'total')?.won ?? lineOf(call, 'income')?.won ?? lineOf(call, 'freight')?.won;
    return won === undefined ? undefined : Math.round(won);
}

/** 옛 콜 칸 — 찾은 칸만 싣는다. `evolveOrder` 는 키가 있으면 빈 값도 앞 기억을 덮는다 */
export function officeOrderOf(call: BaseCall, report: Partial<CallReport> = {}, coordinates: CallCoordinates = {}): Partial<OfficeOrder> & Pick<OfficeOrder, 'id'> {
    const { route, money, load, time, job } = call;
    const consign = lineOf(call, 'consign');
    const payment = money.paymentType;
    return {
        id: call.id,
        ...present({
            targetApp: call.targetApp,
            dispatcherName: call.dispatcherName,
            dispatcherPhone: call.dispatcherPhone,
            receiptStatus: call.stage,
            pickup: route.pickup.addressDetail ?? route.listRegion?.pickup,
            dropoff: route.dropoff.addressDetail ?? route.listRegion?.dropoff,
            pickupDetails: stopDetails(route.pickup),
            dropoffDetails: stopDetails(route.dropoff),
            pickupDistance: route.pickupDistance,
            deliveryDistance: route.deliveryDistance,
            fare: fareOf(call),
            commissionRate: lineOf(call, 'fee')?.rate,
            tollFare: consign?.rate ?? (consign?.won === undefined ? undefined : String(consign.won)),
            paymentType: payment !== undefined && (PAYMENT_TYPES as readonly string[]).includes(payment) ? (payment as PaymentType) : undefined,
            billingType: money.billingType,
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

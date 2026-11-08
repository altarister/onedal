/**
 * 콜 한 칸
 * 누가: 서버 장부 쓰기 · 되살리기
 * 언제: 콜을 장부(orders)에 적을 때와 장부에서 콜을 되살릴 때
 * 어디서: orders.callShape(콜 모양 글) · orders.callShapeVersion(판 번호) · 사본 칸
 * 무엇을: CALL_SHAPE_VERSION · callShapeOf · callFromShape · LedgerCopies · ledgerCopiesOf
 * 어떻게: 칸마다 «콜 모양 / 서버 칸» 분류를 적은 표에서 콜 모양 칸만 글로 쓰고 되살리며, 사본 칸은 콜 하나에서 한 번에 꺼낸다
 * 왜: 정거장 · 돈 · 짐 · 번호 · 표시 기록을 칸 하나로 저장해 다시 띄워도 띄우기 전 콜과 같게 하기 위해서다
 */
import type { MyOrder, OfficeOrder, PendingOrder, SecuredOrder } from './orderShapes';
import type { BillingType, PaymentType } from './money';
import { incomeOf, moneyFrom } from './money';
import { isExpressForm } from './badges';
import { loadFrom } from '../cargo/callLoad';
import { firstPickupStop, lastDropoffStop } from '../time/timing';

/** 🧾 콜 모양의 판 번호 — 콜 모양을 바꿀 때 올린다. 장부의 판 번호가 이것과 다르면 옛 길(장부 칸)로 되살린다 */
export const CALL_SHAPE_VERSION = 1;

/**
 * 칸마다 분류 — 'shape' 은 콜 한 칸 글에 담고, 'server' 는 장부 진짜 칸 · 서버 메모리로만 산다.
 * 세 콜 모양의 합을 열쇠로 둔다 — `status` 같은 서버 칸은 `OfficeOrder` 밖이라서다. 콜 칸을 더하면 여기 분류를 적어야 컴파일된다.
 */
const SHAPE_KEYS: Record<keyof (MyOrder & PendingOrder & SecuredOrder), 'shape' | 'server'> = {
    // 번호 (CallIdentity)
    id: 'shape', targetApp: 'shape', orderNo: 'shape', clientOrderNo: 'shape', fromOtherOffice: 'shape',
    dispatcherName: 'shape', dispatcherPhone: 'shape', requesterName: 'shape', stageText: 'shape',
    // 출처 (CallProvenance)
    type: 'shape', timestamp: 'shape', rawText: 'shape', openedBy: 'shape', capturedMode: 'shape', isSimulated: 'shape', verdict: 'shape',
    // 목록 콜 (SimplifiedOfficeOrder — 맨 위 주소 · 좌표 · 약속 · 거리 칸은 정거장에)
    itemSize: 'shape', tagsText: 'shape', fare: 'shape', postTime: 'shape', vehicleType: 'shape', reserved: 'shape',
    // 상세 콜 (DetailedOfficeOrder)
    itemDescription: 'shape', commissionRate: 'shape', tollFare: 'shape', paymentType: 'shape', billingType: 'shape',
    tripType: 'shape', orderForm: 'shape', detailMemo: 'shape', pickupDetails: 'shape', dropoffDetails: 'shape',
    // 돈 · 짐 묶음
    money: 'shape', load: 'shape',
    // 주소 대략 · 빨리 접기 (서버 판정이 싣는다)
    pickupApprox: 'server', dropoffApprox: 'server', openedByApp: 'server', foldAfterSec: 'server',
    // 서버가 계산하고 기록한 값 (ServerCallFields)
    capturedDeviceId: 'server', capturedAt: 'server', goalCity: 'server', isPreview: 'server',
    kakaoCalculatedFare: 'server', kakaoTimeExt: 'server', routePolyline: 'server', totalDistanceKm: 'server', totalDurationMin: 'server',
    kakaoSoloDistanceKm: 'server', kakaoSoloDurationMin: 'server', approachDurationMin: 'server', osrmError: 'server',
    sectionEtas: 'server', sectionDriveMin: 'server', sectionStops: 'server', sectionEnds: 'server', routeComputedAt: 'server',
    arrivedPickupAt: 'server', arrivedDropoffAt: 'server', pickupEta: 'server', dropoffEta: 'server',
    rejectionReasons: 'server', approvalReasons: 'server', distanceKm: 'server', isShared: 'server', isExpress: 'server',
    // 상태 · 장부 칸
    status: 'server', judgeUntil: 'server', reservedFor: 'server', completedAt: 'server', terminatedAt: 'server',
    judgment: 'server', settlement: 'server',
};
const SHAPE_FIELDS = (Object.keys(SHAPE_KEYS) as Array<keyof typeof SHAPE_KEYS>).filter(k => SHAPE_KEYS[k] === 'shape');

/** 정거장마다 찍은 글(`geoText`)을 뺀다 — 서버 메모리만이고 저장 칸이 아니다 */
const withoutGeoText = (stops: unknown): unknown =>
    (Array.isArray(stops)
        ? stops.map(s => {
            if (!s || typeof s !== 'object') return s;
            const rest: Record<string, unknown> = { ...s };
            delete rest.geoText;
            return rest;
        })
        : stops);

/**
 * 🧾 **콜 모양 → 콜 한 칸 글** — 분류 'shape' 칸만 담는다(서버 칸 · 목록 밖 실행 중 칸 · 정거장 찍은 글은 빠진다).
 *    글로 못 바꾸면 던지지 않고 null — 장부 쓰기가 콜 한 칸을 비우고 줄은 적는다(그 줄은 옛 길로 되살아난다).
 */
export function callShapeOf(call: OfficeOrder): string | null {
    const src = call as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of SHAPE_FIELDS) {
        const v = src[k];
        if (v === undefined) continue;
        out[k] = k === 'pickupDetails' || k === 'dropoffDetails' ? withoutGeoText(v) : v;
    }
    try {
        return JSON.stringify(out);
    } catch {
        return null;
    }
}

const isFilledList = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/**
 * 🧾 **콜 한 칸 글 → 콜 모양** — 분류 'shape' 칸만 돌려준다(글에 다른 칸이 있어도 버린다).
 *    판 번호가 다르거나 · 글이 안 풀리거나 · 객체가 아니거나 · `id` 가 글자가 아니거나 · 상차 · 하차 목록이 배열이 아니거나 비었으면 null(= 옛 길).
 *    빈 목록으로 되살리면 경로 · 주소가 사라지므로 옛 길로 보낸다. 돈 · 짐 묶음은 틀린 줄을 버리고 · 묶음이 없던 콜은 칸이 없다.
 */
export function callFromShape(text: string | null | undefined, version: number | null | undefined): OfficeOrder | null {
    if (version !== CALL_SHAPE_VERSION || !text) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !isFilledList(o.pickupDetails) || !isFilledList(o.dropoffDetails)) return null;
    const out: Record<string, unknown> = {};
    for (const k of SHAPE_FIELDS) {
        if (!(k in o)) continue;
        if (k === 'money') {
            if (o.money != null) out.money = moneyFrom(o.money);
        } else if (k === 'load') {
            const load = loadFrom(o.load);
            if (load) out.load = load;
        } else {
            out[k] = o[k];
        }
    }
    return out as unknown as OfficeOrder;
}

/** 🧾 사본 칸 — 콜 한 칸 안 값을 SQL 이 읽게 장부 진짜 칸에 따로 적는 값 */
export interface LedgerCopies {
    pickup: string;                     // 첫 상차 목록 글자(NOT NULL 칸 — 없으면 빈 글자)
    dropoff: string;                    // 마지막 하차 목록 글자
    fare: number;
    incomeWon: number | null;           // 기사님 몫 — 돈 묶음의 기사님 몫 줄 · 모르면 null
    isExpress: 0 | 1;
    paymentType: PaymentType | null;
    billingType: BillingType | null;
    vehicleType: string | null;
    itemDescription: string | null;
    tripType: string | null;
    orderForm: string | null;
    commissionRate: string | null;
    tollFare: string | null;
    detailMemo: string | null;
    dispatcherName: string | null;
    dispatcherPhone: string | null;
    scheduleText: string | null;        // 옛 칸 — 첫 상차 약속 원문
    reservedDay: number | null;         // 옛 칸 — 첫 상차 날
    reservedAt: string | null;          // 옛 칸 — 첫 상차 시각
    deliveryDistance: number | null;    // 옛 칸 — 마지막 하차 정거장 거리
}

/** 🧾 **사본 칸을 콜 하나에서 한 번에** — 지금 장부에 적는 값과 같은 규칙(빈 글자 · 0 은 null) · 기사님 몫은 돈 묶음에서 */
export function ledgerCopiesOf(call: OfficeOrder): LedgerCopies {
    const pickupStop = firstPickupStop(call);
    const dropoffStop = lastDropoffStop(call);
    return {
        pickup: pickupStop?.listText ?? '',
        dropoff: dropoffStop?.listText ?? '',
        fare: call.fare || 0,
        incomeWon: call.money ? incomeOf(call.money) : null,
        isExpress: isExpressForm(call.orderForm) ? 1 : 0,
        paymentType: call.paymentType || null,
        billingType: call.billingType || null,
        vehicleType: call.vehicleType || null,
        itemDescription: call.itemDescription || null,
        tripType: call.tripType || null,
        orderForm: call.orderForm || null,
        commissionRate: call.commissionRate || null,
        tollFare: call.tollFare || null,
        detailMemo: call.detailMemo || null,
        dispatcherName: call.dispatcherName || null,
        dispatcherPhone: call.dispatcherPhone || null,
        scheduleText: pickupStop?.promiseText || null,
        reservedDay: pickupStop?.requestedDay ?? null,
        reservedAt: pickupStop?.requestedTime ?? null,
        deliveryDistance: dropoffStop?.distanceKm || null,
    };
}

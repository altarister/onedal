import { hhmmText, stopPhoneOf } from '@onedal/shared';
import type { SecuredOrder, StepViewRow, RouteTimelineEntry, CallTiming } from '@onedal/shared';
import { getAddressLabel } from '../../lib/routeUtils';

/**
 * 🧾 **펼친 콜 카드의 셈** — 카드(`PinnedRouteCard`)와 그 부품(`StopDetailBlock` · `CallStepTrack` · `CallEvidenceDrawer`)이 그리는 값.
 * 이 파일은 위(부품들)를 가져오지 않는다 — 방향: PinnedRouteCard · 부품 → callCardViews → shared.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 전부 값을 받아 값을 돌려준다.
 */

// ─────────────────────────── 6단계 ───────────────────────────
/** ✅ 이 단계가 끝났나 — 모양은 `shared/stepRecords` 의 `StepViewRow` 하나에서 온다 */
export const stepDoneOf = (x?: StepViewRow) => x?.born !== false && (x?.row?.status === 'DONE' || x?.row?.status === 'SKIPPED');

/**
 * 🔴 현재 단계 = "첫 미완료"가 아니라 **증거 최전방** (기사님 실측).
 *
 * "첫 미완료"로 세면 GPS 도착이 하차지 통화를 건너뛰고 지나갈 때 화면이 **하차지 통화에
 * 묶여**, 상차 완료·하차 도착이 끝나도 안 따라간다. 가장 멀리 간 증거의 **다음**이 현재다.
 * 건너뛰어진 통화는 PLANNED 로 정직하게 남고(안 한 건 안 한 것), 막대가 노랗게 알린다.
 */
export function stepCurIdxOf(seededSteps: StepViewRow[] | null): number {
    if (!seededSteps) return 0;
    let last = -1;
    seededSteps.forEach((x, i) => { if (stepDoneOf(x)) last = i; });
    return Math.min(last + 1, seededSteps.length - 1);
}

/** 📦 짐 칸이 없는 단계(하차 통화 · 하차 완료)는 가장 신선한 짐(실측 > 상차 통화)을 빌려 입는다 — 표시용 */
export function stepViewOf(x: any, seededSteps: StepViewRow[]) {
    if (x.step !== 'DELIVERED' && x.step !== 'CALL_DROPOFF') return x;
    const loaded = seededSteps.find(y => y.step === 'LOADED')?.row;
    const callP = seededSteps.find(y => y.step === 'CALL_PICKUP')?.row;
    const callD = seededSteps.find(y => y.step === 'CALL_DROPOFF')?.row;
    const cargo = {
        planned_unit: loaded?.actual_unit ?? callP?.planned_unit,
        planned_quantity: loaded?.actual_quantity ?? callP?.planned_quantity,
    };
    const base = x.step === 'DELIVERED' ? { ...(callD ?? {}), ...cargo } : cargo;
    return { ...x, row: { ...base, ...x.row,
        planned_unit: x.row.planned_unit ?? cargo.planned_unit,
        planned_quantity: x.row.planned_quantity ?? cargo.planned_quantity } };
}

/**
 * 🌱 **단계 한 장(시트)의 재료** — 행에 없는 값(장소 · 전화 · 구간 주행)은 경로 · 타임라인이 준다.
 * 🔴 주행 · 앞 정거장 출발은 **경로 타임라인의 그 정거장**에서 뽑는다 — 시트가 «주행을 모릅니다»라며
 *    물리적으로 못 지킬 칸을 추천하면 한 화면의 두 곳이 다른 세상을 본다.
 * 🔴 시트의 `key` 에 **콜 id 와 단계**가 함께 든다 — 단계 이름뿐이면 콜이 달라도 같아 React 가 시트를 재사용해
 *    앞 콜의 마감 · 물량이 다음 콜 화면에 남는다.
 */
export function stepPaneOf({ route, step: x, seededSteps, timeline }: {
    route: SecuredOrder; step: StepViewRow; seededSteps: StepViewRow[]; timeline?: RouteTimelineEntry[];
}) {
    const xPickup = x.step === 'CALL_PICKUP' || x.step === 'ARRIVE_PICKUP' || x.step === 'LOADED';
    const dd = xPickup ? route.pickupDetails?.[0] : route.dropoffDetails?.[0];
    const xTl = timeline?.find(e => e.orderId === route.id
        && e.stopType === (xPickup ? 'pickup' : 'dropoff'));
    const callPRow = seededSteps.find(y => y.step === 'CALL_PICKUP')?.row;
    return {
        key: `${route.id}:${x.step}`,
        codAmount: route.paymentType === '착불' ? route.fare : null,
        place: {
            name: dd?.contactName || dd?.customerName || undefined,
            address: dd?.addressDetail || (xPickup ? route.pickup : route.dropoff),
            phone: stopPhoneOf(dd),
        },
        prevName: route.pickupDetails?.[0]?.contactName || route.pickupDetails?.[0]?.customerName,
        leadMinutes: callPRow?.planned_dwell_min ?? null,
        departPrevMs: xTl?.departPrevMs ?? null,
        segmentDriveMinutes: xTl?.segmentDriveMinutes ?? null,
    };
}

// ─────────────────────────── 상 · 하차 줄 ───────────────────────────
/** 상 · 하차 줄 하나 — 그리는 쪽이 글자로 옮기기만 한다 */
export interface StopDetailRow {
    kind: '상차' | '하차'; stopType: 'pickup' | 'dropoff'; seq: number | undefined; name: string;
    legKm: number | null | undefined;
    /** 🚚 구간 — 타임라인의 «앞 정거장 → 여기» 가 있으면 그것, 없으면 콜이 저장한 값 */
    legMin: number | null | undefined;
    /** ⏱️ 앞 정거장 실측이 여기를 민 분 — 0 이면 안 적는다 (규칙 ④: 없는 것은 안 적는다) */
    shiftMin: number;
    late: number;
    promisedText: string;
    promiseConfirmed: boolean;
    /** 도착 예정 — 지난 곳은 `null` */
    real: string | null;
    arrived: boolean;
}

/**
 * 🧭 **상 · 하차 줄의 값** (`StopDetailBlock` 이 그린다).
 * 🔴 **약속은 타이틀과 «같은 원천»에서 온다** (규칙 ③) — 타이틀(`CallDeck.promiseOf`)이 그러듯
 *    **타임라인의 약속을 먼저** 보고, 없을 때만 콜 파생(`deriveCallTiming`)을 쓴다.
 * 🔴 **지난 곳에 «예정»은 없다** — 통과했으면 빈칸이 맞다. 아직이면 타임라인의 예정을, 그것도 없으면
 *    **타이틀이 쓰는 그 값**(`etaMap` → 장부 폴백)을 쓴다. 둘이 다른 값을 말하면 화면이 두 말을 한다 (규칙 ③).
 */
export function stopDetailRowsOf({ route, timeline, visitOrder, timing, etas }: {
    route: SecuredOrder;
    timeline?: RouteTimelineEntry[];
    visitOrder?: { pickupIdx: number; dropoffIdx: number };
    timing: CallTiming;
    etas: { pickupEta?: string; dropoffEta?: string };
}): StopDetailRow[] {
    const rows = ([
        { kind: '상차' as const, stopType: 'pickup' as const, seq: visitOrder?.pickupIdx,
            name: getAddressLabel(route.pickup), legKm: timing.approachKm, fallbackMin: timing.approachMinutes,
            arrived: timing.arrivedPickup, promised: timing.pickupPromisedArrivalAt, eta: etas.pickupEta },
        { kind: '하차' as const, stopType: 'dropoff' as const, seq: visitOrder?.dropoffIdx,
            name: getAddressLabel(route.dropoff), legKm: timing.soloKm, fallbackMin: timing.soloMinutes,
            arrived: timing.arrivedDropoff, promised: timing.dropoffPromisedArrivalAt, eta: etas.dropoffEta },
    ]);
    /** 약속 시각(ISO 문자열) → `05:08`. 없으면 `--:--` (지어내지 않는다) */
    const clockOf = (v: string | null | undefined) => hhmmText(v) ?? '--:--';   // 🕐 한 모양은 shared
    return rows.map(r => {
        const tl = timeline?.find(e => e.orderId === route.id && e.stopType === r.stopType);
        const legMin = tl?.segmentDriveMinutes ?? r.fallbackMin;
        const shiftMin = tl?.dwellShiftMinutes ?? 0;
        const late = tl?.lateMinutes ?? 0;
        const promised = tl?.promisedUntil ?? r.promised;
        const real = r.arrived ? null
            : tl?.etaMs != null ? hhmmText(tl.etaMs)
                : r.eta ?? null;
        return {
            kind: r.kind, stopType: r.stopType, seq: r.seq, name: r.name, legKm: r.legKm, legMin, shiftMin, late,
            promisedText: clockOf(promised), promiseConfirmed: !!tl?.promiseConfirmed, real, arrived: !!r.arrived,
        };
    });
}

// ─────────────────────────── 판정 근거 서랍 ───────────────────────────
/** 🗄️ 원본 칸 — 서랍 아래에 `route.<칸> : 값` 으로 그린다 (차례가 화면 차례다) */
export function rawFieldsOf(route: SecuredOrder): Array<[string, unknown]> {
    return Object.entries({
        id: route.id, type: route.type, status: route.status,
        receiptStatus: route.receiptStatus, itemDescription: route.itemDescription,
        vehicleType: route.vehicleType, commissionRate: route.commissionRate,
        tollFare: route.tollFare, paymentType: route.paymentType,
        billingType: route.billingType, tripType: route.tripType,
        orderForm: route.orderForm, distanceKm: route.distanceKm,
        dispatcherName: route.dispatcherName, dispatcherPhone: route.dispatcherPhone,
        companyName: route.companyName, pickup: route.pickup, dropoff: route.dropoff,
        fare: route.fare, timestamp: route.timestamp, postTime: route.postTime,
        scheduleText: route.scheduleText, pickupTime: route.pickupTime,
        detailMemo: route.detailMemo,
        approachDurationMin: route.approachDurationMin,
        kakaoSoloDistanceKm: route.kakaoSoloDistanceKm,
        kakaoSoloDurationMin: route.kakaoSoloDurationMin,
        // 🚚 실측이 없으면 배송거리로 추정한다 — 그 입력을 함께 보여 준다
        deliveryDistance: route.deliveryDistance,
    });
}

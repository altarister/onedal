import type { LabStep } from '../pages/labProblems';   // 🌉 타입만 — 값은 bridge 를 지난다

/**
 * 🖐️ **손으로 콜 하나를 올린다** — 폰 없이 「버린 콜」 줄을 흐르게 하는 문
 *    (기사님 지시 2026-09-13: *"콜 생성 하면 앱에서 콜을 서버로 올리는 것과 같은 효과"*).
 *
 * 🔴 **요금·지명을 지어내지 않는다** (규칙 ④). 값은 전부 `labProblems.ts` 의 문제지 —
 *    **기사님이 실제로 도신 하루**에서 온다. 좌표도 카카오 기록에 찍힌 값 그대로다.
 *    한 벌 더 베껴 두면 문제지가 바뀔 때 이쪽만 낡는다 (규칙 ③ — 원천은 하나).
 *
 * 🔴 **손으로 만든 것임을 콜 자신이 말한다** — `rawText` 머리에 표식을 박는다.
 *    현황판이 그 표식을 보고 🖐️ 를 그린다. 표식 없이 값만 올리면 **원장이 거짓말한다.**
 *
 * ⚠️ **이것은 «콜을 잡는 것»이 아니다.** 앱이 서버에 올리는 길은 둘인데
 *    (`POST /api/scrap` = 본 콜 전부 · `POST /api/orders/confirm` = 잡은 콜),
 *    여기는 **앞쪽**이다. 그래서 결재 카드가 아니라 「버린 콜」 줄에 뜬다.
 */

/** 문제지가 콜을 적는 꼴 — `'양촌읍 → 가산동 (34,650)'` */
const WHERE_SHAPE = /^(.+?)\s*→\s*(.+?)\s*\((\d{1,3}(?:,\d{3})*)\)\s*$/;

/** 🖐️ 손으로 만든 콜의 표식 — 원장에서 이것으로 가른다 */
export const HANDMADE_MARK = '[손으로 만든 콜]';

export interface HandmadeCall {
    pickup: string;
    dropoff: string;
    fare: number;
}

/**
 * 📖 문제지 한 줄에서 상차지·하차지·요금을 읽는다.
 * 꼴이 어긋나면 **null** — 반쪽짜리를 올리지 않는다 (규칙 ④).
 * ⚠️ 문제지의 `where` 는 사람이 읽는 글이다. 꼴이 바뀌면 이 검사가 먼저 빨간불이 된다.
 */
export function parseCallWhere(where: string): HandmadeCall | null {
    const m = WHERE_SHAPE.exec(where);
    if (!m) return null;
    const fare = Number(m[3].replace(/,/g, ''));
    if (!Number.isFinite(fare) || fare <= 0) return null;
    return { pickup: m[1].trim(), dropoff: m[2].trim(), fare };
}

/** 문제지에서 **콜인 걸음만** 추린다 — 달리는 걸음은 콜이 아니다 */
export function callStepsOf(steps: readonly LabStep[]): Extract<LabStep, { kind: 'call' }>[] {
    return steps.filter((s): s is Extract<LabStep, { kind: 'call' }> => s.kind === 'call');
}

/** 서버 `/api/scrap` 이 기다리는 모양 — `SimplifiedOfficeOrder` 중 이 문이 읽는 칸만 */
export interface HandmadeOrder {
    id: string;
    type: 'NEW_ORDER';
    pickup: string;
    dropoff: string;
    fare: number;
    timestamp: string;
    pickupX: number;
    pickupY: number;
    dropoffX: number;
    dropoffY: number;
    rawText: string;
    verdict: null;
}

/**
 * 🧱 문제지 한 걸음 → 서버에 올릴 콜 하나.
 *
 * 🔴 `verdict` 는 **null** 이다 — 판정은 앱이 내는 값이고 여기는 앱이 아니다.
 *    화면은 «못 잼»으로 그리고 지금 필터로 다시 잰다 (규칙 ④).
 * @param at 만든 시각 — 부르는 쪽이 준다 (검사가 시계에 기대지 않게)
 */
export function handmadeOrderFrom(
    step: Extract<LabStep, { kind: 'call' }>,
    at: Date,
    seq: number,
): HandmadeOrder | null {
    const c = parseCallWhere(step.where);
    if (!c) return null;
    return {
        id: `HAND-${at.getTime()}-${seq}`,
        type: 'NEW_ORDER',
        pickup: c.pickup,
        dropoff: c.dropoff,
        fare: c.fare,
        timestamp: at.toISOString(),
        pickupX: step.from.lng,
        pickupY: step.from.lat,
        dropoffX: step.to.lng,
        dropoffY: step.to.lat,
        rawText: `${HANDMADE_MARK} ${c.pickup} → ${c.dropoff} ${c.fare}원`,
        verdict: null,
    };
}

/** 🖐️ 이 콜은 손으로 만든 것인가 — 원장에 남은 표식으로 가른다 */
export function isHandmade(rawText?: string | null): boolean {
    return typeof rawText === 'string' && rawText.startsWith(HANDMADE_MARK);
}

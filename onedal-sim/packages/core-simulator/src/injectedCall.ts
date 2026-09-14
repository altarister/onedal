/**
 * 🚚 **개별콜 — 서버가 들고 있다가 넘기는 콜** (기사님 지시 2026-09-15)
 *
 * 현황판에서 낸 콜 한 건을 서버가 들고 있고, 시뮬레이터가 3초마다 물어 받아 목록에 넣는다.
 * 폰 원달앱은 그 콜을 다른 콜과 똑같이 읽고·거르고·잡는다 — 필터가 옳게 거르는지 이 구간에서 본다.
 *
 * 🔴 **문제지 콜과 같은 길로 콜을 만든다** — 받은 칸을 강제 쌍(`ForcedPair`)으로 바꿔 `generateBaseCall` 에 넘긴다.
 *    상차 거리는 문제지 콜처럼 **그 순간의 기사님 위치**에서 잰다. 요금·차종 칸은 배차망 입히기 함수가 채운다.
 * 🔴 칸 이름은 서버 `onedal-web/server/src/core/simCallQueue.ts` 의 `QueuedSimCall` 과 같다 —
 *    서버 검사 `simCallQueue.test.ts` 가 세 곳(현황판 · 서버 · 여기)의 칸 이름을 대조한다.
 * 🔴 이 파일은 배차망 이름을 모른다 (`tests/boundaries.test.ts` 규칙 ①).
 */
import type { ForcedPair, MockEntry } from './generator';

export interface InjectedPlace {
    addressDetail: string;
    region: string;
    lon: number;
    lat: number;
    customerName?: string;
}

export interface InjectedCall {
    seq: number;
    pickup: InjectedPlace;
    dropoff: InjectedPlace;
    fare: number;
    vehicleType?: string;
}

/** 서버 `GET /api/sim/calls` 의 답 */
export interface InjectedBatch {
    lastSeq: number;
    calls: InjectedCall[];
}

const placeOf = (p: InjectedPlace): MockEntry => ({
    addressDetail: p.addressDetail,
    region: p.region,
    lon: p.lon,
    lat: p.lat,
    ...(p.customerName ? { customerName: p.customerName } : {}),
});

/** 받은 콜 → 강제 쌍. 차종이 없으면 비워 둔다 — 배차망 입히기 함수가 고른다 */
export function toInjectedForced(c: InjectedCall): ForcedPair {
    return {
        pickup: placeOf(c.pickup),
        dropoff: placeOf(c.dropoff),
        fare: c.fare,
        ...(c.vehicleType ? { vehicleType: c.vehicleType } : {}),
    };
}

/**
 * 받은 묶음 → 이번에 낼 콜 · 다음에 물을 번호.
 *
 *   · 처음 묻는다(`cursor` 가 null) → 콜은 안 내고 지금 번호만 기억한다 — 시뮬레이터를 열기 전에 낸 콜을 다시 내지 않는다
 *   · 서버 번호가 내 번호보다 작다 → 서버를 다시 띄웠다. 다음 물음에서 처음부터 받는다
 *   · 그 밖 → 내 번호 뒤의 콜을 번호 순서대로
 */
export function takeInjected(cursor: number | null, batch: InjectedBatch): { cursor: number; calls: InjectedCall[] } {
    if (cursor === null) return { cursor: batch.lastSeq, calls: [] };
    if (batch.lastSeq < cursor) return { cursor: 0, calls: [] };
    const calls = batch.calls.filter(c => c.seq > cursor).sort((a, b) => a.seq - b.seq);
    return { cursor: batch.lastSeq, calls };
}

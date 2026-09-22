/**
 * 🚚 **개별콜 — 서버가 들고 있다가 넘기는 콜** (기사님 지시)
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
    /** 전화 — 상세의 «전화1» 칸. 없으면 `*` 로 떠서 걸 수 없는 콜이 된다 (실물 콜에는 늘 있다) */
    phone1?: string;
}

export interface InjectedCall {
    seq: number;
    pickup: InjectedPlace;
    dropoff: InjectedPlace;
    fare: number;
    vehicleType?: string;
}

/** 서버 `GET /api/sim/calls` 의 답 — 짝: 서버 `simCallQueue.ts` 의 `SimCallBatch` */
export interface InjectedBatch {
    lastSeq: number;
    /** 회차 — 서버가 이전 콜을 리셋할 때마다 오른다 (시나리오 다시 시작) */
    round: number;
    calls: InjectedCall[];
    /** 🫳 이번 회차에서 거둔 번호 전부(누적) — 채점이 끝난 문제지 줄의 콜 · «다른 기사가 가져갔다». 옛 서버면 칸이 없다 */
    withdrawn: number[];
}

/** 어디까지 받았나 — 번호와 회차 */
export interface InjectedCursor {
    seq: number;
    round: number;
}

const placeOf = (p: InjectedPlace): MockEntry => ({
    addressDetail: p.addressDetail,
    region: p.region,
    lon: p.lon,
    lat: p.lat,
    ...(p.customerName ? { customerName: p.customerName } : {}),
    ...(p.phone1 ? { phone1: p.phone1 } : {}),
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
 * 받은 묶음 → 이번에 낼 콜 · 다음에 물을 자리 · 목록을 비우나.
 *
 *   · 처음 묻는다(`cursor` 가 null) → 콜은 안 내고 지금 번호·회차만 기억한다 — 열기 전에 낸 콜을 다시 내지 않고,
 *     🔴 목록도 안 비운다 (화면을 열 때마다 비우면 안 된다 · onedal-49 2026-09-15)
 *   · 서버 번호가 내 번호보다 작다 → 서버를 다시 띄웠다. 다음 물음에서 처음부터 받는다 — 회차도 달라졌으면 **비우고** 받는다
 *   · 회차가 바뀌었다 → 이전 콜을 리셋했다(시나리오 다시 시작). **목록을 비우고** 내 번호 뒤의 콜을 낸다
 *   · 그 밖 → 내 번호 뒤의 콜을 번호 순서대로
 */
export function takeInjected(cursor: InjectedCursor | null, batch: InjectedBatch): { cursor: InjectedCursor; calls: InjectedCall[]; clear: boolean; withdrawn: number[] } {
    /* 🫳 거둔 번호는 그대로 넘긴다 — 목록 행과 짝짓는 것은 받은 콜을 기억하는 훅이다. 옛 서버면 칸이 없다 */
    const withdrawn = Array.isArray(batch.withdrawn) ? batch.withdrawn : [];
    if (cursor === null) return { cursor: { seq: batch.lastSeq, round: batch.round }, calls: [], clear: false, withdrawn };
    const clear = batch.round !== cursor.round;
    if (batch.lastSeq < cursor.seq) return { cursor: { seq: 0, round: batch.round }, calls: [], clear, withdrawn };
    const calls = batch.calls.filter(c => c.seq > cursor.seq).sort((a, b) => a.seq - b.seq);
    return { cursor: { seq: batch.lastSeq, round: batch.round }, calls, clear, withdrawn };
}

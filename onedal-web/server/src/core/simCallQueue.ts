/**
 * 🚚 **개별콜 — 시뮬레이터에 낼 콜을 서버가 들고 있다** (기사님 지시 2026-09-15)
 *
 * 기사님: *"시나리오콜, 랜덤콜, 개별콜 이렇게 하면 3가지 종류의 콜을 만들수 있을꺼 같아"*
 *        → *"너는 일단 개별콜 자리를 만들어줘 문제는 나중에 하고"*
 *
 * ── 왜 서버를 거치나 ──
 * 현황판 «🖐️ 콜 생성»은 서버 `/api/scrap` 에 콜을 **바로** 넣는다 — 폰 원달앱이 목록을 읽고·거르고·잡는 구간을 건너뛴다.
 * 필터가 옳게 거르는지는 그 구간에서만 보인다. 그래서 개별콜은 **시뮬레이터 목록에 뜨고**, 원달앱이 진짜 배차망처럼 읽는다.
 * 현황판(PC 브라우저)과 시뮬레이터(폰 안 웹뷰)는 서로 모른다 — 둘 다 아는 서버가 들고 있다가,
 * 시뮬레이터가 3초마다 물을 때 넘긴다 (위치를 묻는 `/api/sim/driver-location` 과 같은 길).
 *
 * ── 모양 ──
 * 상차지·하차지는 시뮬레이터 문제지의 직접 좌표 칸(`pickupFallback` — 주소 · 동 이름 · 경도 · 위도)과 같다.
 * 나중에 시나리오콜 문제지가 **같은 모양으로** 이 길에 들어온다.
 * 시뮬레이터 쪽 짝: `onedal-sim/packages/core-simulator/src/injectedCall.ts` · 현황판 쪽 짝: `client-app/src/statusboard/simCall.ts`
 *
 * 🔴 **번호는 늘기만 한다** — 시뮬레이터는 «마지막으로 받은 번호 뒤»만 가져간다. 늦게 연 화면이 옛 콜을 다시 내지 않고,
 *    시뮬레이터 화면이 둘(폰·PC)이어도 한쪽이 가져가서 다른 쪽이 못 받는 일이 없다.
 * 🔴 **메모리에만 둔다** — 서버를 다시 띄우면 비고 번호도 처음부터다. 시뮬레이터는 «서버 번호가 내 번호보다 작다»를 다시 띄운 것으로 읽는다.
 * 🔴 **값을 채우지 않는다** (규칙 ④) — 칸이 틀리면 받지 않고 무엇이 틀렸는지 말한다.
 */

export interface SimPlace {
    /** 전체 주소 — «경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점» */
    addressDetail: string;
    /** 동·읍·면 — 인성 목록의 지역 칸 · 픽커 목록의 동 칸이 이것을 쓴다 */
    region: string;
    lon: number;
    lat: number;
    /** 상호 — 없으면 시뮬레이터 상세에 안 보인다 */
    customerName?: string;
}

export interface SimCallInput {
    pickup: SimPlace;
    dropoff: SimPlace;
    /** 요금 — 단위는 받는 배차망이 정한다 (인성·화물24시 원 · 픽커 P) */
    fare: number;
    /** 차종 — 없으면 시뮬레이터가 고른다 */
    vehicleType?: string;
}

export interface QueuedSimCall extends SimCallInput {
    seq: number;
    /** 서버가 받은 시각 (ms) */
    at: number;
}

/** 들고 있는 건수 — 넘으면 오래된 것부터 버린다 (시뮬레이터는 3초마다 가져간다) */
export const SIM_CALL_KEEP = 50;

export interface SimCallQueue {
    calls: QueuedSimCall[];
    lastSeq: number;
    /** 시뮬레이터가 마지막으로 물은 시각 — 현황판이 «시뮬레이터가 켜져 있나»를 말한다 */
    lastPollAt: number | null;
}

export function createSimCallQueue(): SimCallQueue {
    return { calls: [], lastSeq: 0, lastPollAt: null };
}

const textOf = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 && t.length <= max ? t : null;
};

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readPlace(v: unknown, what: string): SimPlace | string {
    if (!v || typeof v !== 'object') return `${what}가 없다`;
    const p = v as Record<string, unknown>;
    const addressDetail = textOf(p.addressDetail, 120);
    if (!addressDetail) return `${what} 주소가 없다`;
    const region = textOf(p.region, 30);
    if (!region) return `${what} 동 이름이 없다`;
    if (!isNumber(p.lon) || !isNumber(p.lat)) return `${what} 좌표가 숫자가 아니다`;
    /* 경도·위도를 바꿔 넣는 실수를 여기서 잡는다 — 한국 밖이면 받지 않는다 */
    if (p.lon < 124 || p.lon > 132 || p.lat < 33 || p.lat > 39) return `${what} 좌표가 한국 밖이다 (경도·위도가 바뀌었나)`;
    if (p.customerName === undefined) return { addressDetail, region, lon: p.lon, lat: p.lat };
    const customerName = textOf(p.customerName, 60);
    if (!customerName) return `${what} 상호가 비었다`;
    return { addressDetail, region, lon: p.lon, lat: p.lat, customerName };
}

/** 요청 몸통 → 콜 한 건. 틀리면 무엇이 틀렸는지 */
export function readSimCallInput(body: unknown): { ok: true; call: SimCallInput } | { ok: false; error: string } {
    if (!body || typeof body !== 'object') return { ok: false, error: '콜이 없다' };
    const b = body as Record<string, unknown>;
    const pickup = readPlace(b.pickup, '상차지');
    if (typeof pickup === 'string') return { ok: false, error: pickup };
    const dropoff = readPlace(b.dropoff, '하차지');
    if (typeof dropoff === 'string') return { ok: false, error: dropoff };
    if (!isNumber(b.fare) || !Number.isInteger(b.fare) || b.fare < 1) return { ok: false, error: '요금은 1 이상의 정수다' };
    if (b.vehicleType === undefined) return { ok: true, call: { pickup, dropoff, fare: b.fare } };
    const vehicleType = textOf(b.vehicleType, 20);
    if (!vehicleType) return { ok: false, error: '차종이 비었다' };
    return { ok: true, call: { pickup, dropoff, fare: b.fare, vehicleType } };
}

export function pushSimCall(q: SimCallQueue, call: SimCallInput, now: number): QueuedSimCall {
    const queued: QueuedSimCall = { ...call, seq: q.lastSeq + 1, at: now };
    q.lastSeq = queued.seq;
    q.calls.push(queued);
    if (q.calls.length > SIM_CALL_KEEP) q.calls.splice(0, q.calls.length - SIM_CALL_KEEP);
    return queued;
}

/**
 * 시뮬레이터의 물음에 답한다 — `after` 번호 뒤의 콜.
 * `after` 가 없으면(처음 묻는 시뮬레이터) 콜은 안 주고 지금 번호만 준다 — 열기 전에 낸 콜을 다시 내지 않는다.
 */
export function simCallsAfter(q: SimCallQueue, after: number | null, now: number): { lastSeq: number; calls: QueuedSimCall[] } {
    q.lastPollAt = now;
    if (after === null) return { lastSeq: q.lastSeq, calls: [] };
    return { lastSeq: q.lastSeq, calls: q.calls.filter(c => c.seq > after) };
}
